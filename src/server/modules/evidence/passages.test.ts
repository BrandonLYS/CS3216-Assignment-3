import { describe, expect, it } from "vitest";
import { segmentTranscript, transcriptText } from "./passages";

const brief = (p: { ordinal: number; speaker: string | null; timestamp: string | null; text: string }) =>
  `${p.ordinal}|${p.speaker ?? "-"}|${p.timestamp ?? "-"}|${p.text}`;

describe("segmentTranscript", () => {
  it("keeps speaker and timestamp from labelled turns and strips them from the text", () => {
    const out = segmentTranscript(
      [
        "[00:01:10] Priya: The merchant dataset slipped again.",
        "[00:03:45] Marcus: We decided to freeze scope after the pilot instead of adding the export.",
        "Priya: Agreed.",
        "00:05 - Marcus: Let's revisit in Q4.",
      ].join("\n"),
    );
    expect(out.map(brief)).toEqual([
      "0|Priya|00:01:10|The merchant dataset slipped again.",
      "1|Marcus|00:03:45|We decided to freeze scope after the pilot instead of adding the export.",
      "2|Priya|-|Agreed.",
      "3|Marcus|00:05|Let's revisit in Q4.",
    ]);
  });

  it("appends continuation lines to the current turn, across many wrapped lines", () => {
    const wrapped = Array.from({ length: 10 }, (_, i) => `continuation line ${i + 1}`).join("\n");
    const out = segmentTranscript(
      ["Priya: first turn", wrapped, "Marcus: second turn", wrapped, "Priya: third", "Marcus: fourth"].join("\n"),
    );
    expect(out.map((p) => p.speaker)).toEqual(["Priya", "Marcus", "Priya", "Marcus"]);
    expect(out[0]!.text).toBe(`first turn\n${wrapped}`);
    expect(out[1]!.text.split("\n")).toHaveLength(11);
  });

  it("treats a bare timestamp line as the start of a turn and skips SRT numbering and cue lines", () => {
    const out = segmentTranscript(
      [
        "1",
        "00:00:01,000 --> 00:00:04,000",
        "[00:00:01] Welcome everyone.",
        "",
        "2",
        "00:00:05,000 --> 00:00:09,000",
        "[00:00:05]",
        "We agreed to switch vendors.",
        "It was not close.",
      ].join("\n"),
    );
    expect(out.map(brief)).toEqual([
      "0|-|00:00:01|Welcome everyone.",
      "1|-|00:00:05|We agreed to switch vendors.\nIt was not close.",
    ]);
  });

  it("falls back to paragraphs when there are no labels", () => {
    const out = segmentTranscript("First paragraph line one.\nline two.\n\nSecond paragraph.\n\n\n\nThird.");
    expect(out.map(brief)).toEqual([
      "0|-|-|First paragraph line one.\nline two.",
      "1|-|-|Second paragraph.",
      "2|-|-|Third.",
    ]);
  });

  it("falls back to paragraphs when the only labels are singleton pseudo-speakers", () => {
    const paragraphs = Array.from({ length: 10 }, (_, i) => `Paragraph ${i + 1} of the minutes with some content.`);
    const out = segmentTranscript(
      ["Attendees: Priya, Marcus", ...paragraphs, "Note: circulate by Friday"].join("\n\n"),
    );
    expect(out).toHaveLength(12);
    expect(out.every((p) => p.speaker === null)).toBe(true);
    expect(out[0]!.text).toBe("Attendees: Priya, Marcus");
  });

  it("splits one long unlabelled paragraph at sentence boundaries", () => {
    const sentence = "This sentence is exactly long enough to matter for the splitter. ";
    const out = segmentTranscript(sentence.repeat(40).trim());
    expect(out.length).toBeGreaterThan(1);
    expect(out.every((p) => p.text.length <= 1200)).toBe(true);
    expect(out.every((p) => p.text.endsWith("."))).toBe(true);
    expect(out.map((p) => p.ordinal)).toEqual(out.map((_, i) => i));
  });

  it("returns nothing for empty text and never keeps empty turns", () => {
    expect(segmentTranscript("")).toEqual([]);
    expect(segmentTranscript("  \n\n \r\n")).toEqual([]);
    expect(segmentTranscript("Priya:\nMarcus: hi\nPriya: yo").map(brief)).toEqual(["0|Marcus|-|hi", "1|Priya|-|yo"]);
  });

  it("does not mistake URLs or times in prose for labels", () => {
    const out = segmentTranscript(
      ["Priya: see https://example.com/notes for the 12:30 meeting", "Marcus: ok", "Priya: the ratio was 3:1"].join(
        "\n",
      ),
    );
    expect(out.map((p) => p.speaker)).toEqual(["Priya", "Marcus", "Priya"]);
    expect(out[0]!.text).toBe("see https://example.com/notes for the 12:30 meeting");
    const prose = segmentTranscript("12:30 meeting moved to Friday.\n\n12:45 room booked.");
    expect(prose.map((p) => p.timestamp)).toEqual([null, null]);
  });
});

describe("transcriptText", () => {
  it("joins passage texts with blank lines and no labels", () => {
    expect(transcriptText([{ text: "a" }, { text: "b\nc" }])).toBe("a\n\nb\nc");
  });
});
