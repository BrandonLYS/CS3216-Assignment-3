import { redirect } from "next/navigation";
import { getParticipantSession } from "@/server/auth/participant-session";
import { getSession } from "@/server/auth/session";
import { projectsRepo } from "@/server/modules/projects/repository";
import { db } from "@/server/db/client";
import { notFound } from "next/navigation";
import { ParticipantLoginForm } from "@/features/messaging/participant-login-form";

export const metadata = { title: "Messages sign in" };

/**
 * The messaging login (ADR 0009). It is per Project because a Person's credentials are, so the
 * Project is in the path rather than guessed from the address typed into the form.
 */
export default async function ParticipantLoginPage({ params }: PageProps<"/m/[projectId]/login">) {
  const { projectId } = await params;
  const project = await projectsRepo.findName(db, projectId);
  if (!project) notFound();

  const session = await getParticipantSession();
  if (session?.projectId === projectId) redirect(`/projects/${projectId}/messages`);
  // A PM who is already signed in keeps their own session; nothing here would work for them.
  if (await getSession()) redirect(`/projects/${projectId}/messages`);

  return <ParticipantLoginForm projectId={projectId} projectName={project.name} />;
}
