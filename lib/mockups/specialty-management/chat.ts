import type {
  Agent,
  AgentEditingTarget,
  AgentVersion,
  ChatProposal,
  ConfigurationBase,
  ConfigurationPatch,
  EditingBase,
  EditingPatch,
  EditingTarget,
  ErrorDetails,
  InstructionsBase,
  ManagementUIMessage,
  ModelSelection,
  MockupState,
  ProposalTarget,
  ReferenceBase,
  ReferencePatch,
  Specialty,
  SpecialtyBase,
  SpecialtyPatch,
} from "./types";

const chatMessage = (
  id: string,
  role: "user" | "assistant",
  text: string,
  target: EditingTarget | null,
  state: "complete" | "cancelled" | "interrupted" | "error" = "complete",
): ManagementUIMessage => ({
  id,
  role,
  text,
  target: target?.kind === "agent" ? target : null,
  metadata: { target, createdAt: new Date().toISOString(), state },
  parts: [{ type: "text" as const, text, state: "done" as const }],
});

export type SimulatedReply =
  | { kind: "proposal"; proposal: ChatProposal; text: string }
  | { kind: "clarification"; question: string; choices: string[]; text: string }
  | { kind: "answer" | "unsupported"; text: string };

export const targetKey = (target: EditingTarget) =>
  target.kind === "specialty"
    ? `specialty:${target.specialtyId}`
    : `agent:${target.agentId}:${target.versionId}:${target.section}`;

const sameModel = (left: ModelSelection | null, right: ModelSelection | null) =>
  left?.provider === right?.provider && left?.model === right?.model;

const normalizedTools = (ids: string[]) => [...new Set(ids)].sort();
const sameTools = (left: string[], right: string[]) =>
  JSON.stringify(normalizedTools(left)) === JSON.stringify(normalizedTools(right));

export type ResolvedTarget = {
  target: EditingTarget;
  specialty: Specialty;
  agent?: Agent;
  savedVersion?: AgentVersion;
  version?: AgentVersion;
  reference?: AgentVersion["references"][number];
};

export function resolveTarget(
  state: MockupState,
  target: EditingTarget,
): ResolvedTarget | null {
  const savedSpecialty = state.specialties.find(
    (specialty) => specialty.id === target.specialtyId,
  );
  if (!savedSpecialty) return null;
  const specialty = state.workingCopies.specialties[savedSpecialty.id] ?? savedSpecialty;
  if (target.kind === "specialty") return { target, specialty };

  const agent = state.agents.find((item) => item.id === target.agentId);
  const savedVersion = agent?.versions.find((item) => item.id === target.versionId);
  if (!agent || !savedVersion || agent.specialtyId !== target.specialtyId) return null;
  const version = state.workingCopies.versions[savedVersion.id] ?? savedVersion;
  const reference = target.section.startsWith("reference:")
    ? version.references.find((item) => item.id === target.section.slice(10))
    : undefined;
  if (target.section.startsWith("reference:") && !reference) return null;
  return { target, specialty, agent, savedVersion, version, reference };
}

/** Compatibility helper for old target-only callers. */
export function getTarget(state: MockupState, target: ProposalTarget) {
  const found = resolveTarget(state, target);
  if (!found || target.kind !== "agent" || !found.agent || !found.savedVersion || !found.version)
    return null;
  const text =
    target.section === "instructions"
      ? found.version.mainInstructions
      : found.reference?.content;
  return text === undefined
    ? null
    : { agent: found.agent, saved: found.savedVersion, version: found.version, text };
}

export function selectedTarget(state: MockupState): EditingTarget | null {
  const selection = state.ui.selection;
  if (selection.kind === "specialty")
    return { kind: "specialty", specialtyId: selection.specialtyId, section: "settings" };
  if (
    selection.kind === "directory" ||
    selection.kind === "test-history" ||
    selection.section === "test"
  )
    return null;
  return {
    kind: "agent",
    specialtyId: selection.specialtyId,
    agentId: selection.agentId,
    versionId: selection.versionId,
    section: selection.section,
  };
}

