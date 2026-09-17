# Plan - #36 Record Decision and Assumption in the domain language

Branch `feat/36-decision-language`, worktree `/Users/qang/projects/CS3216-A3-wt/36-decision-language`.
Docs-only ticket: `CONTEXT.md` gains a "Decision Memory" section and `docs/adr/0008-decision-memory-graph.md` records the trade-offs.
No schema, migration or application code changes.
The ADR must settle the source model precisely enough that #37 (tables), #38 (detection walk), #41 (graph view) and #42 (passage citation) build on it without reshaping it.

## 1. Summary

Two new node types, **Decision** and **Assumption**, connected to each other and to existing entities by typed edges stored in Postgres.
Cause and Consequence are edge directions, not node types.
Every Decision and every edge cites at least one **Source**: a reference to an Evidence item, a Comment or an Activity Event, plus an optional passage locator.
The Assistant proposes; a human confirms; confirmed records are written through `mutate` like any other write.
History is the Activity Event stream; no valid-time columns.

Verified facts that shape the plan:

- `CONTEXT.md` entries are `**Term**:` + one-sentence definition + `_Avoid_:` list, grouped under `###` headings (Structure, People, History, Risk, Evidence, Discussion, Assistant).
- ADRs use `status: accepted` front matter and an `#` title stated as a decision.
  `0005`..`0007` add `## Considered options` with "rejected; reason" bullets and `## Consequences`; `0001`..`0004` are prose only.
  ADR 0008 follows the `0005`..`0007` shape because the issue requires rejected options to be recorded.
- `src/server/modules/dependencies/graph.ts` exports `wouldCreateCycle` and `downstreamOf` over `{ predecessorId, successorId }` edges, pure and I/O-free.
  The ADR names this as the traversal #38 reuses.
- `ENTITY_TYPES` in `src/shared/domain/index.ts` has no `activity_event` value, so a Source cannot reuse `entityTypeEnum` as-is.
  The ADR must say the Source kind is its own vocabulary (`evidence | comment | activity_event`), and that `decision` and `assumption` join `ENTITY_TYPES` in #37 so they can carry Activity Events.
- Evidence (`evidence/service.ts` `remove`) and Comments (`comments/service.ts` `remove`) are both deletable; ADR 0006 keeps a Comment body in history via a snapshot.
  A Source pointing at a deleted item must still render, so the ADR makes `entityId` an unenforced polymorphic key (same pattern as `activity_events.entityId` and `evidence_links.entityId`) and requires a snapshot excerpt and label at cite time.
- `tasks` has `startDate` and `dueDate`; `milestones` has `dueDate` only.
  A date Assumption therefore needs a field locator and the assumed date itself, or #38 cannot decide when it breaks.
- `dependencies` and `downstreamOf` know only `task | milestone` endpoints, so a Risk reached by an edge is a terminal consequence in any walk.
- `evidence.extractedText` is the reserved column for extracted text (AGENTS.md).
  #42 stores ordered passages; the ADR reserves the locator shape (`passageId` nullable, `ON DELETE SET NULL`) so a missing passage degrades to the whole document.

## 2. Changes, grouped into commit points

Each commit leaves `npm run format:check` and `npm run lint` green (no TypeScript touched, `typecheck` is trivially green).

### Commit 1 - `docs(context): define Decision, Assumption and Source`

**`CONTEXT.md` - new `### Decision Memory` section, inserted after `### Evidence` and before `### Discussion`.**

Entries, each in the existing style:

- **Decision**: A recorded choice made on a Project at a point in time: what was chosen, what was rejected and why, and the context at the time.
  Fields named in domain language: title, date, owner (a Person), status (active, superseded, revisited), context, chosen, alternatives, revisit-when.
  Rests on zero or more Assumptions, cites at least one Source, may supersede an earlier Decision.
  _Avoid_: Choice, ADR, resolution, verdict, issue.
