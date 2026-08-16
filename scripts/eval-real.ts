import { execFileSync } from "node:child_process";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "dotenv";
import { BookletService } from "@/lib/application/booklet-service";
import { CardService } from "@/lib/application/card-service";
import { ChatService } from "@/lib/application/chat-service";
import { ArtifactService } from "@/lib/application/artifact-service";
import { EvidenceService } from "@/lib/application/evidence-service";
import { GenerationService } from "@/lib/application/generation-service";
import { createRepositories } from "@/db/repositories";
import { createMongoDatabase, type Database } from "@/db/client";
import { seedVisualAssets } from "@/db/seed";
import { seedDefaultAgents, setupMongoStructure } from "@/db/setup";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { randomUUID } from "node:crypto";
import { genUICardSchema, type GenUICard } from "@/lib/contracts/cards";
import type { BookletUIMessage } from "@/lib/contracts/messages";

type Fixture = {
  ageBand: "3-5" | "6-8" | "9-12";
  expectedGeometry: "square_1_1" | "landscape_5_4" | "portrait_4_5";
  expectedStoryPages: number;
  idea: string;
  label: string;
};

const fixtures: Record<string, Fixture> = {
  "early-reader": {
    label: "Early reader",
    ageBand: "3-5",
    expectedGeometry: "square_1_1",
    expectedStoryPages: 3,
    idea: "Pip the duckling notices that the garden's rain barrel is empty and gently invites every neighbor to share one cup of water so the thirsty marigolds can bloom.",
  },
  "developing-reader": {
    label: "Developing reader",
    ageBand: "6-8",
    expectedGeometry: "landscape_5_4",
    expectedStoryPages: 6,
    idea: "Nora the fox follows a trail of tiny paper stars through the moonlit library garden to return a lost map to its patient inventor before the community treasure hunt begins.",
  },
  "older-reader": {
    label: "Older reader",
    ageBand: "9-12",
    expectedGeometry: "portrait_4_5",
    expectedStoryPages: 8,
    idea: "Tariq, a thoughtful young kite maker, must decide whether to hide his imperfect design or share it with a new friend whose encouragement helps the whole riverside festival fly again.",
  },
};

let cleanFailedRun: (() => Promise<void>) | null = null;
let evaluationDatabase: Database | null = null;
let evaluationReplicaSet: MongoMemoryReplSet | null = null;

async function closeEvaluationDatabase(): Promise<void> {
  await evaluationDatabase?.close();
  evaluationDatabase = null;
  await evaluationReplicaSet?.stop();
  evaluationReplicaSet = null;
}

async function removeWithRetry(target: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await rm(target, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      if (!(error && typeof error === "object" && "code" in error && error.code === "EBUSY")) throw error;
      await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 150));
    }
  }
  throw lastError;
}

function requestedFixture(): [string, Fixture] {
  const flagIndex = process.argv.indexOf("--fixture");
  const name = flagIndex >= 0 ? process.argv[flagIndex + 1] : undefined;
  if (!name || !fixtures[name]) throw new Error(`Pass one retained fixture: ${Object.keys(fixtures).join(", ")}.`);
  return [name, fixtures[name]];
}

function requestedRunLabel(): string | null {
  const flagIndex = process.argv.indexOf("--run-label");
  if (flagIndex < 0) return null;
  const label = process.argv[flagIndex + 1];
  if (!label || !/^[a-z0-9-]+$/.test(label)) throw new Error("--run-label must use lowercase letters, numbers, and hyphens only.");
  return label;
}

function cardFromTurn(turn: Awaited<ReturnType<ChatService["createFakeTurn"]>>): GenUICard {
  const card = turn.assistantMessage.parts.find((part) => part.type === "data-card");
  if (!card || card.type !== "data-card") throw new Error("The workflow turn did not return a typed decision card.");
  return card.data;
}

function userMessage(bookletId: string, text: string, responseId?: string): BookletUIMessage {
  return {
    id: randomUUID(), role: "user", metadata: { schemaVersion: "1", bookletId, responseId }, parts: [{ type: "text", text }],
  };
}