export function captureBase(
  state: MockupState,
  target: EditingTarget,
): EditingBase | null {
  const found = resolveTarget(state, target);
  if (!found) return null;
  if (target.kind === "specialty")
    return {
      kind: "specialty",
      name: found.specialty.name,
      description: found.specialty.description,
      outputType: found.specialty.outputType,
      allowedToolIds: normalizedTools(found.specialty.allowedToolIds),
      builtIn: found.specialty.builtIn,
    } satisfies SpecialtyBase;
  if (target.section === "configuration")
    return {
      kind: "configuration",
      title: found.version!.title,
      languageModel: structuredClone(found.version!.languageModel),
      imageModel:
        found.specialty.outputType === "image"
          ? structuredClone(found.version!.imageModel)
          : null,
      outputType: found.specialty.outputType,
      builtIn: found.specialty.builtIn,
    } satisfies ConfigurationBase;
  if (target.section === "instructions")
    return {
      kind: "instructions",
      mainInstructions: found.version!.mainInstructions,
    } satisfies InstructionsBase;
  return {
    kind: "reference",
    id: found.reference!.id,
    name: found.reference!.name,
    description: found.reference!.description,
    content: found.reference!.content,
  } satisfies ReferenceBase;
}

export function baseMatches(
  state: MockupState,
  target: EditingTarget,
  expected: EditingBase,
) {
  const current = captureBase(state, target);
  if (!current || current.kind !== expected.kind) return false;
  switch (current.kind) {
    case "specialty":
      if (expected.kind !== "specialty") return false;
      return (
        current.name === expected.name &&
        current.description === expected.description &&
        current.outputType === expected.outputType &&
        current.builtIn === expected.builtIn &&
        sameTools(current.allowedToolIds, expected.allowedToolIds)
      );
    case "configuration":
      if (expected.kind !== "configuration") return false;
      return (
        current.title === expected.title &&
        current.outputType === expected.outputType &&
        current.builtIn === expected.builtIn &&
        sameModel(current.languageModel, expected.languageModel) &&
        sameModel(current.imageModel, expected.imageModel)
      );
    case "instructions":
      if (expected.kind !== "instructions") return false;
      return current.mainInstructions === expected.mainInstructions;
    case "reference":
      if (expected.kind !== "reference") return false;
      return (
        current.id === expected.id &&
        current.name === expected.name &&
        current.description === expected.description &&
        current.content === expected.content
      );
  }
}

function hasModel(
  state: MockupState,
  selection: ModelSelection,
  kind: "language" | "image",
) {
  return state.models.some(
    (model) =>
      model.kind === kind &&
      model.provider === selection.provider &&
      model.label === selection.model,
  );
}

function validPatch(
  state: MockupState,
  found: ResolvedTarget,
  base: EditingBase,
  patch: EditingPatch,
) {
  if (base.kind === "specialty") {
    const next = patch as SpecialtyPatch;
    if (found.specialty.builtIn && (next.name !== undefined || next.outputType !== undefined))
      return false;
    if (next.name !== undefined && !next.name.trim()) return false;
    return (
      next.allowedToolIds === undefined ||
      next.allowedToolIds.every((id) => state.tools.some((tool) => tool.id === id))
    );
  }
  if (base.kind === "configuration") {
    const next = patch as ConfigurationPatch;
    if (next.title !== undefined && !next.title.trim()) return false;
    if (next.languageModel && !hasModel(state, next.languageModel, "language")) return false;
    return (
      next.imageModel === undefined ||
      (found.specialty.outputType === "image" &&
        next.imageModel !== null &&
        hasModel(state, next.imageModel, "image"))
    );
  }
  if (base.kind === "instructions") return typeof (patch as InstructionsBase).mainInstructions === "string";
  const next = patch as ReferencePatch;
  return next.name === undefined || !!next.name.trim();
}

