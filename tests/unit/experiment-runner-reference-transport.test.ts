import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { createReferenceTransport } from "@/lib/experiment-runner/reference-transport";
import type { BookletBinding, BookletRunnerConfig } from "@/lib/experiment-runner/config";

const runId = randomUUID();
const binding: BookletBinding = { role: "image", taskId: null, persona: null, appId: randomUUID(),
  publishedWorkflowId: randomUUID(), toolProviderId: null, apiKey: "app-synthetic-key" };
const config: BookletRunnerConfig = { enabled: true, baseUrl: "https://dify.example.test", publicOrigin: "https://booklet.example.test",
  callbackKey: "x".repeat(32), bindings: [binding] };
const image = () => sharp({ create: { width: 8, height: 8, channels: 3, background: "#2288cc" } }).png().toBuffer();
const acknowledgement = (size: number, extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ id: randomUUID(), size, mime_type: "image/jpeg", url: "https://signed.example/private", ...extra }), { status: 201 });

describe("Dify runtime reference upload", () => {
  it("sends one original multipart image with the run user and canonical metadata", async () => {
    const source = await image();
    const original = Uint8Array.from(source);
    const digest = createHash("sha256").update(original).digest("hex");
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      expect(url).toBe("https://dify.example.test/v1/files/upload");
      expect(init).toMatchObject({ method: "POST", redirect: "error", cache: "no-store",
        headers: { Authorization: "Bearer app-synthetic-key" } });
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect((init?.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
      const form = init?.body as FormData;
      expect(form.get("user")).toBe(`booklet-${runId}`);
      const file = form.get("file") as File;
      expect(file.name).toBe("reference.png");
      expect(file.type).toBe("image/png");
      expect(new Uint8Array(await file.arrayBuffer())).toEqual(original);
      original.fill(0); // The request retains its frozen copy.
      return acknowledgement(source.byteLength);
    });
    const result = await createReferenceTransport(config, fetcher).upload(binding, runId, original);
    expect(result).toMatchObject({ kind: "uploaded", byteLength: source.byteLength, mimeType: "image/png", sha256: digest });
    expect(result).not.toHaveProperty("url");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("freezes caller bytes before asynchronous decoding", async () => {
    const bytes = Uint8Array.from(await image());
    const digest = createHash("sha256").update(bytes).digest("hex");
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const file = (init!.body as FormData).get("file") as File;
      const uploaded = new Uint8Array(await file.arrayBuffer());
      expect(createHash("sha256").update(uploaded).digest("hex")).toBe(digest);
      return acknowledgement(uploaded.byteLength);
    });
    const pending = createReferenceTransport(config, fetcher).upload(binding, runId, bytes);
    bytes.fill(0);
    expect(await pending).toMatchObject({ kind: "uploaded", sha256: digest });
  });

  it("rejects invalid inputs, corrupt images and the 10 MiB bound before fetch", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const transport = createReferenceTransport(config, fetcher);
    expect(await transport.upload(binding, "not-a-run", await image())).toEqual({ kind: "rejected", reason: "invalid_input" });
    expect(await transport.upload({ ...binding, apiKey: "wrong" }, runId, await image())).toEqual({ kind: "rejected", reason: "invalid_input" });
    expect(await transport.upload(binding, runId, new Uint8Array([1, 2, 3]))).toEqual({ kind: "rejected", reason: "invalid_image" });
    expect(await transport.upload(binding, runId, new Uint8Array(10 * 1024 * 1024 + 1))).toEqual({ kind: "rejected", reason: "too_large" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([400, 401, 403, 404, 413, 415, 422])("classifies definite HTTP %i without retry", async (status) => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response("rejected", { status }));
    expect(await createReferenceTransport(config, fetcher).upload(binding, runId, await image())).toEqual({ kind: "rejected", reason: "http_rejected" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([302, 500])("keeps HTTP %i uncertain without retry", async (status) => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response("uncertain", { status }));
    expect(await createReferenceTransport(config, fetcher).upload(binding, runId, await image())).toEqual({ kind: "unknown" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("keeps timeout and network failure uncertain without retry", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => { throw new DOMException("timed out", "TimeoutError"); });
    expect(await createReferenceTransport(config, fetcher).upload(binding, runId, await image())).toEqual({ kind: "unknown" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed, mismatched-size and oversized acknowledgements as unknown", async () => {
    const bytes = await image();
    for (const response of [new Response("not json"), acknowledgement(bytes.byteLength + 1),
      acknowledgement(bytes.byteLength, { id: "not-an-id" }), new Response("x".repeat(64 * 1024 + 1))]) {
      const fetcher = vi.fn<typeof fetch>(async () => response);
      expect(await createReferenceTransport(config, fetcher).upload(binding, runId, bytes)).toEqual({ kind: "unknown" });
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
});
