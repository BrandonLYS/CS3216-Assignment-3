# Implementation notes - #40 "Why did we..." answers with citations

Branch `feat/40-why-did-we`. Implemented commit by commit as laid out in [plan.md](./plan.md).

## Commits

| #   | Commit                                                                                                   | Files                                                                                                                                                            |
| --- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `feat(decisions): search read model with cited source links`                                             | `src/server/modules/decisions/{answers,answers.test,service,validation,service.test}.ts`, `src/server/modules/comments/repository.ts`, `src/shared/lib/hrefs.ts` |
| 2   | `feat(assistant): search_decisions tool and citation rules`                                              | `src/server/modules/assistant/{tools,tools.test,prompt,prompt.test}.ts`                                                                                          |
| 3   | `feat(assistant): clickable citations in the dock and History deep links`                                | `src/widgets/assistant/{linked-text,linked-text.test,assistant-dock}.tsx`, `src/features/history/item-dialog-tabs.tsx`, `e2e/flows.spec.ts`                      |
| 4   | `feat(assistant): ready-made citations, absolutised link tolerance, message upsert dedupe; visual proof` | `decisions/service.ts`, `assistant/prompt.ts`, `assistant/repository.ts` (+test), `widgets/assistant/linked-text.tsx` (+test), `docs/why-did-we/screenshots/*`   |
| 5   | `docs: implementation notes for #40`                                                                     | this file                                                                                                                                                        |

## Deviations from the plan (real code won)

1. **`evidenceHref` moved to `src/shared/lib/hrefs.ts`** (re-exported from `evidence-chip.tsx`) so a server module does not import a UI component file.
2. **First live run showed two model habits** the plan did not anticipate: it rewrote relative hrefs as `https://example.com/projects/...`, and it cited the Decision rather than the Decision's Sources.
   Fixes: `LinkedText` keeps the in-app part (path, query, hash) of an http(s) URL whose path is an app route and still refuses everything else; the tool output carries ready-made `cite` strings per Source and Decision plus a joined `sourceCitations` per Decision, and the prompt rule tells the model to append `sourceCitations` verbatim after each claim.
   The second run cited the Evidence Source inline (screenshot 01) and the link opened the Evidence (02).
3. **`tab=history` deep link** loads History on mount via a deferred call (`Promise.resolve().then(load)`), because the repo's lint rule forbids synchronous `setState` in effects and History is otherwise fetched on tab activation only.
4. **Pre-existing bug fixed on the way**: re-sending a turn produced `ON CONFLICT DO UPDATE command cannot affect row a second time` in `messagesRepo.upsertMany` (duplicate Message id in one batch), which surfaced as "Something went wrong" in the dock during the proof run.
   Rows are now deduped by `(conversationId, id)` with the last occurrence winning; test added.
5. **Visual proof is model-backed and manual** (`gpt-4o-mini`), captured with a one-off Playwright script against the seeded e2e account; the deterministic parts (tool output hrefs, prompt rules, link rendering, History deep link) are covered by unit and e2e tests.

## Test results

- `npx vitest run src/server/modules/decisions`: 33 (5 `answers`, 3 `search`).
- `npx vitest run src/server/modules/assistant`: 28 (tool list, `search_decisions` hrefs and Proposal exclusion, foreign Project rejection, prompt rules, Message dedupe).
- `npx vitest run src/widgets/assistant`: 4 (`splitLinks`).
- `npm test`: **29 files, 222 tests passed**.
- `npm run typecheck`, `npm run lint`, `npm run format:check`: clean after every commit.

## E2E and proof

- `E2E_PORT=3140 E2E_NO_SERVER=1 npx playwright test e2e/flows.spec.ts`: **19 passed**; the `history` flow now ends by visiting `?task=<id>&tab=history` and asserting the History tab is selected (screenshot `06-deep-link-history-tab`).
- `docs/why-did-we/screenshots/`: `01-why-switch-answer` (reason, alternatives, Evidence Source link, Decision link), `02-source-link-opened` (Evidence page after clicking the citation), `03-no-recorded-decision` ("There is no recorded decision about why we chose Cypress" plus nearest Evidence link), `04-superseded-names-successor` (D-1 replaced by D-2, both linked).
