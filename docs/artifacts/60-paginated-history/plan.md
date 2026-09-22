# Issue #60 - a Room's history loads in pages

## What the issue asks

> Message history loads in pages.
>
> - Initial fetch returns the newest 50 messages.
> - Subsequent scroll loads 20 messages at a time.
> - No text search in the first version.

## What is already true

- `messagingRepo.listMessages(db, projectId, roomId, { before?, limit })` is a **keyset** read, newest first, with `before` a `{ createdAt: Date; id: string }` tuple compared as a row (`repository.ts:139-164`).
  It is already covered by `repository.test.ts:140-215`, including the tie case at `:181` where two rows share a `createdAt`.
  `room_messages.created_at` is `precision: 3` for exactly this reason: a `Date` cursor cannot represent microseconds, and a truncated cursor would skip rows.
- Both services expose `listMessages(ctx|pctx, ref, { before?, limit })`, each behind its own seam (`resolveRoom` for the PM, `assertParticipates` for the Participant), and both clamp the limit to `MESSAGE_PAGE_MAX = 100`.
- The page fetches one page with a local `const PAGE = 50` (`page.tsx:15`) and hands `messages` to `MessagesView`, newest first.
- `MessagesView` reverses that array for display, is keyed on the Room id (so a Room switch remounts `Room`), and scrolls to the newest Chat Message on mount and whenever the newest id changes (`messages-view.tsx:150-158`).
- **A read-only server action is an established pattern**: `searchTasksAction` (`tasks/actions.ts:43-46`) is `runAction` with no `revalidateProject`, called from a client component (`command-palette.tsx:97`).
- No migration, no new dependency.

## What this PR adds

Nothing about the seams or the query changes. What is missing is a way for the browser to ask for the page _before_ the one it has, and a pane that asks for it.

### 1. The two page sizes (`src/shared/domain/index.ts`)

```ts
export const MESSAGE_PAGE_FIRST = 50;
export const MESSAGE_PAGE_MORE = 20;
```

