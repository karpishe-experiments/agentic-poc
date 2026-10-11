import type { ExperimentMode, ExperimentRole, ExperimentTask, Persona } from "@/lib/contracts/experiment-runner";

export type BaseDocument = { _id: string };

export type BookletDocument = BaseDocument & { schemaVersion: string; workingTitle: string; lifecycle: string; currentStage: string; coverAssetId: string | null; createdAtMs: number; updatedAtMs: number; executionProfile?: "dify_booklet_v1"; experimentRunId?: string };
export type ArtifactDocument = BaseDocument & { bookletId: string; artifactType: string; state: string; currentVersionId: string | null; createdAtMs: number; updatedAtMs: number; taskId?: ExperimentTask; subjectKind?: "book" | "character" | "location" | "page"; subjectId?: string; experimentRunId?: string };
export type ArtifactVersionDocument = BaseDocument & { artifactId: string; versionNumber: number; schemaVersion: string; contentJson: string; dependencyVersionIdsJson: string; createdBy: string; sourceVersionId: string | null; sourceExecutionBatchId: string | null; createdAtMs: number; sourceOperationId?: string; warningsJson?: string };
export type ArtifactDependencyDocument = BaseDocument & { downstreamVersionId: string; upstreamVersionId: string; createdAtMs: number };
export type MessageDocument = BaseDocument & { bookletId: string; sequence: number; role: string; schemaVersion: string; uiMessageJson: string; createdAtMs: number; experimentRunId?: string; operationId?: string };
export type CardDocument = BaseDocument & { bookletId: string; messageId: string | null; artifactId: string | null; family: string; variant: string; status: string; schemaVersion: string; cardJson: string; readyInputJson: string | null; readyInputSchemaVersion: string | null; readyWorkflowFingerprintJson: string | null; readyPreviousBatchId: string | null; createdAtMs: number; updatedAtMs: number };
export type CardResponseDocument = BaseDocument & { cardId: string; action: string; valueJson: string | null; revisionInstruction: string | null; followupStatus: string; followupMessageId: string | null; createdAtMs: number };
export type AssetDocument = BaseDocument & { bookletId: string | null; kind: string; uri: string; mimeType: string; width: number | null; height: number | null; sourceAssetId: string | null; metadataJson: string | null; createdAtMs: number };
export type StyleCatalogDocument = BaseDocument & { name: string; description: string; previewAssetId: string; prompt: string; provenance: string; sortOrder: number; createdAtMs: number };
export type GenerationJobDocument = BaseDocument & { bookletId: string; jobType: string; status: string; idempotencyKey: string; inputJson: string; errorJson: string | null; createdAtMs: number; startedAtMs: number | null; finishedAtMs: number | null; updatedAtMs: number; supersedesJobId?: string; supersededByJobId?: string };
export type GenerationItemDocument = BaseDocument & { jobId: string; itemKey: string; position: number; status: string; attemptCount: number; inputJson: string; resultJson: string | null; assetId: string | null; errorJson: string | null; executionCardId: string | null; executionBatchId: string | null; startedAtMs: number | null; finishedAtMs: number | null };
export type ModelCallDocument = BaseDocument & { bookletId: string; operation: string; skillId: string | null; artifactVersionId: string | null; jobId: string | null; provider: string; model: string; traceId: string | null; providerRequestId: string | null; status: string; attempt: number; startedAtMs: number; latencyMs: number; inputRefJson: string; outputRefJson: string | null; usageJson: string | null; actualCostUsd: string | null; estimatedCostUsd: string | null; pricingVersion: string | null; errorKind: string | null; errorMessage: string | null; agentDefinitionId: string | null; agentVersionId: string | null; agentConfigSnapshotJson: string | null; executionBatchId: string | null; executionItemId: string | null };
export type AgentDefinitionDocument = BaseDocument & { createdAtMs: number; createdBy: string };
export type AgentVersionDocument = BaseDocument & { agentId: string; versionNumber: number; parentVersionId: string | null; displayName: string; purpose: string; role: string; skillId: string | null; imageTarget: string | null; instructions: string | null; provider: string; modelId: string; reasoningEffort: string | null; maxTurns: number | null; profileId: string | null; profileVersion: number | null; imageQuality: string | null; imageResolution: string | null; status: string; isActive: boolean; revision: number; createdAtMs: number; updatedAtMs: number; createdBy: string; updatedBy: string };
export type AgentVersionEventDocument = BaseDocument & { agentId: string; agentVersionId: string; action: string; actor: string; metadataJson: string | null; createdAtMs: number };
export type QualityReviewDocument = BaseDocument & { bookletId: string; gate: string; attempt: number; status: string; artifactVersionIdsJson: string; issuesJson: string; repairVersionIdsJson: string | null; sourceExecutionBatchId: string | null; acceptedAtMs: number | null; createdAtMs: number };
export type ApprovalDocument = BaseDocument & { bookletId: string; artifactVersionId: string; scope: string; subjectKey: string | null; action: string; origin: string; sourceApprovalId: string | null; cardResponseId: string | null; qualityReviewId: string | null; createdAtMs: number; experimentRunId?: string; testerDecisionId?: string; delegationId?: string | null; reviewGroupId?: string | null };
export type ExportDocument = BaseDocument & { bookletId: string; artifactVersionId: string; status: string; assetId: string | null; pageAssetIdsJson: string; preflightJson: string | null; errorJson: string | null; createdAtMs: number; updatedAtMs: number };

