import { expect, test, type Page } from "@playwright/test";

async function openAdvancedDocument(page: Page) {
  const details = page.locator("details").filter({ hasText: "Advanced structured document" });
  if (await details.getAttribute("open") === null) await details.locator("summary").click();
  await expect(page.getByLabel("Structured document")).toBeVisible();
}

const audience = {
  schemaVersion: "1",
  ageBand: "6-8",
  interests: ["garden mysteries"],
  readingNeeds: "Concrete, warm language.",
  tone: "Playful and reassuring",
  avoidList: ["frightening danger"],
  knownFacts: ["A hedgehog helps a moth."],
  openAssumptions: ["The story is set in spring."],
};

test("creates immutable artifact versions and exposes affected downstream review", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Start with a story idea").fill("A hedgehog shares a lantern with a lost moth.");
  await page.getByRole("button", { name: "Create booklet" }).click();

  await page.getByRole("button", { name: "Start guided questions" }).click();
  await page.getByRole("radio", { name: /Ages 6–8/ }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Review the audience profile" })).toBeVisible();
  await page.getByRole("button", { name: "Approve and continue" }).click();
  await expect(page.getByRole("heading", { name: "Review the Story Plan" })).toBeVisible();
  await page.getByRole("button", { name: "Approve and continue" }).click();

  await page.getByRole("link", { name: /1\. Audience/ }).click();
  await page.waitForURL(/artifact=audience_profile/);
  await openAdvancedDocument(page);
  await page.getByLabel("Structured document").fill(JSON.stringify({ ...audience, tone: "Gentle and curious" }, null, 2));
  const revisionResponse = page.waitForResponse((response) => response.request().method() === "PATCH" && response.url().includes("/artifacts/audience_profile"));
  await page.getByRole("button", { name: "Save new version" }).click();
  expect((await revisionResponse).ok()).toBe(true);
  await expect(page.getByLabel("Artifact history").getByText(/Version 2/)).toBeVisible();

  await page.getByRole("link", { name: /2\. Story/ }).click();
  await expect(page.getByRole("link", { name: /2\. Story needs review/ })).toBeVisible();
  await expect(page.getByLabel("Artifact history").getByText(/Version 1/)).toBeVisible();
});
