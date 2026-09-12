import { STAGES } from "./booklets";
import type {
  Agent,
  AgentVersion,
  BookletStageId,
  BookletStageSnapshot,
  Compatibility,
  MockupState,
  PendingTestResponse,
  Specialty,
  TestActivity,
  TestResult,
  TestSession,
  TestSetup,
} from "./types";

const now = () => new Date().toISOString();
const visualStages = new Set<BookletStageId>(["visual_style", "visual_bible", "final_pages"]);

const visibleSpecialty = (state: MockupState, specialty: Specialty) =>
  state.workingCopies.specialties[specialty.id] ?? specialty;
const visibleVersion = (state: MockupState, version: AgentVersion) =>
  state.workingCopies.versions[version.id] ?? version;

export function compatibilityFor(
  specialty: Specialty,
  stageId: BookletStageId,
): Compatibility {
  const supported: Record<string, readonly BookletStageId[]> = {
    "sp-orchestrator": STAGES.map((stage) => stage.id),
    "sp-story": ["audience_profile", "story_plan", "booklet_specification", "page_plan"],
    "sp-illustration": ["visual_style", "visual_bible", "final_pages"],
    "sp-character": ["story_plan", "visual_bible"],
    "sp-legacy": STAGES.map((stage) => stage.id),
  };
  if (!(specialty.id in supported)) return "undefined";
  return supported[specialty.id].includes(stageId) ? "compatible" : "warning";
}

export type SelectedTestVersion = {
  agent: Agent;
  saved: AgentVersion;
  visible: AgentVersion;
};

export function selectTestVersion(state: MockupState, agentId: string): SelectedTestVersion | null {
  const agent = state.agents.find((item) => item.id === agentId);
  if (!agent || !agent.versions.length) return null;
  const newest = agent.versions.toSorted((a, b) => b.number - a.number)[0]!;
  const selection = state.ui.selection;
  const selectedId =
    selection.kind === "agent" && selection.agentId === agentId
      ? selection.versionId
      : state.ui.recentVersionIds[agentId] ?? agent.activeVersionId ?? newest.id;
  const saved = agent.versions.find((version) => version.id === selectedId)
    ?? agent.versions.find((version) => version.id === agent.activeVersionId)
    ?? newest;
  return { agent, saved, visible: visibleVersion(state, saved) };
}

function snapshotForSetup(
  state: MockupState,
  setup: TestSetup,
): BookletStageSnapshot | null {
  if (setup.sourceSessionId) {
    const source = state.testSessions.find((session) => session.id === setup.sourceSessionId);
    if (source) return structuredClone(source.stageSnapshot);
  }
  return structuredClone(
    state.booklets
      .find((booklet) => booklet.id === setup.bookletId)
      ?.snapshots.find((snapshot) => snapshot.stageId === setup.stageId) ?? null,
  );
}

export function createTestSession(
  state: MockupState,
  agentId: string,
  setup: TestSetup,
  createId: (prefix: string) => string,
): TestSession | null {
  const selection = selectTestVersion(state, agentId);
  const stageSnapshot = snapshotForSetup(state, setup);
  if (!selection || !stageSnapshot || !setup.openingRequest.trim()) return null;
  const savedSpecialty = state.specialties.find((item) => item.id === selection.agent.specialtyId);
  if (!savedSpecialty) return null;
  const specialty = visibleSpecialty(state, savedSpecialty);
  const booklet = state.booklets.find((item) => item.id === stageSnapshot.bookletId);
  const createdAt = now();
  const session: TestSession = {
    id: createId("test"),
    name: `${booklet?.title ?? stageSnapshot.bookletId} · ${stageSnapshot.stageLabel} · ${selection.visible.title} v${selection.visible.number}`,
    createdAt,
    updatedAt: createdAt,
    agentId: selection.agent.id,
    agentName: selection.visible.title,
    agentVersionId: selection.saved.id,
    agentVersionNumber: selection.visible.number,
    specialtyId: specialty.id,
    specialtyName: specialty.name,
    agentSnapshot: structuredClone(selection.visible),
    specialtySnapshot: {
      id: specialty.id,
      name: specialty.name,
      outputType: specialty.outputType,
      allowedToolIds: [...specialty.allowedToolIds],
    },
    stageSnapshot,
    routingCatalog: state.specialties.map((item) => {
      const current = visibleSpecialty(state, item);
      return { id: current.id, name: current.name, retired: current.retired };
    }),
    sourceSessionId: setup.sourceSessionId,
    openingRequest: setup.openingRequest.trim(),
    messages: [],
    activity: [],
  };
  state.testSessions.unshift(session);
  return session;
}

