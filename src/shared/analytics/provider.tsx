"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

/**
 * Paths whose URL carries a secret. `/invite/<token>` is a live credential: anyone holding it
 * can set that Person's password (ADR 0009), so the token must never leave the browser in a
 * captured URL. The path is reported without it rather than dropped, so the funnel still shows
 * that an invite was opened.
 */
const redactPath = (pathname: string) => (pathname.startsWith("/invite/") ? "/invite/[token]" : pathname);

/** The same redaction for a value that may be a whole URL rather than a path. */
const redactUrl = (value: string) => value.replace(/\/invite\/[^/?#]+/, "/invite/[token]");

function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname) return;
    const redacted = redactPath(pathname);
    // The query string goes with it: a redacted path next to the real one would be pointless.
    const query = redacted === pathname ? searchParams?.toString() : undefined;
    const url = query ? `${redacted}?${query}` : redacted;
    posthog.capture("$pageview", { $current_url: url });
  }, [pathname, searchParams]);

  return null;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
    if (!key) return;
    posthog.init(key, {
      api_host: host || "https://us.i.posthog.com",
      capture_pageview: false,
      // Autocapture reports the address bar on every event it sends, not only on the pageview
      // above, so the redaction has to happen here too or the invite token still escapes.
      sanitize_properties: (properties) => {
        for (const key of ["$current_url", "$pathname", "$initial_current_url", "$initial_pathname"]) {
          const value = properties[key];
          if (typeof value === "string") properties[key] = redactUrl(value);
        }
        return properties;
      },
    });
  }, []);

  return (
    <PHProvider client={posthog}>
      {children}
      <Suspense fallback={null}>
        <PostHogPageView />
      </Suspense>
    </PHProvider>
  );
}
