---
status: accepted
---

# Decision memory is two node types plus typed, sourced edges stored in Postgres

The decision-memory layer records why a Project is the way it is: which choices were made, what they rested on, and what they led to.
It adds exactly two node types, **Decision** and **Assumption** (CONTEXT.md, "Decision Memory").
Everything a Decision affects (Task, Milestone, Risk, another Decision) is reached by a typed edge into an entity that already exists.
What it rests on is an Assumption, what it cites is a Source (Evidence, Comment, Activity Event), its owner is a Person column, and what an Assumption watches (a Task or Milestone date, a Person, a Dependency) is a target column on the Assumption.
Cause and Consequence are the two directions of an edge, not node types, and Issue stays on the avoid-list.
The vocabulary is kept this small on purpose: the Assistant's proposal pass has to pick a type for every record it extracts, and extraction accuracy falls as the type count grows.
Two node types also keep the UI count low; each type needs a form, a list and a history renderer.

## Edges

Edges live in one table in `src/server/modules/decisions/schema.ts`, direction always cause to consequence, with a `kind` from a fixed vocabulary:

- `supports`: Assumption to Decision.
- `leads_to`: Decision to Task, Milestone or Risk.
- `superseded_by`: older Decision to newer Decision; the older one's status becomes `superseded`.

The direction is what the node-centred graph view renders left to right, and what impact detection walks: from a broken Assumption along `supports` to its Decisions, along `leads_to` to items, then on through `dependencies` with the existing `downstreamOf` helper in `src/server/modules/dependencies/graph.ts`, mapping each edge to `{ predecessorId, successorId }`.
`dependencies` connects only Tasks and Milestones, so a Risk reached by `leads_to` is a terminal consequence: it is listed as affected but never walked past, and the graph view renders it as a leaf.
`downstreamOf` terminates on cycles but has no depth parameter, so the caller adds the depth guard; `wouldCreateCycle` guards `superseded_by` on insert so a Decision cannot supersede its own ancestor.

The Assumption's own pointer (the Milestone, Task, Person or Dependency named by its subtype) is a column set on the Assumption row, not an edge.
It is one-to-one, drives deterministic detection, and has no independent source of its own.
The columns are `targetType`, `targetId`, and for the date subtype `targetField` (`startDate | dueDate`, matching the Activity Event `field` values that detection listens for) plus `assumedUntil`, the date the Assumption holds until.
A date Assumption breaks when the target date moves past `assumedUntil`; a person Assumption when the Person is removed; a dependency Assumption when the Dependency becomes blocking.
External-rule Assumptions are broken only by hand.
Only holding Assumptions take part in detection; broken and retired ones are ignored.

## Sources

Every Decision and every edge cites at least one Source, and a record with no Source is not accepted.
A Source is:

```
{ kind: "evidence" | "comment" | "activity_event", entityId, passageId?: string | null, excerpt, label }
```

- `kind` is its own vocabulary, not `ENTITY_TYPES`, because an Activity Event is not an entity type.
- `entityId` is an unenforced polymorphic key, the same pattern as `activity_events.entityId` and `evidence_links.entityId`.
  Evidence and Comments are deletable, and a citation must outlive what it cites.
- `passageId` is valid only when `kind` is `evidence`.
  It references the Evidence passage row that transcript ingestion introduces, nullable with `ON DELETE SET NULL`, so a re-extracted or deleted passage degrades to the whole Evidence item instead of erroring.
  Settling this now means the source shape never has to be reshaped when passage-level citation arrives.
- `excerpt` and `label` are snapshots taken at cite time and are the durable display (the ADR 0006 pattern); the live item is linked while it exists.

Sources live in one `decision_sources` table with a nullable `decisionId` and a nullable `edgeId`, a `CHECK (num_nonnulls(decision_id, edge_id) = 1)` constraint and an index on each, so Decisions and edges share the same rule and the same renderer.
"At least one Source" is enforced in the service, not the database, because Postgres cannot express "at least one child row" declaratively.

