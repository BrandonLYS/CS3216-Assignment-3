# M19 - Analytics Evidence

## Tool

PostHog (client `posthog-js`, server `posthog-node`).

## Integration

- `src/shared/analytics/provider.tsx` wraps the application root in `src/app/layout.tsx` and captures `$pageview` events on pathname changes.
- `src/shared/analytics/server.ts` exports `capture(userId, event, properties)` for server routes and `captureCurrent(event, properties)` for server actions.
- The server helper uses `next/server` `after()` to flush events after the response is sent.
- Browser identification, sign-out reset and real browser session propagation follow the [issue #73 contract](../artifacts/73-analytics-identity/README.md).
- Signup is captured once after identification; returning and restored sessions do not create signup events.
- Every server event carries `browser_context`, which is `browser` when the originating browser session correlates and `none` when there is none to correlate.
- The Evidence to Proposal to Decision funnel follows the [issue #74 contract](../artifacts/74-proposal-funnel/README.md): the transitions emit their own events, after the write.
- Automatic capture and replay are disabled; credential routes are suppressed and URL query/hash content is removed.

## Required environment variables

| Variable                   | Source  | Value                      |
| -------------------------- | ------- | -------------------------- |
| `NEXT_PUBLIC_POSTHOG_KEY`  | PostHog | Project API key            |
| `NEXT_PUBLIC_POSTHOG_HOST` | PostHog | `https://us.i.posthog.com` |

## Event definitions

| Event name                  | When captured                                                         | Properties (no PII)                                                                       |
| --------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `$pageview`                 | Every client-side route change                                        | `$current_url`                                                                            |
| `signup_completed`          | After successful email sign-up                                        | None (SDK User/session context)                                                           |
| `project_created`           | After `createProjectAction` succeeds                                  | `project_id`                                                                              |
| `evidence_created`          | After `createEvidenceAction` succeeds                                 | `evidence_id`, `evidence_kind`                                                            |
| `transcript_created`        | After Evidence of kind `transcript` is created                        | `evidence_id`                                                                             |
| `proposal_generated`        | After a pass commits at least one Proposal, automatic or requested    | `project_id`, `trigger`, `extractor`, `proposal_count`, `source_count`, `discarded_count` |
| `proposal_accepted`         | After the transaction that turns the Proposal into a Decision commits | `project_id`, `proposal_id`, `extractor`, `edited_before_accept`                          |
| `proposal_rejected`         | After a pending Proposal is marked rejected                           | `project_id`, `proposal_id`, `extractor`                                                  |
| `assistant_question_sent`   | When a chat message is submitted to `/api/assistant/chat`             | `workflow` (`project` or `workspace`)                                                     |
| `assistant_citation_opened` | TBD - UI click on a cited source in the Assistant dock                | TBD                                                                                       |
| `assistant_abstained`       | TBD - Assistant answers with no recorded decision                     | TBD                                                                                       |
| `impact_alert_viewed`       | TBD - User opens an impact alert                                      | TBD                                                                                       |
| `impact_graph_opened`       | TBD - User opens the impact graph                                     | TBD                                                                                       |

The Proposal funnel rows were verified on branch `fix/auth` against a local collector with the real browser and server SDKs; see [the funnel artifact](../artifacts/74-proposal-funnel/README.md) for the run and its reconciliation.
A production Live Events run still has to be recorded here with its release SHA and timestamp by someone with access to the production PostHog project.

## Data safety

No raw evidence text, transcripts, prompts, names, emails, or project titles are sent.
Only hashed/internal ids and metadata are attached.

## Dashboard checklist

- [ ] Create a PostHog project and copy the API key into Vercel production env.
- [ ] Trigger each event once in production and verify it appears in the Live events feed.
- [ ] Create an insights board with: sign-up funnel, project creation count, proposal accept/reject ratio, assistant question volume, top pages.
- [ ] Capture a screenshot of the dashboard for this file.
