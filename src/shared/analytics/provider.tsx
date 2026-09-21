"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { carriesSecret, redactUrl } from "./redact";

function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname) return;
    const redacted = redactUrl(pathname);
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
      // Every string property is rewritten rather than a named list of them: the SDK adds URL
      // properties of its own ($session_entry_url, $referrer, $initial_*), and a list is a list
      // that the next version of posthog-js can grow past.
      sanitize_properties: (properties) => {
        for (const [key, value] of Object.entries(properties)) {
          if (carriesSecret(value)) properties[key] = redactUrl(value);
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
