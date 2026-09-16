# Plan — #6 Link Evidence to Tasks, Risks and Milestones

Branch `feat/6-evidence-links`, built **on top of #4 (Comments)**; #5 (History tabs) lands in parallel. Keep every dialog edit to one inserted JSX block so both merge cleanly.

## 1. Summary

Add an `evidence_links` join table inside the existing `evidence` module, with `link/unlink/listForEntity/listForEvidence` on `evidenceService` (idempotent, project-scoped, Activity Event recorded against the **item** with field `evidence`, plus `evidence.linked/unlinked` domain events). Tasks/Risks/Milestones delete their links inside their own `mutate` transaction via `evidenceLinksRepo.deleteForEntity`. Read model: the task list/board query gains a `linkedEvidenceCount` grouped subquery; `loadProjectRefs` gains light `evidence` summaries and the project's `evidenceLinks` (with item labels, one query) so every dialog and the Evidence page get their links from server props with no fetch-on-open. UI: a `LinkedEvidence` features section (chips + remove + inline cmdk "Add evidence" picker) mounted in the three dialogs below fields (above #4's `CommentThread`); the Evidence page gets a "Linked to" chip list + "Link item" picker and `id="evidence-<id>"` anchors; chip atoms live in `src/entities/evidence/`. Nothing here is a `<form>`: all writes call JSON server actions directly (pattern: `src/features/dependency/dependency-editor.tsx`).

Existing navigation verified: `?task=` is handled by `src/features/task/tasks-view.tsx` and `src/widgets/timeline/project-timeline.tsx`; `?risk=` by `src/features/risk/risks-view.tsx`; `?milestone=` by `project-timeline.tsx`; the Evidence page selects with `?item=` (`src/features/evidence/evidence-view.tsx`). Nothing to add for query params; only the `#evidence-<id>` anchor is new.

## 2. Changes, grouped into commit points

Each commit leaves `npm run typecheck` and `npm run lint` green. Tests are written first inside the commit that makes them pass.

### Commit 1 — `feat(evidence): evidence_links table, service and cascades`

**a. `src/shared/domain/index.ts`** — #4 added `COMMENTABLE_ENTITY_TYPES` / `CommentableEntityType`. Add aliases next to it (no new vocabulary):

```ts
/** Items an Evidence record can be linked to (same set as Comments). */
export const LINKABLE_ENTITY_TYPES = COMMENTABLE_ENTITY_TYPES;
export type LinkableEntityType = CommentableEntityType;
```

**b. `src/server/events/bus.ts`** — widen the name type (only type change):

```ts
export type DomainEventName = `${EntityType}.${ActivityAction}` | "evidence.linked" | "evidence.unlinked";
export interface DomainEvent { name: DomainEventName; /* rest unchanged */ }
subscribe(name: DomainEventName | "*", handler: EventHandler)
```