- **Assumption**: A condition a Decision rests on, which the Project can later contradict.
  Subtypes name what can invalidate it: date (a Milestone or Task date), person (a Person staying on the Project), dependency (an existing Dependency), external-rule (a condition outside the Project, stated in words).
  States: holding, broken, retired.
  _Avoid_: Premise, precondition, constraint, hypothesis, risk (a Risk is a possibility of harm; an Assumption is a belief a Decision depends on).
- **Source**: A citation from a Decision or an edge to something already in the Project history: an Evidence item, a Comment or an Activity Event, optionally narrowed to one passage of the Evidence.
  _Avoid_: Reference, link (see Dependency and Evidence link), attachment, footnote.
- **Cause**, **Consequence**: The two directions of an edge between a Decision, an Assumption and the items they touch; what led to a record sits on its cause side, what follows from it on its consequence side.
  Not node types.
  _Avoid_: Reason, effect, outcome, impact node.

Rules such as "a record with no Source is not accepted", "external-rule Assumptions break only by hand" and "only holding Assumptions take part in detection" belong to ADR 0008, not the glossary.

### Commit 2 - `docs(adr): 0008 decision memory as two node types with typed edges in Postgres`

**`docs/adr/0008-decision-memory-graph.md` - new file.** Sections and the calls each records:

