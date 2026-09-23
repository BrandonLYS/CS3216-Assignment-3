import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  generateId,
  stepCountIs,
  streamText,
  toUIMessageStream,
  safeValidateUIMessages,
  type UIMessage,
} from "ai";
import { after } from "next/server";
import { z } from "zod";
import { ctxForCurrentUser } from "@/server/core/action";
import { DomainError } from "@/server/core/errors";
import { toAiTools, toolApprovalFor } from "@/server/modules/assistant/ai-tools";
import { assistantConfig, getModel } from "@/server/modules/assistant/model";
import { projectSystemPrompt, workspaceSystemPrompt } from "@/server/modules/assistant/prompt";
import { repairInterruptedToolCalls } from "@/server/modules/assistant/repair";
import { assistantService } from "@/server/modules/assistant/service";
import { ASSISTANT_TOOLS, PROJECT_TOOLS, findTool } from "@/server/modules/assistant/tools";
import { memoryService } from "@/server/modules/memory/service";
import { reflect } from "@/server/modules/reflection/service";
import { capture } from "@/shared/analytics/server";
import { ASSISTANT_LIMIT_REACHED, ASSISTANT_NOT_CONFIGURED } from "@/shared/lib/assistant-errors";

export const maxDuration = 60;

type ValidateTools = Parameters<typeof safeValidateUIMessages>[0]["tools"];

// `messages` gets its real check from safeValidateUIMessages against the bound tools below.
// The Conversation carries the scope: projectId on its row, null = dashboard.
const bodySchema = z.object({ conversationId: z.string().min(1), messages: z.array(z.unknown()) });

export async function POST(req: Request) {
  const model = getModel();
  if (!model) return new Response(ASSISTANT_NOT_CONFIGURED, { status: 503 });
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return new Response("Bad request", { status: 400 });
  const { conversationId } = parsed.data;

  const ctx = { ...(await ctxForCurrentUser()), via: "assistant" as const };
  const { maxSteps, dailyTurnCap } = assistantConfig();
  try {
    const conversation = await assistantService.getConversation(ctx, conversationId);
    const projectId = conversation.projectId;
    const scope = { projectId: projectId ?? undefined, conversationId };
    const tools = toAiTools(ctx, projectId ? PROJECT_TOOLS : ASSISTANT_TOOLS, scope);
    const valid = await safeValidateUIMessages<UIMessage>({
      messages: parsed.data.messages,
      tools: tools as ValidateTools,
    });
    if (!valid.success) return new Response("Bad request", { status: 400 });
    // A turn that died mid-flight leaves tool calls with no result, which the model API rejects.
    // Mark them interrupted instead so the thread stays usable and the model can redo them.
    const messages = repairInterruptedToolCalls(valid.data);
    if ((await assistantService.turnsToday(ctx)) >= dailyTurnCap)
      return new Response(ASSISTANT_LIMIT_REACHED, { status: 429 });
    capture(ctx.userId, "assistant_question_sent", { workflow: projectId ? "project" : "workspace" });
    const [profile, workingMemory] = await Promise.all([
      memoryService.current(ctx, null),
      projectId ? memoryService.current(ctx, projectId) : null,
    ]);
    const memory = { profile: profile?.body, workingMemory: workingMemory?.body };
    const system = projectId
      ? projectSystemPrompt(await findTool("get_project_summary").handler(ctx, { projectId }), memory)
      : workspaceSystemPrompt(await findTool("list_projects").handler(ctx, {}), memory);

    const result = streamText({
      model,
      system,
      messages: await convertToModelMessages(messages),
      tools,
      toolApproval: await toolApprovalFor(ctx, projectId ? PROJECT_TOOLS : ASSISTANT_TOOLS, scope),
      // Signs approval requests so a client cannot forge an "approved" response.
      experimental_toolApprovalSecret: process.env.BETTER_AUTH_SECRET,
      stopWhen: stepCountIs(maxSteps),
    });
    // Reflection runs once the response is out and the thread is saved; its failures never reach the User (ADR 0007).
    const { promise: saved, resolve: markSaved } = Promise.withResolvers<boolean>();
    after(async () => {
      if (await saved) await reflect({ ...ctx, via: "reflection" }, conversation.id).catch((e) => console.error(e));
    });
    return createUIMessageStreamResponse({
      stream: toUIMessageStream({
        stream: result.stream,
        originalMessages: messages,
        // Gives the response message a stable id so a turn paused for approval continues the same
        // row on resubmit instead of saving an id-less message plus a duplicate (ADR 0011).
        generateMessageId: generateId,
        onEnd: async ({ messages: all }) => {
          await assistantService.saveMessages(ctx, conversation.id, all).then(
            () => markSaved(true),
            (e) => {
              markSaved(false);
              throw e;
            },
          );
        },
      }),
    });
  } catch (e) {
    if (e instanceof DomainError) return new Response(e.message, { status: e.code === "forbidden" ? 403 : 400 });
    throw e;
  }
}
