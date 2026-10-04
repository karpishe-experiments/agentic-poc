import { afterEach, describe, expect, it } from "vitest";
import type { Database } from "@/db/client";
import { createExperimentRepository } from "@/db/experiment-repository";
import { createExperimentContextService } from "@/lib/experiment-runner/context";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const runId = id(401), bookletId = id(402), fingerprint = "a".repeat(64);
const databases: Database[] = [];
afterEach(async () => { await Promise.all(databases.splice(0).map(closeTestDatabase)); });
const concept = { schemaVersion: "2", title: "Kite Rescue", sourceInput: "A child and robot rescue a kite.", audience: { ageBand: "6-8", readingNeeds: "Short text." }, premise: "A kite flies away.", theme: "Friendship", emotionalPromise: "Relief", tone: "Playful", storyScope: "Three pages", contentRequirements: [], knownConstraints: [], deferredDecisions: [], approvalQuestions: [] };
const outline = { schemaVersion: "2", title: "Kite Rescue", summary: "The friends retrieve the kite.", characters: [{ nameOrRole: "Inventor", narrativeRole: "Hero", relationship: "Robot friend", openDetails: [] }], locations: [{ name: "Park", storyPurpose: "Rescue", openDetails: [] }], storyArc: { opening: "They play.", incitingAction: "Wind takes kite.", escalation: "They search.", decisiveChoice: "They cooperate.", resolution: "They retrieve it." }, theme: "Friendship", emotionalArc: "Worry to relief", deferredDecisions: [], approvalQuestions: [] };

async function setup() {
  const database = await createTestDatabase({ seedAgents: false }); databases.push(database);
  const repository = createExperimentRepository(database), context = createExperimentContextService(database);
  await repository.createRun({ runId, bookletId, persona: "playful_kid", mode: "simulated", configuration: [{ role: "manager", taskId: null, appId: id(900), publishedWorkflowId: id(901), toolProviderId: null }], nowMs: 1 });
  async function start(n: number, role: "manager" | "tester" | "specialist" | "judge", taskId: "J01" | "J02" | null = null) {
    const operationId = id(n), workflowRunId = id(n + 1000), parentWorkflowRunId = null;
    await repository.prepareOperation({ operationId, runId, expectedRevision: (await repository.getRun(runId))!.revision, role, taskId, subjectKind: "book", subjectId: bookletId, inputFingerprint: fingerprint, attempt: n, providerKind: "text", nowMs: n });
    await repository.claimOperation({ runId, operationId, workflowRunId, parentWorkflowRunId, nowMs: n + 1 });
    const identity = { runId, operationId, workflowRunId, parentWorkflowRunId };
    return { identity, complete: (result: unknown) => repository.completeOperation({ envelope: { runId, operationId, workflowRunId, inputFingerprint: fingerprint, result }, parentWorkflowRunId, nowMs: n + 2 }) };
  }
  return { database, repository, context, start };
}
const proposal = (taskId: "J01" | "J02", content: unknown) => ({ kind: "proposal", payload: { taskId, content } });
const decision = (decision: unknown) => ({ kind: "decision", payload: { decision } });

