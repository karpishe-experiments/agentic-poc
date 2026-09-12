import { expect, test, type Page } from "@playwright/test";

async function runVersionAction(page: Page, name: RegExp) {
  await page.getByRole("button", { name: "Version actions" }).click();
  await page.getByRole("menuitem", { name }).click();
}
test.beforeEach(async ({ page }) => {
  await page.goto("/mockups/specialty-management?view=agent&specialty=sp-story&agent=agent-playful&version=playful-v2&tab=edit&section=instructions");
  await page.evaluate(() =>
    localStorage.removeItem("specialty-management-mockup:v2"),
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
  await page.goto("/mockups/specialty-management?view=directory");
  await expect(
    page.getByRole("heading", { name: "Agent Studio" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Specialties and agents" }),
  ).toBeVisible();
  expect(forbidden).toEqual([]);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("specialty-management-mockup:v2"),
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
  await page.getByRole("button", { name: "Filter specialties" }).click();
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
test("creates and activates an image agent with a persisted reference", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Expand Illustration" }).click();
  const illustration = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("button", { name: /Illustration image/ }) })
    .first();
  await illustration.getByRole("button", { name: "Add agent" }).click();
  await expect(page.getByRole("group", { name: /Image model/ })).toBeVisible();
  await page.getByLabel("Title").fill("Dream Painter");
  await page.getByRole("button", { name: "Add reference" }).click();
  await page.getByLabel("Reference content").fill("Keep the moon bright.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Dream Painter" }),
  ).toBeVisible();
  await expect(page.getByLabel("Reference content")).toHaveValue(
    "Keep the moon bright.",
  );
  await page.getByRole("button", { name: "Configuration" }).click();
  await runVersionAction(page, /^Confirm/);
  await runVersionAction(page, /^Activate/);
  await expect(page.getByText(/confirmed · Active/)).toBeVisible();
  await runVersionAction(page, /^Deactivate/);
  await runVersionAction(page, /^Retire/);
  await expect(page.getByText(/Version 1 · retired/)).toBeVisible();
});
test("text agents omit image controls and draft deletion selects the active version", async ({
  page,
}) => {
  await expect(page.getByRole("group", { name: /Image model/ })).toHaveCount(0);
  page.once("dialog", (dialog) => dialog.accept());
  await runVersionAction(page, /^Delete draft/);
  await expect(page.locator(".header-actions select")).toHaveValue("playful-v1");
  await expect(page.getByText(/Version 1 · confirmed · Active/)).toBeVisible();
});
test("forks visible pending agent content without changing its source", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Main instructions" }).click();
  await page.getByLabel("Main instructions").fill("Pending source content");
  await runVersionAction(page, /^Fork draft/);
  await expect(page.getByLabel("Main instructions")).toHaveValue(
    "Pending source content",
  );
  await expect(page.locator(".header-actions select")).toContainText("v3 · draft");
  await page.locator(".header-actions select").selectOption("playful-v2");
  await page.getByRole("button", { name: "Main instructions" }).click();
  await expect(page.getByLabel("Main instructions")).toHaveValue(
    "Pending source content",
  );
});
test("edits Markdown with keyboard and toolbar mention menus", async ({
  page,
}) => {
  const editor = page.getByLabel("Main instructions");
  await editor.fill("Use @sto");
  await page.keyboard.press("Enter");
  await expect(editor).toHaveValue(/\[@Story Planning\]\(specialty:sp-story\)/);
  await page.getByRole("button", { name: "Mention tool" }).click();
  await page.getByRole("option", { name: /get_artifact_context/ }).click();
  await page.getByRole("button", { name: "Mention reference" }).click();
  await page.getByRole("option", { name: /rhyming-guide\.md/ }).click();
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(
    page.getByRole("button", { name: "@Story Planning" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "/get_artifact_context" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "/get_artifact_context" }).click();
  await expect(page.getByText("Read artifact context.")).toBeVisible();
  await page.getByRole("button", { name: "$rhyming-guide.md" }).click();
  await expect(page.getByText("Prefer natural rhythm.")).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("Reference content")).toBeVisible();
  await page.getByRole("button", { name: "Preview" }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Preview" })).toHaveClass(
    /active/,
  );
});
test("navigates specialty mentions and disables deleted references", async ({
  page,
}) => {
  const editor = page.getByLabel("Main instructions");
  await editor.fill(
    "See [@Story Planning](specialty:sp-story) and [$guide](reference:ref-rhyme-v2).",
  );
  await page.getByRole("button", { name: "Preview" }).click();
  await page.getByRole("button", { name: "$guide" }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Remove reference" }).click();
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(
    page.getByRole("button", { name: "Unavailable reference" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "@Story Planning" }).click();
  await expect(
    page.getByRole("heading", { name: "Story Planning", exact: true }),
  ).toBeVisible();
});
test("renders only the bundled Markdown image without external requests", async ({
  page,
}) => {
  const externalImages: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("example.com/remote.png"))
      externalImages.push(request.url());
  });
  await page
    .getByLabel("Main instructions")
    .fill(
      "![Local](/mockups/specialty-management/sample-image.svg)\n\n![Remote](https://example.com/remote.png)\n\n[Unsafe](javascript:alert(1))",
    );
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByRole("img", { name: "Local" })).toBeVisible();
  await expect(page.getByText("Image placeholder: Remote")).toBeVisible();
  expect(externalImages).toEqual([]);
  await expect(page.getByRole("link", { name: "Unsafe" })).not.toHaveAttribute(
    "href",
    /javascript:/,
  );
});
async function requestEditingAssistant(page: import("@playwright/test").Page, request: string) {
  const composer = page.getByLabel("Message the editing assistant");
  await composer.fill(request);
  await composer.press("Enter");
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
}

