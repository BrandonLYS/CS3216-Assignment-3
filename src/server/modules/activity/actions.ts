"use server";

import type { z } from "zod";
import { runAction } from "@/server/core/action";
import { activityService } from "./service";
import { listEntityHistorySchema } from "./validation";

/** Read path for the dialog History tab (no revalidation). */
export async function listEntityHistoryAction(input: z.input<typeof listEntityHistorySchema>) {
  return runAction(listEntityHistorySchema, input, (ctx, i) => activityService.listEntityHistory(ctx, i));
}
