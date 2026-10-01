# Item extraction: explicit-owner rule - 1 October 2026

The second iteration on the Task and Milestone extractor (`src/server/modules/proposals/extract-items.ts`), after the 30 September baseline in [../item-evals-2026-09-30](../item-evals-2026-09-30/README.md).
The key was supplied through the environment only and is in no file here.

**Outcome: with the new sentence, `gpt-4o-mini` scored 9, 10, 10, 10 and 12 of 12 over five runs, against 9 of 12 in all three runs without it (two on 30 September, one here under the stricter grader).**
**Same prompt, same day, a 3-case spread: the result is a direction, not a fixed score.**
**`i01` invented an owner in 1 of 5 runs instead of every run; `i08` invented a Milestone link in 1 of 5; `i04` and `i06` still fail most runs on recall.**
**The 22 Decision cases scored 20 or 21 of 22 in every run; that prompt was not touched.**

## What changed

1. **The grader fails an invented Milestone link.** `evals/grade.ts` used to compare a Task's Milestone only when the case named one, so `i01` in the 30 September repeat linked `Pilot cut-over` without failing.
   An omitted `milestone` now means "none expected".
   Re-running the unchanged prompt under the stricter grader (`baseline/`) still scores 9/12, with `i01` now failing on both the owner and the Milestone.
2. **One prompt sentence:** set an assignee or owner only when the text gives that Person the work; attending, speaking or being named nearby does not; leave the field empty rather than guess; the same holds for a Milestone link.
3. **Trace drops a Task titled exactly like a known Milestone.**
   With the new sentence, `i11` began returning a Task titled "Pilot cut-over" (excerpt "The Pilot cut-over stays on 2026-10-06"), which the same-kind check let through.
   `pre-narrowing-*` ran with a first version of this check (`isDuplicateTitle` across kinds); `final-*` ran with the merged one (exact title, only the Task dropped, Milestones traced first).

| Directory          | Trace                  | Items | Decision cases | Failed cases                      |
| ------------------ | ---------------------- | ----- | -------------- | --------------------------------- |
| `baseline/`        | before this change     | 9/12  | 21/22          | `i01`, `i04`, `i06`; `x07`        |
| `pre-narrowing-1/` | first cross-kind check | 10/12 | 21/22          | `i04`, `i06`; `x07`               |
| `pre-narrowing-2/` | first cross-kind check | 10/12 | 21/22          | `i04`, `i06`; `x07`               |
| `final-1/`         | merged                 | 12/12 | 20/22          | `x07`, `x18`                      |
| `final-2/`         | merged                 | 10/12 | 20/22          | `i01`, `i06`; `x02`, `x07`        |
| `final-3/`         | merged                 | 9/12  | 20/22          | `i04`, `i06`, `i08`; `x02`, `x16` |

## Iterations not kept

Raw output for these is not committed; they ran into the scratchpad while the wording was settled.

| Wording                                                                                            | Items    | What went wrong                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner rule ending "otherwise null", plus "Link a Milestone only when the text ties the work to it" | 8/12 x2  | The model wrote the string `"null"` as the owner in `i01`, which trace keeps as an unresolved name; "ties the work to it" made `i08` link `Pilot cut-over` from "for the pilot". |
| Owner rule only, "leave the field without a value"                                                 | 10/12    | `i08` still linked `Pilot cut-over`; `i11` kept the restated Milestone as a Task.                                                                                                |
| Plus "set a Milestone link only when the text names that Milestone"                                | 10/12 x2 | `i08` fixed; `i11` still failed, which led to the trace change above.                                                                                                            |

## What was run

Every directory above is one run of the command below, with `DATABASE_URL=postgres://pm:pm@localhost:5433/pm_eval_20260928` in front and `AI_PROVIDER=openai`, `AI_MODEL=gpt-4o-mini`, `OPENAI_API_KEY` from the environment:

```bash
npx tsx scripts/eval.mts --suite extraction,items --models gpt-4o-mini --skip-index \
  --out artifacts/item-evals-2026-10-01/final-1 --label "explicit-owner rule, final trace (run1)"
npx tsx evals/report.ts
```

The new sentence adds about 100 prompt tokens per case: 9,839 prompt tokens per 12-case run against 8,615.
