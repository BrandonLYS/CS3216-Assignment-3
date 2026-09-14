import { revalidatePath } from "next/cache";

/** All project-scoped pages read from the same data, so invalidate the whole project subtree. */
export function revalidateProject(projectId: string) {
  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/", "layout");
}
