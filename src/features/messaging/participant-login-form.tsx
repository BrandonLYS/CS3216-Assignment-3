"use client";

import { useRouter } from "next/navigation";
import { participantLoginAction } from "@/server/modules/messaging/participants/actions";
import { ActionForm, TextField } from "@/shared/ui";

/**
 * A Person signing in to the messages of one Project. The action sets the cookie and returns;
 * navigating here rather than redirecting inside it is what AGENTS.md requires of an action
 * called from a client component.
 */
export function ParticipantLoginForm({ projectId, projectName }: { projectId: string; projectName: string }) {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-card-title font-medium">Sign in to {projectName}</h1>
        <p className="mt-1 text-caption text-ink-subtle">Messages only. Use the email your invite was sent to.</p>
      </div>
      <ActionForm
        action={participantLoginAction}
        hidden={{ projectId }}
        submitLabel="Sign in"
        onSuccess={() => {
          router.replace(`/projects/${projectId}/messages`);
          router.refresh();
        }}
      >
        <TextField name="email" label="Email" type="email" required autoComplete="email" />
        <TextField name="password" label="Password" type="password" required autoComplete="current-password" />
      </ActionForm>
    </div>
  );
}
