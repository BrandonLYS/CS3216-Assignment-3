/**
 * Registers every in-process domain-event subscriber exactly once per server process.
 * Called from `Recorder.publish` (the only publisher) so the same module graph that writes
 * is the one that listens; `instrumentation.ts` would bundle a second copy of the db client
 * and services. The dynamic import breaks the cycle mutation -> impact service -> mutation.
 */
const globalForSubscribers = globalThis as unknown as { __subscribersReady?: Promise<void> };

export function ensureSubscribers(): Promise<void> {
  globalForSubscribers.__subscribersReady ??= import("@/server/modules/impact/subscriber").then((m) =>
    m.registerImpactDetector(),
  );
  return globalForSubscribers.__subscribersReady;
}
