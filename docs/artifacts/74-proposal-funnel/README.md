# Evidence to Proposal to Decision funnel

Issue: [#74](https://github.com/BrandonLYS/CS3216-Assignment-3/issues/74).
Plan: [plan.md](plan.md).
Review record: [reviews.md](reviews.md).
Builds on the identity and session contract from [issue #73](../73-analytics-identity/README.md).

## Reproduction

Both defects were reproduced at `b512770` before any application change, through the real services and the real browser flows.

The integration suite drives the actual Proposal pass, accept and reject against the test database and watches the analytics seam.
Six of its assertions failed: an automatic pass recorded nothing, a manual pass recorded nothing from the service that knows what it created, and acceptance and rejection were never recorded by the writes that made them.

The browser regression signs up, creates a Project and adds Evidence carrying a decision sentence.
Adding Evidence schedules a pass, Proposals appear on the Overview, and no `proposal_generated` event ever arrives, so the run failed while the Proposals were on screen.
With that first assertion removed, the same run reached the review form, submitted it untouched apart from the required date, and the resulting `proposal_accepted` carried `edited_before_accept: true`, which is the hardcoded value from the submission path rather than a measured difference.

## Event contract

The proposals module owns the contract in `src/server/modules/proposals/analytics.ts`, and the transitions emit it after the write rather than the action that started them.

| Event                | Emitted when                                   | Properties                                                                                                                                 |
| -------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `proposal_generated` | A pass committed at least one new Proposal row | `project_id`, `trigger`, `extractor`, `proposal_count`, `source_count`, `evidence_source_count`, `comment_source_count`, `discarded_count` |
| `proposal_accepted`  | The accept transaction committed               | `project_id`, `proposal_id`, `extractor`, `edited_before_accept`                                                                           |
| `proposal_rejected`  | A pending Proposal was marked rejected         | `project_id`, `proposal_id`, `extractor`                                                                                                   |

`trigger` is `automatic` for a pass scheduled after an Evidence or Comment write and `manual` for one the PM asked for.
It is a required argument of `runPass`, so a new caller has to state which it is rather than inherit a default that would recreate the mis-attribution this issue is about.
The Source counts split the pass's candidates into Evidence and Comments, so a Proposal's origin stays readable in the funnel.
`proposal_count` is what the insert returned, never what the extractor offered.
A pass that created nothing emits nothing: not configured, nothing new, a failed extractor, output that was entirely untraceable, and the loser of two passes racing on the same Sources are all silent, so no outcome can inflate the funnel or report a success that did not happen.
The consequence is deliberate: these events count created Proposals and never how often a pass ran.

Acceptance is recorded by `decisionsService.create`, the transaction where a Proposal becomes a Decision, because both the one-click path and the review form converge there and it is the only place that holds the Proposal and the accepted content together.
Rejection is recorded after the conditional update returns a row.
All three transitions are guarded by an update that only matches a pending Proposal, so a repeated request throws and records nothing.
Any caller that confirms a Proposal through the service is recorded, including a future Assistant tool call.

## What counts as an edit

`edited_before_accept` compares what was accepted with what was proposed, not which form posted it.
`title`, `chosen`, `context`, `alternatives` and `revisitWhen` differ when their trimmed values differ, with null and empty string treated as the same absence, so adding Context the Proposal never stated is an edit.
`decidedOn` is compared against the date the Proposal stated, or, when it stated none, against the date a one-click accept would have stamped; the review form requires the field, so filling in that date is data entry rather than an edit, while any other date the PM picks is their own choice and counts.
Sources differ when the set of kind, entity, Passage and excerpt tuples differs.
Assumptions differ when the kept count differs or any statement, subtype, target type, target id, target field or assumed-until value differs, which is how the review form's per-Assumption keep checkbox is caught.
An Owner and a supersede link are never proposed, so supplying either is an edit; the review form leaves both empty for a Proposal, so an untouched form still computes `false`.
One-click acceptance and a review form submitted untouched both compute `false` from the data rather than by assumption.

## Identity, session and payload safety

Captures use the trusted `Ctx.userId` and the shared server helper, so the identity and session rules from issue #73 are unchanged.
An automatic pass runs in `after()` scheduled from a Server Function, where request context is still readable, so a background pass keeps the originating browser session when there is one.
Every server event now carries `browser_context`: `browser` when the originating browser session correlates, `none` when there is none, so absent context is a value rather than a missing property.
Building a payload is treated as fallibly as sending one: a malformed stored Proposal cannot turn a committed acceptance into an error the PM sees, because the whole emit is isolated, not just the delivery.
Payloads carry internal ids and bounded metadata only.
No Sources, excerpts, Evidence text, titles or Assumption statements are sent, and the regression suites assert that.

## Known limitation, not fixed here

A Server Action dispatched immediately after a full page load can reach the server without the `X-PostHog-Session-Id` header, so its event records `browser_context: "none"` although a browser session exists.
The same action carries the header once the PM has navigated within the application.
This is a timing gap in the issue #73 session transport rather than in the funnel, it is visible in the funnel data instead of silently wrong, and fixing it means changing when that transport is installed.
It deserves its own issue.

## Verification commands

```sh
npx vitest run src/server/modules/proposals src/shared/analytics
npm test
ANALYTICS_E2E=1 npx playwright test --config playwright.analytics.config.ts
npm run typecheck
npm run lint -- --max-warnings=0
npm run format:check
```

The browser regression runs in the issue #73 harness: a real browser, the real browser and server SDKs, and a local collector replacing only the ingestion endpoint.
It exercises an automatic pass from added Evidence, a review form submitted unchanged, a one-click acceptance, an edited acceptance and a rejection, then reconciles the events with what the Project persisted: four Proposals raised, three accepted, one rejected, exactly one of the acceptances edited, matching the Decisions page's own `3 of 4`.
The integration suite covers the rest of the entry points: a manually requested pass, the passes an Evidence update and a new Comment schedule, a retry after a failed extractor, and acceptances that change Sources or drop an Assumption.
A manually requested pass cannot be isolated in the browser, because every Evidence and Comment write already schedules one and the manual button then has nothing new to read.
[Verified events](verified-events.json) hold the funnel events from that run, with event names, synthetic internal ids, session ids and timestamps only.

Production PostHog credentials are not available to this branch, so the Live Events reconciliation was done against the local collector with the real SDKs rather than against the production project.
The event definitions in [the M19 guide](../../submission/m19-analytics.md) are updated to this contract; the release SHA and timestamp for a production run still have to be added by whoever has that access.
