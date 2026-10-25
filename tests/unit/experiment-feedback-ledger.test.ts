import { describe, expect, it } from "vitest";
import { buildFeedbackLedger, type SavedCreatorMessage } from "@/lib/experiment-runner/feedback-ledger";

const message = (sequence: number, content: unknown): SavedCreatorMessage => ({
  id: `decision-${sequence}`, sequence, content, createdAtMs: 1000 + sequence,
});

describe("deterministic creator feedback ledger", () => {
  it("retains every saved decision in order with exact IDs, Unicode, quotes, newlines, and creative instructions", () => {
    const answer = 'Use “bright stars” and \"soft light\".\nKeep the child’s words.';
    const instruction = 'Keep “Mina’s” exact line.\nChange only the moon’s color.';
    const saved = [
      message(1, { type: "tester_decision", decision: { action: "approve", versionIds: ["v-1", "v-2"] }, operationId: "large".repeat(1000) }),
      message(2, { type: "tester_decision", decision: { action: "delegate", taskIds: ["J01", "J12"], subjectId: "book-1" }, operationId: "large".repeat(1000) }),
      message(3, { type: "tester_decision", decision: { action: "revoke_delegation", delegationId: "grant-1" }, operationId: "large".repeat(1000) }),
      message(4, { type: "tester_decision", decision: { action: "answer", questionId: "q-1", text: answer }, operationId: "large".repeat(1000) }),
      message(5, { type: "tester_decision", decision: { action: "answer", questionId: "q-2", text: "Another answer." }, operationId: "large".repeat(1000) }),
      message(6, { type: "tester_decision", decision: { action: "revise", taskId: "J12", artifactVersionId: "v-2", instruction }, operationId: "large".repeat(1000) }),
      message(7, { type: "tester_decision", decision: { action: "approve", versionIds: ["v-3"] }, operationId: "large".repeat(1000) }),
    ];
    const before = structuredClone(saved);
    const ledger = buildFeedbackLedger(saved);
    expect(ledger).toEqual(saved.map((row, index) => ({ id: row.id, sequence: row.sequence,
      createdAtMs: row.createdAtMs, content: { decision: [
        { action: "approve", versionIds: ["v-1", "v-2"] },
        { action: "delegate", taskIds: ["J01", "J12"], subjectId: "book-1" },
        { action: "revoke_delegation", delegationId: "grant-1" },
        { action: "answer", questionId: "q-1", text: answer },
        { action: "answer", questionId: "q-2", text: "Another answer." },
        { action: "revise", taskId: "J12", artifactVersionId: "v-2", instruction },
        { action: "approve", versionIds: ["v-3"] },
      ][index] } })));
    expect(JSON.stringify(ledger)).not.toContain("large");
    expect(saved).toEqual(before);
    expect(buildFeedbackLedger(saved)).toEqual(ledger);
    expect(ledger[0].content).not.toBe(saved[0].content);
  });

  it("preserves unknown and unscoped content verbatim without inferring supersession", () => {
    const unknown = { type: "tester_decision", decision: { action: "comment", prose: "Keep this exact note.\nAgain." }, metadata: { future: true } };
    const unscoped = { type: "creator_note", prose: "A different saved message." };
    const malformed = { type: "tester_decision", decision: { action: "answer", questionId: "q-3", text: null, prose: "Do not drop" } };
    const extraProse = { type: "tester_decision", decision: { action: "approve", versionIds: ["v-4"] }, prose: "Also keep the night sky." };
    const futureDecision = { type: "tester_decision", decision: { action: "revise", taskId: "J12", artifactVersionId: "v-4", instruction: "Keep stars", futureInstruction: "Moon" } };
    const saved = [message(1, unknown), message(2, unscoped), message(3, malformed), message(4, null), message(5, extraProse), message(6, futureDecision)];
    const ledger = buildFeedbackLedger(saved);
    expect(ledger.map(row => row.content)).toEqual([unknown, unscoped, malformed, null, extraProse, futureDecision]);
    expect(ledger.map(row => row.sequence)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(saved[0].content).toBe(unknown);
  });
});
