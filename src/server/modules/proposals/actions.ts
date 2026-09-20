"use server";

import { z } from "zod";
import { runAction } from "@/server/core/action";
import { revalidateProject } from "@/server/core/revalidate";
import { captureCurrent } from "@/shared/analytics/server";
import { proposalsService } from "./service";

const byProject = z.object({ projectId: z.string() });
const byId = z.object({ id: z.string() });

export async function runProposalPassAction(input: z.input<typeof byProject>) {
  const res = await runAction(byProject, input, (ctx, { projectId }) => proposalsService.runPass(ctx, projectId));
  if (res.ok) {
    revalidateProject(input.projectId);
    if ("proposed" in res.data) {
      await captureCurrent("proposal_generated", {
        proposal_count: res.data.proposed,
        source_count: res.data.sourcesPassed,
      });
    }
  }
  return res;
}
export async function acceptProposalAction(input: z.input<typeof byId>) {
  const res = await runAction(byId, input, (ctx, { id }) => proposalsService.accept(ctx, { id }));
  if (res.ok) {
    revalidateProject(res.data.projectId);
    await captureCurrent("proposal_accepted", { proposal_id: input.id, edited_before_accept: false });
  }
  return res;
}
export async function rejectProposalAction(input: z.input<typeof byId>) {
  const res = await runAction(byId, input, (ctx, { id }) => proposalsService.reject(ctx, id));
  if (res.ok) {
    revalidateProject(res.data.projectId);
    await captureCurrent("proposal_rejected", { proposal_id: input.id });
  }
  return res;
}
