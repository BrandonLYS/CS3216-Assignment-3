# Implementation notes - #116 Evaluate the Task and Milestone extraction prompt

Plan: [plan.md](plan.md), converged after three plan-review rounds.

## Deviations from the plan

- **Grader pairing and the extra-item check.** The plan specified first-match pairing and `no_extra_items` as "kept count equals expected count".
  The code review found two flaws.
  A miss plus a spurious item left the counts equal, so the check passed while its name said otherwise.
  First-match could pair an expectation with the wrong one of two title-matching items.
  `no_extra_items` now fails on any unpaired kept item and names it, and pairing prefers a title match whose fields are right.
  The recorded runs were re-graded offline with the fixed grader, and no verdict changed.
  The stored `checks` arrays are left as the harness wrote them.
- **`--suite pass` with other suites** now throws instead of silently running `pass` alone.
- **Dead code in `gradeWhy`** (`detail: i >= 0 ? undefined : undefined`) removed; the checks it produces are unchanged.
- **Commit 7 split.** The write-up was committed before the code review, and the review fixes and these notes follow in their own commit.

## Incident during implementation

At 12:01, while the baseline was being written up, the User checked out and fast-forwarded local `prod` in the same working tree to test something.
Commits 6 and 7 landed on `prod` and were cherry-picked onto this branch.
The User asked for `prod` to be left as it is.
Every verification step below was re-run on this branch after the cherry-pick, because the first e2e and screenshot runs had used `prod`'s tree.

## Verification

- `npx vitest run src/server/modules/proposals evals`: all green, including the new `proposed-item`, `startOnOrBeforeDue` and grader tests.
- `npm test`: all green except `src/server/auth/session.test.ts`, an untracked local file that is not part of this branch.
- `npx eslint . --max-warnings=0` and `npm run typecheck` green.
  `format:check` reports only files under the untracked `.claude/worktrees/`, and every file this branch changes passes Prettier.
- `e2e/item-proposals.spec.ts`, `e2e/propose-review.spec.ts` and `e2e/item-proposals.proof.spec.ts` green against a heuristic dev server on the local database.
  The proof screenshots were compared with the committed ones and then restored.
  The cards show the same titles, owners, dates and markers.
- `npx tsx scripts/eval.mts` without a `DATABASE_URL` prefix refuses to start and names the remote host.
- `npx tsx evals/report.ts` regenerates the tables deterministically.
  The diff against `main` is appended sections only.

## Code review

Standards: no hard violations.
Part A was checked hunk by hunk against `main` and found behaviour-preserving.
The review raised the grader and harness bugs fixed above.
Judgement calls not taken:

- `runExtraction` and `runItems` share a skeleton, which the plan accepted as mirroring.
- `titleOfItem` is a one-line wrapper, kept because it names the operation at three call sites.

Spec: every #116 acceptance criterion delivered.
It found three factual errors in the note, all fixed:

- `i10`, like `i11`, is rescued by trace (raw 1).
- `i06` fails on the title, not the owner.
- The second `i01` run also invented a Milestone link.

## Observed, not fixed

- Item Proposals raised by one pass share `created_at`, and `itemProposalsRepo.listByProject` breaks the tie on the random id.
  Cards from one Evidence item therefore appear in an arbitrary but stable order: the proof run showed the Milestone above the Task, where the committed screenshot has the Task first.
  Keeping extraction order needs a sequence column, which is out of scope here.
- Temperature 0 on OpenAI directly did not repeat its own Decision verdicts.
  This is recorded in the note, and `EXTRACT_TEMPERATURE`'s comment is left as it stands, because it cites the 28 September OpenRouter runs, where the claim held.