function writePatch(target: EditingTarget, base: EditingBase, patch: EditingPatch, found: ResolvedTarget) {
  if (base.kind === "specialty") {
    Object.assign(found.specialty, patch as SpecialtyPatch);
    if ((patch as SpecialtyPatch).allowedToolIds)
      found.specialty.allowedToolIds = normalizedTools((patch as SpecialtyPatch).allowedToolIds!);
    return;
  }
  if (base.kind === "configuration") {
    Object.assign(found.version!, patch as ConfigurationPatch);
    return;
  }
  if (base.kind === "instructions") {
    found.version!.mainInstructions = (patch as InstructionsBase).mainInstructions;
    return;
  }
  Object.assign(found.reference!, patch as ReferencePatch);
}

export type ApplyProposalResult =
  | "applied"
  | "unavailable"
  | "stale"
  | "invalid"
  | "not-latest";

/** Applies every field of a patch or none of them. Call only on a mutable state copy. */
export function applyProposal(
  state: MockupState,
  proposalId: string,
  createId: (prefix: string) => string,
): ApplyProposalResult {
  const proposal = state.chat.proposals.find((item) => item.id === proposalId);
  if (!proposal || proposal.status !== "pending") return "not-latest";
  const later = state.chat.proposals.some(
    (item) =>
      item.id !== proposal.id &&
      item.status === "pending" &&
      item.createdAt > proposal.createdAt &&
      targetKey(item.target) === targetKey(proposal.target),
  );
  if (later) return "not-latest";
  const found = resolveTarget(state, proposal.target);
  if (!found) {
    proposal.status = "unavailable";
    return "unavailable";
  }
  if (!baseMatches(state, proposal.target, proposal.base)) return "stale";
  if (!validPatch(state, found, proposal.base, proposal.patch)) return "invalid";

  if (proposal.target.kind === "specialty") {
    const working = structuredClone(found.specialty);
    writePatch(proposal.target, proposal.base, proposal.patch, {
      ...found,
      specialty: working,
    });
    state.workingCopies.specialties[working.id] = working;
  } else if (found.savedVersion!.status === "draft") {
    const working = structuredClone(found.version!);
    writePatch(proposal.target, proposal.base, proposal.patch, { ...found, version: working });
    state.workingCopies.versions[working.id] = working;
  } else {
    const copy = structuredClone(found.version!);
    copy.id = createId("version");
    copy.number = Math.max(...found.agent!.versions.map((version) => version.number)) + 1;
    copy.parentVersionId = found.savedVersion!.id;
    copy.status = "draft";
    copy.versionNote = "";
    const target: AgentEditingTarget = { ...proposal.target, versionId: copy.id };
    writePatch(target, proposal.base, proposal.patch, { ...found, version: copy });
    found.agent!.versions.push(copy);
    state.ui.recentVersionIds[found.agent!.id] = copy.id;
    state.ui.selection = {
      kind: "agent",
      specialtyId: found.agent!.specialtyId,
      agentId: found.agent!.id,
      versionId: copy.id,
      section: target.section,
    };
  }
  proposal.status = "applied";
  return "applied";
}

export function registerProposal(state: MockupState, proposal: ChatProposal) {
  const found = resolveTarget(state, proposal.target);
  if (!found) proposal.status = "unavailable";
  if (proposal.status === "pending") {
    state.chat.proposals.forEach((item) => {
      if (item.status === "pending" && targetKey(item.target) === targetKey(proposal.target))
        item.status = "superseded";
    });
  }
  state.chat.proposals.push(proposal);
}

export function beginResponse(
  state: MockupState,
  target: EditingTarget,
  request: string,
  createId: (prefix: string) => string,
) {
  if (state.chat.pendingResponse || !request.trim()) return null;
  const base = captureBase(state, target);
  if (!base) return null;
  state.chat.messages.push(chatMessage(createId("message"), "user", request.trim(), target));
  const pending = {
    id: createId("response"),
    target,
    request: request.trim(),
    base,
    startedAt: new Date().toISOString(),
    stage: "Reading selected section" as const,
  };
  state.chat.pendingResponse = pending;
  state.chat.composerText = "";
  return pending;
}

