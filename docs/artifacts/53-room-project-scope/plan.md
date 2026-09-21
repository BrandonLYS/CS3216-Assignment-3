# Issue #53 - scope every room to a project

## What the issue asks

> All chat rooms are project-scoped. Both group rooms and one-to-one conversations are tied to a single project.
>
> - Authorization starts with assertOwnsProject.
> - Room records include projectId.

## What is already true after #61

- `rooms.projectId` is `NOT NULL` with `ON DELETE CASCADE`, and `rooms_project_idx` covers it.
- `room_messages.projectId` is denormalised but pinned to the Room by the composite foreign key `(room_id, project_id) -> rooms(id, project_id)`, so a Chat Message cannot claim a Project its Room does not belong to.
- `messagingRepo.listRoomsForProject` and `listRoomsForPerson` already filter by Project.

So the storage half of the issue is done.
What is missing is the second bullet: there is no caller-facing entry point at all, so nothing yet _starts_ with `assertOwnsProject`, and three repository functions (`findRoomById`, `listParticipants`, `listMessages`) take a bare `roomId` and will happily read across Projects.

## What this PR adds

A read seam for messaging, guarded by `assertOwnsProject`, plus the repository changes needed so a Room can only be reached through its Project.

Writes are deliberately out of scope: `mutate`, `rec.created` and the write services are issue #62, and the PM flows that call them are #54 and #55.

### 1. Repository: no unscoped Room lookup

- `findRoomById(db, id)` becomes `findRoom(db, projectId, id)`, filtering on both columns.
  This is the change that makes the scoping structural instead of a convention: with no unscoped reader in the module, a future service cannot resolve a Room without naming the Project it expects.
- `insertMessage(db, roomId, values)` becomes `insertMessage(db, room: Pick<RoomRow, "id" | "projectId">, values)`.
  Today it re-reads the Room to copy `projectId`; that read is the one unscoped lookup left. Every caller reaches `insertMessage` through a service that has already resolved the Room against its Project, so passing the row through removes both the extra query and the loophole. `projectId` still comes from the Room and never from the caller.
- `listMessages(db, roomId, page)` becomes `listMessages(db, projectId, roomId, page)` and filters on both columns, the way `commentsRepo.listForEntity` filters on the denormalised `comments.projectId`. A mismatched pair then returns nothing instead of another Project's history.
- `listParticipants` and `isParticipant` keep taking a bare `roomId`, because `room_participants` has no `project_id` column to filter on. They are reached only after the service has resolved that Room inside its Project, and a `projectId` argument they could not use would suggest a check they do not make. A comment on both says so.

### 2. `src/server/modules/messaging/service.ts` (new)

Every function's first line is `assertOwnsProject(db, ctx.userId, projectId)`, per ADR 0005 and ADR 0009.

- A private `resolveRoom(db: DbOrTx, userId, projectId, roomId)` does both steps: `assertOwnsProject`, then `findRoom`, then `NotFoundError("Room")`. It takes `DbOrTx` rather than `Ctx`, following `resolveItem` and `getOwned` in `comments/service.ts`, so the write services of #62 can call it inside `mutate`'s transaction instead of refactoring it.
- `listRooms(ctx, { projectId })` - the PM's Rooms in one Project.
- `getRoom(ctx, { projectId, roomId })` - `NotFoundError("Room")` when the Room does not exist _or_ belongs to another Project. One error for both on purpose: a PM who owns Project A must not be able to tell whether a Room id exists in Project B. This is a deliberate deviation from `comments/service.ts`, which raises `ValidationError` for a foreign item; there the id is a payload field being validated, whereas a Room is the thing being addressed, so "not found" is the honest answer.
- `listParticipants(ctx, { projectId, roomId })` - resolves the Room first.
- `listMessages(ctx, { projectId, roomId, before, limit })` - resolves the Room first. `limit` is clamped to `MESSAGE_PAGE_MAX` (100) so a caller cannot ask for the whole history; the 50/20 page sizes of #60 are a UI decision and stay out of here. The constant is declared in `service.ts`, not in `src/shared/domain/index.ts`: that file holds vocabulary the browser shares, and a server-side page cap is not something the browser is told.

`assertParticipates`, the second seam ADR 0009 names (the ADR assigns it to #62; the invite flow that gives it a caller is #54), is **not** added here. A guard with no caller cannot be tested honestly.

No `validation.ts` and no `actions.ts` in this PR, for the same reason: nothing calls a messaging action until the route lands in #58, and zod schemas written now would be guesses at inputs that PR will define. The service takes typed inputs declared next to it.

### 3. Tests

`src/server/modules/messaging/service.test.ts`, following `comments/service.test.ts` (real database, `makeCtx` / `makeProject`):

- `getRoom` returns the Room, and `listMessages` its Chat Messages newest first, for the owning PM.
- `listRooms` returns only the Rooms of the Project asked for, with a second Project seeded to prove it.
- `getRoom` throws `NotFoundError` for a Room id that exists in another Project.
- `getRoom`, `listParticipants` and `listMessages` throw `ForbiddenError` for a second User's Project.
- `listMessages` clamps an over-large `limit`.
- `listParticipants` returns the People admitted to that Room only.

`repository.test.ts` is updated for the three changed signatures (`findRoom`, `insertMessage`, `listMessages`), not rewritten, and gains one case: `findRoom` and `listMessages` with the wrong `projectId` return nothing.

## Commits

1. `Scope messaging repository reads to a project` - repository signature changes plus the `repository.test.ts` updates.
2. `Add project-scoped messaging read service` - service and service tests.

## How to test

```
npm run typecheck
npm run lint
DATABASE_URL=postgres://pm:pm@localhost:5434/pm_test npm test -- src/server/modules/messaging
```

No migration, no UI, so no ui-proof.
