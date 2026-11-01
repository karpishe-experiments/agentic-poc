import { describe, expect, it } from "vitest";
import { externalError, redactExternalError, retainExternalError } from "@/lib/experiment-runner/external-errors";

describe("Booklet external error evidence", () => {
  it("retains HTTP and SDK diagnostics, stacks and causes while removing secrets", () => {
    const error = Object.assign(new Error("POST failed Bearer top-secret-token; key=sk-provider-secret"), {
      status: 429, request_id: "req_123", body: { error: { code: "rate_limit", message: "Wait before another request" }, api_key: "private" },
      cause: new Error("upstream response failed"),
    });
    const row = externalError({ service: "openai", stage: "image", error, status: 429, requestId: "req_123",
      destination: "https://dify.test/file?sign=private&timestamp=123", method: "POST", dispatchStarted: true });
    const text = JSON.stringify(row);
    expect(text).toContain("rate_limit"); expect(text).toContain("upstream response failed"); expect(text).toContain("stack");
    expect(text).not.toContain("top-secret-token"); expect(text).not.toContain("sk-provider-secret"); expect(text).not.toContain("private");
    expect(row).toMatchObject({ status: 429, requestId: "req_123", redacted: true, dispatchStarted: true });
  });
  it("bounds circular and oversized diagnostic data and reports truncation", () => {
    const error: Record<string, unknown> = { body: "x".repeat(100_000) }; error.self = error;
    const row = externalError({ service: "dify", stage: "response", error });
    expect(row.truncated).toBe(true); expect(JSON.stringify(row).length).toBeLessThan(70_000);
    expect(JSON.stringify(redactExternalError({ uri: "mongodb+srv://name:password@db.test/test" }).value)).not.toContain("name:password");
  });
  it("removes raw, JSON-encoded and structured cookie headers and signed URL tokens", () => {
    const row = externalError({ service: "provider", stage: "response", error: {
      message: "upstream rejected\nCookie: session=sample-session-value\nSet-Cookie: session=sample-session-value",
      body: JSON.stringify({ headers: { Cookie: "session=sample-session-value", Authorization: "custom-private-value" } }),
      url: "https://host/file?sig=sample-signature-value&other=visible", headers: { Cookie: "sample-session-value" } } });
    expect(JSON.stringify(row)).not.toMatch(/sample-session-value|sample-signature-value|custom-private-value/);
    expect(row.redacted).toBe(true);
  });
  it("does not turn diagnostic persistence failures into a provider outcome", async () => {
    const database = { collections: { experiment_operations: { updateOne() { throw Error("offline"); } } } };
    await expect(retainExternalError({ operationId: "fixture" }, externalError({ service: "test", stage: "save", error: Error("original") }),
      database as never)).resolves.toBeUndefined();
  });
});
