import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabase } from "@/db/client";
import type { AssetStore, StoredAsset } from "@/lib/assets/asset-store";
import { BookletService } from "@/lib/application/booklet-service";
import { CardService } from "@/lib/application/card-service";
import { ChatService, type ChatTurn } from "@/lib/application/chat-service";
import { GenerationService } from "@/lib/application/generation-service";
import { ExportService } from "@/lib/application/export-service";
import { RevisionService } from "@/lib/application/revision-service";
import { ArtifactService } from "@/lib/application/artifact-service";
import { FakeImageProvider } from "@/lib/images/fake-image-provider";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { createRepositories } from "@/db/repositories";

const databases: Array<ReturnType<typeof createDatabase>> = [];
afterEach(() => databases.splice(0).forEach((database) => database.$client.close()));

class MemoryAssetStore implements AssetStore {
  private readonly values = new Map<string, Uint8Array>();
  async put(uri: string, content: Uint8Array, mimeType: string): Promise<StoredAsset> { this.values.set(uri, content); return { uri, mimeType, byteLength: content.byteLength }; }
  async get(uri: string): Promise<Uint8Array> { const value = this.values.get(uri); if (!value) throw new Error("Missing asset"); return value; }
  async exists(uri: string): Promise<boolean> { return this.values.has(uri); }
}

function cardFrom(turn: ChatTurn) {
  const part = turn.assistantMessage.parts.find((candidate) => candidate.type === "data-card");
  if (!part || part.type !== "data-card") throw new Error("Expected an active card.");
  return part.data.cardId;
}

