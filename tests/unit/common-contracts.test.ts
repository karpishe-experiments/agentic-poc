import { describe, expect, it } from "vitest";
import { normalizedRectSchema, utcIsoTimestampSchema } from "@/lib/contracts/common";

describe("common contracts", () => {
  it("accepts a normalized text-safe region", () => {
    expect(normalizedRectSchema.safeParse({ x: 0.1, y: 0.1, width: 0.5, height: 0.25 }).success).toBe(true);
  });

  it("rejects a text-safe region outside the page", () => {
    expect(normalizedRectSchema.safeParse({ x: 0.8, y: 0.1, width: 0.3, height: 0.25 }).success).toBe(false);
  });

  it("requires an offset UTC timestamp", () => {
    expect(utcIsoTimestampSchema.safeParse("2026-08-01T12:00:00.000Z").success).toBe(true);
    expect(utcIsoTimestampSchema.safeParse("2026-08-01").success).toBe(false);
  });
});
