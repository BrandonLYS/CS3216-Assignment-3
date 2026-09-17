# Plan - #38 A broken Assumption raises an impact alert

Branch `feat/38-impact-alerts`, worktree `/Users/qang/projects/CS3216-A3-wt/38-impact-alerts`.
Builds on ADR 0008 and the `decisions` module from #37.
New module `src/server/modules/impact/` (detector, walk, service, subscriber), one migration, one new attention rule, an alert panel on the Project Overview, and small additions to the Decision dialog.

## 1. Summary

When a PM moves a Milestone or Task date, removes a Person, or a Dependency becomes blocking, a subscriber on `eventBus` finds every holding Assumption that watches the changed entity, decides deterministically whether it is contradicted, and marks it `broken` through `decisionsService` under `via: "system"` with the triggering Activity Event as `brokenByEventId`.
The Project Overview shows an **Impact alert** per broken, undismissed Assumption: the Assumption, the change that broke it, the affected Decisions (with the Sources they cited) and the downstream Tasks, Milestones and Risks from a bounded, cycle-safe walk.
The alert can be dismissed; dismissing never un-breaks the Assumption.

Verified facts that shape the plan:

- `eventBus.publish` runs in `Recorder.publish()` after the transaction commits and is awaited by `mutate`, so a subscriber runs inside the same request and the e2e can assert the alert right after the save.
  Nothing registers subscribers today (only tests call `subscribe`).
- Next.js `instrumentation.ts` would run once per server instance but in its own module graph; the safe seam is in-process: `Recorder.publish()` calls `ensureSubscribers()` from `src/server/events/subscribers.ts`, which dynamically imports the impact subscriber once (memoised on `globalThis`, same trick as `__eventBus`).
  The dynamic import avoids the cycle `mutation.ts -> impact/service.ts -> mutation.ts`.
