import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const requiredText = (name: string) => text(name).notNull();
const timestamp = (name: string) => integer(name, { mode: "number" }).notNull();

export const booklets = sqliteTable("booklets", {
  id: text("id").primaryKey(),
  schemaVersion: requiredText("schema_version"),
  workingTitle: requiredText("working_title"),
  lifecycle: requiredText("lifecycle"),
  currentStage: requiredText("current_stage"),
  coverAssetId: text("cover_asset_id"),
  createdAtMs: timestamp("created_at_ms"),
  updatedAtMs: timestamp("updated_at_ms"),
}, (table) => [index("booklets_updated_at_idx").on(table.updatedAtMs)]);

export const artifacts = sqliteTable("artifacts", {
  id: text("id").primaryKey(),
  bookletId: requiredText("booklet_id").references(() => booklets.id),
  artifactType: requiredText("artifact_type"),
  state: requiredText("state"),
  currentVersionId: text("current_version_id"),
  createdAtMs: timestamp("created_at_ms"),
  updatedAtMs: timestamp("updated_at_ms"),
}, (table) => [uniqueIndex("artifacts_booklet_type_unique").on(table.bookletId, table.artifactType)]);

export const artifactVersions = sqliteTable("artifact_versions", {
  id: text("id").primaryKey(),
  artifactId: requiredText("artifact_id").references(() => artifacts.id),
  versionNumber: integer("version_number").notNull(),
  schemaVersion: requiredText("schema_version"),
  contentJson: requiredText("content_json"),
  createdBy: requiredText("created_by"),
  sourceVersionId: text("source_version_id"),
  createdAtMs: timestamp("created_at_ms"),
}, (table) => [uniqueIndex("artifact_versions_artifact_number_unique").on(table.artifactId, table.versionNumber)]);

export const artifactDependencies = sqliteTable("artifact_dependencies", {
  id: text("id").primaryKey(),
  downstreamVersionId: requiredText("downstream_version_id").references(() => artifactVersions.id),
  upstreamVersionId: requiredText("upstream_version_id").references(() => artifactVersions.id),
  createdAtMs: timestamp("created_at_ms"),
}, (table) => [uniqueIndex("artifact_dependencies_pair_unique").on(table.downstreamVersionId, table.upstreamVersionId)]);

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  bookletId: requiredText("booklet_id").references(() => booklets.id),
  sequence: integer("sequence").notNull(),
  role: requiredText("role"),
  schemaVersion: requiredText("schema_version"),
  uiMessageJson: requiredText("ui_message_json"),
  createdAtMs: timestamp("created_at_ms"),
}, (table) => [uniqueIndex("messages_booklet_sequence_unique").on(table.bookletId, table.sequence)]);

export const cards = sqliteTable("cards", {
  id: text("id").primaryKey(),
  bookletId: requiredText("booklet_id").references(() => booklets.id),
  messageId: text("message_id").references(() => messages.id),
  artifactId: text("artifact_id").references(() => artifacts.id),
  family: requiredText("family"),
  variant: requiredText("variant"),
  status: requiredText("status"),
  schemaVersion: requiredText("schema_version"),
  cardJson: requiredText("card_json"),
  createdAtMs: timestamp("created_at_ms"),
  updatedAtMs: timestamp("updated_at_ms"),
});

export const cardResponses = sqliteTable("card_responses", {
  id: text("id").primaryKey(),
  cardId: requiredText("card_id").references(() => cards.id),
  action: requiredText("action"),
  valueJson: text("value_json"),
  revisionInstruction: text("revision_instruction"),
  followupStatus: requiredText("followup_status"),
  followupMessageId: text("followup_message_id").references(() => messages.id),
  createdAtMs: timestamp("created_at_ms"),
});

export const assets = sqliteTable("assets", {
  id: text("id").primaryKey(),
  bookletId: text("booklet_id").references(() => booklets.id),
  kind: requiredText("kind"),
  uri: requiredText("uri"),
  mimeType: requiredText("mime_type"),
  width: integer("width"),
  height: integer("height"),
  sourceAssetId: text("source_asset_id"),
  metadataJson: text("metadata_json"),
  createdAtMs: timestamp("created_at_ms"),
}, (table) => [uniqueIndex("assets_uri_unique").on(table.uri)]);

