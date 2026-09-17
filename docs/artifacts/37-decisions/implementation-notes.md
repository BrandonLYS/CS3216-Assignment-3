# Implementation notes - #37 A PM can record a Decision and its typed Assumptions by hand

Branch `feat/37-decisions`. Implemented commit by commit as laid out in [plan.md](./plan.md).

## Commits

| #   | Commit                                                                               | Files                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `feat(domain): decision memory vocabularies, schema and migration`                   | `src/shared/domain/index.ts`, `src/server/db/enums.ts`, `src/server/db/schema.ts`, `src/server/modules/decisions/schema.ts`, `drizzle/0007_decisions.sql`, `drizzle/meta/*`                                                                                                  |
| 2   | `feat(decisions): validation, repository and service with tests`                     | `src/server/modules/decisions/{validation,repository,service,service.test}.ts`, `src/server/core/validation.ts` (`parseJsonIfString`), `src/server/modules/activity/service.ts` (`activityRepo.findById`)                                                                    |
| 3   | `feat(decisions): server actions`                                                    | `src/server/modules/decisions/actions.ts`                                                                                                                                                                                                                                    |
| 4   | `feat(decisions): Decisions page, list, dialog, source picker and assumptions panel` | `src/app/(app)/projects/[projectId]/decisions/page.tsx`, `src/features/decision/*`, `src/entities/decision/*`, `src/shared/domain/history-fields.ts`, `src/server/modules/activity/enrich.ts`, `src/shared/ui/dialog.tsx`, `src/widgets/command-palette/command-palette.tsx` |
| 5   | `test(e2e): decisions flow, docs row and screenshots`                                | `e2e/flows.spec.ts`, `docs/flows.md`, `docs/decisions/screenshots/*`                                                                                                                                                                                                         |
| 6   | `docs: implementation notes for #37`                                                 | this file                                                                                                                                                                                                                                                                    |

## Deviations from the plan (real code won)

1. **Subtype matrix lives in one function.** `assumptionFieldErrors` in `validation.ts` feeds both the zod `superRefine` (form path) and `assertTargetInProject` in the service (direct callers such as the Assistant in #39).
   The first test run showed the service alone did not enforce the matrix; now it does.
2. **`Dialog` gained two behaviours** the nested Assumption dialog needed: `onSubmit` stops propagation at the overlay (React portals bubble synthetic events through the component tree, so the nested form was submitting the Decision `ActionForm` and closing it) and only the topmost open dialog answers Escape.
3. **Source picker error handling.** The "Add at least one source" field error is hidden as soon as the PM changes the list and reappears on the next submit if still missing, so the dialog never shows a stale error next to a valid list (seen in the first screenshot run).
4. **`sourceCandidates` excludes every `decision` Activity Event** rather than only the one being edited; a Decision citing another Decision's creation event is not a source in the project history sense, and it keeps the picker free of self-references without threading the id through the page.
5. **e2e placement.** The `decisions` describe runs last, not after `evidence`: running it earlier pushed the Task status event the `overview` flow asserts out of the Overview feed.
   `openProject` now scopes the section link to `<main>` because the sidebar gained a `Settings` link that made `getByRole("link", { name: "Settings" })` ambiguous (pre-existing failure, fixed on the way).
6. **Labels.** "Target" (not "Task or Milestone") for the date subtype select, so the label does not collide with the subtype hint text in accessible-name matching.
7. **`Retired` chip.** `line-through` is applied to the statement span only; a parent-level strike propagated onto the state word.
8. **Worktree `node_modules`.** A symlinked `node_modules` makes Turbopack panic ("Symlink [project]/node_modules is invalid"), so the worktree has its own `npm ci`; `.env` there points `BETTER_AUTH_URL` at port 3137.

Everything else (tables, edge kinds and direction, Source snapshotting, edge Source inheritance by copy, orphan Assumption deletion, single `superseded_by` per Decision at DB and service level, un-supersede restoring `active`, synthetic `assumptions` / `supersedes` / `sources` History fields) matches the plan.

## Test results

- `npx vitest run src/server/modules/decisions/service.test.ts`: red before `service.ts` existed, then **18/18 passed** (1 `firstLine`, 4 create, 2 update, 5 assumptions, 4 supersede, 1 delete, 1 ownership).
- `npm test`: **20 files, 167 tests passed**.
- `npm run typecheck`, `npm run lint`, `npm run format:check`: clean after every commit (pre-commit hook also ran lint-staged + typecheck).

## E2E

`E2E_PORT=3137 E2E_NO_SERVER=1 npx playwright test e2e/flows.spec.ts` - **17 passed** including `decisions`.
Screenshots in `docs/decisions/screenshots/` (empty state, missing-source error, filled dialog with a cited Source, new-assumption dialog, D-1 with two typed Assumptions and one retired, list with D-1 superseded by D-2).
