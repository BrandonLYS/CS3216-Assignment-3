---
status: accepted
---

# New Chat Messages are delivered by a keyset catch-up, not a stream

Issue #59 asks for real-time delivery through a per-Room Server-Sent Events stream at `/api/projects/[id]/messages/[roomId]/events`: the server persists a Chat Message and then broadcasts it to subscribers.
What ships is the delivery, not the transport.
An open pane asks for everything written after the newest Chat Message it holds, every few seconds while its tab is visible.
The endpoint does not exist.

## Why not the stream the issue asked for

`eventBus` is a module-global `EventBus` in one Node process (`src/server/events/bus.ts`).
A stream handler can only subscribe to the bus inside the process it runs in, so a broadcast reaches a reader only when the `POST` that wrote the Chat Message and the long-lived `GET` holding that reader's connection are served by the same process.

PrismPM is deployed as one Next.js application on Vercel, where those two requests routinely land on different instances.
The failure mode is the reason this ADR exists: the writer's instance publishes into its own memory, the reader's instance never hears it, nothing throws, no log records it, and the pane looks live while being wrong.
A demo would show a chat that silently stops delivering, which is worse than one that visibly needs a reload.

Two things would fix that, and both were considered.

**Postgres `LISTEN/NOTIFY`.** The writer notifies a channel, every instance is already connected to the database, and each streaming handler listens. This is the right long-term answer and is the upgrade path below. It was not taken now because it needs a connection that is not the pooled one - Neon's pooler does not support `LISTEN` - so it adds a second database URL to configure, a long-lived connection per instance, and a failure mode (silently pooled URL, silently no delivery) that looks exactly like the one being fixed.

**A catch-up poll.** Correct on any number of instances, no new infrastructure, no new configuration, and nothing to get wrong in an environment variable. It costs one indexed query per open pane per tick and delivers in up to `MESSAGE_POLL_MS` rather than in milliseconds.

For a conversation between a handful of people, four seconds of latency and "live" are the same thing to the person watching.
That is the trade accepted here: a delivery that always works, slowly, over one that is instant when the deployment happens to cooperate.

## What is built

- `messagingRepo.listMessagesAfter` reads forward from a keyset cursor, the mirror of the backwards `listMessages` that pages history (issue #60). Both use the same `(created_at, id)` row comparison, so both seek on `room_messages_room_time_idx` rather than scanning.
- `messagingService.messagesSince` and `participantMessagingService.messagesSince` sit behind the seam each audience already uses - `resolveRoom` and `assertParticipates` (ADR 0009) - over one shared `sinceOf`. A Room the caller is not entitled to answers `NotFoundError`, exactly as its first page would.
- `newerMessagesAction` and `participantNewerMessagesAction` are read-only and do not revalidate, like the paging pair they mirror.
- The pane polls from inside `useRoomHistory`, where the cursor, the union-by-id merge and the generation guard already live, and merges what comes back.

The result field is `truncated`, not `hasMore`.
`pageOf` already answers `hasMore` about the opposite end of the history, both results reach the same hook, and two booleans with one name would let a mis-wiring typecheck and quietly break paging.
A truncated answer is not a batch to merge - the rows above it are missing - so the pane starts again from the route's newest page, through the non-contiguity branch that already exists for a refreshed page that no longer overlaps what is loaded.

## The cursor is overlapped, and that is load-bearing

`room_messages.created_at` defaults to `now()`, which Postgres fixes at the **start of the writing transaction**, and `postMessage` resolves the Room and reads the author's name inside that transaction before inserting.
Commit order and `created_at` order therefore disagree: a transaction that began earlier and committed later leaves a row whose timestamp is below a cursor the reader has already passed.

A strict `(created_at, id) > newest` cursor never returns that Chat Message again.
It is in the table, it is in nobody's pane, and only a reload shows it - and two people posting at the same moment is the ordinary case, not a rare one.

So the pane asks from `confirmed.createdAt - MESSAGE_POLL_OVERLAP_MS`, with the nil UUID as the tiebreak id, and re-reads the last ten seconds of the Room.
That costs nothing: the merge is a union by id, so a row already held is dropped on arrival.
`repository.test.ts` pins the timestamps to prove both halves - the strict cursor misses the late committer, the overlapped one finds it.

The overlap applies only while the region behind the cursor could still be moving.
Once the pane has held the same cursor for longer than the window - ten seconds of nothing arriving - every transaction that could have landed a row beneath it has finished, and the cursor becomes exact.
That is measured as elapsed time on the browser's own clock, never by comparing the browser's clock with the database's, which may disagree by more than the window.
Without it a Room dense enough to hold a batch inside ten seconds would re-read the same rows on every tick for as long as the pane stayed open, long after the conversation stopped.

One more bound sits at the far end of that: a Room receiving a thousand Chat Messages inside the window cannot have it re-read faster than it fills, so the pane stops trying and takes the cursor at face value.
At a hundred Chat Messages a second, a late commit lost inside that window is a better outcome than a thousand rows read every few seconds forever.

Two further bounds are accepted with this. A write that takes longer than ten seconds to commit is missed until the next navigation, which is the same class of bound a stream would need on its reconnect replay. And the cursor a catch-up asks from is only ever one a **server read** confirmed: a Chat Message the reader wrote themselves is on their screen immediately but never moves the cursor, because it says nothing about what else arrived. The same rule decides whether a refreshed page is continuous with the loaded history - judged against the confirmed cursor, never against the newest row on screen, and a pane with no confirmed cursor adopts the page outright rather than treating its own writing as proof of anything.

## Consequences

- **Both `postMessage` actions stop calling `revalidateProject`.** That revalidation only ever delivered to the person who posted, at the cost of re-rendering the Project subtree per Chat Message; the pane now merges the row the action already returns. Everyone else in the Room is served by their own catch-up, which is the only thing that ever served them.
- **An arriving Chat Message no longer scrolls the pane** unless the reader is at the bottom or just sent it themselves. With only the writer's own Chat Message to show, snapping to the newest was always right; now it would tear a reader out of the history they scrolled back into.
- A hidden tab polls nothing and catches up the moment it is shown. Five consecutive failures stop the asking until then, because a deleted Room or a deleted Person fails identically forever.
- Cost scales with open panes, not with Chat Messages: an idle Room costs the same as a busy one. A much larger deployment would feel that before it felt anything else, and that is when the upgrade below becomes worth its configuration.
- Read receipts and typing indicators remain out, as issue #59 asked.

## The upgrade path

Push replaces two functions and touches nothing else: `messagesSince` on the server, which is where a subscription would deliver from, and `receive` in the pane, which is what a pushed Chat Message would call.
When it is worth it, the shape is `LISTEN/NOTIFY` over an unpooled connection, an SSE route authorized through the same two seams, and the poll kept as the fallback for a reader whose stream is down - the cursor and the merge that make the poll correct are exactly what makes a reconnecting stream correct too.
