"use server";

import { z } from "zod";
import { runAction } from "@/server/core/action";
import { revalidateProject } from "@/server/core/revalidate";
import { decisionsService } from "./service";
import {
  attachAssumptionSchema,
  breakAssumptionSchema,
  consequenceSchema,
  createAssumptionSchema,
  dismissAlertSchema,
  createDecisionSchema,
  retireAssumptionSchema,
  supersedeDecisionSchema,
  updateDecisionSchema,
} from "./validation";

export async function createDecisionAction(fd: FormData) {
  // Confirming a Proposal is the Assistant acting on the User's behalf (ADR 0007); the service
  // records the acceptance, because it is the only place that sees what was proposed (issue #74).
  const res = await runAction(createDecisionSchema, fd, (ctx, i) =>
    decisionsService.create(i.proposalId ? { ...ctx, via: "assistant" } : ctx, i),
  );
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
export async function breakAssumptionAction(input: z.input<typeof breakAssumptionSchema>) {
  const res = await runAction(breakAssumptionSchema, input, (ctx, i) => decisionsService.breakAssumption(ctx, i));
  if (res.ok) revalidateProject(res.data.projectId);
  return res;
}
export async function dismissAlertAction(input: z.input<typeof dismissAlertSchema>) {
  const res = await runAction(dismissAlertSchema, input, (ctx, { id }) => decisionsService.dismissAlert(ctx, id));
  if (res.ok) revalidateProject(res.data.projectId);
  return res;
}
export async function addConsequenceAction(input: z.input<typeof consequenceSchema>) {
  const res = await runAction(consequenceSchema, input, (ctx, i) => decisionsService.addConsequence(ctx, i));
  if (res.ok) revalidateProject(res.data.projectId);
  return res;
}
export async function removeConsequenceAction(input: z.input<typeof consequenceSchema>) {
  const res = await runAction(consequenceSchema, input, (ctx, i) => decisionsService.removeConsequence(ctx, i));
  if (res.ok) revalidateProject(res.data.projectId);
  return res;
}
