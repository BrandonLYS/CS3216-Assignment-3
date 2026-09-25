/**
 * The Participant session cookie's name, alone in a module with no imports so `src/proxy.ts`
 * can read it without pulling `node:crypto` and `next/headers` into the middleware bundle.
 */
// Retain the pre-rename cookie name so existing Participant sessions remain valid.
export const PARTICIPANT_COOKIE = "vantage_participant";
