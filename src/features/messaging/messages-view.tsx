"use client";

import Link from "next/link";
import { ArrowUp, MessagesSquare, Plus, Send, Users } from "lucide-react";
import * as React from "react";
import {
  olderMessagesAction,
  participantOlderMessagesAction,
  participantPostMessageAction,
  postMessageAction,
} from "@/server/modules/messaging/actions";
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
  hasMore,
  viewer,
}: {
  projectId: string;
  rooms: RoomListItem[];
  selected: RoomListItem | null;
  /** The newest page, newest first; `Room` merges the older pages it loads into it (#60). */
  messages: RoomMessageRow[];
  /** Whether the Room has history older than that page. */
  hasMore: boolean;
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
          <Room
            key={selected.room.id}
            projectId={projectId}
            item={selected}
            messages={messages}
            hasMore={hasMore}
            viewer={viewer}
          />
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
  hasMore: hasMoreOnServer,
  viewer,
}: {
  projectId: string;
  item: RoomListItem;
  messages: RoomMessageRow[];
  hasMore: boolean;
  viewer: MessagesViewer;
}) {
  const scroller = React.useRef<HTMLDivElement>(null);
  const [people, setPeople] = React.useState(false);
  const history = useRoomHistory({ projectId, roomId: item.room.id, page: messages, hasMoreOnServer, viewer });
  // Newest last is the reading order of a chat; the copy keeps the state array untouched.
  const ordered = React.useMemo(() => [...history.messages].reverse(), [history.messages]);

  // A chat opens at its newest Chat Message, and returns there when one is sent. Keyed on the
  // newest id, not the count: a full page stays 50 rows long, so the count would stop changing.
  // A prepend does not change it either, which is what stops loading older history from
  // throwing the reader back to the bottom.
  //
  // Applied again on the next frame: on first load the effect runs before the browser has
  // finished laying the history out, and a single assignment leaves the pane at the top. That
  // was survivable when the pane only ever held one page; now it means the sentinel below is
  // on screen at once and the reader is handed the entire Room without asking.
  const newestId = ordered.at(-1)?.id;
  React.useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const toNewest = () => {
      el.scrollTop = el.scrollHeight;
    };
    toNewest();
    const frame = requestAnimationFrame(toNewest);
    return () => cancelAnimationFrame(frame);
  }, [item.room.id, newestId]);

  /**
   * Hold the reader's place across a prepend. The distance from the bottom is the anchor,
   * measured before the new rows exist and restored in the same commit that adds them.
   *
   * `keepInView` is for the button: a history shorter than the pane sits at the bottom with
   * nothing scrolled, so restoring the distance from the bottom would leave the loaded block
   * out of sight above the reader and the click would look like it did nothing. Then the
   * Chat Message they were reading goes to the top of the pane instead.
   */
  const anchor = React.useRef<{ distanceFromBottom: number; oldestId: string; keepInView: boolean } | null>(null);
  const load = history.loadOlder;
  const oldestId = history.messages.at(-1)?.id;
  const loadOlder = React.useCallback(
    async ({ keepInView = false } = {}) => {
      const el = scroller.current;
      if (el && oldestId) {
        anchor.current = { distanceFromBottom: el.scrollHeight - el.scrollTop, oldestId, keepInView };
      }
      await load();
    },
    [load, oldestId],
  );

  /**
   * Scrolling back to the top asks for the next page. A scroll listener rather than an
   * `IntersectionObserver` on a sentinel: after a prepend the browser keeps `scrollTop`, so
   * the reader is momentarily at the top of the new block, and the observer - which reports
   * on the frame that was painted - fires again on that intermediate state and walks the
   * whole Room in one gesture. A listener reads the position as it is now, after the anchor
   * below has put the reader back where they were.
   */
  React.useEffect(() => {
    const el = scroller.current;
    if (!el || !history.hasMore) return;
    // Fires a little before the very top, so the next page is on its way by the time the
    // reader gets there. The button above stays for the keyboard, and for retrying a page
    // that failed - which is also when it is on screen long enough to be read.
    const onScroll = () => {
      if (el.scrollTop <= 200) void loadOlder();
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [history.hasMore, loadOlder]);

  React.useLayoutEffect(() => {
    const held = anchor.current;
    const el = scroller.current;
    if (!held || !el) return;
    anchor.current = null;
    const previouslyOldest = el.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(held.oldestId)}"]`);
    if (held.keepInView && previouslyOldest) {
      el.scrollTop += previouslyOldest.getBoundingClientRect().top - el.getBoundingClientRect().top;
      return;
    }
    el.scrollTop = el.scrollHeight - held.distanceFromBottom;
  }, [history.messages]);

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
            <Older history={history} onLoad={loadOlder} />
            {ordered.map((m) => (
              <li key={m.id} data-message-id={m.id} className="flex gap-2.5">
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

type RoomHistory = ReturnType<typeof useRoomHistory>;

/** Newest first, `(createdAt, id)` descending - the order the keyset read returns and pages by. */
const newestFirst = (a: RoomMessageRow, b: RoomMessageRow) =>
  b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

/**
 * Union by id. A Chat Message is never edited and never deleted (ADR 0009), so a merge never
 * has to remove or replace a row, which is what makes this safe to run on every render pass.
 */
function merge(current: RoomMessageRow[], incoming: RoomMessageRow[]) {
  const known = new Set(current.map((m) => m.id));
  if (incoming.every((m) => known.has(m.id))) return current;
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort(newestFirst);
}

/**
 * The history the pane shows: the newest page the route rendered, plus every older page the
 * reader has pulled in (issue #60).
 *
 * The route's page is merged rather than adopted. It is re-rendered whenever a Chat Message is
 * posted, and it only ever describes the newest 50, so replacing would throw away the older
 * pages - and, in a Room busy enough to push one out of that window, leave a hole.
 */
function useRoomHistory({
  projectId,
  roomId,
  page,
  hasMoreOnServer,
  viewer,
}: {
  projectId: string;
  roomId: string;
  page: RoomMessageRow[];
  hasMoreOnServer: boolean;
  viewer: MessagesViewer;
}) {
  const [messages, setMessages] = React.useState(page);
  const [hasMore, setHasMore] = React.useState(hasMoreOnServer);
  const [loadedOlder, setLoadedOlder] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [seenPage, setSeenPage] = React.useState(page);

  // Adjusting state while rendering, rather than in an effect: React re-runs this component
  // before touching the DOM, so the merged history is what paints, with no second pass.
  if (page !== seenPage) {
    setSeenPage(page);
    setMessages((current) => merge(current, page));
    // The prop may narrow this and never widen it: it describes the newest page, so it is
    // `true` again after every post, while a reader who has reached the first Chat Message of
    // the Room has nothing left to load.
    setHasMore((current) => current && hasMoreOnServer);
  }
  // One request at a time: the button and the observer call the same function, and the
  // observer keeps firing while the sentinel is on screen.
  const inFlight = React.useRef(false);
  // A Room switch unmounts this; never set state on the way out.
  const mounted = React.useRef(true);

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /**
   * Fetch the page before the oldest Chat Message on screen. Scrolling is the caller's: it
   * owns the pane, and holds the reader's place in a layout effect on `messages`.
   */
  const loadOlder = React.useCallback(async () => {
    const oldest = messages.at(-1);
    if (!oldest || !hasMore || inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    const ask = viewer.kind === "pm" ? olderMessagesAction : participantOlderMessagesAction;
    try {
      const res = await ask({ projectId, roomId, before: { createdAt: oldest.createdAt, id: oldest.id } });
      if (!mounted.current) return;
      if (!res.ok) {
        // The button stays, and so does `hasMore`: a failed page must be retryable.
        setError(res.error);
        return;
      }
      setMessages((current) => merge(current, res.data.items));
      setHasMore(res.data.hasMore);
      setLoadedOlder(true);
    } catch {
      if (!mounted.current) return;
      setError("Older messages could not be loaded. Try again.");
    } finally {
      inFlight.current = false;
      if (mounted.current) setLoading(false);
    }
  }, [hasMore, messages, projectId, roomId, viewer.kind]);

  return { messages, hasMore, loadedOlder, loading, error, loadOlder };
}

/**
 * The top of the history: the button that asks for the page before it, and the end of the
 * Room once there is nothing left. Scrolling back asks for the same thing without the click.
 */
function Older({
  history,
  onLoad,
}: {
  history: RoomHistory;
  onLoad: (opts?: { keepInView?: boolean }) => Promise<void>;
}) {
  const { hasMore, loadedOlder, loading, error } = history;

  // Once the reader has pulled a page, say where the history ends. Without it the button
  // simply vanishes, and "that is everything" looks the same as "that failed".
  if (!hasMore) {
    return loadedOlder ? <li className="pb-1 text-center text-caption text-ink-tertiary">Start of the room</li> : null;
  }
  return (
    <li className="flex flex-col items-center gap-1 pb-1">
      <Button size="sm" loading={loading} onClick={() => void onLoad({ keepInView: true })}>
        <ArrowUp className="size-3.5" /> Load older messages
      </Button>
      {error && <p className="text-caption text-tag-red">{error}</p>}
    </li>
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
