# Issue #58 - the messages route

## What the issue asks

> The messaging UI begins as a dedicated project route.
>
> - URL: /projects/[id]/messages
> - Layout: room list plus message pane for the selected room.

## Why this is being done before #54

#54 (the PM creates Rooms and selects Participants, and a Person gets an invite link and a login) has nowhere to put a signed-in Participant while this route does not exist, and nowhere to hang a "New room" dialog.
Doing the route first means every later messaging PR has a real surface to extend: #54 adds room creation and the Participant viewer of this same page, #55 opens sending to Participants, #57 caps the text, #60 pages the history, #59 makes it live, #56 adds attachments.
The user approved this swap.

## What is already true

The whole server side of a read-only-plus-send surface exists: `messagingService.listRooms`, `getRoom`, `listParticipants`, `listMessages` (#53) and `postMessage` (#62), all behind `assertOwnsProject`.
There is no `actions.ts` and no UI.

## What this PR adds

### 1. Route

`src/app/(app)/projects/[projectId]/messages/page.tsx`, a server component following `evidence/page.tsx`:

- `ctxForCurrentUser()`, then `messagingService.listRooms`.
- The selected Room comes from `?room=`, defaulting to the first Room, exactly as `evidence/page.tsx:19` does for `?item=`: the parameter is matched against the Rooms already listed, never passed to `getRoom` raw, so a stale link falls back to the first Room instead of 404-ing the page. Selection is a `Link`, so the pane is server-rendered and the URL is shareable; unlike Evidence's `router.replace`, a history entry per Room is wanted here, because Back between Rooms is the expected chat behaviour.
- Participants for **every** Room in one query, not one query per Room: `messagingRepo.listParticipantsForProject(db, projectId)` joins `rooms`, `room_participants` and `people` (through `personPublicColumns`) and the service groups them by Room id. The Room list names the People in each Room, so fetching only the selected Room's Participants would be an N+1 the moment a Project has a few Rooms.
- For the selected Room: `listMessages` with a limit of 50.
- Renders `MessagesView`, passing `ctx.userId` so the view can tell the PM's own Chat Messages from a Person's by `authorUserId` rather than by name.
- No `<Suspense>` and no `useSearchParams`: selection is resolved on the server and handed down as props, unlike Evidence and Decisions, which select client-side and therefore need both. Reading the parameter again in the view would repeat the stale-id matching the page has already done.

The page sits inside the existing `(app)/projects/[projectId]` layout, so it gets the Project header and tabs.
ADR 0009's "the shell is chosen by viewer" arrives with #54, when a second viewer exists; there is one audience today and inventing the split before the Participant session would be guesswork.

`PROJECT_SECTIONS` (`widgets/command-palette/command-palette.tsx`) gains `{ slug: "messages", label: "Messages", icon: MessageSquare }` between People and Settings, which adds both the header tab and the command palette entry.

### 2. `src/features/messaging/messages-view.tsx`

Room list on the left, message pane on the right, both inside the standard `panel` surface.

- **Room list**: Room name (or the other Person's name for a one-to-one Room, falling back to "Direct message" when it has no Participant yet), and a line of Participant names. The selected Room is highlighted.
- **Pane header**: the Room's label and its Participants.
- **History**: oldest at the top, newest at the bottom, which is the reading order of a chat. `listMessages` returns newest first for the keyset cursor, so the view renders a reversed **copy** (`[...messages].reverse()`), never reversing the prop in place. Each Chat Message shows `authorName`, `relative(createdAt)` with `fmtDateTime` as the `title` (`shared/lib/dates.ts`, as `comment-thread.tsx` does), an `Avatar`, and the text with `whitespace-pre-wrap break-words` so newlines survive and a pasted URL cannot widen the pane. Messages the PM wrote are distinguished by `authorUserId`.
- **Composer**: shaped after `CommentThread` (`features/comment/comment-thread.tsx`), not `ActionForm`, because `ActionForm` never clears an uncontrolled field and a chat composer must empty on success and keep the draft on failure. So: controlled `text` state, `postMessageAction({ projectId, roomId, text })` called with a plain object (`runAction` accepts one, as `comments/actions.ts` does), Send disabled while empty or pending, Cmd/Ctrl+Enter to send, the error shown inline without losing the draft. The composer is keyed by Room id so a draft cannot follow the PM into another Room. `revalidateProject` in the action re-renders the page, so the sent Chat Message appears without a client refetch; #59 replaces this with SSE.
- **Scrolling**: the pane opens scrolled to the newest Chat Message and scrolls again after sending, through a ref effect keyed on the Room id and the message count. Without it a chat opens at the top of the page and looks broken.
- **Empty states**: no Rooms yet, and a Room with no Chat Messages yet, both through the existing `EmptyState` (`shared/ui/page-header.tsx`). Neither invents a "New room" button, which is #54.
- **Accessibility**: the Room list is a list of `Link`s with `aria-current` on the selected one; the history is an `<ol>`. No `aria-live` until #59 makes it live.

Layer rules: the page (`app`) fetches through the service, `features/messaging` owns the view, and `entities` is not needed for a single message row that nothing else renders.
No raw hex, only the tokens in `globals.css` (`panel`, `bg-surface-2`, `text-ink-subtle`, `border-hairline`, …).

### 3. `src/server/modules/messaging/{actions.ts,validation.ts}`

`postMessageSchema` (`projectId`, `roomId`, `text` required and trimmed) and `postMessageAction`: `runAction(schema, input, (ctx, i) => messagingService.postMessage(ctx, i))`, then `revalidateProject(res.data.projectId)` on success, as `people/actions.ts` does. A stale `roomId` surfaces as the service's `NotFoundError`, which `runAction` turns into the composer's inline error.

The view does **not** import `roomLabel` from `messaging/service.ts`: a client component importing that module would pull Drizzle and `mutate` into the browser bundle. The view computes its own label, and it is a different label anyway - the service labels an Activity Event without knowing the Participants, while the view names a one-to-one Room after the Person in it.

Thin, per AGENTS.md; the `text` maximum stays out until #57 so the cap is defined in one place.

This is also where the zod schemas #53 deliberately did not write now have a caller.

### 4. Seed

`scripts/seed.ts` gains two Rooms in the demo Project: a group Room with three People and a short exchange, and a one-to-one Room with one Person.
Without it the route can only ever be photographed empty, because the PM cannot create a Room until #54.
Rooms, Participants and the PM's own Chat Messages go through `messagingService`, so they carry the same Activity Events a real one would.

The People's replies are the exception: they are inserted with `messagingRepo.insertMessage` and an `authorPersonId`, because the service that lets a Person write is #55 and does not exist yet.
A seeded monologue would leave the one thing this view does with authorship - telling the PM's Chat Messages from a Person's - unproven in the ui-proof.
The call is commented in the seed and replaced with the service in #55.

## Commits

1. `Add the messages route with a room list and message pane` - route, view, actions, validation, nav entry.
2. `Seed a demo conversation` - `scripts/seed.ts`.

## Tests and proof

- `npx vitest run` - the service layer is already covered; this PR adds no service logic. The action is a thin wrapper and the repo does not unit-test actions elsewhere.
- **ui-proof** is required: this is the first messaging UI. Capture the route with a selected Room, a second Room selected, the empty state, and a sent message.
- `npm run typecheck`, `npx eslint src --max-warnings=0`, `npm run format:check`.

## How to test manually

```
npm run db:up && npm run db:migrate && npm run db:seed && npm run dev
# sign in as the demo account, open a project, click Messages
```
