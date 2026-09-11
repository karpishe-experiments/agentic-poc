import { describe, expect, it } from "vitest";
import { insertMention, mentionQuery, resolveMention, safeMarkdownUrl, SAMPLE_IMAGE_PATH } from "@/lib/mockups/specialty-management/mentions";

describe("mention helpers", () => {
  it("opens after whitespace and filters the current token", () => {
    expect(mentionQuery("Use @sto", 8)).toEqual({ trigger: "@", start: 4, query: "sto" });
    expect(mentionQuery("/$ref", 5)).toBeNull();
  });
  it("does not treat a URL slash as a tool trigger", () => {
    expect(mentionQuery("https://", 8)).toBeNull();
    expect(mentionQuery("Call /get", 9)).toEqual({ trigger: "/", start: 5, query: "get" });
  });
  it("inserts a stable identifier link and returns the next cursor", () => {
    expect(insertMention("Use @sto now", 4, 8, "@Story Planning", "specialty:sp-story")).toEqual({ text: "Use [@Story Planning](specialty:sp-story)  now", cursor: 42 });
  });
  it("resolves stable IDs and reports deleted targets", () => {
    const ids = { specialty: ["sp-story"], tool: ["read"], reference: [] };
    expect(resolveMention("specialty:sp-story", ids)).toEqual({ kind: "specialty", id: "sp-story", available: true });
    expect(resolveMention("reference:deleted", ids)).toEqual({ kind: "reference", id: "deleted", available: false });
    expect(resolveMention("https://example.com", ids)).toBeNull();
  });
  it("allows safe links and the one bundled image path", () => {
    expect(safeMarkdownUrl("https://example.com")).toBe("https://example.com");
    expect(safeMarkdownUrl("javascript:alert(1)")).toBe("");
    expect(safeMarkdownUrl(SAMPLE_IMAGE_PATH)).toBe(SAMPLE_IMAGE_PATH);
  });
});
