import { describe, expect, it } from "vitest";
import { MaintenanceModeError } from "@/lib/application/deployment-control";
import { difyExperimentStorySchema } from "@/lib/contracts/dify-experiment";
import fixtures from "@/docs/accepted/2026-09-16_agent-platform-decision/fixtures.json";
import { assertDifyToolProjectId, assertSameOriginJsonRequest, difyExperimentErrorResponse, difyToolContext, uniqueSearchParams } from "@/lib/dify-experiment/http";

describe("Dify experiment error response", () => {
  it.each([
    { title: "" }, { title: "x".repeat(1001) }, { storyline: "x".repeat(16001) },
    { panels: fixtures.example_story.panels.slice(0, 2) },
    { panels: fixtures.example_story.panels.map((panel) => ({ ...panel, number: 1 })) },
    { panels: fixtures.example_story.panels.map((panel) => ({ ...panel, scene: "" })) },
  ])("rejects invalid required story structure with field errors", async (override) => {
    const result = difyExperimentStorySchema.safeParse({ ...fixtures.example_story, ...override });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected validation failure");
    const response = difyExperimentErrorResponse(result.error);
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.message).toMatch(/title|storyline|panels/);
    expect(body.error.message.length).toBeLessThan(500);
  });
  it("preserves the maintenance status and code", async () => {
    const response = difyExperimentErrorResponse(new MaintenanceModeError("release drain"));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: { code: "deployment_maintenance", message: "Deployment maintenance is active: release drain" } });
  });

  it("does not reveal the current run ID to a Dify tool", () => {
    const context = { active_run_id: "00000000-0000-4000-8000-000000000001", project_id: "booklet-dify-trial" } as Parameters<typeof difyToolContext>[0];
    expect(difyToolContext(context)).toEqual({ project_id: "booklet-dify-trial" });
  });

  it("returns 404 for an unknown project selector", async () => {
    expect(() => assertDifyToolProjectId("other-project")).toThrow();
    try { assertDifyToolProjectId("other-project"); }
    catch (error) {
      const response = difyExperimentErrorResponse(error);
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: { code: "project_not_found", message: "The experiment project was not found." } });
    }
  });

  it("accepts the public origin supplied by one trusted proxy hop", () => {
    const request = new Request("http://app:3000/api/experiments/dify/initialize", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://booklet-staging.uniwares.co.uk",
        "x-forwarded-host": "booklet-staging.uniwares.co.uk",
        "x-forwarded-proto": "https",
      },
    });

    expect(() => assertSameOriginJsonRequest(request)).not.toThrow();
  });

  it.each([
    { origin: "https://attacker.example", host: "booklet-staging.uniwares.co.uk", proto: "https" },
    { origin: "https://booklet-staging.uniwares.co.uk", host: "booklet-staging.uniwares.co.uk,attacker.example", proto: "https" },
    { origin: "https://booklet-staging.uniwares.co.uk", host: "booklet-staging.uniwares.co.uk", proto: undefined },
    { origin: "https://booklet-staging.uniwares.co.uk", host: "booklet-staging.uniwares.co.uk/path", proto: "https" },
  ])("rejects mismatched or malformed proxy origin metadata", ({ origin, host, proto }) => {
    const headers = new Headers({ "content-type": "application/json", origin, "x-forwarded-host": host });
    if (proto) headers.set("x-forwarded-proto", proto);
    const request = new Request("http://app:3000/api/experiments/dify/initialize", { method: "POST", headers });

    expect(() => assertSameOriginJsonRequest(request)).toThrowError("The request origin is not permitted.");
  });

  it("rejects duplicate query parameters before callback validation", () => {
    const request = new Request("https://staging.example/callback?attempt_id=one&attempt_id=two");
    expect(() => uniqueSearchParams(request)).toThrowError("Query parameters must not be repeated.");
  });
});
