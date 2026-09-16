# Implementation notes — #8 Task search across Projects in the command palette

Branch `feat/8-task-search`. Implemented commit by commit as laid out in [plan.md](./plan.md).

## Commits

| #   | Commit                                                       | Files                                                                                                                                            |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `feat(tasks): searchTasks service, query parsing and schema` | `src/server/modules/tasks/validation.ts` (appended), `src/server/modules/tasks/search.ts` (new), `src/server/modules/tasks/search.test.ts` (new) |
| 2   | `feat(tasks): searchTasksAction`                             | `src/server/modules/tasks/actions.ts` (appended)                                                                                                 |
| 3   | `test(e2e): task-search flow`                                | `e2e/flows.spec.ts` (new last describe), `docs/flows.md` (new row)                                                                               |
| 4   | `feat(command-palette): Tasks group with server search`      | `src/widgets/command-palette/command-palette.tsx`, `docs/task-search/screenshots/*`                                                              |
| 5   | `docs: implementation notes for #8`                          | this file                                                                                                                                        |

No schema change, no migration, no new dependency.

## Deviations from the plan (real code won)

1. **State reset moved out of the effect** (plan §2 Commit 4 step 2 vs. §6). The plan's first draft called `setSearch` synchronously at the top of the `useEffect`; the review correction in §6 was followed instead: `onQueryChange` does `setQuery(v); setSearch({ loading: v.trim().length >= 2, results: [] })` and the effect only sets state inside the debounced async callback. `react-hooks/set-state-in-effect` therefore never fires.
2. **`value` is required on `Item`, not optional.** The plan said "add optional `value?: string`"; §6 says every item must pass a unique value. It is a required prop (`section:<slug>`, `goto:<href>`, `project:<id>`, `action:new-project`, `task:<id>`), so a missing value is a type error rather than a runtime cmdk duplicate-value bug.
3. **"Go to" items became a `GO_TO` const array** so they can be filtered in JS like the other groups (the plan described `goToHits` but the original JSX hard-coded the three items). `PROJECT_SECTIONS` is still exported unchanged — `src/widgets/project-header/project-header.tsx` imports it.
4. **E2E option regex anchored** (`^${key}-1`) per §6, and `shot("search-by-key")` is taken _after_ the result assertion so the screenshot shows the populated row rather than the spinner.
5. **"Before" e2e screenshot** — the plan expected to copy `docs/task-search/screenshots/02-search-by-key.png` from the red run. Because the assertion (`toContainText`) fails before the `shot(...)` call, that file was never written; Playwright's own failure capture `test-failed-1.png` (palette with `F…-1` typed, only "No results.") was copied to `before-01-palette-key-no-results.png` instead. `before-palette-PAY_3.png` / `before-palette-merchant.png` (demo account) cover the plan's `before-02` intent.
6. **`.shots.mjs` helper** needed `waitForLoadState("networkidle")` + a settle before `Meta+k` on a fresh `goto` (the ⌘K listener is attached after hydration). The helper is untracked and not committed. Its `palette:pay 3` scene produced `after-palette-pay_3.png`, which on the case-insensitive macOS filesystem overwrote `after-palette-PAY_3.png`; the lower-case shot was renamed to `after-palette-lowercase-pay-space-3.png` and `PAY-3` re-shot.
7. **Icon `shrink-0`** added on the `Item` icon (plus `min-w-0` on the row as planned) so long Task titles truncate instead of squashing the icon.

Everything else (regexes, ranking SQL, schema, action, group order, tokens, `shouldFilter={false}`, 180 ms debounce, request-id stale discard, spinner / "No tasks match" rows as non-selectable `<div>`s) matches the plan text.

## Test results

- `npx vitest run src/server/modules/tasks/search.test.ts` — red before `search.ts` existed (module not found), then **17/17 passed** (4 `parseTaskQuery`, 11 `searchTasks`, 2 `searchTasksSchema`).
- `npm test` — **5 files, 39 tests passed**.
- `npm run typecheck`, `npm run lint` — clean after every commit (pre-commit hook also ran lint-staged + typecheck).
- `npx prettier --check .` — clean except the untracked, uncommitted `.shots.mjs`.

## E2E

`E2E_PORT=3108 E2E_NO_SERVER=1 npx playwright test e2e/flows.spec.ts`

- After Commit 3 (widget untouched): 11 passed, `task-search` failed at `expect(hit).toContainText("Implement v2 endpoints")` — exactly the red point the plan predicted.
- After Commit 4: **12/12 passed (47 s)**, including the pre-existing `command-palette` flow ("Payments" → Project, "Risks" → section) under the new JS substring filtering.
- Unrelated screenshot churn in the other `docs/<flow>/screenshots` folders was reverted with `git checkout --`; only the new `docs/task-search/screenshots/01–06` were committed. `task-search` is the last describe in the serial spec.

## Screenshot evidence (`docs/artifacts/8-task-search/screenshots/`)

Before: `before-palette-PAY_3.png`, `before-palette-merchant.png` (demo account), `before-01-palette-key-no-results.png` (e2e failure capture).

After: `after-01-search-by-key.png`, `after-02-task-dialog-open.png`, `after-03-search-key-variant.png`, `after-04-search-by-title-two-projects.png`, `after-05-no-tasks-match.png` (from the green e2e run), `after-palette-PAY_3.png`, `after-palette-lowercase-pay-space-3.png`, `after-palette-merchant.png` (demo account).

## Review notes

- Authorization is the `projects.ownerId = ctx.userId` join in `searchTasksQuery`; there is deliberately no `assertOwnsProject` because the read is cross-Project (documented in `search.ts`). `currentProjectId` is validated as a UUID and only used for ranking / bare-number resolution — a foreign id never matches.
- Status colour comes from `status.color` via `StatusBadge`; nothing keys off `status.name` (ADR 0003).
- The widget imports only `actions.ts` (server action) and a type from `search.ts`; no repository import (ADR 0005 layering).
- `ActionResult` `!ok` is rendered as "No tasks match"; the only validation failure the client can trigger (`q` < 2) is gated in the widget before the call.
- Known behaviour: bare-number search in an archived current Project returns nothing (plan §5.3, story 18). `F1AB1` without a separator is a title search (plan §5.1).
- Follow-ups out of scope: index on `lower(title)` if the ILIKE scan becomes slow; searching other entities from the palette.
