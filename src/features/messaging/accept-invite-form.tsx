"use client";

import { useRouter } from "next/navigation";
import { acceptInviteAction } from "@/server/modules/messaging/participants/actions";
import { PARTICIPANT_PASSWORD_MIN } from "@/server/modules/messaging/participants/validation";
import { ActionForm, TextField } from "@/shared/ui";

/**
 * Accepting an invite is where a Person chooses their own password; the PM never sets or sees
 * one (ADR 0009). Success signs them straight in, because the action set the cookie.
 */
export function AcceptInviteForm({
  token,
  personName,
  projectName,
  projectId,
}: {
  token: string;
  personName: string;
  projectName: string;
  projectId: string;
}) {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-card-title font-medium">Welcome, {personName}</h1>
        <p className="mt-1 text-caption text-ink-subtle">
          Choose a password to read and follow the messages of {projectName}.
        </p>
      </div>
      <ActionForm
        action={acceptInviteAction}
        hidden={{ token }}
        submitLabel="Set password and continue"
        onSuccess={() => {
          router.replace(`/projects/${projectId}/messages`);
          router.refresh();
        }}
      >
        <TextField
          name="password"
          label="Password"
          type="password"
          required
          autoFocus
          minLength={PARTICIPANT_PASSWORD_MIN}
          autoComplete="new-password"
          hint={`At least ${PARTICIPANT_PASSWORD_MIN} characters`}
        />
        <TextField name="confirm" label="Confirm password" type="password" required autoComplete="new-password" />
      </ActionForm>
    </div>
  );
}
