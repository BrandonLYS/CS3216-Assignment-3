"use server";

import type { z } from "zod";
import { runAction } from "@/server/core/action";
import { revalidateProject } from "@/server/core/revalidate";
import { messagingService } from "./service";
import { postMessageSchema } from "./validation";

export async function postMessageAction(input: z.input<typeof postMessageSchema>) {
  const res = await runAction(postMessageSchema, input, (ctx, i) => messagingService.postMessage(ctx, i));
  // Revalidating the Project subtree is what puts the new Chat Message on the page; issue #59
  // replaces this round trip with a live stream.
  if (res.ok) revalidateProject(res.data.projectId);
  return res;
}
