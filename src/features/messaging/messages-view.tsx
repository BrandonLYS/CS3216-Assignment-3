"use client";

import Link from "next/link";
import { MessagesSquare, Plus, Send, Users } from "lucide-react";
import * as React from "react";
import { participantPostMessageAction, postMessageAction } from "@/server/modules/messaging/actions";
import type { ActionResult } from "@/server/core/action";
import type { RoomMessageRow, RoomRow } from "@/server/modules/messaging/schema";
import { fmtDateTime, relative } from "@/shared/lib/dates";
import { cn } from "@/shared/lib/cn";
import { Button, Field, Textarea } from "@/shared/ui";
import { EmptyState } from "@/shared/ui/page-header";
import { Avatar } from "@/entities/person/avatar";
import { NewRoomDialog, RoomPeopleDialog, type RosterPerson } from "./room-dialogs";

/**
 * Only what the pane renders. Narrower than `RoomParticipantItem` on purpose: a Participant is
 * served the same component and must not be handed anyone's login email.
 */
export type RoomPerson = { personId: string; name: string };
export type RoomListItem = { room: RoomRow; participants: RoomPerson[] };

/**
 * Who is looking (ADR 0009). The PM creates Rooms and admits People; a Participant reads and
 * writes in the Rooms they were admitted to, and does nothing else.
 */
export type MessagesViewer =
  { kind: "pm"; userId: string; roster: RosterPerson[] } | { kind: "participant"; personId: string };

/** Whoever the reader is, they are never their own company; the PM is not a Person at all. */
const others = (participants: RoomPerson[], viewer: MessagesViewer) =>
  viewer.kind === "pm" ? participants : participants.filter((p) => p.personId !== viewer.personId);

/**
 * A one-to-one Room carries no name and is known by the Person in it; the PM is never a
 * Participant, so the sole Participant is the other side. The Participant on the other side
 * of that Room sees "Direct message", because the only Person in it is themselves and the PM
 * has no Person row to be named by. Deliberately not the service's `roomLabel`: that one
 * names an Activity Event and knows nothing about Participants, and importing it here would
 * pull the whole server module into the browser bundle.
 */
function labelOf({ room, participants }: RoomListItem, viewer: MessagesViewer) {
  return room.name ?? others(participants, viewer)[0]?.name ?? "Direct message";
}

/**
 * The line under a Room's name, or nothing when it would only repeat it. A one-to-one Room is
 * already named after its Person, so the subtitle says what kind of Room it is instead - and
 * for the Person on the other side of it, whose own name is not the label, that is what the
 * label already says.
 */
function subtitleOf({ room, participants }: RoomListItem, viewer: MessagesViewer) {
  const rest = others(participants, viewer);
  if (rest.length) return room.name ? rest.map((p) => p.name).join(", ") : "Direct message";
  // Nobody else to name. To the PM that is a Room with no Person in it yet; to a Participant
  // it is a Room holding them and the PM, which is not empty and which the label already
  // describes. Only the PM is told a Room is waiting for someone.
  return viewer.kind === "pm" && room.name ? "No participants yet" : null;
}

