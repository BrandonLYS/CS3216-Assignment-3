import type { UIMessage } from "ai";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Ctx } from "@/server/core/context";
import { ForbiddenError } from "@/server/core/errors";
import { closeDb, makeCtx, makeProject } from "@/test/helpers";
import { assistantService } from "./service";

let ctx: Ctx;
let projectId: string;

beforeAll(async () => {
  ctx = await makeCtx();
  projectId = (await makeProject(ctx, "CNV")).id;
});
afterAll(closeDb);

const msg = (id: string, role: UIMessage["role"], text: string): UIMessage => ({
  id,
  role,
  parts: [{ type: "text", text }],
});

describe("assistantService conversations", () => {
  it("creates one Conversation per User per Project and returns the same one again", async () => {
    const a = await assistantService.conversation(ctx, projectId);
    const b = await assistantService.conversation(ctx, projectId);
    expect(a.conversation.id).toBe(b.conversation.id);
    expect(a.messages).toEqual([]);
  });

  it("saves Messages by id so a re-save updates instead of duplicating", async () => {
    const { conversation } = await assistantService.conversation(ctx, projectId);
    await assistantService.saveMessages(ctx, conversation.id, [msg("m1", "user", "plan a launch")]);
    await assistantService.saveMessages(ctx, conversation.id, [
      msg("m1", "user", "plan a launch"),
      msg("m2", "assistant", "Done: created 3 Tasks"),
    ]);
    const { messages } = await assistantService.conversation(ctx, projectId);
    expect(messages.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(messages[1]?.parts).toEqual([{ type: "text", text: "Done: created 3 Tasks" }]);
  });

  it("keeps Message ids scoped to their Conversation", async () => {
    const other = await makeCtx();
    const otherProject = (await makeProject(other, "OTH")).id;
    const { conversation } = await assistantService.conversation(other, otherProject);
    await assistantService.saveMessages(other, conversation.id, [msg("m1", "user", "different thread")]);
    const mine = await assistantService.conversation(ctx, projectId);
    expect(mine.messages[0]?.parts).toEqual([{ type: "text", text: "plan a launch" }]);
  });

  it("counts only this User's turns today", async () => {
    expect(await assistantService.turnsToday(ctx)).toBe(1);
    const other = await makeCtx();
    expect(await assistantService.turnsToday(other)).toBe(0);
  });

  it("keeps a separate dashboard Conversation with no Project", async () => {
    const dash = await assistantService.conversation(ctx, null);
    expect(dash.conversation.projectId).toBeNull();
    expect(dash.conversation.id).not.toBe((await assistantService.conversation(ctx, projectId)).conversation.id);
    expect((await assistantService.conversation(ctx, null)).conversation.id).toBe(dash.conversation.id);
  });

  it("refuses a Project the User does not own", async () => {
    const stranger = await makeCtx();
    await expect(assistantService.conversation(stranger, projectId)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
