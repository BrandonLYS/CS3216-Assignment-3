"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction } from "@/server/core/action";
import { revalidateProject } from "@/server/core/revalidate";
import { captureCurrent } from "@/shared/analytics/server";
import { projectsService } from "./service";
import { createProjectSchema, updateProjectSchema } from "./validation";

// Navigation after create/delete happens on the client: a redirect() inside an action
// invoked from a client component leaves the returned promise pending forever.

export async function createProjectAction(fd: FormData) {
  const res = await runAction(createProjectSchema, fd, (ctx, input) => projectsService.create(ctx, input));
  if (res.ok) {
    revalidatePath("/", "layout");
    await captureCurrent("project_created", { project_id: res.data.id });
  }
  return res;
}

export async function updateProjectAction(fd: FormData) {
  const res = await runAction(updateProjectSchema, fd, (ctx, input) => projectsService.update(ctx, input));
  if (res.ok) revalidateProject(res.data.id);
  return res;
}

export async function deleteProjectAction(fd: FormData) {
  const res = await runAction(z.object({ id: z.string() }), fd, (ctx, { id }) => projectsService.delete(ctx, id));
  if (res.ok) revalidatePath("/", "layout");
  return res;
}
