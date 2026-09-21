# End-to-end verification, 18 September 2026

The local application was exercised through Playwright Chromium at desktop (1440 × 900) and mobile (390 × 844) sizes using fresh synthetic accounts.
Existing project data and the pre-existing edit in `src/server/modules/tasks/service.test.ts` were preserved.

## Findings and fixes

| Finding                                           | Reproduction                                                                                                                           | Fix and regression coverage                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mobile pages were clipped                         | A 390-pixel viewport left only 150 pixels for the main page; Task titles could disappear after creating a Task.                        | Collapsible navigation, a viewport-sized mobile Assistant, wrapping controls and rows, scrollable project navigation, and responsive overview grids. `e2e/responsive.spec.ts` exercises navigation, Assistant controls, project creation and Task creation.                                                                         |
| Dialog keyboard focus escaped into the background | Tab from the final control could reach controls behind the overlay; closing did not restore focus.                                     | Native modal dialogs contain focus and make the background inert; explicit restoration returns focus to the trigger. `e2e/dialog.spec.ts` verifies forward/backward traversal and Escape. The Decisions flow verifies nested Assumption dismissal and reopening.                                                                    |
| Assistant failed after a successful tool call     | A live request listed Tasks internally, then displayed “Something went wrong. Try again.” The server reported `AI_InvalidPromptError`. | Database timestamps were still JavaScript `Date` objects in model-facing tool results. The adapter now converts results to JSON values. A local two-step streamed-model regression exercises the real `list_tasks` service and passes through to an answer. The same tool configuration is supplied when converting saved messages. |
| Desktop smoke test navigated to account settings  | The Settings selector could run before project navigation completed.                                                                   | Wait for the project URL and select Settings inside the main project area.                                                                                                                                                                                                                                                          |

## Coverage

All 26 Chromium end-to-end tests pass.
The suite covers sign-up, anonymous redirects, sign-in errors, sign-out, project creation/settings, People and Teams, Statuses and Labels, Task CRUD and board/list views, Milestones, Dependencies and cycle rejection, Risks, Evidence uploads and linking, dashboards, calendars, command search, Comments, Activity history, Decisions, Assumptions, impact alerts, proposals, graph navigation and transcript citations.
It also covers the new mobile and keyboard regressions.

Additional browser checks exercised Profile save/reload/version restoration, API-token generation and revocation, Task filtering, cancellation of Task deletion, and deletion of a disposable Project.
The proposal tests use deterministic heuristic extraction.
With explicit approval, the live OpenAI Assistant was also checked against a fresh synthetic account and Project.
Both requests called `list_tasks`, completed with HTTP 200 and no stream error, and returned the exact synthetic Task title; the follow-up also returned its Todo status.
The saved conversation survived a full browser reload.
The disposable Project was deleted afterwards.

The unit/integration suite passes 260 tests across 33 files, including the new streamed Assistant-tool regression.
ESLint with zero warnings, TypeScript checking, Prettier checking, and `git diff --check` pass.
The pre-existing `caveman` skill file received formatting-only changes to clear the formatting check.

## Visual evidence

| State                 | Before                                                                           | After                                                                             |
| --------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Mobile dashboard      | [Clipped dashboard](screenshots/before-mobile-dashboard.png)                     | [Full-width dashboard](screenshots/after-mobile-dashboard.png)                    |
| Mobile Tasks          | [Clipped Task page](screenshots/before-mobile-tasks.png)                         | [Visible Task and controls](screenshots/after-mobile-tasks.png)                   |
| Mobile overview       | [Overlapping summary and narrow columns](screenshots/before-mobile-overview.png) | [Stacked summary and readable grids](screenshots/after-mobile-overview.png)       |
| Dialog keyboard focus | [Focus escaped](screenshots/before-dialog-focus.png)                             | [Focus returns to the dialog's Close control](screenshots/after-dialog-focus.png) |

[Mobile navigation](screenshots/after-mobile-navigation.png) and [nested Assumption dialog](screenshots/after-nested-dialog.png) were also inspected.
The overview captures span creation of one synthetic Task, so the progress count changes from 0/0 to 0/1.
The keyboard captures use equivalent New Project dialogs in separate synthetic accounts.

## Limits

The Assistant fix passes both the local streamed-model regression and the approved live OpenAI recheck.
Compare the [original live failure](screenshots/assistant-live.png) with the [successful answer](screenshots/after-assistant-live.png) and [successful follow-up after reload](screenshots/after-assistant-followup.png).
Assistant text currently renders Markdown emphasis markers literally; internal citation links remain supported.

WebKit was attempted but its installed browser binary crashed at launch with `Bus error: 10`, before reaching the application.
No Safari/WebKit compatibility claim is made.
This pass does not establish that the application is bug-free or cover production deployment, load, or exhaustive accessibility testing.

Browser screenshots from the existing suite were redirected into `.scratch/verification/screenshots` using temporary copies of the test files so that existing documentation screenshots were not overwritten.
The original suite assertions and flows were retained.
Temporary test copies and the saved browser session were removed after verification.
The Next.js server and both database containers started for this pass were stopped afterwards.
