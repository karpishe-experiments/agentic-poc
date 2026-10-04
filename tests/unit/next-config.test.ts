import { describe, expect, it } from "vitest";
import config from "@/next.config";
import { utcIsoTimestampSchema } from "@/lib/contracts/common";

describe("server schema package loading", () => {
  it("loads Zod through Node for standalone servers without disabling validation", () => {
    expect(config.output).toBe("standalone");
    expect(config.serverExternalPackages).toContain("zod");
    expect(utcIsoTimestampSchema.safeParse("2026-10-04T12:00:00Z").success).toBe(true);
    expect(utcIsoTimestampSchema.safeParse("not-a-timestamp").success).toBe(false);
  });
});
