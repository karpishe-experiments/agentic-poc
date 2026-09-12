import seed from "./seed.json";
import { bookletFixtures } from "./booklets";
import { captureBase, selectedTarget } from "./chat";
import type {
  ChatProposal,
  EditingBase,
  EditingTarget,
  ManagementUIMessage,
  MockupAction,
  MockupState,
} from "./types";

export const STORAGE_KEY = "specialty-management-mockup:v1";
type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  !!value && typeof value === "object" && !Array.isArray(value);

const asTarget = (value: unknown, root?: UnknownRecord): EditingTarget | null => {
  if (!isRecord(value)) return null;
  if (value.kind === "specialty" && typeof value.specialtyId === "string")
    return { kind: "specialty", specialtyId: value.specialtyId, section: "settings" };
  if (
    typeof value.agentId === "string" &&
    typeof value.versionId === "string" &&
    typeof value.section === "string"
  ) {
    let specialtyId = typeof value.specialtyId === "string" ? value.specialtyId : null;
    if (!specialtyId && Array.isArray(root?.agents)) {
      const agent = root.agents.find(
        (item) => isRecord(item) && item.id === value.agentId,
      );
      if (isRecord(agent) && typeof agent.specialtyId === "string")
        specialtyId = agent.specialtyId;
    }
    if (!specialtyId) return null;
    return {
      kind: "agent",
      specialtyId,
      agentId: value.agentId,
      versionId: value.versionId,
      section: value.section as import("./types").AgentEditingTarget["section"],
    } as EditingTarget;
  }
  return null;
};

const textMessage = (
  id: string,
  role: "user" | "assistant",
  text: string,
  target: EditingTarget | null,
  state: "complete" | "cancelled" | "interrupted" | "error" = "complete",
): ManagementUIMessage => ({
  id,
  role,
  metadata: { target, createdAt: new Date(0).toISOString(), state },
  parts: [{ type: "text", text, state: "done" }],
  text,
  target: target?.kind === "agent" ? target : null,
});

function legacyBase(target: EditingTarget, text: string): EditingBase {
  if (target.kind === "specialty")
    return { kind: "specialty", name: "", description: "", outputType: "text", allowedToolIds: [], builtIn: false };
  if (target.section === "configuration")
    return {
      kind: "configuration",
      title: "",
      languageModel: { provider: "", model: "" },
      imageModel: null,
      outputType: "text",
      builtIn: false,
    };
  if (target.section === "instructions") return { kind: "instructions", mainInstructions: text };
  return { kind: "reference", id: target.section.slice(10), name: "", description: "", content: text };
}

