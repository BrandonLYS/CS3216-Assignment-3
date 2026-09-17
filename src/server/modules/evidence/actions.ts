"use server";

import { z } from "zod";
import { runAction } from "@/server/core/action";
import { scheduleProposalPass } from "@/server/modules/proposals/schedule";
import { revalidateProject } from "@/server/core/revalidate";
import { evidenceService, type UploadedFile } from "./service";
import { createEvidenceSchema, evidenceLinkSchema, updateEvidenceSchema } from "./validation";

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
  const res = await runAction(createEvidenceSchema, fd, async (ctx, i) => {
    const row = await evidenceService.create(ctx, i, file);
    scheduleProposalPass(ctx, row.projectId);
    return row;
  });
  if (res.ok) revalidateProject(res.data.projectId);
  return res;
}

export async function updateEvidenceAction(fd: FormData) {
  const res = await runAction(updateEvidenceSchema, fd, async (ctx, i) => {
    const row = await evidenceService.update(ctx, i);
    scheduleProposalPass(ctx, row.projectId);
    return row;
  });
  if (res.ok) revalidateProject(res.data.projectId);
  return res;
}

export async function deleteEvidenceAction(fd: FormData) {
  const projectId = String(fd.get("projectId"));
  const res = await runAction(z.object({ id: z.string() }), fd, (ctx, { id }) => evidenceService.delete(ctx, id));
  if (res.ok) revalidateProject(projectId);
  return res;
}

// The link pickers are not forms (they render inside the item ActionForm), so these take JSON.
export async function linkEvidenceAction(input: z.input<typeof evidenceLinkSchema>) {
  const res = await runAction(evidenceLinkSchema, input, (ctx, i) => evidenceService.link(ctx, i));
  if (res.ok) revalidateProject(input.projectId);
  return res;
}

export async function unlinkEvidenceAction(input: z.input<typeof evidenceLinkSchema>) {
  const res = await runAction(evidenceLinkSchema, input, (ctx, i) => evidenceService.unlink(ctx, i));
  if (res.ok) revalidateProject(input.projectId);
  return res;
}
