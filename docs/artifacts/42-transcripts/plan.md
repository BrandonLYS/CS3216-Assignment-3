# Plan - #42 Ingest meeting transcripts as Evidence with passage-level citation

Branch `feat/42-transcripts`, worktree `/Users/qang/projects/CS3216-A3-wt/42-transcripts`, base `origin/main` at `fea1c26` (#41 merged).
Builds on ADR 0008 (Source = entity reference + optional `passageId`, reserved since #36), the `evidence` module, the Source picker (#37), `sourceHref` (#40) and the Proposal pass (#39).
One enum migration plus one new table and one FK, one pure segmenter, small additions to four existing surfaces.

## 1. Summary

`transcript` becomes an Evidence kind.
When a transcript is created or its text changes, the service segments the text into ordered `evidence_passages` (speaker and timestamp kept when the input has them, paragraph fallback otherwise) inside the same transaction; segmentation is pure, guarded, and never fails the ingest.
A Decision Source may cite one passage (`decision_sources.passageId`, now a real FK with `ON DELETE SET NULL`): the Source picker offers the passages of a transcript, `resolveSources` snapshots the passage text as the excerpt, and every place that links a Source (`sourceHref`) points at `#passage-<id>` on the Evidence page, which renders the passages with anchors and scrolls to the cited one.
When the passage is gone (text re-extracted, kind changed), the FK nulls `passageId` and the Source degrades to the whole Evidence, never an error.
The Proposal pass lists transcripts first, tells the model to prefer them, and after tracing attaches the `passageId` of the passage that contains the excerpt.

Verified facts that shape the plan:

- `EVIDENCE_KINDS` is `plan | minutes | status_update | task_export | risk_register | other` (`src/shared/domain/index.ts:78`); `evidenceKindEnum` is built from it (`src/server/db/enums.ts:36`); `#38` added an enum value through `npm run db:generate` (`drizzle/0008_impact_alerts.sql` starts with `ALTER TYPE ... ADD VALUE`), so the workflow is known.
  Both Evidence forms use `enumOptions(EVIDENCE_KINDS)`, so the new kind appears with no UI change.
- `evidence.body` (paste) and `evidence.extractedText` (upload, via `extractText`, never throws) are the two text columns; `evidenceService.create` writes bytes before `mutate`, then inserts inside `mutate`; `update` diffs a patch and writes inside `mutate`.
- `decision_sources.passageId` is a nullable text column with no FK (`decisions/schema.ts`); `SourceInput.passageId` already exists in `decisions/validation.ts`; `resolveSources` already keys duplicates by `kind:entityId:passageId` and copies `passageId` to edges (`copyToEdge`); the Source picker already carries `passageId` in its hidden JSON and the dialog re-hydrates it.
  Nothing writes or reads a non-null value yet.
- `sourceHref(projectId, decisionId, source: Pick<DecisionSourceRow, "kind" | "entityId">, lookups)` (`decisions/answers.ts`) is the single place a Source becomes a link; used by `decisionsService.search` (#40) and `graphService` (#41).
  `evidenceHref` already carries `#evidence-<id>`, which anchors the list row on the Evidence page.
- The Evidence page (`src/features/evidence/evidence-view.tsx`) is a client component; it renders `body` as one `<pre>` and `extractedText` inside `<details>`; nothing scrolls to a hash.
  `evidence/page.tsx` loads `evidenceService.list` for the whole Project.
- `SourceCandidates` (`decisions/repository.ts:198`) lists Evidence as `{ id, title, kind, sourceDate }`; `candidateItems` flattens it for the `CommandPicker`; `SourcePicker.pick` builds `{ kind, entityId, label }`; `chosen` and `options` dedupe on `kind:entityId` only.
  `decision-dialog.tsx` re-hydrates `passageId` for an existing Decision (line 56) but drops it on the Proposal confirm path (lines 57-62).
  Source `label` and `excerpt` are snapshots written by `resolveSources`; the dialog shows `s.label` verbatim.
- `evidence/page.tsx` takes no `searchParams`; the client view selects `params.get("item") ?? items[0]`.
- `proposalsService.sourceLabels` returns `Map<"kind:entityId", title>` for the Proposal cards.
- The heuristic extractor's `sentencesOf` splits on terminal punctuation or blank lines and keeps the raw line, so an excerpt from a labelled transcript line would include the `[00:03:45] Marcus:` prefix unless the text handed to the extractor is label-free.
- The Proposal pass (`proposals/service.ts`) builds `candidates` from Evidence then Comments in list order, runs the extractor, `traceProposals` checks each excerpt is a substring of the Source text, then `accept` passes `p.sources` straight into `decisionsService.create` as `SourceInput[]`, so a `passageId` on `ProposedSource` flows through unchanged.
  `ProposedSource` is `{ kind, entityId, excerpt }` (JSON column, no migration needed to add a field).
- The model extractor prompt lives in `proposals/extract.ts` (`modelExtract`); the heuristic extractor is deterministic and used by the e2e (`PROPOSALS_EXTRACTOR=heuristic`).
- Source chips in the Decision dialog, the Proposal cards and the impact alert are labels, not links; the only PM-facing Source links today are the Assistant's citations and the graph's edge chips.
- CONTEXT.md "Evidence" entry: "A source artifact attached to a Project (plan, minutes, status update, export) ...".

## 2. Domain and design decisions

- **Vocabulary**: `transcript` joins `EVIDENCE_KINDS` (enum migration).
  New term **Passage** in CONTEXT.md under Evidence: "One ordered segment of a transcript: its text, plus the speaker and timestamp when the transcript has them. A Source may cite a Passage instead of the whole Evidence." Avoid: chunk, snippet, segment (as a noun), quote.
- **Table `evidence_passages`** (`evidence/schema.ts`): `id`, `evidenceId` (FK `evidence.id` cascade), `ordinal` int, `speaker` text null, `timestamp` text null (kept as written, e.g. `00:12:34` or `12:34`; no parsing into intervals), `text` text not null, `createdAt`; unique `(evidenceId, ordinal)`.
  Passages are a projection of the Evidence text: they are rewritten whole whenever the text changes and carry no Activity Events of their own (the Evidence `updated` event already records the text change).
  This matches the Assistant-document reasoning in ADR 0007/0008 without being one: the write stays inside the Evidence `mutate`, so ADR 0005 holds.
- **`decision_sources.passageId` FK** to `evidence_passages.id` `ON DELETE SET NULL`, added in the same migration (all existing values are null).
  Re-segmentation deletes and re-inserts passages, so every citing Source degrades to the whole Evidence by the FK alone; no service code has to hunt for Sources.
- **Segmenter** (pure, `src/server/modules/evidence/passages.ts`, `segmentTranscript(text): Array<{ ordinal, speaker, timestamp, text }>`); `text` is the turn without its label or timestamp (those are columns), trimmed:
  1. Normalise line endings; split into lines.
  2. A line starts a passage when it matches a **speaker label**: `^(?:\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*[-–]?\s*)?([A-Z][\w .'-]{0,40}?)\s*:\s*(.*)$` (optional leading timestamp, then `Name:`), or a **timestamp-only** line `^\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*$` (WebVTT/SRT style; the next lines are the text; SRT sequence-number lines and `-->` cue lines are skipped).
     A label is at most 41 characters of name before the colon, so `Note: ...` counts as a speaker "Note" (acceptable; the PM sees it) but a URL or `12:30 meeting` does not.
  3. Lines that do not start a passage append to the current passage; blank lines end the current passage only in fallback mode.
  4. **Fallback** when fewer than two labelled passages were found, or fewer than two **distinct** speaker names appear (so minutes with one `Attendees:` and one `Note:` line, each a singleton speaker, are paragraphs; a two-person meeting whose turns wrap over many continuation lines is still labelled): split on blank lines into paragraphs; a paragraph longer than 1,200 characters is split further at sentence boundaries (`sentencesOf` from `proposals/extract.ts` is not imported - the evidence module gets its own `splitLong`) into pieces of at most 1,200 characters; a text with no blank lines and no labels becomes such pieces.
  5. Empty pieces are dropped; ordinals are assigned 0..n-1; at most 5,000 passages (the extract cap is 100,000 characters, so this is never reached in practice; it is a guard).
  6. Never throws: the service wraps the call and logs on failure, leaving the Evidence with its text and no passages.
- **Pass bookkeeping**: `textHash` in `runPass` stays a hash of the raw Evidence text (`body ?? extractedText`), independent of segmentation, so "already read" never flips because a segmenter rule changed.
- **Text for the extractor and for matching**: a transcript with passages is handed to the Proposal pass as its passages' `text` joined by blank lines (`transcriptText(passages)`), so the heuristic's sentences and the model's excerpts never carry a label prefix and `attachPassages` can match an excerpt to a passage by normalised containment.
  Traceability is unaffected: a label-free excerpt is still a substring of the raw `body`, which `resolveSources` checks when the Proposal is accepted.
- **Ingest hook** in `evidenceService.create` and `update`: after the row write inside `mutate`, `syncPassages(tx, row)`: if `row.kind === "transcript"` and text (`body ?? extractedText`) is non-empty, replace passages with `segmentTranscript(text)`; otherwise delete them.
  `update` calls it only when `kind`, `body` or `extractedText` changed (from `diffFields`), so an edit to the title does not rewrite passages (and does not null citations).
  `evidenceService.replaceFile` does not exist; uploads happen only at create, so re-extraction means "create replaced" or a body edit.
- **Reading passages**: `passagesRepo.listForEvidence(db, evidenceId)`, `listForProject(db, projectId)` (join through `evidence` for the picker), `findById`.
  `evidenceService.passages(ctx, evidenceId)` (ownership via `getOwned`); `evidence/page.tsx` starts reading `searchParams` (`PageProps`, awaited) and loads passages for `item ?? items[0]?.id`, matching the client's default selection.
- **Source picker**: `SourceCandidates.evidence` gains `passages: Array<{ id, ordinal, speaker, timestamp, text }>` per transcript Evidence (empty otherwise; `sourceCandidatesRepo` loads them in one query for the Project's transcripts).
  Picking a transcript opens a second `CommandPicker` with "Whole transcript" first, then one item per passage (label `firstLine(text)`, hint `speaker · timestamp` or `passage n`); picking one adds `{ kind: "evidence", entityId, passageId, label: "<title> · <speaker or passage n>" }`.
  `chosen` and the chip key become `kind:entityId:passageId`; a transcript stays in the options while it has passages not yet cited and is removed only once cited whole, so two passages of one transcript can both be cited.
  Chips of kind `evidence` display a **live label** computed from `candidates`: the passage's `title · speaker` (or `passage n`) when `passageId` resolves, the Evidence title when `passageId` is null or unknown, falling back to the snapshot `label` when the Evidence is not in the candidates; this is what makes a degraded Source read as the whole document in the dialog.
  Chips of kind `evidence` also gain an "Open" link (`passageHref` or `evidenceHref`), client-computable, so the PM can check a citation from the dialog; other kinds stay labels (their href needs server lookups).
  `decision-dialog.tsx` passes `passageId` through on the Proposal confirm path as well.
- **`resolveSources`**: for `kind === "evidence"` with `passageId`, load the passage; a passage that exists but belongs to another Evidence is invalid (`ValidationError("Passage is not in this source")`); a passage that no longer exists (re-segmented between a Proposal pass and its accept, since `ProposedSource.passageId` is JSON and not FK-protected) degrades to `passageId = null` and the whole-Evidence resolution, never an error; `excerpt` is the caller's excerpt when it occurs in the passage text (same `quoted()` rule), else the passage text, capped at `SOURCE_EXCERPT_MAX`; `label = "<title> · <speaker>"` or `"<title> · passage <ordinal+1>"`.
  Without `passageId` behaviour is unchanged.
- **Links**: `passageHref(projectId, evidenceId, passageId)` in `shared/lib/hrefs.ts` = `/projects/{p}/evidence?item={e}#passage-{id}`; `sourceHref` takes `Pick<DecisionSourceRow, "kind" | "entityId" | "passageId">` and uses it for `kind === "evidence"` when `passageId` is set (null after `SET NULL` falls back to `evidenceHref`).
  All existing callers pass full rows, so they compile unchanged.
- **Evidence page**: when the selected Evidence has passages, render them instead of the flat text: one `<li id="passage-<id>" data-testid="passage">` per passage with `speaker` and `timestamp` captions in `text-ink-subtle`, text in the existing mono style; a small client `ScrollToHash` effect (`useEffect` reading `window.location.hash`, calling `scrollIntoView` and adding a temporary `ring-1 ring-primary/40` class - DOM work only, no `setState`, so the lint rule is not touched) re-runs on mount, on `hashchange`, and whenever `usePathname()` or `useSearchParams()` change (App Router client navigations do not fire `hashchange`).
  Without passages the current rendering stays.
  The flat text stays available under a `<details>` "Full text" below the passages for transcripts.
- **Proposal pass**: candidates are sorted transcripts first (then other Evidence, then Comments); a transcript's `text` is `transcriptText(passages)` when it has passages; `ExtractSource` gains `evidenceKind` so the model prompt can say "Prefer sources of kind transcript; they contain the stated reasoning"; after `traceProposals`, `attachPassages(kept, passagesByEvidence)` sets `passageId` on each Evidence Source whose Evidence has passages: the first passage whose normalised text contains the normalised excerpt, else null.
  `ProposedSource.passageId?: string | null`; `proposalsService.sourceLabels` keys entries by `kind:entityId:passageId` too (`"<title> · <speaker or passage n>"`), and `proposal-cards.tsx` looks up the passage key first.
  `fingerprintOf` is unchanged (excerpt-based), so re-running the pass after re-segmentation does not raise duplicates.
- **Authorization**: every new read goes through `assertOwnsProject` or `getOwned`; passages are only ever loaded for an owned Evidence or Project.

## 3. Changes, grouped into commit points

Each commit leaves `npm run typecheck`, `npm run lint` and `npm run format:check` green; tests first inside each commit.

### Commit 1 - `feat(domain): transcript Evidence kind and Passage vocabulary`

- `EVIDENCE_KINDS` += `transcript`; `evidence/schema.ts` `evidencePassages` table; `decisions/schema.ts` `passageId` references `evidencePassages.id` `{ onDelete: "set null" }`; `npm run db:generate` -> `drizzle/0010_transcripts.sql` (rename), migrate dev and `db_test`.
- CONTEXT.md: Evidence entry lists transcripts; new Passage entry.
- `docs/adr/0008-decision-memory-graph.md`: one sentence under Source noting `passageId` is now enforced with `SET NULL` (the ADR reserved it).

### Commit 2 - `feat(evidence): transcript segmentation on ingest`

- `evidence/passages.ts`: `segmentTranscript`, exported regexes for tests.
- `evidence/passages.test.ts` (pure): speaker-labelled lines with and without timestamps (`[00:01:10] Priya: ...`, `Marcus: ...`, `00:02 - Priya: ...`), multi-line turns, bare `[00:12:34]` timestamp lines followed by text, SRT with sequence numbers and `-->` cue lines skipped, unlabelled paragraphs, minutes whose only colons are `Attendees:` and `Note:` among ten paragraphs (paragraph fallback, no speakers), a two-speaker transcript whose four turns wrap over twenty continuation lines (still labelled), single long paragraph split at sentences, `text` never carries the label, empty and whitespace-only text -> `[]`, ordinals contiguous.
- `evidence/repository.ts`: `passagesRepo` (`listForEvidence`, `listForProject`, `findById`, `replaceForEvidence(tx, evidenceId, rows)`, `deleteForEvidence`).
- `evidence/service.ts`: `syncPassages` inside `create` and `update` as in section 2; `evidenceService.passages(ctx, evidenceId)`.
- `evidence/service.test.ts` additions: paste transcript -> passages with speakers; upload `text/plain` transcript -> passages from `extractedText`; unlabelled paste -> paragraph passages; title-only update keeps passages; body update rewrites them; kind change to `plan` deletes them; a segmenter that throws (spy) still creates the Evidence with its text and no passages.

### Commit 3 - `feat(decisions): a Source may cite one passage`

- `decisions/repository.ts`: `sourceCandidatesRepo` loads passages for transcript Evidence; `SourceCandidates.evidence[n].passages`.
- `decisions/service.ts` `resolveSources`: passage lookup, label and excerpt as in section 2.
- `shared/lib/hrefs.ts` `passageHref`; `decisions/answers.ts` `sourceHref` honours `passageId`.
- `decisions/service.test.ts`: create with `passageId` snapshots the passage text and label; a passage of another Evidence is rejected; a deleted passage id degrades to the whole Evidence (`passageId` null, label the title); after `evidenceService.update` of the body the Source row has `passageId = null` and `search` returns the whole-Evidence href; `answers.test.ts` covers `sourceHref` with and without `passageId`.
- `source-picker.tsx`: passage sub-picker, live chip labels, "Open" link on Evidence chips, composite `chosen`/chip key; `decision-dialog.tsx` carries `passageId` on the Proposal confirm path.

### Commit 4 - `feat(evidence): passages rendered with anchors; scroll to a cited passage`

- `evidence/page.tsx` reads `searchParams.item` and loads passages for the selected item (or the first); `evidence-view.tsx` renders them (`data-testid="passage"`, `id="passage-<id>"`), `ScrollToHash` (in `src/shared/ui/scroll-to-hash.tsx`, reusable).

### Commit 5 - `feat(proposals): prefer transcripts and cite passages`

- `proposals/extract.ts`: `ExtractSource.evidenceKind?: EvidenceKind`; model prompt sentence; `proposals/schema.ts` `ProposedSource.passageId`.
- `proposals/service.ts`: transcript-first ordering, `transcriptText` for transcripts with passages, `attachPassages` after tracing (pure helper in `trace.ts`, tested: excerpt inside passage 2 -> passage 2's id; excerpt spanning two passages -> null; non-transcript -> untouched); `sourceLabels` gains passage keys.
- `proposal-cards.tsx`: passage label on the Source chip.
- `proposals/service.test.ts`: a transcript with a decision sentence in the second turn yields a Proposal whose Source has that passage's id; `accept` writes a Decision Source with the same `passageId`; editing the transcript body between the pass and `accept` still creates the Decision, citing the whole Evidence.

### Commit 6 - `test(e2e): transcripts flow, docs row, screenshots`

- `e2e/flows.spec.ts` `transcripts` describe after `graph`:
  1. Evidence -> Add: title "Steering meeting transcript", kind Transcript, paste four labelled turns (`[00:01:10] Priya: ...`, `[00:03:45] Marcus: We decided to freeze scope after the pilot instead of adding the export.` ...); after save the detail pane shows four `passage` items with speakers and timestamps; screenshot `01-transcript-passages`.
  2. Decisions -> New decision: title "Freeze scope after the pilot", chosen text, Add source -> pick the transcript -> passage picker -> pick Marcus's turn; the chip reads "Steering meeting transcript · Marcus"; screenshot `02-passage-source-picked`; create.
  3. Re-open the Decision, click "Open" on the Source chip: URL ends with `#passage-<id>`, the passage element is in the viewport (`boundingBox` inside the page) and carries the highlight ring; screenshot `03-citation-opens-passage`.
  4. Decisions -> "Propose from evidence" (heuristic): a Proposal card appears citing "Steering meeting transcript · Marcus"; screenshot `04-proposal-cites-passage`; reject it (keeps the acceptance-rate assertion of the `proposals` flow intact since it runs earlier).
  5. Evidence -> Edit the transcript body (append a line) -> save (re-segmentation replaces the passages, the FK nulls `passageId`); re-open the Decision: the live chip label reads "Steering meeting transcript" without a passage and "Open" lands on the Evidence item (degraded, no error); screenshot `05-degraded-to-whole-document`.
- `docs/flows.md` row `transcripts`; screenshots to `docs/transcripts/screenshots/`; revert the other refreshed screenshot directories except where a surface changed visibly (Evidence add dialog now lists Transcript: keep `docs/evidence`).

### Commit 7 - `docs: implementation notes for #42`

## 4. How to test and verify

1. `npm ci`, `.env` copy, `BETTER_AUTH_URL=http://localhost:3142`, `PROPOSALS_EXTRACTOR=heuristic`; `npm run db:migrate` (dev) - the Vitest global setup migrates `db_test`.
2. Red/green: `npx vitest run src/server/modules/evidence` fails before `passages.ts` exists.
3. `npm test` at the end; typecheck, lint, format after each commit.
4. `npx next dev -p 3142`; `E2E_PORT=3142 E2E_NO_SERVER=1 npx playwright test e2e/flows.spec.ts` - 21 flows pass.
5. Visual proof: `01` (ingest) and `03` (citation opens at the passage).

## 5. Out of scope

- Pulling transcripts from a meeting provider; audio; diarisation.
- Parsing timestamps into durations or aligning them to audio.
- Passage-level citation for Comments or non-transcript Evidence (passages exist only for transcripts).
- Editing passages by hand.
- Re-extracting an uploaded file's text after upload (no such path exists today).
