# Implementation notes - #39 The Assistant proposes Decisions for confirmation

Branch `feat/39-proposals`. Implemented commit by commit as laid out in [plan.md](./plan.md).

## Commits

| #   | Commit                                                                                                                            | Files                                                                                                                                                                                                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `feat(domain): Proposal vocabulary, schema and migration`                                                                         | `src/shared/domain/index.ts`, `src/server/db/{enums,schema}.ts`, `src/server/modules/proposals/schema.ts`, `drizzle/0009_proposals.sql`, `CONTEXT.md`, `.env.example`                                                                                                       |
| 2   | `feat(proposals): extractor contract, heuristic extractor and traceability filter`                                                | `src/server/modules/proposals/{extract,trace}.ts` + tests                                                                                                                                                                                                                   |
| 3   | `feat(proposals): repository and service (pass, accept, reject, stats); decisions create takes proposalId and inline assumptions` | `src/server/modules/proposals/{repository,service,service.test}.ts`, `src/server/modules/decisions/{service,validation}.ts`, `src/server/modules/comments/repository.ts`                                                                                                    |
| 4   | `feat(proposals): actions, after() scheduling, Overview proposal cards, edit-and-accept dialog and acceptance rate`               | `src/server/modules/proposals/{actions,schedule}.ts`, evidence/comments/decisions `actions.ts`, `src/widgets/attention/proposal-{cards,actions}.tsx`, `src/features/decision/{decision-dialog,decisions-view,propose-button,source-picker}.tsx`, Overview + Decisions pages |
| 5   | `test(e2e): proposals flow, docs row and screenshots`                                                                             | `e2e/flows.spec.ts`, `docs/flows.md`, `docs/proposals/screenshots/*`                                                                                                                                                                                                        |
| 6   | `docs: implementation notes for #39`                                                                                              | this file                                                                                                                                                                                                                                                                   |

## Deviations from the plan (real code won)

1. **Both accept paths converge on `decisionsService.create`** (review finding): it gained `proposalId` and inline `assumptions[]`, creates the Assumptions with the internal `createAndAttach` helper and marks the Proposal accepted inside the same `mutate`.
   `proposalsService.accept` builds the input from the Proposal and calls it under `via: "assistant"`; `createDecisionAction` sets `via: "assistant"` when `proposalId` is posted.
2. **`SourceInput.excerpt`**: `resolveSources` keeps a caller-supplied excerpt when it occurs in the Source text, so an accepted Decision cites the verbatim sentence, not the first line.
3. **Heuristic extractor is the default when no model is configured**, and `PROPOSALS_EXTRACTOR=heuristic` forces it (the e2e dev server uses that); `PROPOSALS_EXTRACTOR=model` without a key disables the pass.
4. **Dependency Assumptions are never proposed** (`traceAssumption` drops them): an extractor cannot name a Dependency reliably; the PM adds those by hand.
5. **The Conversation is context, not a Source**: the extractor prompt receives the last 12 turns, but citations must point at Evidence or Comments, the only citable kinds in ADR 0008.
6. **Comments are Sources too** (the issue names them as citations), so `commentsRepo.listByProject` was added and each Comment is passed with an `Comment by <name>` title.
7. **Hash bookkeeping** rows are upserted with `excluded.text_hash` so an edited Source is re-passed once per distinct text.

Everything else (fingerprint, `unique(projectId, fingerprint)`, single-transaction pass bookkeeping, caps and prompt-injection stance, `after()` scheduling from the Evidence and Comment actions plus the explicit "Propose from evidence" button, Overview cards with testids, acceptance readout, no writes to the graph) matches the plan.

## Test results

- `npx vitest run src/server/modules/proposals`: extract 3, trace 4, service 7 (pass + idempotency + graph-count invariance, untraceable discard, rejected not resurrected, heuristic fallback and env, accept with `via: "assistant"` + excerpt + Assumptions + stats, dialog path, ownership) - green.
- `npx vitest run src/server/modules/decisions`: 25 green after the `create` refactor.
- `npm test`: **26 files, 204 tests passed**.
- `npm run typecheck`, `npm run lint`, `npm run format:check`: clean after every commit.

## E2E

`E2E_PORT=3139 E2E_NO_SERVER=1 npx playwright test e2e/flows.spec.ts` with `PROPOSALS_EXTRACTOR=heuristic` in the dev server env - **19 passed** including `proposals`.
Screenshots in `docs/proposals/screenshots/`: the proposal card with its verbatim excerpt, the prefilled "Confirm proposed decision" dialog, the History tab with "via Assistant", the list after a one-click accept, the acceptance readout "2 of 3".
