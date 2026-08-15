import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
});

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