## Proposal versus record

The Assistant proposes; a human confirms.
Proposals are written to the Assistant's own table, never to `decisions`.
Accepting a proposal writes through `decisionsService` under `via: "assistant"` (ADR 0007), so the resulting Activity Event shows the attribution and the record is as auditable and reversible as a hand-typed one.
Walks and answers read only confirmed records, and a proposal cannot leak into them because it is not in the same table.

## History

History comes from Activity Events.
`decision` and `assumption` join `ENTITY_TYPES` so every create, update and delete goes through `mutate` and is recorded like any other write.
Decision status transitions (active to superseded, active to revisited) are ordinary `updated` events with `field: "status"`.
Assumption state transitions (holding to broken, holding to retired) are ordinary `updated` events with `field: "state"`.
The attention surface and the "why did we" answer read both from the feed.
Breaking an Assumption automatically is a service write like any other: the detector runs `mutate` under a `Ctx` for the Project owner with `via: "system"` (a new `VIA_ACTORS` value, enum migration in the detection ticket), sets `state` to `broken` and `brokenByEventId` to the id of the triggering Activity Event, and both field changes land in the same `updated` events.
Sources are never attached to an Assumption state change; the triggering event is reachable through `brokenByEventId`.
There are no `valid_from` / `valid_to` columns on nodes or edges; a time-slider view is explicitly out of scope.

## Considered options

- Separate graph store (Neo4j, or a graph extension beside Postgres): rejected; a second datastore with no transactional Activity Events, a duplicated ownership check, and a second backup and deploy story, to serve walks that are three steps deep over a few hundred rows.
- Wider node vocabulary (Cause, Consequence, Issue, Constraint, Goal as nodes): rejected; extraction accuracy and UI surface grow with the type count, Cause and Consequence are directions, and Issue is already on the avoid-list.
- Sources as a `jsonb` array column on `decisions`: rejected; cannot foreign-key a passage, cannot be indexed by cited Evidence for the "nearest Evidence" fallback, and cannot be shared with edges.
- Source as `{ entityType, entityId }` with no passage locator: rejected; passage-level citation would have to reshape every existing Source, while a nullable locator costs one column now.
- Valid-time columns on nodes and edges: rejected; duplicates the Activity Event stream and buys only a time slider that is out of scope.
- Assistant writes Decisions directly with a `confirmed` flag: rejected; unconfirmed rows would be visible to walks and answers unless every read remembered to filter them, and a separate proposals table cannot leak.
- Assumption target as an edge: rejected; the pointer is one-to-one, has no source of its own, and detection needs it as indexed columns, not a graph hop.

## Consequences

- `assumptions` carries `state`, `subtype`, `targetType`, `targetId`, `targetField`, `assumedUntil` and `brokenByEventId`.
- Tables: `decisions`, `assumptions`, `decision_edges` (kinds `supports`, `leads_to`, `superseded_by`), `decision_sources`; all project-scoped, all written through `decisionsService` behind `assertOwnsProject`.
- `ENTITY_TYPES` gains `decision` and `assumption` and `VIA_ACTORS` gains `system` (Drizzle enum migrations); `DECISION_STATUSES`, `ASSUMPTION_SUBTYPES`, `ASSUMPTION_STATES`, `DECISION_EDGE_KINDS` and `SOURCE_KINDS` are fixed vocabularies in `src/shared/domain/index.ts`.
- Impact detection is an `eventBus` subscriber that reads Assumption target columns and reuses `downstreamOf`; it never writes outside the service layer.
- The Assistant's proposal pass owns its own table, keeps rejected proposals so they are not raised again, and records acceptance rate per Project.
- Transcript ingestion adds the passage table that `passageId` points at; nothing about `decision_sources` changes when it lands.
- Any rendering of a Source uses `label` and `excerpt` and treats the live link as optional.
