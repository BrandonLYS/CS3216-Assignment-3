import { PostHog } from "posthog-node";
import { headers } from "next/headers";
import { after } from "next/server";
import { getSession } from "@/server/auth/session";
import { browserSessionId } from "./session-context";

let posthog: PostHog | undefined;

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
      properties: { ...safeProperties, ...(sessionId ? { $session_id: sessionId } : {}) },
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
