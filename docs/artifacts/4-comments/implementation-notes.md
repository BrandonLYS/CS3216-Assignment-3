# Implementation notes — #4 Comments on Tasks, Risks and Milestones

Branch `feat/4-comments`. Implemented commit by commit as laid out in [plan.md](./plan.md) (C1–C5).

## Deviations from the plan / issue

- **`saidByName` column (spec deviation).** The issue's column list has no name snapshot, but with the mandated `saidById … onDelete: "set null"` a removed Person is indistinguishable from "never attributed". `comments.said_by_name` stores the Person's name at posting time so the thread can show "Unknown person" (story 17) and the History snapshot keeps the name. Flag in the PR description.
- **`Recorder.created/deleted(…, snapshot?)` and `DomainEvent.snapshot?`** (`src/server/core/mutation.ts`, `src/server/events/bus.ts`) — additive extension the issue's "include the body in `oldValue`" requires; `flush` writes the snapshot to `newValue` (created) / `oldValue` (deleted), `field` stays `null`. The `CommentSnapshot` includes the parent `{ entityType, entityId }` for #5 (History).
- **`assertPersonInProject(db, projectId, personId, field = "assigneeId")`** — 4th param so the comments service reports `{ saidById: ["Invalid"] }`. Existing callers unchanged.
- **`CommentThread` initial load** — the plan's `refresh()`-in-`useEffect` trips `react-hooks/set-state-in-effect`; the effect now defines an async loader (with a cancelled flag) that awaits before setting state, and `refresh()` is a plain function used after post/delete.
- **Existing e2e `timeline` test touched.** It selected the DependencyEditor's target with `dialog.getByRole("combobox").last()`; the "Said by" select is now the last combobox in edit dialogs, so both occurrences now use `.filter({ hasText: "Choose…" })`. No behaviour change.
- **E2E locators.** `getByText(body)` also matches the composer `<textarea>` while its value is set, and the inline confirm's "Delete" collides with the dialog footer's "Delete" (task delete). The comments flow scopes both to `dialog.getByRole("listitem")`.
- **Board card layout.** `CommentCount` sits before the due date with `ml-auto`; the due date only takes `ml-auto` when the count is zero so the right edge stays aligned.
- **`Avatar` for "Unknown person"** renders with a `?` placeholder name (the atom needs a string to draw a filled circle); the row's `title` carries the original name (`Was: <name>`).
- Migration file is `drizzle/0001_comments.sql` with `ALTER TYPE "public"."entity_type" ADD VALUE 'comment'` (enum value appended last, as planned).

## Test results

- `npx vitest run src/server/modules/comments` — 12/12 pass (tests 1–12 of plan §4, including `tasksService.list reports commentCount per Task`).
- `npm test` (full Vitest suite) — see final report in the PR / agent summary (all green at time of writing).
- `E2E_PORT=3104 E2E_NO_SERVER=1 npx playwright test e2e/flows.spec.ts` — 12/12 flows pass, including the new `comments` flow. Note: `playwright.config.ts` does not load `.env`, so `E2E_PORT` must be exported in the shell when the dev server is not on :3000.
- `npm run typecheck`, `npm run lint`, `npm run format:check` — green after each commit.

## Evidence screenshots (`docs/artifacts/4-comments/screenshots/`)

- Before: `before-task-dialog.png`, `before-tasks-list.png`, `before-tasks-board.png`, `before-risk-dialog.png`, `before-milestone-dialog.png`, `before-overview.png`, `before-dashboard.png`, `before-evidence.png`.
- After (copied from the e2e run, `docs/comments/screenshots/`): `after-task-dialog-empty-thread.png`, `after-composer-filled.png`, `after-comment-posted.png`, `after-list-with-count.png`, `after-board-with-count.png`, `after-delete-confirm.png`, `after-overview-feed.png`.
- After (seeded demo project via a throwaway Playwright script, not committed): `after-task-dialog.png` (PAY-9 with two Comments), `after-tasks.png`, `after-board.png` (counts), `after-risk-dialog.png` (R-1), `after-milestone-dialog.png` ("UAT Begins"), `after-unknown-person.png` (Person removed → "Unknown person"), `after-overview.png` (feed with `created Comment "PAY-9: …"`).

## Left for review

- The `Field` hint "⌘/Ctrl+Enter to post" is inside the `<label>`, so the textarea's accessible name is "Comment ⌘/Ctrl+Enter to post"; Playwright's substring match on `"Comment"` is fine, but a stricter a11y pass might prefer `aria-describedby`.
- "Said by"/"Said on" intentionally persist between posts in one dialog session (plan §C3); a PM posting their own observation right after an attributed one must reset "Said by" to "You (unattributed)".
- No per-Comment `comment.deleted` events are emitted when a Task/Risk/Milestone cascade-deletes its Comments (plan §C2); the item's own `deleted` event covers it.
