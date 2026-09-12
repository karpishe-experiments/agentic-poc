import type { UIMessage } from "ai";

export type OutputType = "text" | "image";
export type VersionStatus = "draft" | "confirmed" | "retired";
export type EditableAgentSection =
  | "configuration"
  | "instructions"
  | `reference:${string}`;
export type EditorSection = EditableAgentSection | "test";
export type ModelSelection = { provider: string; model: string };
export type ReferenceFile = {
  id: string;
  name: string;
  description: string;
  content: string;
};
export type Specialty = {
  id: string;
  name: string;
  description: string;
  outputType: OutputType;
  allowedToolIds: string[];
  builtIn: boolean;
  retired: boolean;
};
export type AgentVersion = {
  id: string;
  number: number;
  parentVersionId: string | null;
  status: VersionStatus;
  title: string;
  languageModel: ModelSelection;
  imageModel: ModelSelection | null;
  mainInstructions: string;
  references: ReferenceFile[];
};
export type Agent = {
  id: string;
  specialtyId: string;
  activeVersionId: string | null;
  versions: AgentVersion[];
};
export type ToolFixture = { id: string; name: string; description: string };
export type ModelFixture = {
  id: string;
  provider: string;
  label: string;
  kind: "language" | "image";
};
export type Selection =
  | { kind: "specialty"; specialtyId: string }
  | {
      kind: "agent";
      specialtyId: string;
      agentId: string;
      versionId: string;
      section: EditorSection;
    }
  | { kind: "test-history"; sessionId: string | null };

export type SpecialtyEditingTarget = {
  kind: "specialty";
  specialtyId: string;
  section: "settings";
};
export type AgentEditingTarget = {
  kind: "agent";
  specialtyId: string;
  agentId: string;
  versionId: string;
  section: EditableAgentSection;
};
export type EditingTarget = SpecialtyEditingTarget | AgentEditingTarget;
/** Kept as a named alias while checkpoint 7 callers migrate. */
export type ProposalTarget = EditingTarget;

export type SpecialtyBase = {
  kind: "specialty";
  name: string;
  description: string;
  outputType: OutputType;
  allowedToolIds: string[];
  builtIn: boolean;
};
export type ConfigurationBase = {
  kind: "configuration";
  title: string;
  languageModel: ModelSelection;
  imageModel: ModelSelection | null;
  outputType: OutputType;
  builtIn: boolean;
};
export type InstructionsBase = { kind: "instructions"; mainInstructions: string };
export type ReferenceBase = {
  kind: "reference";
  id: string;
  name: string;
  description: string;
  content: string;
};
export type EditingBase =
  | SpecialtyBase
  | ConfigurationBase
  | InstructionsBase
  | ReferenceBase;

export type SpecialtyPatch = Partial<
  Pick<Specialty, "name" | "description" | "outputType" | "allowedToolIds">
>;
export type ConfigurationPatch = Partial<
  Pick<AgentVersion, "title" | "languageModel" | "imageModel">
>;
export type InstructionsPatch = { mainInstructions: string };
export type ReferencePatch = Partial<
  Pick<ReferenceFile, "name" | "description" | "content">
>;
export type EditingPatch =
  | SpecialtyPatch
  | ConfigurationPatch
  | InstructionsPatch
  | ReferencePatch;

export type ProposalStatus =
  | "pending"
  | "applied"
  | "dismissed"
  | "superseded"
  | "unavailable";
export type ChatProposal = {
  id: string;
  target: EditingTarget;
  request: string;
  base: EditingBase;
  patch: EditingPatch;
  status: ProposalStatus;
  createdAt: string;
  /** Read-only presentation text for Markdown sections and legacy UI. */
  proposedText?: string;
  /** Preserved during v1 migration; new code must use `base`. */
  baseText?: string;
};

export type WorkingStatusCard = {
  label: "Reading selected section" | "Preparing response" | "Creating proposal";
};
export type ClarificationCard = {
  id: string;
  question: string;
  choices: string[];
  target: EditingTarget;
  request: string;
};
export type ErrorDetails = {
  request: string;
  target: EditingTarget | null;
  capturedBase: EditingBase | null;
  stages: string[];
  timestamps: { startedAt: string; failedAt: string };
  systemError: string;
  responder: "Synthetic simulator";
  modelContext?: { languageModel: ModelSelection; imageModel: ModelSelection | null };
};
export type ManagementChatData = {
  "working-status": WorkingStatusCard;
  clarification: ClarificationCard;
  proposal: { proposalId: string };
  "error-details": ErrorDetails;
};
export type ManagementMessageMetadata = {
  target: EditingTarget | null;
  createdAt: string;
  state?: "complete" | "cancelled" | "interrupted" | "error";
};
export type ManagementUIMessage = UIMessage<
  ManagementMessageMetadata,
  ManagementChatData
