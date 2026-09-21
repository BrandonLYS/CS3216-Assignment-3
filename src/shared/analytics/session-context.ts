/** Correlation hints only. Authentication must always come from the server session. */
export const SESSION_HEADER = "X-PostHog-Session-Id";
export const USER_HEADER = "X-PostHog-Distinct-Id";

export function browserSessionId(headers: Headers, userId: string): string | undefined {
  if (headers.get(USER_HEADER) !== userId) return;
  const value = headers.get(SESSION_HEADER);
  if (value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return value;
}
