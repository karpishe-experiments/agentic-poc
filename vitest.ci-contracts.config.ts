import { defineConfig } from 'vitest/config';
import deployment from './vitest.deployment.config';

export default defineConfig({
  ...deployment,
  test: { ...deployment.test, include: [...deployment.test!.include!, 'tests/unit/dify-experiment-openapi.test.ts'] },
});
