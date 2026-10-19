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

  it("lets read-only exact status bypass mutation queues without changing mutation serialization", () => {
    const workflow = readFileSync(".github/workflows/vps-operation-control.yml", "utf8");
    const concurrency = workflow.split("\nconcurrency:")[1].split("\ndefaults:")[0];
    expect(concurrency).toContain("inputs.action == 'operation-status'");
    expect(concurrency).toContain("format('vps-operation-status-{0}', github.run_id)");
    expect(concurrency).toContain("|| format('vps-operation-control-{0}', inputs.request_id)");
    expect(concurrency).toContain("cancel-in-progress: false");
    const dispatcher = readFileSync("scripts/deploy/vps-deployment.sh", "utf8");
    const status = dispatcher.split("\noperation_status_host() {")[1].split("\noperation_stop_host() {")[0];
    expect(status).not.toContain("flock");
    expect(status).not.toContain("--apply");
  });
  it("builds a reviewed recovery image without host access or alias promotion", () => {
    const workflow = readFileSync(".github/workflows/deploy.yml", "utf8");
    expect(workflow).toContain("github.event_name == 'workflow_dispatch' && inputs.recovery_candidate == true");
    expect(workflow).toContain('[[ "$TARGET" == staging && "$GITHUB_REF_NAME" == agent/issue-65-community-probe-staging ]]');
    for (const step of ["- uses: ./.github/actions/vps-access", "- name: Release and verify", "- name: Publish successful environment alias"]) {
      expect(workflow.slice(workflow.indexOf(step)).split(/\r?\n/)[1].trim()).toBe("if: env.RECOVERY_CANDIDATE != 'true'");
    }
    expect(workflow).toContain("--jq .commit.tree.sha");
    expect(workflow).toContain('uk.co.uniwares.booklet.source-tree=$tree');
    expect(workflow).toContain('Image source tree does not match the reviewed commit');
  });
  it("counts unresolved lifecycle outcomes even when the local attempt is terminal", () => {
    const drain = readFileSync("scripts/wait-for-deployment-drain.ts", "utf8");
    expect(drain).toContain('{ "lifecycle.unresolved": true }');
    expect(drain).toContain("await reconcileInterruptedMutations()");
    expect(drain).toContain("await finishDraining()");
  });
  it("keeps runner setup staging-only and disabled by default", () => {
    const workflow = readFileSync(".github/workflows/dify-tool-key.yml", "utf8");
    expect(workflow).toContain("- DIFY_BOOKLET_RUNNER");
    expect(workflow).toContain("secrets.DIFY_BOOKLET_RUNNER_SETTINGS_JSON");
    expect(workflow).toContain('test "$GITHUB_REF_NAME" = master');
    expect(workflow).toContain("kids-booklet-vps-operation");
    expect(readFileSync("deploy/compose.yml", "utf8")).toContain('DIFY_BOOKLET_RUNNER_ENABLED: "false"');
    expect(readFileSync("deploy/compose.prod.yml", "utf8")).not.toContain("DIFY_BOOKLET_RUNNER_ENABLED");
  });
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
  it("does not apply new infrastructure merely because master was updated", () => {
    const workflow = readFileSync(".github/workflows/infrastructure.yml", "utf8");
    expect(workflow).toContain("inputs.apply && '--apply' || ''");
    expect(workflow).not.toContain("github.event_name == 'push' || inputs.apply");
  });

  it("keeps Community host operations manual, serialized, and branch-fresh", () => {
    const workflow = readFileSync(".github/workflows/dify-operations.yml", "utf8");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("options: [check, idle, diagnostics, repair-sandbox, repair-scheduler, install, repair-broker, repair-collaboration, status, resume]");
    expect(workflow).toContain('[[ "$ACTION" =~ ^(install|repair-broker|repair-collaboration|repair-sandbox|repair-scheduler)$ && "$APPLY" == true ]]');
    expect(workflow).toContain('if [[ "$ACTION" =~ ^(check|idle|status|diagnostics)$ ]]; then');
    expect(workflow).toContain('"$ACTION" == diagnostics && "$RUN_ID" =~ ^[a-f0-9]');
    expect(workflow).toContain('[[ -z "$RUN_ID" ]] || args+=(--run-id "$RUN_ID")');
    expect(workflow).toContain('[[ "$ACTION" != status && "$ACTION" != resume ]] || operation="$ACTION"');
    expect(workflow).toContain('args=(--action "$operation" --environment dify --vps-host "$VPS_HOST")');
    expect(workflow).toContain("Resume requires apply.");
    expect(workflow).toContain("request_display='retained host journal'");
    expect(workflow).toContain("kids-booklet-vps-operation");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain('"$remote_sha" == "$GITHUB_SHA"');
    expect(workflow).toContain("GITHUB_STEP_SUMMARY");
  });

  it("pins the selected Dify services and removes upstream public ports", () => {
    const release = JSON.parse(readFileSync("deploy/dify/release.json", "utf8")) as {
      release: string;
      source_commit: string;
      source_archive_sha256: string;
      images: Record<string, string>;
    };
    const override = readFileSync("deploy/dify/compose.override.yml", "utf8").replace(/\r\n/g, "\n");
    expect(release.release).toBe("1.17.1");
    expect(release.source_commit).toMatch(/^[a-f0-9]{40}$/);
    expect(release.source_archive_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.keys(release.images)).toHaveLength(16);
    for (const [service, image] of Object.entries(release.images)) {
      expect(image).toMatch(/^[\w./-]+@sha256:[a-f0-9]{64}$/);
      expect(override).toContain(`  ${service}:\n    image: ${image}`);
    }
    expect(override).toContain("ports: !override []");
    expect(override).toContain('"127.0.0.1:3300:80"');
    expect(override).not.toContain("0.0.0.0:");
    const collaboration = override.split("  api_websocket:\n")[1].split("  worker:\n")[0];
    expect(collaboration).toContain("mem_limit: 1536m");
    expect(collaboration).toContain('"http://localhost:5001/health"');
    expect(collaboration).toContain("timeout: 6s");
    const sandbox = override.split("  sandbox:\n")[1].split("  ssrf_proxy:\n")[0];
    expect(sandbox).toContain("mem_limit: 1024m");
  });

  it("pins the planned restic backup binary without enabling an unverified drain", () => {
    const restic = JSON.parse(readFileSync("deploy/dify/restic.json", "utf8")) as {
      version: string;
      platform: string;
      archive: string;
      archive_sha256: string;
    };
    expect(restic.version).toBe("0.19.1");
    expect(restic.platform).toBe("linux/amd64");
    expect(restic.archive).toBe("https://github.com/restic/restic/releases/download/v0.19.1/restic_0.19.1_linux_amd64.bz2");
    expect(restic.archive_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(readFileSync(".github/workflows/dify-operations.yml", "utf8")).not.toContain("dify-backup");
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
    const proxy = readFileSync("proxy.ts", "utf8");
    expect(proxy).toContain('request.nextUrl.pathname === "/api/integrations/dify-community/callback"');
    expect(proxy).toContain('process.env.DEPLOYMENT_ENV === "_staging"');
    expect(proxy).toContain('process.env.DIFY_COMMUNITY_PROBE_ENABLED === "true"');
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
