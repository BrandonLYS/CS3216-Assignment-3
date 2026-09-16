"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction } from "@/server/core/action";
import { revalidateProject } from "@/server/core/revalidate";
import { memoryService } from "./service";

/** Empty projectId means the Profile. Only the User writes through here; Reflection has its own path. */
const formSchema = z.object({
  projectId: z.string().transform((v) => v || null),
  body: z.string(),
});

export async function saveMemoryAction(fd: FormData) {
  let projectId: string | null = null;
  const res = await runAction(formSchema, fd, (ctx, i) => {
    projectId = i.projectId;
    return memoryService.save(ctx, { ...i, author: "user" });
  });
  if (res.ok) {
    if (projectId) revalidateProject(projectId);
    else revalidatePath("/settings");
  }
  return res;
}
