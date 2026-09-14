"use server";

import { z } from "zod";
import { runAction } from "@/server/core/action";
import { revalidateProject } from "@/server/core/revalidate";
import { statusesService } from "./service";
import { createStatusSchema, reorderStatusesSchema, updateStatusSchema } from "./validation";

export async function createStatusAction(fd: FormData) {
  const res = await runAction(createStatusSchema, fd, (ctx, input) => statusesService.create(ctx, input));
  if (res.ok) revalidateProject(res.data.projectId);
  return res;
}

export async function updateStatusAction(fd: FormData) {
  const res = await runAction(updateStatusSchema, fd, (ctx, input) => statusesService.update(ctx, input));
  if (res.ok) revalidateProject(res.data.projectId);
  return res;
}

export async function reorderStatusesAction(input: { projectId: string; ids: string[] }) {
  const res = await runAction(reorderStatusesSchema, input, (ctx, i) =>
    statusesService.reorder(ctx, i.projectId, i.ids),
  );
  if (res.ok) revalidateProject(input.projectId);
  return res;
}

export async function deleteStatusAction(fd: FormData) {
  const projectId = String(fd.get("projectId"));
  const res = await runAction(z.object({ id: z.string() }), fd, (ctx, { id }) => statusesService.delete(ctx, id));
  if (res.ok) revalidateProject(projectId);
  return res;
}
