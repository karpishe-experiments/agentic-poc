import { z } from "zod";
import seed from "./seed.json";
import { captureBase } from "./chat";
import type {
  EditingBase,
  EditingTarget,
  ManagementUIMessage,
  MockupAction,
  MockupState,
} from "./types";

export const STORAGE_KEY = "specialty-management-mockup:v2";
export const SCHEMA_VERSION = 1;

const outputTypeSchema = z.enum(["text", "image"]);
const modelSchema = z.object({ provider: z.string(), model: z.string() }).strict();
const referenceSchema = z.object({ id: z.string(), name: z.string(), description: z.string(), content: z.string() }).strict();
const versionSchema = z.object({
  id: z.string(), number: z.number(), parentVersionId: z.string().nullable(), status: z.enum(["draft", "confirmed", "retired"]),
  title: z.string(), description: z.string(), versionNote: z.string(), languageModel: modelSchema, imageModel: modelSchema.nullable(),
  mainInstructions: z.string(), references: z.array(referenceSchema),
}).strict();
const specialtySchema = z.object({ id: z.string(), name: z.string(), description: z.string(), outputType: outputTypeSchema, allowedToolIds: z.array(z.string()), builtIn: z.boolean(), retired: z.boolean() }).strict();
const agentSchema = z.object({ id: z.string(), specialtyId: z.string(), activeVersionId: z.string().nullable(), versions: z.array(versionSchema) }).strict();
const sectionSchema = z.union([z.literal("configuration"), z.literal("instructions"), z.string().startsWith("reference:")]);
const agentTargetSchema = z.object({ kind: z.literal("agent"), specialtyId: z.string(), agentId: z.string(), versionId: z.string(), section: sectionSchema }).strict();
const specialtyTargetSchema = z.object({ kind: z.literal("specialty"), specialtyId: z.string(), section: z.literal("settings") }).strict();
const targetSchema = z.union([specialtyTargetSchema, agentTargetSchema]);
const selectionSchema = z.union([z.object({ kind: z.literal("directory") }).strict(), z.object({ kind: z.literal("specialty"), specialtyId: z.string() }).strict(), agentTargetSchema]);
const baseSchema = z.union([
  z.object({ kind: z.literal("specialty"), name: z.string(), description: z.string(), outputType: outputTypeSchema, allowedToolIds: z.array(z.string()), builtIn: z.boolean() }).strict(),
  z.object({ kind: z.literal("configuration"), title: z.string(), description: z.string(), languageModel: modelSchema, imageModel: modelSchema.nullable(), outputType: outputTypeSchema, builtIn: z.boolean() }).strict(),
  z.object({ kind: z.literal("instructions"), mainInstructions: z.string() }).strict(),
  z.object({ kind: z.literal("reference"), id: z.string(), name: z.string(), description: z.string(), content: z.string() }).strict(),
]);
const patchSchema = z.union([
  z.object({ name: z.string().optional(), description: z.string().optional(), outputType: outputTypeSchema.optional(), allowedToolIds: z.array(z.string()).optional() }).strict(),
  z.object({ title: z.string().optional(), description: z.string().optional(), languageModel: modelSchema.optional(), imageModel: modelSchema.nullable().optional() }).strict(),
  z.object({ mainInstructions: z.string() }).strict(),
  z.object({ name: z.string().optional(), description: z.string().optional(), content: z.string().optional() }).strict(),
]);
const clarificationSchema = z.object({ id: z.string(), question: z.string(), choices: z.array(z.string()), target: targetSchema, request: z.string() }).strict();
const errorSchema = z.object({
  request: z.string(), target: targetSchema.nullable(), capturedBase: baseSchema.nullable(), stages: z.array(z.string()), timestamps: z.object({ startedAt: z.string(), failedAt: z.string() }).strict(),
  systemError: z.string(), responder: z.literal("Synthetic simulator"), modelContext: z.object({ languageModel: modelSchema, imageModel: modelSchema.nullable() }).strict().optional(),
}).strict();
const partSchema = z.union([
  z.object({ type: z.literal("text"), text: z.string(), state: z.enum(["done", "streaming"]).optional() }).strict(),
  z.object({ type: z.literal("data-proposal"), data: z.object({ proposalId: z.string() }).strict() }).strict(),
  z.object({ type: z.literal("data-clarification"), data: clarificationSchema }).strict(),
  z.object({ type: z.literal("data-error-details"), data: errorSchema }).strict(),
  z.object({ type: z.literal("data-working-status"), data: z.object({ label: z.enum(["Reading selected section", "Preparing response", "Creating proposal"]) }).strict() }).strict(),
]);
const messageSchema = z.object({ id: z.string(), role: z.enum(["user", "assistant"]), metadata: z.object({ target: targetSchema.nullable(), createdAt: z.string(), state: z.enum(["complete", "cancelled", "interrupted", "error"]).optional() }).strict(), parts: z.array(partSchema) }).strict();
const proposalSchema = z.object({ id: z.string(), target: targetSchema, request: z.string(), base: baseSchema, patch: patchSchema, status: z.enum(["pending", "applied", "dismissed", "superseded", "unavailable"]), createdAt: z.string() }).strict();
const stateSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION), specialties: z.array(specialtySchema), agents: z.array(agentSchema),
  tools: z.array(z.object({ id: z.string(), name: z.string(), description: z.string() }).strict()), models: z.array(z.object({ id: z.string(), provider: z.string(), label: z.string(), kind: z.enum(["language", "image"]) }).strict()),
  workingCopies: z.object({ specialties: z.record(z.string(), specialtySchema), versions: z.record(z.string(), versionSchema) }).strict(),
  ui: z.object({ selection: selectionSchema, recentVersionIds: z.record(z.string(), z.string()), expandedSpecialtyIds: z.array(z.string()), showRetired: z.boolean(), navWidth: z.number(), chatWidth: z.number(), sectionWidth: z.number(), chatOpen: z.boolean(), editorMode: z.enum(["edit", "preview"]), imageDescriptions: z.record(z.string(), z.string()), focusMode: z.boolean(), navigationNotice: z.string().nullable() }).strict(),
  chat: z.object({ messages: z.array(messageSchema), proposals: z.array(proposalSchema), pendingResponse: z.object({ id: z.string(), target: targetSchema, request: z.string(), base: baseSchema, startedAt: z.string(), stage: z.enum(["Reading selected section", "Preparing response", "Creating proposal"]) }).strict().nullable(), composerText: z.string(), pendingClarification: clarificationSchema.nullable() }).strict(),
}).strict();

