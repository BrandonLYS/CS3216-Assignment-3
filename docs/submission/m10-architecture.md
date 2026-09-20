# M10 - Architecture Evidence

## High-level data flow

```
Browser
  ↕ Next.js App Router + Server Actions
  ↕ Widgets / Features / Entities / Shared UI
  ↕ Server actions ("use server") → service.ts → mutate(ctx, (tx, rec) => ...)
  ↕ Drizzle ORM + PostgreSQL
  ↕ Vercel Blob (files) / Better Auth (sessions)
  ↕ OpenAI API via ai SDK (assistant, proposal extraction, why-did-we)
```

## Key seams

- `src/server/core/action.ts` validates input and builds `Ctx` for every action.
- `src/server/core/mutation.ts` wraps writes, persists Activity Events, and publishes domain events.
- `src/server/events/bus.ts` emits `task.updated`, `milestone.updated`, `decision.created`, etc.
- `src/server/modules/<feature>/service.ts` is the only place a module's rows are written.
- `src/server/modules/<feature>/repository.ts` contains SQL; UI never imports repositories.

## Assistant / AI integration

- `src/app/api/assistant/chat/route.ts` streams tool calls from `getModel()`.
- `src/server/modules/assistant/tools.ts` defines project-scoped and workspace-scoped tools.
- `src/server/modules/assistant/prompt.ts` holds `WHY_RULES` and system prompts.
- `src/server/modules/proposals/extract.ts` extracts structured decisions from Evidence/Comments.
- `src/server/modules/decisions/answers.ts` ranks decisions and evidence for the "Why did we" question.

## Auth and authorization

- `src/server/auth/session.ts` validates the Better Auth session per request.
- `assertOwnsProject` is the single project-level authorization seam in every service.

## Frontend layering

- `app` - routes, server fetches.
- `widgets` - shell, timeline, calendar, assistant dock.
- `features` - dialogs and views that call actions.
- `entities` - display atoms.
- `shared` - ui primitives, lib, domain constants.
