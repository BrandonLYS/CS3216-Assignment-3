import type { UIMessage } from "ai";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/server/core/context";
import { assistantService } from "@/server/modules/assistant/service";
import { memoryService } from "@/server/modules/memory/service";
import { closeDb, makeCtx, makeProject } from "@/test/helpers";
import { reflect, type Rewrite } from "./service";

let ctx: Ctx;
let projectId: string;
let conversationId: string;

const msg = (id: string, role: UIMessage["role"], text: string): UIMessage => ({
  id,
  role,
  parts: [{ type: "text", text }],
});

beforeAll(async () => {
  ctx = await makeCtx();
  projectId = (await makeProject(ctx, "RFL")).id;
  conversationId = (await assistantService.conversation(ctx, projectId)).conversation.id;
  await memoryService.save(ctx, { projectId: null, body: "Always assign new tasks to me.", author: "user" });
  await assistantService.saveMessages(ctx, conversationId, [
    msg("u1", "user", "plan a two-week launch"),
    msg("a1", "assistant", "Created 3 Tasks with two-week Milestones"),
    msg("u2", "user", "and another launch, same cadence"),
    msg("a2", "assistant", "Done, two-week Milestones again"),
  ]);
});
afterAll(closeDb);

const rewriteTo =
  (profile: string, workingMemory: string | null): Rewrite =>
  async () => ({ profile, workingMemory });

describe("reflect", () => {
  it("writes Reflection versions of the Profile and Working Memory that trace their Conversation", async () => {
    const out = await reflect(ctx, conversationId, {
      rewrite: rewriteTo(
        "Always assign new tasks to me.\nPrefers two-week milestones.",
        "Two launches planned so far.",
      ),
    });
    expect(out).toEqual({ profile: "written", workingMemory: "written" });
    const profile = (await memoryService.versions(ctx, null))[0]!;
    expect(profile).toMatchObject({ author: "reflection", conversationId, throughMessageId: "a2" });
    expect(profile.body).toContain("Prefers two-week milestones.");
    expect((await memoryService.current(ctx, projectId))?.body).toBe("Two launches planned so far.");
  });

  it("is throttled by time and by new Message count", async () => {
    expect(await reflect(ctx, conversationId, { rewrite: rewriteTo("x", "y") })).toEqual({ skipped: "too_soon" });
    vi.stubEnv("REFLECTION_MIN_MINUTES", "0");
    expect(await reflect(ctx, conversationId, { rewrite: rewriteTo("x", "y") })).toEqual({
      skipped: "too_few_messages",
    });
    vi.unstubAllEnvs();
  });

  it("rejects an output that drops a line the User wrote, and logs it", async () => {
    await assistantService.saveMessages(ctx, conversationId, [
      msg("u3", "user", "one more"),
      msg("a3", "assistant", "ok"),
      msg("u4", "user", "and more"),
    ]);
    vi.stubEnv("REFLECTION_MIN_MINUTES", "0");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const before = await memoryService.versions(ctx, null);
    const out = await reflect(ctx, conversationId, {
      rewrite: rewriteTo("Prefers two-week milestones.", "Two launches planned so far."),
    });
    expect(out).toEqual({ profile: "rejected", workingMemory: "unchanged" });
    expect(await memoryService.versions(ctx, null)).toHaveLength(before.length);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("dropped"), expect.anything());
    warn.mockRestore();
    vi.unstubAllEnvs();
  });

  it("never throws when the model call fails", async () => {
    vi.stubEnv("REFLECTION_MIN_MINUTES", "0");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await reflect(ctx, conversationId, {
      rewrite: async () => {
        throw new Error("bad key");
      },
    });
    expect(out).toEqual({ skipped: "failed" });
    expect(error).toHaveBeenCalled();
    error.mockRestore();
    vi.unstubAllEnvs();
  });
});