export type ExecutionPreferenceDocument = BaseDocument & { bookletId: string; targetKey: string; selectedAgentIdsJson: string; revision: number; createdAtMs: number; updatedAtMs: number };
export type ExecutionBatchDocument = BaseDocument & { bookletId: string; cardId: string; targetKey: string; subjectKind: string; subjectId: string; previousBatchId: string | null; poolFingerprint: string; status: string; materializationStatus: string; resultChoicePolicy: string; canonicalInputJson: string; workflowFingerprintJson: string; schemaVersion: string; selectedItemId: string | null; selectionMode: string | null; selectionResponseId: string | null; producedArtifactVersionId: string | null; producedQualityReviewId: string | null; producedAssetId: string | null; queuedAtMs: number; startedAtMs: number | null; terminalAtMs: number | null; completedAtMs: number | null; updatedAtMs: number };
export type ExecutionItemDocument = BaseDocument & { batchId: string; agentId: string; agentVersionId: string; profileId: string; profileVersion: number; agentSnapshotJson: string; profileSnapshotJson: string; status: string; attemptCount: number; attemptsJson: string; resultSummaryJson: string | null; canonicalResultJson: string | null; candidateAssetId: string | null; safeErrorJson: string | null; startedAtMs: number | null; finishedAtMs: number | null; updatedAtMs: number };
export type DeploymentControlDocument = BaseDocument & { schemaVersion: "1"; environment: string; maintenance: boolean; reason: string | null; activeMutations: number; updatedAtMs: number };
export type ExperimentCounters = { logicalText: number; logicalImage: number; payableText: number; payableImage: number; steps: number };
export type ExperimentRunDocument = BaseDocument & {
  schemaVersion: "2"; bookletId: string; persona: Persona; mode: ExperimentMode; brief: string;
  predecessorRunId: string | null; configurationJson: string; configurationHash: string;
  status: "queued" | "running" | "paused" | "blocked" | "completed" | "failed";
  evaluationStatus: "pending" | "running" | "complete" | "failed";
  generationCompletedAtMs?: number;
  generationVersionIds?: string[];
  revision: number; pauseRequested: boolean; activeOperationId: string | null;
  counters: ExperimentCounters; limits: { text: number; image: number; steps: number };
  safeFailure: "limit_exhausted" | "unknown_outcome" | "definite_failure" | null;
  activeDelegationId: string | null; decisionSequence: number; pendingDecisionJson: string | null;
  textRevisions: number; imageRevisions: number;
  progressFingerprint?: string | null; progressOperationId?: string | null; noProgressCount?: number;
  createdAtMs: number; updatedAtMs: number;
};
export type ExperimentOperationDocument = BaseDocument & {
  runId: string; role: ExperimentRole; taskId: ExperimentTask | null;
  subjectKind: "book" | "character" | "location" | "page"; subjectId: string;
  idempotencyKey: string; inputFingerprint: string; attempt: number;
  mode: ExperimentMode; providerKind: "text" | "image";
  state: "prepared" | "started" | "succeeded" | "failed" | "unknown";
  workflowRunId: string | null; parentWorkflowRunId: string | null;
  dispatchStartedAtMs?: number | null;
  nextObservationAtMs?: number | null;
  verifiedWorkflowId?: string | null;
  imageRequestJson?: string | null;
  // Retained J13 runtime upload acknowledgements in selected-reference order.
  // Absence is not permission to upload again after an uncertain request.
  referenceUploadsJson?: string | null;
  // Written before each reference POST. An interrupted started attempt cannot
  // be repeated merely because its acknowledgement is absent.
  referenceUploadJournalJson?: string | null;
  imageCompletionDigest?: string | null;
  imageCompletionClaim?: { id: string; digest: string; expiresAtMs: number } | null;
  // Suppress observer writes during text/clarification materialization. This is
  // an expiring save lease, not another workflow or provider reservation.
  resultFinalizationClaim?: { id: string; expiresAtMs: number } | null;
  imageFailureHistory?: { category: "unknown_outcome" | "definite_failure"; recordedAtMs: number }[];
  reservationCount: number; deadlineAtMs: number | null;
  resultJson: string | null; resultDigest: string | null; warningsJson: string;
  expectedTargetVersionId: string | null; dependencyVersionIds: string[]; materializationJson: string | null;
  safeFailure: "unknown_outcome" | "definite_failure" | null;
  createdAtMs: number; updatedAtMs: number;
};
export type ExperimentDelegationDocument = BaseDocument & {
  runId: string; testerDecisionId: string; taskIds: ExperimentTask[];
  subjectKind: "book"; subjectId: string; action: "approve";
  effectiveSequence: number; supersededById: string | null; revokedAtMs: number | null; createdAtMs: number;
};
export type MongoDocumentMap = {
  experiment_runs: ExperimentRunDocument;
  experiment_operations: ExperimentOperationDocument;
  experiment_delegations: ExperimentDelegationDocument;
  booklets: BookletDocument;
  artifacts: ArtifactDocument;
  artifact_versions: ArtifactVersionDocument;
  artifact_dependencies: ArtifactDependencyDocument;
  messages: MessageDocument;
  cards: CardDocument;
  card_responses: CardResponseDocument;
  assets: AssetDocument;
  style_catalog: StyleCatalogDocument;
  generation_jobs: GenerationJobDocument;
  generation_items: GenerationItemDocument;
  model_calls: ModelCallDocument;
  agent_definitions: AgentDefinitionDocument;
  agent_versions: AgentVersionDocument;
  agent_version_events: AgentVersionEventDocument;
  quality_reviews: QualityReviewDocument;
  approvals: ApprovalDocument;
  exports: ExportDocument;
  execution_preferences: ExecutionPreferenceDocument;
  execution_batches: ExecutionBatchDocument;
  execution_items: ExecutionItemDocument;
  deployment_control: DeploymentControlDocument;
};

export type CollectionName = keyof MongoDocumentMap;
export const COLLECTION_NAMES = ["booklets", "artifacts", "artifact_versions", "artifact_dependencies", "messages", "cards", "card_responses", "assets", "style_catalog", "generation_jobs", "generation_items", "model_calls", "agent_definitions", "agent_versions", "agent_version_events", "quality_reviews", "approvals", "exports", "execution_preferences", "execution_batches", "execution_items", "deployment_control", "experiment_runs", "experiment_operations", "experiment_delegations"] as const satisfies readonly CollectionName[];
