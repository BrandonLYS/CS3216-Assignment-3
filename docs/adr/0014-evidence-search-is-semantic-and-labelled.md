---
status: accepted
---

# Evidence is searchable semantically and by Label, over pruned text

The PM uploads Evidence and the Assistant needs to find it: by what it is about (semantic), by how the PM filed it (Label), or both at once.
Four decisions in that sentence were not obvious.

## The index is rebuilt, never maintained

`evidence_chunks` is the source of truth: one row per text chunk with its embedding, rewritten whole whenever `evidenceText(e)` changes, exactly the way Passages are a projection of transcript text.
The FAISS index is a per-Project `IndexFlatIP` that lives only in process memory, built lazily from those rows on first search and dropped when the `search` module sees an `evidence.*` event.

The alternative - FAISS index files on disk - gives the index a second lifecycle outside the database transaction, so a crash between the row write and the index save leaves them disagreeing about what is searchable.
In-memory rebuild costs one table read per Project per cold start and can never disagree, because there is nothing to disagree with: the rows are the index.
`faiss-node` is a native binding, so `index.ts` hides it behind one function and a JS cosine fallback exists in tests; if the binding breaks on a platform, the swap is a one-file change.

## One Label, two join tables

Labels already existed per-Project on Tasks.
Evidence reuses the same `labels` table through its own `evidence_labels` join rather than growing a parallel taxonomy, because a PM who tags "Vendor Acme" means the same thing on a Task and on the contract they uploaded.
The cost is that deleting a Label must clean two join tables; the benefit is that `search_evidence` can filter by names the PM already knows.

## Pruning happens at ingest, not at query time

LitePruner compresses `extractedText` once, at ingest, into `evidence.prunedText`; chunks and embeddings derive from `prunedText ?? extractedText`.
Pruning per query would spend the compression budget on every search and still embed the full document's cost; pruning once pays it once.

Two guardrails follow.
LitePruner takes text, not files, so only markitdown output or a pasted body is sent; a file markitdown cannot read goes to the model as-is and its transcription is embedded directly, without compression.
And a LitePruner failure - no key, timeout, quota, a 500 from the service - stores the original text in `prunedText`, so the column always carries what the index actually embedded; the same rule `extractText` already follows applies: an enrichment must never fail an upload.

`extractedText` stays full-fidelity on purpose.
Display, Passages and citations still read the original; only the search projection sees the compressed version, which also trims what the Assistant's model is billed for in returned snippets.

## Search is a module, not a method on Evidence

`src/server/modules/search/` subscribes to `evidence.created/updated/deleted` on the `eventBus` - the seam AGENTS.md already names for the AI layer - so the Evidence service knows nothing about embeddings and a broken OpenAI key cannot reach into a mutation.
The Assistant tools (`search_evidence`, `set_evidence_labels`, and a `title` parameter on `read_evidence`) are registered in the tool registry like every other tool, which puts them on MCP automatically; upload stays UI-only because base64 files over MCP buy nothing the upload form does not already do better.

## Consequences

- Semantic search needs `OPENAI_API_KEY` and `faiss-node`; without either, `search_evidence` degrades to label-filtered listing and says why.
- Embedding is lazy in the event subscriber, so `npm run dev` syncs on boot but tests and one-off scripts never embed unless they opt in via `syncForEvidence`.
- Evidence that predates the subscriber is backfilled lazily on the Project's first `search_evidence` call (bounded per call, retried until done), so existing Projects self-heal without a migration job. The same pass fills vectors into chunks written before an embedding model was configured.
- `MARKITDOWN_BIN` points at a project `.venv` (`pip install "markitdown[all]"`); missing binary means no compression, not no upload.
- A file no extractor could read - scanned or image-only PDFs carry no text layer for markitdown or unpdf to find - is handed to the chat model as-is to transcribe (`AI_VISION_MODEL`, defaulting to `AI_MODEL`). Same never-fail rule: no key, unsupported format or a failed call leaves `extractedText` null.
- `LITEPRUNER_API_KEY` is optional; `LITEPRUNER_RATIO` defaults to 0.7.
- Label changes on Evidence record Activity Events with field `labelIds`, same as Tasks, even though Evidence has no history tab - the record exists for the AI layer to read.