export const styleCatalog = sqliteTable("style_catalog", {
  id: text("id").primaryKey(),
  name: requiredText("name"),
  description: requiredText("description"),
  previewAssetId: requiredText("preview_asset_id").references(() => assets.id),
  prompt: requiredText("prompt"),
  provenance: requiredText("provenance"),
  sortOrder: integer("sort_order").notNull(),
  createdAtMs: timestamp("created_at_ms"),
});

export const generationJobs = sqliteTable("generation_jobs", {
  id: text("id").primaryKey(),
  bookletId: requiredText("booklet_id").references(() => booklets.id),
  jobType: requiredText("job_type"),
  status: requiredText("status"),
  idempotencyKey: requiredText("idempotency_key"),
  inputJson: requiredText("input_json"),
  errorJson: text("error_json"),
  createdAtMs: timestamp("created_at_ms"),
  startedAtMs: integer("started_at_ms", { mode: "number" }),
  finishedAtMs: integer("finished_at_ms", { mode: "number" }),
  updatedAtMs: timestamp("updated_at_ms"),
}, (table) => [uniqueIndex("generation_jobs_idempotency_unique").on(table.idempotencyKey)]);

export const generationItems = sqliteTable("generation_items", {
  id: text("id").primaryKey(),
  jobId: requiredText("job_id").references(() => generationJobs.id),
  itemKey: requiredText("item_key"),
  position: integer("position").notNull(),
  status: requiredText("status"),
  attemptCount: integer("attempt_count").notNull(),
  inputJson: requiredText("input_json"),
  resultJson: text("result_json"),
  assetId: text("asset_id").references(() => assets.id),
  errorJson: text("error_json"),
  startedAtMs: integer("started_at_ms", { mode: "number" }),
  finishedAtMs: integer("finished_at_ms", { mode: "number" }),
}, (table) => [
  uniqueIndex("generation_items_job_key_unique").on(table.jobId, table.itemKey),
  uniqueIndex("generation_items_job_position_unique").on(table.jobId, table.position),
]);

export const modelCalls = sqliteTable("model_calls", {
  id: text("id").primaryKey(),
  bookletId: requiredText("booklet_id").references(() => booklets.id),
  operation: requiredText("operation"),
  skillId: text("skill_id"),
  artifactVersionId: text("artifact_version_id").references(() => artifactVersions.id),
  jobId: text("job_id").references(() => generationJobs.id),
  provider: requiredText("provider"),
  model: requiredText("model"),
  traceId: text("trace_id"),
  providerRequestId: text("provider_request_id"),
  status: requiredText("status"),
  attempt: integer("attempt").notNull(),
  startedAtMs: timestamp("started_at_ms"),
  latencyMs: integer("latency_ms").notNull(),
  inputRefJson: requiredText("input_ref_json"),
  outputRefJson: text("output_ref_json"),
  usageJson: text("usage_json"),
  actualCostUsd: text("actual_cost_usd"),
  estimatedCostUsd: text("estimated_cost_usd"),
  pricingVersion: text("pricing_version"),
  errorKind: text("error_kind"),
  errorMessage: text("error_message"),
  agentDefinitionId: text("agent_definition_id").references(() => agentDefinitions.id),
  agentVersionId: text("agent_version_id").references(() => agentVersions.id),
  agentConfigSnapshotJson: text("agent_config_snapshot_json"),
});

export const agentDefinitions = sqliteTable("agent_definitions", {
  id: text("id").primaryKey(),
  createdAtMs: timestamp("created_at_ms"),
  createdBy: requiredText("created_by"),
});

