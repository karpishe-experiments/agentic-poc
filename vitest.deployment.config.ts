import path from "node:path";
import { defineConfig } from "vitest/config";

// Pure deployment contracts do not require a MongoDB process or provider keys.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(process.cwd()) } },
  test: {
    environment: "node",
    include: ["tests/unit/deployment-contracts.test.ts", "tests/unit/recovery-storage.test.ts", "tests/unit/config/env.test.ts", "tests/unit/dify-community-probe.test.ts"],
  },
});
