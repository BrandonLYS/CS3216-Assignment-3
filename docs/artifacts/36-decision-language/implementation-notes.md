# Implementation notes - #36 Record Decision and Assumption in the domain language

Branch `feat/36-decision-language`. Implemented commit by commit as laid out in [plan.md](./plan.md).

## Commits

| #   | Commit                                                                                    | Files                                    |
| --- | ----------------------------------------------------------------------------------------- | ---------------------------------------- |
| 1   | `docs(context): define Decision, Assumption, Source, Cause and Consequence`               | `CONTEXT.md`                             |
| 2   | `docs(adr): 0008 decision memory as two node types with typed, sourced edges in Postgres` | `docs/adr/0008-decision-memory-graph.md` |
| 3   | `docs: plan and implementation notes for #36`                                             | `docs/artifacts/36-decision-language/*`  |

No schema change, no migration, no application code, no new dependency.

## Deviations from the plan

1. The plan review moved validation rules ("no Source, not accepted", "external-rule breaks only by hand", "only holding Assumptions detected") out of `CONTEXT.md` into the ADR, so the glossary stays a glossary.
2. The date Assumption gained `targetField` (`startDate | dueDate`) and `assumedUntil` during review; without them impact detection (#38) could not decide when a date Assumption breaks.
3. `leads_to` keeps Risk as a target, recorded as a terminal consequence because `dependencies` connects only Tasks and Milestones.
4. Source `entityId` is documented as an unenforced polymorphic key (Evidence and Comments are deletable), with `excerpt` and `label` as the durable display.

## Verification

- `npm run format:check`, `npm run lint`, `npm run typecheck`: green.
- `git diff --stat origin/main`: only `CONTEXT.md`, `docs/adr/0008-decision-memory-graph.md`, `docs/artifacts/36-decision-language/*`.
- No em dashes in the new files; `### Decision Memory` sits between `### Evidence` and `### Discussion`; ADR front matter is `status: accepted`.
- Acceptance checklist from the issue walked item by item in the PR description.
