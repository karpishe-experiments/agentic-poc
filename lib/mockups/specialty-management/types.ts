import type { UIMessage } from "ai";

export type OutputType = "text" | "image";
export type VersionStatus = "draft" | "confirmed" | "retired";
export type EditableAgentSection =
  | "configuration"
  | "instructions"
  | `reference:${string}`;
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
  description: string;
  versionNote: string;
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
  | { kind: "directory" }
  | { kind: "specialty"; specialtyId: string }
  | {
      kind: "agent";
      specialtyId: string;
      agentId: string;
      versionId: string;
      section: EditableAgentSection;
    };

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
  description: string;
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
  Pick<AgentVersion, "title" | "description" | "languageModel" | "imageModel">
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
>;

export type PendingChatResponse = {
  id: string;
  target: EditingTarget;
  request: string;
  base: EditingBase;
  startedAt: string;
  stage: WorkingStatusCard["label"];
};
export type PendingClarification = ClarificationCard;

export type MockupState = {
  schemaVersion: 1;
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
    focusMode: boolean;
    navigationNotice: string | null;
  };
  chat: {
    messages: ManagementUIMessage[];
    proposals: ChatProposal[];
    pendingResponse: PendingChatResponse | null;
    composerText: string;
    pendingClarification: PendingClarification | null;
  };
};
export type MockupAction =
  | { type: "replace"; state: MockupState }
  | { type: "mutate"; mutate: (state: MockupState) => MockupState };
