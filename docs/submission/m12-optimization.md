# M12 - Optimization Evidence

## Experiments

1. **Passage-level context** - measure proposal/answer quality with and without transcript passages.
2. **Bounded retrieval** - cap the number of Evidence rows loaded; compare latency and recall.
3. **Streaming** - capture assistant turn latency with `streamText` vs non-streaming where supported.

## Metrics

- Latency per call.
- Token usage (if available).
- Correctness score from M11 cases.

## Code pointers

- `src/server/modules/proposals/extract.ts` - `EVIDENCE_CANDIDATES` and source selection.
- `src/server/modules/decisions/answers.ts` - `rankEvidence` and `rankDecisions`.
- `src/app/api/assistant/chat/route.ts` - `streamText`.

## Results

TODO: run the experiments and paste numbers.
