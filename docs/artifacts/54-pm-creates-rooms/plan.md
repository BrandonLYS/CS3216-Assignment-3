# Issue #54 - the PM creates Rooms and selects Participants, and a Participant can reach them

## What the issue asks

> Only project managers create rooms. Group rooms are created by a PM, who selects participants from the project.
>
> - One-to-one chats can only be started by a PM to a project member.
> - Members cannot start member-to-member one-to-one chats.

The user has additionally ruled that the invite link, the Person login, the `assertParticipates` seam and the Participant viewer of the messages route all land in this issue.
A Participant surface nobody can sign in to cannot be tested, and `assertParticipates` cannot be tested without a caller (ADR 0009, and the closing section of the #62 plan).

ADR 0009 credits the shared `/projects/[id]/messages` route to #58.
#58 landed the PM half of that route and is merged; the viewer branch is what remains, and it lands here.

## What is already true

- `rooms`, `room_participants`, `room_messages` exist (#61).
- `people` already carries `password_hash`, `invite_token_hash` and `invite_expires_at`, and `people_project_email_uq` already makes the email unique per Project among People who hold an invite or a password (migration `drizzle/0012_messaging.sql`).
  **No migration is needed in this PR**, so the `_journal.json` trap is not in play.
- `messagingService` has `listRooms`, `listRoomsWithParticipants`, `getRoom`, `listParticipants`, `listMessages`, `createRoom`, `addParticipant`, `postMessage`, all behind the private `resolveRoom(db, userId, ref, lock)` whose first line is `assertOwnsProject`.
- `messagingRepo.listRoomsForPerson` and `messagingRepo.isParticipant` were written by #61 and are still unused.
  They are the reads this PR turns on.
- `/projects/[projectId]/messages` renders `MessagesView`: Room list, pane, composer.
  It has no way to create a Room and no way to admit a Person; the demo data exists only because `scripts/seed.ts` calls the service directly.
- `peopleRepo.findCredentialsByEmail(db, projectId, email)` exists and is the only read that returns credential columns.
- `src/proxy.ts` redirects everything outside `PUBLIC = {"/login","/signup"}` to `/login` when there is no better-auth cookie.
- **Two** layouts stand between a request and the messages page: `(app)/layout.tsx` (`requireUser` + `AppShell`) and `(app)/projects/[projectId]/layout.tsx` (`ctxForCurrentUser`, `ProjectHeader`, `AssistantDock`, and an `assistantService.conversation` read).
  Both redirect a caller without a better-auth session, and the second renders exactly the chrome ADR 0009 forbids a Participant.
- `formToObject` (`core/validation.ts:33`) **already** turns repeated form keys into an array.
- `better-auth/crypto` exports `hashPassword(password)` and `verifyPassword({ hash, password })` (scrypt), verified against the installed package.
  No new dependency.
- `apiTokensService` is the precedent for a credential written without `mutate`, and `features/settings/api-tokens.tsx` is the precedent for a secret revealed exactly once.

## What this PR adds

Five things, in dependency order: a Participant session, the credential service behind it, the `assertParticipates` seam and the Participant reads, the PM's Room-creation UI, and the Participant's view of the same route.

### 1. Participant session (`src/server/auth/participant-session.ts`)

Not better-auth: `session.userId` is a foreign key to `user`, and ADR 0009 forbids a Participant ever having a `user` row.

Cookie `vantage_participant`, `httpOnly`, `sameSite: "lax"`, `path: "/"`, `secure` when `NODE_ENV === "production"`, `maxAge` 30 days.
Value is `<payload>.<signature>`, where `payload` is base64url JSON `{ personId, projectId, exp }` and `signature` is HMAC-SHA256 of the payload string under `BETTER_AUTH_SECRET`.
Verification decodes the signature to a fixed-length buffer and bails out before `timingSafeEqual` if the length differs, because `timingSafeEqual` throws on unequal lengths.
A payload past `exp` is rejected even though the cookie would also have expired, because the cookie's lifetime is under the client's control and the signature is not.

Exports:

- `signParticipantCookie(session)` / `readParticipantCookie(value)` - pure, no I/O, unit-testable without a database.
- `getParticipantSession()` - `cache()`d like `getSession()`, reads the cookie jar, returns `{ personId, projectId } | null`.
  It does no database work; a Person deleted or moved since sign-in is caught by the seam in §3, which reads the row anyway.
- `setParticipantCookie(session)` / `clearParticipantCookie()`, called from server actions.
  Next 16 allows `cookies()` writes inside a server action, which is how `nextCookies()` already persists the better-auth session.

`projectId` is in the payload because credentials are per Project (ADR 0009).
The signature covers it, so a cookie minted for one Project cannot be replayed against another even when the same human is a Person in both.

### 2. Credentials: invite, accept, login (`src/server/modules/messaging/participants/`)

A folder inside the messaging module rather than a new top-level module: this is the messaging login, and ADR 0009 puts it there.
It holds `service.ts`, `actions.ts`, `validation.ts` and `service.test.ts`.
The reads and writes it needs join `peopleRepo` (`findCredentialsByEmail` is already there; `findByInviteTokenHash`, `setInvite` and `acceptInvite` are added beside it) so table access stays in a repository.

**`createInvite(ctx, { projectId, personId })`** - the PM's write, so `assertOwnsProject` first, inside `mutate`, then `assertPersonInProject(tx, projectId, personId, "personId")`.
The second check is not optional: `assertOwnsProject` only proves the PM owns the Project they named, and an `UPDATE … WHERE id = $personId` alone would let a PM mint a credential on any Person row in the database.
The token is `randomBytes(24).toString("base64url")` stored as `createHash("sha256")` - the `api-tokens` scheme exactly - and the plaintext is returned once and never stored.
`inviteExpiresAt` is 7 days out.
Regenerating overwrites the hash, which invalidates the previous link and is also how a PM re-issues credentials to a Person who forgot their password.
It does **not** end a session that Person already holds; see §6.

The Person must have an email, because the email is the login identifier.
Without one this is a `ValidationError`, not a crash on the unique index.
A different Person in the same Project who already **holds credentials** on the same address, compared with `lower()`, is also a `ValidationError`: that is exactly the predicate of `people_project_email_uq`, and two uninvited People sharing an address stay legal, which is the case the partial index was written to permit.
The pre-check is for the message, not for the guarantee.
Two `createInvite` calls racing on one address still collide on the index, so the service also maps a `23505` on `people_project_email_uq` (`error.cause.constraint_name`, as `repository.test.ts` already reads it) to the same `ValidationError`.

The Activity Event is `rec.updated("person", projectId, personId, name, [{ field: "messaging_invite", oldValue: null, newValue: "sent" }])`: a hand-built change, never `diffFields`, because the real diff of that row would write the token hash and the password hash into `activity_events`.
The Person is a Project item and the PM did this, so the Project's history should carry it.
`person` is in `ENTITY_TYPES` but not in `HISTORY_ENTITY_TYPES`, so no `HISTORY_FIELDS` entry is needed and `activity-item.tsx` falls back to `labelFor`.
The field is `messaging_invite` and not `messagingInvite` because `labelFor` splits on `_` only, so the camel-case spelling would render as "messaginginvite".

**`acceptInvite({ token, password })`** - written by the Person, so no `mutate` and no Activity Event.
`activity_events.actor_id` is a foreign key to `user.id`, so there is no honest actor to record, and a credential is not a change to the Project.
This is the reasoning ADR 0007 and ADR 0008 already use for the Assistant's own documents and `apiTokensService` uses for tokens; ADR 0009 gains the matching consequence line.

The whole operation is one statement:

```sql
UPDATE people SET password_hash = $1, invite_token_hash = NULL, invite_expires_at = NULL
WHERE invite_token_hash = $2 AND invite_expires_at > now() RETURNING id, project_id, name
```

No row back means the token is unknown, already used or expired, and all three give the identical `ValidationError("This invite link is no longer valid")`, so a probe learns nothing and two racing tabs cannot both succeed.

**`login({ projectId, email, password })`** - `findCredentialsByEmail`, then `verifyPassword({ hash, password })`.
A missing Person, a Person with an invite but no `passwordHash`, and a wrong password all give the same `ValidationError("Incorrect email or password")`.
The message is identical but the timing is not, because the first two return before scrypt runs; that oracle is accepted alongside the missing rate limiter below and recorded in the ADR rather than papered over with a dummy hash.
Both functions return the session payload for the caller to set as a cookie.

Passwords are at least 12 characters with no other rule, matching the demo password's shape and better-auth's default posture.
The accept form has a confirm field, checked in the Zod schema with `refine`.

Rate limiting is out of scope and recorded as such: Vantage has no rate limiter anywhere, and introducing one for this surface alone is a larger decision than this issue.

### 3. Actions that do not have a User (`src/server/core/action.ts`)

`runAction` hard-codes `ctxForCurrentUser()`, which redirects a caller with no better-auth session - i.e. every caller of login and accept-invite.
`runAction`'s body splits into a shared `runValidated(schema, raw, fn)` that parses and maps `ValidationError`/`DomainError` to an `ActionResult`, and three thin wrappers over it:

- `runAction(schema, raw, fn)` - unchanged behaviour and unchanged signature, builds a `Ctx`.
- `runOpenAction(schema, raw, fn)` - no session at all, for `loginAction` and `acceptInviteAction`.
- `runParticipantAction(schema, raw, fn)` - requires a Participant session and hands the service a `ParticipantCtx`, returning a `ForbiddenError` result when there is none.
  It has no caller in this PR; #55's "a Participant sends a Chat Message" is the first, and the wrapper exists now so that PR adds a service and not a seam.
  Signing out is **not** one of its callers: clearing a cookie must work for an expired or tampered one too, so `signOutAction` is a `runOpenAction` that clears unconditionally.

Neither new wrapper redirects: AGENTS.md forbids `redirect()` in an action called from a client component, so the forms navigate with `router.push` in `onSuccess`.

### 4. `assertParticipates`, and the Participant reads

In `messaging/service.ts`, beside `resolveRoom`, the second authorization seam ADR 0009 names:

```ts
export async function assertParticipates(
  db: DbOrTx,
  personId: string,
  { projectId, roomId }: RoomRef,
): Promise<RoomRow>;
```

It re-reads the Person (catching one deleted since the cookie was signed, and one whose `projectId` no longer matches), then `messagingRepo.findRoom(db, projectId, roomId)`, then `messagingRepo.isParticipant`.
Every failure is `NotFoundError("Room")` and never a "forbidden", so a Participant cannot learn which Rooms exist around them.
It is the mirror of `resolveRoom` and sits next to it so a reviewer sees the pair.

`ParticipantCtx = { db: Db; person: { id: string; projectId: string } }` is the Participant's counterpart to `Ctx`, deliberately not a `Ctx`: `Ctx.userId` is a `user.id`, and smuggling a `personId` through it would defeat `assertOwnsProject`'s only argument.

`participantMessagingService`, exported beside `messagingService`:

- `workspace(pctx)` - the Project's `{ id, name }` and the Rooms in one read, because the Participant page has no shell and must title itself.
  `projectsService.get` cannot serve it: its first line is `assertOwnsProject` and a `ParticipantCtx` has no `userId`.
  So `projectsRepo` gains `findName(db, id)` returning `{ id, name }`, and the Participant service is the only caller that reaches it without proving ownership - the Person's membership of that Project is what the `ParticipantCtx` already establishes.
  The page never selects from a table itself, so the layering rule holds.
- `listRoomsWithParticipants(pctx)` - `listRoomsForPerson`, plus `listParticipantsForProject` filtered to those Rooms, so a Participant sees the People in their own Rooms and no others.
  It projects `{ personId, name }` only: `listParticipantsForProject` also selects `email`, which is the login identifier of the People in the Room, and nothing on the Participant surface renders it.
- `listMessages(pctx, ref, page)` - `assertParticipates`, then the same clamped keyset read.

Sending is #55.
The Participant's composer renders disabled with "Only the project manager can post for now", so the surface is honest rather than broken.

### 5. PM UI: create a Room, admit People, hand out invite links

`createRoom` takes `personIds: string[]` and admits them inside the same `mutate`, so a Room is never created without the People it exists for, and a rejected one-to-one Room leaves nothing behind.
The admission body of `addParticipant` (the Person-in-Project check, the one-to-one check under the row lock, the insert, `rec.created`) moves into a private `admit(tx, rec, room, personId)` that both call, so the invariant Codex found in #62 is enforced on one path only.
A one-to-one Room requires exactly one `personId`; a group Room requires at least one.
That is the issue's "a PM starts a one-to-one chat to a project member" stated as a precondition instead of a two-step dance the UI could leave half-finished.
`scripts/seed.ts:369-374` and the three `service.test.ts` sites that create a Room and admit afterwards are updated to the new signature in the same commit.

`MessagesView` gains, for the PM viewer only:

- a "New room" button in the Room list header, opening a `Dialog` + `ActionForm`: a type `SelectField` (Group / Direct message), a name `TextField` shown only for Group, and a Person picker - a checkbox list for Group, a `SelectField` for Direct message.
  Both submit the field `personIds`, so the schema is `z.preprocess(v => v === undefined ? [] : Array.isArray(v) ? v : [v], z.array(z.string()).min(1))`: `formToObject` already arrays a repeated key, and the preprocess is what makes the single-select case parse.
- a "People" button in the Room header, opening a dialog that lists the Room's Participants with their messaging state (No invite / Invited, expires … / Can sign in), an "Add person" select of the Project's People not yet in the Room (hidden for a one-to-one Room, which is full), and an "Invite link" button per Person that reveals the URL once with a copy button, as `api-tokens.tsx` does.

New actions in `messaging/actions.ts`: `createRoomAction`, `addParticipantAction`, and `createInviteAction` in `participants/actions.ts`, each `runAction` + `revalidateProject`.
`createInviteAction` returns `{ url }` built from `BETTER_AUTH_URL`, which is the origin the app already trusts.

The Project's People and their messaging state reach the view as props from the page: `peopleService.list(ctx, projectId)` for the roster, and a new `messagingService.listInviteStates(ctx, projectId)` returning `{ personId, state }` derived from the credential columns in SQL, so no hash leaves the server.

### 6. The Participant's view of the same route

ADR 0009 fixes the shape: the same `/projects/[projectId]/messages` URL, with the shell chosen by viewer.

- `getViewer()` in `src/server/auth/viewer.ts` - `{ kind: "user"; user } | { kind: "participant"; session } | null`, User first, `cache()`d.
- **Both** layouts branch on it.
  `null` keeps today's behaviour and redirects to `/login`: the proxy is optimistic, so a forged or expired `vantage_participant` cookie reaches the layout, and the alternative reading - render bare `{children}` - would quietly strip the shell off every signed-out page.
  `(app)/layout.tsx` renders `AppShell` for a User and bare `{children}` for a Participant.
  `(app)/projects/[projectId]/layout.tsx` returns `{children}` unwrapped for a Participant, skipping `projectsService.get`, `ProjectHeader`, the `assistantService.conversation` read and `AssistantDock` - the read would throw `ForbiddenError` for a Participant anyway, and the dock is what ADR 0009 forbids.
  Neither layout authorizes anything: a Participant who types `/projects/x/tasks` still reaches `ctxForCurrentUser` in that page and is redirected to `/login`.
- `messages/page.tsx` branches on the viewer.
  The Participant branch requires `session.projectId === projectId` and otherwise redirects to its own Project's messages, reads through `participantMessagingService`, and renders `MessagesView` with `viewer="participant"`: no "New room", no "People", a disabled composer, and a small header carrying the Project name and Sign out, since there is no shell to hold them.
- `/m/[projectId]/login` and `/invite/[token]` are new routes in a `(member)` group whose layout is modelled on `(auth)/layout.tsx`.
  `/invite/[token]` resolves the Project from the token, so the link the PM copies is `${BETTER_AUTH_URL}/invite/${token}` and nothing else.
- `src/proxy.ts`: `PUBLIC` keeps `/login` and `/signup` and is unchanged in behaviour, so a Participant cookie never triggers a redirect away from `/login` (that is the loop).
  Paths under `/invite/` and `/m/` pass through untouched.
  On every other path a `vantage_participant` cookie counts as a session and the request is allowed through, leaving the decision to the page.
  The proxy stays optimistic and verifies no signature; the real checks are §2 and §4.
  A Participant who lands on `/` therefore gets the dashboard page's own `requireUser` redirect to `/login`, which renders, because `/login` ignores the Participant cookie.
- `scripts/seed.ts` gives the seeded People emails (they have none today) and one of them - Jason Lim - a password hash and no invite, so ui-proof and any manual check have a Participant to sign in as.
  The hash is written with `hashPassword` from `better-auth/crypto` through `peopleRepo.update` directly, not through `peopleService`: `createPersonSchema` carries no credential field, and `updatePerson` diffs `PersonRow`, which excludes the credential columns by construction.
  A credential must not become reachable through the action layer just to seed one.
  `people_project_email_uq` is satisfied: the other seeded People hold no credentials, so they are outside the partial index.
  The address and password go in `.env.example` beside the demo account.

## Commits

1. `Plan the PM room-creation and Participant sign-in work` - this file.
2. `Sign a Participant into a messaging-only session` - `participant-session.ts`, `viewer.ts`, the `runAction` split, the credential repository reads, the participant service and its validation, tests. No UI.
3. `Guard the Participant path with assertParticipates` - the seam, `ParticipantCtx`, `participantMessagingService`, `admit` extracted, `createRoom` taking `personIds`, seed and test callers updated.
4. `Let the PM create rooms and invite people` - actions, `MessagesView` dialogs, `listInviteStates`, the page's extra reads.
5. `Show a Participant their rooms without the Vantage shell` - the `(member)` routes, both layout branches, the proxy, the page branch, seeded emails and a seeded password.
6. `Record the Participant session decisions` - ADR 0009 consequences (a Person's own credential write bypasses `mutate`, no session revocation, no rate limiting, the cookie scheme and its dependence on `BETTER_AUTH_SECRET`), the AGENTS.md line that still calls `assertOwnsProject` the only seam, and a `CONTEXT.md` entry for Invite.

## Tests

`participants/service.test.ts` (database):

- accept sets a password and clears the token; a second accept with the same token fails.
- an expired invite fails with the same message as an unknown one, and the expiry is in the `UPDATE`'s `WHERE`, asserted by back-dating `invite_expires_at` and checking the row is untouched.
- regenerating an invite invalidates the first token.
- invite refuses a Person with no email, a Person on an email another invited Person in the Project already holds (case-insensitively), and a Person from a Project the PM does not own or a different Project of their own.
- inviting one of two uninvited People who share an address succeeds, because the unique index is partial.
- login succeeds; wrong password, unknown email, and a Person holding only an invite all fail identically.
- `createInvite` writes exactly one `person.updated` Activity Event, and the row's `oldValue`/`newValue` contain no hash.

`participant-session.test.ts` (pure): round-trip; a tampered payload, a tampered signature, a truncated signature (the `timingSafeEqual` length case) and an expired payload all return null.
A cookie signed for Project A still verifies when it is replayed at Project B's URL - the signature says nothing about where it was sent - so the test asserts the resolved session names Project A, and the page-level `session.projectId === projectId` check plus `assertParticipates` are what refuse it.

`proxy.test.ts` (pure): `/login` with only a Participant cookie renders rather than redirecting (the loop this plan's first draft would have had); `/projects/x/messages` with only a Participant cookie passes through; `/invite/abc` and `/m/p1/login` pass through with no cookie; an anonymous `/projects/x/messages` still redirects with `?next=`.

`messaging/service.test.ts` additions:

- `assertParticipates` admits a Participant and refuses, with `NotFoundError`, a Person in the Project who is not in the Room, a Person from another Project, a Room in another Project, and a deleted Person.
- `participantMessagingService.listRoomsWithParticipants` returns only that Person's Rooms, and `listMessages` refuses a Room they are not in.
- `createRoom` with `personIds` writes the Room and one `participant.created` event per Person in one transaction; a one-to-one Room with two `personIds` is rejected and leaves no Room behind.
- `listInviteStates` reports the three states and never returns a hash.

Playwright is not extended: the Participant flow needs a second browser context and an invite link carried between them, a bigger harness change than this PR should carry.
The ui-proof walks it by hand instead.

## How to test

```
npm run typecheck
npm run lint
DATABASE_URL=postgres://pm:pm@localhost:5434/pm_test npx vitest run
```

ui-proof, required because the route is user-visible: the PM creates a group Room with two People and a one-to-one Room, then copies an invite link; a second browser profile opens the link, sets a password, and lands on the messages surface with no sidebar, no command palette and no Assistant dock, seeing only their own Rooms and the history the PM can see; sign out, then sign back in at `/m/<projectId>/login`.
