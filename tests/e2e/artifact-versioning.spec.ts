import { expect, test } from "@playwright/test";

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

const story = {
  schemaVersion: "1",
  premise: "A hedgehog shares a lantern with a lost moth.",
  theme: "Kindness makes a dark path feel safe.",
  characters: [{ entityId: "00000000-0000-4000-8000-000000000401", name: "Hedgehog", narrativeRole: "hero", goal: "Guide the moth home.", relationships: ["helps the moth"], named: true, continuityRelevant: true, recurringVisualSubject: true }],
  settings: [{ entityId: "00000000-0000-4000-8000-000000000402", name: "Moonlit garden", narrativeRole: "setting", named: true, continuityRelevant: true, recurringVisualSubject: true }],
  storyArc: "Hedgehog notices the moth, shares light, and walks together.",
  keyEvents: ["The moth loses the moonlight.", "Hedgehog offers the lantern.", "They reach the garden gate."],
  ending: "The moth finds its way safely home.",
  ageFitNotes: "Warm, concrete consequences for ages six to eight.",
  continuityConstraints: ["The lantern stays golden."],
};

test("creates immutable artifact versions and exposes affected downstream review", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Start with a story idea").fill("A hedgehog shares a lantern with a lost moth.");
  await page.getByRole("button", { name: "Create booklet" }).click();

  await page.getByLabel("Structured document").fill(JSON.stringify(audience, null, 2));
  await page.getByRole("button", { name: "Create version" }).click();
  await expect(page.getByLabel("Artifact history").getByText(/Version 1/)).toBeVisible();
  await page.getByRole("button", { name: "Approve this version" }).click();
  await expect(page.getByText("approved", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: /2\. Story/ }).click();
  await page.getByLabel("Structured document").fill(JSON.stringify(story, null, 2));
  await page.getByRole("button", { name: "Create version" }).click();
  await page.getByRole("button", { name: "Approve this version" }).click();

  await page.getByRole("link", { name: /1\. Audience/ }).click();
  await page.waitForURL(/artifact=audience_profile/);
  await page.getByLabel("Structured document").fill(JSON.stringify({ ...audience, tone: "Gentle and curious" }, null, 2));
  const revisionResponse = page.waitForResponse((response) => response.request().method() === "PATCH" && response.url().includes("/artifacts/audience_profile"));
  await page.getByRole("button", { name: "Save new version" }).click();
  expect((await revisionResponse).ok()).toBe(true);
  await expect(page.getByLabel("Artifact history").getByText(/Version 2/)).toBeVisible();

  await page.getByRole("link", { name: /2\. Story/ }).click();
  await expect(page.getByText("needs review", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Artifact history").getByText(/Version 1/)).toBeVisible();
});
