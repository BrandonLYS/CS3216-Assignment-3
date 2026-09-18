# Implementation notes - #42 Ingest meeting transcripts as Evidence with passage-level citation

Branch `feat/42-transcripts`, base `fea1c26` (main after #41).
Implemented commit by commit as laid out in [plan.md](./plan.md).

## Commits

| #   | Commit                                                                                                                   | Files                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `feat(domain): transcript Evidence kind and Passage vocabulary`                                                          | `shared/domain`, `evidence/schema.ts`, `decisions/schema.ts`, `drizzle/0010_transcripts.sql`, `CONTEXT.md`, ADR 0008                    |
| 2   | `feat(evidence): transcript segmentation on ingest`                                                                      | `evidence/passages.ts` (+test), `evidence/repository.ts` (`passagesRepo`), `evidence/service.ts` (`syncPassages`, `passages`) (+test)   |
| 3   | `feat(decisions): a Source may cite one Passage of a transcript`                                                         | `decisions/{service,answers,repository}.ts` (+tests), `shared/lib/hrefs.ts` (`passageHref`), `source-picker.tsx`, `decision-dialog.tsx` |
| 4   | `feat(evidence): Passages rendered with anchors; scroll to a cited Passage`                                              | `evidence/page.tsx`, `evidence-view.tsx`, `shared/ui/scroll-to-hash.tsx`                                                                |
| 5   | `feat(proposals): prefer transcripts and cite Passages`                                                                  | `proposals/{extract,trace,service,schema}.ts` (+tests), `proposal-cards.tsx`, `assistant/repository.ts` (`findOrCreate` race fix)       |
| 6   | `test(e2e): transcripts flow, docs row, screenshots`                                                                     | `e2e/flows.spec.ts`, `docs/flows.md`, `docs/transcripts/screenshots/*`, refreshed `docs/evidence/screenshots/*`                         |
| 7   | `refactor(transcripts): shared passageWhere and evidenceText, Passages composed in the service, stricter bare-time rule` | after the two-axis code review (below)                                                                                                  |
| 8   | `docs: implementation notes for #42`                                                                                     | this file                                                                                                                               |

## Deviations from the plan (real code won)

1. **Fallback guard**: the plan said "fewer than two labelled passages or fewer than two distinct speaker names"; two distinct pseudo-speakers (`Attendees:`, `Note:`) would have passed that.
   The rule is: at least two labelled turns and (some speaker speaks twice, or every labelled turn has a timestamp, or labelled lines are at least half of the non-blank lines).
   A two-speaker meeting with long wrapped turns stays labelled; minutes with two singleton colons fall back to paragraphs; a timestamp-only transcript (`[00:00:05]` lines) is labelled.
2. **`TIME_LEAD`** (a timestamp with no speaker) was not in the plan's regex list; it needs brackets or a dash so `12:30 meeting moved to Friday` stays prose.
3. **`sourceLabels` lives on `decisionsService`**, not `proposalsService` as the plan's fact list said; it gained the `evidence:<id>:<passageId>` keys there.
4. **`SourceCandidates` is typed and composed in `decisionsService.sourceCandidates`** (repository + `passagesRepo.listForProject`), so no repository imports another module's repository.
5. **`update` re-segments on `kind` or `body` changes only**: `extractedText` is not editable through `updateEvidenceSchema`, so the plan's "or extractedText" has no path today.
6. **Pre-existing flake fixed on the way**: `conversationsRepo.findOrCreate` was check-then-insert and the proposals race test hit `conversations_user_project_unique`; it now inserts with `ON CONFLICT DO NOTHING` and re-selects.
7. **E2E**: the Proposal pass already runs after the ingest (`proposals/schedule.ts`), so the button reports "Nothing new to read" and the card is already on the Overview; the flow accepts either note.
   Two waits were added after selecting the transcript in the list (URL `?item=` and the heading) because `Edit` acts on the currently selected item and a click straight after selection could edit the previous one.

## Two-axis code review

- Spec axis: PASS on all ten criteria; flagged the bare-time false positive (fixed in commit 7) and the guard rewrite (kept, documented above).
- Standards axis: no must-fix; the four should-fix items (duplicated `evidenceText` and `passageWhere`, repository-to-repository import, CONTEXT.md using its own banned word) became commit 7.
  Not changed: `passagesRepo.listForProject` has no `limit` (Passages exist only for transcripts; the picker needs all of a transcript's Passages to cite one).

## Test results

- `npx vitest run src/server/modules/evidence`: 34 (9 segmenter, 6 transcript service, existing).
- `npx vitest run src/server/modules/decisions`: 38 (2 passage Sources, `sourceHref` with `passageId`).
- `npx vitest run src/server/modules/proposals`: 15 (`attachPassages`, transcript pass, accept after re-segmentation).
- `npm test`: **32 files, 255 tests passed** before commit 7; the three suites above re-run green after it.
- `npm run typecheck`, `npm run lint`, `npm run format:check`: clean after every commit.

## E2E and proof

- `E2E_PORT=3142 E2E_NO_SERVER=1 npx playwright test e2e/flows.spec.ts`: **21 passed**.
- `docs/transcripts/screenshots/`: `01-transcript-passages` (four turns with speaker and timestamp, label stripped from the text), `02-passage-source-picked` (chip "Steering meeting transcript · Marcus" with its Open link), `03-citation-opens-passage` (Evidence page scrolled to and ringing Marcus's turn), `04-proposal-cites-passage`, `05-degraded-to-whole-document` (after a body edit the chip reads the title only and Open lands on the item).
