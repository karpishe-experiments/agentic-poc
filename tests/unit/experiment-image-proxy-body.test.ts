import { IncomingMessage } from "node:http";
import { Socket } from "node:net";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { getCloneableBody } from "next/dist/server/body-streams";
import nextConfig from "../../next.config";
import { MAX_EXPERIMENT_IMAGE_BYTES } from "@/lib/experiment-runner/image-validation";
import { createBookletRunnerHttp } from "@/lib/experiment-runner/http";

function proxyBody(size: number) {
  const input = new IncomingMessage(new Socket());
  const limit = nextConfig.experimental?.proxyClientMaxBodySize;
  if (typeof limit !== "number") throw new Error("Expected an explicit byte transport limit.");
  const cloned = getCloneableBody(input, limit).cloneBodyStream();
  // Exercise the installed Next.js implementation, not a hand-written clone.
  queueMicrotask(() => {
    for (let remaining = size; remaining > 0; remaining -= 65536) input.push(Buffer.alloc(Math.min(remaining, 65536), 7));
    input.push(null);
  });
  return cloned;
}

describe("image transport through Next.js proxy body cloning", () => {
  it("preserves an allowed 20 MiB body above the default 10 MiB limit", async () => {
    let size = 0;
    for await (const chunk of proxyBody(MAX_EXPERIMENT_IMAGE_BYTES)) {
      const bytes = chunk as Buffer;
      expect(bytes.every((byte) => byte === 7)).toBe(true);
      size += bytes.length;
    }
    expect(size).toBe(MAX_EXPERIMENT_IMAGE_BYTES);
  });

  it("leaves oversize detection to the handler for chunked uploads", async () => {
    const http = createBookletRunnerHttp({
      config: () => ({ enabled: true, config: { enabled: true, baseUrl: "https://dify.example.test", publicOrigin: "http://localhost:3000", callbackKey: "x".repeat(32), bindings: [] } }),
      database: () => { throw new Error("unexpected database access"); },
    });
    const url = "http://localhost:3000/api/experiments/booklet-tools/image?runId=00000000-0000-4000-8000-000000000001&operationId=00000000-0000-4000-8000-000000000002&workflowRunId=00000000-0000-4000-8000-000000000003&inputFingerprint=" + "a".repeat(64);
    const body = Readable.toWeb(proxyBody(MAX_EXPERIMENT_IMAGE_BYTES + 1));
    const response = await http.imageComplete(new Request(url, { method: "POST", headers: { "x-booklet-tool-key": "x".repeat(32) }, body, duplex: "half" } as RequestInit & { duplex: "half" }));
    expect(response.status).toBe(413);
  });
});
