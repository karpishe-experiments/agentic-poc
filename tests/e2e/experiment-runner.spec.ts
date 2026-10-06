import { expect, test } from "@playwright/test";
import { createMongoDatabase } from "@/db/client";
import { createRepositories } from "@/db/repositories";

const runId = "00000000-0000-4000-8000-000000000701";
const bookletId = "00000000-0000-4000-8000-000000000702";
const assetId = "00000000-0000-4000-8000-000000000703";
const coverAssetId = "00000000-0000-4000-8000-000000000715";
const pageAssetId = "00000000-0000-4000-8000-000000000716";
const layoutVersionId = "00000000-0000-4000-8000-000000000709";
const pageOneId = "00000000-0000-4000-8000-000000000710";
const pageThreeId = "00000000-0000-4000-8000-000000000711";

const pageSelection = {
  schemaVersion: "2" as const,
  runId,
  configurationHash: "a".repeat(64),
  layoutVersionId,
  pages: [
    { pageId: pageOneId, pageIndex: 1, pageBibleVersionId: "00000000-0000-4000-8000-000000000712", previousPageVersionId: null },
    { pageId: pageThreeId, pageIndex: 3, pageBibleVersionId: "00000000-0000-4000-8000-000000000713", previousPageVersionId: "00000000-0000-4000-8000-000000000714" },
  ],
};

const selectedBatch = {
  schemaVersion: "2" as const,
  runId,
  configurationHash: pageSelection.configurationHash,
  layoutVersionId,
  selection: "selected_batch" as const,
  pages: [
    { pageId: pageThreeId, pageBibleVersionId: pageSelection.pages[1].pageBibleVersionId, previousPageVersionId: pageSelection.pages[1].previousPageVersionId },
    { pageId: pageOneId, pageBibleVersionId: pageSelection.pages[0].pageBibleVersionId, previousPageVersionId: pageSelection.pages[0].previousPageVersionId },
  ],
};

function savedRun(status: "queued" | "paused", revision: number) {
  return {
    runId, bookletId, persona: "professional_creator", mode: "simulated", brief: "Two friends repair their community observatory.",
    status, revision, pauseRequested: status === "paused", activeOperationId: null, nextNarrativeTask: "J13", pendingDecision: null,
    counters: { logicalText: 18, logicalImage: 4, payableText: 0, payableImage: 0, steps: 22 }, limits: { text: 220, image: 20, steps: 300 },
    generationStatus: "in_progress", evaluationStatus: "pending",
    reports: [{ operationId: "00000000-0000-4000-8000-000000000704", workflowRunId: "00000000-0000-4000-8000-000000000705",
      verifiedWorkflowId: "00000000-0000-4000-8000-000000000706", matchesCurrentVersions: true,
      report: { role: "tester", mode: "simulated", summary: "The creator-facing flow is clear; no quality score is claimed." } }],
    currentArtifacts: [{ id: "00000000-0000-4000-8000-000000000707", taskId: "J09", state: "approved", currentVersionId: "00000000-0000-4000-8000-000000000708",
      versions: [{ id: "00000000-0000-4000-8000-000000000708", number: 1, approval: { origin: "explicit" }, dependencyVersionIds: [],
        content: { title: "Observatory friends", build: { assetId } }, warnings: [{ field: "composition", message: "Fixture warning remains advisory." }] }] },
      ...[0, 1].map((pageIndex) => ({ id: `final-page-${pageIndex}`, taskId: "J13", state: "approved", currentVersionId: `page-version-${pageIndex}`,
        versions: [{ id: `page-version-${pageIndex}`, number: 1, approval: { origin: "explicit" }, dependencyVersionIds: [],
          content: { pageIndex, assetId: pageIndex === 0 ? coverAssetId : pageAssetId }, warnings: [] }] }))],
  };
}

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAF/gJ+Yk7I3QAAAABJRU5ErkJggg==", "base64");

async function seedSavedBooklet() {
  const uri = process.env.MONGODB_URI;
  const databaseName = process.env.MONGODB_DATABASE;
  if (!uri || !databaseName) throw new Error("The isolated E2E MongoDB configuration is missing.");
  const database = createMongoDatabase({ uri, databaseName });
  try {
    await database.collections.booklets.insertOne({ _id: bookletId, schemaVersion: "2", workingTitle: "Observatory friends",
      lifecycle: "draft", currentStage: "J13", coverAssetId: null, executionProfile: "dify_booklet_v1", experimentRunId: runId,
      createdAtMs: 1, updatedAtMs: 1 });
    expect(await createRepositories(database).booklets.get(bookletId)).toBeNull();
  } finally {
    await database.close();
  }
}

test.skip(process.env.E2E_PROFILE !== "experiment-runner", "The runner fixture requires the isolated experiment-runner profile.");

