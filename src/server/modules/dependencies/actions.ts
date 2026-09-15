"use server";

import { z } from "zod";
import { runAction } from "@/server/core/action";
import { revalidateProject } from "@/server/core/revalidate";
import { createDependencySchema, dependenciesService } from "./service";

export async function createDependencyAction(input: z.input<typeof createDependencySchema>) {
  const res = await runAction(createDependencySchema, input, (ctx, i) => dependenciesService.create(ctx, i));
  if (res.ok) revalidateProject(res.data.projectId);
  return res;
}

export async function deleteDependencyAction(input: { id: string; projectId: string }) {
  const res = await runAction(z.object({ id: z.string() }), input, (ctx, { id }) =>
    dependenciesService.delete(ctx, id),
  );
  if (res.ok) revalidateProject(input.projectId);
  return res;
}
