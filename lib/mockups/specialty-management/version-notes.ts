import type { Agent, AgentVersion } from "./types";

const sameModel = (
  left: AgentVersion["languageModel"] | AgentVersion["imageModel"],
  right: AgentVersion["languageModel"] | AgentVersion["imageModel"],
) => JSON.stringify(left) === JSON.stringify(right);

const sameReferences = (
  left: AgentVersion["references"],
  right: AgentVersion["references"],
) => JSON.stringify(left) === JSON.stringify(right);

export function suggestVersionNote(agent: Agent, version: AgentVersion) {
  if (!version.parentVersionId) return "Initial draft";
  const parent = agent.versions.find(
    (item) => item.id === version.parentVersionId,
  );
  if (!parent) return "Initial draft";
  const changed: string[] = [];
  if (
    !sameModel(version.languageModel, parent.languageModel) ||
    !sameModel(version.imageModel, parent.imageModel)
  )
    changed.push("models");
  if (version.mainInstructions !== parent.mainInstructions)
    changed.push("Main instructions");
  if (!sameReferences(version.references, parent.references))
    changed.push("references");
  if (!changed.length) return "No configuration or instruction changes.";
  const list =
    changed.length === 1
      ? changed[0]
      : changed.length === 2
        ? `${changed[0]} and ${changed[1]}`
        : `${changed.slice(0, -1).join(", ")}, and ${changed.at(-1)}`;
  return `Updated ${list}.`;
}
