# Plan — #4 Comments on Tasks, Risks and Milestones

Branch: `feat/4-comments` (worktree `4-comments`). Issue: GitHub #4. Follow-ups that build on this branch: #5 (History tab), #6 (Evidence links).

## 1. Summary and vocabulary

Add a **Comment**: a short, plain-text, dated statement attached to exactly one Task, Risk or Milestone, optionally attributed to a Person ("said by") and dated to when it was said ("said on", distinct from `createdAt`). Comments are immutable; they can be deleted, and the deletion Activity Event carries the original body. Comments are written from the item dialogs, counted on Task rows/cards, and surface in the Project Overview "Recent changes" feed via the existing `ActivityRow`.

New module `src/server/modules/comments/` (schema, validation, repository, service, actions — ADR 0005 layout), one `CommentThread` feature component, two entities atoms (`CommentCount`, `CommentBody`), one enum migration.

**CONTEXT.md** — append after the `### Evidence` section (end of file):

```md
### Discussion

**Comment**:
A short, plain-text, dated statement attached to one Task, Risk or Milestone, optionally attributed to the Person who said it ("said by") and dated to when it was said ("said on"). Immutable once posted; may be deleted, in which case the item's history keeps the body.
_Avoid_: Message, note, remark, update
```

Key design facts discovered in the codebase that shape this plan:

- `Recorder.created/deleted` (`src/server/core/mutation.ts:17-27`) take no payload and `flush` writes only `base` for non-`updated` rows, so "include the body in `oldValue`" needs a small additive extension (see C2).
- The three dialogs are each ONE `ActionForm` (`<form>`); HTML forbids nested forms. `DependencyEditor` (`src/features/dependency/dependency-editor.tsx:52-53`) already solves this by rendering buttons + JSON actions instead of a `<form>`. `CommentThread` follows the same pattern.
- Dialogs are hosted by three pages (`tasks`, `timeline`, `risks`) and receive list rows, not detail payloads. Comments are therefore fetched client-side by `CommentThread` via a `listCommentsAction` (the same "route-less server function via `runAction`" approach issue #5 prescribes for History), not threaded through page props.
- `people.saidById` with `onDelete: "set null"` makes "removed Person" indistinguishable from "never attributed". To satisfy story 17 ("Unknown person") a nullable snapshot column `saidByName` is added (see §6).

## 2. Commit points (each leaves `npm run typecheck` + `npm run lint` green)

### C1 — `feat(comments): vocabulary, schema and entity_type enum migration`

Files:

- `CONTEXT.md` — add the Discussion section above.
- `src/shared/domain/index.ts`
  - `ENTITY_TYPES`: append `"comment"` as the **last** element (appending makes drizzle-kit emit `ALTER TYPE … ADD VALUE` instead of recreating the type).
  - Add after `EntityType`:
    ```ts
    /** Entity types a Comment (and, later, an Evidence link) may attach to. */
    export const COMMENTABLE_ENTITY_TYPES = ["task", "risk", "milestone"] as const satisfies readonly EntityType[];
    export type CommentableEntityType = (typeof COMMENTABLE_ENTITY_TYPES)[number];
    export const COMMENT_MAX_LENGTH = 4000;
    ```
- `src/server/modules/comments/schema.ts` (new):
  ```ts
  export const comments = pgTable(
    "comments",
    {
      id: id(),
      projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
      /** Polymorphic target; same shape as activity_events. Validation restricts to COMMENTABLE_ENTITY_TYPES. */
      entityType: entityTypeEnum("entity_type").notNull(),
      entityId: text("entity_id").notNull(),
      body: text("body").notNull(),
      saidById: text("said_by_id").references(() => people.id, { onDelete: "set null" }),
      /** Name of the Person at posting time so attribution survives their removal ("Unknown person"). */
      saidByName: text("said_by_name"),
      saidOn: date("said_on"),
      authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [index("comments_entity_idx").on(t.entityType, t.entityId), index("comments_project_idx").on(t.projectId)],
  );
  export type CommentRow = typeof comments.$inferSelect;
  export type NewCommentRow = typeof comments.$inferInsert;
  ```
  Imports: `id` from `@/server/db/columns` (NOT `timestamps` — no `updatedAt`), `entityTypeEnum` from `@/server/db/enums`, `people` from `@/server/modules/people/schema`, `projects` from `@/server/modules/projects/schema`, `user` from `@/server/auth/schema`.
- `src/server/db/schema.ts` — add `export * from "@/server/modules/comments/schema";` after the risks line (drizzle-kit reads this file, `drizzle.config.ts:6`).
- Migration: run `npx drizzle-kit generate --name comments`. Expect `drizzle/0001_comments.sql` containing `ALTER TYPE "public"."entity_type" ADD VALUE 'comment';` followed by `CREATE TABLE "comments" (...)`, the FKs to `projects`/`people`/`user` and the two indexes, plus `drizzle/meta/0001_snapshot.json` and a new entry in `drizzle/meta/_journal.json`. Inspect the SQL; if drizzle-kit emitted a type-recreate sequence instead of `ADD VALUE`, `"comment"` was not appended last. Then `npm run db:migrate` for the dev DB (Vitest's `src/test/global-setup.ts` migrates `db_test` automatically). Postgres 17 accepts `ADD VALUE` inside the migrator transaction because the new value is not used in the same transaction.

Tests: none (pure schema); `npm run typecheck && npm run lint` must pass.

### C2 — `feat(comments): service, repository and validation; cascade from item deletes`

TDD: write `src/server/modules/comments/service.test.ts` first (fails on missing module), then implement until green with `npx vitest run src/server/modules/comments`.

Files:

- `src/server/modules/comments/validation.ts` (new):

  ```ts
  const body = z
    .string()
    .trim()
    .min(1, "Comment is required")
    .max(COMMENT_MAX_LENGTH, "Comment is too long (max 4,000 characters)");
  export const createCommentSchema = z.object({
    projectId: z.string(),
    entityType: z.enum(COMMENTABLE_ENTITY_TYPES),
    entityId: z.string(),
    body,
    saidById: optionalId,
    saidOn: optionalDate,
  });
  export const listCommentsSchema = z.object({
    projectId: z.string(),
    entityType: z.enum(COMMENTABLE_ENTITY_TYPES),
    entityId: z.string(),
  });
  export const deleteCommentSchema = z.object({ id: z.string() });
  export type CreateCommentInput = z.infer<typeof createCommentSchema>;
  export type ListCommentsInput = z.infer<typeof listCommentsSchema>;
  ```

  (`optionalId`, `optionalDate` from `@/server/core/validation` — check their exact names there.)

- `src/server/modules/comments/repository.ts` (new) — `commentsRepo`:

  ```ts
  listForEntity: (db: DbOrTx, projectId: string, entityType: CommentableEntityType, entityId: string) =>
    db.select({ comment: comments, saidBy: { id: people.id, name: people.name }, authorName: user.name })
      .from(comments)
      .leftJoin(people, eq(people.id, comments.saidById))
      .leftJoin(user, eq(user.id, comments.authorId))
      .where(and(eq(comments.projectId, projectId), eq(comments.entityType, entityType), eq(comments.entityId, entityId)))
      .orderBy(asc(comments.createdAt), asc(comments.id)),
  findById: async (db, id): Promise<CommentRow | undefined>,
  insert: async (db, values: NewCommentRow) => row,
  delete: (db, id) => db.delete(comments).where(eq(comments.id, id)),
  /** Remove every Comment on an item; called by the item's own service inside its delete transaction. */
  deleteForEntity: (db: DbOrTx, entityType: CommentableEntityType, entityId: string) =>
    db.delete(comments).where(and(eq(comments.entityType, entityType), eq(comments.entityId, entityId))),
  ```

  `export type CommentListItem = Awaited<ReturnType<typeof commentsRepo.listForEntity>>[number];` (shape: `{ comment: CommentRow; saidBy: { id; name } | null; authorName: string | null }`).

- `src/server/core/mutation.ts` — additive extension so `created`/`deleted` can carry a payload:
  - `created(entityType, projectId, entityId, entityLabel, snapshot?: unknown)` and `deleted(…, snapshot?: unknown)`; `push` gains a trailing `snapshot?: unknown` and stores it on the `DomainEvent`.
  - `flush`: for non-`updated` events return `[{ ...base, ...(e.snapshot !== undefined ? (e.action === "created" ? { newValue: e.snapshot } : { oldValue: e.snapshot }) : {}) }]`. `field` stays `null` for created/deleted, so `describeActivity` (`src/entities/activity/activity-item.tsx:30-37`) is unaffected.
  - **Contract with #5 (History)**: the snapshot for comments MUST contain the parent item reference `{ entityType, entityId }` so #5 can select comment events per item with a jsonb containment query (`coalesce(new_value, old_value) @> '{"entityType":"task","entityId":"…"}'`) even after the Comment row is gone. Update the doc comment at `src/server/modules/activity/schema.ts` on `field/oldValue/newValue` accordingly.
- `src/server/events/bus.ts` — `DomainEvent` gains `snapshot?: unknown;` (optional; all existing callers/tests untouched).
- `src/server/modules/people/service.ts` — `assertPersonInProject(db, projectId, personId, field = "assigneeId")` so the comments service can report the error under `saidById` (`{ [field]: ["Invalid"] }`). Existing callers unchanged.
- `src/server/modules/comments/service.ts` (new) — `commentsService`:

  ```ts
  export type CommentSnapshot = {
    entityType: CommentableEntityType; entityId: string;      // the item, so #5 can filter per item
    body: string; saidById: string | null; saidByName: string | null; saidOn: string | null;
  };
  export const COMMENT_LABEL_MAX = 60;
  /** "ACME-12: first line of the body…" — used as entityLabel for Activity Events. */
  export function commentLabel(itemLabel: string, body: string): string;

  /** Resolve the commented item; ValidationError if it is missing or in another Project. */
  async function resolveItem(db: DbOrTx, project: ProjectRow, entityType: CommentableEntityType, entityId: string): Promise<{ label: string }>
    // task      -> tasksRepo.findById       label `${project.key}-${task.number}`
    // risk      -> risksRepo.findById       label `R-${risk.number}`
    // milestone -> milestonesRepo.findById  label milestone.name
    // throws new ValidationError("Item not found in this project", { entityId: ["Invalid"] })

  async function getOwned(db, userId, id): Promise<CommentRow>  // NotFoundError("Comment") then assertOwnsProject(db, userId, c.projectId)

  listForEntity: async (ctx: Ctx, { projectId, entityType, entityId }: ListCommentsInput) => {
    await assertOwnsProject(ctx.db, ctx.userId, projectId);           // first line
    return commentsRepo.listForEntity(ctx.db, projectId, entityType, entityId);
  },

  create: (ctx: Ctx, input: CreateCommentInput) =>
    mutate(ctx, async (tx, rec) => {
      const project = await assertOwnsProject(tx, ctx.userId, input.projectId);   // first line
      const body = input.body.trim();
      if (!body) throw new ValidationError("Comment is required", { body: ["Required"] });
      if (body.length > COMMENT_MAX_LENGTH) throw new ValidationError("Comment is too long (max 4,000 characters)", { body: ["Too long"] });
      const { label } = await resolveItem(tx, project, input.entityType, input.entityId);
      await assertPersonInProject(tx, project.id, input.saidById, "saidById");
      const saidByName = input.saidById ? (await peopleRepo.findById(tx, input.saidById))!.name : null;
      const row = await commentsRepo.insert(tx, { projectId: project.id, entityType: input.entityType, entityId: input.entityId,
        body, saidById: input.saidById ?? null, saidByName, saidOn: input.saidOn ?? null, authorId: ctx.userId });
      rec.created("comment", project.id, row.id, commentLabel(label, body), snapshotOf(row));
      return row;
    }),

  delete: (ctx: Ctx, id: string) =>
    mutate(ctx, async (tx, rec) => {
      const c = await getOwned(tx, ctx.userId, id);
      const project = await assertOwnsProject(tx, ctx.userId, c.projectId);
      const label = await resolveItem(tx, project, c.entityType as CommentableEntityType, c.entityId)
        .then((r) => r.label).catch(() => labelFor(c.entityType));
      await commentsRepo.delete(tx, id);
      rec.deleted("comment", c.projectId, id, commentLabel(label, c.body), snapshotOf(c));
      return c;   // action needs projectId for revalidation
    }),
  ```

  Body is re-validated in the service (not only in zod) so the AI layer calling the service directly gets the same guarantees and the service tests can assert blank/over-long rejection. Check whether `assertOwnsProject` returns the project row; if not, fetch it via `projectsRepo.findById`.

- Cascade wiring (inside the existing `mutate` delete transactions, before the row delete, mirroring `dependenciesRepo.deleteForItem`):
  - `src/server/modules/tasks/service.ts` `delete`: add `await commentsRepo.deleteForEntity(tx, "task", id);` after `dependenciesRepo.deleteForItem`.
  - `src/server/modules/risks/service.ts` `delete`: add `await commentsRepo.deleteForEntity(tx, "risk", id);` before `risksRepo.delete`.
  - `src/server/modules/milestones/service.ts` `delete`: add `await commentsRepo.deleteForEntity(tx, "milestone", id);` after `dependenciesRepo.deleteForItem`.
  - No per-Comment `comment.deleted` events are emitted for cascades; the item's own `deleted` event covers it. Import direction is `tasks/service → comments/repository` only; `comments/service → tasks|risks|milestones/repository`. No cycle.

Tests: `src/server/modules/comments/service.test.ts` (see §4).

### C3 — `feat(comments): server actions and CommentThread in item dialogs`

Files:

- `src/server/modules/comments/actions.ts` (new, `"use server"`), all JSON-input variants like `patchTaskAction`:
  ```ts
  export async function createCommentAction(input: z.input<typeof createCommentSchema>) {
    const res = await runAction(createCommentSchema, input, (ctx, i) => commentsService.create(ctx, i));
    if (res.ok) revalidateProject(res.data.projectId);
    return res;
  }
  export async function deleteCommentAction(input: z.input<typeof deleteCommentSchema>) {
    const res = await runAction(deleteCommentSchema, input, (ctx, { id }) => commentsService.delete(ctx, id));
    if (res.ok) revalidateProject(res.data.projectId);
    return res;
  }
  /** Read path for the dialog thread (no revalidation). */
  export async function listCommentsAction(input: z.input<typeof listCommentsSchema>) {
    return runAction(listCommentsSchema, input, (ctx, i) => commentsService.listForEntity(ctx, i));
  }
  ```
- `src/entities/comment/comment-body.tsx` (new, display atom): `CommentBody({ body }: { body: string })` renders `<p className="text-body-sm text-ink whitespace-pre-wrap break-words">` splitting on `/(https?:\/\/[^\s<>"')\]]+)/g`; URL parts become `<a href target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">`. No Markdown.
- `src/features/comment/comment-thread.tsx` (new, `"use client"`):
  ```ts
  export function CommentThread({ projectId, entityType, entityId, people }: {
    projectId: string; entityType: CommentableEntityType; entityId: string; people: ProjectRefs["people"];
  })
  ```
  - State: `comments: CommentListItem[] | null` (null = loading), `body`, `saidById` (default `""`), `saidOn` (default `today()` from `@/shared/lib/dates`), `pending`, `error`, `fieldErrors`, `confirmId: string | null`.
  - `useEffect` on `[projectId, entityType, entityId]` → `listCommentsAction(...)`, set list. `refresh()` re-calls it. (If the `react-hooks/set-state-in-effect` lint rule fires, load inside the effect via an async function that sets state after await, which the rule permits, or use a `key` + lazy init pattern.)
  - **Not a `<form>`** (renders inside the dialog's `ActionForm`; see `dependency-editor.tsx:52`). Controls carry **no `name` attribute** so the parent Save never picks them up. Textarea `onKeyDown`: `(e.metaKey || e.ctrlKey) && e.key === "Enter"` → `preventDefault()` + `post()`. The Said-by `<Select>` and Said-on `<Input type="date">` get `onKeyDown` Enter → `preventDefault()` + `post()` so implicit submission cannot fire the parent form (same guard as `dependency-editor.tsx:131-136`).
  - `post()`: `createCommentAction({ projectId, entityType, entityId, body, saidById: saidById || null, saidOn: saidOn || null })`; on `!ok` show `res.error` / `fieldErrors.body`; on ok clear `body`, keep Said-by/Said-on, `refresh()`, refocus the textarea.
  - List (oldest first, as returned): each row shows `Avatar` + name: `saidBy?.name` → else `comment.saidByName ? "Unknown person" : "You"` (title = `saidByName` when present); `· said ${fmtDate(saidOn, "d MMM yyyy")}` when `saidOn`; right-aligned `relative(createdAt)` with `title={`Entered ${fmtDateTime(createdAt)}`}`; `<CommentBody body>`; a ghost `Button size="icon" aria-label="Delete comment"` (`Trash2`). Clicking it sets `confirmId`; the row then shows "Delete this comment?" with `Button variant="danger" size="sm"` **"Delete"** and ghost **"Cancel"** (inline confirm; no nested Dialog). Confirm → `deleteCommentAction({ id })` → `refresh()`.
  - Empty state text: "No comments yet." Heading: `<span className="text-caption font-medium text-ink-subtle">Comments</span>` + count. Container: `rounded-md border border-hairline bg-surface-1 p-3` (same as DependencyEditor). Labels via `Field` from `@/shared/ui/input` (NOT `TextField`/`TextareaField`, whose `useFieldError` would read the parent form's errors): "Comment" (textarea, placeholder `Jason said integration lands next week unless infra blocks us…`, hint "⌘/Ctrl+Enter to post"), "Said by" (Select, placeholder option "You (unattributed)" value `""`, options from `people`), "Said on" (date). Primary `Button type="button" size="sm"` "Post", `loading={pending}`, `disabled={!body.trim()}`.
  - Tokens only (`text-ink-subtle`, `text-tag-red`, `bg-surface-1`, `border-hairline`, `text-primary`); no hex.
- Mount points (edit mode only, as the last child of the edit `ActionForm`, so #6 can insert `LinkedEvidence` immediately before it):
  - `src/features/task/task-dialog.tsx` — inside the existing `{t && (…)}` block after `<DependencyEditor …/>`: `<CommentThread projectId={refs.project.id} entityType="task" entityId={t.id} people={refs.people} />`.
  - `src/features/risk/risk-dialog.tsx` — after the Notes `TextareaField`: `{r && <CommentThread projectId={refs.project.id} entityType="risk" entityId={r.id} people={refs.people} />}`.
  - `src/features/milestone/milestone-dialog.tsx` — inside `{m && (…)}` after `<DependencyEditor …/>`, wrap both in a fragment.

Tests: none added (no component tests per issue); manual check in browser + typecheck/lint.

### C4 — `feat(comments): comment counts on Task rows and board cards`

TDD: add the test `"tasksService.list reports commentCount per Task"` to `comments/service.test.ts` first (asserts `commentCount` 2 / 0 for two Tasks).

Files:

- `src/server/modules/tasks/repository.ts` — extend `withJoins` with a grouped subquery (one query, no N+1):
  ```ts
  const withJoins = (db: DbOrTx) => {
    const commentCounts = db
      .select({ entityId: comments.entityId, n: sql<number>`count(*)::int`.as("n") })
      .from(comments)
      .where(eq(comments.entityType, "task"))
      .groupBy(comments.entityId)
      .as("comment_counts");
    return db
      .select({ task: tasks, status: statuses, assignee: people, team: teams,
        milestone: { id: milestones.id, name: milestones.name, dueDate: milestones.dueDate },
        commentCount: sql<number>`coalesce(${commentCounts.n}, 0)`.mapWith(Number) })
      .from(tasks)
      .innerJoin(statuses, …).leftJoin(people, …).leftJoin(teams, …).leftJoin(milestones, …)
      .leftJoin(commentCounts, eq(commentCounts.entityId, tasks.id));
  };
  ```
  `TaskListItem` automatically gains `commentCount: number`. `listOpenByProjects`/`listDatedByProjects` do not use `withJoins` and are untouched.
- `src/entities/comment/comment-count.tsx` (new): `CommentCount({ n, className }: { n: number; className?: string })` → `null` when `n === 0`; otherwise `<span title={`${n} comment${n === 1 ? "" : "s"}`} aria-label={same} className={cn("inline-flex items-center gap-1 text-caption text-ink-tertiary", className)}><MessageSquare className="size-3" />{n}</span>`.
- `src/features/task/task-list.tsx` `TaskRow`: render `<CommentCount n={item.commentCount} />` right after the labels span (before the milestone chip).
- `src/features/task/task-board.tsx`: in the card footer row, `<CommentCount n={t.commentCount} />` before the due-date span.

### C5 — `test(e2e): comments flow, docs/flows.md row, screenshots`

Files: `e2e/flows.spec.ts` (append `test.describe("comments")` after `command-palette`), `docs/flows.md` (new table row), `docs/comments/screenshots/*` (generated), `docs/artifacts/4-comments/screenshots/after-*.png` (copied). Details in §4 and §5.

Activity feed: no code change is needed. `describeActivity` renders `created Comment "FXXX-1: first line…"` / `deleted Comment "…"` because `labelFor("comment")` → `Comment` and the service sets `entityLabel = commentLabel(itemLabel, body)`. Verify in the Overview after C3.

## 3. Enum + migration + cascade, precisely

1. `src/shared/domain/index.ts`: `ENTITY_TYPES = [ "project", …, "status", "comment" ] as const` (append last). `src/server/db/enums.ts` needs no edit — `entityTypeEnum = pgEnum("entity_type", ENTITY_TYPES)` picks it up. `Recorder`/`DomainEvent` types (`${EntityType}.${ActivityAction}`) now include `comment.created` / `comment.deleted`.
2. `npx drizzle-kit generate --name comments` → `drizzle/0001_comments.sql` + `drizzle/meta/0001_snapshot.json` + journal entry. Commit all three. Never hand-edit `0000_init.sql`.
3. `npm run db:migrate` (dev DB). Vitest migrates `db_test` on its own via `global-setup.ts`.
4. Cascade: `commentsRepo.deleteForEntity(tx, "<type>", id)` is called inside `tasksService.delete`, `risksService.delete`, `milestonesService.delete` within their existing `mutate` callbacks, before the row delete, after `getOwned`. Project deletion is covered by the `projectId` FK `onDelete: "cascade"`.

## 4. Test plan

### Vitest — `src/server/modules/comments/service.test.ts`

Setup like `tasks/service.test.ts`: `beforeAll` → `ctx = await makeCtx(); projectId = (await makeProject(ctx)).id;` plus a Person via `peopleService.createPerson(ctx, { projectId, name: "Jason Tan" })`, a Task/Risk/Milestone via their services. `afterAll(closeDb)`. Helper `mk(over?)` → `commentsService.create(ctx, { projectId, entityType: "task", entityId: task.id, body: "…", ...over })`.

`describe("commentsService")`:

1. `"creates a Comment on a Task, a Risk and a Milestone and lists them oldest first"` — three creates; `listForEntity` for each returns 1 row with `comment.body`, `saidBy.name === "Jason Tan"`, `comment.saidOn === "2026-09-12"`, `comment.authorId === ctx.userId`; two comments on the same Task come back in creation order.
2. `"rejects an item that does not exist"` — `entityId: randomUUID()` → `rejects.toBeInstanceOf(ValidationError)`.
3. `"rejects an item that belongs to a different Project"` — Task in `makeProject(ctx, "OTH")`, comment with the first `projectId` → `ValidationError`.
4. `"rejects saidById from another Project"` — Person created in OTH → `ValidationError` with `fieldErrors.saidById`.
5. `"rejects a blank or whitespace-only body"` — `body: "   \n"` → `ValidationError`.
6. `"rejects a body longer than 4,000 characters"` — `"x".repeat(4001)` → `ValidationError`; `"x".repeat(4000)` succeeds.
7. `"records a comment.created Activity Event and publishes a comment.created domain event"` — subscribe `eventBus.subscribe("comment.created", …)`; after create `activityRepo.forEntity(ctx.db, comment.id)` has one row with `action: "created"`, `entityType: "comment"`, `entityLabel` starting with `` `${project.key}-${task.number}: ` ``, `newValue` matching `{ body, entityType: "task", entityId: task.id }`; received event has `entityType: "comment"`, `entityId: comment.id`.
8. `"delete writes a deleted Activity Event containing the body and publishes comment.deleted"` — after `commentsService.delete`, `forEntity` includes `action: "deleted"` with `oldValue` `toMatchObject({ body, entityType: "task", entityId: task.id })`; `listForEntity` no longer contains it; `comment.deleted` received once.
9. `"deleting a Task, Risk or Milestone deletes its Comments"` — comment on each, delete each item via its service, `listForEntity` → `[]` for all three.
10. `"removing a Person nulls saidById but keeps the Comment and its snapshot name"` — `peopleService.deletePerson`; row still listed with `comment.saidById === null`, `saidBy === null`, `comment.saidByName === "Jason Tan"`.
11. `"refuses a foreign User creating, listing or deleting"` — `stranger = await makeCtx()`; `create`, `listForEntity`, `delete` all `rejects.toBeInstanceOf(ForbiddenError)`.
12. `"tasksService.list reports commentCount per Task"` (C4) — two comments on Task A, none on B; `tasksService.list(ctx, projectId)` rows have `commentCount` 2 and 0.

Run with `npm test` (needs `npm run db:up`).

### Playwright — `e2e/flows.spec.ts`, `test.describe("comments")`, `const shot = shots("comments")`

Appended after `command-palette` (serial run; by then the account owns "Payments Migration" with People **Priya Nair**, **Marcus Lee**; Tasks `${key}-1` "Implement v2 endpoints" (In Progress) and `${key}-2` "Load-test the new gateway"; Milestone "UAT begins"; Risks R-1 open, R-2 closed).

```ts
test("posts, lists, counts and deletes a Comment on a Task", async ({ page }) => {
  await openProject(page, "Tasks");
  await page.getByText("Implement v2 endpoints").click();
  const dialog = page.getByRole("dialog", { name: `${key}-1` });
  await expect(dialog.getByText("No comments yet.")).toBeVisible();
  await shot(page, "task-dialog-empty-thread");

  const body = "Vendor confirmed 17 Sep in Friday's meeting.\nSee https://example.com/minutes";
  await dialog.getByLabel("Comment").fill(body);
  await dialog.getByLabel("Said by").selectOption({ label: "Priya Nair" });
  await dialog.getByLabel("Said on").fill("2026-09-12");
  await shot(page, "composer-filled");
  await dialog.getByLabel("Comment").press("ControlOrMeta+Enter");
  await expect(dialog.getByText("Vendor confirmed 17 Sep in Friday's meeting.")).toBeVisible();
  await expect(dialog.getByText("Priya Nair").last()).toBeVisible();
  await expect(dialog.getByRole("link", { name: "https://example.com/minutes" })).toBeVisible();
  await expect(dialog.getByLabel("Comment")).toHaveValue("");
  await shot(page, "comment-posted");

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTitle("1 comment")).toBeVisible();
  await shot(page, "list-with-count");
  await page.getByRole("button", { name: "board view" }).click();
  await expect(page.getByTitle("1 comment")).toBeVisible();
  await shot(page, "board-with-count");
  await page.getByRole("button", { name: "list view" }).click();

  await page.getByText("Implement v2 endpoints").click();
  await dialog.getByRole("button", { name: "Delete comment" }).click();
  await expect(dialog.getByText("Delete this comment?")).toBeVisible();
  await shot(page, "delete-confirm");
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(dialog.getByText("No comments yet.")).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByTitle("1 comment")).toBeHidden();

  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(page.getByText(new RegExp(`created Comment "${key}-1: Vendor confirmed`))).toBeVisible();
  await expect(page.getByText(new RegExp(`deleted Comment "${key}-1: Vendor confirmed`))).toBeVisible();
  await shot(page, "overview-feed");
});
```

Notes for the implementer: the whole file must run (`E2E_NO_SERVER=1 npx playwright test e2e/flows.spec.ts` with `npm run dev` up on the port from `.env` `E2E_PORT`) — `-g comments` alone has no account. Check the exact accessible names of the list/board view toggles and the Overview nav link in `src/widgets/project-header/project-header.tsx` before relying on them. The dialog's "Cancel" is the parent `ActionForm` cancel — the comment confirm's Cancel is only present while `confirmId` is set, so use `exact: true` and scope carefully if both are visible. `page.getByText("Implement v2 endpoints")` may match both the row and a hidden dialog remnant; use `.first()` if strict-mode complains.

### `docs/flows.md` — add row after `command-palette`:

```md
| `comments`        | Open a Task, post a Comment attributed to a Person with a said-on date, see it in the thread and the count on the row/board, delete it with confirmation, see created/deleted in the Overview feed | [comments](./comments/screenshots)               |
```

## 5. Screenshot evidence plan

Directory: `docs/artifacts/4-comments/screenshots/`. Dev DB is seeded with the demo account (`demo@example.com` / `demo-password-123`, project "Payments Platform Relaunch", key PAY).

**Before** (take on this branch BEFORE C1, with `npm run dev` and a throwaway Playwright script at 1440×900):

- `before-task-dialog.png` (Task edit dialog, no Comments section).
- `before-task-list.png` (rows without counts).
- `before-task-board.png`.
- `before-risk-dialog.png`.
- `before-milestone-dialog.png` (edit mode via the Timeline page).
- `before-overview-feed.png`.

**After** (feature branch, after C5's e2e run): copy from `docs/comments/screenshots/`:

- `after-task-dialog-empty-thread.png`, `after-composer-filled.png`, `after-comment-posted.png`, `after-list-with-count.png`, `after-board-with-count.png`, `after-delete-confirm.png`, `after-overview-feed.png`.
- Via a throwaway Playwright script against the seeded demo project: `after-risk-dialog-comment.png` (a Risk with one Comment), `after-milestone-dialog-comment.png` (a Milestone with one Comment), `after-unknown-person.png` (post attributed to a throwaway Person, remove the Person on the People page, reopen → "Unknown person").

The e2e run rewrites every `docs/<flow>/screenshots` directory; revert unrelated churn (`git checkout -- docs/auth docs/project … docs/command-palette`) unless a page genuinely changed, keep `docs/comments/screenshots` (new).

## 6. Risks, ambiguities and recommended resolutions

1. **Nested forms.** Dialogs are one `ActionForm`; `<form>` inside `<form>` is invalid HTML and React would bubble submit to the parent. Resolution: `CommentThread` is a plain `div` with `type="button"` controls calling JSON actions (precedent: `DependencyEditor`). Controls have no `name` so `updateTaskAction`'s FormData never sees `body`/`saidById` (zod would strip them anyway). Enter in the Said-by/Said-on controls is intercepted to stop implicit submission of the parent form.
2. **Cmd/Ctrl+Enter.** Handled in the textarea's `onKeyDown`, not through `ActionForm`. Plain Enter inserts a newline as usual.
3. **"You" vs Person vs "Unknown person".** `saidById` null and `saidByName` null → "You" (single-owner tenancy, the author is always the owner). `saidBy` joined → Person name. `saidById` null but `saidByName` set → "Unknown person" with the snapshot name as `title`. This requires the extra `saidByName` column (not in the issue's column list but the only way to honour story 17 alongside the mandated `set null` FK). Flag in the PR description.
4. **`saidOn` default.** Client-side `today()` (`src/shared/lib/dates.ts`) as the initial state of the date input; user may clear it → `null` stored, date omitted in the row. Not a DB default, per the issue.
5. **Ordering.** "Chronological" = by `createdAt` (then `id`), not `saidOn` (nullable, and a late-entered older statement should still appear where it was entered). Said-on is shown inline so the reader can see both.
6. **`rec.deleted` cannot carry a payload today.** Resolved by the additive `snapshot?` parameter on `Recorder.created/deleted` and `DomainEvent.snapshot?`; `flush` writes it to `newValue` (created) / `oldValue` (deleted). `field` stays null so `describeActivity` and the Dashboard feed are unaffected. Existing tests keep passing.
7. **Loading comments.** Fetched client-side via `listCommentsAction` on mount (dialog hosts on 3 pages and only have list rows). After post/delete the thread refreshes itself; `revalidateProject` refreshes the RSC page so row counts update. Alternative (page reads `?task=` and passes `comments` down) rejected as it touches 3 pages + 3 views + 3 dialogs' props.
8. **Validation of `entityType`.** The pg enum accepts any `EntityType`; zod (`z.enum(COMMENTABLE_ENTITY_TYPES)`) and the service's `resolveItem` switch are the guards. `CommentRow.entityType` is typed as `EntityType`; cast to `CommentableEntityType` at the `resolveItem` call in `delete`.
9. **Body limit message.** 4,000 chars enforced in zod and in the service; message "Comment is too long (max 4,000 characters)".
10. **Delete confirm.** Inline two-step inside the row (no nested `Dialog`, whose Escape handler would also close the parent dialog).
11. **Migration ordering.** `"comment"` must be appended last; otherwise drizzle-kit recreates the enum type (still works, but noisy). The `ADD VALUE` inside the migrator transaction is fine on PG 17 because the new value is not used in the same migration.
12. **Timeline page milestone/task dialogs** also render `CommentThread`; nothing extra needed since props come from `refs`.

## 7. Interfaces the follow-ups rely on (keep stable)

For **#5 (History tab)**:

- Activity Events for Comments: `entityType: "comment"`, `entityId: <comment.id>`, `action: "created" | "deleted"`, `field: null`, `entityLabel: "<itemLabel>: <first line ≤ 60 chars>"` where `itemLabel` is `${project.key}-${task.number}` / `R-${risk.number}` / `milestone.name`. `newValue` (created) and `oldValue` (deleted) are a `CommentSnapshot` `{ entityType, entityId, body, saidById, saidByName, saidOn }` — the item's `entityType`/`entityId` are inside the snapshot precisely so #5 can select comment events per item (`coalesce(new_value, old_value) @> '{"entityType":…,"entityId":…}'`) even after the Comment row is gone; History renders the full body from `oldValue.body` / `newValue.body`.
- `Recorder.created/deleted(…, snapshot?)` and `DomainEvent.snapshot?` are the generic seams #5/#6 may reuse.
- `activityRepo.forEntity` unchanged.

For **#6 (Evidence links)**:

- `COMMENTABLE_ENTITY_TYPES` / `CommentableEntityType` in `src/shared/domain/index.ts` — reuse for `evidence_links.entityType` validation (#6 may alias as `LINKABLE_ENTITY_TYPES`).
- Cascade seam pattern: `xRepo.deleteForEntity(tx, entityType, id)` called in `tasksService.delete` / `risksService.delete` / `milestonesService.delete` right after `dependenciesRepo.deleteForItem` — #6 adds `evidenceLinksRepo.deleteForEntity` on the adjacent line.
- Dialog layout: `CommentThread` is the **last** child of each edit `ActionForm`; #6 mounts `LinkedEvidence` immediately before it.
- `TaskListItem.commentCount` + `CommentCount` atom placement in `TaskRow`/board card — #6 adds `linkedEvidenceCount` via a second grouped subquery in `withJoins` and a sibling chip.
- `assertPersonInProject(db, projectId, personId, field?)` 4th parameter.

## 8. Review corrections (applied to this plan)

- `assertPersonInProject` in `src/server/modules/people/service.ts` hard-codes `{ assigneeId: ["Invalid"] }`; add the `field = "assigneeId"` 4th param and use `{ [field]: ["Invalid"] }` (C2).
- E2E: prefer `dialog.getByRole("textbox", { name: "Comment" })` over `getByLabel("Comment")`; the list/board toggles are `aria-label="list view"` / `"board view"`; the Overview nav link text is exactly `"Overview"`.
- Cascade insertion points: after `dependenciesRepo.deleteForItem(tx, id)` in tasks/milestones, before `risksRepo.delete(tx, id)` in risks.
- `CommentSnapshot` MUST include the parent `{ entityType, entityId }` — assert it in test 7/8 (hard dependency for #5).
- `CommentThread` initial load: avoid a synchronous `setState` in `useEffect` (`react-hooks/set-state-in-effect`); call an async loader that awaits before setting state.
