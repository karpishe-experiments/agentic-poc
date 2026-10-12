import { defineConfig } from "vitest/config";
import deployment from "./vitest.deployment.config";

// Unit checks must not start the integration database or contact providers.
export default defineConfig({
  ...deployment,
  test: {
    environment: "node",
    globals: true,
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    maxWorkers: 1,
    env: {
      NODE_ENV: "test",
      DEPLOYMENT_ENV: "local",
      ASSET_STORAGE: "filesystem",
      MODEL_RUNTIME: "fake",
      IMAGE_PROVIDER_MODE: "fake",
      DIFY_BOOKLET_RUNNER_ENABLED: "false",
      DIFY_COMMUNITY_PROBE_ENABLED: "false",
      OPENAI_API_KEY: "test-only-no-provider-key",
    },
  },
});
