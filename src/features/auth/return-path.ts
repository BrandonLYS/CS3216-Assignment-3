/** Only same-origin absolute paths; rejects `//host`, `javascript:` and anything else attacker-controlled. */
export function safeReturnPath(next: string | null) {
  return next && /^\/(?!\/)/.test(next) ? next : "/dashboard";
}
