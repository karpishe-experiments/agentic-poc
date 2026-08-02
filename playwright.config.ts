import { defineConfig, devices } from "@playwright/test";

const browserChannel = process.env.PLAYWRIGHT_BROWSER_CHANNEL;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3001";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "output/playwright/test-results",
  use: {
    baseURL,
    ...devices["Desktop Chrome"],
    ...(browserChannel ? { channel: browserChannel } : {}),
  },
  webServer: {
    command: "node --import tsx scripts/e2e-server.ts",
    url: baseURL,
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === "1",
    timeout: 120_000,
    env: {
      ...process.env,
      DATABASE_URL: "file:./output/playwright/runtime/booklets.db",
      DATA_ROOT: "./output/playwright/runtime/assets",
      MODEL_RUNTIME: "fake",
      IMAGE_PROVIDER_MODE: "fake",
    },
  },
});
