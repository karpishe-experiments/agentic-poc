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

function savedRun(status: "queued" | "paused" | "completed", revision: number) {
  return {
    runId, bookletId, workingTitle: "Observatory friends", createdAtMs: 1792656000000, updatedAtMs: 1792656300000, terminalAtMs: status === "completed" ? 1792656600000 : null, persona: "professional_creator", mode: "simulated", brief: "Two friends repair their community observatory.",
    status, revision, safeFailure: null, preparation: null, pauseRequested: status === "paused", activeOperationId: null, nextNarrativeTask: "J13", pendingDecision: null,
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

test("reviews a parked unknown image, its diagnostics and one approved replacement", async ({ page }) => {
  const operationId = "00000000-0000-4000-8000-000000000790";
  const totals = { maxMicrodollars: 5_000_000, textCalls: 120, imageCalls: 12, steps: 300,
    textRevisions: 1, imageRevisions: 1, noProgress: 3 };
  let completed = false;
  const writes: unknown[] = [], external: string[] = [];
  page.context().on("request", request => { const url = new URL(request.url());
    if (!["127.0.0.1", "localhost"].includes(url.hostname)) external.push(url.origin); });
  await page.context().route("**/api/assets/**", route => route.fulfill({ status: 200, contentType: "image/png", body: png }));
  await page.context().route("**/api/experiments/booklet-runs**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (request.method() === "POST") {
      writes.push(request.postDataJSON()); completed = true;
      return route.fulfill({ json: { data: { approvalId: "fixture", replacementOperationId: "replacement", reused: false } } });
    }
    if (path.endsWith("/diagnostics")) return route.fulfill({ json: { data: { page: 0, hasMore: false,
      operations: [{ operationId, errors: [{ message: "Provider timeout <script>not executed</script>", requestId: "req_fixture", truncated: false }] }] } } });
    if (path.endsWith("/image-replacement")) return route.fulfill({ json: { data: { runId, operationId, expectedRevision: 10,
      expectedCampaignRevision: 2, previewDigest: "a".repeat(64), expiresAtMs: Date.now() + 300_000,
      terminalStatus: "failed", target: { taskId: "J13", subjectId: "page3" }, totals,
      settledMicrodollars: 500_000, reservedMicrodollars: 4_500_000, retainedLiabilityMicrodollars: 4_500_000 } } });
    const state = { ...savedRun(completed ? "completed" : "paused", 10), mode: "real", status: completed ? "completed" : "blocked",
      safeFailure: completed ? null : "unknown_outcome", activeOperationId: null,
      imageReplacementParking: { operationId },
      executionAllowance: { campaignId: "campaign", revision: 2, totals, settledMicrodollars: 500_000,
        reservedMicrodollars: 4_500_000, textRequests: 43, imageRequests: 9, latestApprovalReference: "fixture" },
      imageReplacementApprovals: completed ? [{ approvalId: "fixture", operationId, replacementOperationId: "replacement", reference: "fixture" }] : [],
      operationHistory: [{ id: operationId, role: "image", taskId: "J13", state: "unknown", createdAtMs: 1, updatedAtMs: 2 }] };
    return route.fulfill({ json: { data: path.endsWith(runId) ? state : { runs: [state], hasMore: false } } });
  });
  await page.goto(`/experiments/booklet-runs/${runId}`);
  await page.getByText("Technical details and external call errors").click();
  await expect(page.locator("pre").filter({ hasText: "req_fixture" })).toBeVisible();
  await page.getByText("Inspect original and prepare review").click();
  const review = page.getByRole("region", { name: "Image replacement review" });
  await expect(review.getByText(/Original unknown liability/)).toBeVisible();
  await page.screenshot({ path: "output/playwright/m5-replacement-review.png", fullPage: true });
  await review.getByLabel("New total USD allowance").fill("6");
  await review.getByLabel("Operator approval reference").fill("Fixture only: USD 6 total plus one replacement");
  await review.getByRole("checkbox").check();
  await review.getByText("Approve exact allowance and one replacement").click();
  await expect(page.getByText(/Completed with an approved replacement/)).toBeVisible();
  await page.screenshot({ path: "output/playwright/m5-replacement-completed.png", fullPage: true });
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({ action: "image_replacement", operationId, acknowledgeUnknownCharge: true,
    totals: { ...totals, maxMicrodollars: 6_000_000 } });
  expect(external).toEqual([]);
});

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
    if (request.method() === "GET") return route.fulfill({ json: { data: url.pathname.endsWith(runId) ? state : { runs: state ? [state] : [], hasMore: false } } });
    if (request.method() !== "POST") return route.fulfill({ status: 405, json: { error: { code: "method_not_allowed", message: "Fixture accepts GET and POST only." } } });
    if (url.pathname === "/api/experiments/booklet-runs") {
      state = savedRun("queued", 3);
      return route.fulfill({ json: { data: state } });
    }
    if (url.pathname.endsWith("/pause") && state) {
      expect(body).toEqual({ expectedRevision: 3, responseMode: "receipt" });
      state = { ...savedRun("paused", 4), pageSelection };
      return route.fulfill({ json: { data: state } });
    }
    if (url.pathname.endsWith("/pages") && state) {
      expect(body).toEqual({ expectedRevision: 4, batch: selectedBatch });
      state = { ...savedRun("paused", 5), pageSelection, pageBatch: selectedBatch };
      return route.fulfill({ json: { data: state } });
    }
    if (url.pathname.endsWith("/resume") && state) {
      expect(body).toEqual({ expectedRevision: 5, responseMode: "receipt" });
      state = { ...savedRun("queued", 6), pageBatch: selectedBatch };
      return route.fulfill({ json: { data: state } });
    }
    return route.fulfill({ status: 404, json: { error: { code: "not_found", message: "Fixture route is not configured." } } });
  });

  await page.goto("/experiments/booklet-runs");
  await expect(page.getByText("No runs yet.")).toBeVisible();
  await page.getByLabel("Persona").selectOption("professional_creator");
  await page.getByRole("button", { name: "Start selected" }).click();
  await expect(page.getByRole("heading", { name: "Observatory friends" })).toBeVisible();
  expect(requests.find((request) => request.pathname === "/api/experiments/booklet-runs" && request.method === "POST")?.body)
    .toEqual({ persona: "professional_creator", mode: "simulated" });
  await expect(page.getByText("Current task: J13")).toBeVisible();
  await expect(page.getByText("Simulated image calls", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: /^Open run:/ }).click();
  await expect(page.getByRole("link", { name: "Back to all runs" })).toBeVisible({ timeout: 30000 });
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

  await page.getByText("Run identifiers", { exact: true }).click();
  await expect(page.getByText(`Booklet ${bookletId}`, { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "Cover image" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Page 1 image" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open original cover image" })).toHaveAttribute("href", `/api/assets/${coverAssetId}`);
  await expect(page.getByRole("link", { name: "Open original page 1 image" })).toHaveAttribute("href", `/api/assets/${pageAssetId}`);

  const [originalImage] = await Promise.all([
    page.waitForEvent("popup"),
    page.getByRole("link", { name: "Open original observatory friends image" }).click(),
  ]);
  await originalImage.waitForFunction(() => document.images.length === 1 && document.images[0]?.naturalWidth > 0);
  await originalImage.close();

  state = { ...savedRun("completed", 7), generationStatus: "complete", evaluationStatus: "complete" };
  await page.reload();
  await expect(page.getByText("0h 10m 0s")).toBeVisible();
  await expect(page.getByRole("button", { name: "Pause" })).toBeDisabled();
  await page.screenshot({ path: "output/playwright/package-b-completed.png", fullPage: true });

  expect(external).toEqual([]);
  expect(requests.filter((request) => request.method === "POST").map((request) => request.pathname)).toEqual([
    "/api/experiments/booklet-runs", `/api/experiments/booklet-runs/${runId}/pause`, `/api/experiments/booklet-runs/${runId}/pages`, `/api/experiments/booklet-runs/${runId}/resume`,
  ]);
});

