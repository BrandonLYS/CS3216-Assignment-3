# Analytics identity and session continuity

Issue: [#73](https://github.com/BrandonLYS/CS3216-Assignment-3/issues/73).
Plan: [plan.md](plan.md).
Review record: [reviews.md](reviews.md).

## Reproduction

The baseline at `a0cb755` was exercised in a real Playwright browser against a local PostHog collector with a fake project key.
Both the installed browser SDK and server SDK ran unmodified.
PostHog filters automated browsers, so the test uses a regular Chrome user agent and disables the test browser's automation signals.
The collector replaces only the external ingestion service.
[Baseline events](baseline-events.json) show anonymous landing, signup and authenticated-page pageviews sharing one anonymous distinct id and SDK session, while `project_created` uses the internal User id with no `$session_id`.
The baseline assertion requiring matching server session failed before application changes.
The baseline also captured duplicate initial development pageviews; the new integration deduplicates effect reruns.

## Identity contract

`src/shared/analytics/browser.ts` owns browser identification, reset, pageviews, signup capture and request correlation.
The provider waits for Better Auth to resolve before initializing the SDK.
It reconciles restored sessions and resets persisted identified state if auth resolves anonymous or a different User signs in.
An explicit successful auth transition temporarily rejects stale hook values until the auth hook catches up.
Successful signup identifies with the internal User id before capturing exactly one `signup_completed`; returning sign-in never emits signup.
Successful sign-out resets identity, device and session before navigation.
A failure to sign out does not falsely reset attribution.
SDK exceptions fail closed for telemetry while leaving application operations usable.

Credential routes `/invite/*` and Participant entrances `/m/*` suppress analytics.
Participant-only messaging sessions are anonymous analytics identities, never Person ids or fabricated User ids.
When both cookies exist on the shared messages route, the real server viewer is the User, matching the existing `getViewer` rule.
Unused remote flag evaluation, automatic capture, pageleave, heatmaps, performance capture and replay are disabled; this integration sends explicit workflow events.
The capture gate checks the current URL, pending auth and captured identity, including SDK persistence changed by another tab.
URL query/hash values are removed and invite tokens are redacted throughout the event envelope, including nested initial/referrer properties.
No name, email, password, Project title, Evidence text or chat content is supplied in custom properties.

## Session contract for subsequent workflow captures

All current browser mutation entry points use fetch: Next Server Actions and `/api/assistant/chat`.
A narrow same-origin POST wrapper adds `X-PostHog-Session-Id` and `X-PostHog-Distinct-Id` immediately before these requests.
The installed SDK's `sessionManager.checkAndGetSessionAndWindowId()` treats the request as activity and rotates idle sessions before dispatch.
Application code never generates a session id and stores no separate session-correlation cookie.
The original request body, headers, credentials and signal remain intact.
Analytics exceptions fall back to the original request, and rejected mutations are never retried.

Server capture derives the User from Better Auth or the trusted route context.
It accepts a UUID-shaped session header only when the distinct-id hint equals that independently authenticated User id.
The hint is never used to authenticate, authorize or select a User.
Missing, invalid or mismatched context omits `$session_id`.
A direct background capture without request context has no browser session.
Headers are read before `after()`; the Assistant route awaits capture before streaming.
SDK initialization, synchronous capture, auth lookup, request-context and flush/scheduling failures never escape to the domain caller.

Future browser workflows should use `captureCurrent` after a successful Server Action or awaited `capture(ctx.userId, ...)` in the existing Assistant route.
A new HTTP endpoint needs an explicit addition to the narrow transport allowlist and regression coverage.
Supply internal ids and bounded workflow metadata only.
`$session_id` and `distinct_id` properties supplied by capture callers are stripped so they cannot override the contract.

## Verification commands

```sh
npx vitest run src/shared/analytics
ANALYTICS_E2E=1 npx playwright test --config playwright.analytics.config.ts
ANALYTICS_E2E=1 ANALYTICS_DISABLED=1 npx playwright test --config playwright.analytics.config.ts
npm run typecheck
npm run lint -- --max-warnings=0
npm run format:check
npm test
```

The dedicated Playwright config starts the app at port 3001 with isolated `.next/analytics` output, a fake key and a collector at port 3101.
It requires the normal local database and leaves a normal dev server at port 3000 untouched.
`ANALYTICS_REUSE_SERVER=1` is only for a manually started app with these exact test settings.
The disabled run must start a new server so the key is absent in both compiled browser code and server code.
[Verified events](verified-events.json) contain only event names, synthetic internal ids, session ids and timestamps.
Local SDK event timestamps establish identify -> signup -> Project creation ordering; batched network arrival order is not event order.

## UI proof

Viewport: 1440 x 900; synthetic display name `Analytics Test`, Project `Analytics Project`, key `ANA`.
Auth and Project creation retain the existing visual design.
The Playwright flow verifies the interactions and the screenshots verify the rendered result.
Visual inspection confirmed the signup form and Project overview retain their layout and content.
The initial signup screenshot caught a loading state, so the baseline screenshots were recaptured from an archived `a0cb755` checkout after waiting for rendered controls.
The archived baseline used Webpack because Turbopack rejected its shared dependency symlink; the application files were unchanged.
Synthetic email ids and relative Activity Event ages differ between runs.

| Flow            | Before                                             | After                                            |
| --------------- | -------------------------------------------------- | ------------------------------------------------ |
| Signup          | [Before](screenshots/before-analytics-signup.png)  | [After](screenshots/after-analytics-signup.png)  |
| Created Project | [Before](screenshots/before-analytics-project.png) | [After](screenshots/after-analytics-project.png) |

## Check results

- Full Vitest suite: 42 files, 364 tests passed.
- Focused analytics tests: 32 passed.
- Real SDK browser suite: 6 scenarios passed.
- Analytics unconfigured: signup, Project creation and sign-out passed; 5 analytics-only scenarios intentionally skipped.
- Typecheck, ESLint with zero warnings and repository formatting passed.
- A pre-existing lint failure from ignored `.scratch` scripts was resolved by excluding that disposable directory from ESLint.
- Next generated the analytics output type includes in `tsconfig.json`; they are retained for reproducible test runs.

## Production Live Events

Status: pending access, not verified.
The supplied screenshot identifies PostHog project `618308` in US Cloud and provides a write-only ingestion token.
The project opens at the PostHog login screen in the available browser; no read-capable credential or signed-in project session is available.
The deployed application URL has not been supplied.
The GitHub repository has no homepage URL or deployment records from which to resolve that URL.
No production Live Events screenshot, production release SHA or production verification timestamp is claimed.
The local event evidence is not production evidence.

Once access is available, deploy the reviewed commit, record its full release SHA and UTC verification timestamp here, and use a clean browser to visit landing, sign up and create a Project.
In Live Events verify the anonymous event's identify link, exactly one signup, the common User/session for signup and Project creation, and event timestamp ordering.
Then sign out, sign in as a second synthetic User and verify distinct User/session attribution.
Export only redacted event names, pseudonymized ids/session ids, timestamps and release metadata, without the ingestion key, auth credentials or personal/Project content.
