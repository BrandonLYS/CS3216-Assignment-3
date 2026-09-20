# M15 - Production Stack

## Core framework

- Next.js 16.3.5 with Turbopack
- React 19.0.0
- TypeScript 5.8
- Tailwind CSS 4.0.6
- Radix UI primitives (`@radix-ui/*`)
- `clsx` + `tailwind-merge` via `src/shared/lib/cn.ts`

## Backend and data

- Better Auth 1.2.5 (email/password sessions)
- Drizzle ORM 0.42.1 with `drizzle-kit` migrations
- PostgreSQL (Neon in production; local Docker containers for dev/test)
- Vercel Blob for file storage (`STORAGE_DRIVER=vercel-blob`)
- `unpdf` for PDF text extraction

## AI layer

- `ai` SDK 4.2.1
- `@ai-sdk/openai` 1.3.5
- Default production model: `gpt-4o-mini`
- Proposal extractor: `model` (`PROPOSALS_EXTRACTOR=model`)

## Testing and quality

- Vitest 4.1.11 for unit/integration tests
- Playwright 1.51.0 for end-to-end tests
- ESLint 9.39.5 with `@typescript-eslint` and `eslint-config-prettier`
- Prettier 3.6.0
- Husky + lint-staged pre-commit

## Monitoring and analytics

- PostHog (`posthog-js` 1.234.10, `posthog-node` 4.13.0)

## Hosting

- Vercel, production branch `prod`

## Alternatives rejected

- No Prisma: Drizzle keeps SQL explicit and migration files small.
- No Supabase auth: Better Auth gives self-contained credentials and session cookies.
- No custom file store: Vercel Blob matches the deployment target and keeps URLs short-lived/private.
- No Plausible: PostHog supports both product analytics and event capture from server actions.
