# Implementation notes - #38 A broken Assumption raises an impact alert

Branch `feat/38-impact-alerts`. Implemented commit by commit as laid out in [plan.md](./plan.md).

## Commits

| #   | Commit                                                                                                     | Files                                                                                                                                                                                                                                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `feat(domain): system via actor, broken reason and alert dismissal columns, activity event ids on changes` | `src/shared/domain/index.ts`, `src/server/modules/decisions/schema.ts`, `drizzle/0008_impact_alerts.sql`, `src/server/core/{diff,mutation}.ts`, `src/server/events/bus.ts`, `src/server/modules/workspace/attention.ts` (+tests), `src/entities/attention/attention-badge.tsx`, `src/entities/activity/via-badge.tsx` |
| 2   | `feat(decisions): breakAssumption, dismissAlert and leads_to consequences`                                 | `src/server/modules/decisions/{validation,repository,service,actions,service.test}.ts`, `src/shared/domain/history-fields.ts`                                                                                                                                                                                         |
| 3   | `feat(impact): deterministic detector and bounded impact walk`                                             | `src/server/modules/impact/{detector,walk}.ts` + tests                                                                                                                                                                                                                                                                |
| 4   | `feat(impact): event-bus subscriber, alert read model and attention wiring`                                | `src/server/modules/impact/{subscriber,service,subscriber.test}.ts`, `src/server/events/subscribers.ts`, `src/server/core/mutation.ts`, `src/server/modules/workspace/queries.ts`                                                                                                                                     |
| 5   | `feat(impact): alert panel on the Project Overview, Leads to picker and manual break`                      | `src/widgets/attention/{impact-alerts,dismiss-alert-button}.tsx`, `src/app/(app)/projects/[projectId]/page.tsx`, `src/features/decision/{consequences-panel,assumptions-panel,decision-dialog,decisions-view}.tsx`, decisions page                                                                                    |
| 6   | `test(e2e): impact alert flow, docs row and screenshots`                                                   | `e2e/flows.spec.ts`, `docs/flows.md`, `docs/impact/screenshots/*`, `src/entities/activity/activity-item.tsx`                                                                                                                                                                                                          |
| 7   | `docs: implementation notes for #38`                                                                       | this file                                                                                                                                                                                                                                                                                                             |

## Deviations from the plan (real code won)

1. **`dependency.created` is not subscribed.** A Dependency that did not exist cannot be watched by an Assumption, so the event can never contradict one; the detector listens to `task.updated`, `milestone.updated` and `person.deleted` only.
2. **Activity Event ids ride on each `FieldChange`** (review finding), not on the event, so the break cites the exact `dueDate` row rather than whichever change happened to be first.
   `Recorder.flush` relies on Postgres returning `INSERT ... VALUES ... RETURNING` rows in insertion order for a single statement.
3. **Trigger `actorName`** is returned as `null` by `impactService.listAlerts` (the alert shows the change and its time; the History tab shows who made it).
4. **Attention row href** for a broken Assumption is `/projects/{id}#impact`, the anchor of the alert section on the same page.
5. **Activity feed field names**: `activity-item.tsx` gained human labels for the new fields (`brokenReason`, `brokenByEventId`, `alertDismissedAt`, `leadsTo`, `decidedOn`, `revisitWhen`, `assumedUntil`) after the screenshot showed "changed brokenbyeventid".
6. **Milestone successor anchor** in the blocking rule is its due date (a Milestone has no start date), as the plan said; the `DependencyEnd` type carries `startDate: null` for Milestones.

Everything else (detector rules and reason sentences, `via: "system"` under the Project owner, read-time alert model with `alertDismissedAt`, `ensureSubscribers` from `Recorder.publish`, walk semantics with the watched item or Dependency successor at depth 0 and Risks terminal, `assumption_broken` as the most severe attention rule, "Leads to" picker, "Mark broken" for external-rule Assumptions) matches the plan.

## Test results

- `npx vitest run src/server/modules/impact`: detector 8, walk 4, subscriber (through real services) 4 - all green; the subscriber suite asserts `via: "system"`, `brokenByEventId` pointing at the `dueDate` Activity Event, unrelated edits leaving the Assumption holding, retired ignored, no re-break, person removal, dependency slip and blocked predecessor.
- `npx vitest run src/server/modules/decisions`: 25 (5 new: break, manual break, dismiss, consequences, ownership).
- `npm test`: **23 files, 189 tests passed** before the UI commit; re-run at the end.
- `npm run typecheck`, `npm run lint`, `npm run format:check`: clean after every commit.

## E2E

`E2E_PORT=3138 E2E_NO_SERVER=1 npx playwright test e2e/flows.spec.ts` - **18 passed** including `impact`.
Screenshots in `docs/impact/screenshots/`: Leads-to picker, the alert (Assumption, reason with both dates, D-1 with its Source chip, downstream Milestone and Task, "Broken assumption" attention group), after dismiss, Decisions list with the chip still Broken.
