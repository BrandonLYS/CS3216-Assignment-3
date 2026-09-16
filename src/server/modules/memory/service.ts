import type { Ctx } from "@/server/core/context";
import { ValidationError } from "@/server/core/errors";
import { assertOwnsProject } from "@/server/modules/projects/service";
import { memoryRepo } from "./repository";
import type { SaveMemoryInput } from "./validation";

/** Rough token estimate for the budget check; the model's tokenizer is not worth a dependency here. */
const CHARS_PER_TOKEN = 4;
export const memoryMaxTokens = () => Number(process.env.MEMORY_MAX_TOKENS) || 2000;

/**
 * Profile (one per User) and Working Memory (one per User per Project) as append-only versions.
 * Like Conversations these are the Assistant's own documents, not Project items: no Activity
 * Event and no `mutate` (ADR 0007).
 */
export const memoryService = {
  /** Newest version, or null when the document has never been written. */
  current: async (ctx: Ctx, projectId: string | null) => {
    if (projectId) await assertOwnsProject(ctx.db, ctx.userId, projectId);
    return (await memoryRepo.current(ctx.db, ctx.userId, projectId)) ?? null;
  },

  versions: async (ctx: Ctx, projectId: string | null) => {
    if (projectId) await assertOwnsProject(ctx.db, ctx.userId, projectId);
    return memoryRepo.versions(ctx.db, ctx.userId, projectId);
  },

  /** Append a version; returns null (writes nothing) when the body equals the current one. */
  save: async (ctx: Ctx, { projectId, body, author, ...trace }: SaveMemoryInput) => {
    if (projectId) await assertOwnsProject(ctx.db, ctx.userId, projectId);
    const clean = body.trim();
    if (!clean) throw new ValidationError("Write something first", { body: ["Required"] });
    const max = memoryMaxTokens();
    if (clean.length > max * CHARS_PER_TOKEN) {
      throw new ValidationError(`Too long: keep it under about ${max} tokens (${max * CHARS_PER_TOKEN} characters)`, {
        body: ["Too long"],
      });
    }
    const current = await memoryRepo.current(ctx.db, ctx.userId, projectId);
    if (current?.body === clean) return null;
    return memoryRepo.insert(ctx.db, { userId: ctx.userId, projectId, body: clean, author, ...trace });
  },
};
