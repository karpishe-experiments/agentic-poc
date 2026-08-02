import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, describe, expect, it } from "vitest";
import { ArtifactService } from "@/lib/application/artifact-service";
import { BookletService, type Clock, type IdGenerator } from "@/lib/application/booklet-service";
import { CardService } from "@/lib/application/card-service";
import { createDatabase } from "@/db/client";
import { createRepositories } from "@/db/repositories";
import { SCHEMA_VERSION } from "@/lib/contracts/common";

const temporaryDatabases: Array<ReturnType<typeof createDatabase>> = [];

afterEach(() => {
  temporaryDatabases.splice(0).forEach((database) => database.$client.close());
});

function deterministicIds(): IdGenerator {
  let value = 700;
  return { next: () => `00000000-0000-4000-8000-${String(++value).padStart(12, "0")}` };
}

async function createServices(clock: Clock) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "kids-booklet-artifact-"));
  const database = createDatabase(`file:${path.join(directory, "booklets.db")}`);
  temporaryDatabases.push(database);
  await migrate(database, { migrationsFolder: path.join(process.cwd(), "db", "migrations") });
  return { database, booklets: new BookletService({ database, ids: deterministicIds(), clock }), artifacts: new ArtifactService({ database }) };
}

const audience = {
  schemaVersion: "1" as const,
  ageBand: "6-8" as const,
  interests: ["garden mysteries"],
  readingNeeds: "Concrete, warm language.",
  tone: "Playful and reassuring",
  avoidList: ["frightening danger"],
  knownFacts: ["The main character helps a friend."],
  openAssumptions: ["The season is spring."],
};

const story = {
  schemaVersion: "1" as const,
  premise: "A robin learns that taking turns makes the garden kinder.",
  theme: "Kindness grows through patience.",
  characters: [{
    entityId: "00000000-0000-4000-8000-000000000801",
    name: "Robin",
    narrativeRole: "hero",
    goal: "Share the watering can fairly.",
    relationships: ["helps the sparrows"],
    named: true,
    continuityRelevant: true,
    recurringVisualSubject: true,
  }],
  settings: [{
    entityId: "00000000-0000-4000-8000-000000000802",
    name: "Community garden",
    narrativeRole: "main setting",
    named: true,
    continuityRelevant: true,
    recurringVisualSubject: true,
  }],
  storyArc: "Robin rushes, pauses, and shares the water.",
  keyEvents: ["The watering can runs low.", "Robin listens to the sparrows.", "Everyone waters together."],
  ending: "The garden blooms in turn.",
  ageFitNotes: "Simple consequences and a hopeful ending.",
  continuityConstraints: ["Robin keeps a red scarf."],
};

const visualStyle = {
  schemaVersion: "1" as const,
  styleId: "00000000-0000-4000-8000-000000000803",
  name: "Warm watercolor",
  rationale: "Soft edges support the gentle story.",
  visualDirection: "Layered watercolor garden scenes.",
  palette: ["leaf green", "golden lantern"],
  texture: "Paper grain",
  lighting: "Gentle moonlight",
  styleReferenceAssetIds: [],
};

const visualBible = {
  schemaVersion: "1" as const,
  characters: [{ entityId: story.characters[0].entityId, name: "Robin", visualDetails: ["small red scarf"], continuityConstraints: ["scarf remains red"], referenceRequired: true, currentReferenceAssetId: null, revisionNumber: 1 }],
  locations: [{ entityId: story.settings[0].entityId, name: "Community garden", visualDetails: ["stone birdbath"], continuityConstraints: [], referenceRequired: false, currentReferenceAssetId: null, revisionNumber: 1 }],
  styleReferences: [],
};

