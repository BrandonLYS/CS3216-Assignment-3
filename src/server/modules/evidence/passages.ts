/**
 * Pure transcript segmentation (issue #42). Speaker-labelled and timestamped lines start a
 * Passage; anything else continues the current one. When the text has no usable labels it falls
 * back to paragraphs, and long paragraphs are split at sentence boundaries. Never throws on any
 * string input; the service still guards the call so ingest cannot fail on a segmenter bug.
 */

export interface Passage {
  ordinal: number;
  speaker: string | null;
  timestamp: string | null;
  /** The turn without its label or timestamp. */
  text: string;
}

const TIME = String.raw`\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?`;
/** `[00:01:10] Priya: text`, `00:05 - Marcus: text`, `Priya: text`; the name is a short run of letters in any script. */
const LABEL = new RegExp(String.raw`^(?:${TIME}\s*[-–]?\s*)?(\p{L}[\p{L}\p{N} .'-]{0,40}?)\s*:\s*(.*)$`, "u");
/** A line that is only a timestamp: the next lines are the turn. */
const TIME_ONLY = new RegExp(String.raw`^${TIME}\s*$`);
/** `[00:00:01] text` or `00:00:01 - text` with no speaker; a bare `12:30 meeting moved` is prose. */
const TIME_LEAD = new RegExp(String.raw`^(?:\[(\d{1,2}:\d{2}(?::\d{2})?)\]|(\d{1,2}:\d{2}(?::\d{2})?)\s*[-–])\s*(.*)$`);
/** SRT/WebVTT cue timing lines carry no text; a pure number is SRT sequencing only when a cue line follows. */
const CUE = /^(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3}\s*-->.*|WEBVTT.*)$/;
const SEQUENCE = /^\d+$/;

export const PASSAGE_MAX_CHARS = 1200;
export const PASSAGE_MAX_COUNT = 5000;

type Draft = Omit<Passage, "ordinal">;

function labelled(lines: string[]): Draft[] {
  const out: Draft[] = [];
  const start = (d: Draft) => out.push(d);
  const cur = () => out[out.length - 1];
  for (const [i, raw] of lines.entries()) {
    const line = raw.trim();
    if (!line || CUE.test(line)) continue;
    if (SEQUENCE.test(line) && CUE.test(lines[i + 1]?.trim() ?? "")) continue;
    const timeOnly = TIME_ONLY.exec(line);
    if (timeOnly) {
      start({ speaker: null, timestamp: timeOnly[1]!, text: "" });
      continue;
    }
    const m = LABEL.exec(line);
    if (m) {
      start({ speaker: m[2]!.trim(), timestamp: m[1] ?? null, text: m[3]!.trim() });
      continue;
    }
    const lead = TIME_LEAD.exec(line);
    if (lead) {
      start({ speaker: null, timestamp: (lead[1] ?? lead[2])!, text: lead[3]!.trim() });
      continue;
    }
    const last = cur();
    if (last) last.text = last.text ? `${last.text}\n${line}` : line;
    else start({ speaker: null, timestamp: null, text: line });
  }
  return out;
}

/** Sentences first; a single sentence longer than the cap is cut at word boundaries, then hard. */
function splitLong(text: string): string[] {
  if (text.length <= PASSAGE_MAX_CHARS) return [text];
  const pieces: string[] = [];
  let buf = "";
  const flush = () => {
    if (buf) pieces.push(buf);
    buf = "";
  };
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    if (sentence.length > PASSAGE_MAX_CHARS) {
      flush();
      const words = sentence.match(new RegExp(String.raw`\S{1,${PASSAGE_MAX_CHARS}}(?:\s+|$)`, "g")) ?? [];
      for (const w of words) {
        if (buf.length + w.length > PASSAGE_MAX_CHARS) flush();
        buf += w;
      }
      buf = buf.trimEnd();
      flush();
      continue;
    }
    if (buf && buf.length + sentence.length + 1 > PASSAGE_MAX_CHARS) flush();
    buf = buf ? `${buf} ${sentence}` : sentence;
  }
  flush();
  return pieces;
}

const paragraphs = (text: string): Draft[] =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap(splitLong)
    .map((t) => ({ speaker: null, timestamp: null, text: t }));

export function segmentTranscript(text: string): Passage[] {
  const normalised = text.replace(/\r\n?/g, "\n");
  if (!normalised.trim()) return [];
  const lines = normalised.split("\n");
  const turns = labelled(lines).filter((d) => d.text);
  const labelledTurns = turns.filter((d) => d.speaker || d.timestamp);
  const bySpeaker = new Map<string, number>();
  for (const d of turns) if (d.speaker) bySpeaker.set(d.speaker, (bySpeaker.get(d.speaker) ?? 0) + 1);
  const nonBlank = lines.filter((l) => l.trim()).length;
  // A conversation has someone speaking twice, or timestamps throughout, or labels on most lines.
  // Minutes whose only colons are "Attendees:" and "Note:" among many paragraphs have none of those.
  const usable =
    labelledTurns.length >= 2 &&
    ([...bySpeaker.values()].some((n) => n >= 2) ||
      labelledTurns.every((d) => d.timestamp) ||
      labelledTurns.length * 2 >= nonBlank);
  const drafts = usable ? turns : paragraphs(normalised);
  return drafts.slice(0, PASSAGE_MAX_COUNT).map((d, ordinal) => ({ ordinal, ...d }));
}

/** The text handed to extractors: turns joined by blank lines, no labels, so excerpts stay inside one Passage. */
export const transcriptText = (passages: Array<{ text: string }>) => passages.map((p) => p.text).join("\n\n");
