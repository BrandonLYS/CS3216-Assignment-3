"use server";

import { z } from "zod";
import { runAction } from "@/server/core/action";
import { revalidateProject } from "@/server/core/revalidate";
import { risksService } from "./service";
import { createRiskSchema, updateRiskSchema } from "./validation";

export async function createRiskAction(fd: FormData) {
  const res = await runAction(createRiskSchema, fd, (ctx, i) => risksService.create(ctx, i));
  if (res.ok) revalidateProject(res.data.projectId);
  return res;
}
export async function updateRiskAction(fd: FormData) {
  const res = await runAction(updateRiskSchema, fd, (ctx, i) => risksService.update(ctx, i));
  if (res.ok) revalidateProject(res.data.projectId);
  return res;
}
export async function patchRiskAction(input: z.input<typeof updateRiskSchema>) {
  const res = await runAction(updateRiskSchema, input, (ctx, i) => risksService.update(ctx, i));
  if (res.ok) revalidateProject(res.data.projectId);
  return res;
}
export async function deleteRiskAction(fd: FormData) {
  const projectId = String(fd.get("projectId"));
  const res = await runAction(z.object({ id: z.string() }), fd, (ctx, { id }) => risksService.delete(ctx, id));
  if (res.ok) revalidateProject(projectId);
  return res;
}
