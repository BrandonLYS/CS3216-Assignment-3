# Issue #62 - messaging writes follow the Vantage mutate architecture

## What the issue asks

> Align the messaging implementation with existing Vantage patterns.
>
> - First line of every project-scoped service is assertOwnsProject.
> - Writes for rooms, participants, and messages go through mutate(ctx, (tx, rec) => ...).
> - Emit rec.created events for rooms, participants, and messages as appropriate.
> - No updates or deletes in the first version.

## What is already true

- #61 landed the tables and `messagingRepo`.
- #53 landed the read half of `messagingService` and the private `resolveRoom(db, userId, { projectId, roomId })`, whose first line is `assertOwnsProject` and which takes a `DbOrTx` precisely so this PR can call it inside `mutate`'s transaction.
- `ENTITY_TYPES` already contains `room`, `participant` and `chat_message`, so no enum migration is needed. There is no migration in this PR at all.

Missing: every write is still a direct `messagingRepo` call. Nothing goes through `mutate`, so no Activity Event and no domain event exists for messaging.

## What this PR adds

Three write functions on `messagingService`, each `mutate`-wrapped, each resolving through the existing `resolveRoom`.

### 1. `createRoom(ctx, { projectId, type, name })`

`assertOwnsProject` (the Room does not exist yet, so `resolveRoom` does not apply), then `messagingRepo.insertRoom` with `createdBy: ctx.userId`, then `rec.created("room", projectId, room.id, roomLabel(room))`.

`roomLabel` is `name` for a group Room and `"Direct message"` for a one-to-one one, because a one-to-one Room has no name of its own (schema.ts) and is labelled in the UI by the other Person - a Person this PR cannot name, since Participants are added separately. #54, which creates the Room and its Participant together, is where a one-to-one Room can carry the Person's name into its label.

Validation is minimal and belongs to the row, not to a UI: a group Room requires a non-empty `name`, a one-to-one Room must not carry one. `ValidationError`, per `comments/service.ts`.

### 2. `addParticipant(ctx, { projectId, roomId, personId })`

`resolveRoom`, then `assertPersonInProject(tx, projectId, personId, "personId")` (`people/service.ts:11`, already the seam that stops a Person from another Project being attached to anything; the `field` argument defaults to `"assigneeId"`, which would be the wrong field name in the error here), then `messagingRepo.addParticipant`.

`assertPersonInProject` no-ops on a null `personId`, so `postMessage`'s caller-facing type requires one, and the service reads the Person row for the snapshot name with `peopleRepo.findById` after the check passes.

`addParticipant` is `onConflictDoNothing`, so admitting the same Person twice must not emit a second Activity Event. The repository function is changed to `.returning()`, which under Postgres yields the inserted row and an empty array on conflict, so the service can tell an insert from a no-op and `rec.created("participant", ...)` fires only on a real insert. Being quiet on a repeat is also what makes the function safe for #54 to call in a loop.

`entityId` is the `personId`: `room_participants` has a composite primary key and so no id of its own, and the Person is the thing a subscriber would watch, matching `person.deleted`. Label: the Person's name. Snapshot: `{ roomId, personId, personName }`, so the Activity Event still reads correctly after the Person row is deleted and a reader can tell which Room it was about.

### 3. `postMessage(ctx, { projectId, roomId, text })`

`resolveRoom`, then insert with `authorUserId: ctx.userId` and `authorName` snapshotted from the `user` row, then the event (below).

There is no seam for reading a User today: `Ctx` carries only `userId`, and Comments avoid the question by joining `user` at read time. `room_messages.authorName` is `NOT NULL` by design (ADR 0006: attribution survives the row), so the name must be read at write time. The lookup goes in `messagingRepo.findAuthorName(db, userId)` rather than a bare `tx.select()` in the service, because table access belongs in a repository, and a module reading the `user` table from its own repository is what `comments/repository.ts:12` already does. A new `users` module for one column would be the heavier answer to the same question. A missing `user` row raises `NotFoundError("User")` rather than failing the `NOT NULL` insert with a raw driver error; it is unreachable behind a session, and it is one line.

The author is the PM, and only the PM: a Chat Message written by a Person needs a Person session, which arrives with #54's invite flow and #55. `authorPersonId` stays unused here, and the `num_nonnulls(...) <= 1` check keeps both paths honest when #55 lands.

Out of scope, deliberately: the 4,000-character cap is #57, attachments are #56. This PR only rejects an empty or whitespace-only `text`, which the `room_messages_content_ck` constraint would reject anyway.

### 4. The Chat Message event is published, not persisted - and this needs an ADR

