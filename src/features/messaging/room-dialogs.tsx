"use client";

import { Copy, Link2 } from "lucide-react";
import * as React from "react";
import { addParticipantAction, createRoomAction } from "@/server/modules/messaging/actions";
import { createInviteAction } from "@/server/modules/messaging/participants/actions";
import { fmtDateTime } from "@/shared/lib/dates";
import { ActionForm, Badge, Button, Dialog, Field, SelectField, TextField } from "@/shared/ui";
import type { RoomListItem } from "./messages-view";

/** One Person of the Project, with the state of their messaging login. */
export type RosterPerson = {
  id: string;
  name: string;
  email: string | null;
  state: "none" | "invited" | "active";
  inviteExpiresAt: Date | null;
};

const STATE_LABEL: Record<RosterPerson["state"], string> = {
  none: "No invite",
  invited: "Invited",
  active: "Can sign in",
};

/**
 * The PM creates every Room (issue #54), and chooses who is in it as part of creating it: the
 * service admits the People in the same transaction, so a Room never exists with nobody in it.
 */
export function NewRoomDialog({
  open,
  onClose,
  projectId,
  roster,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  roster: RosterPerson[];
}) {
  const [type, setType] = React.useState<"group" | "one_to_one">("group");
  return (
    <Dialog open={open} onClose={onClose} title="New room">
      <ActionForm
        // Remounted per opening, so a cancelled draft never reappears.
        key={open ? "open" : "closed"}
        action={createRoomAction}
        hidden={{ projectId }}
        submitLabel="Create room"
        cancel={onClose}
        onSuccess={onClose}
      >
        <SelectField
          name="type"
          label="Type"
          value={type}
          onChange={(e) => setType(e.target.value as "group" | "one_to_one")}
          options={[
            { value: "group", label: "Group" },
            { value: "one_to_one", label: "Direct message" },
          ]}
        />
        {type === "group" ? (
          <>
            <TextField name="name" label="Name" required autoFocus placeholder="Launch readiness" />
            <PeopleChecklist roster={roster} />
          </>
        ) : (
          // A one-to-one Room is the PM and exactly one Person, and is named by that Person,
          // so it takes no name field.
          <SelectField
            name="personIds"
            label="Person"
            required
            placeholder="Choose a person"
            options={roster.map((p) => ({ value: p.id, label: p.name }))}
          />
        )}
      </ActionForm>
    </Dialog>
  );
}

/** Repeated `personIds` inputs; `formToObject` turns them into the array the schema expects. */
function PeopleChecklist({ roster }: { roster: RosterPerson[] }) {
  return (
    <Field label="People">
      {roster.length === 0 ? (
        <p className="text-caption text-ink-subtle">Add People to this project first.</p>
      ) : (
        <ul className="max-h-56 overflow-y-auto rounded-md border border-hairline">
          {roster.map((p) => (
            <li key={p.id} className="border-b border-hairline/60 last:border-0">
              <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-body-sm text-ink hover:bg-surface-1">
                <input type="checkbox" name="personIds" value={p.id} className="size-3.5 accent-current" />
                <span className="truncate">{p.name}</span>
                <span className="ml-auto text-caption text-ink-tertiary">{STATE_LABEL[p.state]}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </Field>
  );
}

/**
 * Who is in this Room, who else could be, and the invite link that lets any of them sign in.
 * The link is shown once: only its hash is stored (ADR 0009), exactly as an API token is.
 */
export function RoomPeopleDialog({
  open,
  onClose,
  projectId,
  item,
  roster,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  item: RoomListItem;
  roster: RosterPerson[];
}) {
  const [fresh, setFresh] = React.useState<{ personId: string; url: string } | null>(null);
  const inRoom = new Set(item.participants.map((p) => p.personId));
  const outside = roster.filter((p) => !inRoom.has(p.id));
  const full = item.room.type === "one_to_one";

  return (
    <Dialog open={open} onClose={onClose} title="People in this room">
      <div className="flex flex-col gap-4">
        <ul className="flex flex-col gap-1">
          {item.participants.map((p) => {
            const person = roster.find((r) => r.id === p.personId);
            return (
              <li key={p.personId} className="flex items-center gap-2 rounded-md px-1 py-1.5">
                <span className="truncate text-body-sm text-ink">{p.name}</span>
                {person && (
                  <Badge className={person.state === "active" ? "text-tag-green" : undefined}>
                    {STATE_LABEL[person.state]}
                  </Badge>
                )}
                {person?.state === "invited" && person.inviteExpiresAt && (
                  <span className="text-caption text-ink-tertiary">expires {fmtDateTime(person.inviteExpiresAt)}</span>
                )}
                <InviteButton
                  projectId={projectId}
                  person={person}
                  onLink={(url) => setFresh({ personId: p.personId, url })}
                />
              </li>
            );
          })}
        </ul>

        {fresh && (
          <div role="status" className="rounded-md border border-hairline-strong bg-surface-2 p-3">
            <p className="text-caption text-ink-subtle">
              Send this link to {roster.find((r) => r.id === fresh.personId)?.name}. It is shown once and can be used
              once.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 truncate font-mono text-mono text-ink">{fresh.url}</code>
              <Button size="sm" onClick={() => void navigator.clipboard.writeText(fresh.url)}>
                <Copy className="size-3" /> Copy
              </Button>
            </div>
          </div>
        )}

        {full ? (
          <p className="text-caption text-ink-subtle">A direct message holds one Person and cannot take another.</p>
        ) : outside.length === 0 ? (
          <p className="text-caption text-ink-subtle">Everyone in this project is already here.</p>
        ) : (
          <ActionForm
            action={addParticipantAction}
            hidden={{ projectId, roomId: item.room.id }}
            submitLabel="Add to room"
          >
            <SelectField
              name="personId"
              label="Add someone"
              required
              placeholder="Choose a person"
              options={outside.map((p) => ({ value: p.id, label: p.name }))}
            />
          </ActionForm>
        )}
      </div>
    </Dialog>
  );
}

/**
 * Generating a link is a write, so it goes through the action rather than a fetch; it is a
 * button and not an `ActionForm` because it has no fields and must render once per Person.
 */
function InviteButton({
  projectId,
  person,
  onLink,
}: {
  projectId: string;
  person: RosterPerson | undefined;
  onLink: (url: string) => void;
}) {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (!person) return null;
  const label = person.state === "none" ? "Invite link" : "New link";

  return (
    <span className="ml-auto flex items-center gap-2">
      {error && <span className="text-caption text-tag-red">{error}</span>}
      <Button
        size="sm"
        loading={pending}
        disabled={!person.email}
        title={person.email ? undefined : "This person needs an email address first"}
        onClick={async () => {
          setPending(true);
          setError(null);
          const res = await createInviteAction({ projectId, personId: person.id });
          setPending(false);
          if (res.ok) onLink(res.data.url);
          else setError(res.error);
        }}
      >
        <Link2 className="size-3" /> {label}
      </Button>
    </span>
  );
}
