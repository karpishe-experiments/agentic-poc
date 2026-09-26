import { expect, test } from "@playwright/test";
import sharp from "sharp";

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

test("recovers an existing rectangular image at the cap and renders warnings", async ({ page }) => {
  const bytes = await sharp({ create: { width: 640, height: 320, channels: 3, background: "orange" } }).jpeg().toBuffer();
  let saved = false;
  let uploads = 0;
  let generationRequests = 0;
  await page.route("**/api/experiments/dify/turn", async (route) => { generationRequests++; await route.abort(); });
  await page.route("**/api/experiments/dify/project", async (route) => {
    await route.fulfill({ json: { data: { context: {
      idea: "A synthetic recovery", current_revision: 1, approved_revision: 1, state: saved ? "complete" : "image_failed", image_attempt_count: 2,
      image: { attempt_id: "00000000-0000-4000-8000-000000000001", status: saved ? "ready" : "unknown", error: saved ? null : "Download the existing image.", attempt_count: 2, completion_in_progress: false,
        width: saved ? 640 : null, height: saved ? 320 : null, format: saved ? "jpeg" : null, warnings: saved ? ["Image is 640 × 320; requested 1536 × 1536. Original image retained.", "Image format is JPEG; requested PNG. Original image retained."] : [] },
      active_run_id: null, story: null, story_warnings: [],
    }, revisions: [], runs: [] } } });
  });
  await page.route("**/api/experiments/dify/image/recover?*", async (route) => {
    expect(route.request().postDataBuffer()).toEqual(bytes);
    expect(route.request().url()).toContain("expected_revision=1&attempt_id=00000000-0000-4000-8000-000000000001");
    uploads++; saved = true;
    await route.fulfill({ json: { data: { state: "complete" } } });
  });
  await page.route("**/api/experiments/dify/assets/panel-1", (route) => route.fulfill({ body: bytes, contentType: "image/jpeg" }));
  await page.goto("/experiments/dify");
  await page.getByLabel("Save existing image").setInputFiles({ name: "original.bin", mimeType: "application/octet-stream", buffer: bytes });
  const image = page.getByRole("img", { name: "Illustration of Pip beside the thirsty sunflower" });
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute("width", "640");
  await expect(image).toHaveAttribute("height", "320");
  await expect(page.getByText("Image format is JPEG; requested PNG. Original image retained.")).toBeVisible();
  await expect(page.getByText("2/2")).toBeVisible();
  await expect(page.getByText("Download the existing image.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retry image" })).toHaveCount(0);
  await page.reload();
  await expect(image).toBeVisible();
  expect(uploads).toBe(1);
  expect(generationRequests).toBe(0);
});
