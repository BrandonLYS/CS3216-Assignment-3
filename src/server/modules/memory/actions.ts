"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/server/core/action";
import { revalidateProject } from "@/server/core/revalidate";
import { memoryService } from "./service";
import { saveMemorySchema } from "./validation";

/** Saves a Profile (no projectId) or Working Memory version written by the User; Restore reuses it with an old body. */
export async function saveMemoryAction(fd: FormData) {
  const projectId = String(fd.get("projectId") || "") || null;
  const res = await runAction(
    saveMemorySchema.omit({ author: true, conversationId: true, throughMessageId: true }),
    fd,
    (ctx, i) => memoryService.save(ctx, { ...i, projectId, author: "user" }),
  );
  if (res.ok) {
    if (projectId) revalidateProject(projectId);
    else revalidatePath("/settings");
  }
  return res;
}
