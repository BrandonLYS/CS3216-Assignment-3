# Handoff - issues #36 to #42 (decision-memory layer)

Written when the session stopped mid-way through #40.
Read this first, then the per-issue `docs/artifacts/<n>-<slug>/plan.md` and `implementation-notes.md`.

## Process used (keep it)

For each issue, in order:

1. Fetch the issue with `gh issue view <n>`, write `docs/artifacts/<n>-<slug>/plan.md` (summary, verified facts, design decisions, commit points, how to test, out of scope).
2. Have a review agent critique the plan; iterate until it says APPROVE; commit the plan.
3. Implement commit by commit in a worktree `/Users/qang/projects/CS3216-A3-wt/<n>-<slug>` on branch `feat/<n>-<slug>` off `origin/main`.
   Tests first inside each commit; `npm run typecheck`, `npm run lint`, `npm run format:check` green per commit; `npm test` once at the end; full e2e run.
4. `/code-review` (two subagents: Standards axis and Spec axis) on the branch diff; fix what they find.
5. Write `implementation-notes.md`, push, `gh pr create` with `Closes #n`.
6. Adversarial review by a subagent standing in for Codex (no `codex` CLI on this machine; the user chose a Devin subagent); post its findings as a PR comment; fix; post the resolution comment; re-review until APPROVE.
7. Wait for CI (`gh pr checks`), `gh pr merge --squash --delete-branch`, confirm the issue is CLOSED, remove the worktree.

Worktree setup that works: `git worktree add -b feat/<n>-<slug> /Users/qang/projects/CS3216-A3-wt/<n>-<slug> origin/main`, then `npm ci` inside it (a symlinked `node_modules` makes Turbopack panic), `cp ../../CS3216-Assignment-3/.env .env`, set `BETTER_AUTH_URL=http://localhost:31<n>` and add `PROPOSALS_EXTRACTOR=heuristic` (the e2e `proposals` flow requires it).
Dev server: `npx next dev -p 31<n>`; e2e: `E2E_PORT=31<n> E2E_NO_SERVER=1 npx playwright test e2e/flows.spec.ts` (the suite is serial and must run whole; `--grep` breaks it).
After an e2e run, `git checkout --` every `docs/*/screenshots` directory you did not intend to change (the spec rewrites them all).
Review subagents have no shell: write the diff to a file (`git diff <base>...HEAD -- . ':!*.png' > /tmp/diffN.patch`) and point them at it.

## Done and merged

| Issue | PR  | Merge commit on `main`                                                 | Artifacts                              |
| ----- | --- | ---------------------------------------------------------------------- | -------------------------------------- |
| #36   | #43 | `d67cdbb` Record Decision and Assumption in the domain language        | `docs/artifacts/36-decision-language/` |
| #37   | #44 | `6698bae` A PM can record a Decision and its typed Assumptions by hand | `docs/artifacts/37-decisions/`         |
| #38   | #45 | `c69b91b` A broken Assumption raises an impact alert                   | `docs/artifacts/38-impact-alerts/`     |
| #39   | #46 | `fc618a8` The Assistant proposes Decisions for confirmation            | `docs/artifacts/39-proposals/`         |
| #40   | #47 | `9ddb67a` "Why did we..." answers with citations                       | `docs/artifacts/40-why-did-we/`        |
| #41   | #48 | `fea1c26` Node-centred graph view                                      | `docs/artifacts/41-graph-view/`        |
| #42   | #49 | `912d42d` Transcripts as Evidence with passage-level citation          | `docs/artifacts/42-transcripts/`       |

What they added, in one line each:

