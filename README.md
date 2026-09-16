# Vantage — CS3216 Assignment 3

Project management with a memory: the structured base (projects, tasks, milestones, dependencies, risks, evidence, per-project statuses, full change history) for an AI project-intelligence layer that comes next. See `CS3216 Assignment 3.pdf` for the product journeys, `CONTEXT.md` for the domain glossary, and `docs/adr/` for decisions.

New contributors should follow the [developer onboarding guide](docs/developer-onboarding.md) for prerequisites, local setup, testing, and repository conventions.

## Run locally

```bash
cp .env.example .env          # then set BETTER_AUTH_SECRET to something random
npm install
npm run db:up                 # Postgres (dev on :5433, test on :5434) via Docker
npm run db:migrate
npm run db:seed               # demo@example.com / demo-password-123 with the PDF scenario
npm run dev                   # http://localhost:3000
```

## Verify

```bash
npm run typecheck && npm run lint
npm test                      # Vitest against the test database
npm run test:e2e              # Playwright smoke (uses the running dev server)
```

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind v4 · Postgres + Drizzle · Better Auth · Vitest · Playwright. Deploy target: Vercel + Neon, with `STORAGE_DRIVER=vercel-blob` for Evidence files.