> & {
  /** Transitional read-only conveniences for the checkpoint-6 panel. */
  text?: string;
  target?: AgentEditingTarget | null;
  retryRequest?: string;
};

export type PendingChatResponse = {
  id: string;
  target: EditingTarget;
  request: string;
  base: EditingBase;
  startedAt: string;
  stage: WorkingStatusCard["label"];
  /** Transitional fields retained until the former timer-based panel is removed. */
  baseText?: string;
  inputText?: string;
};
export type PendingClarification = ClarificationCard;

export type BookletStageId =
  | "audience_profile"
  | "story_plan"
  | "visual_style"
  | "visual_bible"
  | "booklet_specification"
  | "page_plan"
  | "final_pages"
  | "pdf_export";
export type StageArtifact = {
  stageId: BookletStageId;
  label: string;
  content: string;
  assetPath?: string;
};
export type BookletStageSnapshot = {
  id: string;
  bookletId: string;
  stageId: BookletStageId;
  stageLabel: string;
  stageIndex: number;
  premise: string;
  audience: string;
  artifacts: StageArtifact[];
  conversation: Array<{ role: "user" | "assistant"; text: string }>;
  taskContext: string;
};
export type BookletFixture = {
  id: string;
  title: string;
  premise: string;
  audience: string;
  currentStageId: BookletStageId;
  snapshots: BookletStageSnapshot[];
};
export type Compatibility = "compatible" | "warning" | "undefined";
export type TestActivity = {
  id: string;
  kind: "context-read" | "reference-read" | "tool-call";
  label: string;
  input: string;
  output: string;
};
export type TestResult =
  | {
      kind: "text";
      markdown: string;
      revisionNote?: string;
    }
  | {
      kind: "image";
      imagePath: string;
      description: string;
      metadata: Record<string, string>;
      revisionNote?: string;
    }
  | {
      kind: "orchestrator";
      selectedSpecialtyId: string | null;
      explanation: string;
    }
  | { kind: "unsupported"; explanation: string };
export type TestMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
  state: "complete" | "cancelled" | "interrupted" | "error";
  result?: TestResult;
  activityIds?: string[];
  rating?: "useful" | "needs-work";
  note?: string;
  retryRequest?: string;
};
export type TestSession = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  agentId: string;
  agentName: string;
  agentVersionId: string;
  agentVersionNumber: number;
  specialtyId: string;
  specialtyName: string;
  agentSnapshot: AgentVersion;
  specialtySnapshot: Pick<Specialty, "id" | "name" | "outputType" | "allowedToolIds">;
  stageSnapshot: BookletStageSnapshot;
  routingCatalog: Array<Pick<Specialty, "id" | "name" | "retired">>;
  sourceSessionId: string | null;
  openingRequest: string;
  messages: TestMessage[];
  activity: TestActivity[];
};
export type PendingTestResponse = {
  id: string;
  sessionId: string;
  request: string;
  startedAt: string;
  kind: "opening" | "followup" | "retry";
};
export type TestSetup = {
  bookletId: string;
  stageId: BookletStageId;
  openingRequest: string;
  sourceSessionId: string | null;
};

export type MockupState = {
  formatVersion: 3;
  specialties: Specialty[];
  agents: Agent[];
  tools: ToolFixture[];
  models: ModelFixture[];
  workingCopies: {
    specialties: Record<string, Specialty>;
    versions: Record<string, AgentVersion>;
  };
  ui: {
    selection: Selection;
    recentVersionIds: Record<string, string>;
    expandedSpecialtyIds: string[];
    showRetired: boolean;
    navWidth: number;
    chatWidth: number;
    sectionWidth: number;
    chatOpen: boolean;
    editorMode: "edit" | "preview";
    imageDescriptions: Record<string, string>;
    testSetup: TestSetup;
  };
  chat: {
    messages: ManagementUIMessage[];
    proposals: ChatProposal[];
    pendingResponse: PendingChatResponse | null;
    composerText: string;
    pendingClarification: PendingClarification | null;
  };
  booklets: BookletFixture[];
  testSessions: TestSession[];
  pendingTestResponse: PendingTestResponse | null;
};
export type MockupAction =
  | { type: "replace"; state: MockupState }
  | { type: "mutate"; mutate: (state: MockupState) => MockupState };
