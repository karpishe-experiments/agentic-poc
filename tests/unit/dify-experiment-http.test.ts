import { describe, expect, it } from "vitest";
import { MaintenanceModeError } from "@/lib/application/deployment-control";
import { assertDifyToolProjectId, difyExperimentErrorResponse, difyToolContext } from "@/lib/dify-experiment/http";

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
});
