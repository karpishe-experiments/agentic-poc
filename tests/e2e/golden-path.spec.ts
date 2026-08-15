import { expect, test } from "@playwright/test";

test("completes the isolated fake-provider booklet creation flow and downloads its PDF", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Start with a story idea").fill("A robin learns that sharing rainwater helps the whole garden bloom.");
  await page.getByRole("button", { name: "Create booklet" }).click();
  await page.waitForURL(/\/booklets\//);

  await page.getByRole("button", { name: "Start guided questions" }).click();
  await page.getByRole("radio", { name: /Ages 6–8/ }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Review the audience profile" })).toBeVisible();
  await page.getByRole("button", { name: "Approve and continue" }).click();
  await expect(page.getByRole("heading", { name: "Review the Story Plan" })).toBeVisible();
  await page.getByRole("button", { name: "Approve and continue" }).click();
  await page.getByRole("radio", { name: /Soft watercolor/ }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Review the Visual Bible" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Approve and continue" }).click();
  await expect(page.getByRole("heading", { name: "Review canonical references" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await page.getByRole("button", { name: "Approve all reviewed references" }).click();
  await expect(page.getByRole("heading", { name: "Confirm booklet geometry" })).toBeVisible();
  await page.getByRole("radio", { name: /Square/ }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Review the Page Plan" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Cover · cover" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Page 6 · story" })).toBeVisible();
  await page.getByRole("button", { name: "Approve and continue" }).click();
  await expect(page.getByRole("heading", { name: "Review final pages" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await page.getByRole("button", { name: "Approve all reviewed pages" }).click();
  await expect(page.getByRole("heading", { name: "Download your booklet PDF" })).toBeVisible({ timeout: 20_000 });
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Download PDF" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  await download.saveAs("output/playwright/golden-path-booklet.pdf");
});
