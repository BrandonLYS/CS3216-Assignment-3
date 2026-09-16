# Implementation notes — #7 Unified Attention read model

Branch `feat/7-attention`. Follows `plan.md` commit by commit; deviations from the plan and from the
issue text are listed below so the reviewer does not have to diff them out.

## Commits

1. `feat(domain): attention rule vocabulary + pure evaluator` — `ATTENTION_RULES`, `ATTENTION_DUE_SOON_DAYS`,
   `RISK_TOP_SEVERITY` in `src/shared/domain/index.ts`; `evaluateAttention` / `compareAttention` in
   `src/server/modules/workspace/attention.ts`; 15 pure Vitest cases in `attention.test.ts`.
2. `feat(workspace): projectAttention read model` — `dependenciesRepo.listByProjects`; `projectAttention(ctx, projectId, { today? })`
   in `workspace/queries.ts`; DB-backed `queries.test.ts` (seeded scenario + foreign User).
3. `feat(ui): AttentionBadge atom and AttentionList widget` — `src/entities/attention/attention-badge.tsx`,
   `src/widgets/attention/attention-list.tsx` (`AttentionList`, `AttentionCountStrip`).
4. `feat(overview): Project Overview reads the attention model` — inline overdue/blocked derivation removed; tiles
   read `counts`; grouped "Needs attention" panel moved above Milestones.
5. `feat(dashboard): workspaceOverview uses the evaluator per Project` — per-Project evaluation, capped
   cross-Project list (`ATTENTION_DASHBOARD_LIMIT = 10`), per-Project count strip, "Due in 7 days" tile, "Top risks"
   section dropped; two Dashboard cases added to `queries.test.ts`.
6. `test(e2e): attention flow + docs` — `attention` flow in `e2e/flows.spec.ts`, `docs/flows.md` row,
   `docs/attention/screenshots/*`, before/after evidence in `docs/artifacts/7-attention/screenshots/`.
7. This file.

## Test results

- `npm test` — 6 files, 41 tests passed (includes 15 pure evaluator cases and 4 DB-backed workspace cases).
- `E2E_PORT=3107 E2E_NO_SERVER=1 npx playwright test e2e/flows.spec.ts` — 12 passed (all existing flows plus
  `attention`), serial run, ~55 s.
- `npm run typecheck && npm run lint && npx prettier --check .` — green.

## Deviations from the plan (real code won)

- **`compareAttention` tie-break.** The plan's comparator tie-breaks on `code ?? label`, but also requires
  `risk_top` items to sort "by severity then title". Risks carry a `code` (`R-n`), so the literal comparator
  would sort them by number. The comparator now uses `label` for `entityType === "risk"` and `code ?? label`
  otherwise (`attention.ts`, `tieKey`). Covered by the "orders groups by severity and items by urgency" case.
- **E2E final assertion.** The plan asserted `expect(dialog).toContainText("Reconcile legacy ledger")`; the Task
  title lives in an `<input value>` and is not text content, so the flow asserts
  `dialog.getByLabel("Title")).toHaveValue(...)` instead.
- **E2E adds a collapse step.** The plan listed `after-overview-collapsed.png` as an artifact but had no step to
  produce it; the flow now clicks the "Overdue" `<summary>`, asserts the item hides while the badge stays visible,
  and shoots `03-overview-collapsed.png`.
- **`workspaceOverview` "week ago" anchor** now derives from the injected `today` (so tests are deterministic)
  instead of `new Date()`; production behaviour is identical.
- **`date` on `task_blocked` hits** is the due date when present (the plan left it unspecified for blocked).
- **Overview "Late dependencies" tile** replaces the "Open tasks" tile exactly as planned; the header already
  shows `done/total · pct`.

## Deviations from the issue text

- **Top band.** Aligned with the repo's existing convention rather than the literal "maximum band": the Risk
  Register and Project Overview already colour severity `>= 6` (Medium × High) red, so `RISK_TOP_SEVERITY = 6`
  and both pages now read `RISK_TOP_SEVERITY` / `RISK_MID_SEVERITY` from the shared domain (one place).
- **Item shape** adds `matched`, `code`, `urgency`, `projectId` to the issue's
  `{ rule, reasons, entityType, entityId, label, href, date? }`. All are serialisable and additive.
- **Overview "Blocked" tile semantics.** It now counts Tasks whose most-severe rule is `task_blocked`; an
  overdue-and-blocked Task counts under Overdue and shows a secondary "Blocked" tag (user stories 10 and 23).
