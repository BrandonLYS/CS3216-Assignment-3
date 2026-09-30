# Implementation notes - #115 Review and accept Task and Milestone Proposals

What was built follows `plan.md`; this file records where it deviated and what was verified.

## Deviations from the plan

- `listPendingItems` returns `acceptInput: null` for a payload the create schema refuses, instead of failing the Overview.
  Such a card has Accept disabled, says it cannot be accepted as it stands, and still offers Edit and accept and Reject.
- An edited input of the other kind (a Task form posted for a Milestone Proposal) is a `ConflictError`, not a silent create of the wrong item.
- The Overview no longer shows "Nothing needs attention" under pending alerts or Proposals, which it contradicted.
  This was already visible with Decision Proposals; it is fixed here because the new cards made it prominent.
- `e2e/item-proposals.proof.spec.ts` captures the UI proof separately from `e2e/item-proposals.spec.ts`, following the existing `*.proof.spec.ts` pattern; `PROOF_PHASE=before` produced the baseline before the UI existed.

## Verification

- `npx vitest run src/server/modules/proposals` covers `acceptInputOf` (pure), the accept service against the test database (default Status, Evidence links, Activity Events via the Assistant, deferred Milestone re-resolution, parallel accepts, a reject racing the accept rolling the Task back, edited input, a foreign Project refused, deleted Evidence skipped, Comment Sources not linked, a rejected item not raised again, a stranger refused) and the `item_proposal_accepted` payload and edit rule.
- `e2e/item-proposals.spec.ts` under `PROPOSALS_EXTRACTOR=heuristic`: exactly one Task and one Milestone Proposal from one Evidence item, one-click accept of the Milestone, edit and accept of the Task with a new title, both items on their pages, attributed "via Assistant", and linked to the Evidence; green in four consecutive runs.
- UI proof: `artifacts/before-item-proposal-review.png` (pending item Proposals had no surface), `artifacts/after-item-proposal-cards.png`, `artifacts/after-item-proposal-task-dialog.png`, `artifacts/after-item-proposal-milestone-dialog.png`.