async function waitForAssistantTurn(page: import("@playwright/test").Page, text: RegExp) {
  await expect(page.getByText(text).last()).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop" })).toHaveCount(0);
}

test("streams answers, clarification, and read-only instruction proposals from the Editing assistant", async ({
  page,
}) => {
  const forbidden: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/") || url.hostname !== "127.0.0.1") forbidden.push(request.url());
  });
  await expect(page.getByRole("heading", { name: "Editing assistant" })).toBeVisible();
  await requestEditingAssistant(page, "What can you change here?");
  await page.screenshot({ path: "output/playwright/specialty-management-mockup/chat-streaming.png" });
  await waitForAssistantTurn(page, /deterministic simulation/);
  await expect(page.getByRole("button", { name: "Copy assistant response" }).last()).toBeVisible();

  await requestEditingAssistant(page, "Improve this");
  await waitForAssistantTurn(page, /Which change should I prepare/);
  await page.screenshot({ path: "output/playwright/specialty-management-mockup/chat-clarification.png" });
  await expect(page.getByText("Choose the kind of edit you want for this section.")).toBeVisible();
  await page.getByRole("button", { name: "rhyming-guide.md" }).click();
  await page.getByLabel("Message the editing assistant").fill("A free-text clarification answer");
  await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();
  await expect(page.getByText(/to answer the pending clarification/)).toBeVisible();
  await page.getByRole("button", { name: "Open clarification target" }).click();
  await expect(page.getByLabel("Message the editing assistant")).toHaveValue("A free-text clarification answer");
  await page.getByRole("button", { name: "Make it concise" }).last().click();
  await waitForAssistantTurn(page, /I prepared a simulated proposal/);
  await page.screenshot({ path: "output/playwright/specialty-management-mockup/chat-text-proposal.png" });
  const proposal = page.getByRole("region", { name: "Edit proposal" }).last();
  await expect(proposal.getByText("Main Instructions", { exact: true })).toBeVisible();
  await expect(proposal.locator("textarea")).toHaveCount(0);
  expect(forbidden).toEqual([]);
});

test("restores URL navigation and recovers invalid targets in the directory", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Directory" }).click();
  await page.getByRole("button", { name: /Playful Writer/ }).click();
  await page.getByRole("button", { name: "Configuration" }).click();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Playful Writer" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Configuration" })).toHaveAttribute("aria-current", "page");
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Specialties and agents" })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("heading", { name: "Playful Writer" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Configuration" })).toHaveAttribute("aria-current", "page");
  await page.goto("/mockups/specialty-management?view=agent&specialty=missing&agent=missing&version=missing");
  await expect(page.getByText(/target is unavailable/)).toBeVisible();
});