- `assumptions` already has `targetType`, `targetId`, `targetField`, `assumedUntil`, `brokenByEventId` (all from #37); `VIA_ACTORS` is `assistant | reflection` and needs `system` (enum migration, ADR 0008).
- `Recorder` stamps `ctx.via` on every Activity Event; a system write needs a `Ctx` for the Project owner: `projects.ownerId` is the user id (`projects/schema.ts:10`).
- `decision_edges.leads_to` exists in the schema but nothing creates it; the walk needs it to reach "downstream of those Decisions".
  This ticket adds the service and a compact "Leads to" picker in the Decision dialog so the alert can name downstream items.
- `downstreamOf(edges, itemId)` (`dependencies/graph.ts`) is cycle-safe but unbounded in depth; the walk adds a depth guard around its own BFS rather than calling `downstreamOf` (which has no depth parameter).
- `evaluateAttention` is pure with typed input; `ATTENTION_RULES` order is severity; `ATTENTION_RULE_META` in `entities/attention/attention-badge.tsx` and the Overview count tiles index by rule.
  Adding `assumption_broken` needs: the rule constant (first, most severe), an `assumptions` input array, `entityType: "assumption"` on `AttentionItem`, meta, and `workspaceOverview` loading broken Assumptions per Project.
- `attention.test.ts:212` asserts group order equals `ATTENTION_RULES` and `queries.test.ts` asserts exact counts objects, so both suites change when `assumption_broken` is prepended (new key in `counts`, empty `assumptions` input in fixtures).
  `AttentionItem.entityType` is `"task" | "milestone" | "risk"` and must widen to include `"assumption"`.
- The Overview page (`projects/[projectId]/page.tsx`) renders `AttentionList` from `projectAttention`; the alert panel sits above it and is fed by `impactService.listAlerts`.

## 2. Domain and design decisions

- **What breaks what** (pure `detector.ts`, `contradictions(event, assumptions, context)`):
  - `date`: `task.updated` / `milestone.updated` with a change whose `field === assumption.targetField`, `entityId === targetId`, and `newValue > assumedUntil` (ISO string compare).
    No other field breaks it; clearing the date (`newValue === null`) does not break it.
  - `person`: `person.deleted` with `entityId === targetId`.
  - `dependency`: after `task.updated` / `milestone.updated` (fields `dueDate`, `startDate`, `statusId`) or `dependency.created`, re-evaluate each holding dependency Assumption whose Dependency touches the changed item.
    Blocking means the predecessor is open (non-terminal category) and either its Status Category is `blocked` or its due date is later than the successor's start (or due) date, the same rule `dependency_late` already applies.
    Milestone predecessors use `dueDate`; Milestone successors use `dueDate` as anchor.
  - `external_rule`: never detected; `decisionsService.breakAssumption` is exposed for the PM ("Mark broken" in the Assumptions panel).
  - Only `state === "holding"` Assumptions are considered.
- **Recording the break**: `decisionsService.breakAssumption(ctx, { id, brokenByEventId, reason })` inside `mutate`: `state` to `broken`, `brokenByEventId`, `brokenReason` (new text column, the human sentence the detector composed), `rec.updated("assumption", ..., [{ field: "state" }, { field: "brokenByEventId" }])`.
  The subscriber builds `ctx = { db, userId: project.ownerId, via: "system" }`.
  `brokenByEventId` is the id of the Activity Event row for the exact field change that contradicted the Assumption.
  `Recorder.flush` inserts one row per `FieldChange` for `updated` events, so the id belongs on the change: `FieldChange` gains `activityEventId?: string`, `flush` inserts with `.returning({ id })` and writes ids back in insertion order (created/deleted events get theirs on the event as `activityEventId`, updated events on each change).
  The detector reads `change.activityEventId`.
  `rec.updated` for the break passes full `FieldChange`s: `state` (holding to broken), `brokenByEventId` (null to id), `brokenReason` (null to sentence).
- **Alert model**: no new table.
  An alert is a broken Assumption whose `alertDismissedAt` (new nullable timestamp) is null.
  Impact is computed at read time by the walk over the current graph; a snapshot would go stale the moment the PM fixes the plan.
  `dismissAlert(ctx, id)` sets `alertDismissedAt` through `mutate` with `rec.updated` field `alertDismissedAt` so History shows it.
- **Walk** (pure `walk.ts`, `impactWalk({ assumptionId, edges, dependencies, maxDepth = 3 })`):
  step 0 the Assumption; step 1 Decisions via `supports`; step 2 items via `leads_to` plus the watched item (date: the Task or Milestone itself; dependency: the Dependency's successor, since an edge is not a page), because the item whose date moved is affected by definition; step 3.. `dependencies` successors, BFS with a `visited` set and `depth <= maxDepth`, Risks terminal.
  Returns `{ decisionIds, items: [{ type, id, depth }] }`.
- **`leads_to` edges**: `decisionsService.addConsequence(ctx, { decisionId, targetType: task|milestone|risk, targetId })` and `removeConsequence`, edge from Decision to item with copied Sources, `rec.updated` on the Decision with synthetic field `leadsTo` (list).
  Dialog: "Leads to" section under Assumptions with a `CommandPicker` over Tasks, Milestones and Risks and chips with a remove button.
- **Attention rule** `assumption_broken`, first in `ATTENTION_RULES`; item label = statement, reason = `brokenReason`, href = `/projects/{id}#impact`, urgency = `-1 * affected decision count` (more affected first).
  `evaluateAttention` input gains `assumptions?: Array<{ id, statement, state, alertDismissedAt, brokenReason, affectedDecisions }>`; `projectAttention` and `workspaceOverview` load them via `assumptionsRepo.listBrokenByProjects`.
- **Reason sentences** (composed by the detector, stored on the row): `"UAT begins" due date moved from 25 Sep 2026 to 20 Oct 2026, past the assumed 1 Oct 2026`; `Priya Nair was removed from the project`; `"Implement v2" -> "Load test" became blocking: Implement v2 due 20 Oct 2026 is after Load test start 10 Oct 2026` or `...: Implement v2 is blocked (Waiting on vendor)`.

## 3. Changes, grouped into commit points

Each commit leaves `npm run typecheck` and `npm run lint` green; tests first inside each commit.

### Commit 1 - `feat(domain): system via actor, broken reason and alert dismissal columns`

- `VIA_ACTORS` += `system`; `ATTENTION_RULES` gains `assumption_broken` at index 0.
- `assumptions` gains `brokenReason text`, `alertDismissedAt timestamptz`; `npm run db:generate` -> `drizzle/0008_impact_alerts.sql` (rename), migrate dev and `db_test`.
- `FieldChange.activityEventId?: string` and `DomainEvent.activityEventId?: string`; `Recorder.flush` inserts with `.returning({ id })` and maps ids back: one per change for `updated`, one per event otherwise (`mutation.test` or the decisions tests assert an `updated` event carries an id per change).
- `ATTENTION_RULE_META.assumption_broken` (label "Broken assumption", `text-tag-red`, `bg-tag-red/10`); `attention.ts` accepts `assumptions` input (optional, default `[]`), widens `AttentionItem.entityType` with `"assumption"` and emits one item per broken, undismissed Assumption; `attention.test.ts` and `queries.test.ts` updated for the new rule key and group order.
- `via-badge.tsx` `LABEL` gains `system`; `viaActorEnum` regenerated with the migration.

### Commit 2 - `feat(decisions): breakAssumption, dismissAlert and leads_to consequences`

- `validation.ts`: `breakAssumptionSchema { id, reason? }`, `consequenceSchema { decisionId, targetType: enum(task, milestone, risk), targetId }`.
- `service.ts`: `breakAssumption(ctx, { id, brokenByEventId?, reason? })` (holding or already broken -> idempotent on broken, rejects retired), `dismissAlert(ctx, id)`, `addConsequence`, `removeConsequence`; `list` now returns `consequences` per Decision (`{ type, id }`).
- `repository.ts`: `assumptionsRepo.listBrokenByProjects(ids)`, `listWatching(projectId, targetType, targetId)`, `listHoldingByProject`.
- `actions.ts`: `breakAssumptionAction`, `dismissAlertAction`, `addConsequenceAction`, `removeConsequenceAction`.
- Tests appended to `decisions/service.test.ts`: manual break records `state` + `brokenByEventId`, retired cannot break, dismiss sets the timestamp and leaves `state = broken`, consequence edge has copied Sources, ownership for all four.
- History fields: `assumption.brokenReason` (text), `assumption.brokenByEventId` (text), `assumption.alertDismissedAt` (date), `decision.leadsTo` (list).
- `decisionsService.list` returns `consequences: { type, id }[]` per Decision from `leads_to` edges; `decisions/page.tsx` also loads `risksService.list` and passes `risks` to `DecisionsView` / `DecisionDialog` for the picker and labels.

### Commit 3 - `feat(impact): deterministic detector and bounded impact walk`

- `src/server/modules/impact/detector.ts`: `dateContradiction`, `personContradiction`, `dependencyContradiction(dep, predecessor, successor)` -> `string | null` reason; `contradictions(event, candidates, ctx)`.
- `src/server/modules/impact/walk.ts`: `impactWalk` as in section 2.
- `impact/detector.test.ts` and `impact/walk.test.ts` (pure, no DB): date past / date before / unrelated field / null date; person removed; dependency blocking by date, by blocked status, not blocking when predecessor done; walk: three-step bound, cycle (A -> B -> A in dependencies) terminates, Risk terminal, watched item included, empty when nothing supports.

### Commit 4 - `feat(impact): event-bus subscriber and alert read model`

- `src/server/modules/impact/subscriber.ts`: `registerImpactDetector()` (idempotent via `globalThis.__impactRegistered`) subscribing to `task.updated`, `milestone.updated`, `person.deleted`, `dependency.created`; handler loads holding Assumptions watching the entity (and, for dependency Assumptions, Dependencies touching it), the rows the detector needs, calls `decisionsService.breakAssumption` under the owner `Ctx` `{ db, userId: project.ownerId, via: "system" }` (the process-wide `db` singleton, since the publisher has no request `Ctx`); errors are logged, never thrown into the publisher.
  The manual path omits the `brokenByEventId` change when no event id is supplied.
- `src/server/events/subscribers.ts`: `ensureSubscribers()`, memoised on `globalThis` so the dynamic import runs once per process; `Recorder.publish` awaits it before publishing.
  Why not `instrumentation.ts`: it is bundled as its own module graph, so the subscriber would import a second copy of the db client and services; the in-process seam keeps one graph.
  Re-entrancy is inherent to any subscriber that writes (the break runs its own `mutate` and a nested `publish` while the outer `publish` awaits it); it is bounded because the detector ignores `assumption.*` events and each break happens at most once per Assumption (`state` guard).
- `src/server/modules/impact/service.ts`: `impactService.listAlerts(ctx, projectId)` -> `[{ assumption, reason, brokenAt, trigger: { entityType, entityLabel, field, oldValue, newValue, occurredAt } | null, decisions: [{ id, number, title, sources }], items: [{ type, id, label, code?, href, depth }] }]`, with `assertOwnsProject` first; `dismiss` re-exported from `decisionsService`.
- `impact/subscriber.test.ts` (DB): full path through real services: create Decision + date Assumption on a Milestone, `milestonesService.update` the date past `assumedUntil` -> Assumption broken, `brokenByEventId` equals the Activity Event id, `via: "system"` on the break event, `listAlerts` names the Decision and the Milestone; unrelated edit (name) leaves it holding; person removal breaks a person Assumption; dependency Assumption breaks when predecessor slips; retired and broken are ignored (no second break, `brokenByEventId` unchanged).
- `projectAttention` / `workspaceOverview` load broken Assumptions and pass them to the evaluator; `queries.test.ts` gets one case.

### Commit 5 - `feat(impact): alert panel on the Project Overview and dialog additions`

- `src/widgets/attention/impact-alerts.tsx` (server component + small client `DismissAlertButton`): per alert a `Panel` with red left border: statement, reason, "Broken by <change> on <date>", "Affects N decisions": each Decision `D-n title` linking to `/projects/{id}/decisions?decision=<id>` and its Sources as chips (label, kind), "Downstream": items with code/label linking to their dialogs (Task `?task=`, Milestone timeline `?milestone=`, Risk `?risk=`), Dismiss button (`dismissAlertAction`, `router.refresh()` on success).
  Anchor `id="impact"` so the attention row and the Decisions list can link to it.
- Overview page: fetch `impactService.listAlerts` in the same `Promise.all`, render `<ImpactAlerts>` above `AttentionList` (only when non-empty); the count tiles gain "Broken assumptions" if the row has room, else rely on the list group.
- Decision dialog: "Leads to" section (`consequences-panel.tsx`); Assumptions panel gains "Mark broken" (external-rule only, confirm inline) and shows `brokenReason` under a broken row.
- `AssumptionChip` broken state unchanged (already red).

### Commit 6 - `test(e2e): impact alert flow, docs row, screenshots`

- `e2e/flows.spec.ts`: `impact` describe after `decisions` (runs last, so moving the Milestone disturbs no earlier flow): on Decisions tick "Show superseded" (the decisions flow left D-1 superseded by D-2; a superseded Decision still rests on its Assumptions), open D-1 (date Assumption on "UAT begins", assumed until 2026-10-01), add "Leads to" the "Load-test the new gateway" Task; go to Timeline, open "UAT begins", first set the due date to 2026-09-25 (the timeline flow created it at 2026-10-05, already past the assumed date, and the Assumption was created after that date so it was never contradicted by an event), save, assert the Overview has no impact alert panel (other attention items from earlier flows remain); then move it to 2026-10-20, save; go to Overview: alert visible naming "Merchant dataset arrives before UAT", reason contains "20 Oct 2026" and "1 Oct 2026", lists "D-1", the Milestone "UAT begins" and the Task; the attention group "Broken assumption" shows 1; screenshot; Dismiss; alert gone, Decisions list still shows the chip as Broken; screenshot.
- `docs/flows.md` row; screenshots to `docs/impact/screenshots`.

### Commit 7 - `docs: implementation notes for #38`

## 4. How to test and verify

1. `npm run db:migrate` (dev + `db_test` via the Vitest global setup).
2. Red/green: `npx vitest run src/server/modules/impact` fails before the module exists; `npx vitest run src/server/modules/decisions` for Commit 2.
3. `npm test` at the end (all suites, including `attention.test.ts` and `queries.test.ts` with the new rule).
4. `npm run typecheck`, `npm run lint`, `npm run format:check` after each commit.
5. E2E: `E2E_PORT=3138 E2E_NO_SERVER=1 npx playwright test e2e/flows.spec.ts` - 18 flows pass.
6. Manual walk: move a Task due date on a date Assumption, remove a Person, slip a predecessor; check History of the Assumption shows the `System` badge; dismiss; verify `state` stays broken in the Decisions list.
7. Acceptance checklist:
   - date breaks on the watched field moving past `assumedUntil`, not on unrelated edits (detector tests + subscriber test).
   - person breaks on removal (subscriber test).
   - dependency breaks when blocking (detector + subscriber test).
   - break is a recorded change attributed to the system with the trigger as its source (`via: "system"`, `brokenByEventId`).
   - walk returns Decisions and downstream Milestones, bounded, cycle-safe (walk tests).
   - retired and broken ignored (subscriber test).
   - alert on the attention surface with reason and affected items, dismissible (e2e + screenshots).
   - walk unit tested incl. cycle and depth.
   - e2e moves a Milestone date and asserts Decisions and Milestones named.
   - visual proof.

## 5. Out of scope

- Re-holding a broken Assumption (no "un-break").
- Alerts for Decision status changes or superseded chains.
- The node-centred graph view (#41) - the alert links to the Decisions list; #41 re-points the link.
- Assistant proposals (#39).