`rec.created` writes an `activity_events` row **and** publishes a domain event. For Rooms and Participants that is right: they are rare, structural, and belong in the Project's history.

For Chat Messages it is wrong, in order of weight:

1. An Activity Event for a Chat Message is a copy of the Chat Message. `activity_events` exists to record _change_: one row per changed field, so a reader can see what is different since they last looked (ADR 0005). A Chat Message is never updated and never deleted, so `created` is the only event it can ever have, and that row would carry the same project, author, timestamp and text preview that `room_messages` already stores immutably. Compare `comment.created`, which earns its row: its snapshot carries the parent `{entityType, entityId}` that `historyForEntity`'s jsonb query needs (`comments/service.ts:22`). A Chat Message has no parent item to point at, so the snapshot would only point at itself.
2. Chat volume is unlike every other entity's. `activityRepo.recentForProject` (`activity/service.ts:22`) and `recentForProjects` (`:25`, behind the dashboard through `workspace/queries.ts:114`) are unfiltered `ORDER BY occurred_at DESC LIMIT 50/30`, so one busy Room would evict every Task, Risk and Decision event from both feeds. This is repairable with one `ne()` in two queries, which is why it is the second reason and not the first - but it is a filter every future reader of `activity_events` would have to remember, and forgetting it is silent.

Not a reason: leaking message text. Every reader of `activity_events` is behind `assertOwnsProject`, so a Participant never sees it. The duplication is the problem, not the exposure.

So `postMessage` uses `rec.signal("chat_message.created", { action: "created", ... })`: published after commit, never persisted. `action` is passed explicitly because `Recorder.signal` defaults it to `"updated"` (`core/mutation.ts:46`), which would name the event `chat_message.created` while its `action` field said otherwise.

The signal carries `entityId` (the Chat Message id), `entityLabel` (the Room's label, not the text - the text stays in `room_messages` where a subscriber reads it by id) and `changes: []`. It cannot carry a `snapshot` or an `activityEventId`: `Recorder.signal`'s parameter type excludes the first (`core/mutation.ts:40`) and the second is only assigned while flushing rows (`:92`). #59's SSE fan-out and the future AI layer both refetch by id, so neither is needed; ADR 0010 states this explicitly so a later subscriber is not surprised.

AGENTS.md currently states that `project.deleted` is the _only_ exception to "call `rec.created/updated/deleted`". This PR therefore also:

- adds `docs/adr/0010-chat-messages-publish-without-an-activity-event.md` recording the decision, the reasons above, what the event carries, and the rejected alternative (write the row and teach every activity reader to filter `entity_type <> 'chat_message'`);
- amends the AGENTS.md sentence to name both exceptions.

`CONTEXT.md` gains nothing new: Room, Participant and Chat Message were defined by #61.

### 5. `assertParticipates`

Still not added. ADR 0009 assigns it to this issue, but it guards the Person path and there is no Person session until #54. A guard with no caller cannot be tested honestly, and this PR's writes are all PM writes behind `assertOwnsProject`. The ADR consequence is updated to point at #54 so the paper trail matches.

## Commits

1. `Record messaging writes through mutate` - the three service functions, the `addParticipant` repository change, service tests.
2. `Record why a Chat Message writes no Activity Event` - ADR 0010 and the AGENTS.md amendment.

## Tests

Added to `src/server/modules/messaging/service.test.ts`:

- `createRoom` writes the Room and one `room.created` Activity Event, and rejects a group Room with no name and a one-to-one Room with one.
- `addParticipant` emits one `participant.created` event; a second call emits none and leaves one row.
- `addParticipant` refuses a Person from another Project (`assertPersonInProject`).
- `postMessage` stores `authorUserId`, the `authorName` snapshot and the Room's `projectId`; rejects blank text.
- `postMessage` publishes `chat_message.created` on the event bus (subscribe in the test, as `comments/service.test.ts` does) with `action === "created"`, and writes **no** `activity_events` row, asserted by counting rows for the Project before and after.
- `createRoom` and `addParticipant` do write their Activity Event, checked through `activityRepo.recentForProject`, including the `participant` event's label and snapshot.
- All three writes raise `ForbiddenError` for a PM who does not own the Project; `addParticipant` and `postMessage` raise `NotFoundError` for a Room in another Project.

In `repository.test.ts`: `addParticipant` returns the inserted row the first time and an empty array on a repeat, which is the contract the service now depends on.

## How to test

```
npm run typecheck
npm run lint
DATABASE_URL=postgres://pm:pm@localhost:5434/pm_test npx vitest run
```

No migration and no UI, so no ui-proof.
