import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import type { Database } from "@/db/client";
import { createExperimentRepository } from "@/db/experiment-repository";
import { materializePageLayout, verifyCurrentPageIllustrationSources, verifyCurrentApprovedPageBibles } from "@/db/experiment-pages";
import { simulatePaginationProposal } from "@/lib/experiment-runner/pagination-fixtures";
import { simulatePageBibleProposal } from "@/lib/experiment-runner/page-bible-fixtures";
import { parsePageBibleForLayout } from "@/lib/experiment-runner/page-bible-tasks";
import { styleModuleHash } from "@/lib/contracts/experiment-references";
import type { Persona } from "@/lib/contracts/experiment-runner";
import type { AssetStore } from "@/lib/assets/asset-store";
import { id, paginationSources } from "@/tests/helpers/pagination-fixtures";
import { closeTestDatabase, createTestDatabase } from "@/tests/helpers/mongodb";
import { verificationMetadata } from "@/db/experiment-verification-metadata";
import { createVerificationAttempt } from "@/lib/experiment-runner/verification-attempt";

vi.mock("@/db/experiment-style", () => ({ createExperimentStyleAssembly: () => ({ verifyVersion: async () => undefined }) }));
vi.mock("@/db/experiment-sheets", () => ({ createExperimentSheetAssembly: () => ({ verifyVersion: async () => undefined }) }));

const databases: Database[] = [];
afterEach(async () => { await Promise.all(databases.splice(0).map(closeTestDatabase)); });