- **Dashboard.** "Top risks" list replaced by `risk_top` attention items and a "Top risks" tile; `stats.openRisks`
  removed. "Upcoming milestones" kept verbatim with its 14-day window (a calendar roster, not a rule).

## Review notes

- "Today" is `today()` from `src/shared/lib/dates.ts` (server-local calendar date), computed once per request and
  injected into the evaluator; nothing inside rule code calls `new Date()`. A UTC-hosted server flips "today" at
  00:00 UTC.
- `AttentionList` is a server component; collapse uses native `<details open>` so the count in `<summary>`
  survives collapsing without client JS. Open state is not persisted across navigations.
- `widgets/attention` imports **types only** from `server/modules/workspace/queries` (no repository import), in
  line with the layer rule.
- No schema change; `dependenciesRepo.listByProjects` is the only new query (one `inArray`).
- **Pre-existing bug found while producing screenshots (not fixed here, out of scope):** deleting a Project via
  Settings → "Delete everything" fails with
  `activity_events_project_id_projects_id_fk` — `projectsService.delete` calls `rec.deleted(...)` after the Project
  row (and its cascaded events) is gone, so the Activity Event insert violates the FK
  (`src/server/modules/projects/service.ts:49-54`). The comment above it anticipates this but the insert still
  runs. Worth its own issue.

## Screenshot evidence (`docs/artifacts/7-attention/screenshots/`)

| File                           | What it shows                                                                    |
| ------------------------------ | -------------------------------------------------------------------------------- |
| `before-dashboard.png`         | Dashboard before: inline overdue/blocked list, "Due in 14 days", "Top risks"     |
| `before-overview.png`          | Overview before: "Open tasks" tile, inline "Needs attention" (overdue+blocked)   |
| `after-dashboard.png`          | Demo account Dashboard: flat attention list with Project keys, per-Project chips |
| `after-overview.png`           | Demo Project Overview: tiles from `counts`, grouped `<details>` panels           |
| `after-overview-empty.png`     | Fresh Project: "Nothing needs attention. Quiet is good news."                    |
| `after-task-dialog.png`        | Task dialog opened by clicking a Dashboard attention item                        |
| `after-tasks-seeded.png`       | (e2e) Tasks page after seeding the three fixtures                                |
| `after-overview-groups.png`    | (e2e) Overdue / Late dependency / Blocked / Top risk / Due soon groups + reasons |
| `after-overview-collapsed.png` | (e2e) "Overdue" group collapsed, badge and count still visible                   |
| `after-dashboard-counts.png`   | (e2e) Dashboard with "N overdue · N blocked · N late dependencies" strip         |
| `after-item-opens-task.png`    | (e2e) Clicking "Reconcile legacy ledger" opens its dialog                        |

## Review fixes

Follow-up commits addressing the adversarial review of PR #11 (`review-11.md`):

1. **Duplicate fetches on the Project Overview.** `projectAttention(ctx, projectId, opts)` now accepts
   `opts.rows?: ProjectAttentionRows` (`tasks`, `milestones`, `risks`, optional `dependencies`), typed from the
   repository return types. `assertOwnsProject` is still the first line. The Overview passes the three collections
   it already loaded, so only the dependency edges are queried inside — 5 round-trips instead of ~8. A new
   `queries.test.ts` case asserts that pre-fetched rows give a result deep-equal to fetching.
2. **Fragile e2e relative-day assertion.** `/Due .*, 3 days ago/` is now `/Due .*, \d+ days? ago/`, tolerant of
   midnight / clock skew between the Playwright process and the dev server.
3. **User story 18 for the Dashboard roster.** `workspaceOverview` returns `activeProjects` (active + on_hold)
   alongside `projects`. The Dashboard "Projects" panel renders `activeProjects` (with an empty-state line
   pointing at `/projects`); `projects` remains for the empty-state check and `projectById`, so attention items,
   milestones and activity rows can still resolve a Project key/name. The DB test now asserts the archived
   Project is absent from `activeProjects` but still resolvable via `projectById`.
4. **Singular count labels.** `ATTENTION_RULE_META` gained a `singular` string per rule; `AttentionBadge` uses it
   when `count === 1` ("1 late dependency", "1 top risk", "1 milestone passed"). The e2e `/\d+ late dependenc/`
   regex already matched both forms. `docs/attention/screenshots/04-dashboard-counts.png` changed accordingly
   (the e2e fixture yields exactly one late dependency); `after-dashboard.png` was re-taken.

Verification after the fixes: `typecheck`, `lint`, `npm test` (42/42) and the full e2e suite (12/12) are green.