In `shared/domain` rather than the service because the client component needs `MESSAGE_PAGE_MORE` and must not import a server module (the same reason `labelOf` is not the service's `roomLabel`).
`MESSAGE_PAGE_MAX` stays in the service: it is a server limit on what any caller may ask for, not vocabulary the browser shares.
The page's local `PAGE` goes.

### 2. `listMessages` answers whether there is more (`messaging/service.ts`)

Today the only way to know a Room has older history is to ask for it and get nothing back, which costs a round trip at the bottom of every Room and makes the pane offer "Load older" on a Room that has none.

Both services return `{ items, hasMore }` instead of a bare array.
One private helper does it for both, so the PM and the Participant cannot drift:

```ts
async function pageOf(db: DbOrTx, room: RoomRow, { before, limit }: { before?: MessageCursor; limit: number }) {
  const capped = Math.min(Math.max(limit, 1), MESSAGE_PAGE_MAX);
  // One more row than asked for: its existence is the answer, and it is not returned.
  const rows = await messagingRepo.listMessages(db, room.projectId, room.id, { before, limit: capped + 1 });
  return { items: rows.slice(0, capped), hasMore: rows.length > capped };
}
```

The repository keeps its current shape: a keyset read that returns rows, with the `+1` convention owned by the service that needs it.

### 3. Two read-only actions (`messaging/actions.ts`, `messaging/validation.ts`)

`olderMessagesSchema` is `{ projectId, roomId, before: { createdAt: z.date(), id: z.string() } }`, with `before` **required**: this action only ever fetches older pages; the first page is the server component's job.

`z.date()`, not an ISO string with a transform: React 19 serializes a `Date` across the server-action boundary in both directions, and the `createdAt` the client would send back is one it was already handed as a `Date`.
No date crosses an action anywhere else in this codebase, so there is no convention to match and the shorter one wins.
Precision is not at risk either way - `created_at` is millisecond precision and the cursor is compared as a tuple.

There is no `limit` in the schema.
The issue fixes the page at 20, the server owns `MESSAGE_PAGE_MORE`, and a client-chosen page size is a parameter nobody needs and every caller could get wrong.

```ts
export async function olderMessagesAction(input) {
  return runAction(olderMessagesSchema, input, (ctx, { projectId, roomId, before }) =>
    messagingService.listMessages(ctx, { projectId, roomId }, { before, limit: MESSAGE_PAGE_MORE }),
  );
}

export async function participantOlderMessagesAction(input) {
  return runParticipantAction(olderMessagesSchema, input, (pctx, { projectId, roomId, before }) =>
    participantMessagingService.listMessages(pctx, { projectId, roomId }, { before, limit: MESSAGE_PAGE_MORE }),
  );
}
```

Read-only, so no `revalidateProject` - `searchTasksAction` is the precedent, comment and all.
Authorization is unchanged and unbypassed: each action enters through the seam its audience already uses, and a Participant asking for a Room they are not in gets `NotFoundError("Room")` exactly as their first page would.

### 4. The pane loads older pages (`src/features/messaging/messages-view.tsx`)

`Room` becomes the owner of the history it shows:

- State is `messages`, seeded from the prop. When the prop changes (a post revalidates the route), the two are **merged by id** rather than replaced, then sorted by the **`(createdAt, id)` tuple descending** - the same order the keyset reads in, and the reason `repository.test.ts:181` exists: two Chat Messages can share a millisecond, and sorting on `createdAt` alone would both display them in the wrong order and pick the wrong "oldest loaded" row, producing a cursor that skips one.
  Replacing rather than merging would drop the older pages the reader has already pulled in, and a message that fell out of the newest-50 window would leave a hole.
  The merge is idempotent, which is what makes it safe under React's double-invoked effects, and it never has to remove a row, because a Chat Message is never edited and never deleted (ADR 0009, `schema.ts:51`).
- **`hasMore` is state, and the prop may only narrow it.** The prop describes the newest page the server just rendered, so after a post it is `true` again even for a reader who has already paged to the very beginning of the Room; adopting it blindly would resurrect the button and buy one empty round trip per post. The rule is `hasMore && propHasMore` - once this reader has seen the first Chat Message of the Room, nothing puts the button back.
- `loadOlder()` calls the action for the viewer with `before` = the oldest loaded `{ createdAt, id }`, prepends what comes back, and records `hasMore` from the response.
  It guards against concurrent calls (one in-flight ref, which is also what stops the observer below from chaining into a double fetch), and against setting state after the Room is switched (the same `mounted` ref pattern the composer already uses).
- **Failure leaves the door open.** A rejected action or `{ ok: false }` clears the in-flight ref in a `finally`, leaves `hasMore` alone so the button stays, and shows an inline `text-tag-red` caption beside it, the way the composer already reports a failed send. A silently dead button is the worst of the available outcomes.
- **Scroll anchoring**: before prepending, record `scrollHeight - scrollTop`; in a layout effect after the prepend, set `scrollTop = scrollHeight - recorded`.
  Without this the reader is thrown to the top of the newly inserted block, which is the classic infinite-scroll bug.
  One wrinkle this does not solve by itself: when the history is shorter than the pane, `justify-end` leaves `scrollTop` at 0 with `scrollHeight === clientHeight`, so holding the distance from the bottom leaves the reader at the bottom and the newly loaded block lands out of sight above them. When the load was started by the button rather than the observer, scroll the previously-oldest Chat Message into view instead, so the click visibly does something.
- The existing "scroll to newest" effect must not fire on a prepend. It is keyed on the newest id today, which a prepend does not change, so it is already correct - the plan keeps it and the tests below prove the pairing by construction rather than by luck.
- Trigger: an `IntersectionObserver` on a sentinel at the top of the list, plus a real **"Load older messages" button** in the same spot. The button is the accessible, deterministic control (and what the ui-proof clicks); the observer makes it automatic while scrolling. Both call `loadOlder`.
  The observer's `root` is the scroller element, not the viewport: on the Participant's `h-screen` page a viewport root would fire merely because the pane came into view.
  The button is `size="sm"` and a quiet variant, centred above the first Chat Message - the composer owns the one primary action on this surface (DESIGN.md).
- The sentinel and button render only while `hasMore`; while a fetch is in flight the button shows `Button`'s `loading` state, which disables it and spins.
  When `hasMore` is false **and** the reader pulled at least one older page, a centred `text-caption text-ink-tertiary` line says "Start of the room": without it the button just vanishes, and "I have everything" is indistinguishable from "it broke".
  A sentinel at the top of a bottom-anchored list is visible the moment it mounts, so the observer fires immediately and keeps firing until the pane is full. That is what a sentinel is for, and the in-flight guard is what keeps it to one request at a time.
- This is the first `IntersectionObserver` in the codebase - there is no existing "load more" pattern to follow. The conventions it does follow are the `mounted` ref and `Button`'s `loading` prop, both already in this file.

`hasMore` for the first page comes from the server through a new prop on `MessagesView`, so a Room with a short history never offers to load more.
The prop doc on `messages` ("Newest first, as the keyset page returns them") becomes "the newest page; `Room` merges older pages into it", in both `MessagesView` and `Room`.

### 5. The page passes the first page and its flag (`messages/page.tsx`)

`PAGE` becomes `MESSAGE_PAGE_FIRST`; both branches destructure `{ items, hasMore }` and pass `messages={items} hasMore={hasMore}`.

## Tests

`src/server/modules/messaging/service.test.ts` (Vitest + `db_test`), extending what is there:

1. **`hasMore` is true only while older rows exist** - in a Room with three Chat Messages, `{ limit: 2 }` returns two items with `hasMore: true`, and the page after that cursor returns one item with `hasMore: false`.
2. **Paging walks the whole history exactly once** - loop `limit: 2` pages from the newest until `hasMore` is false, and assert the concatenation equals the full history in order, with no duplicate and no gap. This is the property the pane depends on.
3. **The clamp still holds and does not leak the probe row** - `{ limit: MESSAGE_PAGE_MAX + 5_000 }` returns at most `MESSAGE_PAGE_MAX` items (the existing test, adjusted to the new shape).
4. **A cursor past the beginning of history is an empty last page** - a `before` older than every row, and a `before` naming an id that does not exist, both return `{ items: [], hasMore: false }` rather than throwing. This is what a forged or stale cursor from the browser does, and it pins the probe logic.
5. **A Participant pages through their own Room** - the same walk for `participantMessagingService`, so the second seam is exercised with a cursor and not only with a first page.
   The existing Participant fixtures cannot carry this: `theirs` holds exactly one Chat Message and `sendable` is written to by the `#55` tests at indeterminate times. This test gets its own Room, created in the `describe("sending")`-style pattern with its own `beforeAll` and four Chat Messages posted through `participantMessagingService.postMessage`.

Every existing `listMessages` assertion moves to `.items` (`service.test.ts:68`, `:78`, `:370`, `:410`, `:440`, `:444`); the rejection assertions at `:89`, `:103` and `:382` are unaffected.
`repository.test.ts` is untouched, because the repository's contract does not change.

## Commits

1. `docs: plan for paginated history (#60)` - this file.
2. `feat(messaging): tell a caller whether older history exists` - page sizes in `shared/domain`, `pageOf`, both services returning `{ items, hasMore }`, the page, the tests.
3. `feat(messaging): read older pages from the browser` - `olderMessagesSchema` and the two read-only actions.
4. `feat(messaging): load older messages as the reader scrolls` - the pane, scroll anchoring, sentinel and button.

## Verification

- `npx vitest run` against `db_test` on 5434, `npm run typecheck`, `npx eslint --max-warnings=0 .`, `npm run format:check`.
- **ui-proof**: the seed's Rooms hold five and two Chat Messages, far below a page, so the proof needs a Room with more than 50.
  A throwaway script inserts ~70 Chat Messages through `messagingRepo.insertMessage` with **pinned `createdAt`s** spread over days, exactly as `service.test.ts:51` does - one transaction instead of seventy, and `relative()` then renders a stable "3 days ago" rather than a "0 minutes ago" that differs between the before and after capture.
  Playwright then shows the newest 50, clicks "Load older messages", and shows the older ones above with the reader's position held. Screenshots before and after the click, plus the Participant's side. Script deleted before the PR.

## Out of scope

Text search (the issue excludes it), SSE (#59), attachments (#56), "jump to newest" affordances, unread counts.