describe("ArtifactService", () => {
  it("stores immutable exact versions, exact approvals, and selective transitive invalidation", async () => {
    let now = Date.UTC(2026, 7, 1, 12, 0, 0);
    const { database, booklets, artifacts } = await createServices({ now: () => now });
    const booklet = await booklets.create({ idea: "A robin shares a watering can." });

    const audienceV1 = await artifacts.revise(booklet.id, "audience_profile", audience);
    expect(audienceV1.currentVersion).toMatchObject({ versionNumber: 1, content: audience });
    await artifacts.approve(booklet.id, "audience_profile", audienceV1.currentVersion!.id);
    const storyV1 = await artifacts.revise(booklet.id, "story_plan", story);
    await artifacts.approve(booklet.id, "story_plan", storyV1.currentVersion!.id);

    const dependencyRows = await database.$client.execute({
      sql: "select upstream_version_id from artifact_dependencies where downstream_version_id = ?",
      args: [storyV1.currentVersion!.id],
    });
    expect(dependencyRows.rows.map((row) => row.upstream_version_id)).toEqual([audienceV1.currentVersion!.id]);

    now += 1_000;
    const audienceV2 = await artifacts.revise(booklet.id, "audience_profile", { ...audience, tone: "Gentle and curious" });
    const invalidatedStory = await artifacts.get(booklet.id, "story_plan");
    const refreshedAudience = await artifacts.get(booklet.id, "audience_profile");

    expect(audienceV2.currentVersion).toMatchObject({ versionNumber: 2, sourceVersionId: audienceV1.currentVersion!.id, content: { tone: "Gentle and curious" } });
    expect(refreshedAudience.history).toHaveLength(2);
    expect(refreshedAudience.approvals).toMatchObject([{ artifactVersionId: audienceV1.currentVersion!.id, scope: "artifact" }]);
    expect(invalidatedStory).toMatchObject({ state: "needs_review", currentVersion: { id: storyV1.currentVersion!.id }, history: [expect.any(Object)] });
    expect((await booklets.getWorkspaceSnapshot(booklet.id)).booklet.currentStage).toBe("audience_profile");
  });

  it("rejects malformed content and approvals of a historical version", async () => {
    const { booklets, artifacts } = await createServices({ now: () => Date.UTC(2026, 7, 1, 12, 0, 0) });
    const booklet = await booklets.create({ idea: "A rabbit finds a moonlit trail." });
    await expect(artifacts.revise(booklet.id, "audience_profile", { schemaVersion: "1" })).rejects.toMatchObject({ name: "ZodError" });
    const first = await artifacts.revise(booklet.id, "audience_profile", audience);
    const second = await artifacts.revise(booklet.id, "audience_profile", { ...audience, tone: "Quiet" });
    await expect(artifacts.approve(booklet.id, "audience_profile", first.currentVersion!.id)).rejects.toMatchObject({ code: "artifact_version_not_current" });
    await expect(artifacts.approve(booklet.id, "audience_profile", second.currentVersion!.id)).resolves.toMatchObject({ state: "approved" });
  });

  it("runs the story-readiness quality gate before approving the Story Plan", async () => {
    const { database, booklets, artifacts } = await createServices({ now: () => Date.UTC(2026, 7, 1, 12, 0, 0) });
    const booklet = await booklets.create({ idea: "A robin shares a watering can." });
    const audienceVersion = await artifacts.revise(booklet.id, "audience_profile", audience);
    await artifacts.approve(booklet.id, "audience_profile", audienceVersion.currentVersion!.id);
    const storyVersion = await artifacts.revise(booklet.id, "story_plan", story);
    const cardId = "00000000-0000-4000-8000-000000000851";
    await createRepositories(database).conversation.persistAssistantCard({
      bookletId: booklet.id,
      messageId: "00000000-0000-4000-8000-000000000852",
      narration: "Review the Story Plan.",
      card: {
        schemaVersion: SCHEMA_VERSION,
        cardId,
        family: "artifact_review",
        variant: "summary",
        status: "active",
        title: "Review the Story Plan",
        allowedActions: ["approve_and_continue"],
        payload: { artifactType: "story_plan", versionId: storyVersion.currentVersion!.id, summary: [{ label: "Theme", value: story.theme }] },
      },
      createdAtMs: Date.UTC(2026, 7, 1, 12, 0, 1),
    });

    await new CardService({ database }).submit(booklet.id, {
      cardId,
      responseId: "00000000-0000-4000-8000-000000000853",
      action: "approve_and_continue",
    });

    expect(await createRepositories(database).evidence.countQualityReviews(booklet.id)).toBe(1);
    await expect(artifacts.get(booklet.id, "story_plan")).resolves.toMatchObject({ state: "approved" });
  });

  it("carries only unchanged scoped Visual Bible approvals to a revised version", async () => {
    const { booklets, artifacts } = await createServices({ now: () => Date.UTC(2026, 7, 1, 12, 0, 0) });
    const booklet = await booklets.create({ idea: "A robin keeps a garden bright." });
    await artifacts.revise(booklet.id, "audience_profile", audience);
    await artifacts.revise(booklet.id, "story_plan", story);
    await artifacts.revise(booklet.id, "visual_style", visualStyle);
    const first = await artifacts.revise(booklet.id, "visual_bible", visualBible);
    await expect(artifacts.approve(booklet.id, "visual_bible", first.currentVersion!.id)).rejects.toMatchObject({ code: "visual_bible_content_unapproved" });
    await artifacts.approve(booklet.id, "visual_bible", first.currentVersion!.id, { scope: "artifact_content" });
    await expect(artifacts.approve(booklet.id, "visual_bible", first.currentVersion!.id)).rejects.toMatchObject({ code: "reference_approval_incomplete" });
    await artifacts.approve(booklet.id, "visual_bible", first.currentVersion!.id, { scope: "reference", subjectKey: story.characters[0].entityId });
    await expect(artifacts.approve(booklet.id, "visual_bible", first.currentVersion!.id)).resolves.toMatchObject({ state: "approved" });
    const revised = await artifacts.revise(booklet.id, "visual_bible", {
      ...visualBible,
      locations: [{ ...visualBible.locations[0], visualDetails: ["stone birdbath", "round hedge"] }],
    });

    expect(revised.approvals).toContainEqual(expect.objectContaining({ artifactVersionId: revised.currentVersion!.id, scope: "reference", subjectKey: story.characters[0].entityId, origin: "carried_forward" }));
    expect(revised.approvals.some((approval) => approval.subjectKey === story.settings[0].entityId)).toBe(false);
  });

  it("applies an artifact-review approve-and-continue action without starting a follow-up turn", async () => {
    const { database, booklets, artifacts } = await createServices({ now: () => Date.UTC(2026, 7, 1, 12, 0, 0) });
    const booklet = await booklets.create({ idea: "A robin shares a watering can." });
    const detail = await artifacts.revise(booklet.id, "audience_profile", audience);
    const cardId = "00000000-0000-4000-8000-000000000811";
    await createRepositories(database).conversation.persistAssistantCard({
      bookletId: booklet.id,
      messageId: "00000000-0000-4000-8000-000000000812",
      narration: "Please review the audience profile.",
      card: {
        schemaVersion: SCHEMA_VERSION,
        cardId,
        family: "artifact_review",
        variant: "summary",
        status: "active",
        title: "Review audience profile",
        allowedActions: ["approve_and_continue"],
        payload: {
          artifactType: "audience_profile",
          versionId: detail.currentVersion!.id,
          summary: [{ label: "Age", value: "6–8" }],
        },
      },
      createdAtMs: Date.UTC(2026, 7, 1, 12, 0, 1),
    });

    const result = await new CardService({ database }).submit(booklet.id, {
      responseId: "00000000-0000-4000-8000-000000000813",
      cardId,
      action: "approve_and_continue",
    });

    expect(result).toMatchObject({ kind: "saved", followupRequired: false });
    expect(await artifacts.get(booklet.id, "audience_profile")).toMatchObject({ state: "approved" });
  });
});
