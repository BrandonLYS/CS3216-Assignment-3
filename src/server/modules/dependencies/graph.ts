/** Pure graph helpers over dependency edges; no I/O so they are trivially testable. */

export interface Edge {
  predecessorId: string;
  successorId: string;
}

/** True if adding predecessor → successor would create a cycle (successor already reaches predecessor). */
export function wouldCreateCycle(edges: Edge[], predecessorId: string, successorId: string): boolean {
  if (predecessorId === successorId) return true;
  const next = new Map<string, string[]>();
  for (const e of edges) next.set(e.predecessorId, [...(next.get(e.predecessorId) ?? []), e.successorId]);
  const seen = new Set<string>();
  const stack = [successorId];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === predecessorId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    stack.push(...(next.get(cur) ?? []));
  }
  return false;
}

/** All items transitively downstream of `itemId`. */
export function downstreamOf(edges: Edge[], itemId: string): Set<string> {
  const next = new Map<string, string[]>();
  for (const e of edges) next.set(e.predecessorId, [...(next.get(e.predecessorId) ?? []), e.successorId]);
  const out = new Set<string>();
  const stack = [...(next.get(itemId) ?? [])];
  while (stack.length) {
    const cur = stack.pop()!;
    if (out.has(cur)) continue;
    out.add(cur);
    stack.push(...(next.get(cur) ?? []));
  }
  return out;
}
