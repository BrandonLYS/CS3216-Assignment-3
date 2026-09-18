/** How a cited Passage is named after its Evidence title: the speaker, else its position (issue #42). */
export const passageWhere = (p: { speaker: string | null; ordinal: number }) => p.speaker ?? `passage ${p.ordinal + 1}`;

/** First non-empty line of `text`, truncated by code point so emoji are never split into lone surrogates. */
export function firstLine(text: string, max = Number.POSITIVE_INFINITY): string {
  const line =
    text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.length > 0) ?? "";
  const chars = Array.from(line);
  return chars.length <= max ? line : `${chars.slice(0, max - 1).join("")}…`;
}
