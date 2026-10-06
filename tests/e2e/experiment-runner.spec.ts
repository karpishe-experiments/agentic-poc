import { expect, test } from "@playwright/test";

const runId = "00000000-0000-4000-8000-000000000701";
const bookletId = "00000000-0000-4000-8000-000000000702";
const assetId = "00000000-0000-4000-8000-000000000703";

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
      versions: [{ id: "00000000-0000-4000-8000-000000000708", number: 1, approval: { origin: "explicit" }, dependencyVersionIds: [], warnings: [],
        content: { title: "Observatory friends", build: { assetId } } }] }],
  };
}

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAF/gJ+Yk7I3QAAAABJRU5ErkJggg==", "base64");

test.skip(process.env.E2E_PROFILE !== "experiment-runner", "The runner fixture requires the isolated experiment-runner profile.");

test("runs the isolated simulated runner UI fixture without backend, provider, or Dify traffic", async ({ page }) => {
  let state: ReturnType<typeof savedRun> | null = null;
  const requests: Array<{ pathname: string; method: string; body: unknown }> = [];
  const external: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") external.push(url.origin);
  });
  await page.route("**/api/assets/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: png }));
  await page.route("**/api/experiments/booklet-runs**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const rawBody = request.postData();
    const body = rawBody ? request.postDataJSON() as unknown : null;
    requests.push({ pathname: url.pathname, method: request.method(), body });
    if (request.method() === "GET") return route.fulfill({ json: { data: state ? [state] : [] } });
    if (request.method() !== "POST") return route.fulfill({ status: 405, json: { error: { code: "method_not_allowed", message: "Fixture accepts GET and POST only." } } });
    if (url.pathname === "/api/experiments/booklet-runs") {
      state = savedRun("queued", 3);
      return route.fulfill({ json: { data: state } });
    }
    if (url.pathname.endsWith("/pause") && state) {
      expect(body).toEqual({ expectedRevision: 3 });
      state = savedRun("paused", 4);
      return route.fulfill({ json: { data: state } });
    }
    if (url.pathname.endsWith("/resume") && state) {
      expect(body).toEqual({ expectedRevision: 4 });
      state = savedRun("queued", 5);
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
  await expect(page.getByRole("link", { name: "Open saved booklet" })).toHaveAttribute("href", `/booklets/${bookletId}`);
  await expect(page.getByRole("link", { name: "Open original observatory friends image" })).toHaveAttribute("href", `/api/assets/${assetId}`);
  await page.getByText(/Tester feedback/).click();
  await expect(page.getByText("The creator-facing flow is clear; no quality score is claimed.", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Professional creator" })).toBeVisible();
  expect(external).toEqual([]);
  expect(requests.filter((request) => request.method === "POST").map((request) => request.pathname)).toEqual([
    "/api/experiments/booklet-runs", `/api/experiments/booklet-runs/${runId}/pause`, `/api/experiments/booklet-runs/${runId}/resume`,
  ]);
});
