# Plan — #7 Unified Attention read model (branch `feat/7-attention`)

## 1. Summary

Add one deterministic, pure evaluator (`evaluateAttention`) in the workspace module that turns already-fetched
Task/Milestone/Risk/Dependency rows of a single Project into six fixed rule groups. Expose it as
`projectAttention(ctx, projectId)` for the Project Overview and reuse it per Project inside `workspaceOverview`
for the Dashboard. Fix the rule ids (`ATTENTION_RULES`) and the risk threshold (`RISK_TOP_SEVERITY`) in the shared
domain vocabulary. Render with an entities-layer `AttentionBadge` and a widgets-layer `AttentionList`
(native `<details>` sections — no client JS), remove the inline overdue/blocked derivation from both pages, and
make every stat tile read from `counts`. Cover with a pure Vitest unit test, a DB-backed read-model test
(`db_test`), and a Playwright `attention` flow. No schema change, no new module.

Repo facts the plan relies on (verified):

- Dashboard read model: `src/server/modules/workspace/queries.ts` (14-day `horizon`, top-6 risks, inline rules).
- Dashboard page `src/app/(app)/page.tsx` lines 19 and 45-48 (inline attention + "Due in 14 days" tile).
- Overview page `src/app/(app)/projects/[projectId]/page.tsx` lines 35-39 (inline `overdue`/`blocked`/`openRisks`),
  71-74 (stat tiles), 121-157 ("Needs attention" panel).
- Dialog deep-links already handled: `?task=` in `src/features/task/tasks-view.tsx:27` and
  `src/widgets/timeline/project-timeline.tsx:30`; `?milestone=` in `project-timeline.tsx:31`; `?risk=` in
  `src/features/risk/risks-view.tsx:22`. **Nothing to add** — items link to
  `/projects/{id}/tasks?task=…`, `/projects/{id}/timeline?milestone=…`, `/projects/{id}/risks?risk=…`.
- Repos: `tasksRepo.listOpenByProjects` (already excludes `TERMINAL_CATEGORIES`), `milestonesRepo.listByProjects`,
  `risksRepo.listByProjects`; `dependenciesRepo` only has `listByProject` → needs `listByProjects`.
- Tokens (`src/app/globals.css`): `text-tag-red|orange|yellow|green|blue|purple|gray`, `bg-surface-1..4`,
  `text-ink|ink-muted|ink-subtle|ink-tertiary`, `border-hairline`, `panel`, `text-caption|body-sm|eyebrow`.
- `#4` appends to `ENTITY_TYPES` in `src/shared/domain/index.ts` — our block goes at the **end of the file**, after
  `labelFor`, under its own comment header, so both diffs merge cleanly.

## 2. Changes, grouped into commit points (TDD: test file first in each commit)

### Commit 1 — `feat(domain): attention rule vocabulary + pure evaluator`

**`src/shared/domain/index.ts`** — two additions.

Next to `riskSeverity` (after line 58):

```ts
/** Top severity band = the maximum the 1..3 x 1..3 scale allows (High x High = 9). */
export const RISK_TOP_SEVERITY = RISK_SEVERITY_SCORE.high * RISK_SEVERITY_SCORE.high;
```

