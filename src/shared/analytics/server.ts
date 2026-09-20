import { PostHog } from "posthog-node";
import { after } from "next/server";
import { getSession } from "@/server/auth/session";

const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

let posthog: PostHog | null = null;
if (key) {
  posthog = new PostHog(key, { host: host || "https://us.i.posthog.com" });
}

function enqueue(userId: string, event: string, properties?: Record<string, unknown>) {
  if (!posthog) return;
  posthog.capture({ distinctId: userId, event, properties });
  after(() => posthog!.flush().catch(() => null));
}

export function capture(userId: string, event: string, properties?: Record<string, unknown>) {
  enqueue(userId, event, properties);
}

export async function captureCurrent(event: string, properties?: Record<string, unknown>) {
  const session = await getSession();
  if (!session) return;
  enqueue(session.user.id, event, properties);
}
