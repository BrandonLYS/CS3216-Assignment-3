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
