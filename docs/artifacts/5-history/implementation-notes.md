# Implementation notes — #5 Per-item History tab in Task, Risk and Milestone dialogs

Branch `feat/5-history` (on top of `feat/4-comments`). Implemented commit by commit as laid out in [plan.md](./plan.md) (Commits 1–7). No schema changes, no migrations.

## Commit map

1. `docs(history): before screenshots …` — plan Commit 1 needed no code: `Recorder.created/deleted(…, snapshot?)` and `CommentSnapshot { entityType, entityId, body, … }` were already on the branch (`src/server/core/mutation.ts`, `src/server/modules/comments/service.ts`), and `comments/service.test.ts` already asserts the parent reference on both `comment.created` (`newValue`) and `comment.deleted` (`oldValue`). Only the before-screenshots were added.
2. `domain: history field dictionary` — `src/shared/domain/history-fields.ts`, re-exported from `src/shared/domain/index.ts`.
3. `activity: listEntityHistory service + action + tests` — `activityRepo.historyForEntity`, `enrich.ts`, `validation.ts`, `actions.ts`, `service.test.ts` (TDD: test written first, ran red on the missing module, then green).
4. `ui: Tabs primitive` — `src/shared/ui/tabs.tsx`.
5. `entities: EntityHistory` — `src/entities/activity/entity-history.tsx`.
6. `features: ItemDialogTabs and Details/History tabs in the item dialogs` — `src/features/history/item-dialog-tabs.tsx` + the three dialogs.
7. `e2e + docs: history flow` — `e2e/flows.spec.ts`, `docs/flows.md`, `docs/history/screenshots/`, evidence screenshots, this file.

## Deviations from the plan / issue

- **`HISTORY_ENTITY_TYPES` is a literal, not a runtime alias.** The plan wrote `export const HISTORY_ENTITY_TYPES = COMMENTABLE_ENTITY_TYPES` inside `history-fields.ts`, but that module is `export *`-ed from `./index` and imports from it, so the alias would read `COMMENTABLE_ENTITY_TYPES` while `index.ts` is still evaluating (TDZ). It is now `["task", "risk", "milestone"] as const satisfies readonly CommentableEntityType[]`, which keeps the compile-time link to #4's vocabulary without the runtime cycle. `labelFor` is only called at call time (`historyField`), as the plan allowed.
- **Dialog diffs are larger than "one line before, one after" in bytes, not in content.** Wrapping the edit `<ActionForm>` in `<ItemDialogTabs>` makes Prettier re-indent the whole form body by two spaces; `git diff -w` shows exactly the import plus the two wrapper lines per dialog. `ItemDialogTabs` stays outermost; the `confirmDelete` branch is untouched. #6 merging into these files should use `git merge -Xignore-space-change` (or re-run Prettier after resolving) rather than hand-resolving indentation.
- **`groupHistory` ranks `created`/`deleted` rows first within a group** (`-1`), field rows in dictionary order, unknown fields after known ones (`order.length`, i.e. the plan's `-1 → Infinity` correction), Comment rows last (`Infinity`). A created row can only share a second with a save if the item is created and edited within one second, so this is mostly defensive.
- **`ItemDialogTabs` narrows `history` once** (`const target = history` after the null check) instead of a `!` assertion inside the async `load` closure.
- **E2E panel locator** uses `dialog.getByRole("tabpanel", { name: "History" })`. The Details panel is also `role="tabpanel"` (kept mounted, `hidden` class) so the unqualified locator in the plan would be ambiguous if a11y ever exposed it; naming it is unambiguous.
- **`describeValue` for `"text"`** truncates to the first line / 80 chars as planned; the Overview feed (`entities/activity/activity-item.tsx`) still uses its own 40-char `fmt`. Adopting `historyField(...).label` there is the optional follow-up noted in the plan and was not done.

## Test results

- `npx vitest run src/server/modules/activity` — 9/9 pass (plan §3 tests 1–9).
- `npm test` — 6 files, 43/43 pass.
- `E2E_PORT=3105 E2E_NO_SERVER=1 npx playwright test e2e/flows.spec.ts` — 13/13 flows pass on the first run, including the new `history` flow (create-mode has no tabs; Details is the default tab; History shows "Created" for a fresh Task; after a three-field save History shows `Todo → In Progress`, `Priya Nair`, `18 Sep 2026 → 23 Sep 2026` in one group with `Created` last; ArrowLeft on the History tab activates Details).
- `npm run typecheck`, `npm run lint`, `npx prettier --check .` — green after each commit.

## Evidence screenshots (`docs/artifacts/5-history/screenshots/`)

- Before (seeded demo project, throwaway script): `before-task-dialog.png`, `before-risk-dialog.png`, `before-milestone-dialog.png`.
- After, seeded demo project via a throwaway Playwright script (`.shots-history.mjs`, not committed): `after-task-details.png` (PAY-10, Details tab default), `after-task-history.png` (Status/Owner/Due date changed in one save grouped under one header with names and formatted dates, `Commented:` / `Deleted a comment:` rows, older `Created` group at the bottom — this also serves as the plan's `after-task-history-comment.png`), `after-risk-history.png` (R-1: Mitigation text change), `after-milestone-history.png` ("UAT Begins": Due date change), `after-create-mode-no-tabs.png`.
- After, copied from the e2e run (`docs/history/screenshots/`): `after-edit-dialog-details-tab.png`, `after-history-fresh.png` (only `Created`), `after-history-after-save.png`, `after-keyboard-back-to-details.png`.

## Left for review

- Second-granularity grouping is by `actorId + occurredAt.slice(0, 19)` client-side, exactly as the spec says; a Comment posted in the same second as a save by the same actor would share a group.
- A deleted Status/Person shows `<uuid> (deleted)` — literal to the issue's "fall back to the raw value with a "(deleted)" suffix". Reading the `status.deleted` event's `entityLabel` for a nicer name is a follow-up.
- The footer (Cancel/Save/Delete) is hidden with the Details panel while History is active; `X`/Escape still close the dialog.
- Overview feed still renders raw field keys; the dictionary is ready for it.
