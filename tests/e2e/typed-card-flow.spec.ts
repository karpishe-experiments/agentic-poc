import { expect, test } from "@playwright/test";

test("persists a guided decision, restores its collapsed state, and reopens it", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Start with a story idea").fill("A lark learns that sharing rainwater helps the whole garden bloom.");
  await page.getByRole("button", { name: "Create booklet" }).click();

  await expect(page.getByRole("region", { name: "Conversation" })).toBeVisible();
  await page.getByRole("button", { name: "Start guided questions" }).click();
  await expect(page.getByRole("heading", { name: "Who is this story for?" })).toBeVisible();
  await page.getByRole("radio", { name: /Ages 6–8/ }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Who is this story for?: Ages 6–8", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText("Submitted", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reopen" }).first().click();
  await expect(page.getByText("Reopened: Who is this story for?", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Who is this story for?" })).toHaveCount(1);
});
