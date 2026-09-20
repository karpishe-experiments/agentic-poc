import { expect, test } from "@playwright/test";

test("keeps the synthetic story, review, and image across a refresh", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Dify experiment" }).click();
  await expect(page).toHaveURL(/\/experiments\/dify$/);
  await expect(page.getByText("Dify experiment · fake mode")).toBeVisible();
  await page.getByRole("button", { name: "Initialize experiment" }).click();
  await expect(page.getByRole("button", { name: "Create story" })).toBeVisible();

  await page.getByRole("button", { name: "Create story" }).click();
  await expect(page.getByRole("heading", { name: "Review revision 1" })).toBeVisible({ timeout: 30_000 });
  const firstPanel = await page.getByRole("listitem").filter({ hasText: "Panel 1" }).first().textContent();

  await page.getByLabel("Request a change").fill("Make the ending funnier, but keep panel one unchanged.");
  await page.getByRole("button", { name: "Save feedback and revise" }).click();
  await expect(page.getByRole("heading", { name: "Review revision 2" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("listitem").filter({ hasText: "Panel 1" }).first()).toHaveText(firstPanel!);

  await page.getByRole("button", { name: "Approve and illustrate" }).click();
  await expect(page.getByRole("heading", { name: "First panel image" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("img", { name: "Illustration of Pip beside the thirsty sunflower" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "First panel image" })).toBeVisible();
  await expect(page.getByText("2/2")).toHaveCount(0);
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByRole("img", { name: "Illustration of Pip beside the thirsty sunflower" })).toBeVisible();
  await expect(page.getByText("1/2")).toBeVisible();
});

test("offers image retry only while an attempt remains", async ({ page }) => {
  let attempts = 2;
  await page.route("**/api/experiments/dify/project", async (route) => {
    await route.fulfill({ json: { data: { context: {
      idea: "A synthetic story", current_revision: 2, state: "image_failed", image_attempt_count: attempts,
      image: { attempt_id: "00000000-0000-4000-8000-000000000001", status: "failed", error: "The image provider failed.", attempt_count: attempts, completion_in_progress: false, workflow_run_id: "workflow-test" },
      active_run_id: null, story: null, approved_revision: 2,
    }, revisions: [], runs: [] } } });
  });
  await page.goto("/experiments/dify");
  await expect(page.getByText("The image-attempt limit is reached.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry image" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Resume" })).toHaveCount(0);
  await expect(page.getByText("Save existing image")).toBeVisible();
  await expect(page.getByText("workflow-test")).toBeVisible();

  attempts = 1;
  await page.reload();
  await expect(page.getByRole("button", { name: "Retry image" })).toBeVisible();
});