export const agentVersions = sqliteTable("agent_versions", {
  id: text("id").primaryKey(),
  agentId: requiredText("agent_id").references(() => agentDefinitions.id),
  versionNumber: integer("version_number").notNull(),
  parentVersionId: text("parent_version_id").references((): ReturnType<typeof text> => agentVersions.id),
  displayName: requiredText("display_name"),
  purpose: requiredText("purpose"),
  role: requiredText("role"),
  skillId: text("skill_id"),
  instructions: requiredText("instructions"),
  provider: requiredText("provider"),
  modelId: requiredText("model_id"),
  reasoningEffort: requiredText("reasoning_effort"),
  maxTurns: integer("max_turns").notNull(),
  status: requiredText("status"),
  isActive: integer("is_active", { mode: "boolean" }).notNull(),
  revision: integer("revision").notNull(),
  createdAtMs: timestamp("created_at_ms"),
  updatedAtMs: timestamp("updated_at_ms"),
  createdBy: requiredText("created_by"),
  updatedBy: requiredText("updated_by"),
}, (table) => [
  uniqueIndex("agent_versions_agent_number_unique").on(table.agentId, table.versionNumber),
  uniqueIndex("agent_versions_active_manager_unique").on(table.role).where(sql`${table.isActive} = 1 and ${table.role} = 'manager'`),
  uniqueIndex("agent_versions_active_specialist_unique").on(table.skillId).where(sql`${table.isActive} = 1 and ${table.role} = 'specialist'`),
  uniqueIndex("agent_versions_active_agent_unique").on(table.agentId).where(sql`${table.isActive} = 1`),
  index("agent_versions_agent_created_idx").on(table.agentId, table.createdAtMs),
  index("agent_versions_skill_active_idx").on(table.skillId, table.isActive),
  index("agent_versions_parent_idx").on(table.parentVersionId),
  check("agent_versions_role_check", sql`${table.role} in ('manager', 'specialist')`),
  check("agent_versions_status_check", sql`${table.status} in ('draft', 'confirmed', 'retired')`),
  check("agent_versions_provider_check", sql`${table.provider} = 'openai'`),
  check("agent_versions_reasoning_check", sql`${table.reasoningEffort} in ('low', 'medium', 'high')`),
  check("agent_versions_role_skill_check", sql`(${table.role} = 'manager' and ${table.skillId} is null and ${table.maxTurns} between 1 and 2) or (${table.role} = 'specialist' and ${table.skillId} is not null and ${table.maxTurns} = 1)`),
  check("agent_versions_positive_check", sql`${table.versionNumber} > 0 and ${table.revision} > 0`),
  check("agent_versions_retired_inactive_check", sql`${table.status} != 'retired' or ${table.isActive} = 0`),
]);

export const agentVersionEvents = sqliteTable("agent_version_events", {
  id: text("id").primaryKey(),
  agentId: requiredText("agent_id"),
  agentVersionId: requiredText("agent_version_id"),
  action: requiredText("action"),
  actor: requiredText("actor"),
  metadataJson: text("metadata_json"),
  createdAtMs: timestamp("created_at_ms"),
}, (table) => [
  index("agent_version_events_version_created_idx").on(table.agentVersionId, table.createdAtMs),
  check("agent_version_events_action_check", sql`${table.action} in ('create', 'edit', 'fork', 'confirm', 'activate', 'deactivate', 'retire', 'delete')`),
  check("agent_version_events_metadata_size_check", sql`${table.metadataJson} is null or length(${table.metadataJson}) <= 4096`),
]);

export const qualityReviews = sqliteTable("quality_reviews", {
  id: text("id").primaryKey(),
  bookletId: requiredText("booklet_id").references(() => booklets.id),
  gate: requiredText("gate"),
  attempt: integer("attempt").notNull(),
  status: requiredText("status"),
  artifactVersionIdsJson: requiredText("artifact_version_ids_json"),
  issuesJson: requiredText("issues_json"),
  repairVersionIdsJson: text("repair_version_ids_json"),
  acceptedAtMs: integer("accepted_at_ms", { mode: "number" }),
  createdAtMs: timestamp("created_at_ms"),
});

export const approvals = sqliteTable("approvals", {
  id: text("id").primaryKey(),
  bookletId: requiredText("booklet_id").references(() => booklets.id),
  artifactVersionId: requiredText("artifact_version_id").references(() => artifactVersions.id),
  scope: requiredText("scope"),
  subjectKey: text("subject_key"),
  action: requiredText("action"),
  origin: requiredText("origin"),
  sourceApprovalId: text("source_approval_id"),
  cardResponseId: text("card_response_id").references(() => cardResponses.id),
  qualityReviewId: text("quality_review_id").references(() => qualityReviews.id),
  createdAtMs: timestamp("created_at_ms"),
});

export const exportsTable = sqliteTable("exports", {
  id: text("id").primaryKey(),
  bookletId: requiredText("booklet_id").references(() => booklets.id),
  artifactVersionId: requiredText("artifact_version_id").references(() => artifactVersions.id),
  status: requiredText("status"),
  assetId: text("asset_id").references(() => assets.id),
  pageAssetIdsJson: requiredText("page_asset_ids_json"),
  preflightJson: text("preflight_json"),
  errorJson: text("error_json"),
  createdAtMs: timestamp("created_at_ms"),
  updatedAtMs: timestamp("updated_at_ms"),
});
