import { expect, test } from "@playwright/test";

test("creates an inactive specialist draft bound to a registered skill", async ({ page }) => {
  await page.goto("/admin/agents");
  const create = page.locator("section").filter({ has: page.getByRole("heading", { name: "Create inactive draft" }) }).first();
  await create.getByLabel("Role").selectOption("manager");
  await expect(create.getByLabel("Model")).toHaveValue("gpt-5.6-luna");
  await expect(create.getByLabel("Reasoning")).toHaveValue("low");
  await expect(create.getByLabel("Maximum turns")).toHaveValue("2");
  await create.getByLabel("Role").selectOption("specialist");
  await create.getByLabel("Skill binding").selectOption("quality_review_targeted_repair@1");
  await expect(create.getByLabel("Model")).toHaveValue("gpt-5.6-sol");
  await create.getByLabel("Display name").fill("Browser-created story specialist");
  await create.getByLabel("Purpose").fill("Exercise the local admin create flow.");
  await create.getByLabel("Skill binding").selectOption("story_planning_revision@1");
  await create.getByLabel("Complete instructions").fill("Return the required structured story proposal.");
  await create.getByRole("button", { name: "Create Draft" }).click();

  await expect(page.getByText("Draft created.")).toBeVisible();
  const created = page.locator("article").filter({ hasText: "Browser-created story specialist" });
  await expect(created.getByText(/Version 1 · draft · inactive/)).toBeVisible();
});

test("shows seeded active coverage and lets the operator fork, confirm, and activate a specialist replacement", async ({ page }) => {
  await page.goto("/admin/agents");
  await expect(page.getByRole("heading", { name: "Runtime agents" })).toBeVisible();
  await expect(page.getByText(/No authentication: use only in trusted local development/)).toBeVisible();
  await expect(page.getByText("manager", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Active coverage").getByText("intake_readiness@1", { exact: true })).toBeVisible();
  const intake = page.locator("article").filter({ hasText: "Intake Readiness Specialist" }).first();
  await intake.locator("summary").click();
  await intake.getByRole("button", { name: "Fork" }).click();
  await expect(page.getByText("Draft forked.").last()).toBeVisible();
  await expect(intake.getByText(/Version 2 · draft · inactive/)).toBeVisible();
  const replacement = intake.locator("details").filter({ hasText: "Version 2 · draft · inactive" });
  await replacement.locator("summary").click();
  await replacement.getByRole("button", { name: "Confirm" }).click();
  const confirmedReplacement = page.locator("article").filter({ hasText: "Intake Readiness Specialist" }).first().locator("details").filter({ hasText: "Version 2 · confirmed · inactive" });
  await expect(confirmedReplacement).toBeVisible();
  if (await confirmedReplacement.getAttribute("open") === null) await confirmedReplacement.locator("summary").click();
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("replace Intake Readiness Specialist");
    await dialog.accept();
  });
  await confirmedReplacement.getByRole("button", { name: "Activate Replacement" }).click();
  const activatedIntake = page.locator("article").filter({ hasText: "Intake Readiness Specialist" }).first();
  await expect(activatedIntake.getByText(/Version 2 · confirmed · active/)).toBeVisible();
  await expect(activatedIntake.getByText(/Version 1 · confirmed · inactive/)).toBeVisible();
});
