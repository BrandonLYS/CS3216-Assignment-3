import { randomUUID } from "node:crypto";
import path from "node:path";
import type { Ctx } from "@/server/core/context";
import { compactPatch, diffFields } from "@/server/core/diff";
import { NotFoundError, ValidationError } from "@/server/core/errors";
import { mutate } from "@/server/core/mutation";
import type { DbOrTx } from "@/server/db/client";
import { milestonesRepo } from "@/server/modules/milestones/repository";
import { assertOwnsProject } from "@/server/modules/projects/service";
import { risksRepo } from "@/server/modules/risks/repository";
import { tasksRepo } from "@/server/modules/tasks/repository";
import { getStorage } from "@/server/storage";
import { labelFor, type LinkableEntityType } from "@/shared/domain";
import { evidenceLinksRepo, evidenceRepo } from "./repository";
import type { CreateEvidenceInput, EvidenceLinkInput, UpdateEvidenceInput } from "./validation";

export const MAX_EVIDENCE_BYTES = 15 * 1024 * 1024;
export const ACCEPTED_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
  "text/markdown",
]);

export interface UploadedFile {
  name: string;
  type: string;
  size: number;
  bytes: Buffer;
}

/** Object name is derived from the row id; only the original extension is kept from the client name. */
function storageKeyFor(projectId: string, evidenceId: string, fileName: string) {
  const ext = path
    .extname(fileName)
    .replace(/[^.\w]/g, "")
    .slice(0, 16);
  return `evidence/${projectId}/${evidenceId}/file${ext}`;
}

async function getOwned(db: DbOrTx, userId: string, id: string) {
  const e = await evidenceRepo.findById(db, id);
  if (!e) throw new NotFoundError("Evidence");
  await assertOwnsProject(db, userId, e.projectId);
  return e;
}

/** The linked item must exist in `projectId`; returns its display label (title/name). */
async function linkedItemLabel(db: DbOrTx, projectId: string, entityType: LinkableEntityType, entityId: string) {
  const row =
    entityType === "task"
      ? await tasksRepo.findById(db, entityId)
      : entityType === "risk"
        ? await risksRepo.findById(db, entityId)
        : await milestonesRepo.findById(db, entityId);
  if (!row || row.projectId !== projectId) {
    throw new ValidationError(`${labelFor(entityType)} not in this project`, { entityId: ["Invalid"] });
  }
  return "name" in row ? row.name : row.title;
}

async function ownedEvidenceInProject(db: DbOrTx, projectId: string, evidenceId: string) {
  const e = await evidenceRepo.findById(db, evidenceId);
  if (!e || e.projectId !== projectId) {
    throw new ValidationError("Evidence not in this project", { evidenceId: ["Invalid"] });
  }
  return e;
}