export function MessagesView({
  projectId,
  rooms,
  selected,
  messages,
  viewer,
}: {
  projectId: string;
  rooms: RoomListItem[];
  selected: RoomListItem | null;
  /** Newest first, as the keyset page returns them. */
  messages: RoomMessageRow[];
  viewer: MessagesViewer;
}) {
  const [newRoom, setNewRoom] = React.useState(false);
  const base = `/projects/${projectId}/messages`;
  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex w-72 shrink-0 flex-col border-r border-hairline">
        <div className="flex items-center justify-between gap-2 px-4 py-2">
          <p className="text-caption text-ink-subtle">
            {rooms.length} room{rooms.length === 1 ? "" : "s"}
          </p>
          {viewer.kind === "pm" && (
            <Button size="sm" variant="primary" onClick={() => setNewRoom(true)}>
              <Plus className="size-3.5" /> New room
            </Button>
          )}
        </div>
        <ul className="flex-1 overflow-y-auto border-t border-hairline">
          {rooms.map((item) => {
            const active = item.room.id === selected?.room.id;
            const subtitle = subtitleOf(item, viewer);
            return (
              <li key={item.room.id}>
                <Link
                  href={`${base}?room=${item.room.id}`}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "flex flex-col gap-0.5 border-b border-hairline/60 px-4 py-2.5 transition-colors hover:bg-surface-1",
                    active && "bg-surface-2",
                  )}
                >
                  <span className="truncate text-body-sm text-ink">{labelOf(item, viewer)}</span>
                  {subtitle && <span className="truncate text-caption text-ink-tertiary">{subtitle}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {!selected ? (
          <EmptyState
            icon={<MessagesSquare />}
            title="No rooms yet"
            description={
              viewer.kind === "pm"
                ? "Create a room and choose the People in it."
                : "You have not been added to a room yet."
            }
          />
        ) : (
          <Room key={selected.room.id} projectId={projectId} item={selected} messages={messages} viewer={viewer} />
        )}
      </div>

      {viewer.kind === "pm" && (
        <NewRoomDialog open={newRoom} onClose={() => setNewRoom(false)} projectId={projectId} roster={viewer.roster} />
      )}
    </div>
  );
}

function Room({
  projectId,
  item,
  messages,
  viewer,
}: {
  projectId: string;
  item: RoomListItem;
  messages: RoomMessageRow[];
  viewer: MessagesViewer;
}) {
  const scroller = React.useRef<HTMLDivElement>(null);
  const [people, setPeople] = React.useState(false);
  // Newest last is the reading order of a chat; the copy keeps the prop array untouched.
  const ordered = React.useMemo(() => [...messages].reverse(), [messages]);

  // A chat opens at its newest Chat Message, and returns there when one is sent. Keyed on the
  // newest id, not the count: a full page stays 50 rows long, so the count would stop changing.
  const newestId = ordered.at(-1)?.id;
  React.useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [item.room.id, newestId]);

  const mine = (m: RoomMessageRow) =>
    viewer.kind === "pm" ? m.authorUserId === viewer.userId : m.authorPersonId === viewer.personId;

  const subtitle = subtitleOf(item, viewer);

  return (
    <>
      <div className="flex shrink-0 items-baseline gap-2 border-b border-hairline px-5 py-3">
        <h2 className="text-body font-medium text-ink">{labelOf(item, viewer)}</h2>
        {subtitle && <p className="truncate text-caption text-ink-tertiary">{subtitle}</p>}
        {viewer.kind === "pm" && (
          <Button size="sm" className="ml-auto shrink-0" onClick={() => setPeople(true)}>
            <Users className="size-3.5" /> People
          </Button>
        )}
      </div>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {ordered.length === 0 ? (
          <EmptyState icon={<MessagesSquare />} title="No messages yet" description="Say something to start." />
        ) : (
          // `justify-end` on a full-height column keeps a short history sitting on the
          // composer instead of floating at the top of an empty pane.
          <ol className="flex min-h-full flex-col justify-end gap-3">
            {ordered.map((m) => (
              <li key={m.id} className="flex gap-2.5">
                <Avatar name={m.authorName} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-caption font-medium text-ink">{m.authorName}</span>
                    {mine(m) && <span className="text-caption text-ink-tertiary">You</span>}
                    <span className="text-caption text-ink-tertiary" title={fmtDateTime(m.createdAt)}>
                      {relative(m.createdAt)}
                    </span>
                  </div>
                  <p className="text-body-sm break-words whitespace-pre-wrap text-ink">{m.text}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Both audiences write the same Chat Message; only the action behind it differs (#55). */}
      <Composer
        send={(text) =>
          viewer.kind === "pm"
            ? postMessageAction({ projectId, roomId: item.room.id, text })
            : participantPostMessageAction({ projectId, roomId: item.room.id, text })
        }
      />

      {viewer.kind === "pm" && (
        <RoomPeopleDialog
          open={people}
          onClose={() => setPeople(false)}
          projectId={projectId}
          item={item}
          roster={viewer.roster}
        />
      )}
    </>
  );
}

/**
 * `send` rather than the action itself: the PM and a Participant post the same Chat Message
 * through two actions behind two different seams, and the composer is indifferent to which.
 */
function Composer({ send: post }: { send: (text: string) => Promise<ActionResult<RoomMessageRow>> }) {
  const [text, setText] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});
  const box = React.useRef<HTMLTextAreaElement>(null);
  // A Room switch unmounts this component; never set state on the way out.
  const mounted = React.useRef(true);
  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function send() {
    if (!text.trim() || pending) return;
    setPending(true);
    setError(null);
    setFieldErrors({});
    const sent = text;
    try {
      const res = await post(sent);
      if (!mounted.current) return;
      if (!res.ok) {
        // Keep the draft: the writer should be able to fix and retry, not retype.
        setError(res.error);
        setFieldErrors(res.fieldErrors ?? {});
        return;
      }
      // Only what was sent is cleared. Anything typed while the request was in flight is a
      // new draft and must survive.
      setText((current) => (current === sent ? "" : current));
      box.current?.focus();
    } catch {
      // A rejected action (network loss, an unexpected server error) must not leave Send
      // disabled forever with nothing said.
      if (mounted.current) setError("Message could not be sent. Try again.");
    } finally {
      if (mounted.current) setPending(false);
    }
  }

  return (
    <div className="flex shrink-0 flex-col gap-2 border-t border-hairline px-5 py-3">
      <Field label="Message" error={fieldErrors.text?.[0]}>
        <Textarea
          ref={box}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Write a message. ⌘/Ctrl + Enter to send."
          className="min-h-16"
        />
      </Field>
      <div className="flex items-center gap-2">
        <Button type="button" variant="primary" size="sm" loading={pending} disabled={!text.trim()} onClick={send}>
          <Send className="size-3.5" /> Send
        </Button>
        {error && <p className="text-caption text-tag-red">{error}</p>}
      </div>
    </div>
  );
}
