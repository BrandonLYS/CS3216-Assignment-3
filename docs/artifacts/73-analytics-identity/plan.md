# Issue #73: analytics identity and browser sessions

Source: https://github.com/BrandonLYS/CS3216-Assignment-3/issues/73.
Base: `a0cb755` on `origin/main`.

## Contract and scope

The browser identifies an authenticated User using the stable internal User id already used by server captures.
Anonymous landing events link to that User through PostHog identify; signup is emitted once, after identification and before navigation.
Returning sign-in, restored sessions and client-side navigation use the same contract.
Successful sign-out resets identity before navigation; switching Users resets before identifying the next User.
Participant routes never identify a Person as a User, including when a PM cookie coexists.
Analytics must not break authentication or successful domain writes when configuration, storage, initialization or transport fails.

The browser adds the real SDK session id to same-origin browser mutation fetches as `X-PostHog-Session-Id`.
A small fetch boundary covers Next Server Actions and the Assistant POST route, preserves request bodies/options and falls back to the untouched request if analytics fails.
Immediately before each eligible request, use the SDK session manager's activity-aware `checkAndGetSessionAndWindowId()` to expire/rotate idle sessions and retrieve the actual session id.
The SDK itself recommends its session manager for actual internal session use; `get_session_id()` is read-only and does not rotate idle sessions.
Do not maintain a second persistent cookie or create session ids in application code.
Only attach context while the browser has a resolved User on an allowed route.
Also send the currently identified id as a correlation consistency hint; the server only accepts the session when that hint equals its independently authenticated User id.
The browser headers convey analytics correlation only and never authenticate anyone.
Server identity remains sourced from the authenticated session or trusted route context.
Missing or malformed correlation means omit `$session_id`; background work receives no invented browser session.
Read request context before scheduling `after()` and keep flush failures isolated.

Credential routes must suppress capture and recording even after initialization on another route.
Preserve invite-token URL redaction.
Custom event properties contain only existing internal ids and bounded metadata, never emails, names, credentials or Project content.
Do not introduce schema migrations, domain mutation changes, extra signup capture sites or new product UI.

## Implementation and commit points

1. `docs: plan analytics identity and session continuity (#73)`.
   Save the issue contract, baseline reproduction and plan review convergence here.
2. `fix: connect browser analytics identity and server sessions (#73)`.
   Add a small browser analytics boundary shared by the provider and auth transitions.
   Resolve auth before initializing analytics or capturing pageviews, and synchronize restored sessions.
   Disable automatic capture and replay in this explicit workflow-event integration so pending auth and credential transitions cannot emit automatic events.
   Guard every capture against the current credential/Participant URL and reset persisted identified state when auth resolves anonymous.
   Preserve anonymous-to-signup session continuity, reset on sign-out/account change, and isolate Participant/credential routes.
   Enrich both server-action and authenticated route captures with validated request correlation.
   Add focused regression coverage and document the capture contract.
3. `test: record analytics flow verification and review (#73)`.
   Record real SDK event evidence, browser proof, checks, review outcomes and exact production-access limitations.
   Apply review fixes in separate focused commits when necessary.

## Verification

Use the existing browser/auth workflow and exported server analytics capture functions as the regression seams.
The implement skill requests TDD where possible; the user's request already authorizes the issue's explicit regression coverage and review iteration.
Drive the real UI with Playwright and collect browser/server SDK payloads at a local HTTP collector using a test project key.
First reproduce anonymous landing -> signup -> Project creation before changing application code, including absent identification and absent server session correlation.
Then verify identification precedes exactly one signup event, server Project creation has the authenticated id and same SDK session id, reload restores identity, client navigation stays identified, logout rotates identity/session, and a second User cannot inherit the first User's attribution.
Also verify returning sign-in does not emit signup, expired/stale identity is cleared, Participant/credential route isolation, malformed/missing session correlation, session rotation, and blocked/unconfigured analytics leaves successful operations usable.
Test synchronous initialization, storage, identify/reset and capture failures, request-context errors and `after()` scheduling failure in addition to blocked HTTP.
If server capture becomes asynchronous, await it in the Assistant route before streaming.
Test safe-page initialization followed by client navigation to an invite route; replay is disabled and every capture is URL-gated.
Check actual outgoing request headers after an idle timeout, session rotation and excluded-audience transitions.
The first Project mutation after inactivity must carry the newly rotated SDK session, without needing an intervening browser event.
Check tokens and personal/content fields are absent from custom payloads.
Run focused tests and typechecking during implementation; run the full Vitest suite and relevant Playwright suite at the end, plus repository lint and formatting checks.

Apply [ui-proof](../../../.agents/skills/ui-proof/SKILL.md) because auth interactions are touched.
Capture matched before/after screenshots for signup and created Project with the same viewport and synthetic fixture values; visually inspect the results.

## Review and release

A separate reviewer must challenge this plan, and unresolved findings must be fixed and re-reviewed before implementation.
After implementation use the code-review skill with the pinned base for parallel Standards and Spec reviews.
Push, open a PR and run a fresh adversarial reviewer on the PR diff.
Post the resulting review as a PR comment, iterate to zero actionable findings and wait for CI before merging.
The issue explicitly allows reporting missing production access.
A configured ingestion key alone does not permit reading PostHog Live Events.
If access remains unavailable, record that production validation is pending, including no claimed production release SHA or timestamp; do not label local evidence as production proof.
