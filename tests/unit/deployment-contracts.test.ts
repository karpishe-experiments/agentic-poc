import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { normalizeAssetUri } from "@/lib/assets/asset-uri";
import { hasValidBasicAuthorization } from "@/lib/http/basic-auth";
import { readOperationResponse } from "@/lib/http/read-operation-response";
import { streamOperation } from "@/lib/http/stream-operation";
import { getServerEnv } from "@/lib/config/env";

const originalDeploymentEnvironment = process.env.DEPLOYMENT_ENV;
afterEach(() => {
  if (originalDeploymentEnvironment === undefined) delete process.env.DEPLOYMENT_ENV;
  else process.env.DEPLOYMENT_ENV = originalDeploymentEnvironment;
});

describe("deployment contracts", () => {
  it("publishes a public GHCR package before the anonymous image check", () => {
    const workflow = readFileSync(".github/workflows/deploy.yml", "utf8");
    expect(workflow.indexOf("visibility=public")).toBeGreaterThan(0);
    expect(workflow.indexOf("visibility=public")).toBeLessThan(workflow.indexOf("DOCKER_CONFIG="));
  });

  it("preserves safe relative asset keys and rejects traversal", () => {
    expect(normalizeAssetUri("booklets/a/page.png")).toBe("booklets/a/page.png");
    for (const invalid of ["../secret", "/absolute", "a//b", "a/./b", "C:\\secret"]) expect(() => normalizeAssetUri(invalid)).toThrow(/relative path/);
  });

  it("fails the deployed access gate closed", () => {
    process.env.DEPLOYMENT_ENV = "_staging";
    const password = "a-long-enough-password";
    expect(hasValidBasicAuthorization(null, password)).toBe(false);
    expect(hasValidBasicAuthorization(`Basic ${btoa(`booklet:${password}`)}`, password)).toBe(true);
    expect(hasValidBasicAuthorization(`Basic ${btoa(`other:${password}`)}`, password)).toBe(false);
  });

  it("requires deployed secrets, S3 buckets, and the fixed database", () => {
    const base = { NODE_ENV: "production", OPENAI_API_KEY: "key", DEPLOYMENT_ENV: "_prod", ASSET_STORAGE: "s3", AWS_REGION: "auto", MONGODB_URI: "mongodb://example", MONGODB_DATABASE: "kids_booklet_prod", ACCESS_GATE_PASSWORD: "a-long-enough-password", ASSETS_BUCKET: "assets", DIAGNOSTICS_BUCKET: "diagnostics", RECOVERY_BUCKET: "recovery" } as const;
    expect(getServerEnv({ ...base, OBJECT_STORE_ENDPOINT: "https://example.r2.cloudflarestorage.com" }).DEPLOYMENT_ENV).toBe("_prod");
    expect(() => getServerEnv({ ...base, MONGODB_DATABASE: "kids_booklet" })).toThrow(/kids_booklet_prod/);
    expect(() => getServerEnv({ ...base, ACCESS_GATE_PASSWORD: "" })).toThrow();
  });

  it("delivers streamed success and terminal errors", async () => {
    const success = await readOperationResponse<{ data: { value: number } }>(streamOperation(async () => ({ value: 3 })));
    expect(success).toMatchObject({ ok: true, status: 200, body: { data: { value: 3 } } });
    const failure = await readOperationResponse<{ error: { message: string } }>(streamOperation(async () => { throw new Error("failed"); }));
    expect(failure.ok).toBe(false);
    expect(failure.body.error.message).toMatch(/saved work is retained/);
  });
});
