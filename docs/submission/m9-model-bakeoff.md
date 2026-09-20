# M9 - Model Bake-Off

## Goal

Compare the same proposal-extraction and why-did-we cases across three models.

## Candidates

1. `gpt-4o-mini` (production default)
2. `gpt-4o`
3. `o3-mini` or another OpenAI model the project supports

## Evaluation dimensions

- Correctness (does the extracted decision match the text?)
- Citation quality (are sources verbatim and traceable?)
- Abstention rate (does it say "no recorded decision" when appropriate?)
- Latency
- Cost

## How to run

Create `eval-results/<timestamp>/` with:

- `cases.json` - the 20 proposal and 20 why-did-we cases.
- `run.ts` - a script that calls `proposalsService.runPass` and `decisionsService.search` for each model.
- `summary.csv` - one row per case/model with the dimensions above.

Paste the summary table here once the bake-off is complete.

## Results

TODO: run the bake-off and paste results.
