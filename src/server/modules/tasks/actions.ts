"use server";

import { z } from "zod";
import { runAction } from "@/server/core/action";
import { revalidateProject } from "@/server/core/revalidate";
import { tasksService } from "./service";
import { createTaskSchema, updateTaskSchema } from "./validation";

export async function createTaskAction(fd: FormData) {
  const res = await runAction(createTaskSchema, fd, (ctx, i) => tasksService.create(ctx, i));
  if (res.ok) revalidateProject(res.data.projectId);
  return res;
}

export async function updateTaskAction(fd: FormData) {
  const res = await runAction(updateTaskSchema, fd, (ctx, i) => tasksService.update(ctx, i));
  if (res.ok) revalidateProject(res.data.projectId);
  return res;
}

/** JSON variant for inline edits (status pickers, board drags). */
export async function patchTaskAction(input: z.input<typeof updateTaskSchema>) {
  const res = await runAction(updateTaskSchema, input, (ctx, i) => tasksService.update(ctx, i));
  if (res.ok) revalidateProject(res.data.projectId);
  return res;
}

const moveSchema = z.object({ id: z.string(), statusId: z.string(), sortOrder: z.number().int() });
export async function moveTaskAction(input: z.infer<typeof moveSchema>) {
  const res = await runAction(moveSchema, input, (ctx, i) => tasksService.move(ctx, i.id, i.statusId, i.sortOrder));
  if (res.ok) revalidateProject(res.data.projectId);
  return res;
}

export async function deleteTaskAction(fd: FormData) {
  const projectId = String(fd.get("projectId"));
  const res = await runAction(z.object({ id: z.string() }), fd, (ctx, { id }) => tasksService.delete(ctx, id));
  if (res.ok) revalidateProject(projectId);
  return res;
}
