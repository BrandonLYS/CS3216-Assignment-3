"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";
import { carriesSecret, isCredentialPath, redactUrl } from "./redact";

/**
 * Init and the first pageview capture live in one effect so they run in a guaranteed order.
 * Splitting them across parent and child effects (as this once did) is a race: effects fire
 * child-before-parent within a commit, so on the very render that leaves a credential path, a
 * child's capture could run before a parent's `init`, and `capture` before `init` is dropped.
 */
function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const started = useRef(false);

  useEffect(() => {
    // Analytics never starts on a page whose URL is itself a credential (ADR 0009). Session
    // recording is the reason this is a hard stop rather than more redaction: `$snapshot`
    // events do not pass through `sanitize_properties`, and a replay would hold the address
    // bar verbatim. Once the invite is accepted the browser is on the messages route, and
    // analytics starts there with no token anywhere in the session.
    if (!pathname || isCredentialPath(pathname)) return;

    if (!started.current) {
      const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
      const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
      if (!key) return;
      started.current = true;
      posthog.init(key, {
        api_host: host || "https://us.i.posthog.com",
        capture_pageview: false,
        // Autocapture reports the address bar on every event it sends, not only on the pageview
        // below, so the redaction has to happen here too or the invite token still escapes.
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
    }

    const redacted = redactUrl(pathname);
    // The query string goes with it: a redacted path next to the real one would be pointless.
    const query = redacted === pathname ? searchParams?.toString() : undefined;
    const url = query ? `${redacted}?${query}` : redacted;
    posthog.capture("$pageview", { $current_url: url });
  }, [pathname, searchParams]);

  return null;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return (
    <PHProvider client={posthog}>
      {children}
      <Suspense fallback={null}>
        <PostHogPageView />
      </Suspense>
    </PHProvider>
  );
}
