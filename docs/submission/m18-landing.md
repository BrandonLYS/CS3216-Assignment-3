# M18 - Landing Page

The public landing page is implemented at `/`, with the authenticated workspace at `/dashboard`.
The current implementation builds on PR #78's five-chapter scroll film, rebased onto main with PrismPM branding and the shared prism logo.

## Implemented

- Hero, product/problem explanation, how-it-works film, Decision memory, capabilities, pricing hypothesis, CTA and footer.
- Clearly labelled free research preview, with future paid pricing still undecided and no checkout implied.
- Anonymous signup links and signed-in workspace links across all primary CTAs.
- Canonical production-origin configuration, Open Graph and Twitter metadata, and a branded 1200 x 630 social image.
- Sitemap containing only the public landing page; robots rules excluding private, auth, API and credential routes.
- Noindex metadata for non-marketing pages and explicit crawl suppression for Vercel previews.
- Five readable chapters without JavaScript, reduced-motion and missing-video fallbacks, deferred film loading and a prioritized hero poster.

## Verification and evidence

The [verification report](../artifacts/72-landing/README.md) records the tested code SHA, commands, results and limitations.
All 43 browser tests, including 12 landing checks, passed against the optimized local production build.
Local Lighthouse reports score 88 performance on mobile and 100 on desktop, with 100 accessibility, best practices and SEO on both.

- [Desktop before](../artifacts/72-landing/screenshots/before-desktop.png) and [after](../artifacts/72-landing/screenshots/after-desktop.png).
- [Phone before](../artifacts/72-landing/screenshots/before-mobile.png) and [after](../artifacts/72-landing/screenshots/after-mobile.png).
- [Desktop pricing](../artifacts/72-landing/screenshots/after-pricing-desktop.png) and [phone pricing](../artifacts/72-landing/screenshots/after-pricing-mobile.png).
- [Social image](../artifacts/72-landing/screenshots/social-preview.png) and [SEO response evidence](../artifacts/72-landing/seo-verification.json).
- Raw [mobile](../artifacts/72-landing/lighthouse/mobile.json) and [desktop](../artifacts/72-landing/lighthouse/desktop.json) Lighthouse reports.

## Production acceptance remains pending

No canonical live URL or accessible deployment was available during this work.
The local test fixture `https://prismpm.example` is not a deployed product URL.
Production builds require `SITE_URL` to name the real public HTTPS origin; configure it before deploying and use that same canonical origin on previews.
See the verification report's remaining-production-acceptance checklist for the live URL, screenshots, metadata/OG checks, Lighthouse report and release identity still required by issue #72.
