# M18 landing implementation and local verification

This change builds on [PR #78](https://github.com/BrandonLYS/CS3216-Assignment-3/pull/78) and implements the remaining landing-page work in [issue #72](https://github.com/BrandonLYS/CS3216-Assignment-3/issues/72).
It is rebased onto `main` at `a0cb75506c74d807e28e09d42759855056c28f01`, including the PrismPM rename and Participant messaging changes.
The verified application code is commit `82f9417395eff940353d5290b60f195d6af6ffd3`.
Verification took place on 21 September 2026.

## Scope and production status

The new pricing section describes a free research preview and explicitly labels future pricing as a hypothesis.
It offers account creation, not checkout or an implemented subscription.
The landing page uses main's PrismPM brand, renamed assets and shared prism logo while retaining PR #78's film and visual structure.
The social preview renders the same shared Logo component with resolved design tokens.
Main's compatibility handling for existing tokens, Participant sessions and saved Assistant preferences remains intact.
Anonymous visitors can create an account; signed-in visitors get workspace links from the navigation, hero, pricing and closing CTA.

The page now serves canonical, Open Graph and Twitter metadata, a 1200 x 630 branded PNG with alternative text, a public-page-only sitemap and a robots policy excluding private and credential-bearing routes.
Non-marketing pages inherit noindex metadata and do not inherit the landing canonical.
Vercel preview deployments disallow crawling and publish an empty sitemap.
The generated image resolves colors from the existing CSS design tokens during the build.

**These artifacts verify a local optimized production build, not a public deployment.**
The real production URL was unavailable: the repository homepage was empty, GitHub listed no deployments, and checked-in deployment documentation contained placeholders.
The requested canonical URL and deployment details remain pending.
`https://prismpm.example` is an intentionally reserved test fixture used to check absolute URL generation; it is not a live product URL and is not a default in the application.
The verified local address was `http://localhost:3000/`.
No production deployment or production acceptance claim has been made.

## Reproduction

Use the current lockfile and the local Postgres services, migrate the application database, then build and serve with these test-only settings:

```sh
SITE_URL=https://prismpm.example PROPOSALS_EXTRACTOR=heuristic npm run build
SITE_URL=https://prismpm.example PROPOSALS_EXTRACTOR=heuristic npm start
```

Run browser verification against that server:

```sh
SITE_URL=https://prismpm.example E2E_NO_SERVER=1 npm run test:e2e -- --workers=1
```

`SITE_URL` is required for production builds and must be the canonical public HTTPS origin, without a path, credentials, query or fragment.
Use the real production origin in both the production and preview environments.
It is independent of the authentication origin and is never inferred from an incoming request or a temporary deployment hostname.
Changing the canonical origin requires a rebuild because the sitemap and social image are prerendered.

## Verification results

| Check                                                 | Result                                                           |
| ----------------------------------------------------- | ---------------------------------------------------------------- |
| Production build and TypeScript                       | Passed                                                           |
| ESLint with zero warnings                             | Passed                                                           |
| Repository formatting                                 | Passed                                                           |
| Full unit/integration suite                           | 349 tests passed across 41 files                                 |
| Canonical-origin and preview-crawling tests           | 13 passed                                                        |
| Full browser suite against the final production build | 43 passed, including 12 landing tests; no retries                |
| Anonymous social image, robots and sitemap requests   | HTTP 200; correct content types                                  |
| Twitterbot metadata request                           | Canonical and OG image present in returned HTML                  |
| Desktop and phone layout                              | No horizontal overflow or browser page errors in captured states |

Browser coverage includes each of the five film chapters at 390 x 844, 844 x 390, 820 x 768 and 1280 x 600; switching compact/reduced-motion states; a missing video; disabled JavaScript; mobile pricing navigation; signup and authenticated CTAs; private-route redirects; image dimensions; canonical metadata; and the sitemap/robots content.
The phone hero is also checked to ensure the film is not requested until it enters view.

The full production-browser run exposed repeated sign-ins in the workflow suite hitting the production rate limiter.
The dedicated authentication flow still exercises signup, sign-out, an invalid password and successful login; subsequent workflows now reuse that session.
All 43 tests passed after that correction, without changing production rate limits.
The unrelated workflow screenshots generated by the suite were preserved locally and restored to their historical versions in Git.

Two baseline landing defects were reproduced before correction.
PR #78's old browser tests still expected the previous four chapters.
Without JavaScript, only the first film chapter was accessible; the page now starts with all five readable chapters and progressively enables the pinned film.
The new social image was initially caught by the application's optimistic login redirect; its exact public route is now allowed and covered by an anonymous request test.

## Lighthouse

Lighthouse 13.5.0 ran against the optimized local build in headless Chromium.
The final mobile and desktop runs were sequential, with no concurrent browser tests.
Mobile uses Lighthouse's default mobile emulation and simulated throttling; desktop uses its desktop preset.
Exact timestamps, viewport, throttling configuration, environment and all audits are retained in the raw reports.

| Final report                       | Performance | Accessibility | Best practices | SEO |
| ---------------------------------- | ----------: | ------------: | -------------: | --: |
| [Mobile](lighthouse/mobile.json)   |          88 |           100 |            100 | 100 |
| [Desktop](lighthouse/desktop.json) |         100 |           100 |            100 | 100 |

The film now loads only when visible and the hero poster has a high-priority preload.
The final mobile run transfers about 608 KiB initially and reports 3.6 seconds LCP; desktop reports 0.7 seconds LCP.
These are local lab measurements, not production field performance guarantees.
Remaining mobile performance opportunities include JavaScript transfer and third-party analytics work; the raw report records them rather than implying a perfect mobile performance score.

## Visual proof

The before and after full-page captures use the same anonymous route and reduced-motion setting, at 1440 x 900 and 390 x 844.
The original before captures show PR #78 before the pricing work.
The additional brand-before captures show the previous production build immediately before the PrismPM update; old branding is retained only as historical visual evidence.
The separate pricing captures show the entire section; the phone pricing capture uses the same 390-pixel width with a 1200-pixel viewport height so sticky navigation does not cover the section.
The hero and film captures use normal motion on desktop.

| Surface         | Before                                         | After                                            |
| --------------- | ---------------------------------------------- | ------------------------------------------------ |
| Desktop landing | [Before](screenshots/before-desktop.png)       | [After](screenshots/after-desktop.png)           |
| Phone landing   | [Before](screenshots/before-mobile.png)        | [After](screenshots/after-mobile.png)            |
| Desktop rename  | [Before](screenshots/before-brand-desktop.png) | [After](screenshots/after-desktop.png)           |
| Phone rename    | [Before](screenshots/before-brand-mobile.png)  | [After](screenshots/after-mobile.png)            |
| Desktop pricing | Section did not exist                          | [Pricing](screenshots/after-pricing-desktop.png) |
| Phone pricing   | Section did not exist                          | [Pricing](screenshots/after-pricing-mobile.png)  |

[Hero](screenshots/after-hero-desktop.png), [scroll film](screenshots/after-film-desktop.png), [social preview](screenshots/social-preview.png), and [machine-readable SEO checks](seo-verification.json).

## Remaining production acceptance

1. Confirm the real canonical production origin and set `SITE_URL` for the deployment build and runtime.
2. Deploy the rebased PrismPM changes, which include the landing film from PR #78.
3. Verify the anonymous public URL, metadata, image, robots and sitemap on that deployment.
4. Repeat desktop/mobile screenshots and Lighthouse against the live URL, recording the deployed release SHA and timestamp.
5. Attach those public-deployment artifacts before marking issue #72's production acceptance complete.
