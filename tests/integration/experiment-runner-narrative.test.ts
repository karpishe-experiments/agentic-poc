import { afterEach, describe, expect, it } from "vitest";
import type { Database } from "@/db/client";
import { createExperimentRepository } from "@/db/experiment-repository";
import { verifyExperimentData } from "@/db/verify";
import { createExperimentContextService } from "@/lib/experiment-runner/context";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const runId = id(101), bookletId = id(102);
const databases: Database[] = [];
afterEach(async () => { await Promise.all(databases.splice(0).map(closeTestDatabase)); });
const concept = { schemaVersion: "2", title: "Kite Rescue", sourceInput: "A young inventor and robot rescue a kite.", audience: { ageBand: "6-8", readingNeeds: "Short text." }, premise: "A kite flies away.", theme: "Friendship", emotionalPromise: "Relief", tone: "Playful", storyScope: "Three pages", contentRequirements: [], knownConstraints: [], deferredDecisions: [], approvalQuestions: [] };
const outline = { schemaVersion: "2", title: "Kite Rescue", summary: "The kite escapes and the friends retrieve it.", characters: [{ nameOrRole: "Inventor", narrativeRole: "Hero", relationship: "Robot's friend", openDetails: [] }], locations: [{ name: "Park", storyPurpose: "Rescue", openDetails: [] }], storyArc: { opening: "They play.", incitingAction: "Wind takes kite.", escalation: "They search.", decisiveChoice: "They cooperate.", resolution: "They retrieve it." }, theme: "Friendship", emotionalArc: "Worry to relief", deferredDecisions: [], approvalQuestions: [] };

async function setup() {
  const database = await createTestDatabase({ seedAgents: false }); databases.push(database);
  const repository = createExperimentRepository(database);
  await repository.createRun({ runId, bookletId, persona: "playful_kid", mode: "simulated", configuration: [], nowMs: 1 });
  async function execute(operationNumber: number, role: "specialist" | "tester" | "manager", taskId: "J01" | "J02" | null, result: unknown) {
    const operationId = id(operationNumber), workflowRunId = id(operationNumber + 1000);
    const revision = (await repository.getRun(runId))!.revision;
    await repository.prepareOperation({ operationId, runId, expectedRevision: revision, role, taskId, subjectKind: "book", subjectId: bookletId, inputFingerprint: "a".repeat(64), attempt: operationNumber, providerKind: "text", nowMs: operationNumber });
    await repository.claimOperation({ runId, operationId, workflowRunId, parentWorkflowRunId: null, nowMs: operationNumber + 1 });
    return repository.completeOperation({ envelope: { runId, operationId, workflowRunId, inputFingerprint: "a".repeat(64), result }, parentWorkflowRunId: null, nowMs: operationNumber + 2 });
  }
  return { database, repository, execute };
}
const proposal = (taskId: "J01" | "J02", content: unknown) => ({ kind: "proposal", payload: { taskId, content } });
const decision = (decision: unknown) => ({ kind: "decision", payload: { decision } });