export function isSessionOrphaned(state: MockupState, session: TestSession) {
  return !state.agents.some((agent) => agent.id === session.agentId);
}

export function isSessionVersionMissing(state: MockupState, session: TestSession) {
  const agent = state.agents.find((item) => item.id === session.agentId);
  return !!agent && !agent.versions.some((version) => version.id === session.agentVersionId);
}

export function repeatTestSetup(state: MockupState, sessionId: string): TestSetup | null {
  const session = state.testSessions.find((item) => item.id === sessionId);
  if (!session || isSessionOrphaned(state, session)) return null;
  return {
    bookletId: session.stageSnapshot.bookletId,
    stageId: session.stageSnapshot.stageId,
    openingRequest: session.openingRequest,
    sourceSessionId: session.id,
  };
}

export function startTestResponse(
  state: MockupState,
  sessionId: string,
  request: string,
  kind: PendingTestResponse["kind"],
  createId: (prefix: string) => string,
) {
  if (state.pendingTestResponse || !request.trim()) return null;
  const session = state.testSessions.find((item) => item.id === sessionId);
  if (!session) return null;
  const pending: PendingTestResponse = {
    id: createId("test-response"),
    sessionId,
    request: request.trim(),
    startedAt: now(),
    kind,
  };
  session.messages.push({
    id: createId("test-message"),
    role: "user",
    text: pending.request,
    createdAt: pending.startedAt,
    state: "complete",
  });
  session.updatedAt = pending.startedAt;
  state.pendingTestResponse = pending;
  return pending;
}

function activityFor(session: TestSession, request: string, createId: (prefix: string) => string) {
  const activity: TestActivity[] = [{
    id: createId("activity"),
    kind: "context-read",
    label: "Read frozen stage context",
    input: session.stageSnapshot.taskContext,
    output: `${session.stageSnapshot.artifacts.length} earlier artifact(s) available.`,
  }];
  const lower = request.toLowerCase();
  if (lower !== "summarize context") {
    const reference = session.agentSnapshot.references.at(0);
    if (reference)
      activity.push({
        id: createId("activity"),
        kind: "reference-read",
        label: `Read ${reference.name}`,
        input: reference.id,
        output: reference.content,
      });
    const tool = session.specialtySnapshot.allowedToolIds.find((id) => id.startsWith("get_"));
    if (tool)
      activity.push({
        id: createId("activity"),
        kind: "tool-call",
        label: `Simulated ${tool}`,
        input: session.stageSnapshot.stageId,
        output: "Frozen context read.",
      });
  }
  return activity;
}

function resultFor(session: TestSession, request: string, createId: (prefix: string) => string): { result: TestResult; activity: TestActivity[]; text: string } {
  const lower = request.trim().toLowerCase();
  const supported = ["summarize context", "produce a sample result", "revise the result"];
  if (!supported.includes(lower))
    return {
      result: { kind: "unsupported", explanation: "Try Summarize context, Produce a sample result, or Revise the result." },
      activity: [],
      text: "This simulation supports Summarize context, Produce a sample result, and Revise the result.",
    };
  const activity = activityFor(session, lower, createId);
  if (lower === "summarize context")
    return {
      result: {
        kind: "text",
        markdown: [
          `# ${session.stageSnapshot.stageLabel}`,
          `**Premise:** ${session.stageSnapshot.premise}`,
          `**Audience:** ${session.stageSnapshot.audience}`,
          `**Task:** ${session.stageSnapshot.taskContext}`,
          "## Earlier artifacts",
          session.stageSnapshot.artifacts.length
            ? session.stageSnapshot.artifacts
                .map((item) => `- **${item.label}:** ${item.content}`)
                .join("\n")
            : "No earlier artifacts are available.",
          "## Captured conversation",
          session.stageSnapshot.conversation
            .map((item) => `- **${item.role}:** ${item.text}`)
            .join("\n"),
        ].join("\n\n"),
      },
      activity,
      text: `Captured ${session.stageSnapshot.artifacts.length} earlier artifact(s) for ${session.stageSnapshot.stageLabel}.`,
    };
  if (session.specialtyId === "sp-orchestrator") {
    const specialtyId = visualStages.has(session.stageSnapshot.stageId) ? "sp-illustration" : "sp-story";
    const selected = session.routingCatalog.find((item) => item.id === specialtyId && !item.retired);
    return {
      result: selected
        ? { kind: "orchestrator", selectedSpecialtyId: selected.id, explanation: `${selected.name} matches this frozen stage.` }
        : { kind: "orchestrator", selectedSpecialtyId: null, explanation: "Routing unavailable in the frozen specialty catalog." },
      activity,
      text: selected ? `Selected ${selected.name}.` : "Routing is unavailable.",
    };
  }
  const revisionNote = lower === "revise the result" ? "Simulated revision requested." : undefined;
  if (session.specialtySnapshot.outputType === "image") {
    if (!session.specialtySnapshot.allowedToolIds.includes("generate_image"))
      return {
        result: { kind: "unsupported", explanation: "The frozen specialty does not allow generate_image." },
        activity,
        text: "The frozen specialty does not allow image generation.",
      };
    activity.push({
      id: createId("activity"),
      kind: "tool-call",
      label: "Simulated generate_image",
      input: session.stageSnapshot.premise,
      output: "Bundled sample illustration selected.",
    });
    return {
      result: {
        kind: "image",
        imagePath: "/mockups/specialty-management/sample-image.svg",
        description: `A warm scene for ${session.stageSnapshot.premise}.`,
        metadata: { style: "Warm watercolor", stage: session.stageSnapshot.stageLabel },
        revisionNote,
      },
      activity,
      text: "Prepared a bundled sample image result.",
    };
  }
  return {
    result: {
      kind: "text",
      markdown: `# ${session.stageSnapshot.stageLabel}\n${session.stageSnapshot.premise}\n\n1. Introduce the goal\n2. Overcome one obstacle\n3. Resolve through cooperation`,
      revisionNote,
    },
    activity,
    text: "Prepared a deterministic text result from the frozen snapshot.",
  };
}