test("proposes editable specialty, configuration, instruction, and reference fields", async ({
  page,
}) => {
  await requestEditingAssistant(page, "Add an example");
  await waitForAssistantTurn(page, /I prepared a simulated proposal/);
  await expect(page.getByRole("region", { name: "Edit proposal" }).last().getByText("Main Instructions", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Configuration" }).click();
  await requestEditingAssistant(page, "Change the title to Bright Writer");
  await waitForAssistantTurn(page, /I prepared a simulated proposal/);
  await expect(page.getByRole("region", { name: "Edit proposal" }).last().getByText("Title", { exact: true })).toBeVisible();
  await page.screenshot({ path: "output/playwright/specialty-management-mockup/chat-field-proposal.png" });

  await page.getByRole("button", { name: "rhyming-guide.md" }).click();
  await requestEditingAssistant(page, "Add an example");
  await waitForAssistantTurn(page, /I prepared a simulated proposal/);
  await expect(page.getByRole("region", { name: "Edit proposal" }).last().getByText("Content", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Story Planning text" }).click();
  await requestEditingAssistant(page, "Update the description");
  await waitForAssistantTurn(page, /I prepared a simulated proposal/);
  await expect(page.getByRole("region", { name: "Edit proposal" }).last().getByText("Description", { exact: true })).toBeVisible();
});
test("Add reference on a confirmed version creates a draft and opens the reference", async ({
  page,
}) => {
  await page.locator(".header-actions select").selectOption("playful-v1");
  await page.getByRole("button", { name: "Add reference" }).click();
  await expect(page.locator(".header-actions select")).toContainText("v3 · draft");
  await expect(page.getByLabel("Name")).toHaveValue("reference-1.md");
  await expect(page.getByLabel("Reference content")).toBeVisible();
  await expect(page.getByText(/Version 3 · draft/)).toBeVisible();
});
test("keeps target-aware proposals safe across selection changes and manual edits", async ({
  page,
}) => {
  await requestEditingAssistant(page, "Add an example");
  await waitForAssistantTurn(page, /I prepared a simulated proposal/);
  await page.getByRole("button", { name: "rhyming-guide.md" }).click();
  const proposal = page.getByRole("region", { name: "Edit proposal" }).last();
  await expect(proposal.getByRole("button", { name: "Open target" })).toBeVisible();
  await proposal.getByRole("button", { name: "Open target" }).click();
  await page.getByLabel("Main instructions").fill("A later manual edit");
  await expect(page.getByText("The selected section changed. Request a fresh proposal.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Apply", exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.getByText("A later manual edit")).toBeVisible();
  await expect(page.getByRole("button", { name: "Apply", exact: true })).toBeDisabled();
});

test("natural revisions supersede only the prior proposal for the captured target", async ({
  page,
}) => {
  await requestEditingAssistant(page, "Make this concise");
  await waitForAssistantTurn(page, /I prepared a simulated proposal/);
  await requestEditingAssistant(page, "Make it shorter");
  await waitForAssistantTurn(page, /I prepared a simulated proposal/);
  await expect(page.getByRole("region", { name: "Edit proposal" })).toHaveCount(2);
  await expect(page.getByText(/superseded/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Apply", exact: true }).last()).toBeEnabled();
});

test("Stop and refresh leave recoverable responses without incomplete proposals", async ({
  page,
}) => {
  await requestEditingAssistant(page, "Add an example");
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByText("The simulated response was stopped before it created a proposal.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" }).last()).toBeVisible();
  await expect(page.getByRole("region", { name: "Edit proposal" })).toHaveCount(0);
  await page.getByLabel("Main instructions").fill("Changed after the stopped request");
  await expect(page.getByRole("button", { name: "Retry" }).last()).toBeDisabled();
  await expect(page.getByText("The captured section changed. Edit the request and send it again.").last()).toBeVisible();

  await requestEditingAssistant(page, "Add an example");
  await page.reload();
  await expect(page.getByText("The simulated response was interrupted during refresh.")).toBeVisible();
  await page.getByRole("button", { name: "Retry" }).last().click();
  await waitForAssistantTurn(page, /I prepared a simulated proposal/);
});

test("seeded diagnostics reveal context and retry or prepare an editable request", async ({
  page,
}) => {
  await expect(page.getByText("A synthetic example failed before creating a proposal.")).toBeVisible();
  await page.getByRole("button", { name: "Show error details" }).click();
  await page.screenshot({ path: "output/playwright/specialty-management-mockup/chat-error-details.png" });
  await expect(page.getByText("Synthetic simulator", { exact: true })).toBeVisible();
  await expect(page.getByText("Captured section")).toBeVisible();
  await expect(page.getByText("Started")).toBeVisible();
  await expect(page.getByText("Selected models (context only)")).toBeVisible();
  await page.getByLabel("Message the editing assistant").fill("Keep this draft");
  await page.getByRole("button", { name: "Edit request" }).click();
  await expect(page.getByLabel("Message the editing assistant")).toHaveValue(/Keep this draft[\s\S]*Make the selected instructions more concise/);
  await page.getByRole("button", { name: "Retry" }).click();
  await waitForAssistantTurn(page, /I prepared a simulated proposal/);
});

test("reset cancels a running response and restores the seeded failure fixture", async ({
  page,
}) => {
  await requestEditingAssistant(page, "Add an example");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Reset demo data" }).click();
  await page.getByRole("button", { name: /Playful Writer/ }).click();
  await expect(page.getByText("A synthetic example failed before creating a proposal.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop" })).toHaveCount(0);
});

test("marks a proposal unavailable when its reference is deleted during or after a request", async ({
  page,
}) => {
  await page.getByRole("button", { name: "rhyming-guide.md" }).click();
  await requestEditingAssistant(page, "Add an example");
  await waitForAssistantTurn(page, /I prepared a simulated proposal/);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Remove reference" }).click();
  await expect(page.getByText("Target unavailable.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Apply", exact: true })).toBeDisabled();
});

test("chat application creates a draft from a confirmed version without changing active", async ({
  page,
}) => {
  await page.locator(".header-actions select").selectOption("playful-v1");
  await page.getByRole("button", { name: "Main instructions" }).click();
  await requestEditingAssistant(page, "Use a numbered checklist");
  await waitForAssistantTurn(page, /I prepared a simulated proposal/);
  await page.getByRole("button", { name: "Create draft with changes" }).click();
  await expect(page.locator(".header-actions select")).toContainText("v3 · draft");
  await expect(page.getByText(/Version 3 · draft/)).toBeVisible();
  await page.locator(".header-actions select").selectOption("playful-v1");
  await expect(page.getByText(/Version 1 · confirmed · Active/)).toBeVisible();
});

async function startAgentTest(page: import("@playwright/test").Page, request = "Produce a sample result") {
  await page.getByRole("button", { name: "Test", exact: true }).click();
  await expect(page.getByRole("region", { name: "Test setup" })).toBeVisible();
  await page.getByLabel("Opening test request").fill(request);
  await page.getByRole("button", { name: "Start test" }).click();
  await expect(page.getByRole("region", { name: "Test session" })).toBeVisible();
  await expect(page.getByText(/Prepared a deterministic text result|Prepared a bundled sample image result|Selected Story Planning|Selected Illustration/).last()).toBeVisible();
}

test("tests an agent against a frozen booklet stage, activity, feedback, and persisted history", async ({ page }) => {
  await page.getByRole("button", { name: "Test", exact: true }).click();
  await page.getByLabel("Test booklet").selectOption("demo-forest");
  await expect(page.getByLabel("Test stage")).toHaveValue("story_plan");
  await expect(page.getByText(/Audience profile → Story plan/)).toBeVisible();
  await expect(page.getByText("Available artifacts")).toBeVisible();
  await page.getByLabel("Opening test request").fill("Produce a sample result");
  await page.getByRole("button", { name: "Start test" }).click();
  await expect(page.getByText("Prepared a deterministic text result from the frozen snapshot.")).toBeVisible();
  await page.getByText(/Simulated activity/).click();
  await expect(page.getByText("Read frozen stage context")).toBeVisible();
  await page.getByRole("button", { name: "Useful" }).click();
  await page.getByLabel("Feedback note").fill("Keep this structure.");
  await page.reload();
  await expect(page.getByLabel("Feedback note")).toHaveValue("Keep this structure.");
  await page.getByRole("button", { name: "Test history" }).click();
  await expect(page.getByRole("heading", { name: "Test history" })).toBeVisible();
  await page.getByRole("navigation", { name: "Test sessions" }).getByRole("button").first().click();
  await expect(page.getByText("Frozen v2")).toBeVisible();
  await page.getByLabel("Filter test history by booklet").selectOption("demo-moon");
  await expect(page.getByText("No test sessions match these filters.")).toBeVisible();
});

test("returns image and orchestrator fixtures with frozen activity", async ({ page }) => {
  await page.getByRole("button", { name: "Expand Illustration" }).click();
  await page.getByRole("button", { name: /Watercolor Illustrator/ }).click();
  await startAgentTest(page);
  await expect(page.getByRole("img", { name: /A warm scene/ })).toBeVisible();
  await page.getByText("Image metadata").click();
  await expect(page.getByText("Warm watercolor")).toBeVisible();

  await page.getByRole("button", { name: "Expand Orchestrator" }).click();
  await page.getByRole("button", { name: /Booklet Guide/ }).click();
  await startAgentTest(page);
  await expect(page.getByText("Specialty selected")).toBeVisible();
  await expect(page.getByText(/Story Planning matches this frozen stage/)).toBeVisible();
});

test("expanded test activity shows frozen context, references, and allowed tools", async ({ page }) => {
  await page.getByRole("button", { name: "Expand Illustration" }).click();
  await page.getByRole("button", { name: /Watercolor Illustrator/ }).click();
  await startAgentTest(page);
  const activity = page.getByText(/Simulated activity/);
  await activity.click();
  for (const label of ["Read frozen stage context", "Read composition.md", "Simulated get_artifact_context", "Simulated generate_image"]) {
    await page.getByText(label, { exact: true }).click();
  }
  await expect(page.getByText("Bundled sample illustration selected.")).toBeVisible();
  await expect(page.getByText("Frozen context read.")).toBeVisible();
});

test("stops and retries a test, repeats it explicitly, and preserves the editing composer during handoff", async ({ page }) => {
  const instructions = await page.getByLabel("Main instructions").inputValue();
  await page.getByRole("button", { name: "Test", exact: true }).click();
  await page.getByLabel("Opening test request").fill("Produce a sample result");
  await page.getByRole("button", { name: "Start test" }).click();
  await page.getByRole("button", { name: "Stop test response" }).click();
  await expect(page.getByText("The simulated test response was stopped.")).toBeVisible();
  await page.getByRole("button", { name: "Retry turn" }).click();
  await expect(page.getByText("Prepared a deterministic text result from the frozen snapshot.")).toBeVisible();
  await page.getByRole("button", { name: "Repeat test with current edits" }).click();
  await expect(page.getByText(/Repeat setup is ready/)).toBeVisible();
  await expect(page.getByLabel("Test booklet")).toBeDisabled();
  await page.getByRole("button", { name: "Start test" }).click();
  await expect(page.getByText("Repeated test")).toBeVisible();
  await page.getByLabel("Message the editing assistant").fill("Existing editing draft");
  await page.getByRole("button", { name: "Send to editing chat" }).last().click();
  await expect(page.getByLabel("Message the editing assistant")).toHaveValue(/Existing editing draft[\s\S]*Test feedback for/);
  await expect(page.getByRole("button", { name: "Stop" })).toHaveCount(0);
  await expect(page.getByLabel("Main instructions")).toHaveValue(instructions);
});

test("repeat captures an intervening unsaved edit without changing the original frozen session", async ({ page }) => {
  await startAgentTest(page);
  await page.getByRole("button", { name: "Main instructions" }).click();
  await page.getByLabel("Main instructions").fill("Unsaved revision for the repeat.");
  await page.getByRole("button", { name: "Test", exact: true }).click();
  await page.getByRole("button", { name: "Repeat test with current edits" }).click();
  await page.getByRole("button", { name: "Start test" }).click();
  await expect(page.getByText("Repeated test")).toBeVisible();
  const snapshots = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("specialty-management-mockup:v2")!);
    return state.testSessions.map((session: { sourceSessionId: string | null; agentSnapshot: { mainInstructions: string } }) => ({
      sourceSessionId: session.sourceSessionId,
      mainInstructions: session.agentSnapshot.mainInstructions,
    }));
  });
  expect(snapshots[0]).toMatchObject({ sourceSessionId: expect.any(String), mainInstructions: "Unsaved revision for the repeat." });
  expect(snapshots[1]).toMatchObject({ sourceSessionId: null });
  expect(snapshots[1].mainInstructions).not.toBe("Unsaved revision for the repeat.");
});

