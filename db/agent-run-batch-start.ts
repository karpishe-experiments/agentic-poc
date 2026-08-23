import { randomUUID } from "node:crypto";
import { withMongoTransaction, type Database } from "@/db/client";
import { genUICardSchema, type GenUICard } from "@/lib/contracts/cards";
import type { ExecutionTargetKey } from "@/lib/contracts/execution";

export type AgentRunBatchStart = {
  id: string; bookletId: string; cardId: string; targetKey: ExecutionTargetKey; subjectKind: string; subjectId: string;
  previousBatchId: string | null; poolFingerprint: string; canonicalInput: unknown; workflowFingerprint: unknown; schemaVersion: string;
  resultChoicePolicy: "implicit_sole" | "explicit"; selectedAgentIds: string[];
  agents: Array<{ agentId: string; agentVersionId: string; profileId: string; profileVersion: number; agentSnapshot: unknown; profileSnapshot: unknown }>;
  runningCard: Extract<GenUICard, { family: "agent_run" }>; expectedCardRevision: number; now: number;
};

function replaceCardMessageProjection(messageJson: string, nextCard: GenUICard): string {
  const message = JSON.parse(messageJson) as unknown;
  if (!message || typeof message !== "object" || !("parts" in message) || !Array.isArray(message.parts)) throw new Error("Saved card message is not a valid display projection.");
  return JSON.stringify({ ...message, parts: message.parts.map((part) => !part || typeof part !== "object" || !("type" in part) || part.type !== "data-card" || !("data" in part) ? part : genUICardSchema.parse(part.data).cardId === nextCard.cardId ? { ...part, data: nextCard } : part) });
}

export async function startAgentRunBatch(database: Database, input: AgentRunBatchStart): Promise<boolean> {
  const c = database.collections;
  return withMongoTransaction(database, async (session) => {
    const row = await c.cards.findOne({ _id: input.cardId, bookletId: input.bookletId }, { session });
    if (!row) throw new Error("The Agent run card was not found.");
    const current = genUICardSchema.parse(JSON.parse(row.cardJson));
    if (current.family !== "agent_run" || current.payload.state !== "ready" || current.payload.revision !== input.expectedCardRevision) return false;
    const runningCard = genUICardSchema.parse(input.runningCard);
    if (input.resultChoicePolicy !== "implicit_sole") await c.execution_preferences.updateOne({ bookletId: input.bookletId, targetKey: input.targetKey }, { $set: { selectedAgentIdsJson: JSON.stringify(input.selectedAgentIds), updatedAtMs: input.now }, $setOnInsert: { _id: randomUUID(), bookletId: input.bookletId, targetKey: input.targetKey, revision: 1, createdAtMs: input.now } }, { upsert: true, session });
    await c.execution_batches.insertOne({ _id: input.id, bookletId: input.bookletId, cardId: input.cardId, targetKey: input.targetKey, subjectKind: input.subjectKind, subjectId: input.subjectId, previousBatchId: input.previousBatchId, poolFingerprint: input.poolFingerprint, status: "queued", materializationStatus: "idle", resultChoicePolicy: input.resultChoicePolicy, canonicalInputJson: JSON.stringify(input.canonicalInput), workflowFingerprintJson: JSON.stringify(input.workflowFingerprint), schemaVersion: input.schemaVersion, selectedItemId: null, selectionMode: null, selectionResponseId: null, producedArtifactVersionId: null, producedQualityReviewId: null, producedAssetId: null, queuedAtMs: input.now, startedAtMs: null, terminalAtMs: null, completedAtMs: null, updatedAtMs: input.now }, { session });
    await c.execution_items.insertMany(input.agents.map((agent) => ({ _id: randomUUID(), batchId: input.id, agentId: agent.agentId, agentVersionId: agent.agentVersionId, profileId: agent.profileId, profileVersion: agent.profileVersion, agentSnapshotJson: JSON.stringify(agent.agentSnapshot), profileSnapshotJson: JSON.stringify(agent.profileSnapshot), status: "queued", attemptCount: 0, attemptsJson: "[]", resultSummaryJson: null, canonicalResultJson: null, candidateAssetId: null, safeErrorJson: null, startedAtMs: null, finishedAtMs: null, updatedAtMs: input.now })), { session });
    await c.cards.updateOne({ _id: row._id }, { $set: { cardJson: JSON.stringify(runningCard), readyInputJson: null, readyInputSchemaVersion: null, readyWorkflowFingerprintJson: null, readyPreviousBatchId: null, updatedAtMs: input.now } }, { session });
    if (row.messageId) { const message = await c.messages.findOne({ _id: row.messageId }, { session }); if (message) await c.messages.updateOne({ _id: message._id }, { $set: { uiMessageJson: replaceCardMessageProjection(message.uiMessageJson, runningCard) } }, { session }); }
    return true;
  });
}