function migrateV1(value: UnknownRecord, includeSeedFailure: boolean): MockupState {
  const legacyChat = isRecord(value.chat) ? value.chat : {};
  const legacyMessages = Array.isArray(legacyChat.messages) ? legacyChat.messages : [];
  const messages = legacyMessages.flatMap((item, index) => {
    if (!isRecord(item) || (item.role !== "user" && item.role !== "assistant")) return [];
    const text = typeof item.text === "string" ? item.text : "";
    const target = asTarget(item.target, value);
    const message = textMessage(
      typeof item.id === "string" ? item.id : `migrated-message-${index}`,
      item.role,
      text,
      target,
      typeof item.retryRequest === "string" ? "interrupted" : "complete",
    );
    if (typeof item.retryRequest === "string")
      message.parts.push({ type: "data-error-details", data: interruptedDetails(item.retryRequest, target, null) });
    return [message];
  });
  const legacyProposals = Array.isArray(legacyChat.proposals) ? legacyChat.proposals : [];
  const proposals: ChatProposal[] = legacyProposals.flatMap((item, index) => {
    if (!isRecord(item)) return [];
    const target = asTarget(item.target, value);
    if (!target) return [];
    const baseText = typeof item.baseText === "string" ? item.baseText : "";
    const proposedText = typeof item.proposedText === "string" ? item.proposedText : baseText;
    const base = legacyBase(target, baseText);
    const patch =
      base.kind === "instructions"
        ? { mainInstructions: proposedText }
        : base.kind === "reference"
          ? { content: proposedText }
          : {};
    return [{
      id: typeof item.id === "string" ? item.id : `migrated-proposal-${index}`,
      target,
      request: typeof item.request === "string" ? item.request : "Migrated proposal",
      base,
      patch,
      status: isProposalStatus(item.status) ? item.status : "unavailable",
      createdAt: new Date(index).toISOString(),
      baseText,
      proposedText,
    }];
  });
  const state = {
    ...structuredClone(value),
    formatVersion: 2,
    ui: { ...(isRecord(value.ui) ? value.ui : {}), recentVersionIds: isRecord(value.ui) && isRecord(value.ui.recentVersionIds) ? value.ui.recentVersionIds : {} },
    chat: { messages, proposals, pendingResponse: null, composerText: "", pendingClarification: null },
  } as UnknownRecord;
  const migrated = migrateV2(state, includeSeedFailure);
  proposals.forEach((proposal, index) => {
    const message = textMessage(
      `migrated-proposal-message-${index}`,
      "assistant",
      "Migrated simulated proposal.",
      proposal.target,
    );
    message.parts.push({ type: "data-proposal", data: { proposalId: proposal.id } });
    migrated.chat.messages.push(message);
  });
  if (isRecord(legacyChat.pendingResponse)) {
    const pendingTarget = asTarget(legacyChat.pendingResponse.target, value);
    const request =
      typeof legacyChat.pendingResponse.request === "string"
        ? legacyChat.pendingResponse.request
        : "Migrated interrupted request";
    const baseText =
      typeof legacyChat.pendingResponse.baseText === "string"
        ? legacyChat.pendingResponse.baseText
        : "";
    if (pendingTarget) {
      const interrupted = textMessage(
        "migrated-interrupted-response",
        "assistant",
        "The simulated response was interrupted during refresh.",
        pendingTarget,
        "interrupted",
      );
      interrupted.retryRequest = request;
      interrupted.parts.push({
        type: "data-error-details",
        data: interruptedDetails(request, pendingTarget, legacyBase(pendingTarget, baseText)),
      });
      migrated.chat.messages.push(interrupted);
    }
  }
  return migrated;
}

function defaultTestSetup() {
  return {
    bookletId: "demo-forest",
    stageId: "story_plan" as const,
    openingRequest: "Produce a sample result",
    sourceSessionId: null,
  };
}

function migrateV2(value: UnknownRecord, includeSeedFailure = false): MockupState {
  const ui = isRecord(value.ui) ? value.ui : {};
  const state = {
    ...structuredClone(value),
    formatVersion: 3,
    ui: {
      ...ui,
      recentVersionIds: isRecord(ui.recentVersionIds) ? ui.recentVersionIds : {},
      testSetup: isRecord(ui.testSetup) ? ui.testSetup : defaultTestSetup(),
    },
    booklets: bookletFixtures(),
    testSessions: [],
    pendingTestResponse: null,
  } as unknown as MockupState;
  return normalize(state, includeSeedFailure);
}

const isProposalStatus = (value: unknown): value is ChatProposal["status"] =>
  value === "pending" || value === "applied" || value === "dismissed" || value === "superseded" || value === "unavailable";

export function interruptedDetails(
  request: string,
  target: EditingTarget | null,
  capturedBase: EditingBase | null,
) {
  const at = new Date(0).toISOString();
  return {
    request,
    target,
    capturedBase,
    stages: ["Reading selected section", "Preparing response"],
    timestamps: { startedAt: at, failedAt: at },
    systemError: "The local simulated stream was interrupted.",
    responder: "Synthetic simulator" as const,
  };
}