test("recovers an interrupted test and retains an orphaned frozen session without service calls", async ({ page }) => {
  const forbidden: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/") || url.hostname !== "127.0.0.1") forbidden.push(request.url());
  });
  await page.getByRole("button", { name: "Test", exact: true }).click();
  await page.getByLabel("Opening test request").fill("Produce a sample result");
  await page.getByRole("button", { name: "Start test" }).click();
  await page.reload();
  await expect(page.getByText("The simulated test response was interrupted during refresh.")).toBeVisible();
  await page.getByRole("button", { name: "Retry turn" }).click();
  await expect(page.getByText("Prepared a deterministic text result from the frozen snapshot.")).toBeVisible();
  await page.evaluate(() => {
    const key = "specialty-management-mockup:v2";
    const state = JSON.parse(localStorage.getItem(key)!);
    state.agents = state.agents.filter((agent: { id: string }) => agent.id !== "agent-playful");
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();
  await page.getByRole("button", { name: "Test history" }).click();
  await expect(page.getByText("Source agent missing")).toBeVisible();
  await expect(page.getByRole("button", { name: "Repeat test with current edits" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Send to editing chat" })).toBeDisabled();
  expect(forbidden).toEqual([]);
});

test("offers only prepared booklet stages and permits a compatibility mismatch", async ({ page }) => {
  await page.getByRole("button", { name: "Test", exact: true }).click();
  await page.getByLabel("Test booklet").selectOption("demo-moon");
  await expect(page.getByLabel("Test stage")).toHaveValue("visual_bible");
  await expect(page.getByText("This specialty is not a typical match for the selected stage. You can still test it.")).toBeVisible();
  await page.getByLabel("Test stage").selectOption("audience_profile");
  await expect(page.getByText(/Available artifacts/)).toBeVisible();
  await expect(page.getByText("None yet")).toBeVisible();
  await expect(page.getByRole("option", { name: /PDF export/ })).toHaveCount(0);
  await page.getByLabel("Test booklet").selectOption("demo-garden");
  await page.getByLabel("Test stage").selectOption("story_plan");
  await expect(page.getByText(/Audience profile → Story plan/)).toBeVisible();
  await expect(page.getByText("Warm watercolor, simple shapes, clear focal point.")).toHaveCount(0);
});

test("keeps follow-ups in one session and persists its rename until deletion", async ({ page }) => {
  await startAgentTest(page);
  await page.getByLabel("Message Test agent").fill("Summarize context");
  await page.getByRole("button", { name: "Send to Test agent" }).click();
  await expect(page.getByText(/Captured \d+ earlier artifact/)).toBeVisible();
  await page.getByLabel("Session name").fill("Forest review");
  await page.reload();
  await expect(page.getByLabel("Session name")).toHaveValue("Forest review");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete session" }).click();
  await expect(page.getByText("No tests yet.")).toBeVisible();
});

test("testing leaves source agents, specialties, and booklet fixtures unchanged", async ({ page }) => {
  await page.getByLabel("Message the editing assistant").fill("Persist source fixtures");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("specialty-management-mockup:v2"))).not.toBeNull();
  const before = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("specialty-management-mockup:v2")!);
    return JSON.stringify({ agents: state.agents, specialties: state.specialties, booklets: state.booklets });
  });
  await startAgentTest(page);
  const after = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("specialty-management-mockup:v2")!);
    return JSON.stringify({ agents: state.agents, specialties: state.specialties, booklets: state.booklets });
  });
  expect(after).toBe(before);
});

