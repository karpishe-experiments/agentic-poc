import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import type { Database } from "@/db/client";
import { createExperimentRepository } from "@/db/experiment-repository";
import { verifyExperimentData } from "@/db/verify";
import type { Persona } from "@/lib/contracts/experiment-runner";
import { configurationSnapshot, type BookletRunnerConfig } from "@/lib/experiment-runner/config";
import { createExperimentContextService } from "@/lib/experiment-runner/context";
import { createExperimentDispatcher } from "@/lib/experiment-runner/dispatch";
import { simulateNarrativeResult } from "@/lib/experiment-runner/fixtures";
import type { RuntimeExecution, WorkflowRuntime } from "@/lib/experiment-runner/transport";
import { NARRATIVE_DEPENDENCIES, NARRATIVE_TASKS, type NarrativeTask } from "@/lib/experiment-runner/narrative-tasks";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";

const databases: Database[] = [];
afterEach(async () => { await Promise.all(databases.splice(0).map(closeTestDatabase)); });
const fingerprint = "a".repeat(64);

async function setup(persona: Persona) {
  const database = await createTestDatabase({ seedAgents: false });
  databases.push(database);
  const repository = createExperimentRepository(database);
  const context = createExperimentContextService(database);
  const runId = randomUUID(), bookletId = randomUUID();
  const config: BookletRunnerConfig = {
    enabled: true, baseUrl: "https://example.test", publicOrigin: "https://example.test", callbackKey: "x".repeat(32),
    bindings: [
      { role: "manager", taskId: null, persona: null, appId: randomUUID(), publishedWorkflowId: randomUUID(), toolProviderId: null, apiKey: "dummy" },
      ...NARRATIVE_TASKS.map((taskId) => ({ role: "specialist" as const, taskId, persona: null, appId: randomUUID(), publishedWorkflowId: randomUUID(), toolProviderId: null, apiKey: "dummy" })),
      ...(["playful_kid", "enthusiast_parent", "professional_creator"] as const).map((testerPersona) => ({ role: "tester" as const, taskId: null, persona: testerPersona, appId: randomUUID(), publishedWorkflowId: randomUUID(), toolProviderId: null, apiKey: "dummy" })),
    ],
  };
  expect(config.bindings).toHaveLength(11);
  const configuration = configurationSnapshot(config, persona);
  await repository.createRun({ runId, bookletId, persona, mode: "simulated", configuration, nowMs: 1 });
  let tick = 10;
  async function execute(role: "manager" | "specialist" | "tester", taskId: NarrativeTask | null, result?: unknown) {
    const operationId = randomUUID(), workflowRunId = randomUUID(), nowMs = ++tick;
    await repository.prepareOperation({ operationId, runId, expectedRevision: (await repository.getRun(runId))!.revision, role, taskId, subjectKind: "book", subjectId: bookletId, inputFingerprint: fingerprint, attempt: nowMs, providerKind: "text", nowMs });
    await repository.claimOperation({ runId, operationId, workflowRunId, parentWorkflowRunId: null, nowMs: ++tick });
    const operationContext = await context.getOperationContext({ runId, operationId, workflowRunId, parentWorkflowRunId: null });
    const resolved = result ?? simulateNarrativeResult(operationContext, "simulated");
    const envelope = { runId, operationId, workflowRunId, inputFingerprint: fingerprint, result: resolved };
    const completed = await repository.completeOperation({ envelope, parentWorkflowRunId: null, nowMs: ++tick });
    return { ...completed, envelope, operationContext };
  }
  async function propose(taskId: NarrativeTask, directSibling = false) {
    if (!directSibling) {
      const route = await execute("manager", null);
      expect(route.operationContext).toMatchObject({ role: "manager", eligibleRoute: taskId });
      expect(JSON.parse(route.operation.resultJson!)).toMatchObject({ kind: "delegate", payload: { taskId } });
    }
    const saved = await execute("specialist", taskId);
    return JSON.parse(saved.operation.materializationJson!) as { versionId: string; artifactId: string };
  }
  async function approve(versionIds: string[]) {
    return execute("tester", null, { kind: "decision", payload: { decision: { action: "approve", versionIds } } });
  }
  return { database, repository, context, runId, bookletId, persona, config, execute, propose, approve };
}

