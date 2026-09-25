/**
 * `/invite/<token>` is a live credential: anyone holding that URL can set the Person's password
 * (ADR 0009). It must never leave the browser inside an analytics property, so the token is
 * replaced wherever it appears. The path itself is kept, so the funnel still shows that an
 * invite was opened.
 */
export const redactUrl = (value: string) => value.replaceAll(/\/invite\/[^/?#\s]+/g, "/invite/[token]");

/** True when a captured property could carry an invite token, and so needs `redactUrl`. */
export const carriesSecret = (value: unknown): value is string =>
  typeof value === "string" && value.includes("/invite/");

/**
 * A page whose own address is a credential. Analytics does not start on one at all: session
 * recording sends `$snapshot` events that never pass through `sanitize_properties`, so a
 * replay would keep the address bar exactly as it was, token included.
 */
export const isCredentialPath = (pathname: string) => pathname.startsWith("/invite/");

/** SDK envelopes include nested $set_once properties, so sanitize those as well as flat properties. */
export function redactAnalyticsProperties(value: unknown): unknown {
  if (typeof value === "string") {
    // URLs may contain arbitrary search text or encoded credentials in query/hash parameters.
    if (/^https?:\/\//.test(value) || value.startsWith("/")) return redactUrl(value.split(/[?#]/, 1)[0]);
    return carriesSecret(value) ? redactUrl(value) : value;
  }
  if (Array.isArray(value)) return value.map(redactAnalyticsProperties);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactAnalyticsProperties(item)]));
  }
  return value;
}
