# Plan - #41 Node-centered graph view

Branch `feat/41-graph-view`, worktree `/Users/qang/projects/CS3216-A3-wt/41-graph-view`, base `origin/main` at `9ddb67a` (#40 merged).
Builds on ADR 0008 (typed edges, Cause and Consequence as directions), the `decisions` module (#37), `impactWalk` (#38) and the citation links from #40.
New read-only module `src/server/modules/graph/`, one new route, one new feature view, two entry links.
No migration, no new write path.

## 1. Summary

A "show me why" page centred on one node: a Decision, an Assumption, a Milestone or a Risk.
Causes (what led to the node) render on the left, consequences (what follows from it) on the right, each side bounded at three steps.
"Centre here" on any Decision, Assumption, Milestone or Risk node re-centres the page on it (plain navigation with `?node=<type>:<id>`, no client graph state).
Where a broken Assumption reaches the selected node, every node and edge on that path is visually distinguished.
Every node links to the record it represents; every edge shows the Sources that justify it or says that none is recorded.
Entry points are the impact alert ("Show me why") and the Decision list and dialog ("Show why"); the page is not in the Project navigation.
No whole-project view, no time slider, no graph library: plain flex and grid columns with the existing tokens.

Verified facts that shape the plan:

- `decision_edges` (`src/server/modules/decisions/schema.ts`) is "always cause to consequence": `supports` Assumption -> Decision, `leads_to` Decision -> Task | Milestone | Risk, `superseded_by` older Decision -> newer Decision.
  Endpoints are polymorphic (`fromType`, `toType` from `entityTypeEnum`); the service enforces integrity, so a dangling edge (target deleted) is possible and the view must skip it.
- An Assumption's watched target is a column set (`targetType`, `targetId`), not an edge (ADR 0008).
  `impactWalk` treats the watched Task or Milestone, and the successor of a watched Dependency, as affected items; the graph renders the same relation as a derived `watches` edge from the Assumption to that item so the alert and the graph agree.
  Person targets are not nodes (the issue lists Decision, Assumption, Milestone, Risk) and are shown as a caption on the Assumption node instead.
- `dependencies` rows carry `predecessorType`, `predecessorId`, `successorType`, `successorId` (Tasks and Milestones only); the graph renders them as `depends_on` edges predecessor -> successor, so Risks are leaves (ADR 0008 line 24).
- Sources sit on Decisions (`decisionId`) or on edges (`edgeId`, copied on attach, supersede and `leads_to`, `sourcesRepo.listForEdges`).
  `watches` and `depends_on` edges have no Source row; the view says "No source recorded".
- `sourceHref` in `src/server/modules/decisions/answers.ts` (#40) already resolves where a Source opens (Evidence page, parent item History tab, Overview feed) given Comment and Activity Event lookups; the graph reuses it.
- `ImpactAlerts` (`src/widgets/attention/impact-alerts.tsx`) is a server component with a `Panel` per alert and a client `DismissAlertButton`; the e2e `impact` flow dismisses its alert at the end, so a later flow cannot rely on that alert being visible.
- The Decisions row `onClick` opens the dialog via `router.replace(?decision=)`; a nested `Link` needs `onClick={(e) => e.stopPropagation()}`.
- `DecisionDialog` title is `D-${number}`; the e2e already addresses it with `getByRole("dialog", { name: "D-1" })`.
- `ProjectHeader` marks a tab active with `pathname.startsWith(href)`; `/graph` matches no tab, which is the intended "supports those surfaces" behaviour.
- `docs/flows.md` has one row per e2e flow; `decisions`, `impact`, `proposals` run last in that order; a new flow goes after `proposals`.
- Lint forbids synchronous `setState` in effects and ref reads during render; the view has no client state, so this does not apply.

## 2. Domain and design decisions

- **Node** `{ type: "decision" | "assumption" | "task" | "milestone" | "risk", id }`, rendered with label, code (`D-n`, `KEY-n`, `R-n`, none for Assumption and Milestone), status (Decision status badge, Assumption state chip), and `href` to its record: `decisionHref`, `/tasks?task=`, `/timeline?milestone=`, `/risks?risk=`; an Assumption opens the first Decision it supports (`decisionHref`), or the Decisions page when it supports none.
  Tasks appear as nodes because `leads_to` and `depends_on` reach them, but the issue limits the centre to Decision, Assumption, Milestone and Risk: `CENTRE_TYPES = ["decision", "assumption", "milestone", "risk"]` in `graph/validation.ts`, `graphNodeSchema` accepts only those, and a Task card links to its record (`taskHref`) instead of re-centring.
  Cards of the four centre types carry a "Centre here" link (`graphHref`) beside the "Open" link to the record, so re-centring and opening are two distinct, labelled actions.
- **Edge kinds** for display: `GraphEdgeKind = DecisionEdgeKind | "watches" | "depends_on"` in `src/server/modules/graph/neighbourhood.ts` (display vocabulary of the read model, not a stored enum, so no `shared/domain` change and no migration).
  Labels: "supports", "leads to", "superseded by", "watches", "depends on".
- **Neighbourhood** (pure `neighbourhood.ts`, `neighbourhood({ centre, edges, assumptions, dependencies, maxDepth = 3 })`):
  build one adjacency list from the three edge sets, then two bounded BFS walks from the centre: backwards over incoming edges for causes, forwards over outgoing edges for consequences.
  Each visited node gets `depth` (1..3, hops from the centre) and `side` (`cause` | `consequence`); the centre is `depth 0`.
  `visited` per side keyed by `type:id`, so cycles terminate and a node reached twice keeps its first (shortest) depth.
  Edges returned are only those between two visited nodes; the same node may appear on both sides (for example a Decision that both supersedes and is superseded in a chain), which is correct: it is a cause by one path and a consequence by another.
  Returns `{ nodes: GraphNode[], edges: GraphEdge[] }` with `GraphEdge = { key, kind, from, to, edgeId | dependencyId | null, highlighted }`.
- **Broken path highlight**: on the cause side only ("where a broken Assumption reaches the selected node").
  Every cause node reaches the centre by construction of the backward walk, so a node is `onBrokenPath` if it is a broken Assumption or has an incoming cause-side edge from an `onBrokenPath` node; computed as a fixpoint over the cause subgraph (at most `maxDepth` passes, cycle-safe because the node set is fixed).
  An edge is `highlighted` when its `from` node is `onBrokenPath` and its `to` node is on the cause side or is the centre.
  A broken Assumption on the consequence side (for example reached through `superseded_by` then `supports` backwards is impossible; forward only reaches items) is not highlighted; only `state === "broken"` counts, dismissed or not, because dismissing never un-breaks (#38).
- **Sources per edge**: `supports`, `leads_to`, `superseded_by` edges show their `decision_sources` rows (`edgeId`) as chips linking through `sourceHref`; when an edge has no row the chip line reads "No source recorded".
  Edge Source rows have `decisionId = null`; `sourceHref` needs a fallback Decision for a deleted Comment, so the service passes the edge's Decision: `toId` for `supports`, `fromId` for `leads_to` and `superseded_by`.
  `sourceHref` also needs Comment and Activity Event lookups (`HrefLookups`), which the service loads with `commentsRepo.findByIds` and `activityRepo.findByIds` over the edge Sources' `entityId`s, exactly as `decisionsService.search` does.
  `watches` and `depends_on` always read "No source recorded" with a caption naming the relation ("watched by the assumption", "project dependency").
- **Layout**: three columns `grid-cols-[1fr_minmax(16rem,1.2fr)_1fr]` inside the page body: Causes, Selected, Consequences.
  Each side column lists its nodes ordered by depth then label; each card shows the node, a "N steps away" caption when `depth > 1`, and under it one line per edge that connects it towards the centre side (kind label, the neighbour it connects to, Sources).
  Empty side renders a quiet `text-ink-tertiary` line ("Nothing recorded leads here" / "Nothing recorded follows") inside the column, so the grid keeps three columns and never collapses.
  Highlighted cards use `border-l-2 border-l-tag-red`; highlighted edge lines use `text-tag-red`; the broken Assumption keeps the red `AssumptionChip` state.
  Tokens only (`bg-surface-1`, `text-ink-*`, `border-hairline`, `text-tag-red`, `Panel`), no hex.
- **Route** `src/app/(app)/projects/[projectId]/graph/page.tsx`: `PageProps<"/projects/[projectId]/graph">`, `const { projectId } = await params; const { node } = await searchParams;` (both are Promises in this Next.js version, see `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`); parse `<type>:<id>` with a zod schema (`z.enum(node types)` and a non-empty id); invalid or unknown node -> `notFound()`.
  Page header: title "Why", subtitle "What led to this and what follows from it, three steps each way", a "Back to Decisions" link.
- **Entry points**: `ImpactAlerts` gets a "Show me why" link per alert (`/graph?node=assumption:<id>`) in the header row before Dismiss; the Decisions table gets a small "Show why" icon link in the ID cell (`onClick={(e) => e.stopPropagation()}`, `aria-label="Show why D-n"`); `DecisionDialog` (whose `Dialog` takes a plain `title` string) gets a one-line `div` at the top of the dialog body, above `ItemDialogTabs`, with a "Show why" link, rendered only when `item` is set (edit mode).
  Node cards on the graph page use `Link`s with no client `onClick`, so re-centring is plain navigation and nothing competes with the link; Task cards have only the "Open" link.
  The e2e flow re-centres on an Assumption and on Decisions only and never asserts a `task:` URL.
- **Authorization**: `graphService.neighbourhood` starts with `assertOwnsProject`; the centre must belong to the Project (looked up in the loaded rows) or the service throws `NotFoundError`.

## 3. Changes, grouped into commit points

Each commit leaves `npm run typecheck`, `npm run lint` and `npm run format:check` green; tests first inside each commit.

### Commit 1 - `feat(graph): pure neighbourhood walk with broken-path highlight`

- `src/server/modules/graph/neighbourhood.ts`: types `GraphNodeRef`, `GraphNode`, `GraphEdge`, `GraphEdgeKind`; `neighbourhood()` as in section 2; `GRAPH_MAX_DEPTH = 3`.
- `src/server/modules/graph/neighbourhood.test.ts` (pure, no DB): centre on a Decision shows its Assumptions as causes and `leads_to` items plus the superseding Decision as consequences; centre on an Assumption shows nothing on the cause side and Decision, `leads_to` items, watched item and Dependency successors on the consequence side; depth bound at 3 over a Dependency chain of 5; a Dependency cycle terminates; a Risk is a leaf; broken Assumption two steps back highlights both edges and the intermediate Decision, a holding one highlights nothing; a dangling edge to an unknown node is dropped; the same node on both sides is allowed.

### Commit 2 - `feat(graph): neighbourhood read model with labels, hrefs and edge Sources`

- `src/server/modules/graph/service.ts`: `graphService.neighbourhood(ctx, { projectId, centre })` -> `{ centre: DescribedNode, nodes: DescribedNode[], edges: DescribedEdge[] }`.
  Loads edges, assumptions, decisions (with owner), tasks, milestones, risks, dependencies through the module repositories; runs `neighbourhood`; describes nodes (label, code, status, href, `assumption.state`, `assumption.subtype`, `assumption.targetLabel` for person targets); loads `sourcesRepo.listForEdges` for the decision edges present, then `commentsRepo.findByIds` and `activityRepo.findByIds` for those Sources, and resolves each Source's href with `sourceHref(projectId, edgeDecisionId, source, lookups)` where `edgeDecisionId` is `toId` for `supports` and `fromId` otherwise.
  Throws `NotFoundError` when the centre is not in the Project.
- `src/server/modules/graph/validation.ts`: `CENTRE_TYPES`, `graphNodeSchema` (`type` in `CENTRE_TYPES`, non-empty `id`) and `parseNodeParam("<type>:<id>")` (returns `null` for `task:` or malformed input).
- `src/server/modules/graph/service.test.ts` (DB): builds a Project with a Decision, a broken date Assumption on a Milestone, a `leads_to` Task, a Dependency Task -> Task; asserts labels, hrefs, edge Sources with hrefs, the highlighted path, and that a stranger gets `ForbiddenError` and an unknown centre `NotFoundError`.
- `src/shared/lib/hrefs.ts`: add `taskHref`, `milestoneHref`, `riskHref`, `graphHref(projectId, type, id)`; `answers.ts` `ITEM_PATH` and `impact/service.ts` keep their own strings (they add `&tab=history` or are pre-existing) - no behaviour change there.

### Commit 3 - `feat(graph): node-centred page with causes and consequences columns`

- `src/features/graph/graph-view.tsx` (server component): the three-column layout from section 2, `NodeCard`, `EdgeLine`, `SourceChips`; `data-testid="graph-causes"`, `graph-centre`, `graph-consequences`, `data-highlighted="true"` on highlighted cards and edge lines.
- `src/entities/decision/node-icon.ts` or reuse `CONSEQUENCE_ICON` + `ASSUMPTION_ICON` + `GitBranch` for Decisions (prefer reuse; add only the Decision icon mapping).
- `src/app/(app)/projects/[projectId]/graph/page.tsx`: parse `?node`, call the service, render `PageHeader` + `GraphView`; `metadata.title = "Why"`.
- `src/features/graph/graph-view.test.tsx` if the repo has a component test setup; otherwise the pure and DB tests plus e2e cover it (check `vitest.config` for a DOM environment first; do not add one for this ticket).

### Commit 4 - `feat(graph): entry links from the impact alert, the Decision list and the Decision dialog`

- `impact-alerts.tsx`: "Show me why" link (`graphHref(projectId, "assumption", id)`) in the alert header row before Dismiss.
- `decisions-view.tsx`: icon link in the ID cell with `aria-label="Show why D-n"`, `stopPropagation`.
- `decision-dialog.tsx`: "Show why" link in a `div` above `ItemDialogTabs`, edit mode only.
- `attention` rule `assumption_broken` href stays `/projects/{id}#impact` (the alert is the entry, not the graph).

### Commit 5 - `test(e2e): graph flow, docs row, screenshots`

- `e2e/flows.spec.ts`: `graph` describe after `proposals`:
  1. Decisions, tick "Show superseded", open D-1, click "Show why": URL `/graph?node=decision:<id>`; centre shows "D-1 Switch from surveys to interviews"; causes column shows "Merchant dataset arrives before UAT" with `data-highlighted="true"` (broken by the `impact` flow, dismissed but still broken); consequences show "Load-test the new gateway" (`leads_to`) and "D-2" (`superseded_by`); screenshot `01-centred-on-decision`.
  2. Click the Assumption card: URL `node=assumption:`; causes column reads "Nothing recorded leads here"; consequences list D-1 (1 step), "UAT begins" (watches), "Load-test the new gateway" (2 steps), D-2 (2 steps); screenshot `02-recentred-on-assumption`.
  3. Alert entry: open D-2, "New assumption" with subtype `external_rule` and statement "Vendor contract renews in Q4", "Mark broken"; Overview shows the alert; click "Show me why"; URL `node=assumption:<new id>`; centre card shows the statement with the Broken chip; consequences show D-2; screenshot `03-opened-from-alert`.
  4. Click D-2 in the consequences column: centre is D-2; causes show the new Assumption highlighted and D-1 (via `superseded_by`); screenshot `04-broken-path-highlight`.
- `docs/flows.md` row `graph`; screenshots to `docs/graph/screenshots/` (the `shots` helper clears only the current flow's directory); check `git status` after the run and revert any other screenshot directory that changed.

### Commit 6 - `docs: implementation notes for #41`

## 4. How to test and verify

1. `npm ci` in the worktree, `cp` the `.env`, `BETTER_AUTH_URL=http://localhost:3141`, `PROPOSALS_EXTRACTOR=heuristic`.
2. Red/green: `npx vitest run src/server/modules/graph` fails before the module exists.
3. `npm test` at the end; `npm run typecheck`, `npm run lint`, `npm run format:check` after each commit.
4. `npx next dev -p 3141`; `E2E_PORT=3141 E2E_NO_SERVER=1 npx playwright test e2e/flows.spec.ts` - 20 flows pass.
5. Visual proof: the four screenshots above, opened from an alert in `03`.

## 5. Out of scope

- Time slider, whole-project view, graph library, drag or zoom.
- Person or Dependency as nodes; Evidence as a node (Sources stay edge annotations).
- Editing edges from the graph page.
- Changing `impactWalk` or the alert model.
- A Project navigation tab for the graph.