export const isMockupState = (value: unknown): value is MockupState => stateSchema.safeParse(value).success;

export function interruptedDetails(request: string, target: EditingTarget | null, capturedBase: EditingBase | null) {
  const at = new Date(0).toISOString();
  return { request, target, capturedBase, stages: ["Reading selected section", "Preparing response"], timestamps: { startedAt: at, failedAt: at }, systemError: "The local simulated stream was interrupted.", responder: "Synthetic simulator" as const };
}

const interruptedMessage = (id: string, request: string, target: EditingTarget, base: EditingBase): ManagementUIMessage => ({
  id, role: "assistant", metadata: { target, createdAt: new Date().toISOString(), state: "interrupted" },
  parts: [{ type: "text", text: "The simulated response was interrupted during refresh.", state: "done" }, { type: "data-error-details", data: interruptedDetails(request, target, base) }],
});

function recoverInterruptedResponse(state: MockupState) {
  const pending = state.chat.pendingResponse;
  if (!pending) return state;
  state.chat.messages.push(interruptedMessage(`interrupted-${pending.id}`, pending.request, pending.target, pending.base));
  state.chat.pendingResponse = null;
  return state;
}

export const freshSeed = (): MockupState => {
  const current = structuredClone(seed) as MockupState;
  const target: EditingTarget = {
    kind: "agent", specialtyId: "sp-story", agentId: "agent-playful", versionId: "playful-v2", section: "instructions",
  };
  const base = captureBase(current, target);
  const version = current.agents.find((agent) => agent.id === target.agentId)?.versions.find((item) => item.id === target.versionId);
  if (base && version) {
    const text = "A synthetic example failed before creating a proposal. Retry demonstrates the recovery flow.";
    current.chat.messages.unshift({
      id: "seeded-synthetic-failure", role: "assistant", metadata: { target, createdAt: new Date(0).toISOString(), state: "error" },
      parts: [
        { type: "text", text, state: "done" },
        { type: "data-error-details", data: { ...interruptedDetails("Make the selected instructions more concise.", target, base), systemError: "Synthetic fixture: the simulator paused before it could prepare a proposal.", modelContext: { languageModel: structuredClone(version.languageModel), imageModel: structuredClone(version.imageModel) } } },
      ],
    });
  }
  return current;
};

export function loadState(storage: Pick<Storage, "getItem">) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return { state: freshSeed(), recovered: false };
    const parsed: unknown = JSON.parse(raw);
    const checked = stateSchema.safeParse(parsed);
    if (!checked.success) return { state: freshSeed(), recovered: true };
    return { state: recoverInterruptedResponse(checked.data as MockupState), recovered: false };
  } catch {
    return { state: freshSeed(), recovered: true };
  }
}

export function saveState(storage: Pick<Storage, "setItem">, state: MockupState) {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(state)); return null; }
  catch { return "Changes cannot be retained after refresh."; }
}

export function reducer(state: MockupState, action: MockupAction) {
  return action.type === "replace" ? action.state : action.mutate(state);
}
