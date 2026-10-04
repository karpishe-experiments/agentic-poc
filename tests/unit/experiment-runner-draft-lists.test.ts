import { describe, expect, it } from "vitest";
import {
  MAX_DRAFT_LIST_CONTENT_BYTES, parseDraftListProposal,
} from "@/lib/contracts/experiment-runner";

const characters = {
  schemaVersion: "2", title: "Kite rescue",
  characters: [
    { entryKey: "character_1", nameOrRole: "Inventor", narrativeFunction: "Leads the rescue", role: "main", knownRelationship: "Robot's friend", knownFacts: ["Invents things"], openQuestions: [] },
    { entryKey: "character_2", nameOrRole: "Robot", narrativeFunction: "Helps find the kite", role: "supporting", knownRelationship: "Inventor's friend", knownFacts: [], openQuestions: ["How does it help?"] },
  ],
  castNotes: [], representationAndSafety: [], manuscriptQuestions: [], approvalQuestions: [],
};
const locations = {
  schemaVersion: "2", title: "Story places",
  locations: [
    { entryKey: "location_1", title: "Park", storyPurpose: "The kite flies away", knownFacts: ["Open public space"], likelyScenes: ["Kite launch"], openQuestions: [] },
    { entryKey: "location_2", title: "Workshop", storyPurpose: "Friends build a repair", knownFacts: [], likelyScenes: [], openQuestions: [] },
  ],
  worldAndSafetyNotes: [], manuscriptQuestions: [], approvalQuestions: [],
};

describe("J03/J04 draft list contracts", () => {
  it.each(["playful_kid", "enthusiast_parent", "professional_creator"] as const)("accepts fixed %s case counts", (persona) => {
    expect(parseDraftListProposal("J03", persona, characters).content.characters).toHaveLength(2);
    const expected = persona === "professional_creator" ? locations.locations : locations.locations.slice(0, 1);
    expect(parseDraftListProposal("J04", persona, { ...locations, locations: expected }).content.locations).toHaveLength(expected.length);
    expect(() => parseDraftListProposal("J04", persona, { ...locations, locations: persona === "professional_creator" ? expected.slice(0, 1) : locations.locations })).toThrow();
  });

  it("rejects duplicate keys, missing required fields and wrong character counts", () => {
    expect(() => parseDraftListProposal("J03", "playful_kid", { ...characters, characters: characters.characters.slice(0, 1) })).toThrow();
    expect(() => parseDraftListProposal("J03", "playful_kid", { ...characters, characters: [characters.characters[0], { ...characters.characters[1], entryKey: "character_1" }] })).toThrow();
    expect(() => parseDraftListProposal("J04", "professional_creator", { ...locations, locations: [locations.locations[0], { ...locations.locations[1], entryKey: "location_1" }] })).toThrow();
    expect(() => parseDraftListProposal("J03", "playful_kid", { ...characters, characters: [{ ...characters.characters[0], knownRelationship: undefined }, characters.characters[1]] })).toThrow();
    expect(() => parseDraftListProposal("J04", "playful_kid", { ...locations, locations: [{ ...locations.locations[0], storyPurpose: " " }] })).toThrow();
  });

  it("strips visual extras and accepts warning-bearing narrative text", () => {
    const proposal = parseDraftListProposal("J03", "playful_kid", {
      ...characters, title: "T".repeat(241), camera: "low angle",
      characters: [{ ...characters.characters[0], clothing: "red coat", knownFacts: ["word ".repeat(301)] }, characters.characters[1]],
    });
    expect(proposal.content).not.toHaveProperty("camera");
    expect(proposal.content.characters[0]).not.toHaveProperty("clothing");
    expect(proposal.warnings.map((warning) => warning.field)).toContain("title");
    expect(proposal.warnings.map((warning) => warning.field)).toContain("characters.0.knownFacts.0");
    const place = parseDraftListProposal("J04", "playful_kid", { ...locations, locations: [{ ...locations.locations[0], physicalFeatures: "blue walls" }] });
    expect(place.content.locations[0]).not.toHaveProperty("physicalFeatures");
  });

  it("enforces text, list and serialized size limits", () => {
    expect(MAX_DRAFT_LIST_CONTENT_BYTES).toBe(524_288);
    expect(() => parseDraftListProposal("J03", "playful_kid", { ...characters, title: "x".repeat(1_001) })).toThrow();
    expect(() => parseDraftListProposal("J03", "playful_kid", { ...characters, castNotes: Array(101).fill("a") })).toThrow();
    expect(() => parseDraftListProposal("J04", "playful_kid", { ...locations, locations: [{ ...locations.locations[0], knownFacts: ["x".repeat(16_001)] }] })).toThrow();
    expect(() => parseDraftListProposal("J03", "playful_kid", { ...characters, castNotes: Array(100).fill("🌟".repeat(2_000)) })).toThrow(/512 KiB/);
  });
});
