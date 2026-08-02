import { expect, test } from "@playwright/test";

async function send(page: import("@playwright/test").Page, text: string) {
  await page.getByLabel("Tell the creative partner what to change").fill(text);
  await page.getByRole("button", { name: "Send" }).click();
}

test("completes the isolated fake-provider booklet golden path and downloads its PDF", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Start with a story idea").fill("A robin learns that sharing rainwater helps the whole garden bloom.");
  await page.getByRole("button", { name: "Create booklet" }).click();
  await page.waitForURL(/\/booklets\//);

  await page.getByRole("button", { name: "Start guided questions" }).click();
  await page.getByRole("radio", { name: /Ages 6–8/ }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Review the audience profile" })).toBeVisible();
  await page.getByRole("button", { name: "Approve and continue" }).click();

  await send(page, "Draft the Story Plan.");
  await expect(page.getByRole("heading", { name: "Review the Story Plan" })).toBeVisible();
  await page.getByRole("button", { name: "Approve and continue" }).click();

  await send(page, "Choose visual direction.");
  await page.getByRole("radio", { name: /Soft watercolor/ }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Review the Visual Bible" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Approve and continue" }).click();
  await expect(page.getByRole("heading", { name: "Review canonical references" })).toBeVisible({ timeout: 20_000 });
  for (const checkbox of await page.getByRole("checkbox").all()) await checkbox.check();
  await page.getByRole("button", { name: "Approve and continue" }).click();

  await send(page, "Recommend booklet pages.");
  await page.getByRole("radio", { name: /Square/ }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Review the Page Plan" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Cover · cover" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Page 6 · story" })).toBeVisible();
  await page.getByRole("button", { name: "Approve and continue" }).click();
  await expect(page.getByRole("heading", { name: "Review final pages" })).toBeVisible({ timeout: 20_000 });
  for (const checkbox of await page.getByRole("checkbox").all()) await checkbox.check();
  await page.getByRole("button", { name: "Approve and continue" }).click();
  await send(page, "Export the PDF.");
  await expect(page.getByRole("heading", { name: "Download your booklet PDF" })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download PDF" }).click();
  await expect((await download).suggestedFilename()).toMatch(/\.pdf$/);

  await page.getByRole("link", { name: "Help" }).click();
  await expect(page.getByRole("heading", { name: "Kids Booklet help" })).toBeVisible();
});
