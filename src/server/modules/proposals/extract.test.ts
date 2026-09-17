import { describe, expect, it } from "vitest";
import { heuristicExtract, sentencesOf } from "./extract";

const source = (text: string) => ({ kind: "evidence" as const, entityId: "e1", title: "Notes", text });
const ctx = { people: [], milestones: [], tasks: [], conversation: "" };

describe("heuristicExtract", () => {
  it("proposes one Decision per sentence with a decision verb, citing it verbatim", async () => {
    const text =
      "Attendees: Priya, Marcus.\n\nAfter the pilot we decided to switch from weekly surveys to fortnightly interviews because response rates fell to 4%. The vendor sandbox is still pending.";
    const { proposals } = await heuristicExtract({ sources: [source(text)], context: ctx });
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      title: "Switch from weekly surveys to fortnightly interviews because response rates fell to 4%",
      sources: [
        {
          kind: "evidence",
          entityId: "e1",
          excerpt:
            "After the pilot we decided to switch from weekly surveys to fortnightly interviews because response rates fell to 4%.",
        },
      ],
    });
  });

  it("extracts the rejected option after 'instead of' and returns nothing for plain prose", async () => {
    const { proposals } = await heuristicExtract({
      sources: [source("We agreed to run interviews instead of a second survey round. Lunch was late.")],
      context: ctx,
    });
    expect(proposals).toHaveLength(1);
    expect(proposals[0]!.alternatives).toBe("a second survey round");
    expect(
      (await heuristicExtract({ sources: [source("Status is green. Nothing new.")], context: ctx })).proposals,
    ).toEqual([]);
  });

  it("splits sentences on punctuation and blank lines and drops fragments", () => {
    expect(sentencesOf("Short.\n\nA second sentence here! Third one? tiny")).toEqual([
      "A second sentence here!",
      "Third one?",
    ]);
  });
});
