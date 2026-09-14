"use server";

import { z } from "zod";
import { runAction } from "@/server/core/action";
import { revalidateProject } from "@/server/core/revalidate";
import { peopleService } from "./service";
import { createPersonSchema, createTeamSchema, updatePersonSchema, updateTeamSchema } from "./validation";

const idSchema = z.object({ id: z.string() });

export async function createPersonAction(fd: FormData) {
  const res = await runAction(createPersonSchema, fd, (ctx, i) => peopleService.createPerson(ctx, i));
  if (res.ok) revalidateProject(res.data.projectId);
  return res;
}
export async function updatePersonAction(fd: FormData) {
  const res = await runAction(updatePersonSchema, fd, (ctx, i) => peopleService.updatePerson(ctx, i));
  if (res.ok) revalidateProject(res.data.projectId);
  return res;
}
export async function deletePersonAction(fd: FormData) {
  const projectId = String(fd.get("projectId"));
  const res = await runAction(idSchema, fd, (ctx, { id }) => peopleService.deletePerson(ctx, id));
  if (res.ok) revalidateProject(projectId);
  return res;
}

export async function createTeamAction(fd: FormData) {
  const res = await runAction(createTeamSchema, fd, (ctx, i) => peopleService.createTeam(ctx, i));
  if (res.ok) revalidateProject(res.data.projectId);
  return res;
}
export async function updateTeamAction(fd: FormData) {
  const res = await runAction(updateTeamSchema, fd, (ctx, i) => peopleService.updateTeam(ctx, i));
  if (res.ok) revalidateProject(res.data.projectId);
  return res;
}
export async function deleteTeamAction(fd: FormData) {
  const projectId = String(fd.get("projectId"));
  const res = await runAction(idSchema, fd, (ctx, { id }) => peopleService.deleteTeam(ctx, id));
  if (res.ok) revalidateProject(projectId);
  return res;
}