test("focus mode and version notes preserve draft workflow and lifecycle explanations", async ({ page }) => {
  await expect.poll(() => page.evaluate(() => localStorage.getItem("specialty-management-mockup:v2"))).not.toBeNull();
  const preferences = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("specialty-management-mockup:v2")!);
    return { navWidth: state.ui.navWidth, chatWidth: state.ui.chatWidth, chatOpen: state.ui.chatOpen };
  });
  await page.getByRole("button", { name: "Configuration" }).click();
  await page.getByLabel("Version note").fill("Draft note");
  await page.getByRole("button", { name: "Suggest note" }).click();
  const noteDialog = page.getByRole("dialog", { name: "Suggested version note" });
  await expect(noteDialog).toBeVisible();
  for (let index = 0; index < 4; index += 1) await page.keyboard.press("Tab");
  await expect.poll(() => noteDialog.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Suggest note" })).toBeFocused();
  await expect(page.getByLabel("Version note")).toHaveValue("Draft note");
  await page.getByRole("button", { name: "Enter focus mode" }).click();
  await expect(page.getByRole("navigation", { name: "Specialties and agents" })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Agent sections" })).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "Editing assistant" })).toHaveCount(0);
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    await page.screenshot({
      path: `output/playwright/specialty-management-mockup/desktop-${viewport.width}-focused-configuration.png`,
      fullPage: true,
    });
  }
  await page.reload();
  await expect(page.getByRole("button", { name: "Exit focus mode" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Enter focus mode" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Enter focus mode" })).toBeFocused();
  expect(await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("specialty-management-mockup:v2")!);
    return { navWidth: state.ui.navWidth, chatWidth: state.ui.chatWidth, chatOpen: state.ui.chatOpen };
  })).toEqual(preferences);
  await page.getByRole("button", { name: "Version actions" }).click();
  await expect(page.getByText("Save or discard before locking this version.")).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Version actions" })).toBeFocused();
});

