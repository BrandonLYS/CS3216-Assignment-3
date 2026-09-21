"use client";

import Link from "next/link";
import { MessagesSquare, Send } from "lucide-react";
import * as React from "react";
import { postMessageAction } from "@/server/modules/messaging/actions";
import type { RoomParticipantItem } from "@/server/modules/messaging/repository";
import type { RoomMessageRow, RoomRow } from "@/server/modules/messaging/schema";
import { fmtDateTime, relative } from "@/shared/lib/dates";
import { cn } from "@/shared/lib/cn";
import { Button, Field, Textarea } from "@/shared/ui";
import { EmptyState } from "@/shared/ui/page-header";
import { Avatar } from "@/entities/person/avatar";

export type RoomListItem = { room: RoomRow; participants: RoomParticipantItem[] };

/**
 * A one-to-one Room carries no name and is known by the Person in it; the PM is never a
 * Participant, so the sole Participant is the other side. Deliberately not the service's
 * `roomLabel`: that one names an Activity Event and knows nothing about Participants, and
 * importing it here would pull the whole server module into the browser bundle.
 */
function labelOf({ room, participants }: RoomListItem) {
  return room.name ?? participants[0]?.name ?? "Direct message";
}

/**
 * The line under a Room's name. A one-to-one Room is already named after its Person, so
 * repeating that name would say the same thing twice.
 */
function subtitleOf({ room, participants }: RoomListItem) {
  if (!room.name) return "Direct message";
  return participants.length ? participants.map((p) => p.name).join(", ") : "No participants yet";
}

export function MessagesView({
  projectId,
  rooms,
  selected,
  messages,
  currentUserId,
}: {
  projectId: string;
  rooms: RoomListItem[];
  selected: RoomListItem | null;
  /** Newest first, as the keyset page returns them. */
  messages: RoomMessageRow[];
  currentUserId: string;
}) {
  const base = `/projects/${projectId}/messages`;
  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex w-72 shrink-0 flex-col border-r border-hairline">
        <p className="px-4 py-2 text-caption text-ink-subtle">
          {rooms.length} room{rooms.length === 1 ? "" : "s"}
        </p>
        <ul className="flex-1 overflow-y-auto border-t border-hairline">
          {rooms.map((item) => {
            const active = item.room.id === selected?.room.id;
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
                  <span className="truncate text-body-sm text-ink">{labelOf(item)}</span>
                  <span className="truncate text-caption text-ink-tertiary">{subtitleOf(item)}</span>
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
            description="Rooms are created by you and hold the People you admit to them."
          />
        ) : (
          <Room key={selected.room.id} projectId={projectId} item={selected} messages={messages} me={currentUserId} />
        )}
      </div>
    </div>
  );
}

function Room({
  projectId,
  item,
  messages,
  me,
}: {
  projectId: string;
  item: RoomListItem;
  messages: RoomMessageRow[];
  me: string;
}) {
  const scroller = React.useRef<HTMLDivElement>(null);
  // Newest last is the reading order of a chat; the copy keeps the prop array untouched.
  const ordered = React.useMemo(() => [...messages].reverse(), [messages]);

  // A chat opens at its newest Chat Message, and returns there when one is sent.
  React.useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [item.room.id, ordered.length]);

  return (
    <>
      <div className="flex shrink-0 items-baseline gap-2 border-b border-hairline px-5 py-3">
        <h2 className="text-body font-medium text-ink">{labelOf(item)}</h2>
        <p className="truncate text-caption text-ink-tertiary">{subtitleOf(item)}</p>
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
                    {m.authorUserId === me && <span className="text-caption text-ink-tertiary">You</span>}
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

      <Composer projectId={projectId} roomId={item.room.id} />
    </>
  );
}

function Composer({ projectId, roomId }: { projectId: string; roomId: string }) {
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
    const res = await postMessageAction({ projectId, roomId, text });
    if (!mounted.current) return;
    setPending(false);
    if (!res.ok) {
      // Keep the draft: the PM should be able to fix and retry, not retype.
      setError(res.error);
      setFieldErrors(res.fieldErrors ?? {});
      return;
    }
    setText("");
    box.current?.focus();
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
