import { expect, test, type Page } from "@playwright/test";

async function runAgentWhenSelectionIsRequired(page: Page) {
  const runButton = page.getByRole("button", { name: "Run this step" });
  if (!await runButton.isVisible({ timeout: 1_000 }).catch(() => false)) return;
  const firstCandidate = page.getByRole("checkbox").first();
  await expect(firstCandidate).toBeVisible();
  await firstCandidate.check();
  await runButton.click();
}

test("persists a guided decision, restores its collapsed state, and reopens it", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Start with a story idea").fill("A lark learns that sharing rainwater helps the whole garden bloom.");
  await page.getByRole("button", { name: "Create booklet" }).click();

  await expect(page.getByRole("region", { name: "Conversation" })).toBeVisible();
  await page.getByRole("button", { name: "Start guided questions" }).click();
  await runAgentWhenSelectionIsRequired(page);
  await expect(page.getByRole("heading", { name: "Who is this story for?" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("radio", { name: /Ages 6–8/ }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Who is this story for?: Ages 6–8", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText("Submitted", { exact: true })).toHaveCount(2);
  await page.getByText("Who is this story for?", { exact: true }).locator("..").getByRole("button", { name: "Reopen" }).click();
  await expect(page.getByText("Reopened: Who is this story for?", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Who is this story for?" })).toHaveCount(1);
});
