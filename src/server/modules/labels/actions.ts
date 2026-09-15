"use server";

import { z } from "zod";
import { runAction } from "@/server/core/action";
import { revalidateProject } from "@/server/core/revalidate";
import { createLabelSchema, labelsService, updateLabelSchema } from "./service";

export async function createLabelAction(fd: FormData) {
  const res = await runAction(createLabelSchema, fd, (ctx, i) => labelsService.create(ctx, i));
  if (res.ok) revalidateProject(res.data.projectId);
  return res;
}
export async function updateLabelAction(fd: FormData) {
  const res = await runAction(updateLabelSchema, fd, (ctx, i) => labelsService.update(ctx, i));
  if (res.ok) revalidateProject(res.data.projectId);
  return res;
}
export async function deleteLabelAction(fd: FormData) {
  const projectId = String(fd.get("projectId"));
  const res = await runAction(z.object({ id: z.string() }), fd, (ctx, { id }) => labelsService.delete(ctx, id));
  if (res.ok) revalidateProject(projectId);
  return res;
}