test("version notes preview, save, lock, and reset on a derived draft", async ({ page }) => {
  await page.getByRole("button", { name: "Configuration" }).click();
  await page.getByLabel("Version note").fill("Existing optional note");
  await page.getByRole("button", { name: "Suggest note" }).click();
  const dialog = page.getByRole("dialog", { name: "Suggested version note" });
  await expect(dialog).toContainText("Updated Main instructions and references.");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByLabel("Version note")).toHaveValue("Existing optional note");
  await page.getByRole("button", { name: "Suggest note" }).click();
  await dialog.getByRole("button", { name: "Use suggestion" }).click();
  await expect(page.getByLabel("Version note")).toHaveValue("Updated Main instructions and references.");
  await page.getByLabel("Version note").fill("x".repeat(241));
  expect((await page.getByLabel("Version note").inputValue()).length).toBe(240);
  await page.getByLabel("Version note").fill("Release summary");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.reload();
  await expect(page.getByLabel("Version note")).toHaveValue("Release summary");
  await runVersionAction(page, /^Confirm/);
  await expect(page.getByLabel("Version note")).toBeDisabled();
  await expect(page.locator(".header-actions select")).toContainText("Release summary");
  await page.getByRole("button", { name: "Edit as draft" }).click();
  await expect(page.getByLabel("Version note")).toHaveValue("");
  await page.locator(".header-actions select").selectOption("playful-v2");
  await expect(page.getByLabel("Version note")).toHaveValue("Release summary");
});

