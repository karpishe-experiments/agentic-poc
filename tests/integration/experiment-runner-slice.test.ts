import { createHash, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import type { Database } from "@/db/client";
import { createExperimentRepository } from "@/db/experiment-repository";
import { verifyExperimentData } from "@/db/verify";
import { createExperimentContextService } from "@/lib/experiment-runner/context";
import { simulateNarrativeResult } from "@/lib/experiment-runner/fixtures";
import { CASES, type Persona, type RoleResult } from "@/lib/contracts/experiment-runner";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";

const databases: Database[] = [];
afterEach(async () => { await Promise.all(databases.splice(0).map(closeTestDatabase)); });

// Supplemental local transport proof. It does not replace Dify/staging acceptance.
describe("local simulated narrative slice", () => {
  for (const persona of Object.keys(CASES) as Persona[]) {
    it(`retains two accepted artifacts and tester provenance for ${persona}`, async () => {
      const database = await createTestDatabase({ seedAgents: false });
      databases.push(database);
      const repository = createExperimentRepository(database);
      const context = createExperimentContextService(database);
      const runId = randomUUID(), bookletId = randomUUID();
      await repository.createRun({ runId, bookletId, persona, mode: "simulated", configuration: [], nowMs: 1 });
      let clock = 2;

      async function execute(role: "manager" | "specialist" | "tester", taskId: "J01" | "J02" | null = null, parentWorkflowRunId: string | null = null, overrideResult?: RoleResult | ((fixture: RoleResult) => RoleResult)) {
        const run = (await repository.getRun(runId))!;
        const operationId = randomUUID(), workflowRunId = randomUUID();
        const inputFingerprint = createHash("sha256").update(JSON.stringify({ revision: run.revision, taskId, role })).digest("hex");
        await repository.prepareOperation({ operationId, runId, expectedRevision: run.revision, role, taskId, subjectKind: "book", subjectId: bookletId, inputFingerprint, attempt: 1, providerKind: "text", nowMs: clock++ });
        const identity = { runId, operationId, workflowRunId, parentWorkflowRunId };
        expect((await repository.claimOperation({ ...identity, nowMs: clock++ })).started).toBe(true);
        const operationContext = await context.getOperationContext(identity);
        const result = typeof overrideResult === "function" ? overrideResult(simulateNarrativeResult(operationContext, "simulated")) : overrideResult ?? simulateNarrativeResult(operationContext, "simulated");
        await repository.completeOperation({ envelope: { runId, operationId, workflowRunId, inputFingerprint, result }, parentWorkflowRunId, nowMs: clock++ });
        return workflowRunId;
      }

      if (persona !== "professional_creator") await execute("tester");
      for (let step = 0; step < 12; step++) {
        const next = (await context.getRunView(runId))!.nextNarrativeTask;
        if (next === "slice_complete") break;
        if (next === "tester") await execute("tester");
        else if (next === "J01" || next === "J02") {
          const parent = await execute("manager");
          await execute("specialist", next, parent);
        } else throw new Error("Local narrative slice made no progress.");
      }
      const view = (await context.getRunView(runId))!;
      expect(view).toMatchObject({ nextNarrativeTask: "slice_complete", status: "queued", counters: { payableText: 0, payableImage: 0 } });
      expect(view.currentArtifacts).toHaveLength(2);
      expect(view.currentArtifacts.every((artifact) => artifact.state === "approved")).toBe(true);
      const savedApprovals = await database.collections.approvals.find({ experimentRunId: runId }).toArray();
      expect(savedApprovals).toHaveLength(2);
      expect(savedApprovals.every((approval) => approval.origin === (persona === "professional_creator" ? "explicit" : "delegated"))).toBe(true);
      const operations = await repository.listOperations(runId);
      expect(operations.every((operation) => operation.state === "succeeded" && operation.reservationCount === 1)).toBe(true);
      expect(operations.filter((operation) => operation.role === "specialist").every((operation) => operation.parentWorkflowRunId !== null)).toBe(true);
      expect(await database.collections.agent_versions.countDocuments()).toBe(0);
      await expect(verifyExperimentData(database)).resolves.toBeUndefined();
      expect((await createExperimentContextService(database).getRunView(runId))!.currentArtifacts).toEqual(view.currentArtifacts);
      if (persona === "professional_creator") {
        const oldJ1 = view.currentArtifacts.find((item) => item.taskId === "J01")!.currentVersionId!;
        const oldJ2 = view.currentArtifacts.find((item) => item.taskId === "J02")!.currentVersionId!;
        await execute("tester", null, null, { kind: "decision", payload: { decision: { action: "revise", taskId: "J01", artifactVersionId: oldJ1, instruction: "Make the tone more hopeful." } } });
        expect((await context.getRunView(runId))!.nextNarrativeTask).toBe("J01");
        const j1Parent = await execute("manager");
        await execute("specialist", "J01", j1Parent, (fixture) => {
          if (fixture.kind !== "proposal" || fixture.payload.taskId !== "J01") throw new Error("Expected J01 proposal.");
          return { kind: "proposal", payload: { taskId: "J01", content: { ...fixture.payload.content as object, title: "The Renewed Observatory", premise: "Two friends restore a lantern for a community star night.", theme: "Listening repairs trust.", emotionalPromise: "Both friends feel heard and hopeful.", knownConstraints: ["Show the repair as a shared effort."] } } };
        });
        const afterJ1Draft = (await context.getRunView(runId))!;
        expect(afterJ1Draft.currentArtifacts.find((item) => item.taskId === "J02")!.state).toBe("needs_review");
        const revisedJ1 = afterJ1Draft.currentArtifacts.find((item) => item.taskId === "J01")!;
        expect(revisedJ1.versions).toHaveLength(2);
        expect(revisedJ1.versions[1].sourceVersionId).toBe(oldJ1);
        expect(revisedJ1.versions[1].content).toMatchObject({ tone: expect.stringContaining("Make the tone more hopeful.") });
        await execute("tester");
        const afterJ1Approval = (await context.getRunView(runId))!;
        expect(afterJ1Approval.currentArtifacts.find((item) => item.taskId === "J01")!.state).toBe("approved");
        expect(afterJ1Approval.currentArtifacts.find((item) => item.taskId === "J02")!.state).toBe("needs_review");
        expect(afterJ1Approval.nextNarrativeTask).toBe("J02");
        const j2Parent = await execute("manager");
        await execute("specialist", "J02", j2Parent);
        await execute("tester");
        const final = (await context.getRunView(runId))!;
        expect(final.nextNarrativeTask).toBe("slice_complete");
        expect(final.currentArtifacts.every((item) => item.state === "approved" && item.versions.length === 2)).toBe(true);
        expect(final.currentArtifacts.find((item) => item.taskId === "J02")!.versions[1].dependencyVersionIds).toEqual([revisedJ1.currentVersionId]);
        const revisedJ2Content = final.currentArtifacts.find((item) => item.taskId === "J02")!.versions[1].content;
        expect(revisedJ2Content).toMatchObject({ title: "The Renewed Observatory", theme: "Listening repairs trust.", emotionalArc: "Both friends feel heard and hopeful.", summary: expect.stringContaining("Two friends restore a lantern for a community star night.") });
        expect(revisedJ2Content).toMatchObject({ summary: expect.stringContaining("Make the tone more hopeful."), deferredDecisions: expect.arrayContaining(["Approved concept constraint: Show the repair as a shared effort."]) });
        expect(final.currentArtifacts.find((item) => item.taskId === "J02")!.versions[0].id).toBe(oldJ2);
        expect(await database.collections.approvals.countDocuments({ experimentRunId: runId })).toBe(4);
        await expect(verifyExperimentData(database)).resolves.toBeUndefined();
      }
    });
  }
});
