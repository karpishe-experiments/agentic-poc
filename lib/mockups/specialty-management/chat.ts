import type { AgentVersion, MockupState, ProposalTarget } from "./types";

export const targetKey = (target: ProposalTarget) => `${target.agentId}:${target.versionId}:${target.section}`;

export function getTarget(state: MockupState, target: ProposalTarget) {
  const agent = state.agents.find((item) => item.id === target.agentId);
  const saved = agent?.versions.find((item) => item.id === target.versionId);
  if (!agent || !saved) return null;
  const version = state.workingCopies.versions[saved.id] ?? saved;
  if (target.section === "instructions") return { agent, saved, version, text: version.mainInstructions };
  const id = target.section.slice(10);
  const reference = version.references.find((item) => item.id === id);
  return reference ? { agent, saved, version, text: reference.content } : null;
}

export function selectedTarget(state: MockupState): ProposalTarget | null {
  const selection = state.ui.selection;
  if (selection.kind !== "agent" || (selection.section !== "instructions" && !selection.section.startsWith("reference:"))) return null;
  return { agentId: selection.agentId, versionId: selection.versionId, section: selection.section as ProposalTarget["section"] };
}

export function simulateSuggestion(text: string, request: string) {
  const lower = request.toLowerCase();
  if (lower.includes("concise")) {
    let keptParagraph = false;
    return text.split("\n").filter((line) => { const trim = line.trim(); if (!trim) return false; if (trim.startsWith("#") || /\[[^\]]+\]\((specialty|tool|reference):/.test(line)) return true; if (!keptParagraph) { keptParagraph = true; return true; } return false; }).join("\n\n");
  }
  if (lower.includes("checklist") || lower.includes("numbered")) {
    let number = 0; let fenced = false;
    return text.split("\n").map((line) => { if (line.trim().startsWith("```")) { fenced = !fenced; return line; } if (fenced || !line.trim() || line.trim().startsWith("#")) return line; number += 1; return `${number}. ${line.replace(/^\s*(?:[-*]|\d+\.)\s*/, "")}`; }).join("\n");
  }
  if (lower.includes("example")) return `${text.trimEnd()}\n\n## Example\nFor example, describe one clear choice and the reason for it.`;
  return `${text.trimEnd()}\n\n## Requested guidance\n${request}`;
}

export function writeTarget(version: AgentVersion, target: ProposalTarget, text: string) {
  if (target.section === "instructions") version.mainInstructions = text;
  else { const reference = version.references.find((item) => item.id === target.section.slice(10)); if (reference) reference.content = text; }
}
