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
  it("returns the latest Conversation in a scope, creating one on first open", async () => {
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

  it("tolerates the same Message id twice in one save (last occurrence wins)", async () => {
    const { conversation } = await assistantService.conversation(ctx, projectId);
    await assistantService.saveMessages(ctx, conversation.id, [
      msg("dup", "user", "first"),
      msg("dup", "user", "second"),
      msg("m3", "assistant", "ok"),
    ]);
    const { messages } = await assistantService.conversation(ctx, projectId);
    expect(messages.find((m) => m.id === "dup")?.parts).toEqual([{ type: "text", text: "second" }]);
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
    expect(await assistantService.turnsToday(ctx)).toBe(2); // "m1" and "dup" (deduped) user turns
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

  it("creates additional Conversations and lists them newest first", async () => {
    const before = await assistantService.dock(ctx, projectId);
    const extra = await assistantService.createConversation(ctx, projectId);
    const dock = await assistantService.dock(ctx, projectId);
    expect(dock.conversations.length).toBe(before.conversations.length + 1);
    expect(dock.conversations[0]?.id).toBe(extra.id);
    expect(dock.thread.conversation.id).toBe(extra.id);
    expect(dock.thread.messages).toEqual([]);
  });

  it("loads a Conversation by id and titles it from the first user message", async () => {
    const c = await assistantService.createConversation(ctx, projectId);
    await assistantService.saveMessages(ctx, c.id, [msg("t1", "user", "summarise the risks")]);
    const thread = await assistantService.thread(ctx, c.id);
    expect(thread.messages.map((m) => m.id)).toEqual(["t1"]);
    const listed = (await assistantService.dock(ctx, projectId)).conversations.find((x) => x.id === c.id);
    expect(listed?.title).toBe("summarise the risks");
    const stranger = await makeCtx();
    await expect(assistantService.thread(stranger, c.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("pins Conversations to the top and prunes empty ones", async () => {
    const first = await assistantService.createConversation(ctx, projectId);
    await assistantService.saveMessages(ctx, first.id, [msg("x1", "user", "thread one")]);
    const empty = await assistantService.createConversation(ctx, projectId);
    const pinnedEmpty = await assistantService.createConversation(ctx, projectId);
    await assistantService.pinConversation(ctx, pinnedEmpty.id, true);
    const latest = await assistantService.createConversation(ctx, projectId);
    await assistantService.saveMessages(ctx, latest.id, [msg("x2", "user", "thread two")]);

    const dock = await assistantService.dock(ctx, projectId);
    expect(dock.conversations[0]?.id).toBe(pinnedEmpty.id); // pinned sorts first
    expect(dock.conversations[0]?.pinned).toBe(true);
    expect(dock.thread.conversation.id).toBe(latest.id); // but the latest still opens
    expect(dock.conversations.map((c) => c.id)).not.toContain(empty.id); // empty pruned

    await assistantService.pinConversation(ctx, pinnedEmpty.id, false);
    const after = await assistantService.dock(ctx, projectId);
    expect(after.conversations.map((c) => c.id)).not.toContain(pinnedEmpty.id); // unpinned + empty -> pruned

    const stranger = await makeCtx();
    await expect(assistantService.pinConversation(stranger, first.id, true)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