test("reviews an allowance pause and continues the same saved run without a new run request", async ({ page }) => {
  const totals = { maxMicrodollars: 1_000_000, textCalls: 220, imageCalls: 20, steps: 300,
    textRevisions: 3, imageRevisions: 2, noProgress: 3 };
  const pending = { kind: "allowance_v1", reason: "monetary", requestDigest: "d".repeat(64),
    requestedAtMs: 1792656300000, requiredTotal: 1_100_000,
    nextAction: { role: "specialist", providerKind: "text", taskId: "J12" } };
  const allowance = { campaignId: "00000000-0000-4000-8000-000000000730", revision: 8, totals,
    settledMicrodollars: 700_000, reservedMicrodollars: 200_000, textRequests: 18, imageRequests: 4,
    latestApprovalReference: "Initial operator grant" };
  let state = { ...savedRun("paused", 9), mode: "balanced", pendingApproval: pending as typeof pending | null,
    nextNarrativeTask: "J12", counters: { logicalText: 18, logicalImage: 4, payableText: 18, payableImage: 0, steps: 22 },
    executionAllowance: allowance,
    runAccounting: { settledMicrodollars: 700_000, reservedMicrodollars: 200_000,
      estimatedTotalMicrodollars: 900_000, invoiceCostAvailable: false } };
  const writes: Array<{ path: string; key: string | undefined; body: unknown }> = [];
  const external: string[] = [];
  page.context().on("request", request => {
    const url = new URL(request.url());
    if (!["127.0.0.1", "localhost"].includes(url.hostname)) external.push(url.origin);
  });
  await page.context().route("**/api/assets/**", route => route.fulfill({ status: 200, contentType: "image/png", body: png }));
  await page.context().route("**/api/experiments/booklet-runs**", async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "GET") return route.fulfill({ json: { data: path.endsWith(runId)
      ? state : { runs: [state], hasMore: false } } });
    writes.push({ path, key: request.headers()["idempotency-key"], body: request.postDataJSON() });
    if (path !== `/api/experiments/booklet-runs/${runId}/approval`) {
      return route.fulfill({ status: 409, json: { error: { message: "Only this pending approval is permitted." } } });
    }
    state = { ...state, status: "queued", revision: 10, pauseRequested: false, pendingApproval: null,
      executionAllowance: { ...allowance, revision: 9, totals: { ...totals, maxMicrodollars: 2_000_000 } } };
    return route.fulfill({ json: { data: { runId, approvalId: request.headers()["idempotency-key"],
      runRevision: 10, campaignRevision: 9, totals: state.executionAllowance.totals, reused: false } } });
  });

  await page.goto(`/experiments/booklet-runs/${runId}`);
  const review = page.getByRole("region", { name: "Operator allowance review" });
  await expect(review).toBeVisible();
  await expect(page.getByRole("button", { name: "Resume", exact: true })).toHaveCount(0);
  await expect(review.getByText(/Minimum funded total: \$1\.100000/)).toBeVisible();
  await review.getByLabel(/Maximum USD/).fill("2.000000");
  await review.getByLabel("Approval or decline reference").fill("Operator browser fixture: exact USD 2 total");
  await page.screenshot({ path: "output/playwright/package-c-approval-pause.png", fullPage: true });
  await review.getByRole("button", { name: "Approve exact totals" }).click();
  await expect(review).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({ path: `/api/experiments/booklet-runs/${runId}/approval`,
    body: { action: "approve", expectedRevision: 9, expectedCampaignRevision: 8,
      expectedPendingDigest: pending.requestDigest, totals: { ...totals, maxMicrodollars: 2_000_000 },
      reference: "Operator browser fixture: exact USD 2 total" } });
  expect(writes[0].key).toMatch(/^[0-9a-f-]{36}$/);
  expect(external).toEqual([]);
});
