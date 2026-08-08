import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDatabase } from "@/db/client";
import { createRepositories } from "@/db/repositories";
import { BookletService } from "@/lib/application/booklet-service";
import { isTypedWorkflowRecovery } from "@/lib/application/chat-service";
import { ManagerService } from "@/lib/application/manager-service";
import { RecoverableApplicationError } from "@/lib/application/application-error";
import type { SkillContext } from "@/lib/contracts/skills";
import { FakeModelRuntime } from "@/lib/testing/fake-model-runtime";
import { createDefaultSkillRegistry } from "@/lib/skills/default-registry";

const databases: Array<ReturnType<typeof createDatabase>> = [];

afterEach(() => databases.splice(0).forEach((database) => database.$client.close()));

async function createFixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "kids-manager-contracts-"));
  const database = createDatabase(`file:${path.join(directory, "booklets.db")}`);
  databases.push(database);
  await migrate(database, { migrationsFolder: path.join(process.cwd(), "db", "migrations") });
  const booklet = await new BookletService({ database }).create({ idea: "Robin shares rainwater." });
  return { database, booklet };
}

function context(bookletId: string, stage: SkillContext["stage"], operation = "guided_intake"): SkillContext {
  return { bookletId, stage, operation, intent: "Continue this saved step.", knownFacts: ["Robin shares rainwater."], recentMessages: [], approvedArtifactVersionIds: [], traceId: randomUUID() };
}

describe("manager workflow contracts", () => {
  it("exposes only the Final Pages skill that accepts Final Pages input", () => {
    expect(createDefaultSkillRegistry().getAllowed("final_pages").map((skill) => skill.id)).toEqual(["image_prompt_compilation@1"]);
  });

  it("hides Story quality repair from a normal Story Plan draft", async () => {
    const { database, booklet } = await createFixture();
    const runtime = new FakeModelRuntime();
    const route = vi.spyOn(runtime, "route");
    const manager = new ManagerService({ database, runtime, runtimeMode: "fake" });

    await manager.run(context(booklet.id, "story_plan"), {
      cardId: randomUUID(),
      skillInput: { intent: "Draft the Story Plan.", currentStory: null },
    });

    expect(route).toHaveBeenCalledWith(expect.objectContaining({
      availableSkills: [expect.objectContaining({ id: "story_planning_revision@1" })],
    }));
  });

  it("records an incompatible manager route and turns it into a typed recovery condition", async () => {
    const { database, booklet } = await createFixture();
    const incompatibleRuntime = {
      async route() {
        return {
          skillId: "quality_review_targeted_repair@1" as const,
          arguments: { intent: "Retry final pages." },
          explanation: "Intentionally invalid test route.",
          runMetadata: { usage: { inputTokens: 0, outputTokens: 0 }, providerRequestId: null },
        };
      },
    };
    const manager = new ManagerService({ database, runtime: incompatibleRuntime, runtimeMode: "fake" });

    await expect(manager.run(context(booklet.id, "final_pages"), { cardId: randomUUID() }))
      .rejects.toMatchObject({ code: "skill_contract_mismatch", status: 409 });

    const calls = await createRepositories(database).evidence.listModelCalls(booklet.id);
    expect(calls).toEqual(expect.arrayContaining([expect.objectContaining({ operation: "manager", status: "failed", errorKind: "validation" })]));
    expect(isTypedWorkflowRecovery(new RecoverableApplicationError({ code: "skill_contract_mismatch", message: "Retry", status: 409 }))).toBe(true);
  });
});
