"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUp, MessagesSquare, Plus, Send, Users } from "lucide-react";
import * as React from "react";
import {
  newerMessagesAction,
  olderMessagesAction,
  participantNewerMessagesAction,
  participantOlderMessagesAction,
  participantPostMessageAction,
  postMessageAction,
} from "@/server/modules/messaging/actions";
import type { ActionResult } from "@/server/core/action";
import type { RoomMessageRow, RoomRow } from "@/server/modules/messaging/schema";
import { MESSAGE_POLL_MS, MESSAGE_POLL_OVERLAP_MS } from "@/shared/domain";
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
  const history = useRoomHistory({
    projectId,
    roomId: item.room.id,
    roomCreatedAt: item.room.createdAt,
    page: messages,
    hasMoreOnServer,
    viewer,
  });
  /**
   * Whether the reader is at the newest Chat Message, and so whether an arriving one should
   * scroll into view. Once a Chat Message can arrive from someone else (issue #59), snapping
   * to the bottom unconditionally would tear a reader out of the history they scrolled back
   * into. Starts true because a Room opens at its newest Chat Message.
   */
  const pinned = React.useRef(true);
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
  //
  // Only while the reader is at the bottom, or has just sent something themselves: a Chat
  // Message that arrives from the other side of the Room while they are reading older
  // history must not move them (issue #59).
  const newestId = ordered.at(-1)?.id;
  React.useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !pinned.current) return;
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
    if (!el) return;
    // Fires a little before the very top, so the next page is on its way by the time the
    // reader gets there. The button above stays for the keyboard, and for retrying a page
    // that failed - which is also when it is on screen long enough to be read.
    const onScroll = () => {
      // Installed whatever `hasMore` says, because it also tracks whether an arriving Chat
      // Message may scroll the pane; the paging trigger below keeps its own check.
      pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < PINNED_WITHIN_PX;
      // A page already asked for arrives whenever the network says so, and the reader may
      // have moved on by then. Keep the anchor on where they are now, and stop treating a
      // request they started at the top as one to scroll back to it.
      if (anchor.current) {
        anchor.current = { ...anchor.current, distanceFromBottom: el.scrollHeight - el.scrollTop, keepInView: false };
      }
      if (history.hasMore && el.scrollTop <= 200) void loadOlder();
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

  /**
   * The writer's own Chat Message goes straight into the history the pane holds, which is
   * what replaces the Project revalidation these actions used to trigger (issue #59): the
   * one round trip they needed already returned the row.
   *
   * Sending also re-pins the pane. Writing from halfway up the history and not being shown
   * your own line is the one arrival that should always move the reader.
   */
  const send = async (text: string) => {
    const res =
      viewer.kind === "pm"
        ? await postMessageAction({ projectId, roomId: item.room.id, text })
        : await participantPostMessageAction({ projectId, roomId: item.room.id, text });
    if (res.ok) {
      pinned.current = true;
      history.receive(res.data);
    }
    return res;
  };

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
      <Composer send={send} />

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

/**
 * The tiebreak id of a catch-up cursor. The nil UUID sorts below every generated id, so a
 * Chat Message written in the cursor's own millisecond is included rather than skipped -
 * the cursor asks "from this instant", not "after this row".
 */
const FIRST_ID = "00000000-0000-0000-0000-000000000000";

/** Consecutive failures after which the pane stops asking until the tab is shown again. */
const POLL_GIVE_UP_AFTER = 5;

/** How close to the newest Chat Message still counts as reading the end of the Room. */
const PINNED_WITHIN_PX = 80;

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
  roomCreatedAt,
  page,
  hasMoreOnServer,
  viewer,
}: {
  projectId: string;
  roomId: string;
  /** Where a pane with nothing in it starts asking from: nothing predates its Room. */
  roomCreatedAt: Date;
  page: RoomMessageRow[];
  hasMoreOnServer: boolean;
  viewer: MessagesViewer;
}) {
  const router = useRouter();
  const [messages, setMessages] = React.useState(page);
  const [hasMore, setHasMore] = React.useState(hasMoreOnServer);
  const [loadedOlder, setLoadedOlder] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [seenPage, setSeenPage] = React.useState(page);
  /** Bumped whenever the loaded history is discarded, so a late page cannot rejoin it. */
  const [generation, setGeneration] = React.useState(0);

  // Adjusting state while rendering, rather than in an effect: React re-runs this component
  // before touching the DOM, so the merged history is what paints, with no second pass.
  if (page !== seenPage) {
    setSeenPage(page);
    // A refreshed page that no longer reaches back to what the reader already has means more
    // than a page arrived while they were idle. Merging the two would leave a stretch of the
    // Room between them that no cursor can ever ask for, because paging continues from the
    // oldest row on screen. Start again from the newest page instead: a visible jump, rather
    // than a hole that looks like history.
    const fresh = !messages.length;
    const contiguous = fresh || !page.length || page.some((m) => m.id === messages[0]!.id);
    if (contiguous) {
      setMessages((current) => merge(current, page));
      // The prop may narrow this and never widen it: it describes the newest page, so it is
      // `true` again after every post, while a reader who has reached the first Chat Message
      // of the Room has nothing left to load. A Room that was empty is the exception - there
      // was no history to have reached the beginning of, so the server's answer is the truth.
      setHasMore((current) => (fresh ? hasMoreOnServer : current && hasMoreOnServer));
    } else {
      setMessages(page);
      setHasMore(hasMoreOnServer);
      setLoadedOlder(false);
      // Anything already in flight belongs to the history that was just thrown away, and
      // merging it back would reinstate the hole this branch exists to avoid.
      setGeneration((n) => n + 1);
    }
  }
  // One request at a time: the button and the observer call the same function, and the
  // observer keeps firing while the sentinel is on screen.
  const inFlight = React.useRef(false);
  // The poll's own guard, deliberately not `inFlight`: sharing one would let a slow
  // background read swallow a click on "Load older messages" with no error and no retry.
  // The two may overlap safely - both end in the same union by id.
  const polling = React.useRef(false);
  /** Consecutive failed polls. A deleted Room or Person fails identically forever. */
  const failures = React.useRef(0);
  // A Room switch unmounts this; never set state on the way out.
  const mounted = React.useRef(true);
  const current = React.useRef(generation);

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  React.useEffect(() => {
    current.current = generation;
  }, [generation]);

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
    const asked = generation;
    const ask = viewer.kind === "pm" ? olderMessagesAction : participantOlderMessagesAction;
    try {
      const res = await ask({ projectId, roomId, before: { createdAt: oldest.createdAt, id: oldest.id } });
      if (!mounted.current) return;
      // The history this page belongs to was discarded while it was in flight. Merging it now
      // would file it under a newer, disjoint page and put back the hole that reset avoided.
      if (current.current !== asked) return;
      if (!res.ok) {
        // The button stays, and so does `hasMore`: a failed page must be retryable.
        setError(res.error);
        return;
      }
      setMessages((loaded) => merge(loaded, res.data.items));
      setHasMore(res.data.hasMore);
      setLoadedOlder(true);
    } catch {
      if (!mounted.current) return;
      setError("Older messages could not be loaded. Try again.");
    } finally {
      inFlight.current = false;
      if (mounted.current) setLoading(false);
    }
  }, [generation, hasMore, messages, projectId, roomId, viewer.kind]);

  /**
   * One Chat Message from outside the history the pane fetched: the reader's own, the moment
   * the action returns. `merge` is a union by id, so receiving one twice is a no-op, and
   * `hasMore` is untouched - a newer Chat Message says nothing about older history.
   */
  const receive = React.useCallback((message: RoomMessageRow) => {
    setMessages((loaded) => merge(loaded, [message]));
  }, []);

  /**
   * Ask for everything written after what the pane holds (issue #59). This is what delivers
   * the other side of the conversation; a reader is otherwise told nothing until they reload.
   *
   * The cursor is the newest Chat Message on screen **moved back by the overlap**, and that
   * is load-bearing rather than cautious: `room_messages.created_at` is the writing
   * transaction's start time, so a transaction that began earlier and committed later leaves
   * a row below a cursor already past it, which a strict cursor would never return again
   * (ADR 0011). Re-reading a few seconds costs nothing, because `merge` dedupes by id.
   */
  const catchUp = React.useCallback(async () => {
    if (polling.current || failures.current >= POLL_GIVE_UP_AFTER) return;
    const newest = messages[0];
    const after = newest
      ? { createdAt: new Date(newest.createdAt.getTime() - MESSAGE_POLL_OVERLAP_MS), id: FIRST_ID }
      : { createdAt: roomCreatedAt, id: FIRST_ID };
    polling.current = true;
    const asked = generation;
    const ask = viewer.kind === "pm" ? newerMessagesAction : participantNewerMessagesAction;
    try {
      const res = await ask({ projectId, roomId, after });
      if (!mounted.current || current.current !== asked) return;
      if (!res.ok) {
        // Silent: nobody asked for this read, so there is nothing to interrupt them with.
        // A Room or a Person deleted under the pane fails this way on every tick, which is
        // what the counter is for.
        failures.current += 1;
        return;
      }
      failures.current = 0;
      // More was written than one batch carries, so the rows above these are missing and
      // merging would leave a hole in the history. Start again from the route's newest page:
      // the non-contiguity branch above discards what is loaded and bumps the generation.
      if (res.data.truncated) router.refresh();
      else if (res.data.items.length) setMessages((loaded) => merge(loaded, res.data.items));
    } catch {
      failures.current += 1;
    } finally {
      polling.current = false;
    }
  }, [generation, messages, projectId, roomCreatedAt, roomId, router, viewer.kind]);

  // The interval must not be rebuilt whenever a Chat Message arrives - that would reset the
  // countdown on every merge - and must not close over the `messages` of the render that
  // installed it, which would freeze the cursor at mount. So the timer is installed once and
  // calls through a ref, the same shape this hook already uses for the generation.
  const latest = React.useRef(catchUp);
  React.useEffect(() => {
    latest.current = catchUp;
  }, [catchUp]);

  React.useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const tick = () => void latest.current();
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
    };
    const start = () => {
      stop();
      timer = setInterval(tick, MESSAGE_POLL_MS);
    };
    // A hidden tab has no reader to deliver to, and polls until the laptop's battery says
    // otherwise. Coming back asks once immediately, so a returning reader is up to date
    // before they have read a line, and forgives whatever failed while they were away.
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return stop();
      failures.current = 0;
      tick();
      start();
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return { messages, hasMore, loadedOlder, loading, error, loadOlder, receive };
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
