import { describe, expect, it } from "vitest";
import { ensureRunnerStarted } from "@/lib/jobs/runner-bootstrap";

describe("runner bootstrap", () => {
  it("starts at most one local runner per process", () => {
    expect(ensureRunnerStarted()).toBe(true);
    expect(ensureRunnerStarted()).toBe(false);
  });
});
