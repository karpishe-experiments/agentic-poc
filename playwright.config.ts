import { defineConfig, devices } from "@playwright/test";

// The Windows development image includes Chrome but not Playwright's separate
// Chromium download. CI or other platforms can still opt into bundled Chromium.
const browserChannel = process.env.PLAYWRIGHT_BROWSER_CHANNEL ?? (process.platform === "win32" ? "chrome" : undefined);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3001";

export default defineConfig({
  timeout: 60_000,
  testDir: "./tests/e2e",
  outputDir: "output/playwright/test-results",
  // Tests intentionally share the isolated MongoDB database owned by run-e2e.
  workers: 1,
  use: {
    baseURL,
    ...devices["Desktop Chrome"],
    ...(browserChannel ? { channel: browserChannel } : {}),
  },
});
