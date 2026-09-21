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
