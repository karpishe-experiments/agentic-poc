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
  it("preserves Cloud staging defaults in master-owned host configuration", () => {
    const base = readFileSync("deploy/compose.yml", "utf8");
    const staging = readFileSync("deploy/compose.staging.yml", "utf8");
    expect(base).toContain('DIFY_EXPERIMENT_ENABLED: "false"');
    expect(base).toContain('DIFY_IMAGE_MAX_ATTEMPTS: "2"');
    expect(base).toContain("DIFY_BASE_URL: https://api.dify.ai/v1");
    expect(staging).toContain('DIFY_EXPERIMENT_ENABLED: "true"');
    expect(staging).toContain("DIFY_EXPERIMENT_MODE: fake");
    expect(staging).toContain('DIFY_IMAGE_ENABLED: "false"');
    expect(staging).not.toContain("DIFY_COMMUNITY_PROBE_ENABLED");
  });
  it("links GHCR to the repository and accepts only an anonymously readable image", () => {
    const workflow = readFileSync(".github/workflows/deploy.yml", "utf8");
    expect(workflow).toContain("org.opencontainers.image.source=$GITHUB_SERVER_URL/$GITHUB_REPOSITORY");
    expect(workflow.indexOf("visibility=public")).toBeGreaterThan(0);
    expect(workflow.indexOf("DOCKER_CONFIG=")).toBeLessThan(workflow.indexOf("visibility=public"));
    expect(workflow).toContain("GHCR package is private and GITHUB_TOKEN cannot change its visibility");
    expect(workflow).toContain("packages/container/$package/settings");
    expect(workflow).not.toContain("packages/container/package/$package/settings");
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

  it("preserves all seven Cloud tool paths and isolates the Community callback exception", () => {
    const proxy = readFileSync("proxy.ts", "utf8");
    expect(proxy).toContain('process.env.DEPLOYMENT_ENV === "_staging"');
    expect(proxy).not.toContain("DIFY_EXPERIMENT_ENABLED");
    for (const path of ["context", "draft", "review", "image", "image/authorize", "image/complete", "image/failure"]) expect(proxy).toContain(`/api/experiments/dify/tools/${path}`);
    expect(proxy).toContain('process.env.DIFY_COMMUNITY_PROBE_ENABLED === "true" && request.nextUrl.pathname === "/api/integrations/dify-community/callback"');
    const compose = readFileSync("deploy/compose.yml", "utf8");
    expect(compose).toContain('DIFY_COMMUNITY_PROBE_ENABLED: "false"');
    expect(compose).toContain("DIFY_BASE_URL: https://api.dify.ai/v1");
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
