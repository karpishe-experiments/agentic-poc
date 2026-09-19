import { describe, expect, it } from "vitest";
import { MaintenanceModeError } from "@/lib/application/deployment-control";
import { assertDifyToolProjectId, assertSameOriginJsonRequest, difyExperimentErrorResponse, difyToolContext } from "@/lib/dify-experiment/http";

describe("Dify experiment error response", () => {
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
});
