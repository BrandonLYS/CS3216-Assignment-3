"use server";

import { z } from "zod";
import { runAction } from "@/server/core/action";
import { revalidateProject } from "@/server/core/revalidate";
import { evidenceService, type UploadedFile } from "./service";
import { createEvidenceSchema, updateEvidenceSchema } from "./validation";

export async function createEvidenceAction(fd: FormData) {
  const raw = fd.get("file");
  const file: UploadedFile | null =
    raw instanceof File && raw.size > 0
      ? {
          name: raw.name,
          type: raw.type || "application/octet-stream",
          size: raw.size,
          bytes: Buffer.from(await raw.arrayBuffer()),
        }
      : null;
  fd.delete("file");
  const res = await runAction(createEvidenceSchema, fd, (ctx, i) => evidenceService.create(ctx, i, file));
  if (res.ok) revalidateProject(res.data.projectId);
  return res;
}

export async function updateEvidenceAction(fd: FormData) {
  const res = await runAction(updateEvidenceSchema, fd, (ctx, i) => evidenceService.update(ctx, i));
  if (res.ok) revalidateProject(res.data.projectId);
  return res;
}

export async function deleteEvidenceAction(fd: FormData) {
  const projectId = String(fd.get("projectId"));
  const res = await runAction(z.object({ id: z.string() }), fd, (ctx, { id }) => evidenceService.delete(ctx, id));
  if (res.ok) revalidateProject(projectId);
  return res;
}
