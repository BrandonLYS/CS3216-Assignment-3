import { randomInt, randomUUID } from "node:crypto";
import type { Ctx } from "@/server/core/context";
import { compactPatch, diffFields } from "@/server/core/diff";
import { ConflictError, NotFoundError, ValidationError } from "@/server/core/errors";
import { mutate } from "@/server/core/mutation";
import type { DbOrTx } from "@/server/db/client";
import { evidenceRepo } from "@/server/modules/evidence/repository";
import type { EvidenceRow } from "@/server/modules/evidence/schema";
import { assertOwnsProject } from "@/server/modules/projects/service";
import { getStorage } from "@/server/storage";
import { RENDER_EVIDENCE_MAX, RENDER_MAX_PER_PROJECT } from "@/shared/domain";
import {
  generateImage,
  isRenderConfigured,
  messageForFailure,
  RENDER_HEIGHT,
  RENDER_MODEL,
  RENDER_WIDTH,
} from "./provider";
import { rendersRepo } from "./repository";
import type { RenderRow } from "./schema";
import type { CreateRenderInput } from "./validation";

/** Activity Events want a short label; a thousand-character prompt is not one. */
const labelOf = (prompt: string) => (prompt.length > 60 ? `${prompt.slice(0, 57).trimEnd()}...` : prompt);

const storageKeyFor = (projectId: string, renderId: string) => `renders/${projectId}/${renderId}/image`;

/**
 * The Evidence a Render cites, in the order given. The schema caps the count too, but the
 * service does not trust its callers. A missing or foreign id reads as not found, so an id
 * from someone else's Project is not confirmed to exist.
 */
async function loadEvidence(db: DbOrTx, projectId: string, ids: string[]): Promise<EvidenceRow[]> {
  const unique = [...new Set(ids)];
  if (unique.length > RENDER_EVIDENCE_MAX)
    throw new ValidationError(`Choose at most ${RENDER_EVIDENCE_MAX} pieces of Evidence`, {
      evidenceIds: ["Too many"],
    });
  const byId = new Map((await evidenceRepo.findByIds(db, unique)).map((e) => [e.id, e]));
  return unique.map((id) => {
    const row = byId.get(id);
    if (!row || row.projectId !== projectId) throw new NotFoundError("Evidence");
    return row;
  });
}

async function getOwned(db: DbOrTx, userId: string, id: string) {
  const row = await rendersRepo.findById(db, id);
  if (!row) throw new NotFoundError("Render");
  await assertOwnsProject(db, userId, row.projectId);
  return row;
}

