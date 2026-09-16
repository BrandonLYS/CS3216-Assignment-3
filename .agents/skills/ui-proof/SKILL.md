---
name: ui-proof
description: Capture visual proof for any user-visible UI change. Use when changing pages, components, styles, layouts, interactions, or browser flows.
---

# UI proof

For each user-visible change, prove it in a Playwright browser.

1. Start required local services and open affected route with Playwright.
2. Before editing, capture a screenshot of current state. If no runnable baseline exists, record why.
3. Make change.
4. Reopen same route and recreate same state with Playwright.
5. Capture after screenshot.
6. Inspect after screenshot and verify changed behavior or appearance matches task.
7. In final response, report both screenshot paths and concise result.

Use stable viewport, route, data, and interaction state for both screenshots. Name captures clearly: `before-<feature>.png` and `after-<feature>.png`.

For non-visual work, state that UI proof does not apply. For visual changes blocked by unavailable services, state exact blocker and retain any screenshot captured.
