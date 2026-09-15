"use server";

import { z } from "zod";
import { runAction } from "@/server/core/action";
import { revalidateProject } from "@/server/core/revalidate";
import { milestonesService } from "./service";
import { createMilestoneSchema, updateMilestoneSchema } from "./validation";

export async function createMilestoneAction(fd: FormData) {
  const res = await runAction(createMilestoneSchema, fd, (ctx, i) => milestonesService.create(ctx, i));
  if (res.ok) revalidateProject(res.data.projectId);
  return res;
}
export async function updateMilestoneAction(fd: FormData) {
  const res = await runAction(updateMilestoneSchema, fd, (ctx, i) => milestonesService.update(ctx, i));
  if (res.ok) revalidateProject(res.data.projectId);
  return res;
}
export async function deleteMilestoneAction(fd: FormData) {
  const projectId = String(fd.get("projectId"));
  const res = await runAction(z.object({ id: z.string() }), fd, (ctx, { id }) => milestonesService.delete(ctx, id));
  if (res.ok) revalidateProject(projectId);
  return res;
}
