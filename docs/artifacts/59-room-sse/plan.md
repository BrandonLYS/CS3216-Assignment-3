# Issue #59 - a Room delivers new Chat Messages without a reload

## What the issue asks

> New messages are delivered through a per-room SSE stream.
>
> - Endpoint shape: /api/projects/[id]/messages/[roomId]/events
> - Server persists the message then broadcasts it to subscribers.
> - No read receipts and no typing indicators in the first version.

**The transport named here is not the one this PR builds, and that is a deliberate decision taken with the user.**
What the issue is _for_ - a reader sees what the other side said without reloading the page - is delivered in full.
SSE over the existing event bus is not, because on the deployment this is demoed on it would deliver nothing.
The reasoning is ADR 0011, summarised below and recorded in full with the PR.

### Why not the SSE stream the issue names

`eventBus` is a module-global `EventBus` held in one Node process (`events/bus.ts:49-50`).
An SSE handler can only subscribe to the bus in the process it runs in, so live delivery requires that the `POST` which writes a Chat Message and the long-lived `GET` which holds the reader's connection are served by the same process.

PrismPM is demoed on Vercel (`docs/architecture.md`: "one Next.js deployment on Vercel"), where those two requests routinely land on different instances.
The failure is silent: the writer's instance publishes into its own memory, the reader's instance never hears it, nothing errors, and the pane looks live while being wrong.
The two ways to fix that are a Postgres `LISTEN/NOTIFY` bridge (correct, but it needs an unpooled connection - Neon's pooler does not support `LISTEN` - so a second database URL and a long-lived connection per instance), or a poll.

The user chose the poll: it is correct on any number of instances, needs no new infrastructure or configuration, and reaches a reader in a few seconds instead of a few milliseconds - which is the difference between "live" and "live" to anyone watching a chat.
The seam is drawn so that swapping in a push transport later changes the two functions named in ADR 0011 and nothing else.

## What is already true

- **Nothing delivers a Chat Message to anyone but its writer.** Both post actions call `revalidateProject(res.data.projectId)` (`messaging/actions.ts:24-46`), which re-renders the Project subtree for the person who posted. The other side of the Room sees it on their next navigation or reload. The comment at `actions.ts:26-27` already names this issue as the thing that replaces the round trip.
- **Keyset reads exist in one direction only.** `messagingRepo.listMessages` pages _backwards_: `(created_at, id) < cursor`, `order by desc` (`repository.ts:139-164`), with an explicit `::timestamptz` cast because a raw `Date` inside an `sql` template fails. `room_messages.created_at` is `precision: 3` so a `Date` cursor is exact. There is no forward read, which is what a catch-up needs.
- **`pageOf` is the shape to copy** (`service.ts:111-115`): read one row past the limit, return `{ items, hasMore }`, clamp to `MESSAGE_PAGE_MAX = 100`. Both audiences share it, so the PM's history and a Participant's cannot drift.
- **Two seams, one per audience** (ADR 0009): `resolveRoom` for the PM (`service.ts:43-48`), the exported `assertParticipates` for a Person (`:63-74`). Every read a Participant can reach starts with the second.
- **A read-only action is an established pattern**: `olderMessagesAction` / `participantOlderMessagesAction` (`actions.ts:54-64`) are `runAction` / `runParticipantAction` with no revalidation, and the cursor crosses the boundary as a real `Date` validated with `z.date()`.
- **The pane can already absorb a Chat Message from outside its own page prop.** `useRoomHistory` (`messages-view.tsx:346-449`) keeps its own array, unions by id with `merge()`, sorts `(createdAt, id)` descending, holds the reader's place across a prepend, and bumps a **generation** when a refreshed page is no longer contiguous with what is loaded so a late response cannot rejoin a discarded history. `merge` is safe with a single row and is a no-op when the row is already known.
- **The composer throws its result away.** `Composer` uses `res.ok` and the errors; `res.data` - the written row - is discarded (`messages-view.tsx:505-516`). The only reason the writer sees their own Chat Message today is the revalidation.
- **The scroll behaviour assumes the reader is the only writer.** `Room` scrolls to the newest Chat Message whenever the newest id changes (`messages-view.tsx:180-189`), and the scroll listener that drives paging is installed only when `history.hasMore` (`:222-239`).
- **`created_at` is the transaction's start time, not the commit's.** `defaultNow()` (`schema.ts:79`) is Postgres `now()`, which is fixed when the transaction begins, and `postMessage` does `resolveRoom`, `findAuthorName` and the insert inside one transaction (`service.ts:238-244`). Two writers therefore commit in an order that is not their `created_at` order, which is the single most dangerous fact on this page - see the overlap below.
- No migration, no new dependency: `room_messages_room_time_idx` (`schema.ts:93`) is `(room_id, created_at desc, id desc)`, which Postgres reads backwards for an ascending scan just as happily.

## What this PR adds

Four pieces: a forward keyset read, a catch-up service and action per audience, the pane that asks for it, and the removal of the revalidation it replaces.

### 1. A forward keyset read (`messaging/repository.ts`)

```ts
/** Oldest first from a cursor: the mirror of `listMessages`, and what a catch-up asks for. */
listMessagesAfter: (db, projectId, roomId, { after, limit }: { after: MessageCursor; limit: number }) => …
//   (created_at, id) > (after.createdAt::timestamptz, after.id)   order by asc, asc   limit N
```

Same row comparison, same cast, same Project-and-Room scoping as `listMessages`, so it seeks on the same composite index rather than filtering forward from the newest row.
A separate function rather than a direction flag on `listMessages`: a flag would have to flip both the comparison and the `order by`, and every existing caller would pay the reading cost of a branch it never takes.

### 2. Catch-up on both services (`messaging/service.ts`)

One private helper beside `pageOf`, and one method per audience behind the seam that audience already uses:

```ts
/**
 * Everything written after a cursor, oldest first, and whether there was more of it than
 * one batch. Deliberately **not** called `hasMore`: `pageOf` answers that about the other
 * end of the history, both results pass through the same hook, and one mis-wiring between
 * them would typecheck and quietly destroy paging. `truncated` can only mean this.
 */
async function sinceOf(db, room, { after, limit }): Promise<{ items: RoomMessageRow[]; truncated: boolean }>;

messagingService.messagesSince = (ctx, ref, opts) => …             // behind resolveRoom
participantMessagingService.messagesSince = (pctx, ref, opts) => … // behind assertParticipates
```

The one-past-the-limit trick from `pageOf`, clamped by the same `MESSAGE_PAGE_MAX = 100`.

`MESSAGE_CATCH_UP_MAX = 50` lives here beside `MESSAGE_PAGE_MAX`, not in `src/shared/domain`: the browser never sends a limit (`olderMessagesSchema` has none, `validation.ts:47-49`), so it is a server limit, and `service.ts:14-18` already draws that line for `MESSAGE_PAGE_MAX`.

`after` is **required**, and the caller always has one - including a pane with nothing in it, which asks from the Room's own `createdAt` (below). No "no cursor means the newest page" branch, which would have to answer with a `truncated` that means the opposite thing.

### 3. Two read-only actions (`messaging/actions.ts`, `validation.ts`)

`newerMessagesSchema` is `olderMessagesSchema` with `after` in place of `before` - `{ projectId, roomId, after: { createdAt: z.date(), id: z.string() } }`, both required - and the two actions mirror the paging pair exactly, `runAction` and `runParticipantAction`, no revalidation:

```ts
export async function newerMessagesAction(input) …
export async function participantNewerMessagesAction(input) …
```

`MESSAGE_POLL_MS = 4000` and `MESSAGE_POLL_OVERLAP_MS = 10_000` join `MESSAGE_PAGE_FIRST` / `MESSAGE_PAGE_MORE` in `src/shared/domain`: the pane owns the tick and builds the cursor, so both are vocabulary it shares.

A Room the caller is not entitled to answers exactly as it does for their first page: `NotFoundError("Room")`, from the same seam, with no hint that the Room exists.

### 3a. The cursor overlaps, and why it must

A strict `(created_at, id) > newest` cursor **loses Chat Messages permanently**, and the demo scenario is what triggers it.
`created_at` is `now()`, fixed when the writing transaction begins (`schema.ts:79`), while the pane's cursor is the newest row it has _seen_, which is the newest row that has _committed_.
A transaction that began earlier and committed later carries an earlier `created_at` than a cursor already past it, so it sits below the cursor forever: the Chat Message is in the table, the poll never returns it, and only a reload shows it.

The poll therefore asks from `newest.createdAt - MESSAGE_POLL_OVERLAP_MS` with the nil UUID as the tiebreak id, which re-reads the last ten seconds of the Room on every tick.
That is free, because `merge` is a union by id (`messages-view.tsx:330-336`) and the re-read rows are already in the map.
Ten seconds is orders of magnitude longer than a `postMessage` transaction, and a write slower than that is a page a reader reloads anyway.

An empty pane uses `item.room.createdAt` as its cursor - nothing can have been written before the Room existed - so the "no cursor" case disappears entirely, along with the every-tick `router.refresh()` an empty Room would otherwise have paid (a full RSC render of the route, roster included, per tick, per open pane, forever).

### 4. The pane asks (`features/messaging/messages-view.tsx`)

- **`useRoomHistory` gains `receive(message)`**: `setMessages((current) => merge(current, [message]))`. `hasMore` is untouched - a newer Chat Message says nothing about older history.
- **`useRoomHistory` gains the poll.** Every `MESSAGE_POLL_MS`, while the tab is visible, ask `newerMessagesAction` (or the Participant's) from the overlapped cursor of 3a. Then:
  - `items` are merged by id, which is also what makes the overlap and the writer's own already-merged row cost nothing.
  - `truncated` means the Room outran one batch: `router.refresh()`, and the route's newest page arrives as a new `page` prop, where the existing non-contiguity branch (`messages-view.tsx:370-393`) discards the loaded history, bumps the generation and starts again. That branch exists for exactly this case. No loop is possible: a refresh yields a contiguous or a reset history whose newest row is then the cursor, and the next tick returns nothing.
  - **The cursor is read from a ref, not from a closure.** The interval must not be re-created on every merge (it would reset the 4s tick on every arrival) and must not close over the `messages` of the render that installed it (the cursor would freeze at mount and, in a busy Room, `truncated` would refresh every tick forever). A `newest` ref updated in an effect is the shape this file already uses for `generation` (`:399-411`).
  - **Its own in-flight flag, not `loadOlder`'s.** Sharing `inFlight` (`:397`) would make a slow poll swallow a click on "Load older messages" with no feedback and no retry (`:417-419`). Both paths end in the same idempotent `merge`, so they may overlap. `mounted` and the generation guard (`:423`, `:430`) are shared unchanged.
  - A failed poll is silent - it is a background read nobody asked for, and `loadOlder`'s visible error belongs to a click - but **five consecutive failures stop the interval**, because a deleted Room or a deleted Person fails identically forever. Becoming visible again resets the count and tries once.
  - **Visibility**: the interval is cleared while the tab is hidden and one poll runs immediately on `visibilitychange` back to visible, so a reader returning to the tab is up to date before they have read a line and a backgrounded tab costs nothing. The interval is also cleared on unmount, which is every Room switch (`Room` is keyed on the Room id, `:134`).
- **The composer's own Chat Message is merged.** `Room` wraps `send`: `const res = await post(text); if (res.ok) { history.receive(res.data); pinned.current = true; } return res;`. This replaces the revalidation for the writer and is immediate. Pinning is part of it: sending is the one arrival that should always scroll into view, even from halfway up the history.
- **The pane must stop yanking the reader to the bottom.** Someone else's Chat Message arriving while the reader is scrolled back into history would tear them out of it. The scroll-to-newest layout effect becomes conditional on a `pinned` ref - within 80px of the bottom - which:
  - starts `true`, because the pane opens at the newest Chat Message (`:180-189`);
  - is updated by the scroll listener, which must now be installed unconditionally, with the `hasMore` check moved _inside_ the handler so a fully loaded Room does not keep asking for pages;
  - is created and written in `Room`, the component that owns the scroller, which is what the React Compiler's rule about ref props requires (the rule that bit #60);
  - is not read or written during render - only in the listener and in the layout effect.
- The poll lives in `useRoomHistory` rather than a second hook: the cursor, the merge, the generation and the in-flight guard are all already there, and a second hook would have to be handed every one of them.

### 5. The revalidation goes (`messaging/actions.ts`)

Both post actions drop `revalidateProject`. It exists to put the writer's Chat Message on their own page, which the merge in 4 now does directly, and it costs a full RSC render of the Project subtree per Chat Message.

Verified safe: nothing outside the messaging module reads `room_messages`. The Room list is ordered by `rooms.created_at` (`repository.ts:46`) and its subtitle is Participant names (`messages-view.tsx:57-64`); there is no unread badge, no last-message preview, no counter anywhere. `createRoom`, `addParticipant` and every People write keep their revalidation.

## Commits

1. `docs: plan for delivering new Chat Messages without a reload (#59)` - this file.
2. `feat(messaging): read the Chat Messages written after a cursor` - `listMessagesAfter`, repository tests.
3. `feat(messaging): both audiences can catch up on a Room` - `sinceOf`, `messagesSince` on both services, `newerMessagesSchema`, the two actions, `MESSAGE_CATCH_UP_MAX` in the service and the two poll constants in `shared/domain`, service tests.
4. `feat(messaging): the messages pane catches up on its own` - `receive`, the poll, the composer merge, the pinned-to-bottom scroll, and the removal of both revalidations. One commit: the tree must compile _and_ behave at every commit, and the merge is what replaces the revalidation.
5. `docs: ADR 0011 and the architecture guide`.

## Tests

Vitest against `db_test` (`DATABASE_URL=postgres://pm:pm@localhost:5434/pm_test`). Each test gets its own Project and Room, ids are prefixed with `randomUUID()`, and no test counts rows in a table another test writes to. Chat Messages written in a loop can share a millisecond, so order is asserted against a single full read, never against insertion order.

- `repository.test.ts` - `listMessagesAfter`: ascending from the cursor, excludes the cursor row itself, respects `limit`, breaks a shared-`created_at` tie by id in the opposite direction to the existing test at `:181`, never returns another Room's rows, never returns another Project's.
- `repository.test.ts` - **the out-of-order write**, which is finding 3a made executable: insert a row with a pinned `createdAt` _earlier_ than one already inserted (the suite already writes `createdAt` by hand at `:151-158`), then assert that a cursor taken from the later row misses it and a cursor overlapped by `MESSAGE_POLL_OVERLAP_MS` finds it. Without this test the overlap is a paragraph nobody can check.
- `service.test.ts` - `messagesSince` for both audiences: returns what was written after the cursor; `truncated` is true only past the cap and the items still stop at it; the PM's is `NotFoundError` for a Room in another Project; the Participant's is `NotFoundError` for a Room they were not admitted to and for a deleted Person; the limit is clamped to `MESSAGE_PAGE_MAX`.
- Round trip: a Chat Message written by `participantMessagingService.postMessage` is visible to the PM's `messagesSince`, and the reverse - the two audiences catch up on each other, which is the whole feature.

## ui-proof

Two browser contexts against one dev server, which is the only way to see what this issue is: the PM at `/projects/<id>/messages` and Jason (`jason@example.com`, group Room) at `/m/<id>/login`.

Measured, not eyeballed (the #60 lesson). Wait out hydration (~1.2s or poll for `scrollTop > 0`) before reading any scroll position, and match a sent Chat Message with `page.locator("li").filter({ hasText: text })`, never `getByText` - that matches the draft in the textarea.

1. **Delivery**: Jason posts. The PM's pane gains that `li` within ~6s with **no navigation and no remount** - stamp `window.__mark` and tag the scroller element before the post, and assert both survive, which `performance.getEntriesByType("navigation")` alone would not tell us (a `router.push` adds no entry either).
2. **The writer's own line is immediate**: from the click to the row in the DOM, under one second, and not on a poll boundary. Also from halfway up the history: the writer's own Chat Message scrolls into view, a reader's does not.
3. **Scroll position under an arrival**: with the PM scrolled back into older history and `scrollTop` recorded, Jason posts; assert the PM's `scrollTop` is unchanged and the row is in the DOM. Then with the PM at the bottom, Jason posts; assert the pane is at the bottom again.
4. **Hidden tab**: headless Chromium always reports `visibilityState: "visible"` and Playwright cannot hide a page, so the PM's context gets an `addInitScript` that redefines `document.hidden` / `visibilityState` from a flag and dispatches `visibilitychange` on demand. Hide, let Jason post twice, assert **no request** to the action in that window (count them with `page.on("request")`), then show and assert both rows arrive within a second.
5. **No duplicates**: `document.querySelectorAll("li[data-message-id]").length` equals the count of distinct ids, after a send, a poll and a `loadOlder` have all happened in one session.
6. **Paging still works alongside the poll**: scroll to the top of a Room seeded past one page, assert 50 shown then 50-to-70 per gesture, with the poll running throughout.

Screenshots into `docs/artifacts/59-room-sse/screenshots/`; the driving scripts live in `scripts/` and are deleted before the PR.

## Docs

- **ADR 0011 - new Chat Messages are delivered by a keyset catch-up, not a stream**: why the in-process bus cannot fan out on a multi-instance deployment, why `LISTEN/NOTIFY` and an unpooled connection is the upgrade rather than the first version, the cost accepted (up to `MESSAGE_POLL_MS` of latency, one indexed query per open pane per tick, visible tabs only), why the poll reads forward from a keyset cursor rather than refetching the newest page (constant work per tick, no hole, no jump), **why that cursor is overlapped** - `created_at` is transaction-start time, so commit order and `created_at` order differ and a strict cursor loses rows - and the seam a push transport would replace: `messagesSince` on the server and `receive` in the pane.
- `docs/architecture.md` "Current limits" says live delivery "remain[s] separate work"; that line and the messaging paragraphs around it are updated.
- A comment on issue #59 recording that the transport changed and why, so the issue and the PR do not disagree.
- `AGENTS.md` is untouched: no new architectural rule.
