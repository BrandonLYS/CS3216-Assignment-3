# M11 - Evaluation Evidence

## Datasets

At least 20 cases for each:

- Proposal extraction from evidence/minutes/comments.
- "Why did we...?" questions with and without recorded Decisions.

## Cases should cover

- Verbatim citation.
- No decision in source (empty proposals).
- Superseded decisions.
- Missing context.
- Abstention (no recorded decision).

## Runner

`eval-results/<timestamp>/run.ts` should:

1. Load cases.
2. Call `proposalsService.runPass` or the assistant `search_decisions` tool.
3. Record raw JSON output and pass/fail judgment.
4. Output `summary.csv`.

## Results

TODO: paste the case list and summary table after running the evaluator.
