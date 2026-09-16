export type DiffLine = { kind: "same" | "added" | "removed"; text: string };

/** Line diff by longest common subsequence; small documents only (Profile, Working Memory). */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before ? before.split("\n") : [];
  const b = after ? after.split("\n") : [];
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      out.push({ kind: "same", text: a[i]! });
      i++;
      j++;
    } else if (i < a.length && (j >= b.length || lcs[i + 1]![j]! >= lcs[i]![j + 1]!)) {
      out.push({ kind: "removed", text: a[i++]! });
    } else {
      out.push({ kind: "added", text: b[j++]! });
    }
  }
  return out;
}