describe("J01/J02 narrative materialization", () => {
  it("replaces a broad delegation with a narrower grant without deleting accepted history", async () => {
    const { database, execute } = await setup();
    await execute(280, "tester", null, decision({ action: "delegate", taskIds: ["J01", "J02"], subjectId: bookletId }));
    const originalGrant = await database.collections.experiment_delegations.findOne({ runId });
    const first = await execute(281, "specialist", "J01", proposal("J01", concept));
    const versionId = JSON.parse(first.operation.materializationJson!).versionId as string;
    await execute(282, "tester", null, decision({ action: "delegate", taskIds: ["J01"], subjectId: bookletId }));
    const nextGrant = await database.collections.experiment_delegations.findOne({ runId, effectiveSequence: 2 });
    expect(await database.collections.experiment_delegations.findOne({ _id: originalGrant!._id })).toMatchObject({ supersededById: nextGrant!._id });
    await execute(283, "specialist", "J02", proposal("J02", outline));
    expect(await database.collections.artifacts.findOne({ taskId: "J02", bookletId })).toMatchObject({ state: "draft" });
    expect(await database.collections.approvals.findOne({ artifactVersionId: versionId })).toMatchObject({ delegationId: originalGrant!._id });
    await expect(verifyExperimentData(database)).resolves.toBeUndefined();
  });

  it("retains an explicit grouped decision and does not duplicate its approvals", async () => {
    const { database, repository, execute } = await setup();
    const first = await execute(290, "specialist", "J01", proposal("J01", concept));
    const conceptVersion = JSON.parse(first.operation.materializationJson!).versionId as string;
    await execute(291, "tester", null, decision({ action: "approve", versionIds: [conceptVersion] }));
    const second = await execute(292, "specialist", "J02", proposal("J02", outline));
    const outlineVersion = JSON.parse(second.operation.materializationJson!).versionId as string;
    const result = decision({ action: "approve", versionIds: [outlineVersion, conceptVersion] });
    const grouped = await execute(293, "tester", null, result);
    expect(JSON.parse(grouped.operation.materializationJson!).reviewGroupId).toEqual(expect.any(String));
    expect(await database.collections.messages.findOne({ _id: id(293) })).toMatchObject({ uiMessageJson: expect.stringContaining(outlineVersion) });
    expect(await database.collections.approvals.countDocuments({ experimentRunId: runId })).toBe(2);
    const replay = await repository.completeOperation({ envelope: { runId, operationId: id(293), workflowRunId: id(1293), inputFingerprint: "a".repeat(64), result }, parentWorkflowRunId: null, nowMs: 999 });
    expect(replay.reused).toBe(true);
    expect(await database.collections.messages.countDocuments({ _id: id(293) })).toBe(1);
    await expect(verifyExperimentData(database)).resolves.toBeUndefined();
  });

  it("escalates a brief conflict outside delegation while permitting explicit warning-bearing acceptance", async () => {
    const { database, execute } = await setup();
    await execute(300, "tester", null, decision({ action: "delegate", taskIds: ["J01"], subjectId: bookletId }));
    const saved = await execute(301, "specialist", "J01", proposal("J01", { ...concept, audience: { ageBand: "3-5", readingNeeds: "Read aloud" } }));
    const versionId = JSON.parse(saved.operation.materializationJson!).versionId as string;
    expect(await database.collections.approvals.findOne({ artifactVersionId: versionId })).toBeNull();
    expect(JSON.parse(saved.operation.materializationJson!).warnings).toContainEqual(expect.objectContaining({ field: "audience.ageBand" }));
    await execute(302, "tester", null, decision({ action: "approve", versionIds: [versionId] }));
    expect(await database.collections.artifacts.findOne({ taskId: "J01", bookletId })).toMatchObject({ state: "approved" });
    await expect(verifyExperimentData(database)).resolves.toBeUndefined();
  });

  it("requires approved J01 before J02 and saves exact version provenance", async () => {
    const { database, repository, execute } = await setup();
    await expect(repository.prepareOperation({ operationId: id(201), runId, expectedRevision: 0, role: "specialist", taskId: "J02", subjectKind: "book", subjectId: bookletId, inputFingerprint: "a".repeat(64), attempt: 1, providerKind: "text", nowMs: 2 })).rejects.toMatchObject({ code: "conflict" });
    const first = await execute(202, "specialist", "J01", proposal("J01", concept));
    const versionId = JSON.parse(first.operation.materializationJson!) .versionId as string;
    expect(await database.collections.artifacts.findOne({ taskId: "J01", bookletId })).toMatchObject({ state: "draft", currentVersionId: versionId });
    await expect(repository.prepareOperation({ operationId: id(299), runId, expectedRevision: (await repository.getRun(runId))!.revision, role: "specialist", taskId: "J01", subjectKind: "book", subjectId: bookletId, inputFingerprint: "a".repeat(64), attempt: 299, providerKind: "text", nowMs: 299 })).rejects.toMatchObject({ code: "conflict" });
    await execute(203, "tester", null, decision({ action: "approve", versionIds: [versionId] }));
    expect(await database.collections.approvals.findOne({ artifactVersionId: versionId })).toMatchObject({ origin: "explicit", testerDecisionId: id(203), experimentRunId: runId });
    const second = await execute(204, "specialist", "J02", proposal("J02", outline));
    const outlineVersionId = JSON.parse(second.operation.materializationJson!).versionId as string;
    expect(await database.collections.artifact_dependencies.findOne({ downstreamVersionId: outlineVersionId, upstreamVersionId: versionId })).not.toBeNull();
    expect(await database.collections.artifacts.findOne({ taskId: "J02", bookletId })).toMatchObject({ state: "draft" });
    expect(await repository.getRun(runId)).toMatchObject({ status: "queued" });
    expect(await database.collections.booklets.findOne({ _id: bookletId })).toMatchObject({ workingTitle: "Kite Rescue", currentStage: "J02" });
    expect((await repository.completeOperation({ envelope: { runId, operationId: id(204), workflowRunId: id(1204), inputFingerprint: "a".repeat(64), result: proposal("J02", { ...outline, extra: "ignored" }) }, parentWorkflowRunId: null, nowMs: 999 })).reused).toBe(true);
    expect(await database.collections.artifact_versions.countDocuments({ artifactId: (await database.collections.artifacts.findOne({ taskId: "J02", bookletId }))!._id })).toBe(1);
  });

  it("routes manager delegation only to an eligible task", async () => {
    const { repository, execute } = await setup();
    await expect(execute(260, "manager", null, { kind: "delegate", payload: { taskId: "J02", subjectKind: "book", subjectId: bookletId } })).rejects.toMatchObject({ code: "invalid_result" });
    expect((await repository.getOperation(id(260)))?.state).toBe("started");
  });

  it("retains a brief that conflicts with fixed reader age as a warning for explicit review", async () => {
    const { database, execute } = await setup();
    await execute(270, "tester", null, decision({ action: "delegate", taskIds: ["J01"], subjectId: bookletId }));
    const saved = await execute(271, "specialist", "J01", proposal("J01", { ...concept, audience: { ageBand: "3-5", readingNeeds: "Short text." } }));
    const versionId = JSON.parse(saved.operation.materializationJson!).versionId as string;
    expect(await database.collections.approvals.findOne({ artifactVersionId: versionId })).toBeNull();
    expect(JSON.parse(saved.operation.warningsJson)).toEqual(expect.arrayContaining([expect.objectContaining({ field: "audience.ageBand" })]));
    expect(await database.collections.artifacts.findOne({ taskId: "J01", bookletId })).toMatchObject({ state: "draft" });
  });

  it("applies delegation to usable drafts, then revokes future acceptance", async () => {
    const { database, execute } = await setup();
    await execute(210, "tester", null, decision({ action: "delegate", taskIds: ["J01"], subjectId: bookletId }));
    const first = await execute(211, "specialist", "J01", proposal("J01", { ...concept, premise: "long ".repeat(301) }));
    const firstVersion = JSON.parse(first.operation.materializationJson!).versionId as string;
    expect(await database.collections.approvals.findOne({ artifactVersionId: firstVersion })).toMatchObject({ origin: "delegated", testerDecisionId: id(210) });
    expect(JSON.parse((await database.collections.artifact_versions.findOne({ _id: firstVersion }))!.warningsJson!)).not.toHaveLength(0);
    const grant = await database.collections.experiment_delegations.findOne({ runId });
    await execute(212, "tester", null, decision({ action: "revoke_delegation", delegationId: grant!._id }));
    await execute(216, "tester", null, decision({ action: "revise", taskId: "J01", artifactVersionId: firstVersion, instruction: "Use a new title." }));
    const second = await execute(213, "specialist", "J01", proposal("J01", { ...concept, title: "New title" }));
    const secondVersion = JSON.parse(second.operation.materializationJson!).versionId as string;
    expect(await database.collections.approvals.findOne({ artifactVersionId: secondVersion })).toBeNull();
    expect(await database.collections.approvals.findOne({ artifactVersionId: firstVersion })).not.toBeNull();
    expect(await database.collections.artifacts.findOne({ taskId: "J01", bookletId })).toMatchObject({ state: "draft", currentVersionId: secondVersion });
  });

  it("keeps immutable J01 history and marks only its J02 dependent for review", async () => {
    const { database, repository, execute } = await setup();
    const first = await execute(230, "specialist", "J01", proposal("J01", concept));
    const firstVersion = JSON.parse(first.operation.materializationJson!).versionId as string;
    await execute(231, "tester", null, decision({ action: "approve", versionIds: [firstVersion] }));
    const firstOutline = await execute(232, "specialist", "J02", proposal("J02", outline));
    const outlineVersion = JSON.parse(firstOutline.operation.materializationJson!).versionId as string;
    await execute(233, "tester", null, decision({ action: "approve", versionIds: [outlineVersion] }));
    await execute(234, "tester", null, decision({ action: "revise", taskId: "J01", artifactVersionId: firstVersion, instruction: "Make the tone calmer." }));
    expect(await repository.getRun(runId)).toMatchObject({ textRevisions: 1, pendingDecisionJson: expect.stringContaining(firstVersion) });
    const second = await execute(235, "specialist", "J01", proposal("J01", { ...concept, tone: "Calm" }));
    const secondVersion = JSON.parse(second.operation.materializationJson!).versionId as string;
    expect(await database.collections.artifact_versions.findOne({ _id: secondVersion })).toMatchObject({ versionNumber: 2, sourceVersionId: firstVersion });
    expect(await database.collections.artifact_versions.findOne({ _id: firstVersion })).not.toBeNull();
    expect(await database.collections.approvals.findOne({ artifactVersionId: firstVersion })).not.toBeNull();
    expect(await database.collections.artifacts.findOne({ taskId: "J02", bookletId })).toMatchObject({ state: "needs_review", currentVersionId: outlineVersion });
    expect(await repository.getRun(runId)).toMatchObject({ pendingDecisionJson: null });
    expect(await database.collections.booklets.findOne({ _id: bookletId })).toMatchObject({ currentStage: "J01" });
  });

  it("suspends and restores an owning revision through clarification without another debit", async () => {
    const { database, repository, execute } = await setup();
    const first = await execute(280, "specialist", "J01", proposal("J01", concept));
    const firstVersion = JSON.parse(first.operation.materializationJson!).versionId as string;
    await execute(281, "tester", null, decision({ action: "revise", taskId: "J01", artifactVersionId: firstVersion, instruction: "Make it calmer." }));
    await execute(282, "specialist", "J01", { kind: "clarification", payload: { question: "Should the rescue stay playful?" } });
    expect(await repository.getRun(runId)).toMatchObject({ textRevisions: 1, pendingDecisionJson: expect.stringContaining("resumeRevision") });
    await execute(283, "tester", null, decision({ action: "answer", questionId: id(282), text: "Yes, but gently." }));
    expect(await repository.getRun(runId)).toMatchObject({ textRevisions: 1, pendingDecisionJson: expect.stringContaining(firstVersion) });
    const second = await execute(284, "specialist", "J01", proposal("J01", { ...concept, tone: "Calm and playful" }));
    const secondVersion = JSON.parse(second.operation.materializationJson!).versionId as string;
    expect(await database.collections.artifact_versions.findOne({ _id: secondVersion })).toMatchObject({ versionNumber: 2, sourceVersionId: firstVersion });
    expect(await database.collections.artifact_versions.findOne({ _id: firstVersion })).not.toBeNull();
    expect(await repository.getRun(runId)).toMatchObject({ textRevisions: 1, pendingDecisionJson: null });
  });

  it("does not let a manager question replace another specialist's revision", async () => {
    const { repository, execute } = await setup();
    const first = await execute(285, "specialist", "J01", proposal("J01", concept));
    const versionId = JSON.parse(first.operation.materializationJson!).versionId as string;
    await execute(286, "tester", null, decision({ action: "revise", taskId: "J01", artifactVersionId: versionId, instruction: "Make it calmer." }));
    await expect(execute(287, "manager", null, { kind: "ask", payload: { question: "What style?" } })).rejects.toMatchObject({ code: "invalid_result" });
    expect(await repository.getRun(runId)).toMatchObject({ textRevisions: 1, pendingDecisionJson: expect.stringContaining(versionId) });
    expect((await repository.getOperation(id(287)))?.state).toBe("started");
  });

  it("keeps questions pending until a matching answer and rejects unauthorized decisions", async () => {
    const { database, repository, execute } = await setup();
    await execute(220, "manager", null, { kind: "ask", payload: { question: "Which tone?" } });
    await expect(execute(221, "tester", null, decision({ action: "answer", questionId: id(999), text: "Playful" }))).rejects.toMatchObject({ code: "invalid_result" });
    expect(await repository.getRun(runId)).toMatchObject({ pendingDecisionJson: expect.stringContaining(id(220)) });
    expect(await database.collections.messages.countDocuments()).toBe(0);
    // Failed materialization leaves the authorized claim unresolved for recovery.
    expect((await repository.getOperation(id(221)))?.state).toBe("started");
  });

  it("answers the exact question and enforces the persona revision ceiling", async () => {
    const { repository, execute } = await setup();
    await execute(240, "manager", null, { kind: "ask", payload: { question: "Which tone?" } });
    await execute(241, "tester", null, decision({ action: "answer", questionId: id(240), text: "Playful" }));
    expect(await repository.getRun(runId)).toMatchObject({ pendingDecisionJson: null, decisionSequence: 1 });
    const first = await execute(242, "specialist", "J01", proposal("J01", concept));
    const versionId = JSON.parse(first.operation.materializationJson!).versionId as string;
    await execute(243, "tester", null, decision({ action: "revise", taskId: "J01", artifactVersionId: versionId, instruction: "Calmer" }));
    await execute(244, "specialist", "J01", proposal("J01", { ...concept, tone: "Calm" }));
    await expect(execute(245, "tester", null, decision({ action: "revise", taskId: "J01", artifactVersionId: JSON.parse((await repository.getOperation(id(244)))!.materializationJson!).versionId, instruction: "Again" }))).rejects.toMatchObject({ code: "invalid_result" });
    expect(await repository.getRun(runId)).toMatchObject({ textRevisions: 1 });
  });

  it("rejects a stale source after preparation and rolls back the completion", async () => {
    const { database, repository, execute } = await setup();
    const first = await execute(250, "specialist", "J01", proposal("J01", concept));
    const conceptVersionId = JSON.parse(first.operation.materializationJson!).versionId as string;
    await execute(251, "tester", null, decision({ action: "approve", versionIds: [conceptVersionId] }));
    const operationId = id(252), workflowRunId = id(1252);
    await repository.prepareOperation({ operationId, runId, expectedRevision: (await repository.getRun(runId))!.revision, role: "specialist", taskId: "J02", subjectKind: "book", subjectId: bookletId, inputFingerprint: "a".repeat(64), attempt: 252, providerKind: "text", nowMs: 252 });
    await repository.claimOperation({ runId, operationId, workflowRunId, parentWorkflowRunId: null, nowMs: 253 });
    const context = createExperimentContextService(database);
    const identity = { runId, operationId, workflowRunId, parentWorkflowRunId: null };
    expect(await context.getOperationContext(identity)).toMatchObject({ approvedUpstream: { id: conceptVersionId } });
    await database.collections.artifacts.updateOne({ taskId: "J01", bookletId }, { $set: { state: "needs_review" } });
    await expect(context.getOperationContext(identity)).rejects.toMatchObject({ code: "conflict" });
    await expect(repository.completeOperation({ envelope: { runId, operationId, workflowRunId, inputFingerprint: "a".repeat(64), result: proposal("J02", outline) }, parentWorkflowRunId: null, nowMs: 254 })).rejects.toMatchObject({ code: "conflict" });
    expect(await database.collections.artifacts.findOne({ taskId: "J02", bookletId })).toBeNull();
    expect((await repository.getOperation(operationId))?.state).toBe("started");
    expect((await repository.getRun(runId))?.activeOperationId).toBe(operationId);
  });
});
