# Implementation notes - #41 Node-centered graph view

Branch `feat/41-graph-view`, base `862baa7` (main after #40 and the committed plan).
Implemented commit by commit as laid out in [plan.md](./plan.md).

## Commits

| #   | Commit                                                                                             | Files                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 1   | `feat(graph): pure neighbourhood walk with broken-path highlight`                                  | `src/server/modules/graph/neighbourhood.ts` (+test)                                                                 |
| 2   | `feat(graph): neighbourhood read model with labels, hrefs and edge Sources`                        | `src/server/modules/graph/{service,validation}.ts` (+test), `src/shared/lib/hrefs.ts`                               |
| 3   | `feat(graph): node-centred page with causes and consequences columns`                              | `src/features/graph/graph-view.tsx`, `src/app/(app)/projects/[projectId]/graph/page.tsx`                            |
| 4   | `feat(graph): entry links from the impact alert, the Decision list and the Decision dialog`        | `src/widgets/attention/impact-alerts.tsx`, `src/features/decision/{decisions-view,decision-dialog}.tsx`             |
| 5   | `test(e2e): graph flow, docs row, screenshots`                                                     | `e2e/flows.spec.ts`, `docs/flows.md`, `docs/graph/screenshots/*`, refreshed `docs/{decisions,impact}/screenshots/*` |
| 6   | `refactor(graph): centre types in shared/domain, typed node status, superseded_by Source fallback` | after the two-axis code review (below)                                                                              |
| 7   | `docs: implementation notes for #41`                                                               | this file                                                                                                           |

## Deviations from the plan (real code won)

1. **`CENTRE_TYPES` lives in `src/shared/domain` as `GRAPH_CENTRE_TYPES`**, not in `graph/validation.ts`: the view needs the constant at runtime and the features layer imports server modules only as types or through `actions.ts`.
   `graph/validation.ts` derives its zod enum from it; `graphHref` is typed by it.
2. **`DescribedNode` carries `decision: { status } | null` and `assumption: { subtype, state, brokenReason, targetLabel } | null`** instead of a single `status: string`, so the view renders badges without casts.
3. **Source fallback for `superseded_by` edges is the newer Decision (`to`)**, not `from` as the plan said: `decisionsService.supersede` copies the newer Decision's Sources onto the edge, so a deleted Comment should fall back to the Decision that cited it.
4. **The e2e enters the graph from the Decision row icon**, not the dialog link; both exist, the row is one click shorter.
   The e2e also asserts that D-1 is highlighted as a cause of D-2 (the broken UAT Assumption reaches D-2 through D-1 and `superseded_by`), which is the intended semantics rather than the plan's first guess that D-1 would be plain.
5. **`shots()` rewrites every flow's screenshot directory** (the plan reviewer thought it cleared only the current flow); unrelated directories were reverted, `decisions` and `impact` were kept because both surfaces gained the entry link.

## Two-axis code review

- Spec axis: PASS, all nine acceptance criteria met; noted that `watches` and `depends_on` edges say "No source recorded" (plan-approved) and that Milestone and Risk centres are covered by code and DB tests but not by e2e.
- Standards axis: the two "should fix" items became commit 6; nits (unused re-export, `null | undefined` return, status casts) were folded in.

## Test results

- `npx vitest run src/server/modules/graph`: 10 (6 pure walk, 3 service, 1 `parseNodeParam`).
- `npm test`: **31 files, 233 tests passed**.
- `npm run typecheck`, `npm run lint`, `npm run format:check`: clean after every commit.

## E2E and proof

- `E2E_PORT=3141 E2E_NO_SERVER=1 npx playwright test e2e/flows.spec.ts`: **20 passed**.
- `docs/graph/screenshots/`: `01-centred-on-decision` (D-1 with the broken Assumption and its `supports` edge in red), `02-recentred-on-assumption` ("Nothing recorded leads here", watched Milestone with "No source recorded"), `03-opened-from-alert` (external-rule Assumption broken by hand, reached through "Show me why"), `04-broken-path-highlight` (D-2 with two highlighted causes and one plain).
