import { afterEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/db/client";
import { createExperimentRepository } from "@/db/experiment-repository";
import { materializePageLayout, verifyCurrentPageBibleSources } from "@/db/experiment-pages";
import { simulatePaginationProposal } from "@/lib/experiment-runner/pagination-fixtures";
import { styleModuleHash } from "@/lib/contracts/experiment-references";
import type { AssetStore } from "@/lib/assets/asset-store";
import { id, paginationSources } from "@/tests/helpers/pagination-fixtures";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";

// This harness checks source selection and byte-verifier invocation. Assembly
// lineage and hashing are exercised by their own integration suites.
vi.mock("@/db/experiment-style", () => ({ createExperimentStyleAssembly: () => ({ verifyVersion: async () => undefined }) }));
vi.mock("@/db/experiment-sheets", () => ({ createExperimentSheetAssembly: (input: { database: Database; store: AssetStore }) => ({
  verifyVersion: async ({ versionId }: { versionId: string }) => {
    const version = await input.database.collections.artifact_versions.findOne({ _id: versionId });
    const content = JSON.parse(version!.contentJson) as { build: { assetId: string } };
    await input.store.get(content.build.assetId);
  },
}) }));

const databases: Database[] = [];
afterEach(async () => { await Promise.all(databases.splice(0).map(closeTestDatabase)); });

async function setup() {
  const database = await createTestDatabase({ seedAgents: false }); databases.push(database);
  const runId = id(1), bookletId = id(2);
  const repository = createExperimentRepository(database);
  await repository.createRun({ runId, bookletId, persona: "playful_kid", mode: "simulated", configuration: [], nowMs: 1 });
  const sources = paginationSources("playful_kid");
  for (const source of sources.filter((item) => item.taskId === "J09" || item.taskId === "J10")) {
    const content = source.content as { stylePromptModule: string; stylePromptModuleHash: string; finalListVersionId: string; build: { prompt: string; stylePromptModuleHash: string; sourceVersionIds: string[] } };
    content.stylePromptModuleHash = styleModuleHash(content.stylePromptModule);
    content.build.stylePromptModuleHash = content.stylePromptModuleHash;
    content.build.prompt = `${content.stylePromptModule}\nSheet`;
    content.build.sourceVersionIds = [content.finalListVersionId, id(8)];
  }
  const proposal = simulatePaginationProposal({ persona: "playful_kid", sources });
  if (proposal.kind !== "proposal") throw new Error("Expected J11 proposal.");
  let next = 100;
  const layout = materializePageLayout("playful_kid", proposal.content, null, () => id(next++));
  const store = { read: [] as string[], bad: new Set<string>(),
    async put() { throw new Error("unused"); },
    async exists() { return true; },
    async get(uri: string) { this.read.push(uri); if (this.bad.has(uri)) throw new Error("corrupt byte"); return new Uint8Array([1]); },
  } as AssetStore & { read: string[]; bad: Set<string> };
  const all = [...sources, { taskId: "J11", id: id(90), content: layout, subjectKind: "book", subjectId: bookletId }];
  for (const [index, item] of all.entries()) {
    const artifactId = id(200 + index);
    await database.collections.artifacts.insertOne({ _id: artifactId, bookletId, artifactType: item.taskId, taskId: item.taskId as never,
      experimentRunId: runId, subjectKind: (item.subjectKind ?? "book") as never, subjectId: item.subjectId ?? bookletId,
      state: "approved", currentVersionId: item.id, createdAtMs: 1, updatedAtMs: 1 });
    await database.collections.artifact_versions.insertOne({ _id: item.id, artifactId, versionNumber: 1, schemaVersion: "2",
      contentJson: JSON.stringify(item.content), dependencyVersionIdsJson: item.taskId === "J11" ? JSON.stringify(sources.map((source) => source.id)) : "[]",
      createdBy: item.taskId === "J09" || item.taskId === "J10" || item.taskId === "J08" ? "application" : "agent",
      sourceVersionId: null, sourceExecutionBatchId: null, createdAtMs: 1 });
    await database.collections.approvals.insertOne({ _id: id(300 + index), bookletId, artifactVersionId: item.id,
      scope: "artifact", subjectKey: null, action: "approve", origin: "explicit", sourceApprovalId: null, cardResponseId: null,
      qualityReviewId: null, experimentRunId: runId, testerDecisionId: id(400), createdAtMs: 1 });
  }
  for (const [index, source] of sources.entries()) await database.collections.artifact_dependencies.insertOne({
    _id: id(500 + index), downstreamVersionId: id(90), upstreamVersionId: source.id, createdAtMs: 1,
  });
  const run = (await repository.getRun(runId))!;
  const verify = (pageId = layout.pages[1].pageId) => database.client.withSession((session) =>
    verifyCurrentPageBibleSources(database, session, run, pageId, store));
  return { database, layout, store, verify, runId };
}

describe("J12 saved page source verification", () => {
  it("returns exact current sources and reads only selected sheet bytes", async () => {
    const { layout, store, verify } = await setup();
    const selected = layout.pages[1];
    const result = await verify();
    expect(result.page.pageId).toBe(selected.pageId);
    expect(result.versionIds.slice(0, 3)).toEqual([id(90), id(5), id(8)]);
    expect(new Set(store.read)).toEqual(new Set(selected.panels.flatMap((panel) => panel.sheetReferences.map((ref) => ref.assetId))));
    store.bad.add(id(71));
    await expect(verify()).resolves.toBeDefined();
    expect(store.read).not.toContain(id(71));
  });

  it("rejects missing approval, stale source and damaged edge", async () => {
    const { database, verify, runId } = await setup();
    await database.collections.approvals.deleteOne({ experimentRunId: runId, artifactVersionId: id(5) });
    await expect(verify()).rejects.toThrow();
    await database.collections.approvals.insertOne({ _id: id(999), bookletId: id(2), artifactVersionId: id(5), scope: "artifact",
      subjectKey: null, action: "approve", origin: "explicit", sourceApprovalId: null, cardResponseId: null, qualityReviewId: null,
      experimentRunId: runId, testerDecisionId: id(400), createdAtMs: 1 });
    await database.collections.artifact_dependencies.deleteOne({ downstreamVersionId: id(90), upstreamVersionId: id(5) });
    await expect(verify()).rejects.toThrow("dependency edges");
    await database.collections.artifact_dependencies.insertOne({ _id: id(998), downstreamVersionId: id(90), upstreamVersionId: id(5), createdAtMs: 1 });
    await database.collections.artifacts.updateOne({ taskId: "J05", experimentRunId: runId }, { $set: { state: "needs_review" } });
    await expect(verify()).rejects.toThrow();
  });

  it("rejects stale sheet asset tuple and a corrupt selected byte", async () => {
    const { database, layout, store, verify } = await setup();
    const selectedAsset = layout.pages[1].panels[0].sheetReferences[0].assetId;
    store.bad.add(selectedAsset);
    await expect(verify()).rejects.toThrow("corrupt byte");
    store.bad.clear();
    const changed = structuredClone(layout);
    changed.pages[1].panels[0].sheetReferences[0].assetId = id(997);
    await database.collections.artifact_versions.updateOne({ _id: id(90) }, { $set: { contentJson: JSON.stringify(changed) } });
    await expect(verify()).rejects.toThrow("asset differs");
  });
});