**c. `src/server/core/mutation.ts`** — smallest Recorder extension: a second queue that is published after commit but never flushed to `activity_events` (coexists with #4's `snapshot?` param):

```ts
private signals: DomainEvent[] = [];
/** Queue a domain event that has no Activity Event of its own (published after commit, not persisted). */
signal(name: DomainEventName, e: Pick<DomainEvent, "projectId" | "entityType" | "entityId" | "entityLabel" | "changes">) {
  this.signals.push({ ...e, name, action: "updated", actorId: this.actorId, occurredAt: new Date() });
}
async publish() {
  const events = [...this.pending, ...this.signals];
  this.pending = []; this.signals = [];
  await eventBus.publish(events);
}
```

**d. `src/server/modules/evidence/schema.ts`** — append (imports: `primaryKey`, `index`, `timestamp` from pg-core; `entityTypeEnum`; `projects`):

```ts
/** Many-to-many between Evidence and Tasks/Risks/Milestones. The item side is polymorphic, so its cascade is done in the item services. */
export const evidenceLinks = pgTable(
  "evidence_links",
  {
    evidenceId: text("evidence_id")
      .notNull()
      .references(() => evidence.id, { onDelete: "cascade" }),
    entityType: entityTypeEnum("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    /** Denormalised for cheap ownership checks and per-project listing. */
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.evidenceId, t.entityType, t.entityId] }),
    index("evidence_links_entity_idx").on(t.entityType, t.entityId),
    index("evidence_links_project_idx").on(t.projectId),
  ],
);
export type EvidenceLinkRow = typeof evidenceLinks.$inferSelect;
export type NewEvidenceLinkRow = typeof evidenceLinks.$inferInsert;
```

`src/server/db/schema.ts` already re-exports `evidence/schema` — nothing to add. Run `npx drizzle-kit generate --name evidence_links` → `drizzle/0002_evidence_links.sql` + snapshot + journal entry (#4's is `0001_comments`). Never hand-edit the journal. Then `npm run db:migrate` (dev) — Vitest global setup migrates `db_test`.

**e. `src/server/modules/evidence/validation.ts`** — append:

```ts
export const evidenceLinkSchema = z.object({
  projectId: z.string(),
  evidenceId: z.string(),
  entityType: z.enum(LINKABLE_ENTITY_TYPES),
  entityId: z.string(),
});
export type EvidenceLinkInput = z.infer<typeof evidenceLinkSchema>;
```

**f. `src/server/modules/evidence/repository.ts`** — add `evidenceLinksRepo` (imports `and`, `sql`, `asc`; `tasks`, `risks`, `milestones` schemas — schema-only imports, no cycle):

```ts
const linkKey = (k: Pick<EvidenceLinkRow, "evidenceId" | "entityType" | "entityId">) =>
  and(
    eq(evidenceLinks.evidenceId, k.evidenceId),
    eq(evidenceLinks.entityType, k.entityType),
    eq(evidenceLinks.entityId, k.entityId),
  );

/** Links with both sides labelled in one query (polymorphic side via three left joins). */
const withLabels = (db: DbOrTx) =>
  db
    .select({
      evidenceId: evidenceLinks.evidenceId,
      entityType: evidenceLinks.entityType,
      entityId: evidenceLinks.entityId,
      projectId: evidenceLinks.projectId,
      createdAt: evidenceLinks.createdAt,
      evidenceTitle: evidence.title,
      evidenceKind: evidence.kind,
      evidenceSourceDate: evidence.sourceDate,
      entityLabel: sql<string>`coalesce(${tasks.title}, ${risks.title}, ${milestones.name}, '')`,
      entityNumber: sql<number | null>`coalesce(${tasks.number}, ${risks.number})`,
    })
    .from(evidenceLinks)
    .innerJoin(evidence, eq(evidence.id, evidenceLinks.evidenceId))
    .leftJoin(tasks, and(eq(evidenceLinks.entityType, "task"), eq(tasks.id, evidenceLinks.entityId)))
    .leftJoin(risks, and(eq(evidenceLinks.entityType, "risk"), eq(risks.id, evidenceLinks.entityId)))
    .leftJoin(milestones, and(eq(evidenceLinks.entityType, "milestone"), eq(milestones.id, evidenceLinks.entityId)));

export const evidenceLinksRepo = {
  listForProject: (db, projectId) =>
    withLabels(db)
      .where(eq(evidenceLinks.projectId, projectId))
      .orderBy(desc(evidence.sourceDate), asc(evidenceLinks.createdAt)),
  listForEntity: (db, entityType: LinkableEntityType, entityId) =>
    withLabels(db)
      .where(and(eq(evidenceLinks.entityType, entityType), eq(evidenceLinks.entityId, entityId)))
      .orderBy(desc(evidence.sourceDate), asc(evidenceLinks.createdAt)),
  listForEvidence: (db, evidenceId) =>
    withLabels(db).where(eq(evidenceLinks.evidenceId, evidenceId)).orderBy(asc(evidenceLinks.createdAt)),
  find: async (db, key) => (await db.select().from(evidenceLinks).where(linkKey(key)))[0],
  /** Returns undefined when the pair already existed (composite PK conflict). */
  insertIgnore: async (db, values: NewEvidenceLinkRow) =>
    (await db.insert(evidenceLinks).values(values).onConflictDoNothing().returning())[0],
  delete: (db, key) => db.delete(evidenceLinks).where(linkKey(key)).returning(),
  /** Called by the task/risk/milestone services inside their delete transaction. */
  deleteForEntity: (db, entityType: LinkableEntityType, entityId) =>
    db.delete(evidenceLinks).where(and(eq(evidenceLinks.entityType, entityType), eq(evidenceLinks.entityId, entityId))),
  /** Picker data for the Evidence page: every linkable item in the project, three cheap selects. */
  listTargets: async (db, projectId): Promise<LinkTarget[]> => {
    /* select id,number,title from tasks; id,number,title from risks; id,name from milestones; map to { entityType, entityId, label, number } */
  },
  /** Light rows for the item-dialog picker. */
  listSummaries: (db, projectId) =>
    db
      .select({ id: evidence.id, title: evidence.title, kind: evidence.kind, sourceDate: evidence.sourceDate })
      .from(evidence)
      .where(eq(evidence.projectId, projectId))
      .orderBy(desc(evidence.sourceDate), desc(evidence.createdAt)),
};
export type ProjectEvidenceLink = Awaited<ReturnType<typeof evidenceLinksRepo.listForProject>>[number];
export type EvidenceSummary = Awaited<ReturnType<typeof evidenceLinksRepo.listSummaries>>[number];
export interface LinkTarget {
  entityType: LinkableEntityType;
  entityId: string;
  label: string;
  number: number | null;
}
```

(Check the real column names in `evidence/schema.ts` — `sourceDate`, `kind`, `title` — and adapt.)

**g. `src/server/modules/evidence/service.test.ts`** (new — write first, watch it fail) — see §3 for names. Setup mirrors `tasks/service.test.ts`: `makeCtx`, `makeProject`, `afterAll(closeDb)`; create Evidence with `evidenceService.create(...)` using a body-only variant (check the create input shape; body-only → no storage call).

**h. `src/server/modules/evidence/service.ts`** — imports `tasksRepo`, `risksRepo`, `milestonesRepo`, `labelFor`, `evidenceLinksRepo`, `EvidenceLinkInput`, `LinkableEntityType`. Helper + methods on `evidenceService`:

```ts
/** The linked item must exist in `projectId`; returns its display label (title/name). */
async function linkedItemLabel(db: DbOrTx, projectId: string, entityType: LinkableEntityType, entityId: string) {
  const row = entityType === "task" ? await tasksRepo.findById(db, entityId)
    : entityType === "risk" ? await risksRepo.findById(db, entityId) : await milestonesRepo.findById(db, entityId);
  if (!row || row.projectId !== projectId) throw new ValidationError(`${labelFor(entityType)} not in this project`, { entityId: ["Invalid"] });
  return "name" in row ? row.name : row.title;
}
async function ownedEvidenceInProject(db, projectId, evidenceId) { const e = await evidenceRepo.findById(db, evidenceId); if (!e || e.projectId !== projectId) throw new ValidationError("Evidence not in this project", { evidenceId: ["Invalid"] }); return e; }

link: (ctx, input: EvidenceLinkInput) => mutate(ctx, async (tx, rec) => {
  await assertOwnsProject(tx, ctx.userId, input.projectId);
  const ev = await ownedEvidenceInProject(tx, input.projectId, input.evidenceId);
  const itemLabel = await linkedItemLabel(tx, input.projectId, input.entityType, input.entityId);
  const inserted = await evidenceLinksRepo.insertIgnore(tx, input);
  if (!inserted) return (await evidenceLinksRepo.find(tx, input))!;          // idempotent: no Activity Event, no event
  rec.updated(input.entityType, input.projectId, input.entityId, itemLabel, [{ field: "evidence", oldValue: null, newValue: ev.title }]);
  rec.signal("evidence.linked", { projectId: input.projectId, entityType: "evidence", entityId: ev.id, entityLabel: ev.title,
    changes: [{ field: "link", oldValue: null, newValue: { entityType: input.entityType, entityId: input.entityId } }] });
  return inserted;
}),
unlink: (ctx, input) => mutate(ctx, async (tx, rec) => {
  await assertOwnsProject(tx, ctx.userId, input.projectId);
  const ev = await ownedEvidenceInProject(tx, input.projectId, input.evidenceId);
  const itemLabel = await linkedItemLabel(tx, input.projectId, input.entityType, input.entityId);
  const removed = await evidenceLinksRepo.delete(tx, input);
  if (!removed.length) return;                                                // no-op success
  rec.updated(input.entityType, input.projectId, input.entityId, itemLabel, [{ field: "evidence", oldValue: ev.title, newValue: null }]);
  rec.signal("evidence.unlinked", { …same shape, changes: [{ field: "link", oldValue: { entityType, entityId }, newValue: null }] });
}),
listForEntity: async (ctx, projectId, entityType, entityId) => { await assertOwnsProject(ctx.db, ctx.userId, projectId); return evidenceLinksRepo.listForEntity(ctx.db, entityType, entityId); },
listForEvidence: async (ctx, evidenceId) => { const e = await getOwned(ctx.db, ctx.userId, evidenceId); return evidenceLinksRepo.listForEvidence(ctx.db, e.id); },
listLinkTargets: async (ctx, projectId) => { await assertOwnsProject(ctx.db, ctx.userId, projectId); return evidenceLinksRepo.listTargets(ctx.db, projectId); },
```

No Activity Event is recorded against the Evidence itself (issue). The Overview feed renders the item event via `describeActivity` with no change needed.

**i. Cascades** — one line each, placed directly **after** #4's `commentsRepo.deleteForEntity(...)` line and before the row delete:

- `src/server/modules/tasks/service.ts` `delete`: `await evidenceLinksRepo.deleteForEntity(tx, "task", id);`
- `src/server/modules/risks/service.ts` `delete`: `await evidenceLinksRepo.deleteForEntity(tx, "risk", id);`
- `src/server/modules/milestones/service.ts` `delete`: `await evidenceLinksRepo.deleteForEntity(tx, "milestone", id);`

Import `evidenceLinksRepo` from `@/server/modules/evidence/repository` (service → foreign repository is the existing pattern). Run `npm test` — the evidence test file goes green; existing suites unaffected.

### Commit 2 — `feat(evidence): link actions and read model`

**a. `src/server/modules/evidence/actions.ts`** — JSON actions (pickers are not forms):

```ts
export async function linkEvidenceAction(input: z.input<typeof evidenceLinkSchema>) {
  const res = await runAction(evidenceLinkSchema, input, (ctx, i) => evidenceService.link(ctx, i));
  if (res.ok) revalidateProject(input.projectId);
  return res;
}
export async function unlinkEvidenceAction(input: z.input<typeof evidenceLinkSchema>) {
  /* same with evidenceService.unlink */
}
```

**b. `src/server/modules/tasks/repository.ts`** — linked-Evidence count in `withJoins` (coexists with #4's comment-count join; add a second aliased subquery):

```ts
const evidenceCounts = db
  .select({ entityId: evidenceLinks.entityId, n: sql<number>`count(*)::int`.as("n") })
  .from(evidenceLinks)
  .where(eq(evidenceLinks.entityType, "task"))
  .groupBy(evidenceLinks.entityId)
  .as("evidence_counts");
// in withJoins: …select({ …, linkedEvidenceCount: sql<number>`coalesce(${evidenceCounts.n}, 0)`.mapWith(Number) }) … .leftJoin(evidenceCounts, eq(evidenceCounts.entityId, tasks.id))
```

`TaskListItem` now carries `linkedEvidenceCount: number`.

**c. `src/server/modules/projects/refs.ts`** — add two entries to the `Promise.all` and the return: `evidence: evidenceLinksRepo.listSummaries(ctx.db, projectId)` and `evidenceLinks: evidenceLinksRepo.listForProject(ctx.db, projectId)`. This is how all three dialogs and the Evidence page receive links as server props (no fetch on open; the DependencyEditor already receives `dependencies` the same way). Trade-off noted in §5.

**d. `src/app/(app)/projects/[projectId]/evidence/page.tsx`** — add `evidenceService.listLinkTargets(ctx, projectId)` to the `Promise.all`, pass `targets={targets}` to `EvidenceView`. Do this in Commit 4 (when `EvidenceView` accepts the prop).

### Commit 3 — `feat(evidence): LinkedEvidence section in item dialogs`

**a. `src/shared/ui/command-picker.tsx`** (new, exported from `src/shared/ui/index.ts`) — inline (not popover: the Dialog body is `overflow-y-auto` and would clip) cmdk panel:

```tsx
export interface CommandPickerItem { id: string; label: string; hint?: string; keywords?: string[]; icon?: React.ReactNode }
export function CommandPicker({ items, placeholder, emptyText = "No matches.", onPick, onCancel, autoFocus = true }: {...}) {
  return (
    <div className="rounded-md border border-hairline bg-surface-1"
         onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); if (e.key === "Escape") { e.stopPropagation(); onCancel(); } }}>
      <Command label={placeholder}>
        <Command.Input autoFocus={autoFocus} placeholder={placeholder} className="h-8 w-full border-b border-hairline bg-transparent px-3 text-body-sm text-ink placeholder:text-ink-tertiary focus:outline-none" />
        <Command.List className="max-h-48 overflow-y-auto p-1">
          <Command.Empty className="px-2 py-4 text-center text-caption text-ink-subtle">{emptyText}</Command.Empty>
          {items.map((it) => (
            <Command.Item key={it.id} value={it.id} keywords={[it.label, ...(it.keywords ?? [])]} onSelect={() => onPick(it.id)}
              className="flex h-8 cursor-pointer items-center gap-2 rounded-sm px-2 text-body-sm text-ink-muted data-[selected=true]:bg-surface-3 data-[selected=true]:text-ink">
              {it.icon}<span className="truncate">{it.label}</span>{it.hint && <span className="ml-auto font-mono text-[10px] text-ink-tertiary">{it.hint}</span>}
            </Command.Item>))}
        </Command.List>
      </Command>
    </div>);
}
```

`Enter` is prevented at the wrapper so the enclosing `ActionForm` never submits implicitly. `Escape` is stopped so the Dialog's Escape handler does not close the whole dialog. Styles reuse `src/widgets/command-palette/command-palette.tsx`. Note cmdk's default filter matches on `value` + `keywords`; since `value` is an opaque id, matching relies on `keywords` — verify "R-1" and "UAT begins" hit; if not, pass `shouldFilter={false}` and filter `items` yourself from `Command.Input onValueChange`.

**b. `src/entities/evidence/evidence-chip.tsx`** (new) — move `KIND_COLOR` out of `evidence-view.tsx` as `export const EVIDENCE_KIND_COLOR` (update the import in `evidence-view.tsx`). Atoms:

- `EvidenceChip({ title, kind, href, onRemove?, disabled? })` → `<span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface-2 py-0.5 pl-2 pr-1 text-caption">` with kind dot, `<Link href className="truncate text-ink hover:underline">{title}</Link>`, `<span className="text-ink-tertiary">{labelFor(kind)}</span>`, and when `onRemove` a `<button type="button" aria-label={`Unlink ${title}`}>` with `X` (size-3, `text-ink-tertiary hover:text-tag-red`).
- `LinkedEvidenceCount({ count })` → returns null when 0; else `<span className="inline-flex items-center gap-1 text-caption text-ink-tertiary" aria-label={`${count} linked evidence`} title=…><Link2 className="size-3" />{count}</span>`.

**c. `src/entities/evidence/linked-item-chip.tsx`** (new) — `LinkedItemChip({ entityType, label, keyText, href, onRemove? })`: icon by type (`ListTodo` task, `AlertTriangle` risk, `Diamond` milestone), mono `keyText` (`${project.key}-${n}` / `R-${n}` / none), label, remove button `aria-label={`Unlink ${[keyText, label].filter(Boolean).join(" ")}`}`. Export helper `itemHref(projectId, entityType, entityId)` → `/projects/${p}/tasks?task=${id}` | `/projects/${p}/risks?risk=${id}` | `/projects/${p}/timeline?milestone=${id}` and `evidenceHref(projectId, evidenceId)` → `/projects/${p}/evidence?item=${id}#evidence-${id}`.

**d. `src/features/evidence/linked-evidence.tsx`** (new, `"use client"`):

```tsx
export function LinkedEvidence({ refs, item }: { refs: ProjectRefs; item: { type: LinkableEntityType; id: string } }) {
  const links = refs.evidenceLinks.filter((l) => l.entityType === item.type && l.entityId === item.id);
  const linkedIds = new Set(links.map((l) => l.evidenceId));
  const options = refs.evidence.filter((e) => !linkedIds.has(e.id)); // US 7: already linked hidden
  const [adding, setAdding] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function call(action, evidenceId) {
    setPending(true);
    setError(null);
    const res = await action({ projectId: refs.project.id, evidenceId, entityType: item.type, entityId: item.id });
    setPending(false);
    if (!res.ok) setError(res.error);
    else setAdding(false);
  }
  // Not a <form>: rendered inside the item ActionForm (see dependency-editor.tsx).
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-hairline bg-surface-1 p-3">
      <div className="flex items-center justify-between">
        <span className="text-caption font-medium text-ink-subtle">Linked evidence</span>
        <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(true)} disabled={!options.length}>
          <Plus className="size-3.5" /> Add evidence
        </Button>
      </div>
      {links.length === 0 && !adding && <p className="px-1 text-caption text-ink-tertiary">No linked evidence</p>}
      <div className="flex flex-wrap gap-1.5">
        {links.map((l) => (
          <EvidenceChip
            key={l.evidenceId}
            title={l.evidenceTitle}
            kind={l.evidenceKind}
            href={evidenceHref(refs.project.id, l.evidenceId)}
            disabled={pending}
            onRemove={() => call(unlinkEvidenceAction, l.evidenceId)}
          />
        ))}
      </div>
      {adding && (
        <CommandPicker
          placeholder="Search evidence…"
          items={options.map((e) => ({ id: e.id, label: e.title, hint: labelFor(e.kind), keywords: [e.kind] }))}
          onPick={(id) => call(linkEvidenceAction, id)}
          onCancel={() => setAdding(false)}
        />
      )}
      {error && <p className="text-caption text-tag-red">{error}</p>}
    </div>
  );
}
```

**e. Dialog mounts — one block each, edit-mode only, below fields, above `CommentThread` (#4):**

- `src/features/task/task-dialog.tsx` after the `DependencyEditor` block: `{t && <LinkedEvidence refs={refs} item={{ type: "task", id: t.id }} />}`
- `src/features/risk/risk-dialog.tsx` before `CommentThread`: `{r && <LinkedEvidence refs={refs} item={{ type: "risk", id: r.id }} />}`
- `src/features/milestone/milestone-dialog.tsx` after `DependencyEditor`: `{m && <LinkedEvidence refs={refs} item={{ type: "milestone", id: m.id }} />}`

`refs` is already a prop of all three dialogs, so no signature changes.

**f. Counts** — `src/features/task/task-list.tsx` `TaskRow`: next to #4's `CommentCount` add `<LinkedEvidenceCount count={item.linkedEvidenceCount} />`. `src/features/task/task-board.tsx` card: same, next to `CommentCount`.

### Commit 4 — `feat(evidence): Linked-to chips and Link-item picker on the Evidence page`

**a. `src/features/evidence/linked-items.tsx`** (new, `"use client"`) — `LinkedItems({ refs, evidenceId, targets }: { refs: ProjectRefs; evidenceId: string; targets: LinkTarget[] })`. Same skeleton as `LinkedEvidence`: `links = refs.evidenceLinks.filter(l => l.evidenceId === evidenceId)`; options = `targets` minus linked pairs; picker items `{ id: `${t.entityType}:${t.entityId}`, label: t.label, hint: keyText, keywords: [keyText, t.entityType] }` where `keyText = t.entityType === "task" ? `${refs.project.key}-${t.number}`: t.entityType === "risk" ?`R-${t.number}` : ""` (US 12: "ACME-12" and "UAT begins" both match). Header "Linked to", button "Link item", placeholder "Search tasks, risks, milestones…", empty text "Not linked to any item". Chips: `LinkedItemChip` with `href={itemHref(...)}` and `onRemove → unlinkEvidenceAction`.

**b. `src/features/evidence/evidence-view.tsx`**:

- signature gains `targets: LinkTarget[]`;
- list `<li key={e.id} id={`evidence-${e.id}`}>` (anchor target) and in the row meta line add `<LinkedEvidenceCount count={refs.evidenceLinks.filter((l) => l.evidenceId === e.id).length} />` (US 13 coverage-at-a-glance in the narrow list);
- detail pane: directly under the header, before the body, insert `<div className="border-b border-hairline px-6 py-3"><LinkedItems refs={refs} evidenceId={selected.id} targets={targets} /></div>`;
- import `EVIDENCE_KIND_COLOR` from entities (Commit 3b).

**c. `src/app/(app)/projects/[projectId]/evidence/page.tsx`** — load `targets` via `evidenceService.listLinkTargets(ctx, projectId)` in the `Promise.all`, pass prop.

### Commit 5 — `test(e2e): evidence-links flow, docs`

`e2e/flows.spec.ts` (insert a `test.describe("evidence-links")` between `evidence` and `overview`, or append after the last flow if simpler — but it must run before `overview` only if you assert on the feed there; we don't), `docs/flows.md` row, screenshots into `docs/artifacts/6-evidence-links/screenshots/`. Details in §3–§4.

## 3. Test plan

### Vitest — `src/server/modules/evidence/service.test.ts` (`describe("evidenceService links")`)

1. `"links Evidence to a Task and a Risk and lists it from both sides"` — create task + risk + evidence; `link` twice; `listForEntity(ctx, projectId, "task", task.id)` has 1 row with `evidenceTitle`; `listForEvidence(ctx, ev.id)` has 2 rows whose `entityLabel`s are the task title and risk title and `entityNumber`s are set.
2. `"treats linking the same pair twice as a no-op with one row and one Activity Event"` — link same pair twice; `listForEntity` length 1; `activityRepo.forEntity(ctx.db, task.id)` has exactly one `updated` event with `field === "evidence"`.
3. `"rejects Evidence from a different Project"` — `makeProject(ctx, "OTH")`, evidence there, `link({ projectId, … })` → `rejects.toBeInstanceOf(ValidationError)`; also a Task from the other project with local Evidence → `ValidationError`.
4. `"removes links when the Evidence is deleted"` — link; `evidenceService.delete(ctx, ev.id)`; `listForEntity` → `[]` (FK cascade).
5. `"removes links when the Task is deleted"` — link; `tasksService.delete(ctx, task.id)`; `listForEvidence` → `[]` (`deleteForEntity` in the transaction).
6. `"records updated Activity Events on the Task for link and unlink and publishes evidence.linked/unlinked"` — subscribe `eventBus.subscribe("evidence.linked" | "evidence.unlinked")`; link then unlink; `activityRepo.forEntity(task.id)` `updated` events with `field: "evidence"`: first `{ oldValue: null, newValue: ev.title }`, second `{ oldValue: ev.title, newValue: null }`, `entityLabel === task.title`; received events: `entityType "evidence"`, `entityId ev.id`, `changes[0].newValue` / `oldValue` `toEqual({ entityType: "task", entityId: task.id })`.
7. `"refuses a foreign User"` — `const stranger = await makeCtx()`; `link` and `listForEntity` with `stranger` → `rejects.toBeInstanceOf(ForbiddenError)`.

### Playwright — `e2e/flows.spec.ts` `test.describe("evidence-links")`, `const shot = shots("evidence-links")`

State left by the serial run: Tasks `${key}-1 Implement v2 endpoints`, `${key}-2 Load-test the new gateway`; Milestone `UAT begins`; Risks `R-1 Vendor access delay blocks testing` (open), `R-2` (closed); Evidence: only `Weekly sync minutes — 12 Sep` remains after the `evidence` flow (`Cutover plan v1` was deleted). Verify these names in the spec before writing.

```ts
test("links evidence to a task from both sides and unlinks it", async ({ page }) => {
  await openProject(page, "Tasks");
  await page.getByText("Implement v2 endpoints").first().click();
  const dialog = page.getByRole("dialog", { name: `${key}-1` });
  await expect(dialog.getByText("No linked evidence")).toBeVisible();
  await shot(page, "task-dialog-before-link");
  await dialog.getByRole("button", { name: "Add evidence" }).click();
  await dialog.getByPlaceholder("Search evidence…").fill("Weekly");
  await dialog.getByRole("option", { name: /Weekly sync minutes/ }).click();
  await expect(dialog.getByRole("link", { name: "Weekly sync minutes — 12 Sep" })).toBeVisible();
  await shot(page, "task-dialog-linked");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByLabel("1 linked evidence")).toBeVisible(); // row count
  await shot(page, "list-row-count");

  await page.getByRole("link", { name: "Evidence", exact: true }).click();
  await expect(page).toHaveURL(/\/evidence$/);
  await expect(page.getByRole("link", { name: `${key}-1 Implement v2 endpoints` })).toBeVisible();
  await shot(page, "evidence-linked-to");

  // Link a Risk from the Evidence side by key.
  await page.getByRole("button", { name: "Link item" }).click();
  await page.getByPlaceholder("Search tasks, risks, milestones…").fill("R-1");
  await page.getByRole("option", { name: /Vendor access delay/ }).click();
  await expect(page.getByRole("link", { name: "R-1 Vendor access delay blocks testing" })).toBeVisible();
  await shot(page, "evidence-linked-risk");

  // Unlink the Task from the Evidence side.
  await page.getByRole("button", { name: `Unlink ${key}-1 Implement v2 endpoints` }).click();
  await expect(page.getByRole("link", { name: `${key}-1 Implement v2 endpoints` })).toBeHidden();
  await shot(page, "evidence-after-unlink");

  // Chip navigation opens the Risk dialog.
  await page.getByRole("link", { name: "R-1 Vendor access delay blocks testing" }).click();
  await expect(page.getByRole("dialog", { name: "R-1" })).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("link", { name: "Weekly sync minutes — 12 Sep" })).toBeVisible();
  await shot(page, "risk-dialog-from-chip");

  await page.getByRole("link", { name: "Tasks", exact: true }).click();
  await page.getByText("Implement v2 endpoints").first().click();
  await expect(page.getByRole("dialog").getByText("No linked evidence")).toBeVisible();
  await shot(page, "task-dialog-unlinked");
});
```

Chip `<Link>` accessible name = `keyText + " " + label` because both are text children of the same anchor; keep them inside the `<a>`, with the remove button as a sibling. The whole flows file must run (`E2E_NO_SERVER=1 npx playwright test e2e/flows.spec.ts` with `npm run dev` on the `.env` `E2E_PORT`).

`docs/flows.md` — add after the `evidence` row:

`| \`evidence-links\` | Link Evidence to a Task from its dialog, see the chip and the row count, see the Task chip on the Evidence page, link a Risk by key, unlink from the Evidence side, chip opens the item | [evidence-links](./evidence-links/screenshots) |`

## 4. Screenshot evidence plan — `docs/artifacts/6-evidence-links/screenshots/`

Dev DB is seeded with the demo account (`demo@example.com` / `demo-password-123`). Before implementing (throwaway Playwright script, 1440×900): `before-task-dialog.png` (Task edit dialog, no linked section), `before-evidence-page.png` (Evidence detail pane, no "Linked to"), `before-task-list.png` (rows without count). After Commit 5's e2e run copy from `docs/evidence-links/screenshots/`: `after-task-dialog-linked.png`, `after-list-row-count.png`, `after-evidence-linked-to.png`, `after-evidence-linked-risk.png`, `after-evidence-after-unlink.png`, `after-risk-dialog-from-chip.png`. Also `after-overview-feed.png`: Overview showing the `evidence` field change on the Task.

## 5. Risks / ambiguities and recommended resolutions

1. **Nested forms.** All three dialogs are one `ActionForm`; `<form>` inside is invalid HTML and would submit the parent. Resolution: `LinkedEvidence`/`LinkedItems`/`CommandPicker` render no `<form>`, every button is `type="button"`, writes call the JSON actions directly with local `pending` state (exactly `dependency-editor.tsx`); `Enter` inside the picker is `preventDefault`ed at the wrapper.
2. **Where dialogs get their links.** Issue says "part of the item's detail payload". Resolution: `refs.evidenceLinks` + `refs.evidence` (server-fetched, one query each, no fetch-on-open, dialogs already take `refs`). Cost: two small extra queries on every project page; acceptable. Flag in PR description.
3. **Domain event names.** `DomainEvent.name` is derived `${entityType}.${action}` and `ACTIVITY_ACTIONS` is also a pg enum, so adding `linked/unlinked` there would need a migration and pollute Activity. Resolution: widen the name type in `bus.ts` and add `Recorder.signal()`.
4. **Migration ordering with #4.** #4's is `0001_comments`; generate `0002_evidence_links` on this branch (which already contains #4). Never hand-edit `_journal.json`.
5. **Merge conflicts with #5.** Dialog bodies: one inserted line each inside the form; #5 wraps the form. Clean.
6. **Evidence page layout.** Master-detail, narrow list column, so full chips per row would wrap badly. Resolution: count glyph on each list row (US 13) and full chips + picker in the detail pane. Anchor `#evidence-<id>` on the list `<li>`; chip hrefs carry both `?item=` (selects) and the hash (scrolls). Escape inside the picker must not close the dialog — `stopPropagation` in `CommandPicker`.
7. **Deleted-item labels.** `withLabels` returns `''` for a link whose item vanished mid-request; UI chips fall back to `labelFor(entityType)`.
8. **Activity field label.** `describeActivity` renders the field key as "evidence"; #5 introduces a shared field-label dictionary that already maps `evidence` → "Evidence".

## 6. Review corrections (applied to this plan)

- Widen `DomainEventName` in `bus.ts` BEFORE adding `Recorder.signal()` (type prerequisite). #4's `DomainEvent.snapshot?` already exists on this branch; keep both.
- `evidence.sourceDate` is nullable: order pickers/links by `coalesce(sourceDate, createdAt) desc` (or `desc(createdAt)` tie-breaker) so nulls do not float first.
- Add `evidence: "evidence"` to `HUMAN_FIELDS` in `src/entities/activity/activity-item.tsx` (check its shape) so the Overview feed reads "changed evidence on Task …".
- Update `src/app/(app)/projects/[projectId]/evidence/page.tsx` in the same commit as the `EvidenceView` signature change.
- `LinkedEvidenceCount` aria-label (`"N linked evidence"`) must stay distinct from #4's `CommentCount` (`"N comments"`).
- `evidenceService.create(ctx, input, file?)` — the `file` argument is optional; use body-only Evidence in tests.
