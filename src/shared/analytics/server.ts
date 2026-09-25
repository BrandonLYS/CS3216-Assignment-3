import { PostHog } from "posthog-node";
import { headers } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import { getSession } from "@/server/auth/session";
import { SESSION_HEADER, USER_HEADER } from "./session-context";

let posthog: PostHog | undefined;

const sessionHint = z.uuid();

/** A hint names the browser session only when its distinct id is the independently authenticated User. */
function browserSessionId(requestHeaders: Headers, userId: string): string | undefined {
  if (requestHeaders.get(USER_HEADER) !== userId) return;
  const value = requestHeaders.get(SESSION_HEADER);
  if (value && sessionHint.safeParse(value).success) return value;
}

function client() {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;
  return (posthog ??= new PostHog(key, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
  }));
}

/** Trusted User id from route context; browser headers only supply optional session correlation. */
export async function capture(userId: string, event: string, properties?: Record<string, unknown>) {
  try {
    const analytics = client();
    if (!analytics) return;
    let sessionId: string | undefined;
    try {
      sessionId = browserSessionId(await headers(), userId);
    } catch {
      // Background callers have no originating browser request, hence no browser session.
    }
    const safeProperties = { ...properties };
    delete safeProperties.$session_id;
    delete safeProperties.distinct_id;
    analytics.capture({
      distinctId: userId,
      event,
      properties: {
        ...safeProperties,
        // Explicit: a missing property cannot say whether a browser session was absent or lost.
        // Work scheduled with `after()` still reads its originating request, so it says "browser".
        browser_context: sessionId ? "browser" : "none",
        ...(sessionId ? { $session_id: sessionId } : {}),
      },
    });
    const flush = async () => {
      try {
        await analytics.flush();
      } catch {
        // Analytics delivery is best effort and cannot fail a completed operation.
      }
    };
    try {
      after(flush);
    } catch {
      // Also support captures outside a Next request lifecycle.
      void flush();
    }
  } catch {
    // Includes initialization, request metadata and synchronous SDK capture failures.
  }
}

export async function captureCurrent(event: string, properties?: Record<string, unknown>) {
  try {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
    const session = await getSession();
    if (session) await capture(session.user.id, event, properties);
  } catch {
    // Session lookup for optional telemetry must not turn a successful write into an error.
  }
}