function seedFailure(state: MockupState) {
  if (state.chat.messages.some((message) => message.id === "seeded-synthetic-failure")) return;
  const target = selectedTarget(state);
  const base = target ? captureBase(state, target) : null;
  const details = {
    ...interruptedDetails("Make the selected instructions more concise.", target, base),
    systemError: "Synthetic fixture: the simulator paused before it could prepare a proposal.",
  };
  if (target?.kind === "agent") {
    const agent = state.agents.find((item) => item.id === target.agentId);
    const saved = agent?.versions.find((item) => item.id === target.versionId);
    const version = saved && (state.workingCopies.versions[saved.id] ?? saved);
    if (version)
      Object.assign(details, {
        modelContext: {
          languageModel: structuredClone(version.languageModel),
          imageModel: structuredClone(version.imageModel),
        },
      });
  }
  const message = textMessage(
    "seeded-synthetic-failure",
    "assistant",
    "A synthetic example failed before creating a proposal. Retry demonstrates the recovery flow.",
    target,
    "error",
  );
  message.parts.push({ type: "data-error-details", data: details });
  state.chat.messages.unshift(message);
}

function normalize(state: MockupState, includeSeedFailure = false): MockupState {
  state.ui.recentVersionIds ??= {};
  const selection = state.ui.selection;
  if (selection.kind === "agent") state.ui.recentVersionIds[selection.agentId] ??= selection.versionId;
  state.chat.composerText ??= "";
  state.chat.pendingClarification ??= null;
  state.ui.testSetup ??= defaultTestSetup();
  state.booklets ??= bookletFixtures();
  state.testSessions ??= [];
  if (state.pendingTestResponse) {
    const pending = state.pendingTestResponse;
    const session = state.testSessions.find((item) => item.id === pending.sessionId);
    if (session)
      session.messages.push({
        id: `interrupted-${pending.id}`,
        role: "assistant",
        text: "The simulated test response was interrupted during refresh.",
        createdAt: new Date().toISOString(),
        state: "interrupted",
        retryRequest: pending.request,
      });
    state.pendingTestResponse = null;
  }
  if (state.chat.pendingResponse) {
    const pending = state.chat.pendingResponse;
    state.chat.messages.push({
      ...textMessage(
        `interrupted-${pending.id}`,
        "assistant",
        "The simulated response was interrupted during refresh.",
        pending.target,
        "interrupted",
      ),
      parts: [
        { type: "text", text: "The simulated response was interrupted during refresh.", state: "done" },
        { type: "data-error-details", data: interruptedDetails(pending.request, pending.target, pending.base) },
      ],
    });
    state.chat.pendingResponse = null;
  }
  if (includeSeedFailure) seedFailure(state);
  return state;
}

export const freshSeed = () =>
  migrateV1(structuredClone(seed) as unknown as UnknownRecord, true);

export const isMockupState = (value: unknown): value is MockupState =>
  isRecord(value) &&
  value.formatVersion === 3 &&
  Array.isArray(value.specialties) &&
  Array.isArray(value.agents) &&
  isRecord(value.chat) &&
  Array.isArray(value.chat.messages) &&
  Array.isArray(value.chat.proposals) &&
  Array.isArray(value.booklets) &&
  Array.isArray(value.testSessions);

export function loadState(storage: Pick<Storage, "getItem">) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return { state: freshSeed(), error: null };
    const value: unknown = JSON.parse(raw);
    if (isMockupState(value)) return { state: normalize(value), error: null };
    if (isRecord(value) && value.formatVersion === 2)
      return { state: migrateV2(value), error: null };
    if (isRecord(value) && value.formatVersion === 1)
      return { state: migrateV1(value, false), error: null };
    return { state: null, error: "Saved demo data uses an unsupported format." };
  } catch {
    return { state: null, error: "Saved demo data could not be read." };
  }
}

export function saveState(storage: Pick<Storage, "setItem">, state: MockupState) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return null;
  } catch {
    return "Changes cannot be retained after refresh.";
  }
}

export function reducer(state: MockupState, action: MockupAction) {
  return action.type === "replace" ? action.state : action.mutate(state);
}
