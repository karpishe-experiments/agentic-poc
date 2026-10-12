import { randomUUID } from "node:crypto";
import { withMongoTransaction, type Database } from "@/db/client";
import type { ExecutionBatchDocument, ExecutionItemDocument } from "@/db/documents";
import { genUICardSchema, type GenUICard } from "@/lib/contracts/cards";
import { executionBatchSchema, executionItemSchema, executionPreferenceSchema, type ExecutionBatch, type ExecutionItem, type ExecutionTargetKey } from "@/lib/contracts/execution";

const iso = (value: number | null) => value === null ? null : new Date(value).toISOString();
const parse = (value: string) => JSON.parse(value) as unknown;
function replaceCardMessageProjection(messageJson: string, nextCard: unknown): string {
  const message = parse(messageJson);
  if (!message || typeof message !== "object" || !("parts" in message) || !Array.isArray(message.parts)) throw new Error("Saved card message is not a valid display projection.");
  return JSON.stringify({ ...message, parts: message.parts.map((part) => !part || typeof part !== "object" || !("type" in part) || part.type !== "data-card" || !("data" in part) ? part : genUICardSchema.parse(part.data).cardId === genUICardSchema.parse(nextCard).cardId ? { ...part, data: nextCard } : part) });
}
const toBatch = (row: ExecutionBatchDocument): ExecutionBatch => executionBatchSchema.parse({ id: row._id, bookletId: row.bookletId, cardId: row.cardId, targetKey: row.targetKey, subjectKind: row.subjectKind, subjectId: row.subjectId, previousBatchId: row.previousBatchId, poolFingerprint: row.poolFingerprint, status: row.status, materializationStatus: row.materializationStatus, materializationUnresolvedReason: row.materializationUnresolvedReason ?? null, materializationContinuationPending: row.materializationContinuationPending === true, resultChoicePolicy: row.resultChoicePolicy, canonicalInput: parse(row.canonicalInputJson), workflowFingerprint: parse(row.workflowFingerprintJson), schemaVersion: row.schemaVersion, selectedItemId: row.selectedItemId, selectionMode: row.selectionMode, selectionResponseId: row.selectionResponseId, producedArtifactVersionId: row.producedArtifactVersionId, producedQualityReviewId: row.producedQualityReviewId, producedAssetId: row.producedAssetId, queuedAt: new Date(row.queuedAtMs).toISOString(), startedAt: iso(row.startedAtMs), terminalAt: iso(row.terminalAtMs), completedAt: iso(row.completedAtMs), updatedAt: new Date(row.updatedAtMs).toISOString() });
const toItem = (row: ExecutionItemDocument): ExecutionItem => executionItemSchema.parse({ id: row._id, batchId: row.batchId, agentId: row.agentId, agentVersionId: row.agentVersionId, profileId: row.profileId, profileVersion: row.profileVersion, status: row.status, attemptCount: row.attemptCount, attempts: parse(row.attemptsJson), resultSummary: row.resultSummaryJson ? parse(row.resultSummaryJson) : null, canonicalResult: row.canonicalResultJson ? parse(row.canonicalResultJson) : null, candidateAssetId: row.candidateAssetId, safeError: row.safeErrorJson ? parse(row.safeErrorJson) : null, startedAt: iso(row.startedAtMs), finishedAt: iso(row.finishedAtMs), updatedAt: new Date(row.updatedAtMs).toISOString() });
export type ExecutionRepository = { getPreference(bookletId: string, targetKey: ExecutionTargetKey): Promise<string[] | null>; createBatch(input: { id: string; bookletId: string; cardId: string; targetKey: ExecutionTargetKey; subjectKind: string; subjectId: string; previousBatchId: string | null; poolFingerprint: string; canonicalInput: unknown; workflowFingerprint: unknown; schemaVersion: string; resultChoicePolicy: "implicit_sole" | "explicit"; selectedAgentIds: string[]; agents: Array<{ agentId: string; agentVersionId: string; profileId: string; profileVersion: number; agentSnapshot: unknown; profileSnapshot: unknown }>; now: number }): Promise<ExecutionBatch>; getBatch(id: string): Promise<ExecutionBatch | null>; getItems(batchId: string): Promise<ExecutionItem[]>; claimQueued(batchId: string, itemId: string, now: number): Promise<ExecutionItem | null>; finishItem(input: { batchId: string; itemId: string; result: unknown; summary: unknown; candidateAssetId?: string | null; now: number }): Promise<void>; failItem(input: { batchId: string; itemId: string; kind: string; message: string; now: number }): Promise<void>; recoverInterrupted(now: number): Promise<string[]>; retryFailed(batchId: string, now: number, options?: { allowUnknown?: boolean }): Promise<void>; markSelected(input: { batchId: string; itemId: string; responseId: string; mode: "implicit_sole" | "explicit"; ownerId: string; deadlineAtMs: number; expectedCard?: { bookletId: string; cardId: string; state: "running" | "results" }; now: number }): Promise<boolean>; completeMaterialization(input: { batchId: string; ownerId: string; deadlineAtMs: number; bookletId: string; card: Extract<GenUICard, { family: "agent_run" }>; expectedCard: { cardId: string; state: "running" }; artifactVersionId?: string | null; qualityReviewId?: string | null; assetId?: string | null; continuationPending?: boolean; now: number }): Promise<boolean>; acknowledgeMaterializationContinuation(input: { batchId: string; bookletId: string; cardId: string; selectedItemId: string; now: number }): Promise<boolean>; };
export function createExecutionRepository(database: Database): ExecutionRepository { const c = database.collections; return { async getPreference(bookletId, targetKey) { const row = await c.execution_preferences.findOne({ bookletId, targetKey }); return row ? executionPreferenceSchema.parse({ id: row._id, bookletId, targetKey, selectedAgentIds: parse(row.selectedAgentIdsJson), revision: row.revision, createdAt: new Date(row.createdAtMs).toISOString(), updatedAt: new Date(row.updatedAtMs).toISOString() }).selectedAgentIds : null; }, async createBatch(input) { await withMongoTransaction(database, async (session) => { await c.execution_preferences.updateOne({ bookletId: input.bookletId, targetKey: input.targetKey }, { $set: { selectedAgentIdsJson: JSON.stringify(input.selectedAgentIds), updatedAtMs: input.now }, $setOnInsert: { _id: randomUUID(), bookletId: input.bookletId, targetKey: input.targetKey, revision: 1, createdAtMs: input.now } }, { upsert: true, session }); await c.execution_batches.insertOne({ _id: input.id, bookletId: input.bookletId, cardId: input.cardId, targetKey: input.targetKey, subjectKind: input.subjectKind, subjectId: input.subjectId, previousBatchId: input.previousBatchId, poolFingerprint: input.poolFingerprint, status: "queued", materializationStatus: "idle", resultChoicePolicy: input.resultChoicePolicy, canonicalInputJson: JSON.stringify(input.canonicalInput), workflowFingerprintJson: JSON.stringify(input.workflowFingerprint), schemaVersion: input.schemaVersion, selectedItemId: null, selectionMode: null, selectionResponseId: null, producedArtifactVersionId: null, producedQualityReviewId: null, producedAssetId: null, queuedAtMs: input.now, startedAtMs: null, terminalAtMs: null, completedAtMs: null, updatedAtMs: input.now }, { session }); await c.execution_items.insertMany(input.agents.map((agent) => ({ _id: randomUUID(), batchId: input.id, agentId: agent.agentId, agentVersionId: agent.agentVersionId, profileId: agent.profileId, profileVersion: agent.profileVersion, agentSnapshotJson: JSON.stringify(agent.agentSnapshot), profileSnapshotJson: JSON.stringify(agent.profileSnapshot), status: "queued", attemptCount: 0, attemptsJson: "[]", resultSummaryJson: null, canonicalResultJson: null, candidateAssetId: null, safeErrorJson: null, startedAtMs: null, finishedAtMs: null, updatedAtMs: input.now })), { session }); }); return (await this.getBatch(input.id))!; }, async getBatch(id) { const row = await c.execution_batches.findOne({ _id: id }); return row ? toBatch(row) : null; }, async getItems(batchId) { return (await c.execution_items.find({ batchId }).sort({ agentId: 1 }).toArray()).map(toItem); }, async claimQueued(batchId, itemId, now) { const row = await c.execution_items.findOneAndUpdate({ _id: itemId, batchId, status: "queued" }, { $set: { status: "running", startedAtMs: now, updatedAtMs: now }, $inc: { attemptCount: 1 } }, { returnDocument: "after" }); if (row) await c.execution_batches.updateOne({ _id: batchId, status: "queued" }, { $set: { status: "running", startedAtMs: now, updatedAtMs: now } }); return row ? toItem(row) : null; }, async finishItem(input) { const row = await c.execution_items.findOne({ _id: input.itemId, batchId: input.batchId }); if (!row) return; const attempts = parse(row.attemptsJson) as unknown[]; attempts.push({ attempt: row.attemptCount, status: "succeeded", startedAt: iso(row.startedAtMs) ?? new Date(input.now).toISOString(), finishedAt: new Date(input.now).toISOString(), latencyMs: row.startedAtMs ? input.now - row.startedAtMs : 0, safeError: null, canonicalInputReference: null, nativeInputReference: null, nativeOutputReference: null, resultReference: { itemId: row._id } }); await c.execution_items.updateOne({ _id: row._id, status: "running" }, { $set: { status: "succeeded", attemptsJson: JSON.stringify(attempts), canonicalResultJson: JSON.stringify(input.result), resultSummaryJson: JSON.stringify(input.summary), candidateAssetId: input.candidateAssetId ?? null, finishedAtMs: input.now, updatedAtMs: input.now } }); const pending = await c.execution_items.countDocuments({ batchId: input.batchId, status: { $in: ["queued", "running"] } }); if (!pending) await c.execution_batches.updateOne({ _id: input.batchId }, { $set: { status: "results", terminalAtMs: input.now, updatedAtMs: input.now } }); }, async failItem(input) { const row = await c.execution_items.findOne({ _id: input.itemId, batchId: input.batchId }); if (!row) return; const attempts = parse(row.attemptsJson) as unknown[]; const error = { kind: input.kind, message: input.message }; attempts.push({ attempt: row.attemptCount, status: "failed", startedAt: iso(row.startedAtMs) ?? new Date(input.now).toISOString(), finishedAt: new Date(input.now).toISOString(), latencyMs: row.startedAtMs ? input.now - row.startedAtMs : 0, safeError: error, canonicalInputReference: null, nativeInputReference: null, nativeOutputReference: null, resultReference: null }); await c.execution_items.updateOne({ _id: row._id, status: "running" }, { $set: { status: "failed", attemptsJson: JSON.stringify(attempts), safeErrorJson: JSON.stringify(error), finishedAtMs: input.now, updatedAtMs: input.now } }); const pending = await c.execution_items.countDocuments({ batchId: input.batchId, status: { $in: ["queued", "running"] } }); if (!pending) await c.execution_batches.updateOne({ _id: input.batchId }, { $set: { status: "results", terminalAtMs: input.now, updatedAtMs: input.now } }); }, async recoverInterrupted(now) {
    const interrupted = { kind: "interrupted", message: "The prior process stopped before this candidate finished. Inspect saved output or retry it explicitly." };
    const notStarted = { kind: "interrupted", message: "The prior process stopped before this candidate started. Retry it explicitly." };
    const runningBatches = await c.execution_batches.find({ status: "running" }).toArray();
    const runningItems = await c.execution_items.find({ status: "running" }).toArray();
    for (const row of runningItems) {
      const attempts = parse(row.attemptsJson) as unknown[];
      attempts.push({ attempt: row.attemptCount, status: "failed", startedAt: iso(row.startedAtMs) ?? new Date(now).toISOString(), finishedAt: new Date(now).toISOString(), latencyMs: row.startedAtMs ? now - row.startedAtMs : 0, safeError: interrupted, canonicalInputReference: null, nativeInputReference: null, nativeOutputReference: null, resultReference: null });
      await c.execution_items.updateOne({ _id: row._id, status: "running" }, { $set: { status: "failed", attemptsJson: JSON.stringify(attempts), safeErrorJson: JSON.stringify(interrupted), finishedAtMs: now, updatedAtMs: now } });
    }
    const affectedBatchIds = [...new Set([...runningBatches.map((batch) => batch._id), ...runningItems.map((item) => item.batchId)])];
    for (const batchId of affectedBatchIds) {
      const queued = await c.execution_items.find({ batchId, status: "queued" }).toArray();
      for (const row of queued) await c.execution_items.updateOne({ _id: row._id, status: "queued" }, { $set: { status: "failed", safeErrorJson: JSON.stringify(notStarted), finishedAtMs: now, updatedAtMs: now } });
      await c.execution_batches.updateOne({ _id: batchId, status: { $in: ["queued", "running"] } }, { $set: { status: "results", terminalAtMs: now, updatedAtMs: now } });
    }
    const recoveredCompleted: string[] = [];
    const interruptedMaterializations = await c.execution_batches.find({ status: "materializing" }).toArray();
    for (const batch of interruptedMaterializations) {
      const cardRow = await c.cards.findOne({ _id: batch.cardId, bookletId: batch.bookletId });
      const savedItem = batch.selectedItemId ? await c.execution_items.findOne({ _id: batch.selectedItemId, batchId: batch._id, status: "succeeded", canonicalResultJson: { $ne: null } }) : null;
      const card = (() => { try { return cardRow ? genUICardSchema.parse(parse(cardRow.cardJson)) : null; } catch { return null; } })();
      const textEvidence = batch.subjectKind === "text" ? await c.artifact_versions.findOne({ sourceExecutionBatchId: batch._id }) : null;
      const qualityEvidence = batch.subjectKind === "text" ? await c.quality_reviews.findOne({ bookletId: batch.bookletId, sourceExecutionBatchId: batch._id }) : null;
      const imageInput = (() => { try { return parse(batch.canonicalInputJson); } catch { return null; } })();
      const imageEvidence = (() => {
        if (batch.subjectKind !== "image" || !imageInput || typeof imageInput !== "object" || !("jobId" in imageInput) || !("itemId" in imageInput) || typeof imageInput.jobId !== "string" || typeof imageInput.itemId !== "string") return null;
        return { jobId: imageInput.jobId, itemId: imageInput.itemId };
      })();
      const generationJob = imageEvidence ? await c.generation_jobs.findOne({ _id: imageEvidence.jobId, bookletId: batch.bookletId }) : null;
      const generated = imageEvidence && generationJob ? await c.generation_items.findOne({ _id: imageEvidence.itemId, jobId: imageEvidence.jobId, status: "succeeded", assetId: { $ne: null } }) : null;
      const generatedResult = (() => { try { return generated?.resultJson ? parse(generated.resultJson) : null; } catch { return null; } })();
      const selectedResult = (() => { try { return savedItem?.canonicalResultJson ? parse(savedItem.canonicalResultJson) : null; } catch { return null; } })();
      const sourceAssetId = generatedResult && typeof generatedResult === "object" && "sourceAssetId" in generatedResult && typeof generatedResult.sourceAssetId === "string" ? generatedResult.sourceAssetId : null;
      const sourceAsset = sourceAssetId ? await c.assets.findOne({ _id: sourceAssetId, bookletId: batch.bookletId }) : null;
      const sourceMetadata = (() => { try { return sourceAsset?.metadataJson ? parse(sourceAsset.metadataJson) : null; } catch { return null; } })();
      const materialized = batch.subjectKind === "text"
        ? Boolean(textEvidence || qualityEvidence)
        : Boolean(generated && generatedResult && typeof generatedResult === "object" && "executionBatchId" in generatedResult && generatedResult.executionBatchId === batch._id && selectedResult && typeof selectedResult === "object" && "assetId" in selectedResult && selectedResult.assetId === sourceAssetId && sourceMetadata && typeof sourceMetadata === "object" && "executionBatchId" in sourceMetadata && sourceMetadata.executionBatchId === batch._id && "executionItemId" in sourceMetadata && sourceMetadata.executionItemId === savedItem?._id);
      // Old releases could persist the completed card immediately before the
      // batch CAS. That exact saved outcome is safe to finish without replay.
      if (card?.family === "agent_run" && card.payload.batchId === batch._id && card.payload.state === "completed" && card.payload.selectedItemId === batch.selectedItemId && card.payload.selectionMode === batch.selectionMode && savedItem && materialized) {
        const completed = await withMongoTransaction(database, async (session) => {
          const currentBatch = await c.execution_batches.findOne({ _id: batch._id, status: "materializing", selectedItemId: batch.selectedItemId, selectionMode: batch.selectionMode, selectionResponseId: batch.selectionResponseId }, { session });
          const currentCardRow = await c.cards.findOne({ _id: batch.cardId, bookletId: batch.bookletId }, { session });
          const currentCard = (() => { try { return currentCardRow ? genUICardSchema.parse(parse(currentCardRow.cardJson)) : null; } catch { return null; } })();
          if (!currentBatch || currentCard?.family !== "agent_run" || currentCard.payload.batchId !== batch._id || currentCard.payload.state !== "completed" || currentCard.payload.selectedItemId !== batch.selectedItemId || currentCard.payload.selectionMode !== batch.selectionMode) return false;
          const result = await c.execution_batches.updateOne({ _id: batch._id, status: "materializing", selectedItemId: batch.selectedItemId, selectionMode: batch.selectionMode, selectionResponseId: batch.selectionResponseId }, { $set: { status: "completed", materializationStatus: "completed", materializationContinuationPending: batch.subjectKind === "image", producedAssetId: batch.subjectKind === "image" ? savedItem.candidateAssetId : batch.producedAssetId, completedAtMs: now, updatedAtMs: now } }, { session });
          return result.modifiedCount === 1;
        });
        if (completed) { recoveredCompleted.push(batch._id); continue; }
      }
      // A running image card plus an exact retained output stopped after the
      // generation item committed. Retain that selected candidate atomically:
      // reopening the card would allow a different candidate to be selected
      // while the saved generation item still identifies this one.
      if (batch.subjectKind === "image" && card?.family === "agent_run" && card.payload.batchId === batch._id && card.payload.state === "running" && savedItem && materialized) {
        const completed = await withMongoTransaction(database, async (session) => {
          const currentBatch = await c.execution_batches.findOne({ _id: batch._id, status: "materializing", selectedItemId: batch.selectedItemId, selectionMode: batch.selectionMode, selectionResponseId: batch.selectionResponseId }, { session });
          const currentCardRow = await c.cards.findOne({ _id: batch.cardId, bookletId: batch.bookletId }, { session });
          const currentCard = (() => { try { return currentCardRow ? genUICardSchema.parse(parse(currentCardRow.cardJson)) : null; } catch { return null; } })();
          if (!currentBatch || currentCard?.family !== "agent_run" || currentCard.payload.batchId !== batch._id || currentCard.payload.state !== "running") return false;
          const next = genUICardSchema.parse({ ...currentCard, status: "submitted", allowedActions: ["restart_with_agents"], payload: { ...currentCard.payload, state: "completed", selectedItemId: batch.selectedItemId, selectionMode: batch.selectionMode, revision: currentCard.payload.revision + 1 } });
          const cardChanged = await c.cards.updateOne({ _id: currentCardRow!._id, cardJson: currentCardRow!.cardJson }, { $set: { status: "submitted", cardJson: JSON.stringify(next), updatedAtMs: now } }, { session });
          if (cardChanged.modifiedCount !== 1) return false;
          if (currentCardRow!.messageId) { const message = await c.messages.findOne({ _id: currentCardRow!.messageId }, { session }); if (message) await c.messages.updateOne({ _id: message._id }, { $set: { uiMessageJson: replaceCardMessageProjection(message.uiMessageJson, next) } }, { session }); }
          const result = await c.execution_batches.updateOne({ _id: batch._id, status: "materializing", selectedItemId: batch.selectedItemId, selectionMode: batch.selectionMode, selectionResponseId: batch.selectionResponseId }, { $set: { status: "completed", materializationStatus: "completed", materializationContinuationPending: true, producedAssetId: savedItem.candidateAssetId, completedAtMs: now, updatedAtMs: now } }, { session });
          return result.modifiedCount === 1;
        });
        if (completed) recoveredCompleted.push(batch._id);
        continue;
      }
      if (batch.subjectKind === "text" && card?.family === "agent_run" && card.payload.batchId === batch._id && card.payload.state === "running" && savedItem && materialized && batch.selectionMode && batch.selectionResponseId) {
        // A committed text artifact is only part of materialization: the same
        // candidate must still restore its creator decision before completion.
        await c.execution_batches.updateOne({ _id: batch._id, status: "materializing", selectedItemId: batch.selectedItemId, selectionMode: batch.selectionMode, selectionResponseId: batch.selectionResponseId }, { $set: { status: "results", materializationStatus: "failed", materializationOwnerId: null, materializationStartedAtMs: null, materializationDeadlineAtMs: null, updatedAtMs: now } });
        continue;
      }
      if (!(batch.subjectKind === "text" && materialized) && (card?.family !== "agent_run" || card.payload.batchId !== batch._id || card.payload.state !== "completed")) {
        await c.execution_batches.updateOne({ _id: batch._id, status: "materializing" }, { $set: { status: "results", materializationStatus: "failed", selectedItemId: null, selectionMode: null, selectionResponseId: null, materializationOwnerId: null, materializationStartedAtMs: null, materializationDeadlineAtMs: null, updatedAtMs: now } });
        continue;
      }
      const unresolved = "Saved candidate output could not prove materialization after interruption. Inspect it before starting another candidate.";
      await withMongoTransaction(database, async (session) => {
        const current = await c.cards.findOne({ _id: batch.cardId, bookletId: batch.bookletId }, { session });
        const saved = (() => { try { return current ? genUICardSchema.parse(parse(current.cardJson)) : null; } catch { return null; } })();
        if (saved?.family === "agent_run" && saved.payload.batchId === batch._id && saved.payload.state === "completed") {
          const next = genUICardSchema.parse({ ...saved, status: "active", explanation: `${saved.explanation} ${unresolved}`, allowedActions: ["change_agents"], payload: { ...saved.payload, state: "results", selectedItemId: batch.selectedItemId, selectionMode: batch.selectionMode, revision: saved.payload.revision + 1 } });
          await c.cards.updateOne({ _id: current!._id, cardJson: current!.cardJson }, { $set: { status: "active", cardJson: JSON.stringify(next), updatedAtMs: now } }, { session });
          if (current!.messageId) { const message = await c.messages.findOne({ _id: current!.messageId }, { session }); if (message) await c.messages.updateOne({ _id: message._id }, { $set: { uiMessageJson: replaceCardMessageProjection(message.uiMessageJson, next) } }, { session }); }
        }
        await c.execution_batches.updateOne({ _id: batch._id, status: "materializing" }, { $set: { status: "results", materializationStatus: "failed", materializationUnresolvedReason: unresolved, materializationOwnerId: null, materializationStartedAtMs: null, materializationDeadlineAtMs: null, updatedAtMs: now } }, { session });
      });
    }
    const resumable = await c.execution_batches.find({ status: "results", materializationStatus: "failed" }).project({ _id: 1 }).toArray();
    const pendingContinuations = await c.execution_batches.find({ status: "completed", subjectKind: "image", materializationContinuationPending: true }).project({ _id: 1 }).toArray();
    // A process can stop after every item becomes terminal but before the
    // terminal card projection commits. Keep both saved successes and
    // saved failures discoverable by text and image services; `run` sees no
    // queued item, so it invokes their terminal handler without a provider call.
    const savedTerminal = await c.execution_batches.aggregate<{ _id: string }>([
      { $match: { status: "results", materializationStatus: "idle", selectedItemId: null } },
      { $lookup: {
        from: "execution_items",
        let: { batchId: "$_id" },
        pipeline: [
          { $match: { $expr: { $and: [
            { $eq: ["$batchId", "$$batchId"] },
            { $in: ["$status", ["queued", "running"]] },
          ] } } },
          { $limit: 1 },
        ],
        as: "pendingItems",
      } },
      { $match: { "pendingItems.0": { $exists: false } } },
      { $project: { _id: 1 } },
    ]).toArray();
    return [...new Set([
      ...(await c.execution_batches.find({ status: "queued" }).project({ _id: 1 }).toArray()).map((batch) => batch._id),
      ...resumable.map((batch) => batch._id),
      ...savedTerminal.map((batch) => batch._id),
      ...recoveredCompleted,
      ...pendingContinuations.map((batch) => batch._id),
    ])];
}, async retryFailed(batchId, now, options = {}) { const failed = await c.execution_items.find({ batchId, status: "failed" }).toArray(); const retryable = failed.filter((row) => options.allowUnknown || (row.safeErrorJson ? (parse(row.safeErrorJson) as { kind?: unknown }).kind !== "unknown" : true)); if (!retryable.length) return; await c.execution_items.updateMany({ _id: { $in: retryable.map((row) => row._id) }, status: "failed" }, { $set: { status: "queued", safeErrorJson: null, startedAtMs: null, finishedAtMs: null, updatedAtMs: now } }); await c.execution_batches.updateOne({ _id: batchId, status: "results", selectedItemId: null }, { $set: { status: "queued", terminalAtMs: null, updatedAtMs: now } }); }, async markSelected(input) { return withMongoTransaction(database, async (session) => { const result = await c.execution_batches.updateOne({ _id: input.batchId, status: "results", materializationUnresolvedReason: null, $or: [{ selectedItemId: null }, { subjectKind: "text", materializationStatus: "failed", selectedItemId: input.itemId, selectionMode: input.mode, selectionResponseId: input.responseId }] }, { $set: { selectedItemId: input.itemId, selectionMode: input.mode, selectionResponseId: input.responseId, status: "materializing", materializationStatus: "running", materializationOwnerId: input.ownerId, materializationStartedAtMs: input.now, materializationDeadlineAtMs: input.deadlineAtMs, updatedAtMs: input.now } }, { session }); if (result.modifiedCount !== 1) return false; if (!input.expectedCard) return true; const row = await c.cards.findOne({ _id: input.expectedCard.cardId, bookletId: input.expectedCard.bookletId }, { session }); if (!row) throw new Error("execution_card_not_found"); const card = genUICardSchema.parse(parse(row.cardJson)); if (card.family !== "agent_run" || card.payload.batchId !== input.batchId || card.payload.state !== input.expectedCard.state) throw new Error("execution_card_stale"); const claimed = genUICardSchema.parse({ ...card, allowedActions: [], payload: { ...card.payload, state: "running", revision: card.payload.revision + 1 } }); const updated = await c.cards.updateOne({ _id: row._id, cardJson: row.cardJson }, { $set: { cardJson: JSON.stringify(claimed), updatedAtMs: input.now } }, { session }); if (updated.modifiedCount !== 1) throw new Error("execution_card_stale"); if (row.messageId) { const message = await c.messages.findOne({ _id: row.messageId }, { session }); if (message) await c.messages.updateOne({ _id: message._id }, { $set: { uiMessageJson: replaceCardMessageProjection(message.uiMessageJson, claimed) } }, { session }); } return true; }); }, async completeMaterialization(input) { return withMongoTransaction(database, async (session) => {
    const batch = await c.execution_batches.findOne({ _id: input.batchId, status: "materializing", materializationOwnerId: input.ownerId, materializationDeadlineAtMs: input.deadlineAtMs }, { session });
    if (!batch) return false;
    const row = await c.cards.findOne({ _id: input.expectedCard.cardId, bookletId: input.bookletId }, { session });
    if (!row) return false;
    const current = genUICardSchema.parse(parse(row.cardJson));
    if (current.family !== "agent_run" || current.payload.batchId !== input.batchId || current.payload.state !== input.expectedCard.state) return false;
    const next = genUICardSchema.parse({ ...input.card, payload: { ...input.card.payload, selectedItemId: batch.selectedItemId, selectionMode: batch.selectionMode, revision: current.payload.revision } });
    const updated = await c.cards.updateOne({ _id: row._id, cardJson: row.cardJson }, { $set: { cardJson: JSON.stringify(next), updatedAtMs: input.now } }, { session });
    if (updated.modifiedCount !== 1) return false;
    if (row.messageId) {
      const message = await c.messages.findOne({ _id: row.messageId }, { session });
      if (message) await c.messages.updateOne({ _id: message._id }, { $set: { uiMessageJson: replaceCardMessageProjection(message.uiMessageJson, next) } }, { session });
    }
    const completed = await c.execution_batches.updateOne({ _id: input.batchId, status: "materializing", materializationOwnerId: input.ownerId, materializationDeadlineAtMs: input.deadlineAtMs }, { $set: { status: "completed", materializationStatus: "completed", materializationContinuationPending: input.continuationPending === true, producedArtifactVersionId: input.artifactVersionId ?? null, producedQualityReviewId: input.qualityReviewId ?? null, producedAssetId: input.assetId ?? null, completedAtMs: input.now, updatedAtMs: input.now } }, { session });
    if (completed.modifiedCount !== 1) throw new Error("materialization_ownership_lost");
    return true;
  }); }, async acknowledgeMaterializationContinuation(input) { return withMongoTransaction(database, async (session) => {
    const batch = await c.execution_batches.findOne({ _id: input.batchId, bookletId: input.bookletId, status: "completed", subjectKind: "image", materializationContinuationPending: true, selectedItemId: input.selectedItemId }, { session });
    if (!batch) return false;
    const row = await c.cards.findOne({ _id: input.cardId, bookletId: input.bookletId }, { session });
    const card = (() => { try { return row ? genUICardSchema.parse(parse(row.cardJson)) : null; } catch { return null; } })();
    if (card?.family !== "agent_run" || card.payload.batchId !== batch._id || card.payload.state !== "completed" || card.payload.selectedItemId !== batch.selectedItemId || card.payload.selectionMode !== batch.selectionMode) return false;
    const cleared = await c.execution_batches.updateOne({ _id: batch._id, status: "completed", subjectKind: "image", materializationContinuationPending: true, selectedItemId: batch.selectedItemId, selectionMode: batch.selectionMode, selectionResponseId: batch.selectionResponseId }, { $set: { materializationContinuationPending: false, updatedAtMs: input.now } }, { session });
    return cleared.modifiedCount === 1;
  }); } }; }
