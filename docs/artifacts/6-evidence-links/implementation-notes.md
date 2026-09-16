# Implementation notes — #6 Link Evidence to Tasks, Risks and Milestones

Branch `feat/6-evidence-links` (on top of #4 Comments). Implemented commit by commit as laid out in [plan.md](./plan.md) (Commits 1–5).

## Deviations from the plan / issue

- **Second count subquery alias** (`src/server/modules/tasks/repository.ts`). The plan reused `.as("n")` for the linked-Evidence count, mirroring #4's comment count. Drizzle renders subquery columns unqualified inside `sql\`\`` templates (`coalesce("n", 0)`), so two subqueries with the same alias fail with `column reference "n" is ambiguous`. The Evidence count is aliased `evidence_n`; the JS property stays `evidenceCounts.n`. Caught by the new `tasksService.list reports linkedEvidenceCount per Task`test (added beyond the plan's seven, mirroring #4's`commentCount` test).
- **Ordering with nullable `sourceDate`** (plan §6). `listForProject`, `listForEntity` and `listSummaries` order by `coalesce(source_date, created_at::date) desc, created_at desc` (`evidenceRecency`), then by link `created_at asc`, so records without a source date do not float first.
- **`evidenceHref` lives in `src/entities/evidence/evidence-chip.tsx`** (plan put it next to `itemHref` in `linked-item-chip.tsx`); each helper sits with the chip that uses it. `itemHref` is in `linked-item-chip.tsx` as planned.
- **`CommandPicker` filter.** Instead of cmdk's fuzzy default (which would also match the opaque id in `value`), the picker passes a case-insensitive substring `filter` over `label + keywords` only. "R-1", "ACME-12" and "UAT begins" all hit; "PAY-1" also lists PAY-10..12 (substring), which is the expected behaviour for a key prefix.
- **`entityType` in `withLabels` is selected via `sql<LinkableEntityType>`** so the link rows are typed with the narrow union (the column itself is the wide `entity_type` enum); no runtime change.
- **`LinkedItemChip` inserts a literal space between the key and the label** inside the `<a>` so the accessible name is deterministically `"KEY label"` (Playwright and screen readers), regardless of how the flex layout is serialised. Flex containers drop whitespace-only text nodes, so nothing is visible.
- **Board card layout**: `LinkedEvidenceCount` sits before `CommentCount`; `ml-auto` moves to whichever of the two counts renders first (or to the due date when both are zero), extending #4's rule.
- **Both `LinkedEvidence` and `LinkedItems` disable their add button while the picker is open or a write is pending**, and show a tooltip when every candidate is already linked (US 7: no duplicates possible from the UI; the service is idempotent anyway).
- **E2E flow appended after `comments`** (the plan allowed either placement) and extended with an Overview check: `changed evidence on Task "Implement v2 endpoints": empty → Weekly sync minutes…` and the reverse on unlink, plus the Risk's event — evidencing US 17 and that no event is recorded against the Evidence itself.
- `HUMAN_FIELDS` in `src/entities/activity/activity-item.tsx` gains `evidence: "evidence"` so the feed reads "changed evidence on Task …".
- Migration is `drizzle/0002_evidence_links.sql` (after #4's `0001_comments`), generated with `drizzle-kit generate --name evidence_links`; the journal was not hand-edited.

## Test results

- `npx vitest run src/server/modules/evidence` — 8/8 pass (plan §3 tests 1–7 plus the `linkedEvidenceCount` test). Written first; all 7 failed with `evidenceService.link is not a function` before the service was added.
- `npm test` (full Vitest suite) — 42/42 pass (6 files).
- `E2E_PORT=3106 E2E_NO_SERVER=1 npx playwright test e2e/flows.spec.ts` — 13/13 flows pass, including the new `evidence-links` flow; the existing `comments` and `timeline` flows (which use `dialog.getByRole("combobox")`) are unaffected because the cmdk input only mounts after "Add evidence"/"Link item" is clicked.
- `npm run typecheck`, `npm run lint`, `npx prettier --check .` — green after each commit.

## Evidence screenshots (`docs/artifacts/6-evidence-links/screenshots/`)

- Before (seeded demo project, throwaway script): `before-task-dialog.png`, `before-evidence.png`, `before-tasks-list.png`.
- After, from the e2e run (`docs/evidence-links/screenshots/`): `after-e2e-task-dialog-linked.png`, `after-e2e-list-row-count.png`, `after-e2e-evidence-linked-to.png`, `after-e2e-evidence-linked-risk.png`, `after-e2e-evidence-after-unlink.png`, `after-e2e-risk-dialog-from-chip.png`, `after-e2e-overview-feed.png`.
- After, seeded demo project via a throwaway Playwright script (not committed): `after-task-dialog-linked.png` (PAY-9 with three Evidence chips), `after-tasks-list-count.png`, `after-tasks-board-count.png`, `after-risk-dialog-linked.png` (R-1), `after-milestone-dialog-linked.png` ("UAT Begins"), `after-evidence-page-linked-to.png`, `after-evidence-link-item-picker.png` (picker filtered by "PAY-1"), `after-overview-feed.png`.

## Left for review

- `loadProjectRefs` now runs two extra small queries (Evidence summaries + labelled links) on every project page, including pages that never open a dialog (plan §5.2). Acceptable for now; if it shows up, split refs into "form refs" and "link refs".
- `evidence.linked` / `evidence.unlinked` domain events are published via `Recorder.signal()` with `action: "updated"` but are **not** persisted as Activity Events (by design — the item's `updated` event is the audit trail). Subscribers reading `action` alone cannot distinguish them from a real update; they should branch on `name`.
- The Evidence-page chip for a Milestone navigates to `/timeline?milestone=<id>`; the Timeline page opens the dialog on load as verified in the plan, but the flow spec exercises the Risk chip only.
- Deleting an item cascades its links (`deleteForEntity`) without emitting `evidence.unlinked` signals, matching #4's decision for Comments.

## Review fixes

Follow-up commits addressing the adversarial review on PR #14 (`review-14.md`, items marked **[fixing]**).

- **HIGH — `evidenceService.listForEntity` could read links of a foreign item.** `assertOwnsProject` checked the `projectId` argument but `evidenceLinksRepo.listForEntity` filtered only by `(entityType, entityId)`, so a User owning Projects A and B could pass A's id with an item from B and read B's linked Evidence titles. Fixed TDD-first: a new test ("does not list links of an item from another Project the User also owns") failed with the foreign row returned, then `listForEntity` gained a `projectId` parameter and `eq(evidenceLinks.projectId, projectId)`. The same audit tightened `LinkKey` (used by `find` and `delete`) to include `projectId`, so `link`'s idempotent re-read and `unlink`'s delete are Project-scoped too; the service already passes `input.projectId`. `listForEvidence` is scoped by `getOwned` on the Evidence row and filters on the Evidence UUID PK, so it was already safe; `listForProject`/`listTargets`/`listSummaries` were already filtered by Project.
- **MEDIUM — user story 13 ("show its linked items as chips") on the Evidence list.** Rows with links now render a compact strip under the meta line: the first two `LinkedItemChip`s (type icon, mono key, truncated label, `text-caption`) followed by a "+N" caption for the rest. The list row is a `<button>`, so `LinkedItemChip` gained an optional `href`: without it the chip body is a plain `<span>` instead of a `<Link>`, keeping the HTML valid (no `<a>` inside `<button>`) and leaving the e2e `getByRole("link", { name })` locators unambiguous — the flow spec needed no changes. Unlink controls remain in the detail pane only. `keyTextFor` and the type→icon map moved from `features/evidence/linked-items.tsx` into `entities/evidence/linked-item-chip.tsx` so both callers share them.
- Not changed (documented in the review): `evidence_links.entity_type` reuses the wide `entity_type` enum without a CHECK (same as `comments`/`activity_events`; a shared constraint is a follow-up migration), and `Recorder.signal()` stamps `action: "updated"` on `evidence.linked/unlinked` (branch on `name`).

### Verification

- `npx vitest run src/server/modules/evidence/service.test.ts` — 9/9 (the new cross-Project test failed before the repository change and passes after).
- `npm test` — 51/51 (7 files). `npm run typecheck`, `npm run lint` — clean.
- `E2E_PORT=3106 E2E_NO_SERVER=1 npx playwright test e2e/flows.spec.ts` — 13/13; `docs/evidence-links/screenshots/04–06` (the Evidence page) were refreshed since the list rows now show the chip strip, the other flows' screenshots were reverted as churn.
- `after-evidence-page-linked-to.png` re-taken on the seeded demo project so the list shows the chip strips.
