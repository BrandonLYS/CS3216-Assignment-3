import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { ctxForCurrentUser } from "@/server/core/action";
import { DomainError } from "@/server/core/errors";
import { toAiTools } from "@/server/modules/assistant/ai-tools";
import { assistantConfig, getModel } from "@/server/modules/assistant/model";
import { projectSystemPrompt } from "@/server/modules/assistant/prompt";
import { assistantService } from "@/server/modules/assistant/service";
import { ASSISTANT_TOOLS, findTool } from "@/server/modules/assistant/tools";
import { ASSISTANT_LIMIT_REACHED, ASSISTANT_NOT_CONFIGURED } from "@/shared/lib/assistant-errors";

export const maxDuration = 60;

const bodySchema = z.object({ projectId: z.string(), messages: z.array(z.custom<UIMessage>()) });

export async function POST(req: Request) {
  const model = getModel();
  if (!model) return new Response(ASSISTANT_NOT_CONFIGURED, { status: 503 });
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return new Response("Bad request", { status: 400 });
  const { projectId, messages } = parsed.data;

  const ctx = { ...(await ctxForCurrentUser()), via: "assistant" as const };
  const { maxSteps, dailyTurnCap } = assistantConfig();
  try {
    if ((await assistantService.turnsToday(ctx)) >= dailyTurnCap)
      return new Response(ASSISTANT_LIMIT_REACHED, { status: 429 });
    const { conversation } = await assistantService.conversation(ctx, projectId);
    const summary = await findTool("get_project_summary").handler(ctx, { projectId });

    const result = streamText({
      model,
      system: projectSystemPrompt(summary),
      messages: await convertToModelMessages(messages),
      tools: toAiTools(ctx, ASSISTANT_TOOLS, { projectId }),
      stopWhen: stepCountIs(maxSteps),
    });
    return createUIMessageStreamResponse({
      stream: toUIMessageStream({
        stream: result.stream,
        originalMessages: messages,
        onEnd: ({ messages: all }) => assistantService.saveMessages(ctx, conversation.id, all),
      }),
    });
  } catch (e) {
    if (e instanceof DomainError) return new Response(e.message, { status: e.code === "forbidden" ? 403 : 400 });
    throw e;
  }
}
