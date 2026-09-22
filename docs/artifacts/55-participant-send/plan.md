# Issue #55 - any Participant of a Room can send a Chat Message

## What the issue asks

> Any project member who is a participant in a room can send messages.
>
> - No message editing or deleting.
> - All history persists; no archive or delete actions.

The second and third bullets are already true and stay true: `messagingService` has no update or delete for a Chat Message, and neither does anything this PR adds.
What is missing is the write itself: a Person who is in a Room can read it but cannot say anything in it.

## What is already true

- `room_messages` carries `author_person_id`, `author_user_id` (both nullable, `num_nonnulls(...) <= 1`) and a NOT NULL `author_name` snapshot (ADR 0006).
  `messagingRepo.insertMessage` already takes any of them; `scripts/seed.ts` writes Person replies through it directly.
  **No migration is needed in this PR**, so the `_journal.json` trap is not in play.
- `assertParticipates(db, personId, ref)` is the second authorization seam (ADR 0009).
  It re-reads the Person, checks the Person's Project, resolves the Room inside that Project, checks admission, and answers every failure with `NotFoundError("Room")`.
  It already loads the Person row it needs to check.
- `participantMessagingService` has `workspace` and `listMessages`, both read-only, both starting at that seam.
- `runParticipantAction(schema, raw, fn)` exists in `src/server/core/action.ts` and **has no caller**.
  It builds a `ParticipantCtx` from the signed cookie and answers a missing session with `ForbiddenError`.
