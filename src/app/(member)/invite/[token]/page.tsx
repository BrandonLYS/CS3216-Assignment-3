import Link from "next/link";
import { participantsService } from "@/server/modules/messaging/participants/service";
import { AcceptInviteForm } from "@/features/messaging/accept-invite-form";

export const metadata = { title: "Accept your invite" };

/**
 * The single-use invite link a PM hands out. The token resolves the Person and the Project by
 * itself, so the URL carries nothing else, and an expired or spent link is indistinguishable
 * from one that never existed.
 */
export default async function AcceptInvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const invite = await participantsService.invitee(token);

  if (!invite) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-card-title font-medium">This link is no longer valid</h1>
        <p className="text-body-sm text-ink-subtle">
          An invite can be used once and expires after seven days. Ask the project manager for a new one.
        </p>
        <Link href="/login" className="text-caption text-ink hover:text-primary-hover">
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <AcceptInviteForm
      token={token}
      personName={invite.person.name}
      projectName={invite.project.name}
      projectId={invite.project.id}
    />
  );
}
