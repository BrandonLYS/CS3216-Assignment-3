# Plan — #8 Task search across Projects in the command palette

Branch `feat/8-task-search`, worktree `/Users/qang/projects/CS3216-A3-wt/8-task-search`.
Implemented in parallel with #4 (comments) and #7 (attention); everything server-side lands in a **new file**
`src/server/modules/tasks/search.ts` plus **appended** exports in `validation.ts` / `actions.ts`, so merges are trivial.

## 1. Summary

Typing ≥ 2 characters in ⌘K adds a "Tasks" group that searches every non-archived Project the signed-in User owns,
by key (`ACME-42`, `acme 42`, `acme42`, bare `42` inside a Project) and by case-insensitive title substring.
Server: `searchTasks(ctx, { q, currentProjectId?, limit })` (Drizzle query tasks→projects→statuses, ranked
key-hit → current-Project title-hit → other, ties by `updatedAt desc`, ≤ 10 rows) behind `searchTasksAction`
(`runAction`, no revalidation). Widget: debounced (180 ms) call with request-id stale discard, spinner row,
"No tasks match" row, rows `KEY-N · title · Project name · StatusBadge`, Enter → `/projects/{projectId}/tasks?task={id}`.
`?task=` is **already handled** by `src/features/task/tasks-view.tsx` (lines 26–41: `params.get("task")` → `openTask`
→ `<TaskDialog open>`), and the page wraps the view in `<Suspense>` — nothing to add on the Tasks page.

Verified facts that shape the plan:

- `runAction` (`src/server/core/action.ts:20-42`) returns `ActionResult<T>`; a `"use server"` action can be imported and
  awaited directly from a client component (prior art: `features/task/task-list.tsx` uses `patchTaskAction`).
- `CommandPalette` (`src/widgets/command-palette/command-palette.tsx`) already computes `currentProject` from
  `usePathname()` + the `projects` prop (line 44) — that is the `currentProjectId` source. The component returns `null` when
  closed (line 54) so all search state resets on reopen for free.
- Project ids are `gen_random_uuid()` text (`src/server/db/columns.ts`); `projects.status` enum includes `"archived"`
  (`src/shared/domain/index.ts:43`); `projects.key` is stored upper-case (`projects/validation.ts:5-9`) but **may contain
  digits** (`^[A-Z][A-Z0-9]{1,5}$`) — the e2e key is `F${stamp}` e.g. `F1AB`. The issue's regex `^([a-z]+)[-\s]?(\d+)$`
  would not match `F1AB-1`; see §5 for the adjusted regex.
