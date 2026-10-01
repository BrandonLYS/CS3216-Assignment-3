# Item extraction: explicit-owner rule - 1 October 2026

The second iteration on the Task and Milestone extractor (`src/server/modules/proposals/extract-items.ts`), after the 30 September baseline in [../item-evals-2026-09-30](../item-evals-2026-09-30/README.md).
The key was supplied through the environment only and is in no file here.

**Outcome: `gpt-4o-mini` keeps 10 of 12 item cases in both runs, up from 9 of 12 under the same, stricter grader.**
**The invented owner and invented Milestone link in `i01` are gone; `i04` (a terse one-line review) and `i06` (the data-freeze checkpoint) still fail on recall.**
**The 22 Decision cases score 21/22 in all three runs, failing only `x07`, so the Decision pass did not regress.**

## What changed

1. **The grader fails an invented Milestone link.** `evals/grade.ts` used to compare a Task's Milestone only when the case named one, so `i01` in the 30 September repeat linked `Pilot cut-over` without failing.
   An omitted `milestone` now means "none expected".
   Re-running the unchanged prompt under the stricter grader (`baseline/`) still scores 9/12, with `i01` now failing on both the owner and the Milestone.
2. **One prompt sentence:** set an assignee or owner only when the text gives that Person the work; attending, speaking or being named nearby does not; leave the field empty rather than guess; the same holds for a Milestone link.
3. **Trace drops a Task that restates a known Milestone** (`traceItems` compares titles across kinds).
   After these runs the cross-kind check was narrowed to an exact title that only ever drops the Task, with Milestones traced first; the kept items replay unchanged, but raw output is not stored.
   With the new sentence, `i11` began returning "The Pilot cut-over stays on 2026-10-06" as a Task, which the same-kind check let through.

## Iterations not kept

Raw output for these is not committed; they ran into the scratchpad while the wording was settled.

| Wording                                                                                            | Items    | What went wrong                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner rule ending "otherwise null", plus "Link a Milestone only when the text ties the work to it" | 8/12 x2  | The model wrote the string `"null"` as the owner in `i01`, which trace keeps as an unresolved name; "ties the work to it" made `i08` link `Pilot cut-over` from "for the pilot". |
| Owner rule only, "leave the field without a value"                                                 | 10/12    | `i08` still linked `Pilot cut-over`; `i11` kept the restated Milestone as a Task.                                                                                                |
| Plus "set a Milestone link only when the text names that Milestone"                                | 10/12 x2 | `i08` fixed; `i11` still failed, which led to the trace change above.                                                                                                            |

## What was run

| Directory   | Suites             | Prompt                                 | Label in `configuration.json`                           |
| ----------- | ------------------ | -------------------------------------- | ------------------------------------------------------- |
| `baseline/` | `extraction,items` | 30 September prompt, stricter grader   | `baseline before owner rule; stricter Milestone grader` |
| `run1/`     | `extraction,items` | explicit-owner rule, cross-kind dedupe | `explicit-owner rule, cross-kind dedupe (run1)`         |
| `run2/`     | `extraction,items` | the same, run again straight after     | `explicit-owner rule, cross-kind dedupe (run2)`         |

Each with `DATABASE_URL=postgres://pm:pm@localhost:5433/pm_eval_20260928` in front and `AI_PROVIDER=openai`, `AI_MODEL=gpt-4o-mini`, `OPENAI_API_KEY` from the environment:

```bash
npx tsx scripts/eval.mts --suite extraction,items --models gpt-4o-mini --skip-index \
  --out artifacts/item-evals-2026-10-01/run1 --label "explicit-owner rule, cross-kind dedupe (run1)"
npx tsx evals/report.ts
```

The new sentence adds about 100 prompt tokens per case: 9,839 prompt tokens per 12-case run against 8,615.
