import { expect, test } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("/mockups/specialty-management");
  await page.evaluate(() =>
    localStorage.removeItem("specialty-management-mockup:v1"),
  );
  await page.reload();
});
test("loads with local synthetic data and no service calls", async ({
  page,
}) => {
  const forbidden: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/") || url.hostname !== "127.0.0.1")
      forbidden.push(request.url());
  });
  await page.goto("/mockups/specialty-management");
  await expect(
    page.getByRole("heading", { name: "Specialties and agents" }),
  ).toBeVisible();
  expect(forbidden).toEqual([]);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("specialty-management-mockup:v1"),
    ),
  ).toContain('"formatVersion":1');
});
test("creates, saves, reloads, discards, retires and restores a specialty", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Add specialty" }).click();
  const name = page.getByLabel("Name");
  await name.fill("Poetry");
  await page.getByLabel("Description").fill("Plans poems.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Poetry", exact: true }),
  ).toBeVisible();
  await name.fill("Temporary");
  await page.getByRole("button", { name: "Discard" }).click();
  await expect(name).toHaveValue("Poetry");
  await page.getByRole("button", { name: "Retire", exact: true }).click();
  await page.getByLabel("Show retired").check();
  await expect(
    page.getByRole("button", { name: "Poetry text · Retired" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.getByRole("button", { name: "Poetry text" })).toBeVisible();
});
test("resizes navigation with the keyboard", async ({ page }) => {
  const separator = page.getByRole("separator", {
    name: "Resize specialties pane",
  });
  const before = await separator.boundingBox();
  await separator.focus();
  await page.keyboard.press("ArrowRight");
  const after = await separator.boundingBox();
  expect(after!.x).toBeGreaterThan(before!.x);
});
test("creates and activates an image agent with a persisted reference", async ({ page }) => {
  await page.getByRole("button", { name: "Expand Illustration" }).click();
  const illustration = page.getByRole("listitem").filter({ has: page.getByRole("button", { name: /Illustration image/ }) }).first();
  await illustration.getByRole("button", { name: "Add agent" }).click();
  await expect(page.getByRole("group", { name: /Image model/ })).toBeVisible();
  await page.getByLabel("Title").fill("Dream Painter");
  await page.getByRole("button", { name: "Add reference" }).click();
  await page.getByLabel("Reference content").fill("Keep the moon bright.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Dream Painter" })).toBeVisible();
  await expect(page.getByLabel("Reference content")).toHaveValue("Keep the moon bright.");
  await page.getByRole("button", { name: "Configuration" }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await page.getByRole("button", { name: "Activate", exact: true }).click();
  await expect(page.getByText(/confirmed · Active/)).toBeVisible();
  await page.getByRole("button", { name: "Deactivate" }).click();
  await page.getByRole("button", { name: "Retire" }).click();
  await expect(page.getByText(/Version 1 · retired/)).toBeVisible();
});
test("text agents omit image controls and draft deletion selects the active version", async ({ page }) => {
  await expect(page.getByRole("group", { name: /Image model/ })).toHaveCount(0);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete draft" }).click();
  await expect(page.getByLabel("Version")).toHaveValue("playful-v1");
  await expect(page.getByText(/Version 1 · confirmed · Active/)).toBeVisible();
});
test("forks visible pending agent content without changing its source", async ({ page }) => {
  await page.getByRole("button", { name: "Main instructions" }).click();
  await page.getByLabel("Main instructions").fill("Pending source content");
  await page.getByRole("button", { name: "Fork draft" }).click();
  await expect(page.getByLabel("Main instructions")).toHaveValue("Pending source content");
  await expect(page.getByLabel("Version")).toContainText("v3 · draft");
  await page.getByLabel("Version").selectOption("playful-v2");
  await page.getByRole("button", { name: "Main instructions" }).click();
  await expect(page.getByLabel("Main instructions")).toHaveValue("Pending source content");
});
test("edits Markdown with keyboard and toolbar mention menus", async ({ page }) => {
  const editor = page.getByLabel("Main instructions");
  await editor.fill("Use @sto");
  await page.keyboard.press("Enter");
  await expect(editor).toHaveValue(/\[@Story Planning\]\(specialty:sp-story\)/);
  await page.getByRole("button", { name: "Mention tool" }).click();
  await page.getByRole("option", { name: /get_artifact_context/ }).click();
  await page.getByRole("button", { name: "Mention reference" }).click();
  await page.getByRole("option", { name: /rhyming-guide\.md/ }).click();
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByRole("button", { name: "@Story Planning" })).toBeVisible();
  await expect(page.getByRole("button", { name: "/get_artifact_context" })).toBeVisible();
  await page.getByRole("button", { name: "/get_artifact_context" }).click();
  await expect(page.getByText("Read artifact context.")).toBeVisible();
  await page.getByRole("button", { name: "$rhyming-guide.md" }).click();
  await expect(page.getByText("Prefer natural rhythm.")).toBeVisible();
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByLabel("Reference content")).toBeVisible();
  await page.getByRole("button", { name: "Preview" }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Preview" })).toHaveClass(/active/);
});
test("navigates specialty mentions and disables deleted references", async ({ page }) => {
  const editor = page.getByLabel("Main instructions");
  await editor.fill("See [@Story Planning](specialty:sp-story) and [$guide](reference:ref-rhyme-v2).");
  await page.getByRole("button", { name: "Preview" }).click();
  await page.getByRole("button", { name: "$guide" }).click();
  await page.getByRole("button", { name: "Edit" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Remove reference" }).click();
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByRole("button", { name: "Unavailable reference" })).toBeDisabled();
  await page.getByRole("button", { name: "@Story Planning" }).click();
  await expect(page.getByRole("heading", { name: "Story Planning", exact: true })).toBeVisible();
});
test("renders only the bundled Markdown image without external requests", async ({ page }) => {
  const externalImages: string[] = [];
  page.on("request", (request) => { if (request.url().includes("example.com/remote.png")) externalImages.push(request.url()); });
  await page.getByLabel("Main instructions").fill("![Local](/mockups/specialty-management/sample-image.svg)\n\n![Remote](https://example.com/remote.png)\n\n[Unsafe](javascript:alert(1))");
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByRole("img", { name: "Local" })).toBeVisible();
  await expect(page.getByText("Image placeholder: Remote")).toBeVisible();
  expect(externalImages).toEqual([]);
  await expect(page.getByRole("link", { name: "Unsafe" })).not.toHaveAttribute("href", /javascript:/);
});
test("reopens an agent at its most recently selected version", async ({ page }) => {
  await expect(page.getByLabel("Version")).toHaveValue("playful-v2");
  await page.getByRole("button", { name: "Story Planning text" }).click();
  await page.getByRole("button", { name: /Playful Writer/ }).click();
  await expect(page.getByLabel("Version")).toHaveValue("playful-v2");
});
