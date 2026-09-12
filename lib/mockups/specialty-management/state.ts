import seed from "./seed.json";
import { bookletFixtures } from "./booklets";
import { captureBase } from "./chat";
import type {
  EditingBase,
  EditingTarget,
  ManagementUIMessage,
  MockupAction,
  MockupState,
} from "./types";

export const STORAGE_KEY = "specialty-management-mockup:v2";
type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  !!value && typeof value === "object" && !Array.isArray(value);

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

const interruptedMessage = (
  id: string,
  text: string,
  request: string,
  target: EditingTarget,
  base: EditingBase,
): ManagementUIMessage => ({
  id,
  role: "assistant",
  metadata: { target, createdAt: new Date().toISOString(), state: "interrupted" },
  parts: [
    { type: "text", text, state: "done" },
    { type: "data-error-details", data: interruptedDetails(request, target, base) },
  ],
  text,
  target: target.kind === "agent" ? target : null,
  retryRequest: request,
});

function normalize(state: MockupState): MockupState {
  state.ui.recentVersionIds ??= {};
  state.ui.testSetup ??= {
    bookletId: "demo-forest",
    stageId: "story_plan",
    openingRequest: "Produce a sample result",
    sourceSessionId: null,
  };
  state.ui.focusMode ??= false;
  state.ui.navigationNotice ??= null;
  state.ui.lastEditorSections ??= {};
  state.booklets ??= bookletFixtures();
  state.testSessions ??= [];
  state.pendingTestResponse ??= null;
  state.chat.composerText ??= "";
  state.chat.pendingClarification ??= null;
  state.agents.forEach((agent) =>
    agent.versions.forEach((version) => {
      version.description ??= "";
      version.versionNote ??= "";
    }),
  );
  Object.values(state.workingCopies.versions).forEach((version) => {
    version.description ??= "";
    version.versionNote ??= "";
  });

  if (state.pendingTestResponse) {
    const pending = state.pendingTestResponse;
    const session = state.testSessions.find((item) => item.id === pending.sessionId);
    session?.messages.push({
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
    state.chat.messages.push(
      interruptedMessage(
        `interrupted-${pending.id}`,
        "The simulated response was interrupted during refresh.",
        pending.request,
        pending.target,
        pending.base,
      ),
    );
    state.chat.pendingResponse = null;
  }
  return state;
}

export const freshSeed = (): MockupState => {
  const current = structuredClone(seed) as unknown as MockupState;
  current.formatVersion = 1;
  current.seedRevision = 1;
  current.ui.selection = { kind: "directory" };
  current.ui.navigationNotice = null;
  current.ui.lastEditorSections ??= {};
  current.ui.recentVersionIds ??= {};
  current.ui.testSetup ??= {
    bookletId: "demo-forest",
    stageId: "story_plan",
    openingRequest: "Produce a sample result",
    sourceSessionId: null,
  };
  current.ui.focusMode ??= false;
  current.chat.messages ??= [];
  current.chat.proposals ??= [];
  current.chat.pendingResponse ??= null;
  current.chat.composerText ??= "";
  current.chat.pendingClarification ??= null;
  current.booklets = bookletFixtures();
  current.testSessions = [];
  current.pendingTestResponse = null;
  const normalized = normalize(current);
  const target: EditingTarget = {
    kind: "agent",
    specialtyId: "sp-story",
    agentId: "agent-playful",
    versionId: "playful-v2",
    section: "instructions",
  };
  const base = captureBase(normalized, target);
  if (base) {
    const version = normalized.agents
      .find((agent) => agent.id === target.agentId)
      ?.versions.find((item) => item.id === target.versionId);
    const text =
      "A synthetic example failed before creating a proposal. Retry demonstrates the recovery flow.";
    normalized.chat.messages.unshift({
      id: "seeded-synthetic-failure",
      role: "assistant",
      metadata: {
        target,
        createdAt: new Date(0).toISOString(),
        state: "error",
      },
      parts: [
        { type: "text", text, state: "done" },
        {
          type: "data-error-details",
          data: {
            ...interruptedDetails(
              "Make the selected instructions more concise.",
              target,
              base,
            ),
            systemError:
              "Synthetic fixture: the simulator paused before it could prepare a proposal.",
            ...(version
              ? {
                  modelContext: {
                    languageModel: structuredClone(version.languageModel),
                    imageModel: structuredClone(version.imageModel),
                  },
                }
              : {}),
          },
        },
      ],
      text,
      target,
      retryRequest: "Make the selected instructions more concise.",
    });
  }
  return normalized;
};

export const isMockupState = (value: unknown): value is MockupState =>
  isRecord(value) &&
  value.formatVersion === 1 &&
  typeof value.seedRevision === "number" &&
  Array.isArray(value.specialties) &&
  Array.isArray(value.agents) &&
  isRecord(value.ui) &&
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