async function main() {
  const [fixtureName, fixture] = requestedFixture();
  const runLabel = requestedRunLabel();
  config({ path: ".env.local" });
  process.env.MODEL_RUNTIME = "real";
  process.env.IMAGE_PROVIDER_MODE = "real";

  const date = new Date().toISOString().slice(0, 10);
  const runName = runLabel ? `${fixtureName}-${runLabel}` : fixtureName;
  const runRoot = path.join("evaluations", date, runName);
  const dataRoot = path.join("data", "evaluations", date, runName, "assets");
  await mkdir(path.dirname(path.join(process.cwd(), runRoot)), { recursive: true });
  await mkdir(path.join(process.cwd(), runRoot), { recursive: false }).catch((error: unknown) => {
    if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") throw new Error(`${runRoot} already exists; retained evaluations are never overwritten.`);
    throw error;
  });
  const runRootAbsolute = path.join(process.cwd(), runRoot);
  const sourceRunRoot = path.join(process.cwd(), "data", "evaluations", date, runName);
  // A failed run can leave generated asset handles briefly open on Windows. Its
  // public evidence directory is removed on failure; clear the ignored source
  // directory at the beginning of the next attempt, after the prior process exits.
  await removeWithRetry(sourceRunRoot);
  cleanFailedRun = async () => {
    await removeWithRetry(runRootAbsolute);
  };
  process.env.DATA_ROOT = `./${dataRoot.replaceAll("\\", "/")}`;
  evaluationReplicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  process.env.MONGODB_URI = evaluationReplicaSet.getUri();
  process.env.MONGODB_DATABASE = `kids_booklet_eval_${runName.replaceAll("-", "_")}`;
  const database = createMongoDatabase({ uri: process.env.MONGODB_URI, databaseName: process.env.MONGODB_DATABASE });
  evaluationDatabase = database;
  await setupMongoStructure(database);
  await seedDefaultAgents(database);
  await seedVisualAssets(database, process.env.DATA_ROOT);
  execFileSync(process.execPath, ["--import", "tsx", "scripts/preflight-env.ts"], { env: process.env, stdio: "inherit" });
  const repositories = createRepositories(database);
  const booklets = new BookletService({ database, repositories });
  // The app's persistent runner owns jobs in normal web-server execution. This
  // standalone evaluator drives the same persisted jobs directly so it can
  // deterministically retain a complete run without starting an endless runner.
  const generation = new GenerationService({ database, repositories });
  const cards = new CardService({ database, repositories, generation });
  const chat = new ChatService({ database, repositories, generation });
  const artifacts = new ArtifactService({ database, repositories });
  const startedAt = new Date().toISOString();
  const booklet = await booklets.create({ idea: fixture.idea });

  async function prompt(text: string, responseId?: string): Promise<GenUICard> {
    return cardFromTurn(await chat.createFakeTurn(booklet.id, userMessage(booklet.id, text, responseId)));
  }
  async function decide(card: GenUICard, action: "submit" | "select" | "confirm_geometry" | "approve_and_continue", value?: string | string[]): Promise<GenUICard | null> {
    const responseId = randomUUID();
    const saved = await cards.submit(booklet.id, { cardId: card.cardId, responseId, action, value });
    return saved.followupRequired ? prompt(saved.summary, responseId) : null;
  }
  async function continueOrPrompt(card: GenUICard, fallbackPrompt: string, value?: string[]): Promise<GenUICard> {
    const followup = await decide(card, "approve_and_continue", value);
    if (followup) return followup;
    // A quality repair can persist a replacement card synchronously without a
    // chat follow-up. Prefer that active card before issuing a fallback prompt.
    const snapshot = await booklets.getWorkspaceSnapshot(booklet.id);
    const active = genUICardSchema.safeParse(snapshot.activeCard);
    return active.success ? active.data : prompt(fallbackPrompt);
  }
  async function runActiveGeneration(jobType: "references" | "pages"): Promise<boolean> {
    const job = (await repositories.jobs.listActiveByBooklet(booklet.id)).find((candidate) => candidate.jobType === jobType);
    if (!job) return false;
    if (jobType === "references") await generation.runReferenceJob(booklet.id, job.id);
    else await generation.runPageJob(booklet.id, job.id);
    return true;
  }
  async function activeCard(title: string): Promise<GenUICard> {
    const snapshot = await booklets.getWorkspaceSnapshot(booklet.id);
    const parsed = genUICardSchema.safeParse(snapshot.activeCard);
    if (!parsed.success || parsed.data.title !== title) {
      throw new Error(`Expected active card \"${title}\", received \"${parsed.success ? parsed.data.title : "none"}\".`);
    }
    return parsed.data;
  }
  function selectedGalleryAssets(card: GenUICard): string[] {
    if (card.family !== "artifact_review" || card.variant !== "visual_gallery") {
      throw new Error(`Expected a visual review gallery, received ${card.family}/${card.variant}.`);
    }
    return card.payload.items.map((item) => item.assetId);
  }
  async function enforceFixturePageCount(): Promise<void> {
    const specification = await artifacts.get(booklet.id, "booklet_specification");
    if (!specification.currentVersion) throw new Error("Expected a saved Booklet Specification before confirmation.");
    await artifacts.revise(booklet.id, "booklet_specification", {
      ...(specification.currentVersion.content as Record<string, unknown>),
      storyPageCount: fixture.expectedStoryPages,
      geometry: fixture.expectedGeometry,
      geometryConfirmed: false,
    }, { createdBy: "application" });
  }

  let card = await prompt("Please begin the guided questions.");
  card = (await decide(card, "select", fixture.ageBand))!;
  card = await continueOrPrompt(card, "Draft the Story Plan using the approved audience.");
  // A targeted story-quality repair returns a fresh Story Plan review. The
  // normal workflow requires that repaired version to be approved as well.
  for (let approval = 0; approval < 3 && card.family === "artifact_review" && card.payload.artifactType === "story_plan"; approval += 1) {
    card = await continueOrPrompt(card, "Choose the visual direction.");
  }
  if (card.family !== "question" || card.title !== "Choose visual style") {
    throw new Error(`Expected the visual-style selector after Story Plan approval, received ${card.title}.`);
  }
  card = (await decide(card, "select", "soft-watercolor"))!;
  await decide(card, "approve_and_continue");
  if (await runActiveGeneration("references")) {
    card = await activeCard("Review canonical references");
    card = await continueOrPrompt(card, "Recommend the booklet pages and geometry.", selectedGalleryAssets(card));
  } else {
    card = await prompt("Recommend the booklet pages and geometry.");
  }
  await enforceFixturePageCount();
  card = (await decide(card, "confirm_geometry", fixture.expectedGeometry))!;
  await decide(card, "approve_and_continue");
  await runActiveGeneration("pages");
  card = await activeCard("Review final pages");
  const exportCard = await continueOrPrompt(card, "Export the approved booklet PDF.", selectedGalleryAssets(card));
  if (exportCard.family !== "artifact_review" || exportCard.variant !== "summary" || !exportCard.payload.downloadAssetId) throw new Error("Export did not return a downloadable PDF card.");
  const exportAssetId = exportCard.payload.downloadAssetId;

  const pagePlan = await artifacts.get(booklet.id, "page_plan");
  const plan = pagePlan.currentVersion?.content as { storyPageCount?: number; geometry?: string } | null;
  if (plan?.storyPageCount !== fixture.expectedStoryPages || plan.geometry !== fixture.expectedGeometry) {
    throw new Error(`Fixture contract mismatch: expected ${fixture.expectedStoryPages} ${fixture.expectedGeometry}, received ${plan?.storyPageCount} ${plan?.geometry}.`);
  }
  const pdfAsset = await repositories.assets.get(exportAssetId);
  if (!pdfAsset) throw new Error("The PDF asset record is missing.");
  const evidence = await new EvidenceService({ repositories }).buildSummary(booklet.id);
  const scrubbedCalls = evidence.calls.map((call) => ({
    operation: call.operation, skillId: call.skillId, artifactVersionId: call.artifactVersionId, jobId: call.jobId,
    provider: call.provider, model: call.model, traceId: call.traceId, providerRequestId: call.providerRequestId, status: call.status, attempt: call.attempt,
    latencyMs: call.latencyMs, usage: call.usage, actualCostUsd: call.actualCostUsd, estimatedCostUsd: call.estimatedCostUsd,
    pricingVersion: call.pricingVersion, errorKind: call.errorKind,
  }));
  const absoluteDataRoot = path.resolve(process.cwd(), dataRoot);
  const pdfOutput = path.join(process.cwd(), runRoot, "final.pdf");
  await cp(path.join(absoluteDataRoot, ...pdfAsset.uri.split("/")), pdfOutput);
  await writeFile(path.join(process.cwd(), runRoot, "engineering-summary.json"), JSON.stringify({ ...evidence, calls: scrubbedCalls }, null, 2));
  await writeFile(path.join(process.cwd(), runRoot, "manifest.json"), JSON.stringify({
    schemaVersion: "1", fixture: fixtureName, runLabel, label: fixture.label, bookletId: booklet.id, ageBand: fixture.ageBand,
    storyPages: fixture.expectedStoryPages, geometry: fixture.expectedGeometry, providerMode: "real", startedAt, completedAt: new Date().toISOString(),
    localSourceAssets: dataRoot.replaceAll("\\", "/"),
  }, null, 2));
  await writeFile(path.join(process.cwd(), runRoot, "findings.md"), `# ${fixture.label} evaluation\n\n- Workflow completion: passed.\n- Expected story pages: ${fixture.expectedStoryPages}; geometry: ${fixture.expectedGeometry}.\n- PDF: [final.pdf](final.pdf).\n- Engineering evidence: [engineering-summary.json](engineering-summary.json).\n- Human PDF/image rubric: pending Poppler rendering and inspection.\n`);
  console.log(JSON.stringify({ fixture: fixtureName, bookletId: booklet.id, runRoot, pdf: pdfOutput, estimatedCostUsd: evidence.totals.estimatedCostUsd, modelCalls: evidence.totals.modelCalls }, null, 2));
}

try {
  await main();
} catch (error) {
  await closeEvaluationDatabase();
  const cleanup = cleanFailedRun as (() => Promise<void>) | null;
  if (cleanup) {
    try {
      await cleanup();
    } catch (cleanupError) {
      console.error("[non-fatal] Failed-evaluation cleanup could not finish:", cleanupError);
    }
  }
  throw error;
} finally {
  await closeEvaluationDatabase();
}