async function waitForCard(booklets: BookletService, bookletId: string, title: string): Promise<{ cardId: string; payload: { items?: Array<{ assetId: string }> } }> {
  // Sharp PDF/image work competes with other integration workers on this host.
  // This observes persisted completion rather than assuming a fixed two-second budget.
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const active = (await booklets.getWorkspaceSnapshot(bookletId)).activeCard as { cardId: string; title: string; payload: { items?: Array<{ assetId: string }> } } | null;
    if (active?.title === title) return active;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for ${title}.`);
}

describe("specification and Page Plan workflow", () => {
  it("requires saved geometry confirmation before creating ordered Page Packages", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "kids-page-plan-"));
    const database = createDatabase(`file:${path.join(directory, "booklets.db")}`);
    databases.push(database);
    await migrate(database, { migrationsFolder: path.join(process.cwd(), "db", "migrations") });
    const bookletService = new BookletService({ database });
    const assets = new MemoryAssetStore();
    const styleAssetId = "00000000-0000-4000-8000-000000000001";
    const styleUri = "_seed/styles/soft-watercolor.png";
    await assets.put(styleUri, await sharp({ create: { width: 64, height: 64, channels: 3, background: "#f3d39b" } }).png().toBuffer(), "image/png");
    await createRepositories(database).assets.create({ id: styleAssetId, bookletId: null, kind: "style_preview", uri: styleUri, mimeType: "image/png", width: 64, height: 64, sourceAssetId: null, metadata: { source: "test-seed" }, createdAtMs: Date.now() });
    const generation = new GenerationService({ database, assets, provider: new FakeImageProvider(), imageModel: "fake-image", imageQuality: "low" });
    const cardService = new CardService({ database, generation });
    const exporter = new ExportService({ database, assets });
    const chat = new ChatService({ database, generation, exporter });
    const booklet = await bookletService.create({ idea: "A robin shares rainwater in a bright garden." });
    const begin = await chat.createFakeTurn(booklet.id, { id: "00000000-0000-4000-8000-000000000721", role: "user", parts: [{ type: "text", text: "Begin." }] });
    const intakeCard = cardFrom(begin);
    const intakeResponse = "00000000-0000-4000-8000-000000000722";
    await cardService.submit(booklet.id, { cardId: intakeCard, responseId: intakeResponse, action: "select", value: "6-8" });
    await chat.createFakeTurn(booklet.id, { id: "00000000-0000-4000-8000-000000000723", role: "user", metadata: { schemaVersion: "1", bookletId: booklet.id, responseId: intakeResponse }, parts: [{ type: "text", text: "Ages 6–8" }] });
    const active = (await bookletService.getWorkspaceSnapshot(booklet.id)).activeCard as { cardId: string };
    await cardService.submit(booklet.id, { cardId: active.cardId, responseId: "00000000-0000-4000-8000-000000000724", action: "approve_and_continue" });
    const story = await chat.createFakeTurn(booklet.id, { id: "00000000-0000-4000-8000-000000000725", role: "user", parts: [{ type: "text", text: "Draft the Story Plan." }] });
    await cardService.submit(booklet.id, { cardId: cardFrom(story), responseId: "00000000-0000-4000-8000-000000000726", action: "approve_and_continue" });
    const style = await chat.createFakeTurn(booklet.id, { id: "00000000-0000-4000-8000-000000000727", role: "user", parts: [{ type: "text", text: "Choose visual direction." }] });
    await cardService.submit(booklet.id, { cardId: cardFrom(style), responseId: "00000000-0000-4000-8000-000000000728", action: "select", value: "soft-watercolor" });
    const bible = await chat.createFakeTurn(booklet.id, { id: "00000000-0000-4000-8000-000000000729", role: "user", parts: [{ type: "text", text: "Plan visual references." }] });
    await cardService.submit(booklet.id, { cardId: cardFrom(bible), responseId: "00000000-0000-4000-8000-000000000730", action: "approve_and_continue" });
    const referenceReview = await waitForCard(bookletService, booklet.id, "Review canonical references");
    await cardService.submit(booklet.id, { cardId: referenceReview.cardId, responseId: "00000000-0000-4000-8000-000000000738", action: "approve_and_continue", value: referenceReview.payload.items?.map((item) => item.assetId) });
    const specification = await chat.createFakeTurn(booklet.id, { id: "00000000-0000-4000-8000-000000000731", role: "user", parts: [{ type: "text", text: "Recommend booklet pages." }] });
    const geometryCard = cardFrom(specification);
    const geometryResponse = "00000000-0000-4000-8000-000000000732";
    await cardService.submit(booklet.id, { cardId: geometryCard, responseId: geometryResponse, action: "confirm_geometry", value: "square_1_1" });
    const pagePlan = await chat.createFakeTurn(booklet.id, { id: "00000000-0000-4000-8000-000000000733", role: "user", metadata: { schemaVersion: "1", bookletId: booklet.id, responseId: geometryResponse }, parts: [{ type: "text", text: "Square (1:1)" }] });
    const artifacts = new ArtifactService({ database });
    const draftedPlan = await artifacts.get(booklet.id, "page_plan");
    const legacyContent = draftedPlan.currentVersion!.content as { pages: Array<Record<string, unknown>> };
    const legacyPlan = await artifacts.revise(booklet.id, "page_plan", { ...legacyContent, pages: legacyContent.pages.map((page) => {
      const legacyPage = { ...page };
      delete legacyPage.lettering;
      return legacyPage;
    }) }, { createdBy: "user_edit" });
    await artifacts.approve(booklet.id, "page_plan", legacyPlan.currentVersion!.id);
    await expect(generation.createPageJob(booklet.id)).rejects.toThrow(/Upgrade and approve the Page Plan/i);
    const upgradedPlan = await new RevisionService({ database, assets }).upgradePagePlanLettering(booklet.id);
    expect((upgradedPlan.currentVersion!.content as { pages: Array<{ lettering?: unknown[] }> }).pages.every((page) => page.lettering?.length)).toBe(true);
    await artifacts.approve(booklet.id, "page_plan", upgradedPlan.currentVersion!.id);
    const initialPageJob = await generation.createPageJob(booklet.id);
    const initialItems = await createRepositories(database).jobs.getItems(initialPageJob.id);
    expect((initialItems[0]!.input as { request: { quality: string; promptPlan: { lettering?: unknown[] } } }).request).toMatchObject({ quality: "medium", promptPlan: { lettering: expect.any(Array) } });
    await generation.runPageJob(booklet.id, initialPageJob.id);
    const finalReview = await waitForCard(bookletService, booklet.id, "Review final pages");
    await cardService.submit(booklet.id, { cardId: finalReview.cardId, responseId: "00000000-0000-4000-8000-000000000736", action: "approve_and_continue", value: finalReview.payload.items?.map((item) => item.assetId) });
    const beforeRevision = await new ArtifactService({ database }).get(booklet.id, "final_pages");
    const beforePages = (beforeRevision.currentVersion!.content as { pages: Array<{ pageId: string; sourceIllustrationAssetId: string; composedAssetId: string }> }).pages;
    const regeneratedJob = await new RevisionService({ database, assets, generation }).regenerateImage(booklet.id, { target: { kind: "page", pageId: beforePages[1]!.pageId }, instruction: "Make the narration caption larger while preserving its exact words." });
    await generation.runPageJob(booklet.id, regeneratedJob.id);
    const regenerated = await new ArtifactService({ database }).get(booklet.id, "final_pages");
    const regeneratedPages = (regenerated.currentVersion!.content as { pages: Array<{ pageId: string; sourceIllustrationAssetId: string; composedAssetId: string }> }).pages;
    expect(regeneratedPages[1]!.sourceIllustrationAssetId).not.toBe(beforePages[1]!.sourceIllustrationAssetId);
    expect(regeneratedPages[2]!.composedAssetId).toBe(beforePages[2]!.composedAssetId);
    const regeneratedReview = await waitForCard(bookletService, booklet.id, "Review final pages");
    await cardService.submit(booklet.id, { cardId: regeneratedReview.cardId, responseId: "00000000-0000-4000-8000-000000000739", action: "approve_and_continue", value: regeneratedReview.payload.items?.map((item) => item.assetId) });
    const exported = await chat.createFakeTurn(booklet.id, { id: "00000000-0000-4000-8000-000000000737", role: "user", parts: [{ type: "text", text: "Export the PDF." }] });
    const snapshot = await bookletService.getWorkspaceSnapshot(booklet.id);

    expect(pagePlan.assistantMessage.parts).toContainEqual(expect.objectContaining({ type: "data-card" }));
    expect(snapshot.booklet.currentStage).toBe("pdf_export");
    expect(snapshot.booklet.lifecycle).toBe("completed");
    expect(snapshot.artifacts.find((artifact) => artifact.artifactType === "final_pages")).toMatchObject({ state: "approved" });
    expect(snapshot.artifacts.find((artifact) => artifact.artifactType === "pdf_export")).toMatchObject({ state: "approved" });
    expect(finalReview.payload.items).toHaveLength(7);
    const exportCard = exported.assistantMessage.parts.find((part) => part.type === "data-card");
    if (!exportCard || exportCard.type !== "data-card" || exportCard.data.family !== "artifact_review" || exportCard.data.variant !== "summary" || !exportCard.data.payload.downloadAssetId) throw new Error("Expected downloadable PDF card.");
    const exportAsset = await new BookletService({ database }).getAsset(exportCard.data.payload.downloadAssetId);
    expect(exportAsset?.mimeType).toBe("application/pdf");
    expect((await PDFDocument.load(await assets.get(exportAsset!.uri))).getPageCount()).toBe(7);
    const evidence = (await createRepositories(database).assets.listByBooklet(booklet.id, "evidence")).at(0);
    expect(evidence).toMatchObject({ mimeType: "application/json", metadata: { type: "engineering_summary" } });
    expect(JSON.parse(Buffer.from(await assets.get(evidence!.uri)).toString())).toMatchObject({ bookletId: booklet.id, totals: { modelCalls: expect.any(Number) } });
  }, 20_000);
});