describe("saved experiment context", () => {
  it("projects the persisted predecessor of a repaired successor", async () => {
    const { repository, context, start } = await setup();
    const failed = await start(490, "manager");
    await repository.failOperation({ ...failed.identity, category: "definite_failure", nowMs: 492 });
    await repository.createRun({ runId: id(493), bookletId: id(494), predecessorRunId: runId, persona: "playful_kid", mode: "simulated", configuration: [{ role: "manager", taskId: null, appId: id(900), publishedWorkflowId: id(901), toolProviderId: null }], nowMs: 493 });
    expect(await context.getRunView(id(493))).toMatchObject({ predecessorRunId: runId, status: "queued" });
    expect(await context.getRunView(runId)).toMatchObject({ status: "blocked" });
  });
  it("projects only allowlisted run data and advances the two narrative tasks", async () => {
    const { context, start } = await setup();
    expect(await context.getRunView(id(999))).toBeNull();
    const initial = await context.getRunView(runId);
    expect(initial).toMatchObject({ nextNarrativeTask: "J01", currentArtifacts: [], status: "queued" });
    expect(JSON.stringify(initial)).not.toContain(id(900));
    expect(JSON.stringify(initial)).not.toContain("configurationJson");
    const specialist = await start(410, "specialist", "J01");
    expect(await context.getRunView(runId)).toMatchObject({ nextNarrativeTask: null });
    const specialistContext = await context.getOperationContext(specialist.identity);
    expect(specialistContext).toMatchObject({ role: "specialist", taskId: "J01", currentTarget: null, approvedUpstream: null });
    expect(JSON.stringify(specialistContext)).not.toContain(id(900));
    const first = await specialist.complete(proposal("J01", concept));
    const conceptVersionId = JSON.parse(first.operation.materializationJson!).versionId as string;
    expect(await context.getRunView(runId)).toMatchObject({ nextNarrativeTask: "tester", currentArtifacts: [{ taskId: "J01", state: "draft" }] });
    const tester = await start(411, "tester");
    const testerContext = await context.getOperationContext(tester.identity);
    expect(testerContext).toMatchObject({ role: "tester", brief: expect.any(String), currentArtifacts: [{ taskId: "J01" }] });
    expect(JSON.stringify(testerContext)).not.toContain(id(900));
    await tester.complete(decision({ action: "approve", versionIds: [conceptVersionId] }));
    expect(await context.getRunView(runId)).toMatchObject({ nextNarrativeTask: "J02" });
    const outlineOperation = await start(412, "specialist", "J02");
    const outlineContext = await context.getOperationContext(outlineOperation.identity);
    expect(outlineContext).toMatchObject({ role: "specialist", taskId: "J02", approvedUpstream: { id: conceptVersionId } });
    const second = await outlineOperation.complete(proposal("J02", outline));
    const outlineVersionId = JSON.parse(second.operation.materializationJson!).versionId as string;
    const finalTester = await start(413, "tester");
    await finalTester.complete(decision({ action: "approve", versionIds: [outlineVersionId] }));
    expect(await context.getRunView(runId)).toMatchObject({ nextNarrativeTask: "slice_complete", status: "queued" });
  });

  it("shows grant and pending question without exposing configuration", async () => {
    const { context, start } = await setup();
    const tester = await start(420, "tester");
    await tester.complete(decision({ action: "delegate", taskIds: ["J01"], subjectId: bookletId }));
    const manager = await start(421, "manager");
    expect(await context.getOperationContext(manager.identity)).toMatchObject({ role: "manager", eligibleRoute: "J01" });
    await manager.complete({ kind: "ask", payload: { question: "Which tone?" } });
    expect(await context.getRunView(runId)).toMatchObject({ nextNarrativeTask: "tester", activeDelegation: { taskIds: ["J01"] }, pendingDecision: { questionId: id(421) }, creatorMessages: [{ sequence: 1 }] });
    const response = await start(422, "tester");
    expect(await context.getOperationContext(response.identity)).toMatchObject({ role: "tester", pendingDecision: { questionId: id(421) } });
    await response.complete(decision({ action: "answer", questionId: id(421), text: "Playful" }));
    expect(await context.getRunView(runId)).toMatchObject({ pendingDecision: null, nextNarrativeTask: "J01" });
    const specialist = await start(423, "specialist", "J01");
    expect(await context.getOperationContext(specialist.identity)).toMatchObject({ questionAnswers: [{ questionId: id(421), taskId: null, question: "Which tone?", answer: "Playful" }] });
  });

  it("restores saved clarification and answer for a restarted revision specialist", async () => {
    const { context, repository, start } = await setup();
    const first = await start(460, "specialist", "J01");
    const saved = await first.complete(proposal("J01", concept));
    const versionId = JSON.parse(saved.operation.materializationJson!).versionId as string;
    const revise = await start(461, "tester");
    await revise.complete(decision({ action: "revise", taskId: "J01", artifactVersionId: versionId, instruction: "Make it calmer." }));
    const clarification = await start(462, "specialist", "J01");
    await clarification.complete({ kind: "clarification", payload: { question: "Should the ending stay playful?" } });
    expect(await context.getRunView(runId)).toMatchObject({ nextNarrativeTask: "tester", pendingDecision: { questionId: id(462), resumeRevision: { artifactVersionId: versionId } } });
    const answer = await start(463, "tester");
    await answer.complete(decision({ action: "answer", questionId: id(462), text: "Yes, gently." }));
    expect(await context.getRunView(runId)).toMatchObject({ nextNarrativeTask: "J01", pendingDecision: { artifactVersionId: versionId } });
    const resumed = await start(464, "specialist", "J01");
    const restartedContext = createExperimentContextService(databases.at(-1)!);
    expect(await restartedContext.getOperationContext(resumed.identity)).toMatchObject({
      role: "specialist", matchingRevision: { artifactVersionId: versionId, instruction: "Make it calmer." },
      questionAnswers: [{ questionId: id(462), taskId: "J01", question: "Should the ending stay playful?", answer: "Yes, gently." }],
    });
    expect(JSON.stringify(await restartedContext.getOperationContext(resumed.identity))).not.toContain(id(900));
    expect((await repository.getRun(runId))?.textRevisions).toBe(1);
  });

  it("requires exact claimed identity and keeps routing paused or unknown", async () => {
    const { context, repository, start } = await setup();
    const specialist = await start(430, "specialist", "J01");
    await expect(context.getOperationContext({ ...specialist.identity, workflowRunId: id(999) })).rejects.toMatchObject({ code: "conflict" });
    await repository.pause({ runId, expectedRevision: (await repository.getRun(runId))!.revision, nowMs: 500 });
    expect(await context.getRunView(runId)).toMatchObject({ nextNarrativeTask: null, pauseRequested: true });
    expect(await context.getOperationContext(specialist.identity)).toMatchObject({ role: "specialist" });
    await repository.failOperation({ ...specialist.identity, category: "unknown_outcome", nowMs: 501 });
    expect(await context.getRunView(runId)).toMatchObject({ nextNarrativeTask: null, status: "blocked" });
    expect(await context.getOperationContext(specialist.identity)).toMatchObject({ role: "specialist" });
  });

  it("preserves an admitted manager route when pause follows its claim", async () => {
    const { context, repository, start } = await setup();
    const tester = await start(470, "tester");
    await tester.complete(decision({ action: "delegate", taskIds: ["J01"], subjectId: bookletId }));
    const manager = await start(471, "manager");
    await repository.pause({ runId, expectedRevision: (await repository.getRun(runId))!.revision, nowMs: 500 });

    expect(await context.getRunView(runId)).toMatchObject({ status: "paused", nextNarrativeTask: null });
    expect(await context.getOperationContext(manager.identity)).toMatchObject({ role: "manager", eligibleRoute: "J01", run: { status: "paused", nextNarrativeTask: null } });
    await manager.complete({ kind: "delegate", payload: { taskId: "J01", subjectKind: "book", subjectId: bookletId } });
    expect(await context.getRunView(runId)).toMatchObject({ status: "paused", nextNarrativeTask: null });
    await repository.resume({ runId, expectedRevision: (await repository.getRun(runId))!.revision, nowMs: 501 });
    expect(await context.getRunView(runId)).toMatchObject({ status: "queued", nextNarrativeTask: "J01" });
  });

  it("rejects prepared, foreign, unsupported and source-drift contexts", async () => {
    const { context, repository, database } = await setup();
    await repository.prepareOperation({ operationId: id(440), runId, expectedRevision: 0, role: "specialist", taskId: "J01", subjectKind: "book", subjectId: bookletId, inputFingerprint: fingerprint, attempt: 440, providerKind: "text", nowMs: 440 });
    await expect(context.getOperationContext({ runId, operationId: id(440), workflowRunId: id(1440), parentWorkflowRunId: null })).rejects.toMatchObject({ code: "conflict" });
    await repository.claimOperation({ runId, operationId: id(440), workflowRunId: id(1440), parentWorkflowRunId: null, nowMs: 441 });
    await database.collections.artifacts.insertOne({ _id: id(990), bookletId, artifactType: "book_concept_brief", state: "draft", currentVersionId: id(991), taskId: "J01", subjectKind: "book", subjectId: bookletId, experimentRunId: runId, createdAtMs: 1, updatedAtMs: 1 });
    await expect(context.getOperationContext({ runId, operationId: id(440), workflowRunId: id(1440), parentWorkflowRunId: null })).rejects.toMatchObject({ code: "conflict" });
    const other = await setup();
    const judge = await other.start(450, "judge");
    await expect(other.context.getOperationContext(judge.identity)).rejects.toMatchObject({ code: "conflict" });
  });
});
