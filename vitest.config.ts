import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": rootDirectory,
    },
  },
  test: {
    include: ["tests/unit/**/*.test.{ts,tsx}", "tests/integration/**/*.test.{ts,tsx}"],
    environment: "node",
    globals: true,
    globalSetup: ["./tests/global-mongodb.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // MongoDB/Sharp workflow tests coordinate in-process job polling; serial files keep timing assertions deterministic on constrained local hosts.
    maxWorkers: 1,
  },
});
