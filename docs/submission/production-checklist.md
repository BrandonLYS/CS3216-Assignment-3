# Production Deployment Checklist

## Branch and release

- [ ] Confirm `prod` branch is checked out and fast-forwarded to the release SHA.
- [ ] In Vercel project settings, set the Production branch to `prod`.
- [ ] Redeploy the production build.

## Environment variables

Add these in the Vercel production environment and redeploy:

| Variable                   | Value                                                    |
| -------------------------- | -------------------------------------------------------- |
| `DATABASE_URL`             | Neon connection string                                   |
| `BETTER_AUTH_SECRET`       | 32+ character random string                              |
| `BETTER_AUTH_URL`          | `https://<your-vercel-project>.vercel.app`               |
| `STORAGE_DRIVER`           | `vercel-blob`                                            |
| `BLOB_READ_WRITE_TOKEN`    | Vercel Blob token                                        |
| `AI_PROVIDER`              | `openai`                                                 |
| `AI_MODEL`                 | `gpt-4o-mini`                                            |
| `OPENAI_API_KEY`           | OpenAI API key                                           |
| `PROPOSALS_EXTRACTOR`      | `model`                                                  |
| `ASSISTANT_MAX_STEPS`      | `8`                                                      |
| `ASSISTANT_DAILY_TURN_CAP` | `50`                                                     |
| `MEMORY_MAX_TOKENS`        | `2000`                                                   |
| `NEXT_PUBLIC_POSTHOG_KEY`  | PostHog project API key                                  |
| `NEXT_PUBLIC_POSTHOG_HOST` | `https://us.i.posthog.com` or `https://eu.i.posthog.com` |

## Database

- [ ] Run migrations against the production Neon database: `npm run db:migrate` (with `DATABASE_URL` pointing to production).
- [ ] Optionally seed the demo account for smoke tests.

## Production smoke tests

Run through these in an incognito browser:

1. Cross-user isolation: create account A, create account B, prove B cannot see A's project.
2. Project + evidence + proposal: create a project; add a transcript; generate model proposals; edit/accept/reject one.
3. Decision + impact: create an Assumption; break it; open the impact graph and inspect the alert.
4. Assistant "Why did we...?": ask with a recorded Decision and without one.
5. Persistence: upload evidence, refresh, prove persistence.
6. Settings MCP endpoint does not show `localhost`.

## Release evidence

Record and paste into `docs/submission/baseline.md`:

- Production URL.
- Release SHA (HEAD of `prod` after merge).
- Timestamp of deployment.
- Screenshot of the deployed homepage.
