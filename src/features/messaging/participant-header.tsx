"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { participantSignOutAction } from "@/server/modules/messaging/participants/actions";
import { Button } from "@/shared/ui";
import { Logo } from "@/shared/ui/logo";

/**
 * The Participant surface has no PrismPM shell (ADR 0009), so the one thing that would
 * otherwise live there - which Project this is, who you are, and how to leave - lives here.
 */
export function ParticipantHeader({
  projectId,
  projectName,
  personName,
}: {
  projectId: string;
  projectName: string;
  personName: string;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  return (
    <header className="flex shrink-0 items-center gap-2 border-b border-hairline px-5 py-2.5">
      <Logo className="size-4" />
      <span className="text-body-sm font-medium text-ink">{projectName}</span>
      <span className="text-caption text-ink-tertiary">Messages</span>
      <span className="ml-auto text-caption text-ink-subtle">{personName}</span>
      <Button
        size="sm"
        variant="ghost"
        loading={pending}
        onClick={async () => {
          setPending(true);
          await participantSignOutAction();
          // Back to the messaging login of this Project, not `/login`: that form authenticates
          // a User against better-auth, and a Person's credentials would simply fail there.
          router.replace(`/m/${projectId}/login`);
        }}
      >
        Sign out
      </Button>
    </header>
  );
}
