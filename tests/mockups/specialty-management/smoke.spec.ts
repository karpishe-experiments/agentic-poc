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
