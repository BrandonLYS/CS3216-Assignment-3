import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Ctx } from "@/server/core/context";
import { ForbiddenError, ValidationError } from "@/server/core/errors";
import { closeDb, makeCtx, makeProject } from "@/test/helpers";
import { memoryService } from "./service";

let ctx: Ctx;
let projectId: string;

beforeAll(async () => {
  ctx = await makeCtx();
  projectId = (await makeProject(ctx, "MEM")).id;
});
afterAll(closeDb);

describe("memoryService", () => {
  it("starts empty and appends a version per save, newest first", async () => {
    expect(await memoryService.current(ctx, null)).toBeNull();
    await memoryService.save(ctx, { projectId: null, body: "Prefers two-week milestones.", author: "user" });
    await memoryService.save(ctx, { projectId: null, body: "Prefers one-week milestones.", author: "reflection" });
    expect((await memoryService.current(ctx, null))?.body).toBe("Prefers one-week milestones.");
    const versions = await memoryService.versions(ctx, null);
    expect(versions.map((v) => v.author)).toEqual(["reflection", "user"]);
  });

  it("writes nothing when the body equals the current version", async () => {
    const before = await memoryService.versions(ctx, null);
    const saved = await memoryService.save(ctx, {
      projectId: null,
      body: "Prefers one-week milestones.",
      author: "user",
    });
    expect(saved).toBeNull();
    expect(await memoryService.versions(ctx, null)).toHaveLength(before.length);
  });

  it("keeps Working Memory per Project and separate from the Profile", async () => {
    await memoryService.save(ctx, { projectId, body: "Priya owns vendor risk.", author: "user" });
    expect((await memoryService.current(ctx, projectId))?.body).toBe("Priya owns vendor risk.");
    expect((await memoryService.current(ctx, null))?.body).toBe("Prefers one-week milestones.");
  });

  it("rejects a body over the token budget with a clear message", async () => {
    vi.stubEnv("MEMORY_MAX_TOKENS", "10");
    await expect(memoryService.save(ctx, { projectId: null, body: "x".repeat(41), author: "user" })).rejects.toThrow(
      /10 tokens/,
    );
    vi.unstubAllEnvs();
  });

  it("is private to the User", async () => {
    const stranger = await makeCtx();
    expect(await memoryService.current(stranger, null)).toBeNull();
    await expect(memoryService.current(stranger, projectId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(memoryService.save(stranger, { projectId, body: "mine now", author: "user" })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("rejects an empty body", async () => {
    await expect(memoryService.save(ctx, { projectId: null, body: "  ", author: "user" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});