export const rendersService = {
  /** False when no image key is set; the tab says so rather than offering a button that cannot work. */
  enabled: isRenderConfigured,

  list: async (ctx: Ctx, projectId: string) => {
    await assertOwnsProject(ctx.db, ctx.userId, projectId);
    return rendersRepo.listByProject(ctx.db, projectId);
  },

  /** Read-only projection the open tab polls while a Render is pending (ADR 0011). */
  states: async (ctx: Ctx, projectId: string) => {
    await assertOwnsProject(ctx.db, ctx.userId, projectId);
    return rendersRepo.listStates(ctx.db, projectId);
  },

  get: (ctx: Ctx, id: string) => getOwned(ctx.db, ctx.userId, id),

  /**
   * Record the request and return immediately; the picture arrives later via `fulfil`.
   * Generation takes tens of seconds, which is far too long to hold a server action open,
   * so the row is the PM's receipt and the tab polls it.
   *
   * `input.prompt` is the description the PM approved, typed or drafted from Evidence and
   * edited (ADR 0016). Nothing else is mixed in: the prompt leaves our server for a third
   * party, and what leaves is only what a human approved for that purpose. `evidenceIds`
   * are recorded as provenance only and never read into the prompt.
   */
  request: async (ctx: Ctx, input: CreateRenderInput) => {
    await assertOwnsProject(ctx.db, ctx.userId, input.projectId);
    if (!isRenderConfigured()) throw new ConflictError("Image previews are not configured.");
    return mutate(ctx, async (tx, rec) => {
      await assertOwnsProject(tx, ctx.userId, input.projectId);
      const cited = await loadEvidence(tx, input.projectId, input.evidenceIds ?? []);
      // Counted inside the transaction so two quick clicks cannot both pass the cap.
      const existing = await rendersRepo.countForProject(tx, input.projectId);
      if (existing >= RENDER_MAX_PER_PROJECT) {
        throw new ValidationError(`This project already has ${RENDER_MAX_PER_PROJECT} renders. Delete one first.`, {
          prompt: ["Limit reached"],
        });
      }
      const row = await rendersRepo.insert(tx, {
        id: randomUUID(),
        projectId: input.projectId,
        prompt: input.prompt,
        model: RENDER_MODEL,
        seed: randomInt(1, 2_147_483_647),
        width: RENDER_WIDTH,
        height: RENDER_HEIGHT,
        state: "pending",
        evidence: cited.map((e) => ({ evidenceId: e.id, title: e.title })),
      });
      rec.created("render", row.projectId, row.id, labelOf(row.prompt));
      return row;
    });
  },

  /**
   * Do the slow work and settle the row, once the response that requested it has been sent.
   * Never throws for a provider failure: the failure IS the outcome, written to the row so
   * the PM sees why instead of a spinner that never stops.
   */
  fulfil: async (ctx: Ctx, id: string): Promise<void> => {
    const row = await getOwned(ctx.db, ctx.userId, id);
    if (row.state !== "pending") return;

    let patch: Partial<RenderRow>;
    try {
      const { bytes, mimeType } = await generateImage(row.prompt, row.seed);
      const storageKey = storageKeyFor(row.projectId, row.id);
      // Bytes land before the row points at them, so a failed commit leaves an orphan blob
      // rather than a Render promising an image that is not there.
      await getStorage().put(storageKey, bytes, mimeType);
      patch = { state: "ready", storageKey, mimeType, sizeBytes: bytes.length, error: null };
    } catch (e) {
      console.error(`Render ${id} failed`, e);
      patch = { state: "failed", error: messageForFailure(e) };
    }

    await mutate(ctx, async (tx, rec) => {
      // Still pending, or the PM deleted or retried it while we were generating.
      const settled = await rendersRepo.settleIfPending(tx, id, patch);
      if (!settled) return;
      rec.updated("render", row.projectId, id, labelOf(row.prompt), diffFields(row, compactPatch(patch)));
    });
  },

  /**
   * Insert an already-generated Render. Used by the seed so a fresh clone shows the feature
   * working with no API key and no network call.
   *
   * `seed` is the seed the image was really produced with, so an imported Render carries the
   * same honest provenance as a generated one and reproduces from what the card displays.
   */
  importReady: async (
    ctx: Ctx,
    input: CreateRenderInput & { bytes: Buffer; mimeType: string; seed: number },
  ): Promise<RenderRow> => {
    await assertOwnsProject(ctx.db, ctx.userId, input.projectId);
    const id = randomUUID();
    const storageKey = storageKeyFor(input.projectId, id);
    await getStorage().put(storageKey, input.bytes, input.mimeType);
    return mutate(ctx, async (tx, rec) => {
      const row = await rendersRepo.insert(tx, {
        id,
        projectId: input.projectId,
        prompt: input.prompt,
        model: RENDER_MODEL,
        seed: input.seed,
        width: RENDER_WIDTH,
        height: RENDER_HEIGHT,
        state: "ready",
        storageKey,
        mimeType: input.mimeType,
        sizeBytes: input.bytes.length,
      });
      rec.created("render", row.projectId, row.id, labelOf(row.prompt));
      return row;
    });
  },

  /** Row first; the blob goes only once the delete has committed. */
  delete: async (ctx: Ctx, id: string) => {
    const row = await mutate(ctx, async (tx, rec) => {
      const row = await getOwned(tx, ctx.userId, id);
      await rendersRepo.delete(tx, id);
      rec.deleted("render", row.projectId, id, labelOf(row.prompt));
      return row;
    });
    if (row.storageKey) await getStorage().delete(row.storageKey);
    return row;
  },

  /** Raw bytes for the <img> route; ownership enforced. */
  image: async (ctx: Ctx, id: string) => {
    const row = await getOwned(ctx.db, ctx.userId, id);
    if (!row.storageKey) throw new NotFoundError("Image");
    return { render: row, bytes: await getStorage().get(row.storageKey) };
  },
};