1. Title: "Decision memory is two node types plus typed, sourced edges stored in Postgres".
2. Body paragraphs:
   - **Node vocabulary**: Decision and Assumption only.
     Task, Milestone, Risk, Evidence, Person, Dependency, Activity Event are reached by edges.
     Reason: extraction accuracy falls as the type count grows, and the proposal pass (#39) must pick from a short list.
     Cause/Consequence are edge directions; Issue is on the avoid-list already.
   - **Edge model**: one `decision_edges`-style table, direction always cause to consequence, with a `kind` from a fixed vocabulary:
     `supports` (Assumption to Decision), `leads_to` (Decision to Task | Milestone | Risk), `superseded_by` (older Decision to newer Decision).
     The Assumption's own pointer (the Milestone, Task, Person or Dependency named by its subtype) is a column set on the Assumption row, not an edge, because it is 1:1, drives deterministic detection in #38, and has no independent source: `targetType`, `targetId`, and for the date subtype `targetField` (`startDate | dueDate`, matching Activity Event `field` values) plus `assumedUntil` (the date the Assumption holds until; the Assumption breaks when the target date moves past it).
     `leads_to` may target a Risk, but `dependencies` only connects Tasks and Milestones, so a Risk is a terminal consequence: #38 lists it as an affected item but does not walk past it, and #41 renders it as a leaf.
     Edge direction is what #41 renders left-to-right and what #38 walks from Assumption to Decision to downstream items, continuing into `dependencies` via `downstreamOf`.
     Rules the service enforces: external-rule Assumptions are broken only by hand; only holding Assumptions take part in detection.
   - **Storage**: Postgres tables in `src/server/modules/decisions/schema.ts`, alongside the rest of the domain.
     Walks reuse `src/server/modules/dependencies/graph.ts` (`downstreamOf`, `wouldCreateCycle`) by mapping edges to `{ predecessorId, successorId }`; #38 adds a depth bound.
   - **Source model** (settles the #42 question): a Source is `{ kind: evidence | comment | activity_event, entityId, passageId?: string | null, excerpt: string, label: string }`.
     `kind` is a new vocabulary, not `ENTITY_TYPES`, because Activity Events are not an entity type.
     `entityId` is an unenforced polymorphic key, the same pattern as `activity_events.entityId` and `evidence_links.entityId`, because Evidence and Comments are deletable and a citation must outlive what it cites.
     `passageId` is valid only when `kind = evidence`; it references the Evidence passage row that #42 introduces, nullable with `ON DELETE SET NULL`, so a re-extracted or deleted passage degrades to the whole Evidence item.
     `excerpt` and `label` are snapshots taken at cite time and are the durable display (ADR 0006 pattern); the live item is linked while it exists.
     Sources live in one `decision_sources` table with a nullable `decisionId` and a nullable `edgeId`, a `CHECK (num_nonnulls(decision_id, edge_id) = 1)` constraint and an index on each, so Decisions and edges share the rule "at least one Source".
     That rule is enforced in the service, not the database, because Postgres cannot express "at least one child row" declaratively.
   - **Proposal versus record**: the Assistant writes proposals to its own table (#39); nothing enters `decisions` until a human accepts, and the accepting write goes through `decisionsService` under `via: "assistant"` (ADR 0007).
   - **History**: Activity Events on `decision` and `assumption` entity types (added to `ENTITY_TYPES` in #37).
     No `valid_from`/`valid_to` columns; the time-slider view is out of scope.
     Status transitions (active to superseded, holding to broken) are ordinary `updated` events with `field: "status"`, so the attention rule in #38 and the answer in #40 read them from the feed.
3. `## Considered options`:
   - Separate graph store (Neo4j, or a pgvector/graph extension): rejected; second datastore, no transactional Activity Events, ownership check duplicated, walks are three steps deep and tiny.
   - Wider node vocabulary (Cause, Consequence, Issue, Constraint, Goal as nodes): rejected; extraction accuracy and UI count grow with type count; Cause/Consequence are directions; Issue is on the avoid-list.
   - Sources as a plain `jsonb` array column on `decisions`: rejected; cannot FK to a passage, cannot index by cited Evidence for the #40 "nearest Evidence" fallback, cannot share with edges.
   - Source as `{ entityType, entityId }` only (no passage): rejected; #42 would have to reshape every existing Source; nullable locator costs one column now.
   - Valid-time columns on nodes and edges: rejected; duplicates the Activity Event stream and buys only a time slider that is out of scope.
   - Assistant writes Decisions directly with a `confirmed` flag: rejected; unconfirmed rows would be visible to walks and answers unless every read filters them; a separate proposals table cannot leak.
4. `## Consequences`: list what #37, #38, #39, #40, #41 and #42 inherit (table names, edge kinds, source shape, entity types, walk helper, `via` attribution, service-enforced source rule).

### Commit 3 - `docs: implementation notes for #36`

`docs/artifacts/36-decision-language/implementation-notes.md`: commit table, deviations from this plan, verification output.

## 3. How to test and verify

There is no runtime behaviour to test.
Verification is documentary and mechanical:

1. `npm run format:check` - Prettier accepts both Markdown files (the CI gate).
2. `npm run lint` and `npm run typecheck` - unchanged code, must stay green (CI runs them on every PR).
3. `git diff --stat origin/main` - only `CONTEXT.md`, `docs/adr/0008-*.md` and `docs/artifacts/36-decision-language/*` change; no `src/`, `drizzle/` or `package.json` lines.
4. Acceptance checklist walk, item by item against the issue:
   - `CONTEXT.md` defines Decision and Assumption with avoid-lists in the existing style.
   - Decision entry names title, date, owner, status (active, superseded, revisited), context, chosen, alternatives, revisit-when.
   - Assumption entry names subtypes (date, person, dependency, external-rule) and states (holding, broken, retired).
   - ADR 0008 exists, follows the 0001..0007 format, records the five listed decisions.
   - ADR states what was rejected and why, including the separate graph store and the wider node vocabulary.
   - No schema or application code changes.
   - ADR settles the Source shape (entity reference plus optional passage locator) for #42.
5. Grep sanity: `rg -n $'\u2014' CONTEXT.md docs/adr/0008-decision-memory-graph.md` returns nothing (AGENTS.md forbids em dashes).
6. Each complete sentence in the new ADR sits on its own physical line (AGENTS.md rule for new long Markdown).
7. `rg -n 'status: accepted' docs/adr/0008-decision-memory-graph.md` matches line 2, inside `---` front matter.
8. `rg -n '^### ' CONTEXT.md` shows `### Decision Memory` between `### Evidence` and `### Discussion`.

## 4. Out of scope, called out so reviewers do not ask

- Adding `decision` / `assumption` to `ENTITY_TYPES` or `entityTypeEnum` (#37, needs an enum migration).
- Any Drizzle schema, migration, service, action or UI.
- The `transcript` Evidence kind and passage table (#42).
- Naming the attention rule for broken Assumptions (#38).
