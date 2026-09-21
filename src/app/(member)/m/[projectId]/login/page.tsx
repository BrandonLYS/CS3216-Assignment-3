import { notFound, redirect } from "next/navigation";
import { getParticipantSession } from "@/server/auth/participant-session";
import { getSession } from "@/server/auth/session";
import { participantsService } from "@/server/modules/messaging/participants/service";
import { ParticipantLoginForm } from "@/features/messaging/participant-login-form";

export const metadata = { title: "Messages sign in" };

/**
 * The messaging login (ADR 0009). It is per Project because a Person's credentials are, so the
 * Project is in the path rather than guessed from the address typed into the form.
 */
export default async function ParticipantLoginPage({ params }: PageProps<"/m/[projectId]/login">) {
  const { projectId } = await params;
  const project = await participantsService.loginContext(projectId);
  if (!project) notFound();

  // A PM who is already signed in keeps their own session; nothing here would work for them.
  if (await getSession()) redirect(`/projects/${projectId}/messages`);
  const session = await getParticipantSession();
  // Only a session that still names a real Person of this Project is sent on. A Person deleted
  // since they signed in would otherwise bounce between this page and a messages page that
  // cannot load, with no way to sign in again.
  if (session?.projectId === projectId && (await participantsService.sessionPerson(session))) {
    redirect(`/projects/${projectId}/messages`);
  }

  return <ParticipantLoginForm projectId={projectId} projectName={project.name} />;
}
