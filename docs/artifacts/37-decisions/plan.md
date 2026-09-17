# Plan - #37 A PM can record a Decision and its typed Assumptions by hand

Branch `feat/37-decisions`, worktree `/Users/qang/projects/CS3216-A3-wt/37-decisions`.
Builds on ADR 0008 (`docs/adr/0008-decision-memory-graph.md`) and the `### Decision Memory` glossary.
New module `src/server/modules/decisions/`, new route `/projects/[projectId]/decisions`, new feature folder `src/features/decision/`.
No AI in this slice.

## 1. Summary

A PM opens the new **Decisions** tab of a Project, creates a Decision (title, date, owner, context, chosen, alternatives, revisit-when, at least one Source), then in the same dialog adds typed Assumptions, attaches or detaches existing ones, retires one, and may mark the Decision as superseding an earlier one.
The list shows `D-n`, title, date, owner, status and the Assumptions with their state.
Every write goes through `decisionsService` behind `assertOwnsProject` inside `mutate`, so each create/update/delete emits Activity Events and domain events.

Verified facts that shape the plan:

- ADR 0008 fixes the tables (`decisions`, `assumptions`, `decision_edges`, `decision_sources`), edge kinds (`supports`, `leads_to`, `superseded_by`), Source shape (`kind`, `entityId`, `passageId`, `excerpt`, `label`), Assumption columns (`state`, `subtype`, `targetType`, `targetId`, `targetField`, `assumedUntil`, `brokenByEventId`), and that "at least one Source" is a service rule with a DB `CHECK (num_nonnulls(decision_id, edge_id) = 1)` on sources.
- `ENTITY_TYPES` backs `entityTypeEnum`; adding `decision` and `assumption` needs a Drizzle enum migration (`ALTER TYPE ... ADD VALUE`, see `drizzle/0003_activity_via.sql` for the generated shape).
  `VIA_ACTORS` gains `system` in #38, not here.
- Module pattern (`risks/`): `schema.ts`, `validation.ts` (zod, `requiredText/optionalText/optionalDate/optionalId` from `src/server/core/validation.ts`), `repository.ts` (Drizzle, `withJoins`), `service.ts` (`getOwned`, `mutate`, `nextNumber` for the per-Project `D-n`), `actions.ts` (`runAction` + `revalidateProject`).
- `mutate` gives a `Recorder`; `rec.created(entityType, projectId, id, label, snapshot?)`, `rec.updated(..., changes)`, `rec.deleted(..., snapshot?)`; `diffFields(before, compactPatch(patch))` for updates.
- `src/server/db/schema.ts` re-exports every module schema; the new module must be added there or `drizzle-kit generate` will not see it.
- `loadProjectRefs` (`src/server/modules/projects/refs.ts`) already carries `people`, `milestones`, `evidence` summaries; it does not carry Tasks or Dependencies, which the date and dependency subtypes need as pickers.
  The page loads those two lists itself rather than widening `ProjectRefs` for every page.
- `ActionForm` posts `FormData`; complex values (Source list) travel as one hidden JSON field parsed by a `z.preprocess` in the schema (same trick as `labelIds` handling elsewhere: `formToObject` turns repeated keys into arrays).
- `CommandPicker` (`src/shared/ui/command-picker.tsx`) is the inline searchable list used inside dialogs (`LinkedEvidence`); it is the right primitive for the Source and Assumption pickers.
- `HISTORY_ENTITY_TYPES` is `satisfies readonly CommentableEntityType[]`; to give Decisions a History tab the constraint loosens to `EntityType[]` and `HISTORY_FIELDS` gains `decision` and `assumption` maps.
- `PROJECT_SECTIONS` in `src/widgets/command-palette/command-palette.tsx` drives both the header nav and the palette; adding `{ slug: "decisions", label: "Decisions", icon: GitBranch }` is the only nav change.
- Tests: Vitest against `db_test` with `makeCtx`/`makeProject` from `src/test/helpers.ts`; `eventBus.subscribe` to assert domain events; `ForbiddenError`/`ValidationError`/`NotFoundError` from `src/server/core/errors.ts`.
- E2E: one `test.describe` per flow in `e2e/flows.spec.ts`, screenshots to `docs/<flow>/screenshots`, one row in `docs/flows.md`.

