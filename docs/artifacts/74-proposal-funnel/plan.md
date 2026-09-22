# Issue #74: measure the Evidence to Proposal to Decision funnel

Source: https://github.com/BrandonLYS/CS3216-Assignment-3/issues/74.
Base: `b512770` on `origin/main`.
Depends on the identity and session contract from [issue #73](../73-analytics-identity/README.md), which is already on `main`.

## Defects to reproduce first

`runProposalPassAction` is the only caller that captures `proposal_generated`.
Automatic passes reach `proposalsService.runPass` through `scheduleProposalPass`, so Evidence and Comment writes generate Proposals that analytics never sees.
The manual capture also fires when a pass produced nothing, because the action only checks that the outcome carries a `proposed` field, not that anything was created.
`edited_before_accept` is not measured at all: `acceptProposalAction` hardcodes `false` and `createDecisionAction` hardcodes `true`, so opening the review form and accepting it unchanged is recorded as an edit.
Both reproductions run against the real services and the real browser flows before any application change.

## Event contract

One contract covers both triggers.
The proposals module owns it in `src/server/modules/proposals/analytics.ts`, and both entry points call into that module instead of restating properties in an action.

| Event                | Emitted when                                   | Properties                                                                                |
| -------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `proposal_generated` | A pass committed at least one new Proposal row | `project_id`, `trigger`, `extractor`, `proposal_count`, `source_count`, `discarded_count` |
| `proposal_accepted`  | The accept transition committed                | `project_id`, `proposal_id`, `extractor`, `edited_before_accept`                          |
| `proposal_rejected`  | The reject transition committed                | `project_id`, `proposal_id`, `extractor`                                                  |

`trigger` is `manual` for `runProposalPassAction` and `automatic` for a pass scheduled after an Evidence or Comment write.
`proposal_count` is the number of rows the insert actually returned, never the number of candidates the extractor offered.
A pass that is skipped, fails, finds nothing new, keeps nothing traceable, or loses the fingerprint race to a concurrent pass emits no event at all, so no outcome can inflate the funnel or report a success that did not happen.
`extractor` distinguishes the heuristic from the model, so a funnel can be read per extraction quality.
Every server capture already carries `$session_id` when the originating browser session correlates; `browser_context` is added to the shared helper so an absent browser session is an explicit value rather than a missing property.
Payloads stay ids and bounded metadata: no Sources, Evidence text, excerpts, titles, Assumption statements or Person names.

## Deciding `edited_before_accept`

The baseline is what the Assistant proposed, expressed as the accept input the one-click path builds from the Proposal with no overrides.
The accepted content is what the transition actually wrote.
`title`, `chosen`, `context`, `alternatives` and `revisitWhen` differ when their trimmed values differ, with null and empty string treated as the same absence, so adding Context the Proposal did not state is an edit.
`decidedOn` counts only when the Proposal stated a date and the accepted date differs, because accepting a dateless Proposal has to stamp a date and that substitution is not the PM's edit.
Sources differ when the set of kind, entity, Passage and excerpt tuples differs, which covers removing a cited Source or picking another one in the review form.
Assumptions differ when the kept count differs or any statement, subtype, target type, target id, target field or assumed-until value differs, which covers the review form's per-Assumption keep checkbox.
The Owner is never proposed, so setting one is not counted as editing the Proposal.
The result follows from the data in both paths: one-click acceptance computes `false` because it submits the baseline, and the review form computes `false` when it is submitted untouched.

## Where the captures live

Generation moves into `proposalsService.runPass`, after the transaction that writes the pass bookkeeping and the new rows.
This is the single point both triggers already share, and it is the only place that knows how many rows were really inserted.
Acceptance moves into `decisionsService.create`, after its transaction commits, because that transaction is where a Proposal becomes a Decision for both the one-click and the review-form paths, and it is the only place that holds the Proposal row and the accepted input together.
Rejection moves into `proposalsService.reject`, after `markRejected` returns a row.
All three transitions are already guarded by a conditional update on the pending status, so a repeat request throws `ConflictError` and emits nothing.
The captures run after the write, never inside the transaction, and their failures stay swallowed by the existing analytics helper, so telemetry cannot fail a completed mutation.
`capture(ctx.userId, ...)` is used rather than `captureCurrent`, because a background pass has a trusted `Ctx` but its own request may already have been answered.
An automatic pass scheduled with `after()` still runs inside the originating request, so the browser session correlates when it is there and `browser_context` says so when it is not.

## Out of scope

No schema migration, no new UI, no change to the extraction logic, to authorization, to the mutation and Activity Event rules, or to what the review form posts.
Production PostHog credentials are not available to this branch; the funnel is verified against the local collector the issue #73 harness already starts, and that limitation is recorded in the artifact rather than papered over.

## Commit points

1. `docs: plan the Proposal funnel measurement (#74)`.
   The plan and its review record.
2. `test: reproduce unmeasured automatic passes and hardcoded edit attribution (#74)`.
   Integration coverage over the real services and a browser regression over the real Evidence and review flows, failing against the current behaviour.
3. `fix: measure the Proposal funnel from both triggers (#74)`.
   The shared event contract, the three capture points, the computed edit decision and the explicit browser-context property.
4. `docs: record the funnel event contract and verification (#74)`.
   Artifact README, verified events, the M19 event table and the architecture note that currently documents the gap.

## How to test

```sh
npx vitest run src/server/modules/proposals src/server/modules/decisions src/shared/analytics
npm test
ANALYTICS_E2E=1 npx playwright test --config playwright.analytics.config.ts
npm run typecheck
npm run lint -- --max-warnings=0
npm run format:check
```

Integration tests use the existing `db_test` harness and stub the analytics module, asserting the exact event names and properties.
They cover an automatic pass, a manual pass, a pass with no new Sources, a not-configured pass, an extractor that throws, a pass whose output is entirely untraceable, two concurrent passes over the same Sources, a repeated accept and a repeated reject.
They cover one-click acceptance, an unchanged review-form acceptance, and edited acceptances that change the title, the Sources and the kept Assumptions.
The browser regression signs up, creates a Project, adds Evidence carrying a decision sentence so the automatic pass runs without a manual click, then accepts one Proposal unchanged, edits and accepts another, and rejects a third, asserting the funnel events and their properties at the collector.
Event counts at the collector are reconciled against the persisted Proposals and Decisions for that Project.

## Review outcomes folded into this plan

An automatic pass runs inside `after()` scheduled from a Server Function, where `headers()` is allowed; the same call from a Server Component would throw, so a future caller outside an action or Route Handler has to read request context before scheduling ([`after` reference](../../../node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md)).
`decisionsService.create` returns the Proposal it marked out of its transaction so the capture can run after the commit; its public return value stays the Decision.
Any caller that confirms a Proposal through that service is an acceptance, including a future Assistant tool call, which is the behaviour the funnel wants.
A pass that creates nothing stays silent by design, so the funnel measures created Proposals and not pass volume; pass frequency is deliberately not recoverable from these events.
`browser_context` belongs in the shared server capture helper rather than in the funnel properties, so every server event states it the same way; two existing unit assertions that pin an empty property object are updated with it.
