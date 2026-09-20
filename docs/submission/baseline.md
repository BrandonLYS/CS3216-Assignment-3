# Submission Baseline

## Release

- Repository: `BrandonLYS/CS3216-Assignment-3`
- Submission branch: `prod`
- Release SHA: `912d42d22d55ff663971b523730ebb90fe9fc4b7`
- `main` was 45 commits ahead of `prod` before fast-forward.
- Fast-forward completed: 2026-09-19 SGT

## Environment Variables

Record redacted values only; do not commit secrets.

| Variable                   | Production Source | Redacted Value                 |
| -------------------------- | ----------------- | ------------------------------ |
| `DATABASE_URL`             | Neon              | `<redacted>`                   |
| `BETTER_AUTH_SECRET`       | Vercel            | `<redacted>`                   |
| `BETTER_AUTH_URL`          | Vercel            | `https://<project>.vercel.app` |
| `STORAGE_DRIVER`           | Vercel            | `vercel-blob`                  |
| `BLOB_READ_WRITE_TOKEN`    | Vercel            | `<redacted>`                   |
| `AI_PROVIDER`              | Vercel            | `openai`                       |
| `AI_MODEL`                 | Vercel            | `gpt-4o-mini`                  |
| `OPENAI_API_KEY`           | Vercel            | `<redacted>`                   |
| `PROPOSALS_EXTRACTOR`      | Vercel            | `model`                        |
| `ASSISTANT_MAX_STEPS`      | Vercel            | `8`                            |
| `ASSISTANT_DAILY_TURN_CAP` | Vercel            | `50`                           |
| `MEMORY_MAX_TOKENS`        | Vercel            | `2000`                         |
| `NEXT_PUBLIC_POSTHOG_KEY`  | PostHog           | `<redacted>`                   |
| `NEXT_PUBLIC_POSTHOG_HOST` | PostHog           | `https://us.i.posthog.com`     |

## Reproducibility Commands

Run from a clean checkout on the release SHA:

```bash
npm ci
npm run db:up
npm run db:migrate
npm run db:seed
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

## Command Output Logs

Captured on 2026-09-20 SGT from `devin/submission` with Node `v22.x`, Docker containers `db` and `db_test` running, `.env` derived from `.env.example`.

### `npm ci`

Exit `0`. 557 packages installed. 4 moderate severity vulnerabilities (not blocking). 6 packages have install scripts not yet approved by `allowScripts`.

### `npm run db:up`

Exit `0`. Containers `cs3216-assignment-3-db-1` and `cs3216-assignment-3-db_test-1` started/healthy.

### `npm run db:migrate`

Exit `0`. Drizzle migrations applied successfully (existing schema notices are benign).

### `npm run db:seed`

Exit `0`. Demo account `demo@example.com` seeded with two projects.

### `npm run format:check`

Exit `0`. All matched files use Prettier code style.

### `npm run lint`

Exit `0`. ESLint passed with zero warnings/errors.

### `npm run typecheck`

Exit `0`. Next route types generated; `tsc --noEmit` passed.

### `npm test`

Exit `0`. 258 tests passed across 32 test files in ~26s.

### `npm run build`

Exit `0`. Static and dynamic routes generated successfully; prerender completed for 11 static pages.

### `npm run test:e2e`

Exit `1`. 20 passed, 2 failed, 2 skipped (transcript/graph depend on the failing proposal test).

- `e2e/flows.spec.ts:982` proposals test failed because 3 proposal cards were generated instead of 1 after the OpenAI structured-output schema fix.
- `e2e/smoke.spec.ts:72` custom-status test timed out waiting for an `Add` button on the Settings page.

## Deviations / Notes

- Fixed `src/server/modules/proposals/extract.ts` `rawAssumptionSchema`/`rawProposalSchema` so every property is listed as required and nullable; this resolved the `Missing 'targetName'` OpenAI `invalid_json_schema` error that blocked proposal generation.
- Corresponding unit test fixtures in `src/server/modules/proposals/service.test.ts` and `src/server/modules/proposals/trace.test.ts` were updated to include the now-required nullable fields.
- PostHog analytics installed (`posthog-js`, `posthog-node`) and integrated; see `m19-analytics.md` for event definitions. The `NEXT_PUBLIC_POSTHOG_*` values must be set in production before events will be received.
