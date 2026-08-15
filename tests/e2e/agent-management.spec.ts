import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { createDatabase } from "@/db/client";
import { agentVersions } from "@/db/schema";

const slotLabels = ["Manager", "Intake Readiness", "Story Planning", "Story Quality", "Visual Direction", "Booklet Specification", "Page Planning", "Image Prompts"];

test("uses a slot-driven workspace and creates, edits, and inspects an alternate logical agent", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin/agents");

  await expect(page.getByRole("heading", { name: "Runtime Agents" })).toBeVisible();
  await expect(page.getByText("No authentication.", { exact: true })).toBeVisible();
  const slots = page.getByRole("navigation", { name: "Runtime Slots" });
  for (const label of slotLabels) await expect(slots.getByRole("button", { name: new RegExp(`^${label}`) })).toBeVisible();
  await expect(slots.getByRole("button", { name: /^Manager/ })).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("heading", { name: "Kids Booklet Manager" })).toBeVisible();
  await page.getByText("Technical Details").click();
  await expect(page.getByText("00000000-0000-4000-8000-00000000b001", { exact: true })).toBeVisible();

  await slots.getByRole("button", { name: /^Story Planning/ }).click();
  await expect(page.getByRole("heading", { name: "Story Planning Specialist" })).toBeVisible();
  await page.getByRole("button", { name: "New Agent" }).click();
  await page.getByLabel("Display Name").fill("Cancelled draft");
  page.once("dialog", async (dialog) => { await dialog.accept(); });
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("heading", { name: "Story Planning Specialist" })).toBeVisible();
  await page.getByRole("button", { name: "New Agent" }).click();
  const create = page.getByRole("region", { name: "Create Inactive Draft" });
  await create.getByLabel("Role").selectOption("manager");
  await expect(create.getByLabel("Model")).toHaveValue("gpt-5.6-luna");
  await expect(create.getByLabel("Reasoning")).toHaveValue("low");
  await expect(create.getByLabel("Maximum Turns")).toHaveValue("2");
  await create.getByLabel("Role").selectOption("specialist");
  await create.getByLabel("Skill Binding").selectOption("quality_review_targeted_repair@1");
  await expect(create.getByLabel("Model")).toHaveValue("gpt-5.6-sol");
  await create.getByLabel("Display Name").fill("Browser-created story specialist");
  await create.getByLabel("Purpose").fill("Exercise the focused agent workspace.");
  await create.getByLabel("Skill Binding").selectOption("story_planning_revision@1");
  await create.getByLabel("Complete Instructions").fill("Return the required structured story proposal.");
  await create.getByRole("button", { name: "Create Draft" }).click();

  await expect(page.getByRole("status")).toContainText("Draft created.");
  await expect(page.getByRole("heading", { name: "Browser-created story specialist" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Version 1.*Draft · Inactive/ })).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("heading", { name: "Agents for This Slot" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Story Planning Specialist.*Active v1/ })).toBeVisible();

  await page.getByRole("button", { name: "Edit Draft" }).click();
  const edit = page.getByRole("region", { name: "Edit Browser-created story specialist" });
  await edit.getByLabel("Purpose").fill("   ");
  await edit.getByRole("button", { name: "Save Draft" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Correct the highlighted fields" })).toBeVisible();
  await expect(edit.getByText(/Too small: expected string to have >=1 characters/)).toBeVisible();
  await expect(edit.getByLabel("Purpose")).toBeFocused();
  await edit.getByLabel("Purpose").fill("Updated through explicit Edit mode.");
  await edit.getByLabel("Complete Instructions").fill("x".repeat(20_000));
  await edit.getByRole("button", { name: "Save Draft" }).click();
  await expect(page.getByRole("status")).toContainText("Draft saved.");
  await expect(page.getByText("Updated through explicit Edit mode.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await page.getByRole("button", { name: "Fork" }).click();
  await expect(page.getByRole("button", { name: /Version 2.*Draft · Inactive/ })).toHaveAttribute("aria-current", "true");
  await page.getByRole("button", { name: /Version 1.*Draft · Inactive/ }).click();
  await page.getByRole("button", { name: "Delete Draft" }).click();
  const deleteDialog = page.getByRole("dialog", { name: "Delete Draft" });
  await expect(deleteDialog).toContainText("unused, childless inactive draft");
  await deleteDialog.getByRole("button", { name: "Delete Draft" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "child versions" })).toBeVisible();
  await page.getByRole("button", { name: /Version 2.*Draft · Inactive/ }).click();
  await page.getByRole("button", { name: "Retire" }).click();
  const retireDialog = page.getByRole("dialog", { name: "Retire Version" });
  await expect(retireDialog).toContainText("immutable and cannot be activated again");
  await retireDialog.getByRole("button", { name: "Retire Version" }).click();
  await expect(page.getByRole("status")).toContainText("Version retired.");
  await expect(page.getByRole("button", { name: /Version 2.*Retired · Inactive/ })).toHaveAttribute("aria-current", "true");
});

test("guards dirty workspace changes and uses contextual lifecycle dialogs", async ({ page }) => {
  await page.goto("/admin/agents");
  const slots = page.getByRole("navigation", { name: "Runtime Slots" });
  await slots.getByRole("button", { name: /^Story Planning/ }).click();
  await page.getByRole("button", { name: /Browser-created story specialist.*inactive versions?/ }).click();
  await page.getByRole("button", { name: /Version 1.*Draft · Inactive/ }).click();
  await page.getByRole("button", { name: "Edit Draft" }).click();
  await page.getByLabel("Purpose").fill("Unsaved workspace change");

  page.once("dialog", async (dialog) => { await dialog.dismiss(); });
  await page.getByRole("link", { name: "Help" }).click();
  await expect(page).toHaveURL(/\/admin\/agents$/);

  page.once("dialog", async (dialog) => { expect(dialog.message()).toBe("Discard unsaved agent changes?"); await dialog.dismiss(); });
  await slots.getByRole("button", { name: /^Intake Readiness/ }).click();
  await expect(page.getByRole("heading", { name: "Edit Browser-created story specialist" })).toBeVisible();
  page.once("dialog", async (dialog) => { await dialog.accept(); });
  await slots.getByRole("button", { name: /^Intake Readiness/ }).click();
  await expect(page.getByRole("heading", { name: "Intake Readiness Specialist" })).toBeVisible();

  await page.getByRole("button", { name: "Fork" }).click();
  await expect(page.getByRole("status")).toContainText("Draft forked.");
  const versionTwo = page.getByRole("button", { name: /Version 2.*Draft · Inactive/ });
  await expect(versionTwo).toHaveAttribute("aria-current", "true");
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Draft confirmed.");
  await expect(page.getByRole("button", { name: /Version 2.*Confirmed · Inactive/ })).toHaveAttribute("aria-current", "true");

  const activateTrigger = page.getByRole("button", { name: "Activate Replacement" });
  await activateTrigger.click();
  const activateDialog = page.getByRole("dialog", { name: "Activate Replacement" });
  await expect(activateDialog).toContainText("Intake Readiness Specialist version 2");
  await expect(activateDialog).toContainText("replace Intake Readiness Specialist version 1");
  await expect(activateDialog).toContainText("future calls only");
  await expect(activateDialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(activateDialog).toBeHidden();
  await expect(activateTrigger).toBeFocused();

  await activateTrigger.click();
  await activateDialog.getByRole("button", { name: "Activate Replacement" }).click();
  await expect(page.getByRole("status")).toContainText("Replacement activated.");
  await expect(page.getByRole("button", { name: /Version 2.*Confirmed · Active/ })).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("button", { name: /Version 1.*Confirmed · Inactive/ })).toBeVisible();

  await page.getByRole("button", { name: /Version 1.*Confirmed · Inactive/ }).click();
  await expect(page.getByRole("heading", { name: "Danger Zone" })).toBeVisible();
  await page.getByRole("button", { name: "Activate Replacement" }).click();
  const restoreDialog = page.getByRole("dialog", { name: "Activate Replacement" });
  await restoreDialog.getByRole("button", { name: "Activate Replacement" }).click();
  await expect(page.getByRole("button", { name: /Version 1.*Confirmed · Active/ })).toHaveAttribute("aria-current", "true");
});

test("keeps corrupt coverage inspectable and repairs a missing active slot", async ({ page }) => {
  const database = createDatabase();
  await database.update(agentVersions).set({ isActive: false }).where(eq(agentVersions.id, "00000000-0000-4000-8000-00000000b101"));
  database.$client.close();

  await page.goto("/admin/agents");
  const slots = page.getByRole("navigation", { name: "Runtime Slots" });
  await expect(slots.getByRole("button", { name: /Intake Readiness.*Missing active specialist/ })).toBeVisible();
  await slots.getByRole("button", { name: /^Intake Readiness/ }).click();
  await expect(page.getByText(/Missing active specialist.*activate a valid replacement/)).toBeVisible();
  await page.getByRole("button", { name: /Version 1.*Confirmed · Inactive/ }).click();
  await page.getByRole("button", { name: "Activate Replacement" }).click();
  const dialog = page.getByRole("dialog", { name: "Activate Replacement" });
  await expect(dialog).toContainText("currently empty slot");
  await dialog.getByRole("button", { name: "Activate Replacement" }).click();
  await expect(page.getByRole("status")).toContainText("Replacement activated.");
  await expect(slots.getByRole("button", { name: /Intake Readiness.*Healthy/ })).toBeVisible();
});

test("shows an empty slot without hiding the creation path", async ({ page }) => {
  const imagePromptVersionId = "00000000-0000-4000-8000-00000000b107";
  const database = createDatabase();
  await database.update(agentVersions).set({ isActive: false, skillId: "intake_readiness@1" }).where(eq(agentVersions.id, imagePromptVersionId));
  database.$client.close();

  try {
    await page.goto("/admin/agents");
    const slots = page.getByRole("navigation", { name: "Runtime Slots" });
    await expect(slots.getByRole("button", { name: /Image Prompts.*Missing active specialist/ })).toBeVisible();
    await slots.getByRole("button", { name: /^Image Prompts/ }).click();
    await expect(page.getByRole("heading", { name: "No Agent Candidates" })).toBeVisible();
    await expect(page.getByText(/Create an inactive draft, then activate a valid version/)).toBeVisible();
    await expect(page.getByRole("region", { name: "No Agent Candidates" }).getByRole("button", { name: "New Agent" })).toBeVisible();
  } finally {
    const restoreDatabase = createDatabase();
    await restoreDatabase.update(agentVersions).set({ isActive: true, skillId: "image_prompt_compilation@1" }).where(eq(agentVersions.id, imagePromptVersionId));
    restoreDatabase.$client.close();
  }
});

test("stacks the slot rail before the workspace without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/agents");
  const slots = page.getByRole("navigation", { name: "Runtime Slots" });
  const workspace = page.getByRole("region", { name: "Kids Booklet Manager" });
  await expect(slots).toBeVisible();
  await expect(workspace).toBeVisible();
  const boxes = await Promise.all([slots.boundingBox(), workspace.boundingBox()]);
  expect(boxes[0]!.y).toBeLessThan(boxes[1]!.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await expect(page.getByRole("button", { name: "Fork" })).toBeVisible();
});
