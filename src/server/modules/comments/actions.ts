"use server";

import type { z } from "zod";
import { runAction } from "@/server/core/action";
import { scheduleProposalPass } from "@/server/modules/proposals/schedule";
import { revalidateProject } from "@/server/core/revalidate";
import { commentsService } from "./service";
import { createCommentSchema, deleteCommentSchema, listCommentsSchema } from "./validation";

export async function createCommentAction(input: z.input<typeof createCommentSchema>) {
  const res = await runAction(createCommentSchema, input, async (ctx, i) => {
    const row = await commentsService.create(ctx, i);
    scheduleProposalPass(ctx, row.projectId);
    return row;
  });
  if (res.ok) revalidateProject(res.data.projectId);
  return res;
}

export async function deleteCommentAction(input: z.input<typeof deleteCommentSchema>) {
  const res = await runAction(deleteCommentSchema, input, (ctx, { id }) => commentsService.delete(ctx, id));
  if (res.ok) revalidateProject(res.data.projectId);
  return res;
}

/** Read path for the dialog thread (no revalidation). */
export async function listCommentsAction(input: z.input<typeof listCommentsSchema>) {
  return runAction(listCommentsSchema, input, (ctx, i) => commentsService.listForEntity(ctx, i));
}
