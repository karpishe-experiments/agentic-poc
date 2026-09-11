import seed from "./seed.json";
import type { MockupAction, MockupState } from "./types";

export const STORAGE_KEY = "specialty-management-mockup:v1";
function normalize(state: MockupState): MockupState {
  const selection = state.ui.selection;
  state.ui.recentVersionIds ??= {};
  if (selection.kind === "agent")
    state.ui.recentVersionIds[selection.agentId] ??= selection.versionId;
  if (state.chat.pendingResponse) {
    state.chat.messages.push({
      id: `interrupted-${state.chat.pendingResponse.id}`,
      role: "assistant",
      text: "The simulated response was interrupted during refresh.",
      target: state.chat.pendingResponse.target,
      retryRequest: state.chat.pendingResponse.request,
    });
    state.chat.pendingResponse = null;
  }
  return state;
}
export const freshSeed = () =>
  normalize(structuredClone(seed) as unknown as MockupState);
export const isMockupState = (value: unknown): value is MockupState =>
  !!value &&
  typeof value === "object" &&
  (value as MockupState).formatVersion === 1 &&
  Array.isArray((value as MockupState).specialties) &&
  Array.isArray((value as MockupState).agents);
export function loadState(storage: Pick<Storage, "getItem">) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return { state: freshSeed(), error: null };
    const value: unknown = JSON.parse(raw);
    return isMockupState(value)
      ? { state: normalize(value), error: null }
      : { state: null, error: "Saved demo data uses an unsupported format." };
  } catch {
    return { state: null, error: "Saved demo data could not be read." };
  }
}
export function saveState(
  storage: Pick<Storage, "setItem">,
  state: MockupState,
) {
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