async function setup(persona: Persona = "playful_kid", pageIndex = 1) {
  const database = await createTestDatabase({ seedAgents: false }); databases.push(database);
  const runId = id(1), bookletId = id(2), repository = createExperimentRepository(database);
  await repository.createRun({ runId, bookletId, persona, mode: "simulated", configuration: [], nowMs: 1 });
  const sources = paginationSources(persona);
  const styleModule = "Use the same soft ink lines.\n";
  const j08 = sources.find((source) => source.taskId === "J08")!;
  j08.content = {
    schemaVersion: "2", title: "Style", styleDefinition: { mediumAndLineWork: "ink", shapeLanguageAndProportions: "round",
      colourAndContrast: "warm", textureAndRendering: "paper", lightingAndAtmosphere: "soft", emotionalTone: "hopeful", accessibilityAndReadability: "clear" },
    typographyDirection: "legible", speechAndThoughtBubbleDirection: "rounded", stylePromptModule: styleModule,
    stylePromptModuleHash: styleModuleHash(styleModule), exclusions: [], approvalQuestions: [], draftStyleVersionId: id(81),
    samples: ["sample_1", "sample_2"].map((sampleKey, index) => ({ sampleKey, purpose: `Sample ${index + 1}`,
      build: { prompt: `${styleModule}sample`, stylePromptModuleHash: styleModuleHash(styleModule), operationId: id(210 + index),
        assetId: id(220 + index), sourceVersionIds: [id(81), id(1)] } })),
  };
  for (const source of sources.filter((item) => item.taskId === "J09" || item.taskId === "J10")) {
    const content = source.content as { stylePromptModule: string; stylePromptModuleHash: string; finalListVersionId: string; build: { prompt: string; stylePromptModuleHash: string; sourceVersionIds: string[] } };
    content.stylePromptModuleHash = styleModuleHash(content.stylePromptModule);
    content.build.stylePromptModuleHash = content.stylePromptModuleHash;
    content.build.prompt = `${content.stylePromptModule}\nSheet`;
    content.build.sourceVersionIds = [content.finalListVersionId, id(8)];
  }
  const pagination = simulatePaginationProposal({ persona, sources });
  if (pagination.kind !== "proposal") throw new Error("Expected J11 proposal.");
  let next = 100;
  const layout = materializePageLayout(persona, pagination.content, null, () => id(next++));
  const pageId = layout.pages[pageIndex]!.pageId;
  const bible = simulatePageBibleProposal({ persona, pageId,
    sources: [...sources, { taskId: "J11", id: id(90), content: layout }] });
  if (bible.kind !== "proposal") throw new Error("Expected J12 proposal.");
  const files = new Map<string, Uint8Array>();
  const get = vi.fn(async (uri: string) => { const bytes = files.get(uri); if (!bytes) throw new Error("missing bytes"); return Uint8Array.from(bytes); });
  const store = {
    async put() { throw new Error("unused"); }, async exists(uri: string) { return files.has(uri); }, get,
  } as AssetStore;
  const all = [...sources, { taskId: "J11", id: id(90), content: layout, subjectKind: "book", subjectId: bookletId },
    { taskId: "J12", id: id(91), content: bible.content, subjectKind: "page", subjectId: pageId }];
  for (const [index, item] of all.entries()) {
    const artifactId = id(300 + index);
    const dependencies = item.taskId === "J11" ? sources.map((source) => source.id) : item.taskId === "J12"
      ? parsePageBibleForLayout({ persona, pageId, layout, layoutVersionId: id(90), manuscriptVersionId: id(5), styleVersionId: id(8), proposal: bible.content }).dependencyVersionIds
      : [];
    await database.collections.artifacts.insertOne({ _id: artifactId, bookletId, artifactType: item.taskId, taskId: item.taskId as never,
      experimentRunId: runId, subjectKind: (item.subjectKind ?? "book") as never, subjectId: item.subjectId ?? bookletId,
      state: "approved", currentVersionId: item.id, createdAtMs: 1, updatedAtMs: 1 });
    await database.collections.artifact_versions.insertOne({ _id: item.id, artifactId, versionNumber: 1, schemaVersion: "2",
      contentJson: JSON.stringify(item.content), dependencyVersionIdsJson: JSON.stringify(dependencies),
      createdBy: item.taskId === "J08" || item.taskId === "J09" || item.taskId === "J10" ? "application" : "agent",
      sourceVersionId: null, sourceExecutionBatchId: null, createdAtMs: 1 });
    await database.collections.approvals.insertOne({ _id: id(500 + index), bookletId, artifactVersionId: item.id, scope: "artifact",
      subjectKey: null, action: "approve", origin: "explicit", sourceApprovalId: null, cardResponseId: null, qualityReviewId: null,
      experimentRunId: runId, testerDecisionId: id(600), createdAtMs: 1 });
    for (const [edgeIndex, upstreamVersionId] of dependencies.entries()) await database.collections.artifact_dependencies.insertOne({
      _id: id(700 + index * 20 + edgeIndex), downstreamVersionId: item.id, upstreamVersionId, createdAtMs: 1 });
  }
  const references = layout.pages[pageIndex]!.panels.flatMap((panel) => panel.sheetReferences)
    .filter((reference, index, all) => all.findIndex((candidate) => candidate.assetId === reference.assetId) === index);
  for (const reference of references) {
    const bytes = new Uint8Array(await sharp({ create: { width: 3, height: 2, channels: 3, background: "#73aade" } }).png().toBuffer());
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const uri = `sheet/${reference.assetId}.png`; files.set(uri, bytes);
    await database.collections.assets.insertOne({ _id: reference.assetId, bookletId, kind: "reference", uri, mimeType: "image/png",
      width: 3, height: 2, sourceAssetId: null, metadataJson: JSON.stringify({ sha256, byteLength: bytes.byteLength }), createdAtMs: 1 });
  }
  const run = (await repository.getRun(runId))!;
  const verify = () => database.client.withSession((session) => verifyCurrentPageIllustrationSources(database, session, run, pageId, store));
  async function addSiblingBibles() {
    for (const [index, page] of layout.pages.entries()) {
      if (page.pageId === pageId) continue;
      const proposal = simulatePageBibleProposal({ persona, pageId: page.pageId,
        sources: [...sources, { taskId: "J11", id: id(90), content: layout }] });
      if (proposal.kind !== "proposal") throw new Error("Expected sibling Bible.");
      const dependencies = parsePageBibleForLayout({ persona, pageId: page.pageId, layout,
        layoutVersionId: id(90), manuscriptVersionId: id(5), styleVersionId: id(8), proposal: proposal.content }).dependencyVersionIds;
      const artifactId = id(1100 + index), versionId = id(1200 + index);
      await database.collections.artifacts.insertOne({ _id: artifactId, bookletId, artifactType: "J12", taskId: "J12",
        experimentRunId: runId, subjectKind: "page", subjectId: page.pageId, state: "approved", currentVersionId: versionId, createdAtMs: 1, updatedAtMs: 1 });
      await database.collections.artifact_versions.insertOne({ _id: versionId, artifactId, versionNumber: 1, schemaVersion: "2",
        contentJson: JSON.stringify(proposal.content), dependencyVersionIdsJson: JSON.stringify(dependencies),
        createdBy: "agent", sourceVersionId: null, sourceExecutionBatchId: null, createdAtMs: 1 });
      await database.collections.approvals.insertOne({ _id: id(1300 + index), bookletId, artifactVersionId: versionId, scope: "artifact",
        subjectKey: null, action: "approve", origin: "explicit", sourceApprovalId: null, cardResponseId: null, qualityReviewId: null,
        experimentRunId: runId, testerDecisionId: id(600), createdAtMs: 1 });
      for (const [edgeIndex, upstreamVersionId] of dependencies.entries()) await database.collections.artifact_dependencies.insertOne({
        _id: id(1400 + index * 20 + edgeIndex), downstreamVersionId: versionId, upstreamVersionId, createdAtMs: 1 });
    }
  }
  const verifyBibles = () => database.client.withSession((session) => verifyCurrentApprovedPageBibles(database, session, run,
    { layout, layoutVersionId: id(90), manuscriptVersionId: id(5), styleVersionId: id(8) }));
  return { database, layout, pageIndex, pageId, store, verify, runId, addSiblingBibles, verifyBibles };
}