## 2. Domain and schema decisions (settled here, not in the UI)

Vocabularies appended to `src/shared/domain/index.ts`:

```ts
export const DECISION_STATUSES = ["active", "superseded", "revisited"] as const;
export const ASSUMPTION_SUBTYPES = ["date", "person", "dependency", "external_rule"] as const;
export const ASSUMPTION_STATES = ["holding", "broken", "retired"] as const;
export const ASSUMPTION_TARGET_TYPES = ["task", "milestone", "person", "dependency"] as const;
export const DATE_TARGET_FIELDS = ["startDate", "dueDate"] as const;
export const DECISION_EDGE_KINDS = ["supports", "leads_to", "superseded_by"] as const;
export const SOURCE_KINDS = ["evidence", "comment", "activity_event"] as const;
export const SOURCE_EXCERPT_MAX = 500;
```

`ENTITY_TYPES` gains `"decision"`, `"assumption"` (end of the list so existing enum ordinals are untouched).

Tables (`src/server/modules/decisions/schema.ts`), all with `projectId` FK cascade and an index on it:

- `decisions`: `id`, `projectId`, `number` (unique per Project, rendered `D-n`), `title`, `decidedOn` (date, not null), `ownerId` (people, set null), `status` (`decision_status`, default `active`), `context`, `chosen` (not null), `alternatives`, `revisitWhen`, timestamps.
- `assumptions`: `id`, `projectId`, `statement` (not null), `subtype`, `state` (default `holding`), `targetType` (nullable), `targetId` (nullable), `targetField` (nullable), `assumedUntil` (date, nullable), `brokenByEventId` (nullable text, reserved for #38), timestamps.
- `decision_edges`: `id`, `projectId`, `kind`, `fromType`/`fromId`, `toType`/`toId` (`entity_type`), `createdAt`; unique `(fromId, toId, kind)`; partial unique index `(fromId) WHERE kind = 'superseded_by'` so a Decision is superseded by at most one Decision at the database level; indexes on `fromId` and `toId`.
- `decision_sources`: `id`, `projectId`, `decisionId` (FK cascade, nullable), `edgeId` (FK cascade, nullable), `kind`, `entityId`, `passageId` (nullable text, no FK until #42 creates the passage table), `excerpt`, `label`, `createdAt`; `CHECK (num_nonnulls(decision_id, edge_id) = 1)`; index on `decisionId`, `edgeId`, and `(kind, entityId)`.

Rules the service enforces:

- Create/update of a Decision requires `sources.length >= 1` (schema-level `min(1)` gives the form error "Add at least one source"; the service re-checks because Assistant callers bypass the form).
- Each Source must resolve inside the same Project at write time: Evidence by `evidence.projectId`, Comment by `comments.projectId`, Activity Event by `activity_events.projectId`; otherwise `ValidationError("Source is not in this project")`.
  `label`/`excerpt` are computed server-side from the resolved row (Evidence title, first line of the Comment body, `entityLabel` + field for an Activity Event) and never trusted from the client.
- An Assumption requires `subtype`; `date` requires `targetType in (task, milestone)`, `targetId`, `targetField` (`dueDate` forced when the target is a Milestone, since Milestones have no start date), `assumedUntil`; `person` requires `targetType = person` + `targetId`; `dependency` requires `targetType = dependency` + `targetId`; `external_rule` forbids a target.
  Targets are checked to exist in the Project (`assertPersonInProject` for people, repo lookups for the rest).
- Edges created from a Decision dialog (`supports`, `superseded_by`) inherit that Decision's Sources by copy unless the caller passes explicit `sources`; this satisfies ADR 0008's "every edge cites a Source" without asking the PM to re-pick a Source for every attach.
- `supersede(decisionId, supersededId)`: both in the same Project, not equal, `wouldCreateCycle` over existing `superseded_by` edges rejects ancestors; inserts the `superseded_by` edge (old to new) and sets the old Decision `status = superseded` via `rec.updated` with `field: "status"`.
  Clearing the supersede link (`supersededId: null`) removes the edge and restores the old Decision to `active`.
  A Decision is superseded by at most one Decision (the form is a single select); the service rejects a second `superseded_by` edge out of the same Decision.
- `detachAssumption` removes the `supports` edge; if the Assumption has no remaining `supports` edge it is deleted (`rec.deleted`), because an Assumption belongs to one or more Decisions by definition.
  `deleteDecision` cascades edges and sources by FK, then deletes orphaned Assumptions the same way, and records `rec.deleted` for each.
- `retireAssumption` sets `state = retired` from `holding` or `broken`; `reopen` is not offered (out of scope).
- Edges are not entity types, so an edge row has no Activity Event of its own.
  Attach, detach and supersede therefore also call `rec.updated` on the parent Decision with a synthetic field (`assumptions`: old/new list of Assumption statements; `supersededBy`: old/new Decision title), the same pattern as the `evidence` field on Tasks, so the Decision History tab shows them.
  In `supersede` the status change is passed as an explicit `[{ field: "status", oldValue: "active", newValue: "superseded" }]` because there is no `before/after` row diff for it.
- Ownership: every public function starts with `assertOwnsProject` (or `getOwned` which calls it).

## 3. Changes, grouped into commit points

Each commit leaves `npm run typecheck` and `npm run lint` green.
Tests are written first inside each commit (red, then green).

### Commit 1 - `feat(domain): decision memory vocabularies, schema and migration`

- `src/shared/domain/index.ts`: vocabularies above; `ENTITY_TYPES` += `decision`, `assumption`.
- `src/server/db/enums.ts`: `decisionStatusEnum`, `assumptionSubtypeEnum`, `assumptionStateEnum`, `assumptionTargetTypeEnum`, `dateTargetFieldEnum`, `decisionEdgeKindEnum`, `sourceKindEnum`.
- `src/server/modules/decisions/schema.ts`: four tables as in section 2.
- `src/server/db/schema.ts`: `export * from "@/server/modules/decisions/schema"`.
- `npm run db:generate` produces `drizzle/0007_decisions.sql` (rename the generated slug); verify it contains `ALTER TYPE "public"."entity_type" ADD VALUE 'decision'` and `'assumption'`, the four `CREATE TABLE`s and the `CHECK`.
  Drizzle-kit does not emit `CHECK` from `check()` on older versions; if absent, add it by hand to the SQL and to the schema via `check("decision_sources_owner_ck", sql\`num_nonnulls(decision_id, edge_id) = 1\`)`.
- `npm run db:migrate` against dev and `db_test` (the Vitest setup migrates `db_test`; confirm in `vitest.config.ts` / `src/test/setup.ts`).
- Anywhere that exhaustively switches on `EntityType` (grep `Record<EntityType` and `satisfies` uses) gets the two new keys: at least `activity-item.tsx` label/icon maps and the Assistant tool descriptions if they enumerate entity types.

### Commit 2 - `feat(decisions): validation, repository and service with tests`

- `validation.ts`:
  - `sourceInputSchema = z.object({ kind: z.enum(SOURCE_KINDS), entityId: z.string().min(1), passageId: z.string().nullable().optional() })`.
  - `sourcesField = z.preprocess(parseJsonIfString, z.array(sourceInputSchema).min(1, "Add at least one source"))`, with `parseJsonIfString = (v) => (typeof v === "string" ? JSON.parse(v) : v)` added to `src/server/core/validation.ts` (it does not exist yet).
  - `createDecisionSchema`: `projectId`, `title` (`requiredText`, 200), `decidedOn` (`requiredDate`), `ownerId` (`optionalId`), `context`, `chosen` (`requiredText("What was chosen", 4000)`), `alternatives`, `revisitWhen` (`optionalText`), `supersedesId` (`optionalId`), `sources`.
  - `updateDecisionSchema`: `id` + optional versions; `status: z.enum(["active", "revisited"])` only (superseded is set by supersede); `sources` optional but when present `min(1)`.
  - `createAssumptionSchema`: `projectId`, `decisionId`, `statement` (`requiredText`, 500), `subtype`, `targetType`, `targetId`, `targetField`, `assumedUntil` (`optionalDate` at the field level; the `superRefine` makes it required for `date`), with a `superRefine` enforcing the subtype matrix from section 2 (field-level errors on `targetId`, `targetField`, `assumedUntil`).
  - `attachAssumptionSchema` `{ decisionId, assumptionId }`, `detachAssumptionSchema` same, `retireAssumptionSchema { id }`.
- `repository.ts`: `decisionsRepo.listByProject` (join `people` for owner; returns `{ decision, owner }`), `findById`, `insert`, `update`, `delete`; `assumptionsRepo` same plus `listByProject`, `listForDecisions(decisionIds)` via `supports` edges; `edgesRepo.listByProject`, `findSupports(decisionId, assumptionId)`, `findSupersededBy(fromId)`, `insert`, `delete`, `deleteForNode(id)`; `sourcesRepo.listForDecisions`, `listForEdges`, `insertMany`, `deleteForDecision`.
  Also `sourceCandidatesRepo.list(projectId)` returning `{ evidence: {id,title,kind}[], comments: {id, body, entityType, entityId, saidOn}[] (latest 200), activityEvents: {id, entityType, entityLabel, action, field, occurredAt}[] (latest 200) }` for the picker.
- `service.ts` (`decisionsService`): `list` (returns decisions with owner, assumptions grouped per decision, sources per decision, supersededBy / supersedes ids), `get`, `create`, `update`, `delete`, `supersede`, `createAssumption`, `attachAssumption`, `detachAssumption`, `retireAssumption`, `sourceCandidates`; private `resolveSources(tx, projectId, inputs)` that validates Project membership and computes `label`/`excerpt`.
  `createAssumption` inserts the Assumption and its `supports` edge, calls `rec.created("assumption", ...)` and `rec.updated("decision", ..., [{ field: "assumptions", oldValue, newValue }])`; test 4 asserts both events.
  `sourceCandidates` excludes Activity Events whose `entityId` is the Decision being edited (passed as an optional `excludeEntityId`) so a Decision cannot cite itself.
  Labels for Activity Events: `decisionLabel = title`, `assumptionLabel = statement` truncated to 120 code points (reuse the `commentLabel` truncation helper pattern if it is exported, else local).
- `service.test.ts` (red first):
  1. create with one Evidence Source succeeds, emits `decision.created`, number is `1` then `2`.
  2. create with `sources: []` rejects `ValidationError`; create with an Evidence id from another Project rejects.
  3. create with a Comment Source stores `label`/`excerpt` from the Comment body; with an Activity Event Source stores `entityLabel`.
  4. `createAssumption` `date` without `assumedUntil` rejects; without `targetId` rejects; `external_rule` with a target rejects; `person` with a Person from another Project rejects; valid `date` creates and attaches (`supports` edge exists, edge has copied Sources).
  5. `supersede` sets old to `superseded`, records `updated` Activity Event `field: "status"`, inserts edge; superseding self rejects; A superseded by B then B superseded by A rejects (cycle); second supersede out of the same Decision rejects.
  6. `detachAssumption` deletes an orphaned Assumption and emits `assumption.deleted`; keeps one still attached elsewhere.
  7. `delete` removes edges and sources (count 0) and orphaned Assumptions.
  8. stranger `Ctx`: `list`, `get`, `update`, `createAssumption`, `supersede` all reject `ForbiddenError`.
  9. `update` with no real change records no Activity Event; changing `chosen` records one.

### Commit 3 - `feat(decisions): server actions`

- `actions.ts`: `createDecisionAction(fd)`, `updateDecisionAction(fd)`, `deleteDecisionAction(fd)`, `supersedeDecisionAction(input)` (JSON), `createAssumptionAction(fd)`, `attachAssumptionAction(input)`, `detachAssumptionAction(input)`, `retireAssumptionAction(input)`; each `runAction` + `revalidateProject`.
- No tests beyond typecheck (actions are one-liners; prior modules do the same).

### Commit 4 - `feat(decisions): Decisions page, list and dialog`

- Route `src/app/(app)/projects/[projectId]/decisions/page.tsx`: `ctxForCurrentUser`, then `Promise.all([loadProjectRefs(ctx, projectId), decisionsService.list(ctx, projectId), decisionsService.sourceCandidates(ctx, projectId), tasksService.list(ctx, projectId), dependenciesService.list(ctx, projectId)])`, renders `<DecisionsView>` in `Suspense` (same as `risks/page.tsx`).
  `npm run typecheck` runs `next typegen` first, so the route file must exist before the first typecheck of this commit.
- `PROJECT_SECTIONS` += `decisions` (icon `GitBranch` from lucide) between Risks and Evidence.
- `src/features/decision/decisions-view.tsx`: header count + "New decision" button; table `D-n | Decision | Date | Owner | Status | Assumptions`; Assumptions column renders `<AssumptionChip>` per attached Assumption (statement truncated, state colour: holding `text-ink-subtle`, broken `text-tag-red`, retired `text-ink-tertiary` strike-through); "Show superseded" toggle mirrors "Show closed"; row click opens `?decision=<id>` (same URL pattern as Risks); superseded rows show "superseded by D-m".
- `src/features/decision/decision-dialog.tsx`: `Dialog` + `ItemDialogTabs` (history when editing) + `ActionForm` with fields Title, Decided on (date), Owner (select from `refs.people`), Status (edit only: active / revisited), Context, Chosen, Alternatives (with why rejected), Revisit when, Supersedes (select of other Decisions, excluded: self, already superseded ones) - the supersede select is submitted as `supersedesId` on create and drives `supersedeDecisionAction` on change in edit mode.
  Below the fields: `<SourcePicker>` and, in edit mode, `<AssumptionsPanel>`.
  Delete confirmation in `footerStart` mirrors `RiskDialog`.
- `src/features/decision/source-picker.tsx`: controlled list of chosen Sources (chips with kind icon, label, remove button) + inline `CommandPicker` over the candidates (`CommandPicker` has no group headings, so the kind is shown as the per-item `hint` tag: Evidence / Comment / Activity); writes `<input type="hidden" name="sources" value={JSON.stringify(list)} />`; shows the schema field error under the list via `useActionForm().fieldErrors.sources`.
- `src/features/decision/assumptions-panel.tsx` (edit mode only, not a `<form>`, all buttons `type="button"` like `LinkedEvidence`): list attached Assumptions with subtype badge, target label, `assumedUntil`, state; buttons Retire (holding/broken) and Detach; "Attach existing" `CommandPicker` over unattached Project Assumptions; "New assumption" toggles an inline sub-form rendered in a nested `Dialog` (a nested `<form>` cannot live inside the Decision `ActionForm`) using `createAssumptionAction` with Statement, Subtype select, and subtype-dependent fields: date → Target (grouped select of Milestones then Tasks, value `milestone:<id>` / `task:<id>` split client-side into `targetType`/`targetId` hidden inputs), Field (`dueDate`/`startDate` select shown for Tasks; a hidden `targetField=dueDate` for Milestones), Assumed until (date); person → Person select; dependency → Dependency select labelled "`pred` → `succ`"; external_rule → none.
- `src/entities/decision/`: `decision-status-badge.tsx`, `assumption-chip.tsx` (display atoms, tokens only).
- History (same commit as the dialog wiring, because `historyField` indexes `HISTORY_FIELDS[entityType]` at runtime): `HISTORY_ENTITY_TYPES` += `decision`, `assumption`, keeping it a literal tuple but with `satisfies readonly EntityType[]`; `HISTORY_FIELDS.decision` (title, decidedOn date, ownerId person, status enum, context, chosen, alternatives, revisitWhen, assumptions text, supersededBy text) and `.assumption` (statement, state enum, assumedUntil date).
  `ItemDialogTabs` and `EntityHistory` need no other change.

### Commit 5 - `test(e2e): decisions flow, docs row and screenshots`

- `e2e/flows.spec.ts`: new `test.describe("decisions")` after `evidence` (it needs an Evidence item to cite and People/Milestones from earlier flows):
  1. open Decisions tab, screenshot `empty`.
  2. New decision: fill Title "Switch from surveys to interviews", Decided on, Owner "Priya Nair", Chosen, Alternatives; click Create without a Source, assert the error text "Add at least one source" is visible, screenshot `missing-source-error`.
  3. Add Source via picker (type part of the Evidence title, pick), screenshot `new-decision-dialog`, Create, assert `D-1` visible.
  4. Reopen D-1, New assumption: Statement "Dataset arrives before UAT", Subtype date, Target the UAT milestone, Assumed until, Create; assert chip visible; add a person Assumption; screenshot `assumptions`.
     The nested Assumption dialog is a second `role="dialog"`, so selectors use `page.getByRole("dialog", { name: "New assumption" })` and the outer one `page.getByRole("dialog", { name: /D-1/ })`.
  5. Retire the person Assumption; assert strike-through / "Retired" text.
  6. Create D-2 that supersedes D-1; assert D-1 row shows "Superseded" and "superseded by D-2"; toggle "Show superseded"; screenshot `list`.
- `docs/flows.md`: row `decisions`.
- Screenshots land in `docs/decisions/screenshots/` and are committed as the visual proof; copy the key ones to `docs/artifacts/37-decisions/screenshots/`.

### Commit 6 - `docs: implementation notes for #37`

`docs/artifacts/37-decisions/implementation-notes.md`: commit table, deviations, test output, e2e output.

## 4. How to test and verify

1. `npm run db:up` and `npm run db:migrate`; `npx drizzle-kit migrate` against `db_test` if the test setup does not do it.
2. Red/green per commit: `npx vitest run src/server/modules/decisions/service.test.ts` fails before `service.ts` exists, passes after Commit 2.
3. `npm run typecheck`, `npm run lint`, `npm run format:check` after every commit; `npm test` once at the end (all files).
4. E2E: `npm run dev` in one terminal; `E2E_NO_SERVER=1 npx playwright test e2e/flows.spec.ts`; the `decisions` describe passes and screenshots exist.
5. Manual walk in the browser (ui-proof): create a Decision with each Source kind, each Assumption subtype, supersede and un-supersede, delete a Decision with an attached Assumption and confirm the Assumption disappears and History shows the events; check the Activity feed on the Overview shows "Decision ... created".
6. Acceptance checklist against the issue:
   - Migrations add the tables and edges, generated by `db:generate`.
   - All writes through `mutate`, events emitted (test 1, 5, 6).
   - `assertOwnsProject` first line (test 8 + code read).
   - No Source, no save; clear form error (test 2, e2e step 2).
   - Subtype required; typed target required (test 4).
   - Create/edit/delete Decision, attach/detach Assumptions, retire (e2e).
   - Supersede sets status and records the edge (test 5).
   - Readable list with date, owner, status, Assumptions (e2e screenshot).
   - Unit tests cover Source rule, subtype rule, supersede, ownership.
   - Visual proof committed.

## 5. Out of scope, called out

- Automatic breaking of Assumptions, `brokenByEventId` writes, `via: "system"` (#38).
- `leads_to` edges and any consequence UI (#38/#41); the table supports the kind but no UI creates them here.
- Passage FK on `decision_sources.passageId` (#42).
- Assistant tools for Decisions (#39/#40).
- Comments on Decisions (not requested; `COMMENTABLE_ENTITY_TYPES` unchanged).