- `messagingService.postMessage` (the PM's) trims, rejects an empty body with `ValidationError`, snapshots `messagingRepo.findAuthorName(tx, userId)`, inserts, and publishes `rec.signal("chat_message.created", …)` with `action: "created"` and the Room's label (ADR 0010).
- `MessagesView` takes a `viewer` prop and already colours a Chat Message as the reader's own through `m.authorPersonId === viewer.personId`.
  The `Composer` is rendered for `viewer.kind === "pm"` only; the Participant gets a `<p>` saying "Only the project manager can post for now."
- `postMessageSchema` is `{ projectId, roomId, text }` with a trimmed, non-empty `text` and no maximum.
  (#57's 4,000-character cap landed on Comments, `COMMENT_MAX_LENGTH`; `room_messages` has no length constraint, and inventing one here is out of scope.)

## The design question: `mutate` needs a User, and a Participant is not one

`mutate(ctx, fn)` builds `new Recorder(ctx.userId, ctx.via)`, and `activity_events.actor_id` is a foreign key to `user.id`.
A Person has no `user` row and never will (ADR 0009), so a Chat Message written by a Person cannot go through `mutate` as it stands.

ADR 0010 already settled the part that matters: a Chat Message writes **no** Activity Event, only a `chat_message.created` signal.
So the Participant write needs nothing from the Recorder except the signal and the publish-after-commit that `mutate` provides.
Two ways to get there:

1. **Publish outside `mutate`** - `db.transaction(...)` in the service, then `eventBus.publish([...])` by hand.
   Rejected: it duplicates the order-of-operations that `mutate` exists to own (flush, commit, `ensureSubscribers`, publish), and it puts the only hand-rolled `eventBus.publish` in the codebase in the one module with two audiences.
   The next write a Participant is given (#56's attachment) would copy it.
   The precedent that points this way is ADR 0009's: a Person's own credential writes (`participants/service.ts` `acceptInvite`, `login`) skip `mutate` entirely.
   They are also the reason not to follow it here - they publish nothing, and a Chat Message must publish.
2. **Give the Recorder a nullable actor** - chosen.

The change is three lines of type and one guard:

- `Recorder`'s `actorId` becomes `string | null`.
  `DomainEvent.actorId` is **already** `string | null` (`bus.ts:14`), `activity_events.actor_id` is a nullable `set null` foreign key, `activityRepo` left-joins `user`, and the only subscriber (`impact/subscriber.ts`) never reads the actor.
  Nothing downstream moves.
- `Recorder.push` (the private path behind `created/updated/deleted`) throws when `actorId` is null.
  An actor-less mutation may signal and may not record.
  The failure is a programmer error, a plain `Error`, not a `DomainError`, so `runValidated` does not catch it and the action rejects rather than returning `{ ok: false }` - which is what a bug of this kind deserves.
  It is thrown when the event is queued, before `flush` writes anything, and it aborts the transaction, so any row the service already inserted rolls back with it.
  This is what keeps the nullable actor from quietly becoming a hole in the Project's history.
- `mutate` keeps its exact signature. A sibling `mutateAsParticipant(pctx, fn)` takes a `ParticipantCtx`, and passes `null` for both the actor and `via`.
  `via` is null because the `Via` vocabulary names the Assistant, Reflection and `system` acting for the User; a Participant is not acting for anyone, and adding a value would need an enum migration.

`actorId: null` rather than the Person's id, because a subscriber reading `actorId` cannot tell a Person id from a User id, and `activity_events.actor_id` means "a User" everywhere else.
The Chat Message row names its author; the event is a notification, not a payload (ADR 0010).
This needs two edits to AGENTS.md - the "every write goes through `mutate(ctx, …)`" sentence itself, which is no longer the whole rule, and the actor - plus a section in ADR 0010.

## What this PR adds

### 1. `mutateAsParticipant` (`src/server/core/mutation.ts`)

`mutate` and `mutateAsParticipant` both delegate to one private `run(db, actorId, via, fn)`, so the transaction/flush/publish order has a single implementation.

### 2. `participantMessagingService.postMessage` (`src/server/modules/messaging/service.ts`)

```ts
postMessage: (pctx: ParticipantCtx, { text, ...ref }: RoomRef & { text: string }) =>
  mutateAsParticipant(pctx, async (tx, rec) => { … });
```

First line inside the transaction is `assertParticipates(tx, pctx.person.id, ref)` - the seam, inside the transaction rather than before it, so the Person and the Room are read in the same snapshot as the insert.
This is not a lock and does not need to be: `postMessage` has no read-modify-write invariant of the kind `addParticipant` locks for.
A Room deleted between the check and the insert is refused by `room_messages_room_fk`, and a Person deleted between them is refused by the `author_person_id` foreign key.
The one race left open is a Person removed from a Room mid-write, which no code path can do today - there is no `removeParticipant`.

`assertParticipates` changes its return type from `RoomRow` to `{ room, person }`.
It already reads the Person; the alternative is `peopleRepo.findById` a second time inside `postMessage` purely to snapshot `person.name`.
Two call sites (`listMessages` and the new one) and one test assertion (`service.test.ts:344`) move with it.
`workspace` does not use it.

`postMessage` checks no credential state, deliberately.
ADR 0009 defers revocation: no credential version exists, and a PM who must cut off access deletes the Person, which `assertParticipates` catches on the next read.
A signed cookie therefore outlives a password reset, exactly as it already does for the Participant's reads.

The rest mirrors the PM's `postMessage` exactly: trim, `ValidationError` on empty, insert with `authorPersonId` and the `authorName` snapshot, then the same `rec.signal("chat_message.created", …)` with the same `entityLabel` (the Room's label, never the text).
`roomLabel` stays the one implementation.

Two doc comments become false with this write and are corrected: the PM's `postMessage`, which says a Person session "arrives with #54 and #55", and `participantMessagingService`'s own block, which says "this service reads only".

### 3. The action (`src/server/modules/messaging/actions.ts`)

```ts
export async function participantPostMessageAction(input) {
  const res = await runParticipantAction(postMessageSchema, input, (pctx, i) =>
    participantMessagingService.postMessage(pctx, i),
  );
  if (res.ok) revalidateProject(res.data.projectId);
  return res;
}
```

Same schema as the PM's: the shape of a Chat Message does not depend on who writes it, and a second schema is how the two come to disagree.
`projectId` in the input is not trust - `assertParticipates` compares it against the Person's own Project from the signed cookie and refuses a mismatch with `NotFoundError`.
`revalidateProject` is what puts the Chat Message on the page until #59 streams it.

### 4. The composer, for both viewers (`src/features/messaging/messages-view.tsx`)

`Composer` gains a `send: (text: string) => Promise<ActionResult<…>>` prop and the Room renders it for either viewer; the branch picks the action.
Nothing else in the component changes: the draft-keeping, the in-flight guard, the unmount guard and ⌘/Ctrl+Enter are already right and are not rewritten.
The "Only the project manager can post for now" paragraph goes, and so does the "until issue #55, cannot write" clause on the `MessagesViewer` type.
The empty-Room description for a Participant becomes "Say something to start." - the old copy told them to wait for the PM.

One defect the flow exposes: `labelOf` names an unnamed Room after `participants[0]`, and in a one-to-one Room the only Participant **is** the Participant looking at it, so they see their own name as the Room's title and "You" beside every message in it.
The PM never hits this, because the PM is not a Person.
`labelOf` and `subtitleOf` take the viewer's own `personId` and skip it, which leaves "Direct message" - the honest label for a Room whose other side has no Person row.

### 5. `scripts/seed.ts`

The `reply` helper writes through `participantMessagingService.postMessage` with a `ParticipantCtx` built from the Person, and the `#55` comment goes.
Its `person` parameter narrows to the id: the display name is now snapshotted by the service from the Person row.
Seeded People are already admitted to the Rooms they reply in (`launch` holds Jason, Sarah and Marcus; `withBen` holds Ben), so the seam passes; if it did not, the seed would fail loudly, which is the point of routing it through the service.

## Tests (Vitest + `db_test`)

A new `src/server/core/mutation.test.ts`, for the property the whole design rests on:

0. **An actor-less mutation may signal and may not record** - inside `mutateAsParticipant`, `rec.signal` publishes and `rec.created` rejects, leaving no `activity_events` row and rolling back a row the callback inserted before it.
   Nothing tests the guard otherwise, and it is what stops the nullable actor becoming a silent hole in the Project's history.

Then `src/server/modules/messaging/service.test.ts`, extending the existing `describe("the Participant path")`, which already has `member` (in `theirs`), `bystander` (in `notTheirs`) and a stale `ParticipantCtx`:

1. **A Participant's Chat Message is stored with the Person as its author** - `authorPersonId` is the Person, `authorUserId` is null, `authorName` is the Person's name, the text is trimmed, and the PM reading the same Room through `messagingService.listMessages` sees it.
2. **It publishes `chat_message.created` with a null actor and writes no Activity Event** - subscribe, assert `{ name, action: "created", entityType: "chat_message", entityId, entityLabel: "Theirs", actorId: null }`, assert `entityLabel` does not contain the text, and assert `activityRepo` row count for the Project is unchanged (the same shape as the PM's existing signal test).
3. **Everyone else is refused with `NotFoundError`** - the `bystander` posting into `theirs`, the `member` posting into `notTheirs`, the stale `ParticipantCtx` whose Person moved Project, and a `randomUUID()` Person.
   Thunks, not pre-built promises.
4. **An empty or whitespace-only body is a `ValidationError`**, and nothing is inserted.
5. **A Person removed from the Room can no longer post** - `messagingRepo` has no `removeParticipant`, so this is covered by case 3's bystander rather than by inventing a repository method for a test.

Existing tests that must keep passing unchanged: the PM's `postMessage` signal test, whose `actorId` is still `ctx.userId`.
The one assertion that moves is `service.test.ts:344`, to `.room`.
`src/test/helpers.ts` is not touched: a `ParticipantCtx` is two fields and the existing tests build it inline.

## Commits

1. `docs: plan for participant sending (#55)` - this file.
2. `feat(core): let a mutation record no actor` - `Recorder` nullable actor + guard + `mutateAsParticipant` + `mutation.test.ts`.
3. `feat(messaging): a Participant of a Room can send a Chat Message` - `assertParticipates` returning `{ room, person }`, the service, the action, the tests.
4. `feat(messaging): give both viewers the composer` - the UI.
5. `chore(seed): write Person replies through the service` - `scripts/seed.ts`.
6. `docs: record who the actor of a Chat Message is` - a "Who the actor is" section in ADR 0010, and two amendments in AGENTS.md: the "every write goes through `mutate(ctx, …)`" sentence, which now has a Participant sibling, and the actor that sibling records.

## Verification

- `npx vitest run` against `db_test` on 5434, `npm run typecheck`, `npx eslint --max-warnings=0`, `npm run format:check`.
- **ui-proof** (user-visible): re-seed, `BETTER_AUTH_URL=http://localhost:<port> npm run dev -- -p <port>`, two Playwright contexts - the PM at `/projects/<id>/messages` and Jason at `/m/<id>/login` - Jason sends, the PM reloads and sees it, and the PM sends and Jason sees it.
  Throwaway script deleted before the PR.

## Out of scope

Paging (#60), SSE (#59), attachments (#56), a length cap on a Chat Message, typing indicators, read receipts, editing or deleting.
