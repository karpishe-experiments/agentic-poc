import path from "node:path";
import { access } from "node:fs/promises";
import type { MongoDatabaseContext } from "@/db/client";
import { verifyMongoStructure } from "@/db/setup";
import { AGENT_SEED_SKILL_IDS } from "@/db/agent-defaults";

const parseArray = (value: string, label: string): string[] => { const parsed = JSON.parse(value) as unknown; if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) throw new Error(`${label} must be a serialized string array.`); return parsed; };
const requireIds = (known: Set<string>, ids: Array<string | null | undefined>, label: string) => { const missing = ids.filter((id): id is string => Boolean(id) && !known.has(id!)); if (missing.length) throw new Error(`${label} contains missing references: ${missing.slice(0, 5).join(", ")}.`); };

export type MongoVerification = { counts: Record<string, number>; unresolvedAssetUris: string[] };

/** Verify the Dify profile without requiring the legacy application's agent seeds. */
export async function verifyExperimentData(context: MongoDatabaseContext): Promise<void> {
  const c = context.collections;
  const [runs, operations, delegations, booklets, artifacts, versions, approvals, messages] = await Promise.all([
    c.experiment_runs.find().toArray(), c.experiment_operations.find().toArray(),
    c.experiment_delegations.find().toArray(), c.booklets.find().toArray(),
    c.artifacts.find().toArray(), c.artifact_versions.find().toArray(),
    c.approvals.find({ experimentRunId: { $exists: true } }).toArray(),
    c.messages.find({ experimentRunId: { $exists: true } }).toArray(),
  ]);
  const runById = new Map(runs.map((row) => [row._id, row]));
  const operationById = new Map(operations.map((row) => [row._id, row]));
  const delegationById = new Map(delegations.map((row) => [row._id, row]));
  const bookletById = new Map(booklets.map((row) => [row._id, row]));
  const artifactById = new Map(artifacts.map((row) => [row._id, row]));
  const versionById = new Map(versions.map((row) => [row._id, row]));
  for (const run of runs) {
    const booklet = bookletById.get(run.bookletId);
    if (booklet?.executionProfile !== "dify_booklet_v1" || booklet.experimentRunId !== run._id)
      throw new Error(`Experiment run ${run._id} has an incompatible booklet.`);
    if (run.predecessorRunId && !runById.has(run.predecessorRunId))
      throw new Error(`Experiment run ${run._id} has a missing predecessor.`);
    if (run.activeOperationId && operationById.get(run.activeOperationId)?.runId !== run._id)
      throw new Error(`Experiment run ${run._id} has an incompatible active operation.`);
    if (run.activeDelegationId && delegationById.get(run.activeDelegationId)?.runId !== run._id)
      throw new Error(`Experiment run ${run._id} has an incompatible active delegation.`);
  }
  for (const operation of operations) {
    if (!runById.has(operation.runId)) throw new Error(`Experiment operation ${operation._id} has a missing run.`);
    for (const id of [...operation.dependencyVersionIds, ...(operation.expectedTargetVersionId ? [operation.expectedTargetVersionId] : [])]) {
      const version = versionById.get(id);
      if (!version || artifactById.get(version.artifactId)?.experimentRunId !== operation.runId)
        throw new Error(`Experiment operation ${operation._id} has an incompatible artifact version.`);
    }
  }
  for (const delegation of delegations) {
    if (runById.get(delegation.runId)?.bookletId !== delegation.subjectId || operationById.get(delegation.testerDecisionId)?.runId !== delegation.runId || operationById.get(delegation.testerDecisionId)?.role !== "tester")
      throw new Error(`Experiment delegation ${delegation._id} has incompatible provenance.`);
    if (delegation.supersededById && delegationById.get(delegation.supersededById)?.runId !== delegation.runId)
      throw new Error(`Experiment delegation ${delegation._id} has an incompatible successor.`);
  }
  for (const artifact of artifacts.filter((row) => row.experimentRunId)) {
    if (runById.get(artifact.experimentRunId!)?.bookletId !== artifact.bookletId)
      throw new Error(`Experiment artifact ${artifact._id} has an incompatible run.`);
  }
  for (const version of versions.filter((row) => row.sourceOperationId)) {
    if (operationById.get(version.sourceOperationId!)?.runId !== artifactById.get(version.artifactId)?.experimentRunId)
      throw new Error(`Experiment version ${version._id} has incompatible operation provenance.`);
  }
  for (const approval of approvals) {
    const artifact = artifactById.get(versionById.get(approval.artifactVersionId)?.artifactId ?? "");
    if (!artifact || artifact.experimentRunId !== approval.experimentRunId || artifact.bookletId !== approval.bookletId || operationById.get(approval.testerDecisionId ?? "")?.role !== "tester" || operationById.get(approval.testerDecisionId ?? "")?.runId !== approval.experimentRunId)
      throw new Error(`Experiment approval ${approval._id} has incompatible provenance.`);
    if (approval.delegationId && delegationById.get(approval.delegationId)?.runId !== approval.experimentRunId)
      throw new Error(`Experiment approval ${approval._id} has an incompatible delegation.`);
  }
  for (const message of messages) {
    if (runById.get(message.experimentRunId!)?.bookletId !== message.bookletId || operationById.get(message.operationId ?? "")?.runId !== message.experimentRunId)
      throw new Error(`Experiment message ${message._id} has incompatible provenance.`);
  }
}