- cmdk 1.1.1 (`node_modules/cmdk/dist/index.d.ts`): `Command shouldFilter?: boolean` ("if false, you must conditionally
  render valid items yourself"), `Item value?/keywords?/forceMount?`, `Group forceMount?`, `Input value?/onValueChange?`.
  With default filtering, `forceMount` items are rendered but **do not count** toward `filtered.count`, so `Command.Empty`
  ("No results.") would render *alongside* Task rows, and cmdk re-sorts groups by score (Task rows with an opaque `value`
  score 0 → group sinks). Decision: **`shouldFilter={false}`** and filter the static items in JS (see Commit 4).

## 2. Changes, grouped into commit points

Each commit leaves `npm run typecheck` and `npm run lint` green. Tests are written first inside each commit (red → green).

### Commit 1 — `feat(tasks): searchTasks service, query parsing and schema`

**(a) `src/server/modules/tasks/validation.ts` — append at end (do not touch existing exports):**

```ts
export const searchTasksSchema = z.object({
  q: z.string().trim().min(2, "Type at least 2 characters").max(100, "Query is too long"),
  currentProjectId: z.uuid().optional(),
  limit: z.number().int().min(1).max(10).default(10),
});
export type SearchTasksInput = z.infer<typeof searchTasksSchema>;
```

(Zod 4: `z.uuid()`; project ids are `gen_random_uuid()` so this is safe. `limit` default 10, cap 10.)

**(b) `src/server/modules/tasks/search.ts` — new file (pure parsing + repo query + service):**

```ts
import { and, asc, desc, eq, ilike, ne, or, sql, type SQL } from "drizzle-orm";
import type { Ctx } from "@/server/core/context";
import type { DbOrTx } from "@/server/db/client";
import type { StatusCategory } from "@/shared/domain";
import { projects } from "@/server/modules/projects/schema";
import { statuses } from "@/server/modules/statuses/schema";
import { tasks } from "./schema";
import type { SearchTasksInput } from "./validation";

export interface ParsedTaskQuery {
  /** `ACME-2`, `acme 2`, `acme2` → { projectKey: "ACME", number: 2 }. */
  key?: { projectKey: string; number: number };
  /** Bare digits, only when a current Project is known. */
  number?: number;
  /** Trimmed query, always used for the title substring match. */
  text: string;
}

// Project keys are ^[A-Z][A-Z0-9]{1,5}$ (may contain digits, e.g. F1AB), so a separator makes the split
// unambiguous; without a separator only a letters-only key is accepted (acme2 → ACME-2).
const KEY_WITH_SEPARATOR = /^([a-z][a-z0-9]*)[-\s](\d+)$/i;
const KEY_NO_SEPARATOR = /^([a-z]+)(\d+)$/i;
const BARE_NUMBER = /^\d+$/;

export function parseTaskQuery(q: string, currentProjectId?: string): ParsedTaskQuery {
  const text = q.trim();
  const m = KEY_WITH_SEPARATOR.exec(text) ?? KEY_NO_SEPARATOR.exec(text);
  if (m) return { key: { projectKey: m[1]!.toUpperCase(), number: Number(m[2]) }, text };
  if (currentProjectId && BARE_NUMBER.test(text)) return { number: Number(text), text };
  return { text };
}

/** Escape LIKE metacharacters so user input is matched literally (Postgres default escape is `\`). */
export const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export interface TaskSearchResult {
  id: string;
  projectId: string;
  projectKey: string;
  projectName: string;
  number: number;
  title: string;
  status: { name: string; category: StatusCategory; color: string };
}

/** Repository-level query: owned, non-archived Projects only; key hits rank above title hits. */
export async function searchTasksQuery(
  db: DbOrTx,
  ownerId: string,
  input: { q: string; currentProjectId?: string; limit: number },
): Promise<TaskSearchResult[]> {
  const parsed = parseTaskQuery(input.q, input.currentProjectId);

  const keyHits: SQL[] = [];
  if (parsed.key)
    keyHits.push(
      and(sql`lower(${projects.key}) = ${parsed.key.projectKey.toLowerCase()}`, eq(tasks.number, parsed.key.number))!,
    );
  if (parsed.number !== undefined && input.currentProjectId)
    keyHits.push(and(eq(tasks.projectId, input.currentProjectId), eq(tasks.number, parsed.number))!);
  const keyHit: SQL = keyHits.length ? or(...keyHits)! : sql`false`;
  const titleHit = ilike(tasks.title, `%${escapeLike(parsed.text)}%`);
  const inCurrent: SQL = input.currentProjectId ? eq(tasks.projectId, input.currentProjectId) : sql`false`;
  const rank = sql<number>`case when ${keyHit} then 0 when ${inCurrent} then 1 else 2 end`;

  return db
    .select({
      id: tasks.id,
      projectId: tasks.projectId,
      projectKey: projects.key,
      projectName: projects.name,
      number: tasks.number,
      title: tasks.title,
      status: { name: statuses.name, category: statuses.category, color: statuses.color },
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .innerJoin(statuses, eq(statuses.id, tasks.statusId))
    .where(and(eq(projects.ownerId, ownerId), ne(projects.status, "archived"), or(keyHit, titleHit)))
    .orderBy(rank, desc(tasks.updatedAt), asc(tasks.number))
    .limit(input.limit);
}

/** Stateless read; ownership is enforced by the join on `projects.ownerId` (no single-Project seam applies). */
export const searchTasks = (ctx: Ctx, input: SearchTasksInput) =>
  searchTasksQuery(ctx.db, ctx.userId, { q: input.q, currentProjectId: input.currentProjectId, limit: input.limit });
```

Notes: no `assertOwnsProject` — this is cross-Project by design; the `projects.ownerId = ctx.userId` join is the
authorization. `currentProjectId` is only a ranking/number hint; a foreign id simply never matches (ownership join).
Done Tasks are included (user story 19); the widget shows their Status.

**(c) `src/server/modules/tasks/search.test.ts` — new file (see §3 for names).** Uses `makeCtx`, `makeProject(ctx, key)`,
`tasksService.create`, `projectsService.update(ctx, { id, status: "archived" })` from existing helpers/services.

Run: `npx vitest run src/server/modules/tasks/search.test.ts` (needs `db_test` container), `npm run typecheck`, `npm run lint`.

### Commit 2 — `feat(tasks): searchTasksAction`

**`src/server/modules/tasks/actions.ts` — append at end:**

```ts
/** Read-only: the command palette's only entry point for Task search. No revalidation. */
export async function searchTasksAction(input: z.input<typeof searchTasksSchema>) {
  return runAction(searchTasksSchema, input, (ctx, i) => searchTasks(ctx, i));
}
```

Add to the existing import lines: `searchTasksSchema` from `./validation`; `import { searchTasks } from "./search";`.
(Tiny; may be folded into Commit 1.)

### Commit 3 — `test(e2e): task-search flow` (red until Commit 4; gives the "before" screenshots)

**`e2e/flows.spec.ts` — append after the `command-palette` describe** (reuses `login`, `key`, `stamp`, `projectName`):

```ts
test.describe("task-search", () => {
  const shot = shots("task-search");
  const key2 = `G${stamp}`;
  const project2 = "Vendor Portal";

  test("⌘K finds tasks across projects by key and title and opens the task", async ({ page }) => {
    // Second project with two tasks, created through the UI.
    await login(page);
    await page.getByRole("button", { name: "New project" }).first().click();
    await page.getByLabel("Name").fill(project2);
    await page.getByLabel("Key").fill(key2);
    await page.getByRole("button", { name: "Create project" }).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
    await page.getByRole("link", { name: "Tasks", exact: true }).click();
    for (const title of ["Sign vendor contract", "Load-test vendor portal"]) {
      await page.getByRole("button", { name: "New task" }).click();
      await page.getByRole("dialog").getByLabel("Title").fill(title);
      await page.getByRole("dialog").getByRole("button", { name: "Create task" }).click();
      await expect(page.getByRole("dialog")).toBeHidden();
      await expect(page.getByText(title)).toBeVisible();
    }
    await shot(page, "second-project-tasks");

    // Key search from the Dashboard → result shows project name → Enter opens the dialog.
    await page.getByRole("link", { name: "Dashboard", exact: true }).click();
    await expect(page).toHaveURL("/");
    await page.keyboard.press("Meta+k");
    const input = page.getByPlaceholder("Type a command or search…");   // check the real placeholder in the palette
    await input.fill(`${key}-1`);
    await shot(page, "search-by-key");
    const hit = page.getByRole("option", { name: new RegExp(`${key}-1`) });
    await expect(hit).toContainText("Implement v2 endpoints");
    await expect(hit).toContainText(projectName);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}\/tasks\?task=[0-9a-f-]{36}$/);
    await expect(page.getByRole("dialog", { name: `${key}-1` })).toBeVisible();
    await shot(page, "task-dialog-open");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();

    // Key variants: lower-case with a space.
    await page.keyboard.press("Meta+k");
    await input.fill(`${key2.toLowerCase()} 2`);
    await expect(page.getByRole("option", { name: new RegExp(`${key2}-2`) })).toContainText("Load-test vendor portal");
    await shot(page, "search-key-variant");

    // Title fragment matches both projects.
    await input.fill("load-test");
    await expect(page.getByRole("option", { name: /Load-test the new gateway/ })).toContainText(projectName);
    await expect(page.getByRole("option", { name: /Load-test vendor portal/ })).toContainText(project2);
    await shot(page, "search-by-title");

    await input.fill("zzqx-nothing");
    await expect(page.getByText("No tasks match")).toBeVisible();
    await shot(page, "no-tasks-match");
  });
});
```

cmdk `Command.Item` renders `role="option"`, so `getByRole("option", …)` targets result rows. The flow runs **last** in the
serial spec so the extra Project does not disturb earlier flows (`openProject` already uses `.first()`). Check how the
existing `command-palette` flow opens the palette (`Meta+k` vs `ControlOrMeta+k`) and reuse it.

**`docs/flows.md` — append a row:**

```
| `task-search`     | ⌘K searches Tasks across Projects by key (case/hyphen tolerant) and title, shows Project + Status, Enter opens the Task dialog | [task-search](./task-search/screenshots)         |
```

Run with the dev server up: `E2E_NO_SERVER=1 npx playwright test e2e/flows.spec.ts`. It fails at
`expect(hit).toContainText(...)` before Commit 4 — copy `docs/task-search/screenshots/02-search-by-key.png` to
`docs/artifacts/8-task-search/screenshots/before-01-palette-key-no-results.png` (see §4).

### Commit 4 — `feat(command-palette): Tasks group with server search`

**`src/widgets/command-palette/command-palette.tsx`:**

1. Imports: add `Loader2` to the lucide import; `import { searchTasksAction } from "@/server/modules/tasks/actions";`
   `import type { TaskSearchResult } from "@/server/modules/tasks/search";` (type-only, same pattern as `ProjectRow`);
   `import { StatusBadge } from "@/entities/status/status-badge";`.
2. State (inside `CommandPalette`, above `if (!open) return null` so hooks run every render):

```tsx
const [query, setQuery] = React.useState("");
const q = query.trim();
const showTasks = q.length >= 2;
const [search, setSearch] = React.useState<{ loading: boolean; results: TaskSearchResult[] }>({
  loading: false,
  results: [],
});
const requestId = React.useRef(0);
const currentProjectId = currentProject?.id;

React.useEffect(() => {
  if (!showTasks) {
    setSearch({ loading: false, results: [] });
    return;
  }
  const id = ++requestId.current;
  setSearch({ loading: true, results: [] }); // hide stale rows so Enter can never pick an old result
  const timer = setTimeout(async () => {
    const res = await searchTasksAction({ q, currentProjectId });
    if (id !== requestId.current) return; // stale response
    setSearch({ loading: false, results: res.ok ? res.data : [] });
  }, 180);
  return () => clearTimeout(timer);
}, [q, showTasks, currentProjectId]);
```

   (If the `react-hooks/set-state-in-effect` lint rule complains about the synchronous `setSearch` calls, derive `loading` from a `pendingQuery` state set in the same effect or move the synchronous reset into the `onValueChange` handler.)

3. Static filtering (replaces cmdk's): `const hit = (...labels: string[]) => !q || labels.some((l) => l.toLowerCase().includes(q.toLowerCase()));`
   then compute `sectionHits = currentProject ? PROJECT_SECTIONS.filter((s) => hit(s.label)) : []`,
   `goToHits`, `projectHits = projects.filter((p) => hit(p.name, p.key))`, `actionHits`; render each `Command.Group` only
   when its array is non-empty. `<Command shouldFilter={false} …>`; `<Command.Input value={query} onValueChange={setQuery} …>`.
   Remove `Command.Empty`; render instead
   `{!showTasks && staticCount === 0 && <div className="px-2 py-6 text-center text-caption text-ink-subtle">No results.</div>}`.
   Rationale: with `shouldFilter={false}` cmdk performs no scoring/sorting, so DOM order is authoritative, `Command.Empty`
   can no longer fire next to "No tasks match", and Enter (cmdk's select-first-item on search change / on item mount) hits
   the first rendered item. Existing behaviour is preserved for the `command-palette` flow: "Payments" still matches the
   Project item (substring), "Risks" the section.
4. Tasks group, rendered **after** the existing groups (existing shortcuts keep priority; for a key query no static item
   matches, so the Task row is first and Enter opens it):

```tsx
{showTasks && (
  <Command.Group heading="Tasks">
    {search.loading ? (
      <div className="flex h-8 items-center gap-2.5 px-2 text-caption text-ink-subtle" aria-live="polite">
        <Loader2 className="size-3.5 animate-spin" /> Searching…
      </div>
    ) : search.results.length === 0 ? (
      <div className="px-2 py-3 text-center text-caption text-ink-subtle">No tasks match</div>
    ) : (
      search.results.map((r) => (
        <Item key={r.id} value={`task:${r.id}`} icon={ListTodo} onSelect={() => go(`/projects/${r.projectId}/tasks?task=${r.id}`)}>
          <span className="shrink-0 font-mono text-[10px] text-ink-tertiary">{`${r.projectKey}-${r.number}`}</span>
          <span className="truncate">{r.title}</span>
          <span className="ml-auto flex shrink-0 items-center gap-2">
            <span className="max-w-32 truncate text-caption text-ink-tertiary">{r.projectName}</span>
            <StatusBadge status={r.status} />
          </span>
        </Item>
      ))
    )}
  </Command.Group>
)}
```

   Spinner/empty rows are plain `<div>`s, not `Command.Item`, so they are never selectable. `go()` already calls
   `onClose()` then `router.push` (user story 17). Check `StatusBadge`'s actual props in `src/entities/status/status-badge.tsx` and adapt.
5. `Item` helper: add optional `value?: string` prop and pass it to `Command.Item` (stable unique value; cmdk requires one
   when `textContent` changes). Add `min-w-0` to the Item class so `truncate` works.

Only design tokens are used (`text-ink-subtle`, `text-ink-tertiary`, `bg-surface-3`, `text-caption`); Status colour comes
from `status.color` via `StatusBadge`, semantics from `status.category` (nothing keys off `status.name`).

Run: `npm run typecheck && npm run lint && E2E_NO_SERVER=1 npx playwright test e2e/flows.spec.ts` → green; copy "after"
screenshots (§4) into `docs/artifacts/8-task-search/screenshots/` in this commit.

## 3. Test plan

### Vitest — `src/server/modules/tasks/search.test.ts`

Setup (`beforeAll`): `ctx = await makeCtx()`; `acme = await makeProject(ctx, "ACME")`; `beta = await makeProject(ctx, "BETA")`;
`old = await makeProject(ctx, "OLD")` then `projectsService.update(ctx, { id: old.id, status: "archived" })`;
`stranger = await makeCtx()`; `theirs = await makeProject(stranger, "ACME")` (same key, other User).
Tasks via `tasksService.create(ctx, { projectId, title, priority: "none" })`:
ACME: 1 "Sign vendor contract", 2 "Migrate gateway", 3 "Vendor SLA review"; BETA: 1 "Vendor onboarding", 2 "Gateway load test";
OLD: 1 "Archived vendor task"; stranger/ACME: 1 "Their secret task", 2 "Their vendor task". `afterAll(closeDb)`.

`describe("parseTaskQuery")`

- `parses ACME-2, acme 2 and acme2 as the same key` (all → `{ projectKey: "ACME", number: 2 }`)
- `accepts digits in the key when a separator is present (F1AB-1) and not otherwise`
- `treats bare digits as a number only when a current project id is given`
- `falls back to text for ordinary words`

`describe("searchTasks")`

- `returns the exact key match first for "ACME-2"` (first row `{ projectKey: "ACME", number: 2, title: "Migrate gateway" }`, `projectName: "Project ACME"`, `status.category` defined)
- `matches the key case-insensitively with a space or no separator ("acme 2", "acme2")`
- `resolves a bare number inside the current project` (`{ q: "1", currentProjectId: beta.id }` → BETA-1 first)
- `matches title substrings case-insensitively` (`"VENDOR"` → ACME-1, ACME-3, BETA-1; never OLD or stranger rows)
- `ranks current-project title matches above other projects` (`"vendor"` with `currentProjectId: beta.id` → BETA-1 first; with `acme.id` → ACME rows first)
- `ranks an exact key hit above title hits` (create ACME task titled "ACME-1 follow-up"; `"ACME-1"` → row number 1 first)
- `orders ties by most recently updated` (update ACME-1's title via `tasksService.update`; `"vendor"` with `currentProjectId: acme.id` → ACME-1 before ACME-3)
- `caps results at limit` (create 12 BETA tasks "Bulk item N"; `"Bulk item"` → 10 rows; `{ limit: 3 }` → 3)
- `excludes tasks in archived projects` (`"Archived"` → `[]`)
- `never returns another user's tasks` (`"ACME-1"` from `ctx` → only own ACME-1; `"secret"` → `[]`; `searchTasks(stranger, { q: "ACME-1" })` → their task only)
- `treats LIKE metacharacters literally` (`"100%"` → no rows unless a title literally contains `100%`)

`describe("searchTasksSchema")`

- `rejects a query shorter than 2 characters` (`{ q: "a" }` and `{ q: " x " }` → `success === false`)
- `trims, defaults limit to 10 and caps it at 10` (`{ q: " ab " }` → `q: "ab", limit: 10`; `{ q: "ab", limit: 50 }` → fail)

### Playwright — `task-search` flow (Commit 3)

Steps as in the code above. Screenshots: `01-second-project-tasks`, `02-search-by-key`, `03-task-dialog-open`,
`04-search-key-variant`, `05-search-by-title`, `06-no-tasks-match` in `docs/task-search/screenshots/`.

## 4. Screenshot evidence — `docs/artifacts/8-task-search/screenshots/`

- **Before** (taken before Commit 4; dev server on this branch, seeded demo account `demo@example.com` / `demo-password-123`):
  - `before-01-palette-key-no-results.png` — palette with `PAY-1` typed, showing only "No results.".
  - `before-02-palette-title-no-results.png` — palette with a title fragment typed.
- **After** (copies from the green run after Commit 4, plus a demo-account shot):
  - `after-01-search-by-key.png` (row `KEY-1 · Implement v2 endpoints · Payments Migration · Status badge`)
  - `after-02-task-dialog-open.png` (Tasks page, dialog `KEY-1` open, URL has `?task=`)
  - `after-03-search-key-variant.png` (`g… 2` lower-case/space finds `G…-2`)
  - `after-04-search-by-title-two-projects.png` (`load-test` → rows from both Projects)
  - `after-05-no-tasks-match.png`

## 5. Risks / ambiguities and recommended resolutions

1. **Issue regex vs. keys with digits.** The issue specifies `^([a-z]+)[-\s]?(\d+)$`; real keys may contain digits
   (`F1AB`). Resolution: two regexes (`KEY_WITH_SEPARATOR` allows digits; `KEY_NO_SEPARATOR` letters-only). Documented in
   `search.ts` and covered by a test. `F1AB1` (no separator) is deliberately a title search.
2. **`?task=` dialog opening** — already implemented (`tasks-view.tsx:26-41`, page wrapped in `<Suspense>`). Nothing to
   add. If the target Tasks page is *already* mounted (search from the same Project), `router.push` only changes search
   params; `useSearchParams` re-renders and the dialog opens — verify once manually.
3. **Current Project id** — from `pathname.startsWith("/projects/{id}")` (existing line 44). If the current Project is
   archived, bare-number search returns nothing (archived excluded) — acceptable, matches story 18.
4. **cmdk filtering** — `shouldFilter={false}` means Project/section matching becomes plain substring (was fuzzy
   `command-score`). Existing e2e (`Payments`, `Risks`) still passes. Alternative rejected: `forceMount` on Task items keeps
   fuzzy matching but `Command.Empty` fires next to Task rows and cmdk re-sorts groups by score.
5. **Stale results and Enter** — results are cleared on every new query (spinner shown) so Enter can never select a row
   from a previous query. Enter pressed *during* loading selects the first static match or nothing.
6. **Server action from a widget** — `widgets` importing `@/server/modules/tasks/actions` is consistent with layering
   (`features` already do). The palette never imports a repository. The `ActionResult` `!ok` branch is treated as "no
   results" (validation can only fail for `q` < 2, which the widget already gates).
7. **Performance / index** — `ILIKE '%…%'` cannot use a btree index; the scan is bounded to the User's own Tasks via
   the existing project/task indexes, which is fine at demo scale. Out of scope now.
8. **Zod 4 `z.uuid()`** — if typecheck complains, use `z.string().uuid()`; both exist in zod ^4.5.
9. **Parallel branches** — #4 adds a comment-count subquery to `tasksRepo` list queries; this plan touches none of those
   functions (new `search.ts`, appended exports only). Conflicts limited to the shared import line
   in `actions.ts` and the `flows.md` table / `flows.spec.ts` tail — resolve by keeping both.
10. **E2E ordering** — the new flow must stay last; it creates a second Project that earlier flows' `.first()` locators
    tolerate.

## 6. Review corrections (applied to this plan)

- The existing `command-palette` flow opens the palette with `page.keyboard.press("Meta+k")` — reuse exactly that; placeholder is exactly `Type a command or search…`.
- `react-hooks/set-state-in-effect`: do NOT call `setSearch` synchronously at the top of the effect. Reset state in the `onValueChange` handler (`setQuery(v); setSearch({ loading: v.trim().length >= 2, results: [] })`) and only set state inside the debounced async callback.
- E2E: anchor the option regex to the start (`new RegExp(`^${key}-1`)`) or use `.filter({ hasText: "Implement v2 endpoints" })` to avoid matching the project name.
- Zod is ^4.5 — `z.uuid()` is valid; fall back to `z.string().uuid()` only if typecheck complains.
- Every `Item` (static and Task rows) must pass a unique `value` to `Command.Item`.