export const evidenceService = {
  list: async (ctx: Ctx, projectId: string) => {
    await assertOwnsProject(ctx.db, ctx.userId, projectId);
    return evidenceRepo.listByProject(ctx.db, projectId);
  },

  get: (ctx: Ctx, id: string) => getOwned(ctx.db, ctx.userId, id),

  /**
   * Either `file` or `input.body` must be present. Bytes are written to storage before the
   * transaction so a failed commit leaves at most an orphan blob, never a row pointing at nothing.
   */
  create: async (ctx: Ctx, input: CreateEvidenceInput, file?: UploadedFile | null) => {
    await assertOwnsProject(ctx.db, ctx.userId, input.projectId);
    if (!file && !input.body) throw new ValidationError("Attach a file or paste some text", { body: ["Required"] });
    if (file) {
      if (file.size > MAX_EVIDENCE_BYTES)
        throw new ValidationError("File is larger than 15 MB", { file: ["Too large"] });
      if (!ACCEPTED_MIME.has(file.type)) throw new ValidationError("Unsupported file type", { file: ["Unsupported"] });
    }
    const id = randomUUID();
    const storageKey = file ? storageKeyFor(input.projectId, id, file.name) : null;
    if (file && storageKey) await getStorage().put(storageKey, file.bytes, file.type);
    try {
      return await mutate(ctx, async (tx, rec) => {
        await assertOwnsProject(tx, ctx.userId, input.projectId);
        const row = await evidenceRepo.insert(tx, {
          ...input,
          id,
          storageKey,
          fileName: file?.name,
          mimeType: file?.type,
          sizeBytes: file?.size,
        });
        rec.created("evidence", input.projectId, row.id, row.title);
        return row;
      });
    } catch (e) {
      if (storageKey)
        await getStorage()
          .delete(storageKey)
          .catch(() => undefined);
      throw e;
    }
  },

  update: (ctx: Ctx, { id, ...patch }: UpdateEvidenceInput) =>
    mutate(ctx, async (tx, rec) => {
      const before = await getOwned(tx, ctx.userId, id);
      const clean = compactPatch(patch);
      const changes = diffFields(before, clean);
      if (!changes.length) return before;
      const after = await evidenceRepo.update(tx, id, clean);
      rec.updated("evidence", before.projectId, id, after.title, changes);
      return after;
    }),

  /** Row goes first; the blob is removed only once the delete has committed. */
  delete: async (ctx: Ctx, id: string) => {
    const e = await mutate(ctx, async (tx, rec) => {
      const e = await getOwned(tx, ctx.userId, id);
      await evidenceRepo.delete(tx, id);
      rec.deleted("evidence", e.projectId, id, e.title);
      return e;
    });
    if (e.storageKey) await getStorage().delete(e.storageKey);
  },

  /** Raw bytes for download; ownership enforced. */
  download: async (ctx: Ctx, id: string) => {
    const e = await getOwned(ctx.db, ctx.userId, id);
    if (!e.storageKey) throw new NotFoundError("File");
    return { evidence: e, bytes: await getStorage().get(e.storageKey) };
  },

  /**
   * Idempotent: linking an existing pair returns the existing row with no Activity Event.
   * The Activity Event is recorded against the item (field `evidence`), never the Evidence,
   * so the Overview feed shows one entry.
   */
  link: (ctx: Ctx, input: EvidenceLinkInput) =>
    mutate(ctx, async (tx, rec) => {
      await assertOwnsProject(tx, ctx.userId, input.projectId);
      const ev = await ownedEvidenceInProject(tx, input.projectId, input.evidenceId);
      const itemLabel = await linkedItemLabel(tx, input.projectId, input.entityType, input.entityId);
      const inserted = await evidenceLinksRepo.insertIgnore(tx, input);
      if (!inserted) return (await evidenceLinksRepo.find(tx, input))!;
      rec.updated(input.entityType, input.projectId, input.entityId, itemLabel, [
        { field: "evidence", oldValue: null, newValue: ev.title },
      ]);
      rec.signal("evidence.linked", {
        projectId: input.projectId,
        entityType: "evidence",
        entityId: ev.id,
        entityLabel: ev.title,
        changes: [
          { field: "link", oldValue: null, newValue: { entityType: input.entityType, entityId: input.entityId } },
        ],
      });
      return inserted;
    }),

  /** Removing a link that does not exist is a no-op success. */
  unlink: (ctx: Ctx, input: EvidenceLinkInput) =>
    mutate(ctx, async (tx, rec) => {
      await assertOwnsProject(tx, ctx.userId, input.projectId);
      const ev = await ownedEvidenceInProject(tx, input.projectId, input.evidenceId);
      const itemLabel = await linkedItemLabel(tx, input.projectId, input.entityType, input.entityId);
      const removed = await evidenceLinksRepo.delete(tx, input);
      if (!removed.length) return;
      rec.updated(input.entityType, input.projectId, input.entityId, itemLabel, [
        { field: "evidence", oldValue: ev.title, newValue: null },
      ]);
      rec.signal("evidence.unlinked", {
        projectId: input.projectId,
        entityType: "evidence",
        entityId: ev.id,
        entityLabel: ev.title,
        changes: [
          { field: "link", oldValue: { entityType: input.entityType, entityId: input.entityId }, newValue: null },
        ],
      });
    }),

  listForEntity: async (ctx: Ctx, projectId: string, entityType: LinkableEntityType, entityId: string) => {
    await assertOwnsProject(ctx.db, ctx.userId, projectId);
    return evidenceLinksRepo.listForEntity(ctx.db, entityType, entityId);
  },

  listForEvidence: async (ctx: Ctx, evidenceId: string) => {
    const e = await getOwned(ctx.db, ctx.userId, evidenceId);
    return evidenceLinksRepo.listForEvidence(ctx.db, e.id);
  },

  /** Every linkable item in the project, for the Evidence page picker. */
  listLinkTargets: async (ctx: Ctx, projectId: string) => {
    await assertOwnsProject(ctx.db, ctx.userId, projectId);
    return evidenceLinksRepo.listTargets(ctx.db, projectId);
  },
};
