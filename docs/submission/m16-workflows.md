# M16 - Workflow Evidence

The e2e suite in `e2e/flows.spec.ts` verifies the canonical flows documented in `docs/flows.md`.

## Canonical workflow coverage

| Flow      | Spec file and line         | What is verified                                             |
| --------- | -------------------------- | ------------------------------------------------------------ |
| Auth      | `e2e/flows.spec.ts:56`     | Redirect, sign up, sign out, sign in                         |
| Project   | `e2e/flows.spec.ts:89`     | Create a Project and land on Overview                        |
| Evidence  | `e2e/flows.spec.ts:383`    | Add pasted notes and upload a file                           |
| Decisions | `e2e/flows.spec.ts:815`    | Record a Decision, cite Evidence, add Assumptions, supersede |
| Proposals | `e2e/flows.spec.ts:982`    | Propose from evidence, edit-and-accept, reject               |
| Assistant | Manual (not in Playwright) | Ask "Why did we" and receive cited answers                   |

## Latest local run

- 20 of 24 Playwright tests passed.
- 2 failed: `proposals` (expects 1 card, received 3 after schema fix) and `smoke` custom-status timeout.
- 2 skipped: `graph` and `transcripts` because they depend on the proposals test.

## Screenshot inventory

Screenshots are written to `docs/<flow>/screenshots/` by Playwright on each run.
The set under `docs/` should be regenerated with the production URL and copied to `docs/submission/screenshots/` for submission.
