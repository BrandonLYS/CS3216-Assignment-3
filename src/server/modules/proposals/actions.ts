"use server";

import { z } from "zod";
import { runAction } from "@/server/core/action";
import { revalidateProject } from "@/server/core/revalidate";
import { proposalsService } from "./service";

const byProject = z.object({ projectId: z.string() });
const byId = z.object({ id: z.string() });

export async function runProposalPassAction(input: z.input<typeof byProject>) {
  const res = await runAction(byProject, input, (ctx, { projectId }) => proposalsService.runPass(ctx, projectId));
  if (res.ok) revalidateProject(input.projectId);
  return res;
}
export async function acceptProposalAction(input: z.input<typeof byId>) {
  const res = await runAction(byId, input, (ctx, { id }) => proposalsService.accept(ctx, { id }));
  if (res.ok) revalidateProject(res.data.projectId);
  return res;
}
export async function rejectProposalAction(input: z.input<typeof byId>) {
  const res = await runAction(byId, input, (ctx, { id }) => proposalsService.reject(ctx, id));
  if (res.ok) revalidateProject(res.data.projectId);
  return res;
}
