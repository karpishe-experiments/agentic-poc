import { describe, expect, it } from "vitest";
import {
  applyProposal,
  baseMatches,
  captureBase,
  registerProposal,
  selectedTarget,
  simulateReply,
  simulateSuggestion,
} from "@/lib/mockups/specialty-management/chat";
import { ManagementLocalChatTransport } from "@/lib/mockups/specialty-management/local-chat-transport";
import { freshSeed } from "@/lib/mockups/specialty-management/state";

const id = (prefix: string) => `${prefix}-new`;
const selectedSeed = () => {
  const state = freshSeed();
  state.ui.selection = {
    kind: "agent",
    specialtyId: "sp-story",
    agentId: "agent-playful",
    versionId: "playful-v2",
    section: "instructions",
  };
  return state;
};

describe("simulated management chat", () => {
  it("applies deterministic text transforms including shorter", () => {
    expect(simulateSuggestion("# Rule\nFirst line\nSecond line", "make shorter")).toBe("# Rule\n\nFirst line");
    expect(simulateSuggestion("# Rule\nDo one\nDo two", "numbered checklist")).toContain("2. Do two");
    expect(simulateSuggestion("Rule", "add example")).toContain("## Example");
  });

  it("captures only the selected section and leaves unrelated edits valid", () => {
    const state = selectedSeed();
    const target = selectedTarget(state)!;
    const base = captureBase(state, target)!;
    state.workingCopies.specialties["sp-story"] = {
      ...state.specialties.find((specialty) => specialty.id === "sp-story")!,
      description: "Unrelated specialty edit",
    };
    expect(baseMatches(state, target, base)).toBe(true);
  });

  it("supersedes only completed proposals for the same target", () => {
    const state = selectedSeed();
    const target = selectedTarget(state)!;
    const first = simulateReply(state, target, "add an example", "proposal-1", "2026-01-01T00:00:00.000Z");
    const second = simulateReply(state, target, "make concise", "proposal-2", "2026-01-02T00:00:00.000Z");
    if (first.kind !== "proposal" || second.kind !== "proposal") throw new Error("Expected proposals");
    registerProposal(state, first.proposal);
    registerProposal(state, second.proposal);
    expect(state.chat.proposals.map((proposal) => proposal.status)).toEqual(["superseded", "pending"]);
  });

  it("creates a draft when applying a confirmed-version proposal", () => {
    const state = selectedSeed();
    state.agents.find((item) => item.id === "agent-playful")!.versions.find((item) => item.id === "playful-v1")!.versionNote = "Confirmed source note";
    state.ui.selection = {
      kind: "agent",
      specialtyId: "sp-story",
      agentId: "agent-playful",
      versionId: "playful-v1",
      section: "instructions",
    };
    const target = selectedTarget(state)!;
    const reply = simulateReply(state, target, "make concise", "proposal", "2026-01-01T00:00:00.000Z");
    if (reply.kind !== "proposal") throw new Error("Expected proposal");
    registerProposal(state, reply.proposal);
    expect(applyProposal(state, "proposal", id)).toBe("applied");
    const agent = state.agents.find((item) => item.id === "agent-playful")!;
    expect(agent.versions).toHaveLength(3);
    expect(agent.versions.at(-1)?.status).toBe("draft");
    expect(agent.versions.at(-1)?.versionNote).toBe("");
    expect(agent.versions.at(-1)?.mainInstructions).not.toBe(
      reply.proposal.base.kind === "instructions"
        ? reply.proposal.base.mainInstructions
        : "",
    );
  });

  it("rejects stale proposals without partial application", () => {
    const state = selectedSeed();
    const target = selectedTarget(state)!;
    const reply = simulateReply(state, target, "add an example", "proposal", "2026-01-01T00:00:00.000Z");
    if (reply.kind !== "proposal") throw new Error("Expected proposal");
    registerProposal(state, reply.proposal);
    const version = state.agents.find((agent) => agent.id === "agent-playful")!.versions.find((version) => version.id === "playful-v2")!;
    state.workingCopies.versions[version.id] = { ...version, mainInstructions: "Manual edit" };
    expect(applyProposal(state, "proposal", id)).toBe("stale");
    expect(state.workingCopies.versions[version.id]?.mainInstructions).toBe("Manual edit");
  });

  it("answers questions and asks for clarification without mutating proposals", () => {
    const state = selectedSeed();
    const target = selectedTarget(state)!;
    expect(simulateReply(state, target, "How will this be used?", "answer").kind).toBe("answer");
    expect(simulateReply(state, target, "Improve this", "clarify").kind).toBe("clarification");
    expect(state.chat.proposals).toHaveLength(0);
  });

  it("streams local typed cards without making a request", async () => {
    const transport = new ManagementLocalChatTransport({
      delayMs: 0,
      respond: () => ({ text: "Synthetic response" }),
    });
    const stream = await transport.sendMessages({
      trigger: "submit-message",
      chatId: "chat",
      messageId: undefined,
      messages: [
        {
          id: "message",
          role: "user",
          metadata: { target: null, createdAt: "2026-01-01T00:00:00.000Z" },
          parts: [{ type: "text", text: "Hello" }],
        },
      ],
      abortSignal: undefined,
    });
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    expect(chunks.map((chunk) => chunk.type)).toContain("data-working-status");
    expect(chunks.map((chunk) => chunk.type)).toContain("text-delta");
    expect(chunks.map((chunk) => chunk.type)).toContain("finish");
  });
});
