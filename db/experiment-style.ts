import { hasExperimentImagePolicy } from "@/db/experiment-m4-state";
import { createHash, randomUUID } from "node:crypto";
import type { ClientSession } from "mongodb";
import { z } from "zod";
import { withMongoTransaction, type Database } from "@/db/client";
import { assertCurrentImageSources } from "@/db/experiment-images";
import { ExperimentRepositoryError } from "@/db/experiment-repository";
import { opaqueIdSchema } from "@/lib/contracts/common";
import { experimentImageRequestSchema, imageRequestFingerprint } from "@/lib/contracts/experiment-image";
import { parseReferenceProposal } from "@/lib/contracts/experiment-references";
import { styleSampleRequests, type StyleSampleSources } from "@/lib/experiment-runner/reference-requests";
import type { AssetStore } from "@/lib/assets/asset-store";
import type { VerificationAttempt } from "@/lib/experiment-runner/verification-attempt";
import { verificationMetadata, type VerificationMetadata } from "@/db/experiment-verification-metadata";

const inputSchema = z.strictObject({ runId: opaqueIdSchema, draftStyleVersionId: opaqueIdSchema,
  sampleOperationIds: z.array(opaqueIdSchema).length(2).refine((ids) => new Set(ids).size === 2) });
const tasks = ["J01", "J02", "J05", "J06", "J07"] as const;
const canonical = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) =>
  item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
function conflict(message: string): never { throw new ExperimentRepositoryError("conflict", message); }
function invalid(message: string, cause?: unknown): never { throw new ExperimentRepositoryError("invalid_state", message, undefined, { cause }); }
function json(raw: string | null | undefined): unknown {
  try { return JSON.parse(raw ?? ""); } catch { return invalid("Saved style evidence is malformed."); }
}