export async function verifyMongoData(context: MongoDatabaseContext, dataRoot?: string): Promise<MongoVerification> {
  await verifyMongoStructure(context); await verifyExperimentData(context); const c = context.collections;
  const [booklets, artifacts, versions, dependencies, messages, cards, responses, assets, styles, jobs, items, calls, definitions, agentVersions, agentEvents, reviews, approvals, exportsRows, executionPreferences, executionBatches, executionItems] = await Promise.all([
    c.booklets.find().toArray(), c.artifacts.find().toArray(), c.artifact_versions.find().toArray(), c.artifact_dependencies.find().toArray(), c.messages.find().toArray(), c.cards.find().toArray(), c.card_responses.find().toArray(), c.assets.find().toArray(), c.style_catalog.find().toArray(), c.generation_jobs.find().toArray(), c.generation_items.find().toArray(), c.model_calls.find().toArray(), c.agent_definitions.find().toArray(), c.agent_versions.find().toArray(), c.agent_version_events.find().toArray(), c.quality_reviews.find().toArray(), c.approvals.find().toArray(), c.exports.find().toArray(), c.execution_preferences.find().toArray(), c.execution_batches.find().toArray(), c.execution_items.find().toArray(),
  ]);
  const sets = { booklets: new Set(booklets.map((x) => x._id)), artifacts: new Set(artifacts.map((x) => x._id)), versions: new Set(versions.map((x) => x._id)), messages: new Set(messages.map((x) => x._id)), cards: new Set(cards.map((x) => x._id)), responses: new Set(responses.map((x) => x._id)), assets: new Set(assets.map((x) => x._id)), jobs: new Set(jobs.map((x) => x._id)), definitions: new Set(definitions.map((x) => x._id)), agentVersions: new Set(agentVersions.map((x) => x._id)), reviews: new Set(reviews.map((x) => x._id)), approvals: new Set(approvals.map((x) => x._id)), executionBatches: new Set(executionBatches.map((x) => x._id)), executionItems: new Set(executionItems.map((x) => x._id)) };
  requireIds(sets.assets, booklets.map((x) => x.coverAssetId), "booklets.coverAssetId");
  requireIds(sets.booklets, [...artifacts.map((x) => x.bookletId), ...messages.map((x) => x.bookletId), ...cards.map((x) => x.bookletId), ...jobs.map((x) => x.bookletId), ...calls.map((x) => x.bookletId), ...reviews.map((x) => x.bookletId), ...approvals.map((x) => x.bookletId), ...exportsRows.map((x) => x.bookletId), ...assets.map((x) => x.bookletId), ...executionPreferences.map((x) => x.bookletId), ...executionBatches.map((x) => x.bookletId)], "booklet references");
  const storedDependencyIds = versions.flatMap((version) => parseArray(version.dependencyVersionIdsJson, `artifact version ${version._id} dependencyVersionIdsJson`));
  requireIds(sets.versions, [...artifacts.map((x) => x.currentVersionId), ...versions.map((x) => x.sourceVersionId), ...dependencies.flatMap((x) => [x.downstreamVersionId, x.upstreamVersionId]), ...storedDependencyIds, ...calls.map((x) => x.artifactVersionId), ...approvals.map((x) => x.artifactVersionId), ...exportsRows.map((x) => x.artifactVersionId)], "artifact-version references");
  requireIds(sets.artifacts, [...versions.map((x) => x.artifactId), ...cards.map((x) => x.artifactId)], "artifact references");
  for (const artifact of artifacts) if (artifact.currentVersionId) { const version = versions.find((x) => x._id === artifact.currentVersionId); if (!version || version.artifactId !== artifact._id) throw new Error(`Artifact ${artifact._id} points to an incompatible current version.`); }
  requireIds(sets.messages, [...cards.map((x) => x.messageId), ...responses.map((x) => x.followupMessageId)], "message references"); requireIds(sets.cards, [...responses.map((x) => x.cardId), ...executionBatches.map((x) => x.cardId)], "card references");
  requireIds(sets.assets, [...assets.map((x) => x.sourceAssetId), ...styles.map((x) => x.previewAssetId), ...items.map((x) => x.assetId), ...exportsRows.flatMap((x) => [x.assetId, ...parseArray(x.pageAssetIdsJson, `export ${x._id} pageAssetIdsJson`)])], "asset references");
  requireIds(sets.jobs, [...items.map((x) => x.jobId), ...calls.map((x) => x.jobId)], "job references"); requireIds(sets.definitions, [...agentVersions.map((x) => x.agentId), ...agentEvents.map((x) => x.agentId), ...calls.map((x) => x.agentDefinitionId)], "agent definition references"); requireIds(sets.agentVersions, [...agentVersions.map((x) => x.parentVersionId), ...agentEvents.map((x) => x.agentVersionId), ...calls.map((x) => x.agentVersionId), ...executionItems.map((x) => x.agentVersionId)], "agent-version references"); requireIds(sets.executionBatches, executionItems.map((x) => x.batchId), "execution-batch references");
  requireIds(sets.responses, approvals.map((x) => x.cardResponseId), "approval response references"); requireIds(sets.reviews, approvals.map((x) => x.qualityReviewId), "approval review references"); requireIds(sets.approvals, approvals.map((x) => x.sourceApprovalId), "source approval references");
  for (const review of reviews) { requireIds(sets.versions, parseArray(review.artifactVersionIdsJson, `review ${review._id} artifactVersionIdsJson`), "quality-review artifact versions"); if (review.repairVersionIdsJson) requireIds(sets.versions, parseArray(review.repairVersionIdsJson, `review ${review._id} repairVersionIdsJson`), "quality-review repair versions"); JSON.parse(review.issuesJson); }
  const artifactById = new Map(artifacts.map((row) => [row._id, row])), versionById = new Map(versions.map((row) => [row._id, row])), messageById = new Map(messages.map((row) => [row._id, row])), cardById = new Map(cards.map((row) => [row._id, row])), jobById = new Map(jobs.map((row) => [row._id, row]));
  for (const card of cards) {
    if (card.messageId && messageById.get(card.messageId)?.bookletId !== card.bookletId) throw new Error(`Card ${card._id} references a message from another booklet.`);
    if (card.artifactId && artifactById.get(card.artifactId)?.bookletId !== card.bookletId) throw new Error(`Card ${card._id} references an artifact from another booklet.`);
  }
  for (const response of responses) { const card = cardById.get(response.cardId); if (response.followupMessageId && messageById.get(response.followupMessageId)?.bookletId !== card?.bookletId) throw new Error(`Card response ${response._id} references a follow-up message from another booklet.`); }
  for (const item of items) if (!jobById.has(item.jobId)) throw new Error(`Generation item ${item._id} references an incompatible job.`);
  for (const approval of approvals) { const version = versionById.get(approval.artifactVersionId), artifact = version ? artifactById.get(version.artifactId) : undefined; if (artifact?.bookletId !== approval.bookletId) throw new Error(`Approval ${approval._id} references a version from another booklet.`); }
  for (const exported of exportsRows) { const version = versionById.get(exported.artifactVersionId), artifact = version ? artifactById.get(version.artifactId) : undefined; if (artifact?.bookletId !== exported.bookletId) throw new Error(`Export ${exported._id} references a version from another booklet.`); }
  for (const call of calls) { if (call.artifactVersionId) { const version = versionById.get(call.artifactVersionId), artifact = version ? artifactById.get(version.artifactId) : undefined; if (artifact?.bookletId !== call.bookletId) throw new Error(`Model call ${call._id} references a version from another booklet.`); } if (call.jobId && jobById.get(call.jobId)?.bookletId !== call.bookletId) throw new Error(`Model call ${call._id} references a job from another booklet.`); }
  const managers = agentVersions.filter((x) => x.isActive && x.role === "manager"); const specialists = agentVersions.filter((x) => x.isActive && x.role === "specialist"); const imageTargets = new Set(agentVersions.filter((x) => x.isActive && x.role === "image" && x.profileId && x.profileVersion).map((x) => x.imageTarget));
  if (managers.length !== 1 || new Set(specialists.map((x) => x.skillId)).size !== AGENT_SEED_SKILL_IDS.length || specialists.some((x) => !x.skillId || !AGENT_SEED_SKILL_IDS.includes(x.skillId as never) || !x.profileId || !x.profileVersion) || !imageTargets.has("reference") || !imageTargets.has("page")) throw new Error("Active runtime-agent coverage must contain one manager and at least one profiled candidate for every registered specialist and image target.");
  const unresolvedAssetUris: string[] = []; if (dataRoot) {
    const root = path.resolve(dataRoot);
    for (const asset of assets) {
      const resolved = path.resolve(root, ...asset.uri.split("/"));
      if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) { unresolvedAssetUris.push(asset.uri); continue; }
      try { await access(resolved); } catch { unresolvedAssetUris.push(asset.uri); }
    }
  }
  const counts: Record<string, number> = {}; for (const [name, collection] of Object.entries(c)) counts[name] = await collection.countDocuments();
  return { counts, unresolvedAssetUris };
}