export function completeTestResponse(
  state: MockupState,
  createId: (prefix: string) => string,
) {
  const pending = state.pendingTestResponse;
  if (!pending) return null;
  const session = state.testSessions.find((item) => item.id === pending.sessionId);
  state.pendingTestResponse = null;
  if (!session) return null;
  const response = resultFor(session, pending.request, createId);
  session.activity.push(...response.activity);
  session.messages.push({
    id: createId("test-message"),
    role: "assistant",
    text: response.text,
    createdAt: now(),
    state: "complete",
    result: response.result,
    activityIds: response.activity.map((item) => item.id),
  });
  session.updatedAt = now();
  return response;
}

export function stopTestResponse(state: MockupState, createId: (prefix: string) => string) {
  const pending = state.pendingTestResponse;
  if (!pending) return false;
  const session = state.testSessions.find((item) => item.id === pending.sessionId);
  if (session) {
    session.messages.push({
      id: createId("test-message"),
      role: "assistant",
      text: "The simulated test response was stopped.",
      createdAt: now(),
      state: "cancelled",
      retryRequest: pending.request,
    });
    session.updatedAt = now();
  }
  state.pendingTestResponse = null;
  return true;
}

export function retryTestResponse(state: MockupState, sessionId: string, messageId: string, createId: (prefix: string) => string) {
  const message = state.testSessions.find((session) => session.id === sessionId)?.messages.find((item) => item.id === messageId);
  if (!message?.retryRequest || (message.state !== "cancelled" && message.state !== "interrupted" && message.state !== "error")) return null;
  return startTestResponse(state, sessionId, message.retryRequest, "retry", createId);
}

export function rateTestResponse(
  state: MockupState,
  sessionId: string,
  messageId: string,
  rating: "useful" | "needs-work" | null,
  note: string,
) {
  const session = state.testSessions.find((item) => item.id === sessionId);
  const message = session?.messages.find((item) => item.id === messageId && item.role === "assistant");
  if (!session || !message || message.state !== "complete") return false;
  message.rating = rating ?? undefined;
  message.note = note || undefined;
  session.updatedAt = now();
  return true;
}

export function editingHandoff(state: MockupState, sessionId: string, messageId: string) {
  const session = state.testSessions.find((item) => item.id === sessionId);
  const message = session?.messages.find((item) => item.id === messageId && item.role === "assistant" && item.result);
  if (!session || !message || isSessionOrphaned(state, session)) return null;
  const selected = selectTestVersion(state, session.agentId);
  if (!selected) return null;
  const differs = selected.saved.id !== session.agentVersionId;
  const result = message.result?.kind === "text" ? message.result.markdown : message.text;
  return {
    agentId: selected.agent.id,
    versionId: selected.saved.id,
    differs,
    request: `Test feedback for ${session.name}:\nTested v${session.agentVersionNumber} at ${session.stageSnapshot.stageLabel} for ${session.stageSnapshot.premise}.\n\n${result}\n${message.note ?? "No written feedback."}`,
  };
}