test("runs the isolated simulated runner UI fixture without provider or Dify traffic", async ({ page }) => {
  await seedSavedBooklet();
  let state: (ReturnType<typeof savedRun> & { pageSelection?: typeof pageSelection; pageBatch?: typeof selectedBatch }) | null = null;
  const requests: Array<{ pathname: string; method: string; body: unknown }> = [];
  const external: string[] = [];
  page.context().on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") external.push(url.origin);
  });
  await page.context().route("**/api/assets/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: png }));
  await page.context().route("**/api/experiments/booklet-runs**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const rawBody = request.postData();
    const body = rawBody ? request.postDataJSON() as unknown : null;
    requests.push({ pathname: url.pathname, method: request.method(), body });
    if (request.method() === "GET") return route.fulfill({ json: { data: url.pathname.endsWith(runId) ? state : state ? [state] : [] } });
    if (request.method() !== "POST") return route.fulfill({ status: 405, json: { error: { code: "method_not_allowed", message: "Fixture accepts GET and POST only." } } });
    if (url.pathname === "/api/experiments/booklet-runs") {
      state = savedRun("queued", 3);
      return route.fulfill({ json: { data: state } });
    }
    if (url.pathname.endsWith("/pause") && state) {
      expect(body).toEqual({ expectedRevision: 3 });
      state = { ...savedRun("paused", 4), pageSelection };
      return route.fulfill({ json: { data: state } });
    }
    if (url.pathname.endsWith("/pages") && state) {
      expect(body).toEqual({ expectedRevision: 4, batch: selectedBatch });
      state = { ...savedRun("paused", 5), pageSelection, pageBatch: selectedBatch };
      return route.fulfill({ json: { data: state } });
    }
    if (url.pathname.endsWith("/resume") && state) {
      expect(body).toEqual({ expectedRevision: 5 });
      state = { ...savedRun("queued", 6), pageBatch: selectedBatch };
      return route.fulfill({ json: { data: state } });
    }
    return route.fulfill({ status: 404, json: { error: { code: "not_found", message: "Fixture route is not configured." } } });
  });

  await page.goto("/experiments/booklet-runs");
  await expect(page.getByText("No runs yet.")).toBeVisible();
  await page.getByLabel("Persona").selectOption("professional_creator");
  await page.getByRole("button", { name: "Start selected" }).click();
  await expect(page.getByRole("heading", { name: "Professional creator" })).toBeVisible();
  expect(requests.find((request) => request.pathname === "/api/experiments/booklet-runs" && request.method === "POST")?.body)
    .toEqual({ persona: "professional_creator", mode: "simulated" });
  await expect(page.getByText("Next: J13")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open saved booklet" })).toHaveAttribute("href", `/experiments/booklet-runs/${runId}`);
  await expect(page.getByRole("link", { name: "Open original observatory friends image" })).toHaveAttribute("href", `/api/assets/${assetId}`);
  await page.getByText(/Tester feedback/).click();
  await expect(page.getByText("The creator-facing flow is clear; no quality score is claimed.", { exact: true })).toBeVisible();
  await expect(page.getByText("composition: Fixture warning remains advisory.", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
  await page.getByRole("checkbox", { name: "Page 3" }).check();
  await page.getByRole("checkbox", { name: "Page 1" }).check();
  await page.getByRole("button", { name: "Save page order" }).click();
  await expect(page.getByText("Saved page batch (2 pages)", { exact: true })).toBeVisible();
  expect(requests.filter((request) => request.method === "POST").map((request) => request.pathname)).toEqual([
    "/api/experiments/booklet-runs", `/api/experiments/booklet-runs/${runId}/pause`, `/api/experiments/booklet-runs/${runId}/pages`,
  ]);
  await page.reload();
  const savedBatch = page.locator("details").filter({ hasText: "Saved page batch (2 pages)" });
  await savedBatch.locator("summary").click();
  await expect(savedBatch.locator("li")).toHaveText([pageThreeId, pageOneId]);
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();

  const savedBookletLink = page.getByRole("link", { name: "Open saved booklet" });
  await savedBookletLink.evaluate((link) => link.setAttribute("target", "_blank"));
  const [savedBooklet] = await Promise.all([page.waitForEvent("popup"), savedBookletLink.click()]);
  await expect(savedBooklet.getByText(`Booklet ${bookletId}`, { exact: true })).toBeVisible();
  await expect(savedBooklet.getByRole("link", { name: "Back to all runs" })).toBeVisible();
  await expect(savedBooklet.getByRole("img", { name: "Cover image" })).toBeVisible();
  await expect(savedBooklet.getByRole("img", { name: "Page 1 image" })).toBeVisible();
  await expect(savedBooklet.getByRole("link", { name: "Open original cover image" })).toHaveAttribute("href", `/api/assets/${coverAssetId}`);
  await expect(savedBooklet.getByRole("link", { name: "Open original page 1 image" })).toHaveAttribute("href", `/api/assets/${pageAssetId}`);
  await savedBooklet.close();

  const [originalImage] = await Promise.all([
    page.waitForEvent("popup"),
    page.getByRole("link", { name: "Open original observatory friends image" }).click(),
  ]);
  await originalImage.waitForFunction(() => document.images.length === 1 && document.images[0]?.naturalWidth > 0);
  await originalImage.close();

  expect(external).toEqual([]);
  expect(requests.filter((request) => request.method === "POST").map((request) => request.pathname)).toEqual([
    "/api/experiments/booklet-runs", `/api/experiments/booklet-runs/${runId}/pause`, `/api/experiments/booklet-runs/${runId}/pages`, `/api/experiments/booklet-runs/${runId}/resume`,
  ]);
});
