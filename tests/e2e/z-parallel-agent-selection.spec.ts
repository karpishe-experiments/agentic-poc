import { expect, test } from "@playwright/test";
import { createMongoDatabase } from "@/db/client";
import { AgentManagementService } from "@/lib/application/agent-management-service";

async function ensureMultipleIntakeCandidates() {
  const uri = process.env.MONGODB_URI; const databaseName = process.env.MONGODB_DATABASE;
  if (!uri || !databaseName) throw new Error("The e2e MongoDB configuration is missing.");
  const database = createMongoDatabase({ uri, databaseName });
  try {
    const agents = new AgentManagementService({ database });
    const snapshot = await agents.getAdminSnapshot();
    const active = snapshot.versions.filter((version) => version.isActive && version.role === "specialist" && version.skillId === "intake_readiness@1");
    if (active.length >= 2) return;
    const draft = await agents.create({ displayName: "Alternate Intake Readiness Specialist", purpose: "Offers a second candidate for creator selection.", role: "specialist", skillId: "intake_readiness@1", instructions: "Return the required structured audience proposal.", provider: "openai", modelId: "gpt-5.6-sol", reasoningEffort: "medium", maxTurns: 1 });
    const confirmed = await agents.confirm({ id: draft.id, expectedRevision: draft.revision });
    await agents.activate({ id: confirmed.id, expectedRevision: confirmed.revision, observedSlotVersionId: active[0]?.id ?? null, observedLogicalActiveVersionId: null });
  } finally { await database.close(); }
}

test("searches, executes, and selects results from multiple candidate agents", async ({ page }) => {
  await ensureMultipleIntakeCandidates();
  await page.goto("/");
  await page.getByLabel("Start with a story idea").fill("A robin shares rainwater in a bright garden.");
  await page.getByRole("button", { name: "Create booklet" }).click();
  await page.getByRole("button", { name: "Start guided questions" }).click();
  const search = page.getByRole("searchbox", { name: "Search agents" });
  await expect(search).toBeVisible();
  await search.fill("Alternate");
  await expect(page.getByText("Alternate Intake Readiness Specialist", { exact: true })).toBeVisible();
  await expect(page.getByText(/Fake-mode runs are free/)).toBeVisible();
  await search.fill("");
  const candidates = page.getByRole("checkbox");
  await expect(candidates).toHaveCount(2);
  await candidates.nth(0).click();
  await candidates.nth(1).click();
  await expect(candidates.nth(0)).toBeChecked();
  await expect(candidates.nth(1)).toBeChecked();
  const runButton = page.getByRole("button", { name: "Run this step" });
  await expect(runButton).toBeEnabled();
  await runButton.click();
  await expect(page.getByRole("button", { name: "Use this result" }).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Retry failed" })).toHaveCount(0);
  await page.getByRole("button", { name: "Use this result" }).first().click();
  await expect(page.getByRole("heading", { name: "Who is this story for?" })).toBeVisible({ timeout: 20_000 });
});