test("focus mode preserves hidden streams and editing handoff exits focus", async ({ page }) => {
  await requestEditingAssistant(page, "What can you change here?");
  await page.getByRole("button", { name: "Enter focus mode" }).click();
  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("specialty-management-mockup:v2")!);
    return state.chat.pendingResponse === null && state.chat.messages.some((message: { role: string; text?: string }) => message.role === "assistant" && message.text?.includes("deterministic simulation"));
  })).toBe(true);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Test", exact: true }).click();
  await page.getByRole("button", { name: "Start test" }).click();
  await page.getByRole("button", { name: "Enter focus mode" }).click();
  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("specialty-management-mockup:v2")!);
    return state.pendingTestResponse === null && state.testSessions[0]?.messages.some((message: { role: string; state: string }) => message.role === "assistant" && message.state === "complete");
  })).toBe(true);
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    await page.screenshot({
      path: `output/playwright/specialty-management-mockup/desktop-${viewport.width}-focused-test.png`,
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "Send to editing chat" }).last().click();
  await expect(page.getByRole("button", { name: "Enter focus mode" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Editing assistant" })).toBeVisible();
  await expect(page.getByLabel("Message the editing assistant")).toHaveValue(/Test feedback for/);
});

test("agent configuration reflects unsaved specialty tools and returns to its working copy", async ({ page }) => {
  await page.getByRole("button", { name: "Configuration" }).click();
  await page.getByLabel("Title").fill("Working title preserved");
  const summary = page.getByRole("region", { name: "Allowed tools summary" });
  await expect(summary).toContainText("get_conversation_context");
  await summary.getByRole("button", { name: "Edit specialty tools" }).click();
  await page.getByLabel(/get_conversation_context/).uncheck();
  await page.getByRole("button", { name: /Playful Writer/ }).click();
  await expect(page.getByRole("region", { name: "Allowed tools summary" })).toContainText("Unsaved specialty values");
  await expect(page.getByRole("region", { name: "Allowed tools summary" })).not.toContainText("get_conversation_context");
  await expect(page.getByLabel("Title")).toHaveValue("Working title preserved");
  await page.getByRole("button", { name: "Test", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Test agent" })).toBeVisible();
});

test("uses the same search and retired filter in directory and workspace", async ({ page }) => {
  await page.getByRole("button", { name: "Directory" }).click();
  await page.getByLabel("Search specialties and agents").fill("Concise");
  await expect(page.getByRole("button", { name: /Concise Planner/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Watercolor Illustrator/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Filter" }).click();
  await page.getByLabel("Show retired").check();
  await page.getByLabel("Search specialties and agents").fill("Legacy");
  await expect(page.getByRole("button", { name: /Legacy Review/ })).toBeVisible();
});

test("history preserves a missing tested version and offers a labeled handoff fallback", async ({ page }) => {
  await startAgentTest(page);
  await page.evaluate(() => {
    const key = "specialty-management-mockup:v2";
    const state = JSON.parse(localStorage.getItem(key)!);
    const agent = state.agents.find((item: { id: string }) => item.id === "agent-playful");
    agent.versions = agent.versions.filter((version: { id: string }) => version.id !== "playful-v2");
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();
  await page.getByRole("button", { name: "Test history" }).click();
  await expect(page.getByText("Tested version missing")).toBeVisible();
  await page.getByRole("button", { name: "Send to editing chat" }).click();
  await expect(page.getByLabel("Message the editing assistant")).toHaveValue(/tested version is unavailable; using the current version/i);
});
test("persists sample image description and exposes metadata", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Expand Illustration" }).click();
  await page.getByRole("button", { name: /Watercolor Illustrator/ }).click();
  await page.getByRole("button", { name: "Preview sample result" }).click();
  await expect(
    page.getByRole("dialog", { name: "Image specialty output" }),
  ).toBeVisible();
  await page.getByLabel("Optional description").fill("Moonlit cover candidate");
  await page.getByText("Metadata").click();
  await expect(page.getByText("1120 × 630")).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(
    page.getByRole("button", { name: "Preview sample result" }),
  ).toBeFocused();
  await page.reload();
  await page.getByRole("button", { name: "Preview sample result" }).click();
  await expect(page.getByLabel("Optional description")).toHaveValue(
    "Moonlit cover candidate",
  );
});
test("reopens an agent at its most recently selected version", async ({
  page,
}) => {
  await expect(page.locator(".header-actions select")).toHaveValue("playful-v2");
  await page.getByRole("button", { name: "Story Planning text" }).click();
  await page.getByRole("button", { name: /Playful Writer/ }).click();
  await expect(page.locator(".header-actions select")).toHaveValue("playful-v2");
});
test("captures readable desktop layouts with chat open and closed", async ({
  page,
}) => {
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      )
      .toBe(true);
    await page.screenshot({
      path: `output/playwright/specialty-management-mockup/desktop-${viewport.width}-chat-open.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Hide chat" }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      )
      .toBe(true);
    await page.screenshot({
      path: `output/playwright/specialty-management-mockup/desktop-${viewport.width}-chat-closed.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Show chat" }).click();
  }
});

test("captures readable Test and Test history desktop layouts", async ({ page }) => {
  await page.getByRole("button", { name: "Test", exact: true }).click();
  await page.getByRole("button", { name: /Start test/ }).click();
  await expect(page.getByText("Prepared a deterministic text result from the frozen snapshot.")).toBeVisible();
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    await page.screenshot({
      path: `output/playwright/specialty-management-mockup/desktop-${viewport.width}-test.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: /Test history/ }).click();
    await page.screenshot({
      path: `output/playwright/specialty-management-mockup/desktop-${viewport.width}-test-history.png`,
      fullPage: true,
    });
    await page
      .getByRole("navigation", { name: "Specialties and agents" })
      .getByRole("button", { name: /Playful Writer/ })
      .click();
    await page.getByRole("button", { name: "Test", exact: true }).click();
  }
});

test("searches and opens specialty and agent entities", async ({ page }) => {
  const search = page.getByLabel("Search specialties and agents");
  await search.fill("Concise");
  await expect(
    page.getByRole("button", { name: /Concise Planner/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Playful Writer/ }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /Concise Planner/ }).click();
  await expect(
    page.getByRole("heading", { name: "Concise Planner" }),
  ).toBeVisible();
  await search.fill("");
  await page.getByRole("button", { name: "Story Planning text" }).click();
  await expect(
    page.getByRole("heading", { name: "Story Planning", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Specialties and agents" })
      .getByRole("button", { name: /move|copy/i }),
  ).toHaveCount(0);
});

test("closes a mention menu with Escape", async ({ page }) => {
  await page.getByLabel("Main instructions").fill("Use @");
  await expect(
    page.getByRole("listbox", { name: "@ suggestions" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("listbox", { name: "@ suggestions" }),
  ).toHaveCount(0);
});