describe("J13 selected page source verification", () => {
  it("hydrates shared metadata with seven serial reads once per attempt", async () => {
    const env = await setup();
    const runRead = vi.spyOn(env.database.collections.experiment_runs, "findOne");
    const reads = [env.database.collections.artifacts, env.database.collections.artifact_versions,
      env.database.collections.approvals, env.database.collections.artifact_dependencies,
      env.database.collections.experiment_operations, env.database.collections.assets]
      .map((collection) => vi.spyOn(collection, "find"));
    await env.database.client.withSession(async (session) => {
      const attempt = createVerificationAttempt(env.store);
      const first = await verificationMetadata(env.database, session, env.runId, attempt);
      expect(await verificationMetadata(env.database, session, env.runId, attempt)).toBe(first);
      expect(runRead).toHaveBeenCalledTimes(1);
      for (const read of reads) expect(read).toHaveBeenCalledTimes(1);
      await verificationMetadata(env.database, session, env.runId, createVerificationAttempt(env.store));
      expect(runRead).toHaveBeenCalledTimes(2);
      for (const read of reads) expect(read).toHaveBeenCalledTimes(2);
    });
  });

  it("batches shared approval reads without dropping current-source checks", async () => {
    const env = await setup();
    const versions = vi.spyOn(env.database.collections.artifact_versions, "find");
    const approvals = vi.spyOn(env.database.collections.approvals, "find");
    await env.verify();
    expect(versions).toHaveBeenCalledTimes(1);
    expect(versions.mock.calls[0]?.[0]).toMatchObject({ artifactId: { $in: expect.any(Array) } });
    expect(approvals).toHaveBeenCalledTimes(1);
    expect(approvals.mock.calls[0]?.[0]).toMatchObject({ experimentRunId: env.runId, action: "approve", scope: "artifact" });
    await env.database.collections.approvals.deleteOne({ artifactVersionId: id(1) });
    await expect(env.verify()).rejects.toThrow("stale or unapproved source");
  });

  it("checks every sibling Bible without reading image bytes", async () => {
    const env = await setup();
    await expect(env.verifyBibles()).rejects.toThrow("every current approved Page Bible");
    await env.addSiblingBibles();
    await env.verifyBibles();
    expect(env.store.get).not.toHaveBeenCalled();
  });

  it.each(["approval", "state", "version", "dependencies", "edge", "duplicate", "content"] as const)(
    "rejects a sibling Bible with invalid %s", async (fault) => {
      const env = await setup(); await env.addSiblingBibles();
      const artifact = (await env.database.collections.artifacts.findOne({ _id: id(1100) }))!;
      const versionId = artifact.currentVersionId!;
      if (fault === "approval") await env.database.collections.approvals.deleteOne({ artifactVersionId: versionId });
      if (fault === "state") await env.database.collections.artifacts.updateOne({ _id: artifact._id }, { $set: { state: "needs_review" } });
      if (fault === "version") await env.database.collections.artifact_versions.deleteOne({ _id: versionId });
      if (fault === "dependencies") await env.database.collections.artifact_versions.updateOne({ _id: versionId }, { $set: { dependencyVersionIdsJson: "[]" } });
      if (fault === "edge") await env.database.collections.artifact_dependencies.deleteOne({ downstreamVersionId: versionId });
      if (fault === "duplicate") await env.database.collections.artifacts.insertOne({ ...artifact, _id: id(1900), artifactType: "duplicate_bible" });
      if (fault === "content") await env.database.collections.artifact_versions.updateOne({ _id: versionId }, { $set: { contentJson: "{}" } });
      await expect(env.verifyBibles()).rejects.toThrow();
      expect(env.store.get).not.toHaveBeenCalled();
    });

  it("returns the current J12 request and only selected, ordered original sheet attachments", async () => {
    const { layout, pageIndex, pageId, store, verify } = await setup();
    const result = await verify();
    const expected = layout.pages[pageIndex]!.panels.flatMap((panel) => panel.sheetReferences).filter((reference, index, all) =>
      all.findIndex((candidate) => candidate.subjectKind === reference.subjectKind && candidate.subjectId === reference.subjectId &&
        candidate.artifactVersionId === reference.artifactVersionId && candidate.assetId === reference.assetId) === index);
    expect(result.pageBibleVersionId).toBe(id(91));
    expect(result.request.pageId).toBe(pageId);
    expect(result.attachments.map(({ subjectKind, subjectId, artifactVersionId, assetId }) => ({ subjectKind, subjectId, artifactVersionId, assetId }))).toEqual(expected);
    expect(result.attachments.every((attachment) => attachment.mimeType === "image/png" && attachment.byteLength > 0 && attachment.sha256.length === 64)).toBe(true);
    expect(vi.mocked(store.get).mock.calls.map(([uri]) => uri)).toEqual(result.attachments.map((attachment) => `sheet/${attachment.assetId}.png`));
  });

  it.each([
    ["playful_kid", 1], ["enthusiast_parent", 3], ["professional_creator", 3],
  ] as const)("selects stable ordered current attachments for %s", async (persona, pageIndex) => {
    const { layout, store, verify } = await setup(persona, pageIndex);
    const result = await verify();
    const expected = layout.pages[pageIndex]!.panels.flatMap((panel) => panel.sheetReferences).filter((reference, index, all) =>
      all.findIndex((candidate) => candidate.subjectKind === reference.subjectKind && candidate.subjectId === reference.subjectId &&
        candidate.artifactVersionId === reference.artifactVersionId && candidate.assetId === reference.assetId) === index);
    expect(result.attachments.map((attachment) => attachment.assetId)).toEqual(expected.map((reference) => reference.assetId));
    expect(vi.mocked(store.get).mock.calls.map(([uri]) => uri)).toEqual(expected.map((reference) => `sheet/${reference.assetId}.png`));
  });

  it("rejects a missing J12 approval, stale J12 dependency and an invalid page identity", async () => {
    const { database, pageId, verify, runId } = await setup();
    await database.collections.approvals.deleteOne({ experimentRunId: runId, artifactVersionId: id(91) });
    await expect(verify()).rejects.toThrow("J12 approval");
    await database.collections.approvals.insertOne({ _id: id(901), bookletId: id(2), artifactVersionId: id(91), scope: "artifact", subjectKey: null,
      action: "approve", origin: "explicit", sourceApprovalId: null, cardResponseId: null, qualityReviewId: null, experimentRunId: runId, testerDecisionId: id(600), createdAtMs: 1 });
    await database.collections.artifact_dependencies.deleteOne({ downstreamVersionId: id(91), upstreamVersionId: id(90) });
    await expect(verify()).rejects.toThrow("J12 dependency edges");
    const run = (await createExperimentRepository(database).getRun(runId))!;
    await expect(database.client.withSession((session) => verifyCurrentPageIllustrationSources(database, session, run, id(999), {} as AssetStore))).rejects.toThrow();
    expect(pageId).toBeTruthy();
  });

  it("rejects corrupt selected bytes without reading unrelated sheet assets", async () => {
    const { database, layout, store, verify } = await setup();
    const selected = layout.pages[1]!.panels[0]!.sheetReferences[0]!.assetId;
    const asset = (await database.collections.assets.findOne({ _id: selected }))!;
    const originalGet = store.get.bind(store);
    vi.spyOn(store, "get").mockImplementation(async (uri) => uri === asset.uri ? new Uint8Array([1]) : originalGet(uri));
    await expect(verify()).rejects.toThrow("corrupt");
  });

  it("rejects a saved digest or length that differs from the original bytes", async () => {
    const { database, layout, verify } = await setup();
    const selected = layout.pages[1]!.panels[0]!.sheetReferences[0]!.assetId;
    const asset = (await database.collections.assets.findOne({ _id: selected }))!;
    await database.collections.assets.updateOne({ _id: selected }, { $set: { metadataJson: JSON.stringify({ sha256: "0".repeat(64), byteLength: 1 }) } });
    await expect(verify()).rejects.toThrow("evidence differs");
    await database.collections.assets.updateOne({ _id: selected }, { $set: { metadataJson: asset.metadataJson } });
  });

  it("returns canonical decoded MIME with an advisory warning for a stale asset label", async () => {
    const { database, layout, verify } = await setup();
    const selected = layout.pages[1]!.panels[0]!.sheetReferences[0]!.assetId;
    await database.collections.assets.updateOne({ _id: selected }, { $set: { mimeType: "image/jpeg" } });
    const result = await verify();
    expect(result.attachments.find((attachment) => attachment.assetId === selected)?.mimeType).toBe("image/png");
    expect(result.warnings).toContain(`Selected sheet ${selected} metadata MIME image/jpeg differs from decoded image/png.`);
  });
});
