# M19 - Analytics Evidence

## Verified results: 28 September 2026

The [verification report and four original dashboard screenshots](posthog-2026-09-28/README.md) now include authenticated PostHog query exports, a fresh production pageview delivery check, and local SDK test results.
The observed sample contains 54 Assistant questions from 6 PostHog identities and 9 accepted versus 10 rejected Proposals, giving 47.4% acceptance among decided Proposals.
These are mixed-environment results: 281 of 594 pageviews came from localhost and the configured internal/test exclusion cohort was empty.
The report records incomplete capture coverage, a misleading general funnel, 27 errors among 47 recorded model calls, and application test failures rather than presenting an all-green verification.

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

| Event name                  | When captured                                                             | Explicit properties (no business content)                                                                                                                                                                                                                       |
| --------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$pageview`                 | Every client-side route change                                            | `$current_url`                                                                                                                                                                                                                                                  |
| `signup_completed`          | After successful email or new-account OAuth sign-up                       | None (SDK User/session context)                                                                                                                                                                                                                                 |
| `login_completed`           | After a successful sign-in to an existing account                         | None (SDK User/session context)                                                                                                                                                                                                                                 |
| `project_created`           | After `createProjectAction` succeeds                                      | `project_id`                                                                                                                                                                                                                                                    |
| `evidence_created`          | After `createEvidenceAction` succeeds                                     | `evidence_id`, `evidence_kind`                                                                                                                                                                                                                                  |
| `transcript_created`        | After Evidence of kind `transcript` is created                            | `evidence_id`                                                                                                                                                                                                                                                   |
| `render_requested`          | After a concept render is requested                                       | `render_id`                                                                                                                                                                                                                                                     |
| `proposal_generated`        | After a pass commits at least one Proposal, automatic or requested        | `project_id`, `trigger`, `extractor`, `proposal_count`, `source_count`, `evidence_source_count`, `comment_source_count`, `discarded_count`                                                                                                                      |
| `proposal_accepted`         | After the transaction that turns the Proposal into a Decision commits     | `project_id`, `proposal_id`, `extractor`, `edited_before_accept`                                                                                                                                                                                                |
| `proposal_rejected`         | After a pending Proposal is marked rejected                               | `project_id`, `proposal_id`, `extractor`                                                                                                                                                                                                                        |
| `assistant_question_sent`   | When the User sends a new message to `/api/assistant/chat`                | `workflow` (`project` or `workspace`)                                                                                                                                                                                                                           |
| `assistant_tool_approval`   | After a turn that carried the User's answer to a write-tool approval card | `workflow`, `tool`, `approved` (the User's answer, not whether the tool ran)                                                                                                                                                                                    |
| `assistant_turn_completed`  | When an Assistant turn finishes streaming                                 | `workflow`, `conversation_id`, `step_count`, `tool_call_count`, `tool_names`, `finish_reason`, `hit_step_cap`, `latency_ms`, `input_tokens`, `output_tokens`, `$ai_trace_id`                                                                                    |
| `assistant_limit_reached`   | When the daily turn cap returns 429                                       | `workflow`, `daily_turn_cap`                                                                                                                                                                                                                                    |
| `assistant_citation_opened` | When the User clicks a cited link in an Assistant answer                  | `citation_kind` (a Project section such as `decisions`, `tasks`, `overview`, else `other`)                                                                                                                                                                      |
| `$ai_generation`            | After every model call, success or failure (see below)                    | `$ai_span_name`, `$ai_trace_id`, `$ai_model`, `$ai_provider`, `$ai_latency`, `$ai_input_tokens`, `$ai_output_tokens`, `$ai_cache_read_input_tokens`, `$ai_reasoning_tokens`, `finish_reason`, `$ai_is_error`, `$ai_error`, plus the span's own properties below |

`impact_graph_opened` is read from `$pageview` on `/projects/*/graph`, so it needs no event of its own.
`assistant_abstained` and `impact_alert_viewed` are not captured.

## LLM analytics

`src/shared/analytics/ai.ts` records every model call as a PostHog `$ai_generation` event, which PostHog's LLM Analytics view turns into cost, latency and token dashboards per model.
The three call sites are distinguished by `$ai_span_name`:

- `assistant_turn`: one event per model call in `/api/assistant/chat`, with `workflow`, `conversation_id` and `step`, grouped per request by `$ai_trace_id` and summarised by `assistant_turn_completed`.
  A provider failure, before or during the stream, is recorded; a tool or approval error is not a generation and is not.
  `hit_step_cap` is true only when the last allowed step still asked for tools.
- `proposal_extraction`: the `generateObject` call of a model Proposal pass, with `project_id`, `trigger` and `source_count`.
- `reflection`: the `generateObject` call that rewrites the Profile and Working Memory, with `conversation_id` and `project_id`, under the `$ai_trace_id` of the Assistant turn that triggered it.

Failures are recorded with `$ai_is_error: true` and the error class name only, since a provider message can echo the prompt.
A structured-output mismatch keeps the tokens it spent.
For the two `generateObject` spans, `$ai_latency` covers the whole call, including any retries the SDK makes after a provider error.
`$ai_provider` is the provider family (`openai`), not the SDK's per-API name (`openai.responses`).
`$ai_input` and `$ai_output_choices` are never sent, so no prompt, Evidence text or answer reaches PostHog.

The Proposal funnel rows were verified on branch `fix/auth` against a local collector with the real browser and server SDKs; see [the funnel artifact](../artifacts/74-proposal-funnel/README.md) for the run and its reconciliation.
The [28 September audit](posthog-2026-09-28/README.md) verifies historical events in the actual PostHog project and a fresh deployed landing pageview.
It does not certify a fresh authenticated production funnel or a deployed release SHA; local real-SDK reconciliation and historical production-project observations remain distinct evidence.

## Data safety

No raw evidence text, transcripts, prompts, names, emails, or project titles are sent.
Explicit custom properties contain internal ids and bounded metadata; internal ids are not necessarily hashed.
The browser SDK also supplies technical browser, host, and session metadata, and PostHog may enrich events.
These are pseudonymous analytics, not a claim of anonymous or metadata-free collection.

## Dashboard checklist

- [x] Confirm the deployed browser sends to PostHog project `618308`; a fresh pageview was received on 28 September 2026.
- [ ] Trigger every defined event in controlled authenticated production flows and reconcile it with the deployed release; historical coverage and a fresh anonymous pageview are verified.
- [x] Inspect saved AI usage and core product dashboards, including Project counts, Proposal outcomes, and question volume.
- [ ] Add or verify a signup funnel and top-pages view, and correct the general product funnel.
- [x] Query `$ai_generation` for Assistant, extraction, and Reflection spans; cost and token coverage exists for 20 of 47 calls, with limitations recorded in the audit.
- [ ] Add insights for tool approval rate (`assistant_tool_approval` by `approved`), turns hitting the step cap and `assistant_limit_reached` (M13, M17).
- [x] Preserve and embed all four supplied dashboard screenshots with checksums and query context.