// Application-only materialization. This service neither generates images nor
// grants approval. Dispatch admission and creator acceptance are separate gates.
export function createExperimentStyleAssembly(input: { database: Database; store: AssetStore; now?: () => number }) {
  const { database, store } = input;
  const now = input.now ?? Date.now;

  async function load(value: z.infer<typeof inputSchema>, session: ClientSession, verificationOnly = false, metadata?: VerificationMetadata) {
    const options = { session };
    const run = metadata?.run ?? await database.collections.experiment_runs.findOne({ _id: value.runId }, options);
    if (!run) throw new ExperimentRepositoryError("not_found", "Style run was not found.");
    // The original authenticated callback can precede terminal publication GET.
    // Only the exact dispatched unknown claim may read its current sources;
    // completed source images and subsequent dispatch still require publication.
    const recovered = verificationOnly && run.status === "blocked" && run.safeFailure === "unknown_outcome" && run.activeOperationId
      ? await database.collections.experiment_operations.findOne({ _id: run.activeOperationId, runId: run._id,
        state: "unknown", safeFailure: "unknown_outcome", reservationCount: 1,
        mode: run.mode, providerKind: "text", dispatchStartedAtMs: { $ne: null }, workflowRunId: { $ne: null },
        $or: [{ role: "specialist", taskId: "J11", subjectKind: "book", subjectId: run.bookletId },
          { role: "specialist", taskId: "J12", subjectKind: "page", providerKind: "text" },
          { role: "tester", taskId: null, subjectKind: "book", subjectId: run.bookletId },
          { role: "judge", taskId: null, subjectKind: "book", subjectId: run.bookletId, providerKind: "text" },
          { role: "manager", taskId: null, subjectKind: "book", subjectId: run.bookletId, providerKind: "text" }] }, options) : null;
    // The original image callback can arrive before publication GET readback.
    // Permit source reads for that exact claimed unknown J13 operation only;
    // assembly mutations and later publication/approval checks remain unchanged.
    const imageOperationId = run.activeOperationId ?? run.imageReplacementParking?.operationId;
    const recoveredImage = verificationOnly && run.status === "blocked" && run.safeFailure === "unknown_outcome" && imageOperationId
      ? await database.collections.experiment_operations.findOne({ _id: imageOperationId, runId: run._id,
        role: "image", taskId: "J13", subjectKind: "page", providerKind: "image", mode: run.mode,
        state: "unknown", safeFailure: "unknown_outcome", reservationCount: 1, workflowRunId: { $ne: null },
        parentWorkflowRunId: { $ne: null }, imageRequestJson: { $ne: null } }, options) : null;
    if ((run.mode !== "simulated" && !hasExperimentImagePolicy(run)) || (!recovered && !recoveredImage && !["queued", "running", "paused", ...(verificationOnly ? ["completed"] : [])].includes(run.status)) ||
        (!verificationOnly && run.activeOperationId)) invalid("Style assembly requires idle work with a simulated image policy.");
    const draft = metadata ? metadata.versions.find((item) => item._id === value.draftStyleVersionId) : await database.collections.artifact_versions.findOne({ _id: value.draftStyleVersionId }, options);
    if (!draft) invalid("Style draft was not found.");
    const artifact = metadata ? metadata.artifacts.find((item) => item._id === draft.artifactId) : await database.collections.artifacts.findOne({ _id: draft.artifactId }, options);
    if (!artifact || artifact.bookletId !== run.bookletId || artifact.experimentRunId !== run._id ||
      artifact.taskId !== "J08" || artifact.subjectKind !== "book" || artifact.subjectId !== run.bookletId || !artifact.currentVersionId) invalid("Style draft belongs to another target.");
    const current = metadata ? metadata.versions.find((item) => item._id === artifact.currentVersionId && item.artifactId === artifact._id) : await database.collections.artifact_versions.findOne({ _id: artifact.currentVersionId, artifactId: artifact._id }, options);
    if (!current || artifact.state === "needs_review" || artifact.state === "rejected") conflict("Style target is stale.");
    if (current._id === draft._id ? artifact.state !== "draft" : current.sourceVersionId !== draft._id || current.createdBy !== "application") conflict("Style draft is no longer the assembly target.");
    const proposal = parseReferenceProposal("J08", "proposal", json(draft.contentJson)).content;
    const versions: string[] = [];
    const narrativeSources = metadata ? metadata.artifacts.filter((item) => item.subjectKind === "book" && item.subjectId === run.bookletId && tasks.includes(item.taskId as typeof tasks[number])) : await database.collections.artifacts.find({ bookletId: run.bookletId,
      experimentRunId: run._id, taskId: { $in: [...tasks] }, subjectKind: "book", subjectId: run.bookletId }, options).toArray();
    for (const taskId of tasks) {
      const sources = narrativeSources.filter((source) => source.taskId === taskId);
      if (sources.length !== 1 || sources[0].state !== "approved" || !sources[0].currentVersionId) conflict("Style narrative sources are not current and approved.");
      versions.push(sources[0].currentVersionId);
    }
    if (canonical(json(draft.dependencyVersionIdsJson)) !== canonical(versions)) conflict("Style draft sources changed.");
    const sources: StyleSampleSources = { draftStyleVersionId: draft._id, conceptVersionId: versions[0], outlineVersionId: versions[1],
      manuscriptVersionId: versions[2], finalCharactersVersionId: versions[3], finalLocationsVersionId: versions[4] };
    const expected = styleSampleRequests(proposal, sources);
    // D is deliberately retained inside A. On a replay it is no longer current;
    // check its child identity above and the five current approved narrative inputs.
    await assertCurrentImageSources(database, session, run, {
      kind: "style_preview", prompt: "Assembly source check", styleVersionId: null, sourceVersionIds: versions,
    }, metadata);
    const operations = metadata ? metadata.operations.filter((item) => value.sampleOperationIds.includes(item._id)) : await database.collections.experiment_operations.find({ _id: { $in: value.sampleOperationIds }, runId: run._id }, options).toArray();
    if (operations.length !== 2) invalid("Both saved sample operations are required.");
    const sampleAssets = metadata ? metadata.assets.filter((item) => value.sampleOperationIds.includes(item._id)) : await database.collections.assets.find({ _id: { $in: value.sampleOperationIds }, bookletId: run.bookletId }, options).toArray();
    const samples = [];
    const assets = [];
    const { samplePlan, ...definition } = proposal;
    for (const slot of expected) {
      const fingerprint = imageRequestFingerprint(slot.request);
      const operation = operations.find((item) => item.inputFingerprint === fingerprint);
      if (!operation || operation.role !== "image" || operation.providerKind !== "image" || operation.taskId !== "J08" ||
        operation.subjectKind !== "book" || operation.subjectId !== run.bookletId || operation.mode !== run.mode ||
        operation.state !== "succeeded" || operation.reservationCount !== 1 || !operation.workflowRunId || operation.imageCompletionClaim) invalid("Sample operation is not a completed authorized J08 image.");
      if (verificationOnly && !operation.verifiedWorkflowId) invalid("Style approval requires verified image publication.");
      const request = experimentImageRequestSchema.parse(json(operation.imageRequestJson));
      if (canonical(request) !== canonical(slot.request) || canonical(operation.dependencyVersionIds) !== canonical(request.sourceVersionIds)) conflict("Sample request differs from its saved style slot.");
      const asset = sampleAssets.find((item) => item._id === operation._id);
      if (!asset || asset.kind !== "style_preview" || !asset.width || !asset.height) invalid("Saved style sample asset is missing.");
      const metadata = z.object({ sha256: z.string().regex(/^[a-f0-9]{64}$/), byteLength: z.number().int().positive(),
        operationId: opaqueIdSchema, attempt: z.number().int().positive(), workflowRunId: opaqueIdSchema,
        parentWorkflowRunId: opaqueIdSchema.nullable(), inputFingerprint: z.string(),
        sourceVersionIds: z.array(opaqueIdSchema), request: experimentImageRequestSchema }).parse(json(asset.metadataJson));
      const extensions: Record<string, string | undefined> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
      const extension = extensions[asset.mimeType];
      const uri = `experiments/${run.bookletId}/${run._id}/${operation._id}/attempt-${operation.attempt}/image.${extension}`;
      const result = { assetId: asset._id, sha256: metadata.sha256, uri: asset.uri };
      if (!extension || asset.uri !== uri || metadata.operationId !== operation._id || metadata.attempt !== operation.attempt ||
        metadata.workflowRunId !== operation.workflowRunId || metadata.parentWorkflowRunId !== operation.parentWorkflowRunId ||
        metadata.inputFingerprint !== fingerprint || canonical(metadata.request) !== canonical(request) ||
        canonical(metadata.sourceVersionIds) !== canonical(request.sourceVersionIds) || operation.resultDigest !== metadata.sha256 ||
        operation.imageCompletionDigest !== metadata.sha256 || canonical(json(operation.resultJson)) !== canonical(result) ||
        canonical(json(operation.materializationJson)) !== canonical(result)) conflict("Saved sample lineage is inconsistent.");
      samples.push({ ...samplePlan.find((item) => item.sampleKey === slot.sampleKey)!, build: {
        prompt: request.prompt, stylePromptModuleHash: proposal.stylePromptModuleHash,
        operationId: operation._id, assetId: asset._id, sourceVersionIds: request.sourceVersionIds,
      } });
      assets.push({ assetId: asset._id, uri: asset.uri, sha256: metadata.sha256, byteLength: metadata.byteLength });
    }
    const assembled = parseReferenceProposal("J08", "assembled", { ...definition, draftStyleVersionId: draft._id, samples });
    if (current._id !== draft._id) {
      if (canonical(json(current.contentJson)) !== canonical(assembled.content) ||
        canonical(json(current.dependencyVersionIdsJson)) !== canonical([draft._id, ...versions])) conflict("Existing style assembly uses different sample evidence.");
      const edges = metadata ? metadata.edges.filter((item) => item.downstreamVersionId === current._id) : await database.collections.artifact_dependencies.find({ downstreamVersionId: current._id }, options).toArray();
      if (canonical(edges.map((edge) => edge.upstreamVersionId).sort()) !== canonical([draft._id, ...versions].sort())) conflict("Saved style assembly dependencies are incomplete.");
    }
    return { run, artifact, draft, current, assets, assembled, sources: [draft._id, ...versions] };
  }

  async function assemble(raw: unknown) {
    const value = inputSchema.parse(raw);
    const initial = await withMongoTransaction(database, (session) => load(value, session));
    for (const asset of initial.assets) {
      try {
        if (!await store.exists(asset.uri)) invalid("Saved style sample bytes are missing.");
        const bytes = await store.get(asset.uri);
        if (bytes.byteLength !== asset.byteLength || createHash("sha256").update(bytes).digest("hex") !== asset.sha256) invalid("Saved style sample bytes are corrupt.");
      } catch (cause) { invalid("Style sample storage verification failed.", cause); }
    }
    return withMongoTransaction(database, async (session) => {
      const checked = await load(value, session);
      if (canonical(checked.assets) !== canonical(initial.assets)) conflict("Sample storage identity changed during assembly.");
      if (checked.current._id !== checked.draft._id) return { reused: true, version: checked.current };
      const timestamp = now();
      const version = { _id: randomUUID(), artifactId: checked.artifact._id, versionNumber: checked.draft.versionNumber + 1,
        schemaVersion: "2", contentJson: canonical(checked.assembled.content), dependencyVersionIdsJson: canonical(checked.sources),
        createdBy: "application", sourceVersionId: checked.draft._id, sourceExecutionBatchId: null,
        warningsJson: canonical([...z.array(z.object({ field: z.string(), message: z.string() })).parse(json(checked.draft.warningsJson ?? "[]")),
          ...checked.assembled.warnings]), createdAtMs: timestamp };
      await database.collections.artifact_versions.insertOne(version, { session });
      await database.collections.artifact_dependencies.insertMany(checked.sources.map((upstreamVersionId) => ({
        _id: randomUUID(), downstreamVersionId: version._id, upstreamVersionId, createdAtMs: timestamp,
      })), { session });
      const changed = await database.collections.artifacts.updateOne({ _id: checked.artifact._id,
        currentVersionId: checked.draft._id, state: "draft" }, { $set: { currentVersionId: version._id, updatedAtMs: timestamp } }, { session });
      if (changed.modifiedCount !== 1) conflict("Style target changed during assembly.");
      const runChanged = await database.collections.experiment_runs.updateOne({ _id: checked.run._id, revision: checked.run.revision,
        activeOperationId: null }, { $inc: { revision: 1 }, $set: { updatedAtMs: timestamp } }, { session });
      if (runChanged.modifiedCount !== 1) conflict("Style run changed during assembly.");
      return { reused: false, version };
    });
  }
  async function verifyVersion(identity: { runId: string; versionId: string }, session: ClientSession,
    verification?: { verifyBytes?: boolean; attempt?: VerificationAttempt }) {
    const versionId = opaqueIdSchema.parse(identity.versionId);
    const metadata = verification?.attempt ? await verificationMetadata(database, session, opaqueIdSchema.parse(identity.runId), verification.attempt) : undefined;
    const version = metadata ? metadata.versions.find((item) => item._id === versionId) : await database.collections.artifact_versions.findOne({ _id: versionId }, { session });
    const artifact = version ? (metadata ? metadata.artifacts.find((item) => item._id === version.artifactId) : await database.collections.artifacts.findOne({ _id: version.artifactId }, { session })) : null;
    if (!version || !artifact || artifact.currentVersionId !== version._id || artifact.taskId !== "J08" ||
        version.createdBy !== "application" || !version.sourceVersionId || artifact.state !== "approved") invalid("Current assembled style approval is missing.");
    const content = parseReferenceProposal("J08", "assembled", json(version.contentJson)).content;
    const checked = await load({ runId: opaqueIdSchema.parse(identity.runId), draftStyleVersionId: version.sourceVersionId,
      sampleOperationIds: content.samples.map((sample) => sample.build.operationId) }, session, true, metadata);
    if (checked.current._id !== version._id) conflict("Style approval target changed.");
    if (verification?.verifyBytes === false) return;
    for (const asset of checked.assets) {
      try {
        const bytes = verification?.attempt ? await verification.attempt.read(asset) : await store.get(asset.uri);
        if (bytes.byteLength !== asset.byteLength || createHash("sha256").update(bytes).digest("hex") !== asset.sha256) invalid("Saved style sample bytes are corrupt.");
      } catch (cause) { invalid("Style sample storage verification failed.", cause); }
    }
  }
  return { assemble, verifyVersion };
}
