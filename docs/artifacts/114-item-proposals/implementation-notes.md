# Implementation notes - #114 Task and Milestone Proposals

What was built follows `plan.md`; this file records where it deviated and what was verified.

## Deviations from the plan

- Duplicate check covers every item Proposal already raised, not only pending ones.
  A title the PM rejected, restated in a later Evidence item, is not raised again; an accepted one became a Task or Milestone and is caught by the existing-item check.
- Titles repeated inside one pass are deduplicated as well as fingerprints, so two excerpts naming the same work yield one Proposal.
- `pickExtractor` stayed in `extract.ts` unchanged; `pickExtractors` in `extract-items.ts` wraps it, which avoids a circular import and keeps the model-or-heuristic choice in one place.
- `AiSpan` gained `item_extraction`, and `docs/submission/m19-analytics.md` lists the fourth span.
- The generated migration re-created the primary key before adding the `pass` column it references; the two statements were reordered by hand and the migration was run against a copy of the local dev database with 32 existing rows, which all became `pass = decision`.

## Verification

- `npx vitest run src/server/modules/proposals`: 70 tests, including a snapshot that pins the Decision prompt byte for byte across the refactor.
- End to end through the UI on a dev server with `PROPOSALS_EXTRACTOR=heuristic` and the local database: adding Evidence with an action item, a `Milestone:` line and a decision sentence produced one Task Proposal, one Milestone Proposal and one Decision Proposal from the automatic pass, one `proposal_pass_sources` row per pass, and no rows in `tasks`.
- `e2e/flows.spec.ts` (21 flows) and `e2e/propose-review.spec.ts`: green four runs out of five.
  One run on a cold dev server failed a `toBeHidden` in the proposals flow and did not reproduce in three further runs with two workers.
- Two pre-existing e2e failures on `main` were fixed on the way: the auth flow never dismissed the product tour that signup starts, and the command-palette flow pressed ⌘K before the shell's listener had hydrated.
- No UI changed, so there is no UI proof for this ticket; the review surface is #115.