export function completeResponse(
  state: MockupState,
  createId: (prefix: string) => string,
) {
  const pending = state.chat.pendingResponse;
  if (!pending) return null;
  const reply = simulateReply(state, pending.target, pending.request, createId("proposal"));
  const message = chatMessage(createId("message"), "assistant", reply.text, pending.target);
  if (reply.kind === "proposal") {
    registerProposal(state, reply.proposal);
    message.parts.push({ type: "data-proposal", data: { proposalId: reply.proposal.id } });
  } else if (reply.kind === "clarification") {
    const clarification = {
      id: createId("clarification"),
      question: reply.question,
      choices: reply.choices,
      target: pending.target,
      request: pending.request,
    };
    state.chat.pendingClarification = clarification;
    message.parts.push({ type: "data-clarification", data: clarification });
  }
  state.chat.messages.push(message);
  state.chat.pendingResponse = null;
  return reply;
}

export function cancelResponse(state: MockupState, createId: (prefix: string) => string) {
  const pending = state.chat.pendingResponse;
  if (!pending) return false;
  const message = chatMessage(
    createId("message"),
    "assistant",
    "The simulated response was stopped before it created a proposal.",
    pending.target,
    "cancelled",
  );
  message.retryRequest = pending.request;
  const stoppedAt = new Date().toISOString();
  const details: ErrorDetails = {
    request: pending.request,
    target: pending.target,
    capturedBase: pending.base,
    stages: [pending.stage],
    timestamps: { startedAt: pending.startedAt, failedAt: stoppedAt },
    systemError: "The user stopped the local simulated stream.",
    responder: "Synthetic simulator",
  };
  message.parts.push({ type: "data-error-details", data: details });
  state.chat.messages.push(message);
  state.chat.pendingResponse = null;
  return true;
}

export function canApplyProposal(state: MockupState, proposal: ChatProposal) {
  const selected = selectedTarget(state);
  return (
    proposal.status === "pending" &&
    !!selected &&
    targetKey(selected) === targetKey(proposal.target) &&
    baseMatches(state, proposal.target, proposal.base) &&
    !state.chat.proposals.some(
      (item) =>
        item.id !== proposal.id &&
        item.status === "pending" &&
        item.createdAt > proposal.createdAt &&
        targetKey(item.target) === targetKey(proposal.target),
    )
  );
}

const requestIsQuestion = (request: string) =>
  /^(what|why|how|can)\b/i.test(request.trim());
const requestNeedsClarification = (request: string) =>
  /\b(improve|fix|better)\b/i.test(request) &&
  !/\b(concise|shorter|checklist|numbered|example|title|model|tool|output|name|description)\b/i.test(request);

function priorProposalText(state: MockupState, target: EditingTarget) {
  const previous = [...state.chat.proposals]
    .reverse()
    .find((proposal) => proposal.status === "pending" && targetKey(proposal.target) === targetKey(target));
  if (!previous || !baseMatches(state, target, previous.base)) return null;
  if (previous.base.kind === "instructions" && previous.patch && "mainInstructions" in previous.patch)
    return previous.patch.mainInstructions;
  if (previous.base.kind === "reference" && previous.patch && "content" in previous.patch)
    return previous.patch.content;
  return null;
}

