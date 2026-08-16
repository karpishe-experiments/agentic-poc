import path from "node:path";
import { access, readFile } from "node:fs/promises";
import type { MongoDatabaseContext } from "@/db/client";
import { verifyMongoStructure } from "@/db/setup";
import { AGENT_SEED_SKILL_IDS } from "@/db/agent-defaults";
import { COLLECTION_NAMES } from "@/db/documents";

const parseArray = (value: string, label: string): string[] => { const parsed = JSON.parse(value) as unknown; if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) throw new Error(`${label} must be a serialized string array.`); return parsed; };
const requireIds = (known: Set<string>, ids: Array<string | null | undefined>, label: string) => { const missing = ids.filter((id): id is string => Boolean(id) && !known.has(id!)); if (missing.length) throw new Error(`${label} contains missing references: ${missing.slice(0, 5).join(", ")}.`); };

export type MongoVerification = { counts: Record<string, number>; unresolvedAssetUris: string[] };

export async function reconcileMigrationReport(reportFilename: string, databaseName: string, counts: Record<string, number>): Promise<void> {
  const reportPath = path.resolve(reportFilename);
  const report = JSON.parse(await readFile(reportPath, "utf8")) as { status?: string; manifestPath?: string; target?: { databaseName?: string }; source?: { path?: string; sha256?: string }; collections?: Record<string, { target?: number }> };
  if (report.status !== "passed" || report.target?.databaseName !== databaseName || !report.manifestPath || !report.source?.path || !report.source.sha256) throw new Error("The supplied migration report is not a passed report for this database.");
  const manifestPath = path.isAbsolute(report.manifestPath) ? report.manifestPath : path.resolve(path.dirname(reportPath), report.manifestPath);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { source?: { path?: string; sha256?: string } };
  if (manifest.source?.path !== report.source.path || manifest.source.sha256 !== report.source.sha256) throw new Error("The migration report and manifest source identities do not match.");
  for (const name of COLLECTION_NAMES) if (report.collections?.[name]?.target !== counts[name]) throw new Error(`The migration report no longer reconciles collection ${name}.`);
}

export async function verifyMongoData(context: MongoDatabaseContext, dataRoot?: string): Promise<MongoVerification> {
  await verifyMongoStructure(context); const c = context.collections;
  const [booklets, artifacts, versions, dependencies, messages, cards, responses, assets, styles, jobs, items, calls, definitions, agentVersions, agentEvents, reviews, approvals, exportsRows] = await Promise.all([
    c.booklets.find().toArray(), c.artifacts.find().toArray(), c.artifact_versions.find().toArray(), c.artifact_dependencies.find().toArray(), c.messages.find().toArray(), c.cards.find().toArray(), c.card_responses.find().toArray(), c.assets.find().toArray(), c.style_catalog.find().toArray(), c.generation_jobs.find().toArray(), c.generation_items.find().toArray(), c.model_calls.find().toArray(), c.agent_definitions.find().toArray(), c.agent_versions.find().toArray(), c.agent_version_events.find().toArray(), c.quality_reviews.find().toArray(), c.approvals.find().toArray(), c.exports.find().toArray(),
  ]);
  const sets = { booklets: new Set(booklets.map((x) => x._id)), artifacts: new Set(artifacts.map((x) => x._id)), versions: new Set(versions.map((x) => x._id)), messages: new Set(messages.map((x) => x._id)), cards: new Set(cards.map((x) => x._id)), responses: new Set(responses.map((x) => x._id)), assets: new Set(assets.map((x) => x._id)), jobs: new Set(jobs.map((x) => x._id)), definitions: new Set(definitions.map((x) => x._id)), agentVersions: new Set(agentVersions.map((x) => x._id)), reviews: new Set(reviews.map((x) => x._id)), approvals: new Set(approvals.map((x) => x._id)) };
  requireIds(sets.assets, booklets.map((x) => x.coverAssetId), "booklets.coverAssetId");
  requireIds(sets.booklets, [...artifacts.map((x) => x.bookletId), ...messages.map((x) => x.bookletId), ...cards.map((x) => x.bookletId), ...jobs.map((x) => x.bookletId), ...calls.map((x) => x.bookletId), ...reviews.map((x) => x.bookletId), ...approvals.map((x) => x.bookletId), ...exportsRows.map((x) => x.bookletId), ...assets.map((x) => x.bookletId)], "booklet references");
  requireIds(sets.versions, [...artifacts.map((x) => x.currentVersionId), ...versions.map((x) => x.sourceVersionId), ...dependencies.flatMap((x) => [x.downstreamVersionId, x.upstreamVersionId]), ...calls.map((x) => x.artifactVersionId), ...approvals.map((x) => x.artifactVersionId), ...exportsRows.map((x) => x.artifactVersionId)], "artifact-version references");
  requireIds(sets.artifacts, [...versions.map((x) => x.artifactId), ...cards.map((x) => x.artifactId)], "artifact references");
  for (const artifact of artifacts) if (artifact.currentVersionId) { const version = versions.find((x) => x._id === artifact.currentVersionId); if (!version || version.artifactId !== artifact._id) throw new Error(`Artifact ${artifact._id} points to an incompatible current version.`); }
  requireIds(sets.messages, [...cards.map((x) => x.messageId), ...responses.map((x) => x.followupMessageId)], "message references"); requireIds(sets.cards, responses.map((x) => x.cardId), "card references");
  requireIds(sets.assets, [...assets.map((x) => x.sourceAssetId), ...styles.map((x) => x.previewAssetId), ...items.map((x) => x.assetId), ...exportsRows.flatMap((x) => [x.assetId, ...parseArray(x.pageAssetIdsJson, `export ${x._id} pageAssetIdsJson`)])], "asset references");
  requireIds(sets.jobs, [...items.map((x) => x.jobId), ...calls.map((x) => x.jobId)], "job references"); requireIds(sets.definitions, [...agentVersions.map((x) => x.agentId), ...agentEvents.map((x) => x.agentId), ...calls.map((x) => x.agentDefinitionId)], "agent definition references"); requireIds(sets.agentVersions, [...agentVersions.map((x) => x.parentVersionId), ...agentEvents.map((x) => x.agentVersionId), ...calls.map((x) => x.agentVersionId)], "agent-version references");
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
  const managers = agentVersions.filter((x) => x.isActive && x.role === "manager"); const specialists = agentVersions.filter((x) => x.isActive && x.role === "specialist");
  if (managers.length !== 1 || specialists.length !== AGENT_SEED_SKILL_IDS.length || new Set(specialists.map((x) => x.skillId)).size !== AGENT_SEED_SKILL_IDS.length || specialists.some((x) => !x.skillId || !AGENT_SEED_SKILL_IDS.includes(x.skillId as never))) throw new Error("Active runtime-agent coverage must contain one manager and every registered specialist exactly once.");
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
