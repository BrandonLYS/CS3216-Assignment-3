<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Vantage — project management base for a future AI intelligence layer

Vocabulary lives in `CONTEXT.md`; use its terms (Task, not issue; Person, not assignee; Evidence, not document). Decisions with trade-offs are in `docs/adr/`. Visual language is `DESIGN.md`; tokens are already in `src/app/globals.css` (`bg-surface-1`, `text-ink-subtle`, `text-tag-red`, `panel`, …) — reach for those, never raw hex.

## Setup and verification

`cp .env.example .env`, `npm run db:up`, `npm run db:migrate`, `npm run db:seed` (demo account only, see `.env.example`), `npm run dev`. Scripts are in `package.json`; `typecheck`, `lint`, `test` (Vitest, needs the `db_test` container), `test:e2e` (Playwright, needs a running dev server or lets the config start one). Pre-commit runs lint-staged + typecheck. CI (`.github/workflows/ci.yml`, runs on Bun) checks `format:check`, `eslint --max-warnings=0` and `typecheck` on every PR. A Devin `PostToolUse` hook (`.devin/hooks.v1.json`) runs Prettier + `eslint --fix` on each file the agent edits.

## Architecture rules (ADR 0005)

- **Every write goes through `src/server/modules/<feature>/service.ts`** wrapped in `mutate(ctx, (tx, rec) => …)` from `src/server/core/mutation.ts`. Call `rec.created/updated/deleted` so the Activity Event and domain event are emitted. Only exception: `project.deleted` uses `rec.signal` (publish-only) because the Project's Activity Events cascade away with the row. Diff with `diffFields(before, compactPatch(patch))` so only real changes are recorded.
- **First line of any project-scoped service is `assertOwnsProject`** (`src/server/modules/projects/service.ts`). It is the only authorization seam.
- **Server actions** (`actions.ts`, `"use server"`) are thin: `runAction(schema, input, fn)` then `revalidateProject(id)`. Never `redirect()` inside an action called from a client component — the promise never resolves; return the result and navigate with `router.push` in `onSuccess`.
- **Layers**: `app` (routes, fetch via services) → `widgets` (shell, timeline, calendar) → `features` (dialogs/views that call actions) → `entities` (display atoms) → `shared` (ui, lib, domain). UI never imports a `repository.ts`.
- **Status semantics come from `status.category`, never `status.name`** (ADR 0003). Fixed vocabularies live in `src/shared/domain/index.ts`; adding a value there needs a Drizzle enum migration (`npm run db:generate`).
- **Forms**: `ActionForm` + `TextField/SelectField/TextareaField`. `className` styles the label wrapper; use `inputClassName` for the control.

## Engineering standards

- Use `-`, never an em dash (`—`).
- Never auto-add an agent name as a commit co-author.
- Do not manually modify `CHANGELOG.md` or files marked auto-generated.
- In new or substantially edited long Markdown files, put each complete sentence on its own physical line. Preserve normal Markdown structure.
- Prefer quality, simplicity, robustness, scalability, and long-term maintainability over development speed.
- For bug fixes, first reproduce bug in an end-to-end setting that closely matches user behavior.
- During end-to-end testing, fix visible UI defects relevant to the changed flow, even when not directly caused by current work.
- Apply same standard to lint errors, test failures, and test flakiness: fix them when encountered.

## Where the AI layer plugs in

Subscribe with `eventBus.subscribe("*" | "task.updated" | …)` in `src/server/events/bus.ts`; read through the module repositories; store extracted text in `evidence.extractedText` (nullable, reserved). `src/server/modules/workspace/queries.ts` is the deterministic read model the Health Briefing should enrich rather than replace.
