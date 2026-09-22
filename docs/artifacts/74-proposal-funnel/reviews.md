# Review log

## Plan review

The plan was challenged against issue #74, the existing analytics contract from issue #73 and the current Proposal code before any implementation.

Round 1 raised five points.
Capturing inside the accept transaction would report an acceptance that a failed commit never made, so all three captures were moved to after the commit and `decisionsService.create` now lifts the marked Proposal out of its transaction.
Reading request context inside the `after()` callback needed checking rather than assuming: the installed Next reference allows `cookies()` and `headers()` inside `after` for Server Functions and Route Handlers and forbids it in Server Components, and `scheduleProposalPass` is only ever called from a Server Function, so an automatic pass keeps the originating browser session.
The first draft measured "edited" against the persisted Decision; the baseline is now the accept input the one-click path builds from the Proposal, which is the only definition under which an untouched review form and a one-click accept agree.
`decidedOn` had to be excluded when the Proposal stated no date, because the accept path substitutes one and that substitution is not the PM's edit.
Putting `browser_context` on the funnel events alone would have left every other server event silent about the same thing, so it moved into the shared capture helper.

Round 2 checked the review-form path against the code rather than the description.
The source picker submits exactly `kind`, `entityId`, `passageId` and `excerpt`, and the confirm form submits the Proposal's own Assumption objects, so an untouched form reproduces the baseline and computes `false` rather than a false edit.
Repeat acceptance and repeat rejection were confirmed to throw on the existing conditional updates before any capture runs.
A pass losing the fingerprint race returns no inserted rows and therefore emits nothing.

Round 3 verdict: the plan converged with no remaining blockers.
The reviewer recorded one accepted consequence: a pass that creates nothing is silent, so these events measure created Proposals and never pass volume.

## Implementation review

Fixed point: `b512770`.
The code-review skill ran its Standards and Spec agents in parallel against the implementation.

### Standards

No documented-standard breach.
Moving the captures out of the actions brought both action files closer to the "thin actions" rule, and ADR 0005, 0007 and 0008 are unaffected.

Two findings were fixed.
`proposalGenerated` restated the pass outcome with `created` where the outcome says `proposed`, so the same number had three names; the pass now hands its own outcome to the event.
`same` hid an order-insensitive comparison and sorted in place, so it is now `sameSet` over copies.

Three were recorded and left.
`PassTrigger` lives in the proposals module rather than `src/shared/domain`, because that file holds the fixed vocabularies backed by Drizzle enums and this one is never persisted.
`editedBeforeAccept` reads two other objects and little of its own, which is inherent to a comparison, and it sits next to the event that is its only caller.
The browser regression polls with a delay because a pass finishes after the response and offers no assertable signal until the Overview shows its cards; the poll re-reads through the PM's own navigation and fails loudly rather than hanging.

### Spec

Three findings were fixed.
`trigger` defaulted to `manual`, so a caller that forgot it would be recorded as a manual pass, which is the mis-attribution the issue exists to end; it is now a required argument and every call site states it.
`proposal_generated` could not tell Evidence from Comments although the issue's funnel starts at both, so the pass now splits its candidate count into `evidence_source_count` and `comment_source_count`.
The Owner was excluded from the edit decision on the grounds that it is never proposed, which contradicted counting other content the PM adds; supplying an Owner is now an edit, and the review form's empty default keeps an untouched form unedited.

Two were about work the reviewer could not see, because it was still in the working tree when the review ran: the coverage of an Evidence update, a Comment-triggered pass and a retry after a failed extractor, and the artifact and event-definition documents.
Both are in this branch.

Two were recorded and left.
`discarded_count` is bounded extraction-quality metadata rather than scope creep, and it is what makes a low `proposal_count` readable.
Production Live Events evidence cannot be captured from this branch; the reconciliation was run against the local collector with the real SDKs, and the M19 guide says plainly that a production run with its release SHA and timestamp is still owed.

The reviewer also noted that the browser regression asserts `browser_context: "browser"` and so does not cover the case where it is `none`.
That case is the issue #73 transport gap described in the README: the funnel records it honestly rather than hiding it, and closing it means changing when that transport is installed, which belongs to its own issue.

## Correctness review of the pull request

A third reviewer read the whole branch for correctness only, with a concrete failure scenario required for each finding.
It found no way to emit an event without its write, no way to miss one, and no behaviour change in the restructured `decisionsService.create`.

Three real defects were fixed.
Exempting `decidedOn` whenever the Proposal stated none was too broad: a PM who back-dated an otherwise untouched Decision was recorded as not having edited it.
The comparison now uses the date a one-click accept would have stamped, so filling the required field with today is data entry and any other date is the PM's own change.
`supersedesId` was not compared at all, although the review form posts it, so linking a Decision the Proposal never suggested read as unedited.
The payloads were built as call arguments, outside the analytics helper's isolation, so a malformed stored Proposal could throw after the acceptance had already committed and show the PM an error for a write that had succeeded; each emit now isolates payload construction as well as delivery.

Two smaller ones were fixed too.
The set comparison joined fields and entries with unescaped delimiters, so an excerpt containing them could make two Sources compare equal to one.
The comment on `browser_context` claimed it marks background work, which is wrong: a pass scheduled with `after()` still reads its originating request and correctly reports a browser session, and only `trigger` says how the pass started.

The reviewer also noted that `asSubmitted` in the integration tests is the suite's own model of what the review form posts, so a future change to the dialog or the source picker would not be caught there.
The browser regression is what covers that, by driving the real form.
