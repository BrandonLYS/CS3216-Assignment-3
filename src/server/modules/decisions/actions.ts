"use server";

import { z } from "zod";
import { runAction } from "@/server/core/action";
import { revalidateProject } from "@/server/core/revalidate";
import { decisionsService } from "./service";
import {
  attachAssumptionSchema,
  createAssumptionSchema,
  createDecisionSchema,
  retireAssumptionSchema,
  supersedeDecisionSchema,
  updateDecisionSchema,
} from "./validation";

export async function createDecisionAction(fd: FormData) {
  const res = await runAction(createDecisionSchema, fd, (ctx, i) => decisionsService.create(ctx, i));
  if (res.ok) revalidateProject(res.data.projectId);
  return res;
}
export async function updateDecisionAction(fd: FormData) {
  const res = await runAction(updateDecisionSchema, fd, (ctx, i) => decisionsService.update(ctx, i));
  if (res.ok) revalidateProject(res.data.projectId);
  return res;
}
export async function deleteDecisionAction(fd: FormData) {
  const res = await runAction(z.object({ id: z.string() }), fd, (ctx, { id }) => decisionsService.delete(ctx, id));
  if (res.ok) revalidateProject(res.data.projectId);
  return res;
}
export async function supersedeDecisionAction(input: z.input<typeof supersedeDecisionSchema>) {
  const res = await runAction(supersedeDecisionSchema, input, (ctx, i) => decisionsService.supersede(ctx, i));
  if (res.ok) revalidateProject(res.data.projectId);
  return res;
}
export async function createAssumptionAction(fd: FormData) {
  const res = await runAction(createAssumptionSchema, fd, (ctx, i) => decisionsService.createAssumption(ctx, i));
  if (res.ok) revalidateProject(res.data.projectId);
  return res;
}
export async function attachAssumptionAction(input: z.input<typeof attachAssumptionSchema>) {
  const res = await runAction(attachAssumptionSchema, input, (ctx, i) => decisionsService.attachAssumption(ctx, i));
  if (res.ok) revalidateProject(res.data.projectId);
  return res;
}
export async function detachAssumptionAction(input: z.input<typeof attachAssumptionSchema>) {
  const res = await runAction(attachAssumptionSchema, input, (ctx, i) => decisionsService.detachAssumption(ctx, i));
  if (res.ok) revalidateProject(res.data.projectId);
  return res;
}
export async function retireAssumptionAction(input: z.input<typeof retireAssumptionSchema>) {
  const res = await runAction(retireAssumptionSchema, input, (ctx, { id }) =>
    decisionsService.retireAssumption(ctx, id),
  );
  if (res.ok) revalidateProject(res.data.projectId);
  return res;
}
