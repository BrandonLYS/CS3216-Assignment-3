# Plan — #5 Per-item History tab in Task, Risk and Milestone dialogs

Branch `feat/5-history`, built **on top of #4 (Comments)**; #6 (Evidence links) lands in parallel and also edits the three dialogs. Paths are relative to the worktree root.

## 1. Summary

Surface the Activity Events that already exist for one Task / Risk / Milestone inside its dialog:

- **Read path**: `activityRepo.historyForEntity` (new repo query: item events ∪ comment events whose payload references the item) → `activityService.listEntityHistory` (asserts ownership, enriches ids → names, formats dates/enums, returns flat `HistoryEntry[]` newest-first) → `listEntityHistoryAction` (`runAction`, JSON input, no revalidate — a read).
- **Shared domain**: `src/shared/domain/history-fields.ts` — per-entity field → `{ label, kind }` dictionary, re-exported from `src/shared/domain/index.ts` so the Overview feed can adopt it later.
- **UI**: new `Tabs` primitive in `src/shared/ui/tabs.tsx` (WAI-ARIA tabs, roving tabindex); display-only `EntityHistory` in `src/entities/activity/entity-history.tsx` (groups rows by actor + second client-side); features-layer `ItemDialogTabs` in `src/features/history/item-dialog-tabs.tsx` owning tab state, calling the action on every History activation, rendering `EntityHistory`. The three dialogs wrap their existing edit `ActionForm` in `<ItemDialogTabs>` — a 2-line change each so #6's edits _inside_ the form don't conflict.
- **Comment events** are linked to the item through the Activity Event payload — not the `comments` table (row gone after delete) and not `entityLabel` prefixes (display string, fragile). #4 already provides this contract (see Commit 1).
- No schema changes, no migrations (#4 already added `comment` to `ENTITY_TYPES`).

## 2. Changes, in commit order (each leaves `typecheck` + `lint` green)

### Commit 1 — verify #4's Recorder payload contract (no code unless missing)

#4 (already on this branch) extended `Recorder.created/deleted(entityType, projectId, entityId, entityLabel, snapshot?)` in `src/server/core/mutation.ts`: `flush` writes the snapshot to `newValue` (created) / `oldValue` (deleted), `field` stays `null`. `commentsService` passes a `CommentSnapshot` `{ entityType, entityId, body, saidById, saidByName, saidOn }` where `entityType/entityId` is the **parent item**. **Verify with `git log -- src/server/core/mutation.ts` and read `src/server/modules/comments/service.ts`.** If the snapshot lacks `entityType`/`entityId`, add them there and add a test to `comments/service.test.ts`: `"stamps the parent item reference on comment.created and comment.deleted events"` asserting `newValue`/`oldValue` `toMatchObject({ entityType: "task", entityId: task.id })`. Do not introduce a second payload mechanism.

### Commit 2 — `domain: history field dictionary`

`src/shared/domain/history-fields.ts` (new; add `export * from "./history-fields";` to `src/shared/domain/index.ts` — beware circular import: `history-fields.ts` imports `labelFor`/`EntityType` from `./index`; if that creates a cycle problem at runtime, move `labelFor` usage to call-time only, or place the dictionary directly in `index.ts` at the end):

```ts
import { labelFor, type EntityType } from "./index";

/** Items that own a History tab. Alias of #4's COMMENTABLE_ENTITY_TYPES. */
export const HISTORY_ENTITY_TYPES = COMMENTABLE_ENTITY_TYPES;
export type HistoryEntityType = CommentableEntityType;

export type HistoryFieldKind =
  | "text"
  | "date"
  | "enum"
  | "number"
  | "status"
  | "person"
  | "team"
  | "milestone"
  | "labels" // reference kinds — enriched id → name
  | "evidence"; // #6: rec.updated field "evidence", value = Evidence title

export interface HistoryFieldDef {
  label: string;
  kind: HistoryFieldKind;
}

// Key order = render order within one save (matches the form).
export const HISTORY_FIELDS: Record<HistoryEntityType, Record<string, HistoryFieldDef>> = {
  task: {
    title: { label: "Title", kind: "text" },
    description: { label: "Description", kind: "text" },
    statusId: { label: "Status", kind: "status" },
    priority: { label: "Priority", kind: "enum" },
    assigneeId: { label: "Owner", kind: "person" },
    teamId: { label: "Team", kind: "team" },
    milestoneId: { label: "Milestone", kind: "milestone" },
    estimateHours: { label: "Estimate (hours)", kind: "number" },
    startDate: { label: "Start date", kind: "date" },
    dueDate: { label: "Due date", kind: "date" },
    labelIds: { label: "Labels", kind: "labels" },
    evidence: { label: "Evidence", kind: "evidence" },
  },
  risk: {
    title: { label: "Title", kind: "text" },
    cause: { label: "Cause", kind: "text" },
    impactDescription: { label: "Impact", kind: "text" },
    probability: { label: "Probability", kind: "enum" },
    impact: { label: "Impact level", kind: "enum" },
    statusId: { label: "Status", kind: "status" },
    ownerId: { label: "Owner", kind: "person" },
    mitigation: { label: "Mitigation", kind: "text" },
    reviewDate: { label: "Review date", kind: "date" },
    description: { label: "Notes", kind: "text" },
    evidence: { label: "Evidence", kind: "evidence" },
  },
  milestone: {
    name: { label: "Name", kind: "text" },
    description: { label: "Description", kind: "text" },
    dueDate: { label: "Due date", kind: "date" },
    statusId: { label: "Status", kind: "status" },
    ownerId: { label: "Owner", kind: "person" },
    evidence: { label: "Evidence", kind: "evidence" },
  },
};

export const historyField = (entityType: HistoryEntityType, field: string): HistoryFieldDef =>
  HISTORY_FIELDS[entityType][field] ?? { label: labelFor(field), kind: "text" };
```

Verify field names against `tasks/schema.ts` (+ synthetic `labelIds` in `tasks/service.ts`; `sortOrder` filtered, `completedAt` never diffed), `risks/schema.ts`, `milestones/schema.ts` (`reachedAt` never diffed). Labels equal the form labels in the three dialogs.

### Commit 3 — `activity: listEntityHistory service + action + tests`

`src/server/modules/activity/validation.ts` (new):

```ts
export const listEntityHistorySchema = z.object({
  projectId: z.string(),
  entityType: z.enum(HISTORY_ENTITY_TYPES),
  entityId: z.string(),
});
export type ListEntityHistoryInput = z.infer<typeof listEntityHistorySchema>;
```

`src/server/modules/activity/service.ts` — add to `activityRepo` (import `or, sql` from drizzle-orm; leave `forEntity` untouched, tasks test uses it):

```ts
/** All events for one item plus Comment events whose payload points at it. Newest first, no limit. */
historyForEntity: (db: DbOrTx, projectId: string, entityType: HistoryEntityType, entityId: string) =>
  select(db).where(and(
    eq(activityEvents.projectId, projectId),
    or(
      and(eq(activityEvents.entityType, entityType), eq(activityEvents.entityId, entityId)),
      and(eq(activityEvents.entityType, "comment"),
          sql`coalesce(${activityEvents.newValue}, ${activityEvents.oldValue}) @> ${JSON.stringify({ entityType, entityId })}::jsonb`),
    ))).orderBy(desc(activityEvents.occurredAt), desc(activityEvents.id)),
```

(Check the column type of `oldValue/newValue` in `activity/schema.ts` — `jsonb` is required for `@>`; if it is `json`, cast with `::jsonb`.)

`src/server/modules/activity/enrich.ts` (new, pure):

```ts
export interface HistoryEntry {
  id: string;
  action: ActivityAction;
  entityType: EntityType; // task|risk|milestone|comment
  field: string | null;
  fieldLabel: string | null;
  kind: HistoryFieldKind | "comment" | null;
  oldValue: unknown;
  newValue: unknown; // raw (AI layer)
  oldLabel: string | null;
  newLabel: string | null; // display strings; comment body lives here
  actorId: string | null;
  actorName: string | null;
  occurredAt: string; // ISO
}
export interface RefLookup {
  statuses: Map<string, string>;
  people: Map<string, string>;
  teams: Map<string, string>;
  milestones: Map<string, string>;
  labels: Map<string, string>;
}

const EMPTY = "empty";
const refName = (m: Map<string, string>, v: unknown) =>
  v == null || v === "" ? EMPTY : (m.get(String(v)) ?? `${String(v)} (deleted)`);

export function describeValue(kind: HistoryFieldKind, v: unknown, refs: RefLookup): string {
  if (v === null || v === undefined || v === "") return EMPTY;
  switch (kind) {
    case "status":
      return refName(refs.statuses, v);
    case "person":
      return refName(refs.people, v);
    case "team":
      return refName(refs.teams, v);
    case "milestone":
      return refName(refs.milestones, v);
    case "labels":
      return Array.isArray(v) && v.length ? v.map((id) => refName(refs.labels, id)).join(", ") : EMPTY;
    case "date":
      return fmtDate(String(v), "d MMM yyyy"); // shared/lib/dates.ts
    case "enum":
      return labelFor(String(v));
    case "number":
    case "evidence":
      return String(v);
    default: {
      const s = String(v).split("\n")[0] ?? "";
      return s.length > 80 ? `${s.slice(0, 80)}…` : s;
    }
  }
}

export function enrichHistory(rows: ActivityItem[], entityType: HistoryEntityType, refs: RefLookup): HistoryEntry[] {
  return rows.map(({ event: e, actorName }) => {
    const base = {
      id: e.id,
      action: e.action,
      entityType: e.entityType,
      field: e.field,
      oldValue: e.oldValue,
      newValue: e.newValue,
      actorId: e.actorId,
      actorName,
      occurredAt: e.occurredAt.toISOString(),
    };
    if (e.entityType === "comment") {
      const body = (v: unknown) =>
        v && typeof v === "object" && "body" in v ? String((v as { body: unknown }).body) : null;
      return {
        ...base,
        fieldLabel: "Comment",
        kind: "comment",
        oldLabel: body(e.oldValue),
        newLabel: body(e.newValue) ?? (e.action === "created" ? e.entityLabel : null),
      };
    }
    if (e.action !== "updated" || !e.field)
      return { ...base, fieldLabel: null, kind: null, oldLabel: null, newLabel: null };
    const def = historyField(entityType, e.field);
    return {
      ...base,
      fieldLabel: def.label,
      kind: def.kind,
      oldLabel: describeValue(def.kind, e.oldValue, refs),
      newLabel: describeValue(def.kind, e.newValue, refs),
    };
  });
}
```

`activityService.listEntityHistory`:

```ts
listEntityHistory: async (ctx: Ctx, input: ListEntityHistoryInput): Promise<HistoryEntry[]> => {
  await assertOwnsProject(ctx.db, ctx.userId, input.projectId);   // first line
  const [rows, statuses, people, teams, milestones, labels] = await Promise.all([
    activityRepo.historyForEntity(ctx.db, input.projectId, input.entityType, input.entityId),
    statusesRepo.listByProject(ctx.db, input.projectId), peopleRepo.listByProject(ctx.db, input.projectId),
    teamsRepo.listByProject(ctx.db, input.projectId), milestonesRepo.listByProject(ctx.db, input.projectId),
    labelsRepo.listByProject(ctx.db, input.projectId),
  ]);
  const byId = <T extends { id: string; name: string }>(xs: T[]) => new Map(xs.map((x) => [x.id, x.name]));
  return enrichHistory(rows, input.entityType, { statuses: byId(statuses), people: byId(people), teams: byId(teams),
    milestones: byId(milestones.map((m) => m.milestone)), labels: byId(labels) });
},
```

Check the real repo function names (`statusesRepo`, `peopleRepo`, `teamsRepo`, `milestonesRepo`, labels — labels may live in `labels/service.ts`) and their return shapes. Don't use `loadProjectRefs` (double ownership assert). Query is scoped by `projectId`, so a foreign `entityId` returns `[]`.

`src/server/modules/activity/actions.ts` (new, `"use server"`):

```ts
export async function listEntityHistoryAction(input: z.input<typeof listEntityHistorySchema>) {
  return runAction(listEntityHistorySchema, input, (ctx, i) => activityService.listEntityHistory(ctx, i));
}
```

No `revalidateProject`, no redirect.

`src/server/modules/activity/service.test.ts` (new) — §3. Write it first.

### Commit 4 — `ui: Tabs primitive`

`src/shared/ui/tabs.tsx` (new, `"use client"`; `export * from "./tabs";` in `src/shared/ui/index.ts`). Controlled, WAI-ARIA tabs, automatic activation:

- `Tabs({ value, onValueChange, children, className })` — provides `{ value, onChange, id: useId() }` via context.
- `TabList({ children, "aria-label" })` — `role="tablist"`, `className="flex gap-1 border-b border-hairline"`; `onKeyDown`: ArrowRight/ArrowLeft move focus **and** activate (wrap), Home/End jump; implemented by querying `[role=tab]:not([disabled])` in `e.currentTarget`, finding `document.activeElement`, then `.focus()` + `.click()` the target.
- `Tab({ value, children })` — `<button type="button" role="tab" id={`${id}-tab-${value}`} aria-selected aria-controls tabIndex={selected ? 0 : -1} onClick=…>`; classes `-mb-px border-b-2 px-3 py-2 text-body-sm transition-colors` + `selected ? "border-primary text-ink" : "border-transparent text-ink-subtle hover:text-ink"`.
- `TabPanel({ value, children })` — returns `null` when inactive; `role="tabpanel" id aria-labelledby tabIndex={0} className="pt-4"`.
  `type="button"` is mandatory (sits near forms). Tokens only.

### Commit 5 — `entities: EntityHistory`

`src/entities/activity/entity-history.tsx` (new; imports only **types** from `@/server/modules/activity/enrich` and `@/shared/*`; no repositories/actions):

- `groupHistory(entries, entityType)`: key `${actorId ?? ""}|${occurredAt.slice(0,19)}` (to the second); merge consecutive equal keys (input already newest-first → `created` ends last). Inside a group order updated rows by `Object.keys(HISTORY_FIELDS[entityType]).indexOf(field)` (unknown last), comment rows after.
- `EntityHistory({ entries: HistoryEntry[] | null, entityType, loading, error })`:
  - `loading && !entries` → "Loading history…" (`py-6 text-center text-caption text-ink-subtle`); `error` → `<p role="alert" className="text-caption text-tag-red">`; `entries.length === 0` → **"No changes yet"**.
  - `<ol className="flex flex-col gap-4">` groups. Header: dot `size-1.5 rounded-full bg-hairline-tertiary` (as `ActivityRow`), `<span className="font-medium text-ink">{actorName ?? "Someone"}</span>`, `<time dateTime={occurredAt} title={fmtDateTime(occurredAt)} className="text-ink-tertiary">{relative(occurredAt)}</time>`.
  - Rows `<ul className="ml-4 mt-1 flex flex-col gap-1 text-caption text-ink-muted">`: item created → `Created`; item deleted → `Deleted`; `kind==="comment"` created → `Commented: <span className="text-ink whitespace-pre-line">{newLabel}</span>`, deleted → `Deleted a comment: <span className="text-ink-subtle line-through">{oldLabel}</span>`; `kind==="evidence"` → `Linked evidence “X”` / `Unlinked evidence “X”` depending on which side is non-empty; else `<span className="text-ink">{fieldLabel}</span>: <span className="text-ink-subtle">{oldLabel}</span> <ArrowRight className="inline size-3 text-ink-tertiary"/> <span className="text-ink">{newLabel}</span>`.

### Commit 6 — `features: ItemDialogTabs + mount in the three dialogs`

`src/features/history/item-dialog-tabs.tsx` (new, `"use client"`):

```tsx
export function ItemDialogTabs({
  history,
  children,
}: {
  history: { projectId: string; entityType: HistoryEntityType; entityId: string } | null; // null = create mode → no tab bar
  children: React.ReactNode; // the existing edit <ActionForm>
}) {
  const [tab, setTab] = React.useState<"details" | "history">("details");
  const [entries, setEntries] = React.useState<HistoryEntry[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  if (!history) return <>{children}</>;
  async function load() {
    // event handler, not an effect
    setLoading(true);
    setError(null);
    const res = await listEntityHistoryAction(history);
    setLoading(false);
    if (!res.ok) return setError(res.error);
    setEntries(res.data);
  }
  const change = (v: string) => {
    setTab(v as "details" | "history");
    if (v === "history") void load();
  };
  return (
    <Tabs value={tab} onValueChange={change}>
      <TabList aria-label="Item sections">
        <Tab value="details">Details</Tab>
        <Tab value="history">History</Tab>
      </TabList>
      {/* Details stays MOUNTED (hidden) so unsaved edits + LabelPicker state survive a tab switch */}
      <div role="tabpanel" aria-label="Details" className={tab === "details" ? "pt-4" : "hidden"}>
        {children}
      </div>
      <TabPanel value="history">
        <EntityHistory entries={entries} entityType={history.entityType} loading={loading} error={error} />
      </TabPanel>
    </Tabs>
  );
}
```

Decisions:

- **Fetch on every History activation**, not only the first. History is small (no pagination per spec); this covers story 15 (nothing fetched when opening on Details), story 16, and inline writes that do **not** close the dialog: `DependencyEditor`, #4's `CommentThread`, #6's `LinkedEvidence`. Stale entries remain visible while reloading.
- **"Successful save" closes the dialog today**: `ActionForm.onSuccess` is `onClose` in all three dialogs and `Dialog` returns `null` when closed, so `ItemDialogTabs` unmounts → tab and entries reset; reopening + History refetches. No save counter, don't change `onSuccess`.
- Footer (Cancel/Save/Delete) is hidden with the Details panel on the History tab — intended; `X`/Escape still close.

Dialog edits — wrap **only** the edit-form branch (leave `confirmDelete` branch alone), add one import each:

- `src/features/task/task-dialog.tsx` → `<ItemDialogTabs history={t ? { projectId: t.projectId, entityType: "task", entityId: t.id } : null}>` …existing `<ActionForm>`… `</ItemDialogTabs>`
- `src/features/risk/risk-dialog.tsx` → `entityType: "risk"`, `r.projectId`, `r.id`
- `src/features/milestone/milestone-dialog.tsx` → `entityType: "milestone"`, `m.projectId`, `m.id`
  Create mode passes `history={null}` → no tab bar. Our diff touches only the line before `<ActionForm` and after `</ActionForm>`; #4/#6 add inside the form body → clean merges.

### Commit 7 — `e2e + docs: history flow`

Append `test.describe("history")` to `e2e/flows.spec.ts` after the last existing flow (§3). Add to `docs/flows.md`:

```
| `history`         | Open a Task's History tab: field changes with names and dates, grouped per save, "Created" at the bottom; no tabs in create mode | [history](./history/screenshots)                 |
```

## 3. Test plan

### Vitest — `src/server/modules/activity/service.test.ts` (db_test; same setup as `tasks/service.test.ts`: `makeCtx`, `makeProject`, `closeDb`)

Fixture (`beforeAll`): `priya = peopleService.createPerson(ctx, { projectId, name: "Priya Nair" })`; `team = peopleService.createTeam(ctx, { projectId, name: "Team B" })`; `qa = statusesService.create(ctx, { projectId, scope: "task", category: "in_progress", name: "In QA", color: "#f2c94c" })`; `label = labelsService.create(ctx, { projectId, name: "backend", color: "#4ea7fc" })`; `ms = milestonesService.create(ctx, { projectId, name: "UAT begins", dueDate: "2026-10-05" })`; `todo` = default task status (check `statuses/defaults.ts`).
Scenario: `task = tasksService.create(ctx, { projectId, title: "Slips", priority: "none", dueDate: "2026-09-18" })`; **one call** `update({ id, statusId: qa.id, assigneeId: priya.id, dueDate: "2026-09-23" })`; **one call** `update({ id, statusId: todo.id })`; `statusesService.delete(ctx, qa.id)` (allowed once unused); `history = activityService.listEntityHistory(ctx, { projectId, entityType: "task", entityId: task.id })`.

1. `"returns an item's events newest first with the created event last"` — `history.at(-1).action === "created"`; `occurredAt` non-increasing; `history[0].field === "statusId"`, `newLabel === "Todo"`.
2. `"records a multi-field save as rows sharing one occurredAt"` — rows sharing the `dueDate` row's `occurredAt` have fields `["assigneeId","dueDate","statusId"]` (sorted).
3. `"enriches reference fields with current names"` — `assigneeId` row `oldLabel "empty"`, `newLabel "Priya Nair"`, `fieldLabel "Owner"`; separate task updated with `teamId`/`milestoneId`/`labelIds:[label.id]` → `"Team B"`, `"UAT begins"`, `"backend"`.
4. `"formats dates and enums for display"` — `dueDate` row `"18 Sep 2026" → "23 Sep 2026"`, `fieldLabel "Due date"`; `priority: "high"` → `"High"`.
5. `"renders a deleted Status with a (deleted) fallback"` — first update's `statusId.newLabel === \`${qa.id} (deleted)\``; second update's `oldLabel` same.
6. `"excludes events for a different item in the same project"` — create+update `other`; none of `activityRepo.forEntity(ctx.db, other.id)` ids appear in `history`.
7. `"includes comment posts and deletions for the item with their body"` — `commentsService.create({ projectId, entityType: "task", entityId: task.id, body: "Jason said Monday" })`, then `delete`; two `entityType "comment"` rows: created `newLabel "Jason said Monday"`, deleted `oldLabel "Jason said Monday"`; a comment on `other` is absent.
8. `"rejects a foreign User"` — `makeCtx()` stranger → `rejects.toBeInstanceOf(ForbiddenError)`.
9. `"returns an empty list for an unknown item in an owned project"` — random uuid → `[]`.

### Playwright — `test.describe("history")`, `const shot = shots("history")`

Task numbers reuse `max+1` after deletions, so **don't assert a key**; #4/#6 flows may have touched Task 1 → **create a fresh Task**:

```ts
test("shows an item's field changes, grouped per save, with names and dates", async ({ page }) => {
  await openProject(page, "Tasks");
  await page.getByRole("button", { name: "New task" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("tab")).toHaveCount(0); // create mode: no tabs
  await shot(page, "create-dialog-no-tabs");
  await dialog.getByLabel("Title").fill("Rotate PSP API keys");
  await dialog.getByLabel("Due date").fill("2026-09-18");
  await dialog.getByRole("button", { name: "Create task" }).click();
  await expect(dialog).toBeHidden();

  await page.getByText("Rotate PSP API keys").click();
  await expect(dialog.getByRole("tab", { name: "Details" })).toHaveAttribute("aria-selected", "true");
  await shot(page, "edit-dialog-details-tab");
  await dialog.getByRole("tab", { name: "History" }).click();
  await expect(dialog.getByText("Created", { exact: true })).toBeVisible();
  await shot(page, "history-fresh");

  await dialog.getByRole("tab", { name: "Details" }).click();
  await dialog.getByLabel("Status").selectOption({ label: "In Progress" });
  await dialog.getByLabel("Owner").selectOption({ label: "Priya Nair" });
  await dialog.getByLabel("Due date").fill("2026-09-23");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toBeHidden();

  await page.getByText("Rotate PSP API keys").click();
  await dialog.getByRole("tab", { name: "History" }).click();
  for (const t of ["Todo", "In Progress", "Priya Nair", "18 Sep 2026", "23 Sep 2026"])
    await expect(dialog.getByRole("tabpanel").getByText(t)).toBeVisible();
  await expect(dialog.getByRole("tabpanel").locator("ol > li")).toHaveCount(2); // one group per save + Created
  await expect(dialog.getByRole("tabpanel").locator("li").last()).toHaveText("Created");
  await shot(page, "history-after-save");

  await dialog.getByRole("tab", { name: "History" }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(dialog.getByRole("tab", { name: "Details" })).toHaveAttribute("aria-selected", "true");
  await shot(page, "keyboard-back-to-details");
});
```

Screenshots go to `docs/history/screenshots/` via the existing `shots()` helper. The whole flows file must run (`E2E_NO_SERVER=1 npx playwright test e2e/flows.spec.ts` with `npm run dev` on the `.env` `E2E_PORT`).

## 4. Screenshot evidence — `docs/artifacts/5-history/screenshots/`

Dev DB is seeded with the demo account (`demo@example.com` / `demo-password-123`). Throwaway Playwright script at 1440×900. **Before commit 4**: `before-task-dialog.png`, `before-risk-dialog.png`, `before-milestone-dialog.png` (fields only, no tab bar). After: `after-task-details.png`; `after-task-history.png` (group header + `Status: … → …`, `Owner: empty → …`, `Due date: … → …`, older group `Created`); `after-task-history-comment.png` (`Commented:` / `Deleted a comment:` rows); `after-risk-history.png`; `after-milestone-history.png`; `after-create-mode-no-tabs.png`; `after-history-fresh.png` (only `Created`).

## 5. Risks / ambiguities → resolutions

1. **#4 payload shape is a hard dependency.** If #4's snapshot lacks `{entityType, entityId}`, comment rows silently vanish. Commit 1 verifies; add fields + test if needed. Flag in PR.
2. **"(deleted)" shows a raw uuid.** Literal spec. Nicer follow-up: read the Status's own `status.deleted` event `entityLabel` — defer.
3. **Second-granularity grouping** may merge a comment and a save by the same actor in the same second — acceptable; spec says "to the second".
4. **Within-group order is DB-arbitrary** (equal timestamps) → client sorts by dictionary order; tests sort before comparing.
5. **Footer hidden on History tab** — accepted (read-only tab).
6. **A11y**: `TabList aria-label="Item sections"`, panels `tabIndex={0}`.
7. **Overview feed still prints raw keys** — optional follow-up via `historyField(...).label` in `entities/activity/activity-item.tsx`; not now — `overview` e2e asserts `/changed status on Task …/`.
8. **Serialisation** — `occurredAt` returned as ISO string; `relative()`/`fmtDateTime()` must accept strings (check `shared/lib/dates.ts`).
9. **#6 conflicts** — both touch the same dialogs; ours only adds a wrapper line before/after `<ActionForm>` + one import. Keep `ItemDialogTabs` outermost if #6 also wraps.

## 6. Review corrections (applied to this plan)

- There is no `activity/repository.ts`; `activityRepo` lives in `src/server/modules/activity/service.ts` — add `historyForEntity` there.
- `labelsRepo` is exported from `@/server/modules/labels/service` (no labels repository file).
- `oldValue/newValue` are already `jsonb`; drop the redundant `::jsonb` cast on the column side (keep it on the parameter).
- `groupHistory`: `indexOf` returns `-1` for unknown fields — map `-1` to `Infinity` so unknown fields sort last.
- Keep `ItemDialogTabs` OUTSIDE the `ActionForm`; #4's `CommentThread` and #6's `LinkedEvidence` stay inside it.
