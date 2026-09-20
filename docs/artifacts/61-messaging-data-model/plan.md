# Plan - #61 Messaging: data model for rooms, participants, and messages

Branch `feat/61-messaging-data-model`, worktree `/Users/qang/projects/CS3216-A3-wt/61-messaging-data-model`.

This is the first issue of the Messaging backlog (#53-#62).
It delivers vocabulary, tables, a migration, a repository and an ADR for participant identity.
No service, no server action and no UI: those arrive in #62 (service architecture), #54 (room creation), #55 (sending) and #58 (route).

## 1. Summary

Three new tables - `rooms`, `room_participants`, `room_messages` - plus credential and invite columns on the existing `people` table.

The issue text asks for tables named `rooms`, `room_participants` and `messages` with a `userId` on participants and messages.
Two facts in the codebase make a literal reading impossible, and both are settled below rather than left to the implementer:

- **`messages` is taken.** `src/server/modules/assistant/schema.ts` already defines a `messages` table (one turn in an Assistant Conversation), and `CONTEXT.md` already binds the word **Message** to that concept. The chat table is therefore `room_messages` and the domain term is **Chat Message**.
- **`userId` cannot mean a better-auth User.** ADR 0002 makes tenancy single-user: a Project has exactly one owning User and `assertOwnsProject` resolves `findByIdForOwner(projectId, userId)`. A participant is a **Person** (the existing per-project directory, ADR 0004), not a User. Per the product decision recorded in ADR 0009 below, the PM is the single User and a Person signs in through a separate, messaging-only surface.

## 2. Domain and design decisions

### Vocabulary (`src/shared/domain/index.ts`, `CONTEXT.md` under `### Discussion`)

- **Room**: A named place inside one Project where the PM and selected People exchange Chat Messages. Either a group room or a one-to-one room. _Avoid_: channel, chat, thread, conversation.
- **Participant**: A Person admitted to a Room by the PM. _Avoid_: member, user, recipient.
- **Chat Message**: One plain-text entry in a Room, optionally carrying a single media attachment. Immutable: never edited, never deleted. _Avoid_: message (reserved for an Assistant turn), post, chat.

`ROOM_TYPES = ["group", "one_to_one"]` and a `room_type` pg enum.

`Room` and `chat_message` are added to `ENTITY_TYPES` (a Drizzle enum migration) because #62 requires `rec.created` Activity Events for rooms, participants and messages, and `activity_events.entity_type` is that enum.
`participant` is added too, for the participant-added event.

### Tables (`src/server/modules/messaging/schema.ts`)

`rooms`

- `id` (`id()`), `projectId` -> `projects.id` cascade, `type` (`room_type`), `name` (text, nullable - a one-to-one room takes its name from the other Person), `createdBy` -> `user.id` set null (the PM; #54 makes the PM the only creator), `createdAt`.
- Index on `projectId`.
- Unique on `(id, projectId)`, which carries no new meaning on its own but lets `room_messages` hold a composite foreign key (see below).
- `name` is not in the issue's column list. It is added because #58 renders a room list, which needs a label, and a group room has no other source for one. This is the third and last deviation from the issue text, alongside `room_messages` and `personId`.

`room_participants`

- `roomId` -> `rooms.id` cascade, `personId` -> `people.id` cascade, `addedAt`.
- Primary key `(roomId, personId)`, so adding the same Person twice is a no-op with `onConflictDoNothing`.
- Index on `personId` for "rooms this Person can see".

`room_messages`

- `id` (`id()`), `roomId`, `projectId`, `text` (nullable), `attachmentUrl` (nullable), `mimeType` (nullable), `createdAt`.
- Author, following the Comment attribution pattern (ADR 0006): `authorPersonId` -> `people.id` set null, `authorUserId` -> `user.id` set null, and `authorName` (text, not null) captured at write time so attribution survives the Person being removed.
- Check constraint `room_messages_content_ck`: `num_nonnulls(text, attachment_url) >= 1`, enforcing the issue's "at least one must be present" in the database, not only in zod.
- Check constraint `room_messages_author_ck`: `num_nonnulls(author_person_id, author_user_id) <= 1`. **At most one, not exactly one.** Both foreign keys are `on delete set null`, so deleting a Person must be able to leave both columns null; `authorName` is what preserves attribution, exactly as ADR 0006 prescribes for `comments.saidByName` ("removing a contractor never erases what they said"). An "exactly one" check would make deleting a Person fail outright.
- Check constraint `room_messages_attachment_ck`: `num_nonnulls(attachment_url, mime_type) <> 1`, so the pair is both null or both set.
- Index on `(roomId, createdAt DESC, id DESC)` - the exact order #60 pages through. Drizzle needs `sql` expressions for the descending columns.

**Project scope invariant.** `projectId` is denormalised onto `room_messages` so a read can filter by Project before touching `rooms` and so `assertOwnsProject` has a column to check without a join. `comments.projectId` and `activity_events.projectId` denormalise for the same reason, so the pattern is consistent with the codebase. Unlike those two, this column duplicates a fact owned by `rooms`, so it is held to the room by a composite foreign key rather than a plain reference to `projects`; the row then cannot disagree with its Room. `insertMessage` additionally derives `projectId` from the loaded Room instead of trusting its caller.

The foreign key is declared `foreignKey({ name: "room_messages_room_fk", columns: [t.roomId, t.projectId], foreignColumns: [rooms.id, rooms.projectId] }).onDelete("cascade")`. **The cascade is not optional**: Postgres defaults a foreign key to `NO ACTION`, so without it, deleting a Room - and therefore deleting a Project - fails with a foreign key violation and test 7 cannot pass. `roomId` keeps no separate `.references(rooms.id)`; the composite key is the only reference, so there is one cascade path and not two.

This is also why `rooms` needs the `unique(id, projectId)` from above. Postgres requires the referenced columns of a foreign key to be covered by a unique index whose column list matches exactly; the primary key on `rooms(id)` covers only `id`, so without the extra unique the migration fails with "there is no unique constraint matching given keys for referenced table rooms". No foreign key from `room_messages.projectId` to `projects` is needed - the cascade reaches Chat Messages through their Room.

`people` gains (this issue owns the column, #54 owns the flow that fills it)

- `email` already exists and becomes the login identifier; a partial unique index on `(projectId, lower(email))` where email is not null, so one Person per address per Project.
- `passwordHash` (text, nullable) - null until the Person accepts an invite.
- `inviteTokenHash` (text, nullable), `inviteExpiresAt` (timestamptz, nullable) - a single-use invite link, stored as a SHA-256 hash so the database never holds a usable token.

### Why `text` is nullable but capped later

#57 sets the 4000-character limit and the plain-text rule.
This issue only makes the column nullable and adds the "at least one of text or attachment" constraint, both of which #61 states outright.
The length check belongs with #57 so that issue has something to do.

### Repository (`src/server/modules/messaging/repository.ts`)

Thin, mirroring `commentsRepo`: `insertRoom`, `findRoomById`, `listRoomsForProject`, `listRoomsForPerson`, `addParticipant`, `listParticipants`, `isParticipant`, `insertMessage`, `listMessages(roomId, { before, limit })`.
`listMessages` takes a keyset cursor (`before` = `{ createdAt, id }`) rather than an offset, because #60 pages backwards through a stream that is still being appended to and an offset would skip or repeat rows.
No service in this PR, so nothing imports the repository yet; the tests do.

### ADR 0009 - Messaging participants are People with a login

New file `docs/adr/0009-messaging-participants-are-people.md`, status accepted.
Records: the PM remains the single User of a Project (ADR 0002 stands); a Person may be given credentials on their own row and can then sign in to a messaging-only surface that exposes their Rooms and nothing else; `assertOwnsProject` stays the authorization seam for every PM path, and a second seam (`assertParticipates`, added in #62) covers the Person path.

The ADR must also address the column it sits next to. `people.userId` already exists and already points at `user.id`; ADR 0004 calls it "the only cross-project hook". It is deliberately **not** the login mechanism here: promoting a Person to a real `user` row would give them a workspace, Projects of their own and everything `assertOwnsProject` guards, which is the opposite of "can only see the messages". The two coexist without interacting - `userId` stays a link to a PM who happens to appear in someone else's roster, `passwordHash` is a messaging-only credential - and the ADR says so explicitly so a later reader does not try to merge them.

Consequences: a Person's credentials are per Project, so the same human on two Projects signs in twice; the member surface must never render Vantage navigation; `room_messages.authorUserId` exists only so PM-authored messages keep a real foreign key.

## 3. Changes, grouped into commit points

### Commit 1 - `feat(domain): Room, Participant and Chat Message vocabulary`

- `ROOM_TYPES`, `CHAT_MESSAGE_MAX_LENGTH` placeholder left to #57, new `ENTITY_TYPES` values (`room`, `participant`, `chat_message`) in `src/shared/domain/index.ts`.
- `roomTypeEnum` in `src/server/db/enums.ts`.
- `CONTEXT.md`: three entries under `### Discussion`, and a sentence on the existing **Message** entry pointing at **Chat Message** so the two are never confused.
- `docs/adr/0009-messaging-participants-are-people.md`.

### Commit 2 - `feat(messaging): rooms, participants and chat messages schema`

- `src/server/modules/messaging/schema.ts`, exported from `src/server/db/schema.ts`.
- `people` credential and invite columns in `src/server/modules/people/schema.ts`.
- Every constraint is declared **in the schema**, never hand-written into the SQL. This repo already generates both features: `src/server/modules/decisions/schema.ts` declares `check("decision_sources_owner_ck", sql\`num_nonnulls(...) = 1\`)` and `uniqueIndex("decision_edges_superseded_by_uq").on(t.fromId).where(...)`, and drizzle-kit emitted both into `drizzle/0007_decisions.sql` and recorded them in `drizzle/meta/0007_snapshot.json`. Hand-editing the SQL would leave the snapshot without the constraints, and a later issue re-declaring the same `check()` would then generate an `ADD CONSTRAINT` for one that already exists and fail the migration.
- The email index is likewise declared: `uniqueIndex("people_project_email_uq").on(t.projectId, sql\`lower(${t.email})\`).where(sql\`${t.email} is not null\`)`.
- `npm run db:generate` -> `drizzle/0012_messaging.sql`, committed exactly as generated.
- `npm run db:migrate` against both `db` and `db_test`.

### Commit 3 - `feat(messaging): repository for rooms, participants and messages`

- `src/server/modules/messaging/repository.ts`.
- `src/server/modules/messaging/repository.test.ts`.

## 4. How to test

Vitest against the `db_test` container (`npm test`), using `makeCtx` and `makeProject` from `src/test/helpers` exactly as `src/server/modules/comments/service.test.ts` does.

`src/server/modules/messaging/repository.test.ts` covers:

1. Insert a group Room, read it back by id and in `listRoomsForProject`.
2. `addParticipant` twice for the same Person inserts one row (primary key + `onConflictDoNothing`).
3. `listRoomsForPerson` returns only Rooms the Person participates in, and not a Room in the same Project they were not added to.
4. A Chat Message with `text` and no attachment inserts; one with an attachment and no text inserts; one with neither is **rejected by the database** (assert the insert rejects, proving the check constraint, not just application code).
5. A Chat Message with `attachmentUrl` but no `mimeType` is rejected.
6. A Chat Message with **both** `authorPersonId` and `authorUserId` is rejected. A Chat Message with neither is accepted, because that is the state a deleted Person leaves behind; it still carries `authorName`, which is not null.
7. Deleting the Project cascades away its Rooms, participants and Chat Messages, mirroring the existing "deletes a project and leaves nothing behind" test in `src/server/modules/projects/service.test.ts`.
8. `listMessages` returns newest first and the keyset cursor pages without overlap when a new Chat Message is appended between pages.
9. Deleting the Person succeeds, and the Chat Message survives with `authorPersonId` null and `authorName` intact. This is the pairing that forces the author check to be "at most one".
10. `insertMessage` writes the Room's `projectId`, and a row whose `projectId` disagrees with its Room is rejected by the composite foreign key.

`makeCtx` returns `{ db, userId }` where `db` is a full drizzle handle, so the tests can call the repository with payloads that application validation would never produce and hit the raw constraints directly.

**CI does not run tests.** `.github/workflows/ci.yml` runs only `format:check`, `eslint --max-warnings=0` and `typecheck`. Everything in this section is a local gate; the constraint tests prove nothing on a pull request unless run by hand. Run `npm test` locally before pushing and paste the result into the PR.

Also run: `npm run typecheck`, `npm run lint`, `npm run format:check`, and `npm run db:migrate` on a fresh database to prove the migration applies from empty.

UI proof does not apply: this issue adds no user-visible surface.

## 5. Risks

- Adding values to the `entity_type` enum is a migration other modules read; `0011_add_broken_to_assumption_state.sql` is the precedent for an additive enum change and is followed here. Nothing switches exhaustively on `EntityType`: `ITEM_PATH` in `decisions/answers.ts` is a `Record<string, ...>`, `enrich.ts` falls back to `labelFor`, and `HISTORY_ENTITY_TYPES` is a separate opt-in subset, so the new values cannot break the activity feed or history UI.
- The partial unique index on `people(projectId, lower(email))` would fail to apply against a database already holding a duplicate address in one Project. `scripts/seed.ts` never sets `email` on any `createPerson` call, so the seed cannot trip it, but a developer's hand-made data could. Run the migration against a seeded `db` and `db_test` before pushing.