/** Builds a deterministic local reply. It is deliberately free of model and network calls. */
export function simulateReply(
  state: MockupState,
  target: EditingTarget,
  request: string,
  id: string,
  createdAt = new Date().toISOString(),
): SimulatedReply {
  const base = captureBase(state, target);
  if (!base) return { kind: "unsupported", text: "That editing target is no longer available." };
  if (requestIsQuestion(request))
    return {
      kind: "answer",
      text: "This is a deterministic simulation. It can propose a focused edit to the selected section, but it does not evaluate or run an agent.",
    };
  if (requestNeedsClarification(request))
    return {
      kind: "clarification",
      text: "Which change should I prepare?",
      question: "Choose the kind of edit you want for this section.",
      choices: ["Make it concise", "Use a numbered checklist", "Add an example"],
    };

  let patch: EditingPatch;
  let proposedText: string | undefined;
  if (base.kind === "instructions") {
    proposedText = simulateSuggestion(priorProposalText(state, target) ?? base.mainInstructions, request);
    patch = { mainInstructions: proposedText };
  } else if (base.kind === "reference") {
    proposedText = simulateSuggestion(priorProposalText(state, target) ?? base.content, request);
    patch = { content: proposedText };
  } else if (base.kind === "configuration") {
    const title = request.match(/\btitle\s+(?:to\s+)?["“]?(.+?)["”]?$/i)?.[1]?.trim();
    if (title) patch = { title };
    else {
      const model = state.models.find(
        (item) => item.kind === "language" && request.toLowerCase().includes(item.label.toLowerCase()),
      );
      if (!model)
        return {
          kind: "clarification",
          text: "Choose a configuration change to prepare.",
          question: "Do you want to change the title or select a language model?",
          choices: ["Change the title", "Use Story", "Use Quick"],
        };
      patch = { languageModel: { provider: model.provider, model: model.label } };
    }
  } else {
    const lower = request.toLowerCase();
    if (lower.includes("description")) patch = { description: `${base.description} ${request}`.trim() };
    else if (lower.includes("image") && !base.builtIn) patch = { outputType: "image" };
    else if (lower.includes("text") && !base.builtIn) patch = { outputType: "text" };
    else if (lower.includes("name")) {
      const name = request.match(/\bname\s+(?:to\s+)?["“]?(.+?)["”]?$/i)?.[1]?.trim();
      if (!name) return { kind: "clarification", text: "What specialty name should I use?", question: "Provide the specialty name.", choices: ["Story planner", "Illustration helper"] };
      patch = { name };
    } else {
      return {
        kind: "clarification",
        text: "Choose a specialty setting to edit.",
        question: "Which setting should I change?",
        choices: ["Update the description", "Use Text output", "Use Image output"],
      };
    }
  }
  const proposal: ChatProposal = {
    id,
    target,
    request,
    base,
    patch,
    status: "pending",
    createdAt,
    proposedText,
    baseText:
      base.kind === "instructions"
        ? base.mainInstructions
        : base.kind === "reference"
          ? base.content
          : undefined,
  };
  return { kind: "proposal", proposal, text: "I prepared a simulated proposal. Review it before applying the change." };
}

export function simulateSuggestion(text: string, request: string) {
  const lower = request.toLowerCase();
  if (lower.includes("concise") || lower.includes("shorter")) {
    let keptParagraph = false;
    return text
      .split("\n")
      .filter((line) => {
        const trim = line.trim();
        if (!trim) return false;
        if (trim.startsWith("#") || /\[[^\]]+\]\((specialty|tool|reference):/.test(line)) return true;
        if (!keptParagraph) {
          keptParagraph = true;
          return true;
        }
        return false;
      })
      .join("\n\n");
  }
  if (lower.includes("checklist") || lower.includes("numbered")) {
    let number = 0;
    let fenced = false;
    return text
      .split("\n")
      .map((line) => {
        if (line.trim().startsWith("```")) {
          fenced = !fenced;
          return line;
        }
        if (fenced || !line.trim() || line.trim().startsWith("#")) return line;
        number += 1;
        return `${number}. ${line.replace(/^\s*(?:[-*]|\d+\.)\s*/, "")}`;
      })
      .join("\n");
  }
  if (lower.includes("example"))
    return `${text.trimEnd()}\n\n## Example\nFor example, describe one clear choice and the reason for it.`;
  return `${text.trimEnd()}\n\n## Requested guidance\n${request}`;
}

/** Compatibility helper; canonical callers should use `applyProposal`. */
export function writeTarget(version: AgentVersion, target: AgentEditingTarget, text: string) {
  if (target.section === "instructions") version.mainInstructions = text;
  else if (target.section.startsWith("reference:")) {
    const reference = version.references.find((item) => item.id === target.section.slice(10));
    if (reference) reference.content = text;
  }
}