async function reachFinalLists(persona: Persona, reverseSiblings = false) {
  const harness = await setup(persona);
  const { execute, propose, approve } = harness;
  if (persona !== "professional_creator") {
    const grant = await execute("tester", null);
    expect(JSON.parse(grant.operation.resultJson!)).toMatchObject({ kind: "decision", payload: { decision: { action: "delegate", taskIds: [...NARRATIVE_TASKS] } } });
  }
  const versions = {} as Record<NarrativeTask, string>;
  for (const task of ["J01", "J02"] as const) {
    versions[task] = (await propose(task)).versionId;
    if (persona === "professional_creator") await approve([versions[task]]);
  }
  for (const task of (reverseSiblings ? ["J04", "J03"] : ["J03", "J04"]) as NarrativeTask[]) {
    versions[task] = (await propose(task, reverseSiblings && task === "J04")).versionId;
  }
  if (persona === "professional_creator") await approve([versions.J04, versions.J03]);
  versions.J05 = (await propose("J05")).versionId;
  if (persona === "professional_creator") await approve([versions.J05]);
  for (const task of (reverseSiblings ? ["J07", "J06"] : ["J06", "J07"]) as NarrativeTask[]) {
    versions[task] = (await propose(task, reverseSiblings && task === "J07")).versionId;
  }
  if (persona === "professional_creator") await approve([versions.J07, versions.J06]);
  return { ...harness, versions };
}

