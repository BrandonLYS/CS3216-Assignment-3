# PrismPM rename verification

Verified on 2026-09-21 against the local development app and Postgres containers.
The visible name is PrismPM and technical identifiers use `prismpm`.
The GitHub repository and checkout remain `CS3216-Assignment-3`.

## Changes and compatibility

The sweep covers landing, auth, Participant and workspace UI, page metadata, Assistant and Reflection prompts, MCP identity, npm package metadata, landing asset filenames, and editable documentation.
The new prism mark and generated favicon share the existing design tokens.
Regenerate the favicon with `npm run brand:icons`.

New API tokens use `prismpm_`; legacy tokens still authenticate and revoke through the same hash lookup.
The Assistant dock migrates the old preference, gives an existing new-key value precedence, and preserves toggles across reloads.
Participant cookies retain their existing name so signed-in sessions survive the rename.
No schema, account, Project data, database name, deployment URL, or Git remote change is required.

## Verification results

| Check                              | Result                     |
| ---------------------------------- | -------------------------- |
| `npm run format:check`             | Passed                     |
| `npm run lint -- --max-warnings=0` | Passed                     |
| `npm run typecheck`                | Passed                     |
| `npm test`                         | 39 files, 330 tests passed |
| `npm run test:e2e -- --workers=1`  | 35 tests passed            |
| `npm run build`                    | Production build passed    |
| `git diff --check`                 | Passed                     |

The app ran with `PROPOSALS_EXTRACTOR=heuristic` for deterministic Proposal tests.
Seven new browser tests cover public branding and favicon delivery, open and closed legacy preferences, new-key precedence in both directions, fresh browsers, reload persistence, token generation, authenticated MCP initialization, and revocation.
A service regression test authenticates and revokes a token issued under the legacy prefix.
The favicon was generated at 16, 32, 48, and 64 pixels; the mark and page screenshots were visually inspected.
The renamed landing video contains the existing abstract graph imagery and was inspected for embedded branding.

The first full browser run exposed two pre-existing selector failures.
The attention assertion matched both its fixture Task and an older Task that has now become overdue; it now scopes the assertion to the intended Task.
The status smoke test could click workspace Settings before Project navigation completed; it now waits for the Project URL and selects Settings inside the main content.
Both scenarios passed in the subsequent complete run without retries.

The npm lockfile was regenerated through npm.
No existing dependency entries or versions changed; npm expanded metadata for six dependencies already bundled in an optional Tailwind package.

## Visual proof

Captures use Chromium at 1440 x 1000 with reduced motion, the same routes, and the same account and empty workspace for both dashboard images.
The original captures intentionally show the previous brand.
Existing historical screenshots elsewhere in the repository were preserved after the workflow suite regenerated its screenshots.

| Surface               | Before                                     | After                                    |
| --------------------- | ------------------------------------------ | ---------------------------------------- |
| Landing               | [Before](screenshots/before-landing.png)   | [After](screenshots/after-landing.png)   |
| Login                 | [Before](screenshots/before-login.png)     | [After](screenshots/after-login.png)     |
| Signup                | [Before](screenshots/before-signup.png)    | [After](screenshots/after-signup.png)    |
| Dashboard and sidebar | [Before](screenshots/before-dashboard.png) | [After](screenshots/after-dashboard.png) |

## Final naming audit

A case-insensitive sweep of tracked filenames and text reviewed all remaining references to the former product name, token prefix, and package name.
Remaining legacy references are intentional:

- `vantage.assistant-open`: preference migration, its browser tests, and compatibility documentation.
- `vantage_participant`: the existing Participant cookie, its architecture documentation, and historical implementation notes.
- `vtg_`: the legacy token regression fixture and compatibility documentation.
- Existing repository URLs, checkout and worktree paths, course references, and historical command output.
- Archived screenshots and the before images in this report.

No active package name, MCP identity, visible text, AI prompt, or landing asset filename retains the former brand.
The generated Next.js instruction block and changelogs were left intact.
