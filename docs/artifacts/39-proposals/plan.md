# Plan - #39 The Assistant proposes Decisions for confirmation

Branch `feat/39-proposals`, worktree `/Users/qang/projects/CS3216-A3-wt/39-proposals`.
Builds on ADR 0007 (Assistant acts through services with `via`), ADR 0008 (proposals live in their own table, nothing enters `decisions` until a human accepts) and the `decisions` module (#37).
New module `src/server/modules/proposals/`, one migration, a proposal panel on the Project Overview, an "Edit and accept" path through the existing Decision dialog, and an acceptance-rate readout on the Decisions page.

## 1. Summary

A **Proposal pass** reads recent Evidence and Comments of one Project (plus the recent Conversation as context), asks an extractor for Decision candidates, keeps only those that cite a traceable Source (an Evidence item or Comment in the Project whose text contains the quoted excerpt), and stores them in `decision_proposals` as `pending`.
Pending Proposals appear on the Project Overview under "Needs attention" next to impact alerts.
Accept writes a confirmed Decision (and its typed Assumptions) through `decisionsService` under `via: "assistant"`; Edit-and-accept opens the Decision dialog prefilled and the create action closes the Proposal; Reject marks it `rejected` so the same Proposal is never raised again.
The pass is idempotent: each Source is passed once (`proposal_pass_sources`) and each Proposal has a fingerprint unique per Project.
Acceptance rate (accepted / total proposed) is stored per Project by counting the table and shown on the Decisions page.

Verified facts that shape the plan:

- `reflect()` (`src/server/modules/reflection/service.ts`) is the shape to copy: a `Rewrite` function parameter with a model default (`generateObject` + zod schema), throttling, `console.error` and a `{ skipped }` outcome, scheduled with `after()` from the chat route.
  The pass takes an `Extract` parameter the same way so tests are deterministic and the model is never hit in CI.
- `getModel()` returns `null` when not configured; the pass must degrade rather than fail.
  A **heuristic extractor** (sentences matching decision verbs: decided, agreed, chose, will switch, going with, instead of) is the default when the model is missing or `PROPOSALS_EXTRACTOR=heuristic`, so the e2e and local dev work without a key and the acceptance-rate metric is real for both extractors.
- Evidence text lives in `evidence.body` (pasted) or `evidence.extractedText` (uploads); Comments in `comments.body`.
  Both are already the Source kinds `decisionsService.resolveSources` accepts, and it recomputes `label`/`excerpt` server-side.
- `decisionsService.create` requires `sources.length >= 1` and validates Project membership; `createAssumption` enforces the subtype matrix.
  Accepting a Proposal calls both under `{ ...ctx, via: "assistant" }`, so the Activity Event carries `via: "assistant"` and `actorId = ctx.userId` (the PM confirming), exactly as the issue asks ("attributed to the Assistant on behalf of the User").
- ADR 0007: Conversations, Messages, Profile and Working Memory are the Assistant's own documents and carry no Activity Event; ADR 0008 puts Proposals in the same class.
  `proposalsRepo` therefore writes without `mutate`; the only Activity Events are the ones the accepted Decision emits.
- `evidence.created` / `comment.created` are published after commit; `Recorder.publish` already loads subscribers (`ensureSubscribers`, #38).
  A model call inside a subscriber would sit on the request; the pass is scheduled with `after()` from the Evidence and Comment server actions instead (same primitive the chat route uses for Reflection) and can be run on demand from a "Propose from evidence" button.
- The Project Overview already renders `ImpactAlerts` above `AttentionList` (#38); the Proposal panel goes between them.
- `DecisionDialog` builds its form from `item?.decision`; a `draft` prop (title, dates, text fields, Sources, Assumptions to create after save) prefills the create form, and a hidden `proposalId` lets the create action close the Proposal in the same transaction.
- `ATTENTION_RULES` is severity-ordered; pending Proposals are not attention rules (they are not problems), so the panel is the surface and the Dashboard is untouched.

## 2. Domain and design decisions

- Vocabulary (`src/shared/domain/index.ts`): `PROPOSAL_STATUSES = ["pending", "accepted", "rejected"]`; `CONTEXT.md` gains **Proposal** under Decision Memory: "A Decision the Assistant extracted from Evidence or a Comment and offers for confirmation; not part of the graph until a PM accepts it." Avoid: suggestion, draft decision, candidate.
- Tables (`src/server/modules/proposals/schema.ts`):
  - `decision_proposals`: `id`, `projectId` (cascade), `fingerprint` (sha1 of the primary Source `kind:entityId`, its normalised excerpt and the normalised title; `unique(projectId, fingerprint)` so `onConflictDoNothing` has a target), `status` (default `pending`), `title`, `decidedOn` (nullable date), `context`, `chosen`, `alternatives`, `revisitWhen`, `sources jsonb` (`{ kind, entityId, excerpt }[]`, at least one), `assumptions jsonb` (proposed typed Assumptions, may be empty), `extractor` (`model` | `heuristic`), `decisionId` (nullable, set on accept), `resolvedAt`, timestamps.
  - `proposal_pass_sources`: `(projectId, kind, entityId)` primary key, `passedAt`, `textHash`; a Source is re-passed only when its text hash changes (Evidence re-extracted or edited).
- Traceability rule: an extractor output is kept only if every cited Source resolves in this Project and the quoted `excerpt` (whitespace-normalised, case-insensitive) is a substring of that Source's text; otherwise it is discarded (counted in the pass outcome as `discarded`).
  Text fields from the extractor are trimmed and capped (`title` 200, `chosen`/`context`/`alternatives` 4000, `revisitWhen` 500, `excerpt` `SOURCE_EXCERPT_MAX`) before insert; the model prompt states the text is source material and never instructions, and nothing the model returns is executed or rendered as anything but text.
  The text a Source is hashed on is exactly the text the extractor sees: Evidence `body ?? extractedText ?? ""`, Comment `body`.
  Proposed Assumptions must pass `assumptionFieldErrors` after target resolution by name (Person by name, Milestone by name, Task by title) or they are dropped from the Proposal; the Proposal itself survives.
- Idempotency: the pass selects Sources with no `proposal_pass_sources` row or a changed hash; extracted Proposals whose fingerprint already exists (any status) are skipped, so a rejected Proposal stays rejected.
- Accept: both paths converge on `decisionsService.create`, which gains two optional inputs: `proposalId` and `assumptions[]` (the typed Assumptions to create with the Decision).
  Inside its single `mutate` it inserts the Decision and Sources, creates and attaches each Assumption (reusing the internal `attach` helper), and, when `proposalId` is set, asserts the Proposal is pending in the same Project and calls `proposalsRepo.markAccepted(tx, proposalId, decision.id)` (repository import only, no service cycle).
  `proposalsService.accept(ctx, { id, overrides? })` loads the Proposal, resolves its Assumption targets, and calls `decisionsService.create({ ...ctx, via: "assistant" }, { ...proposal, ...overrides, proposalId })`.
  The dialog path posts `proposalId`; `createDecisionAction` passes `{ ...ctx, via: "assistant" }` when `proposalId` is present, so both Activity Events carry `via: "assistant"` with `actorId` the confirming PM.
  `SourceInput` gains optional `excerpt`; `resolveSources` uses it when it is a substring of the Source text (else falls back to the first line), so the accepted Decision keeps the verbatim sentence.
- Reject: `proposalsService.reject(ctx, id)` sets `rejected`, `resolvedAt`; the row stays.
- Acceptance rate: `proposalsService.stats(ctx, projectId)` -> `{ proposed, accepted, rejected, pending, rate }` where `rate = accepted / proposed` (null when nothing proposed).
- `runPass` writes `proposal_pass_sources` and `decision_proposals` in one `ctx.db.transaction`, after the extractor has returned, so a crashed extractor marks nothing as passed.
- The pass never touches `decisions`, `assumptions`, `decision_edges` or `decision_sources`.

## 3. Changes, grouped into commit points

### Commit 1 - `feat(domain): Proposal vocabulary, schema and migration`

- `PROPOSAL_STATUSES`, `PROPOSAL_EXTRACTORS = ["model", "heuristic"]`; enums; `schema.ts`; `db/schema.ts` export; `npm run db:generate` -> `drizzle/0009_proposals.sql`; `CONTEXT.md` Proposal entry.

### Commit 2 - `feat(proposals): extractor contract, heuristic extractor and traceability filter`

- `src/server/modules/proposals/extract.ts`: `ExtractInput { sources: { kind, entityId, title, text }[], context: { people, milestones, tasks, conversation } }`, `ExtractOutput { proposals: RawProposal[] }`, `Extract = (input) => Promise<ExtractOutput>`; `heuristicExtract` (pure); `modelExtract` (`generateObject`, prompt says the text is source material and never instructions, asks for verbatim excerpts).
- `src/server/modules/proposals/trace.ts`: `traceProposals(raw, sources, refs)` -> `{ kept, discarded }`, pure; fingerprint helper.
- Tests: `extract.test.ts` (heuristic finds "we decided to switch from surveys to interviews" with the sentence as excerpt; ignores prose without decision verbs), `trace.test.ts` (unknown Source id discarded; excerpt not in text discarded; whitespace/case tolerant; Assumption with unknown Person dropped but Proposal kept; fingerprint stable across re-runs).

### Commit 3 - `feat(proposals): repository, service (pass, accept, reject, stats) with tests`

- `repository.ts`: `listPending`, `listByProject`, `findById`, `insertMany` (`onConflictDoNothing` on fingerprint), `update`, `passSources.listHashes`, `passSources.upsert`.
- `service.ts`: `runPass(ctx, projectId, { extract? })` -> `{ skipped } | { proposed, discarded, sourcesPassed }`; `listPending`; `accept`; `reject`; `stats`; `markAccepted(tx, ...)` for the dialog path; all project-scoped functions start with `assertOwnsProject`.
- `decisions/validation.ts`: `proposalId: optionalId` and `assumptions: z.array(assumptionShape without projectId/decisionId).optional()` on create; `sourceInputSchema.excerpt` optional; `decisions/service.ts` create: creates the Assumptions inside the same `mutate`, and if `proposalId`, asserts the Proposal is pending in the same Project and calls `proposalsRepo.markAccepted(tx, proposalId, decision.id)`.
- `decisions/actions.ts` `createDecisionAction`: `via: "assistant"` on the `Ctx` when `proposalId` is posted.
- `service.test.ts` (DB, fake extractor): pass creates pending Proposals from Evidence and a Comment; second run over the same Evidence proposes nothing new and passes zero Sources; an edited Evidence is re-passed but a rejected fingerprint is not resurrected; untraceable output discarded; accept writes a Decision with `via: "assistant"` on its Activity Event, keeps the verbatim excerpt on the Source, creates the Assumption, marks the Proposal; the dialog path (`decisionsService.create` with `proposalId` under `via: "assistant"`) marks it too; accept with overrides changes the title; accept of a non-pending Proposal rejects; stats counts; stranger gets `ForbiddenError` on every entry point; `runPass` leaves `decisions`, `assumptions`, `decision_edges`, `decision_sources` counts unchanged; `runPass` falls back to the heuristic when `getModel()` is null and honours `PROPOSALS_EXTRACTOR=heuristic`.

### Commit 4 - `feat(proposals): actions, after() scheduling and the Overview panel`

- `actions.ts`: `runProposalPassAction({ projectId })`, `acceptProposalAction({ id })`, `rejectProposalAction({ id })`.
- Evidence create/update and Comment create actions call `after(() => proposalsService.runPass(ctx, projectId).catch(log))` (Next 16 supports `after` in Server Functions) when a pass is possible (`proposalsService.enabled()`: model configured or heuristic selected).
  `after` runs once the response is sent, so the UI never waits on the extractor; the e2e uses the explicit button instead of racing it.
- `src/widgets/attention/proposal-cards.tsx` (server) + `proposal-actions.tsx` (client): per pending Proposal a `Panel` (`data-testid="proposal-card"`) with "Proposed decision" tag, title, chosen, context, Source chips (label + excerpt tooltip), proposed Assumptions as chips, buttons **Accept** (one click), **Edit and accept** (navigates to `/projects/{id}/decisions?proposal=<id>`), **Reject**; the acceptance readout is `data-testid="acceptance-rate"`.
- Overview page fetches `proposalsService.listPending`; renders `<ProposalCards>` between `ImpactAlerts` and `AttentionList`.
- Decisions page: reads `?proposal=` and opens `DecisionDialog` with `draft` built from the Proposal (Sources with labels, `proposalId` hidden); header shows "Assistant acceptance: 3 of 5 (60%)" from `stats` and a "Propose from evidence" button that runs the pass and refreshes.
- `DecisionDialog`: new optional `draft` prop; when present, form fields default from it, `SourcePicker` starts with its Sources, hidden `proposalId`; after create, proposed Assumptions are created by the accept path, so for edit-and-accept the service `create` also creates the Proposal's Assumptions when `proposalId` is set (single transaction).

### Commit 5 - `test(e2e): proposals flow, docs row and screenshots`

- Worktree `.env` sets `PROPOSALS_EXTRACTOR=heuristic` for the dev server (documented in `docs/flows.md`).
- Flow `proposals` (after `impact`): add Evidence "Steering call notes" whose body has one decision sentence ("After the pilot we decided to switch from weekly surveys to fortnightly interviews because response rates fell to 4%.") and one plain sentence; go to Decisions, click **Propose from evidence** (synchronous, no `after()` race), go to Overview: one `proposal-card` with the quoted excerpt; **Edit and accept** -> Decisions dialog prefilled -> change the title -> Create; D-3 exists with Source "Steering call notes"; History tab shows "via Assistant" on created; add a second Evidence with two decision sentences, click Propose, Overview shows two cards; **Accept** one (screenshot), **Reject** one; click Propose again: still zero cards (idempotent, rejected not re-raised); Decisions header `acceptance-rate` reads "2 of 3".
- Screenshots: `proposal-card`, `edit-and-accept-dialog`, `accepted-history`, `one-click-accept`, `acceptance-rate`.
- `.env.example` documents `PROPOSALS_EXTRACTOR` (`model` default when a key is set, `heuristic` otherwise or when forced); `docs/flows.md` notes the e2e expects `heuristic`.

### Commit 6 - `docs: implementation notes for #39`

## 4. How to test and verify

1. `npm run db:migrate`; `npx vitest run src/server/modules/proposals` red before the module exists, green after Commits 2-3.
2. `npm test` at the end; `npm run typecheck`, `npm run lint`, `npm run format:check` after each commit.
3. E2E: `E2E_PORT=3139 E2E_NO_SERVER=1 npx playwright test e2e/flows.spec.ts` - 19 flows.
4. Manual: with `OPENAI_API_KEY` set and `PROPOSALS_EXTRACTOR` unset, paste real meeting minutes and confirm the model path proposes with verbatim excerpts; confirm a fabricated excerpt is discarded (log line).
5. Acceptance checklist:
   - pass produces Proposals with >= 1 Source and optional typed Assumptions (tests, e2e);
   - untraceable Proposal discarded (trace tests, service test);
   - pending Proposals on the existing attention surface (Overview panel, screenshot);
   - Accept writes through `decisionsService` with `via: "assistant"`, visible in History (service test asserts the Activity Event `via`; e2e screenshot of the badge);
   - Edit-then-accept can change any field (dialog path);
   - Reject persists and is not re-raised (service test);
   - acceptance rate recorded per Project and readable (`stats`, Decisions header);
   - idempotent pass (service test: second run proposes nothing);
   - pass never writes to the graph (row-count assertion);
   - visual proof.

## 5. Out of scope

- Pulling transcripts from meeting providers and passage-level citation (#42; `sources` jsonb already carries `excerpt`, and `passageId` can be added to it without a schema change).
- "Why did we" answers (#40).
- Proposals for Assumptions alone, or for superseding an existing Decision.