describe("M2 durable narrative", () => {
  it.each([
    { persona: "playful_kid", reverseSiblings: false },
    { persona: "enthusiast_parent", reverseSiblings: false },
    { persona: "professional_creator", reverseSiblings: false },
    { persona: "professional_creator", reverseSiblings: true },
  ] as const)("dispatches the normal simulated sequence for $persona (reverse siblings: $reverseSiblings)", async ({ persona, reverseSiblings }) => {
    const { database, repository, context, runId, config } = await setup(persona);
    const saved = new Map<string, RuntimeExecution>();
    let clock = 200;
    const runtime: WorkflowRuntime = {
      async start(binding, input) {
        const workflowRunId = randomUUID();
        const identity = { runId, operationId: input.operationId, workflowRunId, parentWorkflowRunId: input.parentWorkflowRunId };
        expect((await repository.claimOperation({ ...identity, nowMs: clock++ })).started).toBe(true);
        const operationContext = await context.getOperationContext(identity);
        let result = simulateNarrativeResult(operationContext, "simulated");
        if (reverseSiblings && result.kind === "delegate") {
          const sibling = result.payload.taskId === "J03" ? "J04" : result.payload.taskId === "J06" ? "J07" : null;
          const view = (await context.getRunView(runId))!;
          if (sibling && !view.currentArtifacts.some((item) => item.taskId === sibling)) result = { kind: "delegate", payload: { ...result.payload, taskId: sibling } };
        }
        const operation = (await repository.getOperation(input.operationId))!;
        const envelope = { ...identity, inputFingerprint: operation.inputFingerprint, result };
        const execution: RuntimeExecution = { id: workflowRunId, workflow_id: binding.publishedWorkflowId, status: "succeeded", outputs: { booklet_result: JSON.stringify(envelope) } };
        saved.set(workflowRunId, execution);
        await repository.completeOperation({ envelope: { runId, operationId: input.operationId, workflowRunId, inputFingerprint: operation.inputFingerprint, result }, parentWorkflowRunId: input.parentWorkflowRunId, nowMs: clock++ });
        return { kind: "execution", execution };
      },
      async retrieve(_binding, workflowRunId) {
        const execution = saved.get(workflowRunId);
        return execution ? { kind: "execution", execution } : { kind: "unknown" };
      },
    };
    const dispatcher = () => createExperimentDispatcher({ database, config, runtime, mutate: async (fn) => fn(), now: () => clock++ });
    let outcome: Awaited<ReturnType<ReturnType<typeof createExperimentDispatcher>["advance"]>> = "waiting";
    for (let step = 0; step < 40; step++) {
      outcome = await dispatcher().advance(runId);
      if (outcome === "boundary") break;
    }
    expect(outcome).toBe("boundary");
    const view = (await context.getRunView(runId))!;
    expect(view.currentArtifacts).toHaveLength(7);
    expect(view.currentArtifacts.every((item) => item.state === "approved")).toBe(true);
    expect(view.counters.payableText).toBe(0);
    expect(view.counters.payableImage).toBe(0);
    const operations = await repository.listOperations(runId);
    expect(operations.filter((operation) => operation.role === "specialist")).toHaveLength(7);
    if (reverseSiblings) expect(operations.filter((operation) => operation.role === "specialist").map((operation) => operation.taskId)).toEqual(["J01", "J02", "J04", "J03", "J05", "J07", "J06"]);
    expect(operations.filter((operation) => operation.role === "specialist").every((operation) => operation.parentWorkflowRunId)).toBeTruthy();
    const approvals = await database.collections.approvals.find({ experimentRunId: runId }).toArray();
    expect(approvals).toHaveLength(7);
    expect(new Set(approvals.map((item) => item.origin))).toEqual(new Set([persona === "professional_creator" ? "explicit" : "delegated"]));
    if (persona === "professional_creator") expect(approvals.filter((item) => item.reviewGroupId)).toHaveLength(4);
    expect((await context.getRunView(runId))!.nextNarrativeTask).toBe("slice_complete");
    await expect(verifyExperimentData(database)).resolves.toBeUndefined();
  });

  it.each(["playful_kid", "enthusiast_parent", "professional_creator"] as const)("persists all seven approved tasks for %s", async (persona) => {
    const { database, context, runId, bookletId, versions } = await reachFinalLists(persona, persona === "enthusiast_parent");
    const view = await createExperimentContextService(database).getRunView(runId);
    expect(view?.nextNarrativeTask).toBe("slice_complete");
    expect(view?.currentArtifacts).toHaveLength(7);
    expect(view?.currentArtifacts.map((item) => item.state)).toEqual(Array(7).fill("approved"));
    expect(await database.collections.booklets.findOne({ _id: bookletId })).toMatchObject({ currentStage: "J08" });
    for (const task of NARRATIVE_TASKS) {
      const edges = await database.collections.artifact_dependencies.find({ downstreamVersionId: versions[task] }).toArray();
      expect(edges.map((edge) => edge.upstreamVersionId).sort()).toEqual(NARRATIVE_DEPENDENCIES[task].map((source) => versions[source]).sort());
    }
    const content = (task: NarrativeTask) => view!.currentArtifacts.find((item) => item.taskId === task)!.versions.at(-1)!.content as Record<string, unknown>;
    const cast = (content("J03").characters as { characterId: string }[]).map((item) => item.characterId);
    const places = (content("J04").locations as { locationId: string }[]).map((item) => item.locationId);
    const units = (content("J05").units as { unitId: string; charactersPresent: string[]; locationId: string }[]);
    expect(new Set(cast).size).toBe(2);
    expect(new Set(places).size).toBe(persona === "professional_creator" ? 2 : 1);
    expect(new Set(units.map((item) => item.unitId)).size).toBe(units.length);
    for (const unit of units) {
      expect(unit.charactersPresent.every((id) => cast.includes(id))).toBe(true);
      expect(places).toContain(unit.locationId);
    }
    expect((content("J06").characters as { characterId: string }[]).map((item) => item.characterId).sort()).toEqual(cast.sort());
    expect((content("J07").locations as { locationId: string }[]).map((item) => item.locationId).sort()).toEqual(places.sort());
    const approvals = await database.collections.approvals.find({ experimentRunId: runId }).toArray();
    expect(approvals).toHaveLength(7);
    expect(new Set(approvals.map((item) => item.origin))).toEqual(new Set([persona === "professional_creator" ? "explicit" : "delegated"]));
    if (persona === "professional_creator") expect(approvals.filter((item) => item.reviewGroupId)).toHaveLength(4);
    expect((await database.collections.experiment_runs.findOne({ _id: runId }))!.counters.payableImage).toBe(0);
    expect((await database.collections.experiment_runs.findOne({ _id: runId }))!.counters.payableText).toBe(0);
    expect(await context.getRunView(runId)).toEqual(view);
    await expect(verifyExperimentData(database)).resolves.toBeUndefined();
  });

  it("keeps subject IDs on J03 revision and invalidates only dependent current work", async () => {
    const { database, context, runId, bookletId, versions, execute } = await reachFinalLists("playful_kid");
    const before = (await context.getRunView(runId))!.currentArtifacts;
    const oldCast = (before.find((item) => item.taskId === "J03")!.versions.at(-1)!.content as { characters: { characterId: string }[] }).characters.map((item) => item.characterId);
    const oldUnitIds = (before.find((item) => item.taskId === "J05")!.versions.at(-1)!.content as { units: { unitId: string }[] }).units.map((item) => item.unitId);
    await execute("tester", null, { kind: "decision", payload: { decision: { action: "revise", taskId: "J03", artifactVersionId: versions.J03, instruction: "Rename the inventor but preserve the cast." } } });
    const fixtureContext = await context.getRunView(runId);
    expect(fixtureContext?.nextNarrativeTask).toBe("J03");
    const currentDraft = before.find((item) => item.taskId === "J03")!.versions.at(-1)!.content as { characters: { entryKey: string; nameOrRole: string; characterId: string }[] };
    const revisedContent = {
      ...currentDraft,
      characters: currentDraft.characters.map((row) => ({ ...row, nameOrRole: row.entryKey === "character_1" ? `${row.nameOrRole} Renamed` : row.nameOrRole })).reverse(),
    };
    const revised = await execute("specialist", "J03", { kind: "proposal", payload: { taskId: "J03", content: revisedContent } });
    const newVersionId = (JSON.parse(revised.operation.materializationJson!) as { versionId: string }).versionId;
    const after = (await context.getRunView(runId))!.currentArtifacts;
    const newCast = (after.find((item) => item.taskId === "J03")!.versions.at(-1)!.content as { characters: { characterId: string }[] }).characters.map((item) => item.characterId);
    expect(newCast.slice().sort()).toEqual(oldCast.slice().sort());
    const savedRows = (after.find((item) => item.taskId === "J03")!.versions.at(-1)!.content as { characters: { entryKey: string; characterId: string }[] }).characters;
    for (const row of savedRows) expect(row.characterId).toBe(currentDraft.characters.find((original) => original.entryKey === row.entryKey)!.characterId);
    expect((after.find((item) => item.taskId === "J03")!.versions.at(-1)!.content as { characters: { nameOrRole: string }[] }).characters.some((item) => item.nameOrRole.endsWith("Renamed"))).toBe(true);
    expect(newVersionId).not.toBe(versions.J03);
    expect(after.find((item) => item.taskId === "J04")).toMatchObject({ state: "approved", currentVersionId: versions.J04 });
    for (const task of ["J05", "J06", "J07"] as const) expect(after.find((item) => item.taskId === task)).toMatchObject({ state: "needs_review", currentVersionId: versions[task] });
    expect(await database.collections.artifact_versions.findOne({ _id: versions.J03 })).not.toBeNull();
    expect(await database.collections.booklets.findOne({ _id: bookletId })).toMatchObject({ currentStage: "J05" });
    const rebuiltManuscript = await execute("specialist", "J05");
    const rebuiltUnits = ((await context.getRunView(runId))!.currentArtifacts.find((item) => item.taskId === "J05")!.versions.at(-1)!.content as { units: { unitId: string }[] }).units.map((item) => item.unitId);
    expect(rebuiltUnits).toEqual(oldUnitIds);
    expect(JSON.parse(rebuiltManuscript.operation.materializationJson!)).toMatchObject({ versionId: expect.any(String) });
    await execute("specialist", "J06");
    await execute("specialist", "J07");
    expect((await context.getRunView(runId))!.nextNarrativeTask).toBe("slice_complete");
    await expect(verifyExperimentData(database)).resolves.toBeUndefined();
  });

  it("rejects unknown manuscript references atomically and replays a valid callback without new IDs", async () => {
    const harness = await setup("playful_kid");
    const { database, repository, context, runId, execute, propose } = harness;
    await execute("tester", null);
    await propose("J01"); await propose("J02"); await propose("J03"); await propose("J04");
    const operationId = randomUUID(), workflowRunId = randomUUID();
    await repository.prepareOperation({ runId, operationId, expectedRevision: (await repository.getRun(runId))!.revision, role: "specialist", taskId: "J05", subjectKind: "book", subjectId: harness.bookletId, inputFingerprint: fingerprint, attempt: 99, providerKind: "text", nowMs: 100 });
    await repository.claimOperation({ runId, operationId, workflowRunId, parentWorkflowRunId: null, nowMs: 101 });
    const proposal = simulateNarrativeResult(await context.getOperationContext({ runId, operationId, workflowRunId, parentWorkflowRunId: null }), "simulated");
    if (proposal.kind !== "proposal") throw new Error("Expected fixture manuscript proposal.");
    const content = proposal.payload.content as { units: { charactersPresent: string[] }[] };
    const badResult = { kind: "proposal", payload: { taskId: "J05", content: { ...content, units: [{ ...content.units[0], charactersPresent: [randomUUID()] }, ...content.units.slice(1)] } } };
    const envelope = { runId, operationId, workflowRunId, inputFingerprint: fingerprint, result: badResult };
    await expect(repository.completeOperation({ envelope, parentWorkflowRunId: null, nowMs: 102 })).rejects.toMatchObject({ code: "invalid_result" });
    expect(await database.collections.artifacts.findOne({ experimentRunId: runId, taskId: "J05" })).toBeNull();
    const goodEnvelope = { ...envelope, result: proposal };
    const saved = await repository.completeOperation({ envelope: goodEnvelope, parentWorkflowRunId: null, nowMs: 103 });
    const replay = await repository.completeOperation({ envelope: goodEnvelope, parentWorkflowRunId: null, nowMs: 104 });
    expect(replay.reused).toBe(true);
    expect(replay.operation.materializationJson).toBe(saved.operation.materializationJson);
    expect(await database.collections.artifact_versions.countDocuments({ sourceOperationId: operationId })).toBe(1);
  });

  it("rejects final-list unit, recurrence and location identity errors without saving drafts", async () => {
    const harness = await setup("playful_kid");
    const { database, repository, context, runId, execute, propose } = harness;
    await execute("tester", null);
    for (const task of ["J01", "J02", "J03", "J04", "J05"] as const) await propose(task);
    async function rejected(taskId: "J06" | "J07", mutations: ((content: Record<string, unknown>) => Record<string, unknown>)[]) {
      const operationId = randomUUID(), workflowRunId = randomUUID();
      await repository.prepareOperation({ runId, operationId, expectedRevision: (await repository.getRun(runId))!.revision, role: "specialist", taskId, subjectKind: "book", subjectId: harness.bookletId, inputFingerprint: fingerprint, attempt: 200, providerKind: "text", nowMs: 200 });
      await repository.claimOperation({ runId, operationId, workflowRunId, parentWorkflowRunId: null, nowMs: 201 });
      const valid = simulateNarrativeResult(await context.getOperationContext({ runId, operationId, workflowRunId, parentWorkflowRunId: null }), "simulated");
      if (valid.kind !== "proposal") throw new Error("Expected final-list fixture proposal.");
      for (const mutate of mutations) {
        await expect(repository.completeOperation({ envelope: { runId, operationId, workflowRunId, inputFingerprint: fingerprint, result: { kind: "proposal", payload: { taskId, content: mutate(valid.payload.content as Record<string, unknown>) } } }, parentWorkflowRunId: null, nowMs: 202 })).rejects.toMatchObject({ code: "invalid_result" });
        expect(await database.collections.artifacts.findOne({ experimentRunId: runId, taskId })).toBeNull();
      }
      await repository.completeOperation({ envelope: { runId, operationId, workflowRunId, inputFingerprint: fingerprint, result: valid }, parentWorkflowRunId: null, nowMs: 203 });
    }
    await rejected("J06", [
      (content) => ({ ...content, characters: (content.characters as Record<string, unknown>[]).map((row, index) => index === 0 ? { ...row, unitIds: [randomUUID()] } : row) }),
      (content) => ({ ...content, characters: (content.characters as Record<string, unknown>[]).map((row, index) => index === 0 ? { ...row, recurrence: "single_scene", sheetRequired: false } : row) }),
    ]);
    await rejected("J07", [(content) => ({ ...content, locations: (content.locations as Record<string, unknown>[]).map((row) => ({ ...row, locationId: randomUUID() })) })]);
    expect((await context.getRunView(runId))!.nextNarrativeTask).toBe("slice_complete");
  });

  it("keeps an M1 configuration at the J02 boundary", async () => {
    const database = await createTestDatabase({ seedAgents: false }); databases.push(database);
    const repository = createExperimentRepository(database), runId = randomUUID(), bookletId = randomUUID();
    await repository.createRun({ runId, bookletId, persona: "playful_kid", mode: "simulated", configuration: [], nowMs: 1 });
    await expect(repository.prepareOperation({ runId, operationId: randomUUID(), expectedRevision: 0, role: "specialist", taskId: "J03", subjectKind: "book", subjectId: bookletId, inputFingerprint: fingerprint, attempt: 1, providerKind: "text", nowMs: 2 })).rejects.toMatchObject({ code: "conflict" });
    const operationId = randomUUID(), workflowRunId = randomUUID();
    await repository.prepareOperation({ runId, operationId, expectedRevision: 0, role: "tester", taskId: null, subjectKind: "book", subjectId: bookletId, inputFingerprint: fingerprint, attempt: 2, providerKind: "text", nowMs: 3 });
    await repository.claimOperation({ runId, operationId, workflowRunId, parentWorkflowRunId: null, nowMs: 4 });
    await expect(repository.completeOperation({ envelope: { runId, operationId, workflowRunId, inputFingerprint: fingerprint, result: { kind: "decision", payload: { decision: { action: "delegate", taskIds: ["J03"], subjectId: bookletId } } } }, parentWorkflowRunId: null, nowMs: 5 })).rejects.toMatchObject({ code: "invalid_result" });
  });
});