- #36: `CONTEXT.md` "Decision Memory" section (Decision, Assumption, Source, Cause/Consequence, later Proposal) and `docs/adr/0008-decision-memory-graph.md` (two node types, typed edges in Postgres, Source = entity reference + optional `passageId`, Assistant proposes / human confirms, history from Activity Events).
- #37: `src/server/modules/decisions/` (tables `decisions`, `assumptions`, `decision_edges`, `decision_sources`; migration `0007`), Decisions tab, Decision dialog with Source picker, Assumptions panel, supersede; `Dialog` stops nested-form submit bubbling; `openProject` in e2e scoped to `<main>`.
- #38: `src/server/modules/impact/` (pure detector + bounded walk + event-bus subscriber registered from `Recorder.publish` via `ensureSubscribers`), `via: "system"`, `brokenReason` / `alertDismissedAt` (migration `0008`), Activity Event ids generated app-side and stamped on each `FieldChange`, `assumption_broken` attention rule, `ImpactAlerts` panel, "Leads to" picker, "Mark broken".
- #39: `src/server/modules/proposals/` (tables `decision_proposals`, `proposal_pass_sources`; migration `0009`), heuristic + model extractors, traceability filter, `decisionsService.create` takes `proposalId` + inline `assumptions[]`, proposal cards on the Overview, edit-and-accept via the Decision dialog, acceptance rate, `after()` scheduling; `AGENTS.md` now lists the Assistant-document exception to `mutate`.
- #40: `decisionsService.search` + `src/server/modules/decisions/answers.ts` (ranking, `citation()`, `sourceHref`), `evidenceRepo.searchByTerms`, `search_decisions` Assistant tool + `WHY_RULES`, `LinkedText` in the dock (only normalised `/projects/` paths become links), `?tab=history` deep link on item dialogs, `messagesRepo.upsertMany` dedupe, `src/shared/lib/hrefs.ts`. Three adversarial review rounds are PR #47 comments; the declined items and reasons are in `implementation-notes.md`.
- #41: `src/server/modules/graph/` (pure `neighbourhood` walk with derived `watches` and `depends_on` edges and a reachability highlight from broken Assumptions; `graphService.neighbourhood` read model; `parseNodeParam`), `GRAPH_CENTRE_TYPES` in `shared/domain`, `taskHref`/`milestoneHref`/`riskHref`/`graphHref`, route `/projects/[projectId]/graph?node=<type>:<id>` + `src/features/graph/graph-view.tsx`, "Show me why" on alerts, "Show why" on Decision rows and dialog, e2e `graph` flow (runs last, after `proposals`). Plan was committed straight to `main` (`862baa7`) before the branch, unlike earlier issues where it was the first branch commit.

- #42: `transcript` Evidence kind (migration `0010`), `evidence_passages` + `passagesRepo`, pure `segmentTranscript` in `evidence/passages.ts` (labelled turns, paragraph fallback, hard cap), `syncPassages` inside the Evidence `mutate`, `decision_sources.passageId` FK `SET NULL`, Passage sub-picker and live chip labels in the Source picker, `passageHref` + `#passage-<id>` on the Evidence page with `ScrollToHash`, Proposal pass prefers transcripts and `attachPassages`; `conversationsRepo.findOrCreate` race fix. Three adversarial rounds on PR #49.

## All done

Issues #36 to #42 are merged and closed. Nothing from this handoff is left open.

## Things to know

- Pre-commit runs lint-staged + typecheck; CI runs `format:check`, `eslint --max-warnings=0`, `typecheck` on Bun.
- The repo's lint forbids synchronous `setState` in effects and ref access during render; see `ItemDialogTabs` for the deferred-load pattern.
- `docs/flows.md` has one row per e2e flow; the `decisions`, `impact`, `proposals` flows run last in that order and depend on each other's data; a new flow goes after `proposals`.
- The Assistant proof for #40 used the latest e2e account (`select email from "user" where email like 'flows-%' order by created_at desc limit 1` on the dev DB, password `flows-password-123`) and a throwaway Playwright script; the model is `gpt-4o-mini`.
- The main checkout `/Users/qang/projects/CS3216-Assignment-3` still has an unrelated uncommitted change in `src/server/modules/tasks/service.test.ts` (a "lists tasks for a project" test) and a stash `stash@{0}` from before this session; both were left untouched.