Appended at the very end of the file (separate block, eases merge with #4):

```ts
// ---------------------------------------------------------------------------
// Attention (issue #7). Order IS severity order; adding a rule is a vocabulary change.
// ---------------------------------------------------------------------------
export const ATTENTION_RULES = [
  "task_overdue",
  "dependency_late",
  "milestone_past_open",
  "task_blocked",
  "risk_top",
  "task_due_soon",
] as const;
export type AttentionRule = (typeof ATTENTION_RULES)[number];
/** `task_due_soon` window in calendar days, inclusive of today and today + N. */
export const ATTENTION_DUE_SOON_DAYS = 7;
```

**`src/server/modules/workspace/attention.test.ts`** (pure, no DB) — see §3.

**`src/server/modules/workspace/attention.ts`** — pure, no I/O, imports only `date-fns`, `@/shared/domain`,
`@/shared/lib/dates` (`fmtDate`). Exports:

```ts
export interface AttentionItem {
  rule: AttentionRule; // most severe matched rule (group it lives in)
  matched: AttentionRule[]; // every matched rule, severity order (matched[0] === rule)
  reasons: string[]; // one human sentence per matched rule, same order
  entityType: "task" | "milestone" | "risk";
  entityId: string;
  label: string; // Task title / Milestone name / Risk title
  code?: string; // "KEY-12" for Tasks, "R-3" for Risks (Dashboard shows this)
  href: string; // deep link that opens the dialog (see §1)
  date?: string; // yyyy-MM-dd the rule keyed on (due date / milestone date / dep anchor)
  urgency: number; // ascending = more urgent; used for cross-Project re-sort (see below)
  projectId: string;
}
export interface AttentionGroup {
  rule: AttentionRule;
  items: AttentionItem[];
}
export interface AttentionResult {
  groups: AttentionGroup[];
  counts: Record<AttentionRule, number>;
}

export interface AttentionInput {
  today: string; // yyyy-MM-dd, computed once per request by caller
  project: { id: string; key: string };
  tasks: Array<{
    task: { id; number; title; startDate: string | null; dueDate: string | null; milestoneId: string | null };
    status: { name: string; category: StatusCategory };
  }>;
  milestones: Array<{ milestone: { id; name; dueDate: string }; status: { category: StatusCategory } }>;
  risks: Array<{ risk: { id; number; title; probability: ScaleLevel; impact: ScaleLevel }; status: { category } }>;
  dependencies: Array<{
    predecessorType: DependencyItemType;
    predecessorId: string;
    successorType: DependencyItemType;
    successorId: string;
  }>;
}
export function evaluateAttention(input: AttentionInput): AttentionResult;
export const compareAttention = (a: AttentionItem, b: AttentionItem) =>
  ATTENTION_RULES.indexOf(a.rule) - ATTENTION_RULES.indexOf(b.rule) ||
  a.urgency - b.urgency ||
  (a.code ?? a.label).localeCompare(b.code ?? b.label);
```

Both `TaskListItem` (Overview) and `listOpenByProjects` rows (Dashboard) satisfy `tasks` structurally (verify field names against `dependencies/schema.ts` — the column names may be `fromType/fromId/toType/toId` or similar; adapt).
Algorithm (ISO `yyyy-MM-dd` strings compare lexicographically; `days(a,b) = differenceInCalendarDays(parseISO(a), parseISO(b))`):

1. `open = tasks.filter(t => !TERMINAL_CATEGORIES.has(t.status.category))` — evaluator filters itself so it
   is correct whether the caller passed all Tasks or only open ones. `openByMilestone = Map<milestoneId, n>`.
2. `horizon = formatISO(addDays(parseISO(today), ATTENTION_DUE_SOON_DAYS), { representation: "date" })`.
3. Matches are collected into `Map<"task:id"|"milestone:id"|"risk:id", { hits: Array<{rule, reason, urgency, date?}>, base }>`:
   - `task_overdue`: open Task, `dueDate && dueDate < today`. reason
     `` `Due ${fmtDate(due)}, ${n} day${n===1?"":"s"} ago` `` with `n = -days(due, today)`. urgency `= days(due, today)` (negative).
   - `task_due_soon`: open Task, `dueDate && today <= dueDate <= horizon`. reason `Due today` when equal, else
     `` `Due ${fmtDate(due)}, in ${n} day(s)` ``. urgency `= n`.
   - `task_blocked`: open Task, `status.category === "blocked"` (never `status.name`). reason
     `` `Blocked (${status.name})` ``. urgency `= dueDate ? days(due, today) : Number.MAX_SAFE_INTEGER`; ties by `code` via `compareAttention`.
   - `milestone_past_open`: Milestone with non-terminal category, `dueDate < today`, `openByMilestone.get(id) > 0`.
     reason `` `Milestone date ${fmtDate(due)} passed, ${k} open task(s)` ``. urgency `= days(due, today)`.
   - `risk_top`: Risk with non-terminal category and `riskSeverity(risk) >= RISK_TOP_SEVERITY`. reason
     `` `Severity ${sev} (${labelFor(probability)} / ${labelFor(impact)})` ``. urgency `= -sev`; ties by title (`label`).
   - `dependency_late`: for each edge with `successorType === "task"` whose successor is in `open`; upstream =
     `predecessorType === "task"` ? open Task (done upstream ⇒ not open ⇒ skipped) : Milestone with non-terminal
     category. Skip if upstream missing or `upstream.dueDate` null. `anchor = successor.startDate ?? successor.dueDate`;
     skip if null. Fire when `upstream.dueDate > anchor`. `slip = days(upstream.dueDate, anchor)`.
     reason `` `Depends on ${upLabel}, due ${fmtDate(upstream.dueDate)}, after ${successor.startDate ? "start" : "due"} ${fmtDate(anchor)}` ``
     where `upLabel = `${project.key}-${number}`` for Tasks and the Milestone name otherwise. urgency `= -slip`.
     Milestone→Milestone and Task→Milestone edges are skipped. Several upstreams for one Task ⇒ several reasons,
     urgency = min (largest slip).
4. Dedupe: each key becomes one item; `rule` = hit with lowest `ATTENTION_RULES` index; `matched`/`reasons` = hits sorted
   by rule index; `urgency`/`date` taken from the winning hit. `href`: task → `/projects/${id}/tasks?task=…`,
   milestone → `/projects/${id}/timeline?milestone=…`, risk → `/projects/${id}/risks?risk=…`.
5. Groups: one per rule in `ATTENTION_RULES` order, **empty groups omitted**; items sorted with
   `compareAttention` (implements: overdue/due-soon/milestone by date asc, dependency by slip desc, risk by
   severity desc then title, blocked by due date (null last) then key). `counts` has every rule as a key
   (0 when absent) so tiles can index it directly.

Verify: `npm run typecheck && npm run lint && npx vitest run src/server/modules/workspace/attention.test.ts`.

### Commit 2 — `feat(workspace): projectAttention read model`

- **`src/server/modules/dependencies/repository.ts`** add
  `listByProjects: (db, projectIds) => projectIds.length ? db.select().from(dependencies).where(inArray(dependencies.projectId, projectIds)) : Promise.resolve([])`.
- **`src/server/modules/workspace/queries.test.ts`** (DB-backed) — see §3; write first.
- **`src/server/modules/workspace/queries.ts`** add:

```ts
export async function projectAttention(ctx: Ctx, projectId: string, opts: { today?: string } = {}) {
  const project = await assertOwnsProject(ctx.db, ctx.userId, projectId); // first line, ADR 0002
  const [tasks, milestones, risks, dependencies] = await Promise.all([
    tasksRepo.listByProject(ctx.db, projectId),
    milestonesRepo.listByProject(ctx.db, projectId),
    risksRepo.listByProject(ctx.db, projectId),
    dependenciesRepo.listByProject(ctx.db, projectId),
  ]);
  return evaluateAttention({ today: opts.today ?? today(), project, tasks, milestones, risks, dependencies });
}
```

`today` is `today()` from `src/shared/lib/dates.ts` (server local calendar date). `opts.today` exists only so
tests are deterministic. Re-export `type { AttentionItem, AttentionGroup, AttentionResult }` from `./attention`.
(Check whether `assertOwnsProject` returns the project row; if not, fetch it with `projectsRepo.findById`.)

### Commit 3 — `feat(ui): AttentionBadge atom and AttentionList widget`

**`src/entities/attention/attention-badge.tsx`** (server-safe, no hooks):

```ts
export const ATTENTION_RULE_META: Record<AttentionRule, { label: string; plural: string; text: string; bg: string }> = {
  task_overdue: { label: "Overdue", plural: "overdue", text: "text-tag-red", bg: "bg-tag-red/10" },
  dependency_late: {
    label: "Late dependency",
    plural: "late dependencies",
    text: "text-tag-orange",
    bg: "bg-tag-orange/10",
  },
  milestone_past_open: {
    label: "Milestone passed",
    plural: "milestones passed",
    text: "text-tag-purple",
    bg: "bg-tag-purple/10",
  },
  task_blocked: { label: "Blocked", plural: "blocked", text: "text-tag-yellow", bg: "bg-tag-yellow/10" },
  risk_top: { label: "Top risk", plural: "top risks", text: "text-tag-orange", bg: "bg-tag-orange/10" },
  task_due_soon: { label: "Due soon", plural: "due soon", text: "text-tag-blue", bg: "bg-tag-blue/10" },
};
export function AttentionBadge({ rule, count, className }: { rule: AttentionRule; count?: number; className?: string });
```

Renders `<Badge className={cn(meta.bg, meta.text, className)}>{count !== undefined ? `${count} ${meta.plural}` : meta.label}</Badge>`
(uses `Badge` from `@/shared/ui/badge`, same pattern as `entities/project/health.tsx`). `count` form is the
Dashboard chip ("3 overdue"); label form is the group header / secondary tag on an item.

**`src/widgets/attention/attention-list.tsx`** (server component; collapsing via native `<details open>` so
counts stay visible in the `<summary>` when collapsed, no `"use client"`):

```ts
export function AttentionList(props:
  | { result: AttentionResult; showProject?: (projectId: string) => string | undefined; emptyText?: string }
  | { flat: true; items: AttentionItem[]; showProject?: ...; emptyText?: string })
```

- Empty (`groups.length === 0` / `items.length === 0`) → `<Panel><p className="px-4 py-6 text-center text-caption text-ink-subtle">{emptyText ?? "Nothing needs attention. Quiet is good news."}</p></Panel>`.
- Grouped: one `<Panel>` per group: `<details open>` → `<summary className="flex cursor-pointer items-center gap-2 px-4 py-2 hover:bg-surface-2">`
  with `<AttentionBadge rule />` and `<span className="text-caption text-ink-tertiary">{items.length}</span>`
  (count visible when collapsed), then `<ul className="divide-y divide-hairline">` of `<AttentionRow>`.
- Flat (Dashboard): one `<Panel>` with a single `<ul>`; each row starts with `<AttentionBadge rule={item.rule} />`.
- `AttentionRow` = `<li><Link href={item.href} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2" data-testid="attention-item">`:
  optional project key (`showProject?.(item.projectId)`, `text-caption text-ink-subtle`), `item.code`
  (`font-mono text-caption text-ink-tertiary`), `item.label` (`min-w-0 flex-1 truncate text-body-sm text-ink`),
  secondary `<AttentionBadge rule={r} />` for each `item.matched.slice(1)`, and `item.reasons[0]` as
  `text-caption text-ink-subtle`; all reasons joined with " · " in `title=`.
- Also export `AttentionCountStrip({ counts })`: inline row of non-zero `<AttentionBadge rule count />` chips in
  `ATTENTION_RULES` order; renders `<span className="text-caption text-ink-tertiary">Clear</span>` when all zero.

(`Panel` — check what the existing pages use for the `panel` utility; reuse it.)

### Commit 4 — `feat(overview): Project Overview reads the attention model`

`src/app/(app)/projects/[projectId]/page.tsx`:

- Add `projectAttention(ctx, projectId)` to the `Promise.all`; delete the inline `t`, `open`, `overdue`,
  `blocked` derivation and now-unused imports. Keep `openRisks`.
- Stat tiles (all from `attention.counts`, `grid-cols-4` kept):
  `Overdue`→`task_overdue` (danger tone when >0), `Late dependencies`→`dependency_late` (warn),
  `Blocked`→`task_blocked` (warn), `Top risks`→`risk_top` (danger). "Open tasks" tile is dropped — the header
  already shows `done/total · pct`.
- Replace the whole "Needs attention" `<section>` with
  `<section><SectionTitle className="mb-2">Needs attention</SectionTitle><AttentionList result={attention} /></section>`
  and move it **above** the Milestones section.
- Keep the Milestones panel and the Open risks panel (roster panels, not rules; see §5).

### Commit 5 — `feat(dashboard): workspaceOverview uses the evaluator per Project`

`src/server/modules/workspace/queries.ts` — rewrite `workspaceOverview(ctx, opts: { today?: string } = {})`:

- Fetch as now plus `dependenciesRepo.listByProjects(ctx.db, ids)`; `const todayIso = opts.today ?? today()` once.
- Bucket rows by `projectId` (`task.projectId`, `milestone.projectId`, `risk.projectId`, `projectId` on edges),
  call `evaluateAttention` per active Project (`active` = `status === "active" || "on_hold"` — completed/archived excluded).
- Return: `projects`, `projectById`, `activity`, `upcomingMilestones` (unchanged, 14-day horizon),
  `attention: { items: AttentionItem[]; byProject: Map<string, { counts: Record<AttentionRule, number>; total: number }> }`
  where `items = all.sort(compareAttention).slice(0, ATTENTION_DASHBOARD_LIMIT)` with
  `export const ATTENTION_DASHBOARD_LIMIT = 10`, and
  `stats: { activeProjects, overdue: Σ task_overdue, dueSoon: Σ task_due_soon, blocked: Σ task_blocked, topRisks: Σ risk_top }`.
- Delete `overdueTasks`, `dueSoonTasks`, `blockedTasks`, `topRisks`, `stats.openRisks`, the `iso` helper and
  the `riskSeverity` import. (A `Map` cannot cross the RSC boundary to a client component; the Dashboard page is a server component so it is fine — otherwise use a plain object.)

`src/app/(app)/page.tsx`:

- Delete the inline attention list. Tiles: `Overdue tasks`, **`Due in 7 days`** (`stats.dueSoon`), `Blocked`, `Top risks` (`stats.topRisks`).
- "Needs attention" section →
  `<AttentionList flat items={o.attention.items} showProject={(id) => o.projectById(id)?.key} emptyText="Nothing needs attention across your active projects." />`.
- Delete the "Top risks" section (superseded by `risk_top` items). Keep "Upcoming milestones" verbatim.
- Projects panel: each row keeps `HealthDot` + name; replaces the target-date span with
  `<AttentionCountStrip counts={o.attention.byProject.get(p.id)!.counts} />` for active Projects, `labelFor(p.status)` otherwise.
  Drop now-unused imports.
- Extend `queries.test.ts` with the Dashboard cases (§3).

### Commit 6 — `test(e2e): attention flow + docs`

`e2e/flows.spec.ts`, `docs/flows.md`, screenshots — see §3/§4.

## 3. Test plan

### `src/server/modules/workspace/attention.test.ts` (pure; fixtures are plain objects, `today = "2026-09-15"`, `project = { id: "p1", key: "ACME" }`, statuses `{ name, category }`)

- `lists an overdue task under task_overdue with a dated reason` → due `2026-09-12`, reason `"Due 12 Sep, 3 days ago"`, `counts.task_overdue === 1`.
- `lists a task due in 3 days but not one due in 10 days` → `2026-09-18` in `task_due_soon`, `2026-09-25` absent everywhere.
- `lists a blocked task under task_blocked` → category `blocked`, reason `"Blocked (Blocked)"`.
- `excludes a done task with a past due date` → category `done`, `groups` empty, all counts 0.
- `lists a past milestone with an open task, not one whose tasks are all done`.
- `lists a top-band open risk, not a closed top-band risk` → high/high open vs high/high `closed`; reason `"Severity 9 (High / High)"`.
- `flags a dependency whose upstream is due after the downstream start` → upstream ACME-7 due `2026-09-23`, downstream start `2026-09-18`, reason `"Depends on ACME-7, due 23 Sep, after start 18 Sep"`.
- `ignores a dependency whose upstream is done`.
- `falls back to the downstream due date when it has no start` → reason ends `"after due 20 Sep"`.
- `uses a milestone as upstream, skips task→milestone and milestone→milestone edges`.
- `shows a task that is overdue and blocked once, under task_overdue, with two reasons` → `reasons.length === 2`, `matched` = `["task_overdue","task_blocked"]`, not in `task_blocked`, `counts.task_blocked === 0`.
- `orders groups by severity and items by urgency` → build all six; `groups.map(g=>g.rule)` equals `ATTENTION_RULES`; overdue items date-asc; dependency items slip-desc; blocked null-due last.
- `compareAttention sorts across projects by severity then urgency`.
- `counts has every rule as a key even when empty`.

### `src/server/modules/workspace/queries.test.ts` (Vitest, `db_test`; `makeCtx/makeProject/closeDb` from `@/test/helpers`; rows via `tasksService/milestonesService/risksService/dependenciesService`; statuses via `statusesService.list(...)` and `.find(s => s.category === "blocked")` — never by name; pass `{ today: "2026-09-15" }`)

- `projectAttention: seeded project returns the expected groups, membership and order` — one fixture Project with:
  overdue Task (due 09-12), Task due 09-18 and Task due 09-25, blocked Task, done Task due 09-01, Milestone 09-10
  with one open Task and Milestone 09-11 with one done Task, high/high open Risk and high/high closed Risk,
  Dependency A(due 09-23)→B(start 09-18, due 09-22), Dependency Cdone→D, Dependency E(due 09-23)→F(no start, due 09-20),
  Task both overdue (09-12) and blocked. Assert `groups.map(g=>g.rule)` = `["task_overdue","dependency_late","milestone_past_open","task_blocked","risk_top","task_due_soon"]`, exact `entityId`
  lists per group, the overdue+blocked Task has 2 reasons, `counts` object exactly.
- `projectAttention: rejects a foreign User` → `await expect(projectAttention(stranger, projectId)).rejects.toBeInstanceOf(ForbiddenError)`.
- `workspaceOverview: excludes completed/archived projects and caps the cross-project list at 10` — second Project
  set `status: "archived"` via `projectsService.update` holding overdue Tasks; 12 overdue Tasks in the active one; assert
  `attention.items.length === 10`, none with the archived `projectId`, `byProject` lacks it, `stats.overdue === 12`.
- `workspaceOverview: items are sorted by severity then urgency across projects` — two active Projects, a blocked Task in
  one and an overdue Task in the other; `items[0].rule === "task_overdue"`.

### Playwright — append to `e2e/flows.spec.ts` after `command-palette`

State already present from earlier flows (serial run, account `email`, Project `Payments Migration`, key `F<stamp>`):
Tasks `-1 Implement v2 endpoints` (start 2026-09-10, due 09-20, In Progress), `-2 Load-test the new gateway`
(start 09-21, due 09-28, attached to Milestone "UAT begins" 2026-10-05, predecessor -1), `-3` deleted; Risk R-1
high/high open (→ `risk_top` fires already), R-2 closed. Whether -1/-2/UAT are overdue depends on the real
date, so the flow creates its own dated items relative to `new Date()` (`import { addDays, format } from "date-fns"`,
`const d = (n: number) => format(addDays(new Date(), n), "yyyy-MM-dd")`) and asserts only on those titles.

```ts
test.describe("attention", () => {
  const shot = shots("attention");

  test("overview groups attention by rule, dashboard shows per-project counts, items open their dialog", async ({
    page,
  }) => {
    await openProject(page, "Tasks");
    const create = async (title: string, o: { start?: string; due: string }) => {
      await page.getByRole("button", { name: "New task" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("Title").fill(title);
      if (o.start) await dialog.getByLabel("Start date").fill(o.start);
      await dialog.getByLabel("Due date").fill(o.due);
      await dialog.getByRole("button", { name: "Create task" }).click();
      await expect(dialog).toBeHidden();
    };
    await create("Reconcile legacy ledger", { due: d(-3) }); // -> task_overdue
    await create("Rotate PSP credentials", { due: d(+20) }); // -> task_blocked
    await page.getByText("Rotate PSP credentials").click();
    await page.getByRole("dialog").getByLabel("Status").selectOption({ label: "Blocked" });
    await page.getByRole("dialog").getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await create("Vendor delivers sandbox", { due: d(+10) }); // upstream
    await create("Run vendor smoke test", { start: d(+2), due: d(+6) }); // -> dependency_late
    await page.getByText("Run vendor smoke test").click();
    const dialog = page.getByRole("dialog");
    // Follow the exact DependencyEditor interaction used by the existing `timeline` flow (lines ~301-317).
    await dialog.getByRole("button", { name: "Add predecessor" }).click();
    await dialog.getByRole("combobox").last().selectOption({ label: "Vendor delivers sandbox" });
    await dialog.getByRole("button", { name: "Add", exact: true }).click();
    await expect(dialog.getByText("Vendor delivers sandbox").last()).toBeVisible();
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog).toBeHidden();
    await shot(page, "tasks-seeded");

    await page.getByRole("link", { name: "Overview", exact: true }).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
    const list = page.locator("section", { hasText: "Needs attention" }).first();
    await expect(list.getByText("Overdue", { exact: true }).first()).toBeVisible();
    await expect(list.getByText(/Due .*, 3 days ago/)).toBeVisible();
    await expect(list.getByText("Blocked", { exact: true }).first()).toBeVisible();
    await expect(list.getByText("Late dependency", { exact: true }).first()).toBeVisible();
    await expect(list.getByText(/Depends on .*, due .*, after start/)).toBeVisible();
    await shot(page, "overview-groups");

    await page.getByRole("link", { name: "Dashboard", exact: true }).click();
    await expect(page).toHaveURL("/");
    const row = page.getByRole("link", { name: projectName }).filter({ hasText: /overdue/ });
    await expect(row.getByText(/\d+ overdue/)).toBeVisible();
    await expect(row.getByText(/\d+ blocked/)).toBeVisible();
    await expect(row.getByText(/\d+ late dependenc/)).toBeVisible();
    await expect(page.getByText("Due in 7 days")).toBeVisible();
    await shot(page, "dashboard-counts");

    await page.getByTestId("attention-item").filter({ hasText: "Reconcile legacy ledger" }).first().click();
    await expect(page).toHaveURL(/\/tasks\?task=/);
    await expect(page.getByRole("dialog")).toContainText("Reconcile legacy ledger");
    await shot(page, "item-opens-task");
  });
});
```

Check the project nav label for the Overview tab in `src/app/(app)/projects/[projectId]/layout.tsx` /
`src/widgets/project-header/project-header.tsx`; if it is not "Overview", navigate with
`page.goto(page.url().replace(/\/tasks$/, ""))`. Screenshots land in `docs/attention/screenshots/` via `shots("attention")`.
Task numbers reuse `max+1` after deletions, so do not assert on a specific key number.

`docs/flows.md` — append row:

```
| `attention`       | Seed an overdue Task, a blocked Task and a slipping Dependency; Overview groups them by rule with reasons; Dashboard shows per-Project counts; item opens its Task | [attention](./attention/screenshots) |
```

## 4. Screenshot evidence (`docs/artifacts/7-attention/screenshots/`)

Before Commit 1 (dev server on seeded demo account `demo@example.com` / `demo-password-123`, viewport 1440×900, full-page, via a throwaway Playwright script): `before-dashboard.png`
(`/`), `before-overview.png` (`/projects/<demo id>`). After Commit 6: `after-dashboard.png`, `after-overview.png`,
`after-overview-collapsed.png` (one `<details>` closed to show the count survives), `after-overview-empty.png`
(fresh Project → empty-state text), `after-task-dialog.png` (clicked item). Reference all in the PR body.

## 5. Risks / ambiguities and recommended resolutions

1. **"Today" on the server** — use `today()` from `src/shared/lib/dates.ts` (server local calendar date), computed
   once per request and passed into the evaluator; never `new Date()` inside rule code. Tests inject `opts.today`.
   Server and Playwright run on the same machine, so `d(-3)` matches; note in PR that a UTC-hosted server flips
   "today" at 00:00 UTC.
2. **Top band** — literal reading of the issue is the maximum band (9 = High×High): `RISK_TOP_SEVERITY = 9`, test
   `>=`. Alternative (`>= 6`, the red-icon threshold used in the pages today) is a one-constant change; call it out.
3. **Dashboard panels not covered by rules** — keep "Upcoming milestones" (forward-looking roster; 14-day window is
   a calendar concern, not an attention rule); drop "Top risks" (now the `risk_top` group) and `stats.openRisks`
   (replaced by the `Top risks` tile from `counts`). Overview keeps its "Milestones" and "Open risks" roster panels;
   only the overdue/blocked derivation is removed.
4. **Item shape additions** (`code`, `urgency`, `projectId`, `matched`) are additive to the issue's shape and all
   serialisable; the AI layer keys on `(entityType, entityId)` as specified.
5. **Overview "Blocked" tile semantics change** — it used to count every blocked Task; now it counts Tasks whose
   most-severe rule is `task_blocked` (an overdue+blocked Task counts as overdue). That is exactly user story 23;
   the secondary "Blocked" tag on the overdue item keeps the information visible. State this in the PR.
6. **Collapsible via `<details>`** keeps `AttentionList` a server component. Open state is not persisted across navigations — acceptable, out of scope.
7. **Edges referencing deleted items** — services already delete edges with the endpoint
   (`dependenciesRepo.deleteForItem`); the evaluator still skips edges whose endpoints are not found.
8. **Merge with #4** — only `src/shared/domain/index.ts` overlaps; our block is at the file end.
9. **Existing e2e expectations** — the `overview` flow asserts only activity text and the Dashboard project link,
   both untouched. The Dashboard empty-state string changes; nothing asserts it.
10. **Performance** — Dashboard now also loads Dependencies for active Projects (one `inArray` query); the evaluator
    is O(tasks + edges) per Project. Fine for a single-PM workspace.

## 6. Review corrections (applied to this plan)

- `dependencies` columns are `predecessorType/predecessorId/successorType/successorId` (verified) — the evaluator input matches.
- `dependenciesRepo.listByProjects` does not exist yet — add it (Commit 2) with `inArray`.
- `workspaceOverview` must use `today()` from `src/shared/lib/dates.ts` once per request; remove `formatISO(new Date())`.
- Rewrite `src/app/(app)/page.tsx` fully against the new return contract and prune unused imports (`riskSeverity`, `addDays`, etc.).
- E2E: the default blocked Task status is named "Blocked" in `statuses/defaults.ts`; if not, select by `value` of the option whose category is blocked.
- `tasksRepo.listByProject` returns `{ task, status, assignee, team, milestone, labels }`; `risksRepo.listByProject` returns `{ risk, status, owner }`; `milestonesRepo.listByProject` returns `{ milestone, status }` — structurally compatible with `AttentionInput`.
