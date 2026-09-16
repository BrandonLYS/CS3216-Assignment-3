"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction } from "@/server/core/action";
import { requiredText } from "@/server/core/validation";
import { apiTokensService } from "./service";

/** Returns the raw token exactly once; the row only ever holds its hash. */
export async function createApiTokenAction(fd: FormData) {
  const res = await runAction(z.object({ label: requiredText("Label", 80) }), fd, async (ctx, { label }) => {
    const { token, row } = await apiTokensService.create(ctx, label);
    return { token, id: row.id };
  });
  if (res.ok) revalidatePath("/settings");
  return res;
}

export async function revokeApiTokenAction(fd: FormData) {
  const res = await runAction(z.object({ id: z.string() }), fd, (ctx, { id }) => apiTokensService.revoke(ctx, id));
  if (res.ok) revalidatePath("/settings");
  return res;
}
