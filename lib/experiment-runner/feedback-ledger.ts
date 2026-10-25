// Model-facing history keeps saved decision order and exact creative instructions.
// Unknown message shapes stay intact so a new decision type is never silently lost.
export type SavedCreatorMessage = { id: string; sequence: number; content: unknown; createdAtMs: number };

const fields = {
  approve: ["versionIds"],
  delegate: ["taskIds", "subjectId"],
  revoke_delegation: ["delegationId"],
  answer: ["questionId", "text"],
  revise: ["taskId", "artifactVersionId", "instruction"],
} as const;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function decisionContent(content: unknown): unknown {
  if (!record(content) || content.type !== "tester_decision" || !record(content.decision)) return content;
  if (Object.keys(content).some(key => !["type", "decision", "operationId", "workflowRunId", "runId"].includes(key))) return content;
  const decision = content.decision;
  const action = decision.action;
  if (typeof action !== "string" || !Object.hasOwn(fields, action)) return content;
  const selected = fields[action as keyof typeof fields];
  if (Object.keys(decision).some(key => key !== "action" && !(selected as readonly string[]).includes(key))) return content;
  if (selected.some(field => !Object.hasOwn(decision, field))) return content;
  if (selected.some(field => field === "versionIds" || field === "taskIds"
    ? !Array.isArray(decision[field]) || !decision[field].every(value => typeof value === "string")
    : typeof decision[field] !== "string")) return content;
  return { decision: Object.fromEntries([["action", action], ...selected.map(field => [field,
    Array.isArray(decision[field]) ? [...decision[field]] : decision[field]])]) };
}

export function buildFeedbackLedger(messages: readonly SavedCreatorMessage[]): SavedCreatorMessage[] {
  return messages.map(message => ({ id: message.id, sequence: message.sequence,
    content: decisionContent(message.content), createdAtMs: message.createdAtMs }));
}
