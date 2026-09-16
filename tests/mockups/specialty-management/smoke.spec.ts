import { expect, test } from "@playwright/test";

const storageKey = "specialty-management-mockup:v2";
const agentUrl = "/mockups/specialty-management?view=agent&specialty=sp-story&agent=agent-playful&version=playful-v2&tab=edit&section=instructions";

test.beforeEach(async ({ page }) => {
  await page.goto(agentUrl);
  await page.evaluate((key) => localStorage.removeItem(key), storageKey);
  await page.reload();
});

test("shows a vertical directory with explicit specialty actions", async ({ page }) => {
  await page.goto("/mockups/specialty-management?view=directory");
  const story = page.locator(".directory-group").filter({ hasText: "Story Outline" });
  await expect(story.getByRole("button", { name: "Open Story Outline settings" })).toBeVisible();
  await expect(story.locator(".directory-agents")).toHaveCSS("grid-auto-flow", "row");
  await expect(story.getByRole("button", { name: /Playful Writer/ })).toBeVisible();
  await story.getByRole("button", { name: "Open Story Outline settings" }).click();
  await expect(page.getByRole("heading", { name: "Story Outline" })).toBeVisible();
});

test("hides the Assistant in the directory and restores it for an editor", async ({ page }) => {
  await page.goto("/mockups/specialty-management?view=directory");
  await expect(page.getByRole("heading", { name: "Assistant" })).toHaveCount(0);
  await page.getByRole("button", { name: /Playful Writer/ }).click();
  await expect(page.getByRole("heading", { name: "Assistant" })).toBeVisible();
});

test("keeps sidebar controls fixed while specialties scroll", async ({ page }) => {
  await page.goto(agentUrl);
  const heading = page.getByRole("heading", { name: "Specialties" });
  const search = page.getByLabel("Search specialties and agents");
  const list = page.locator(".specialty-list");
  const before = await heading.boundingBox();
  await list.evaluate((node) => { node.scrollTop = node.scrollHeight; });
  await expect.poll(() => list.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  expect((await heading.boundingBox())?.y).toBe(before?.y);
  await expect(search).toBeVisible();
});

test("redirects removed testing URLs", async ({ page }) => {
  await page.goto("/mockups/specialty-management?view=agent&specialty=sp-story&agent=agent-playful&version=playful-v2&tab=test");
  await expect(page.getByRole("heading", { name: "Playful Writer" })).toBeVisible();
  await expect(page.getByText("Agent testing has been removed. Configuration was opened instead.")).toBeVisible();
  await expect(page).toHaveURL(/section=configuration/);
  await page.goto("/mockups/specialty-management?view=test-history");
  await expect(page.getByRole("heading", { name: "Specialties and agents" })).toBeVisible();
  await expect(page.getByText("Agent testing has been removed. The directory was opened.")).toBeVisible();
});

test("keeps editing and Assistant proposals working", async ({ page }) => {
  await page.getByLabel("Main instructions").fill("# Story\nClear first paragraph.\nExtra detail.");
  await page.getByRole("button", { name: "Make this concise" }).click();
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("I prepared a simulated proposal.")).toBeVisible();
  await page.getByRole("button", { name: "Apply" }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByLabel("Main instructions")).toContainText("Clear first paragraph.");
});

test("persists a created specialty and remains keyboard operable", async ({ page }) => {
  await page.goto("/mockups/specialty-management?view=directory");
  await page.getByRole("button", { name: "Add specialty" }).click();
  await page.getByLabel("Name").fill("Poetry");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Poetry" })).toBeVisible();
  await page.goto("/mockups/specialty-management?view=agent&specialty=sp-story&agent=agent-playful&version=playful-v2&tab=edit&section=configuration");
  const separator = page.getByRole("separator", { name: "Resize specialties pane" });
  await separator.focus();
  await page.keyboard.press("ArrowRight");
  await expect(separator).toBeFocused();
});
