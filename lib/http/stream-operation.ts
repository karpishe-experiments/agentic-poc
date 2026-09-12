import { toErrorEnvelope } from "@/lib/http/errors";
import { runTrackedMutation } from "@/lib/application/deployment-control";

const encoder = new TextEncoder();
export function streamOperation(operation: () => Promise<unknown>): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (value: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
      write({ type: "heartbeat", at: new Date().toISOString() });
      const timer = setInterval(() => write({ type: "heartbeat", at: new Date().toISOString() }), 10_000);
      void runTrackedMutation(operation).then(
        (data) => write({ type: "result", status: 200, body: { data } }),
        (error) => { const result = toErrorEnvelope(error); write({ type: "result", status: result.status, body: result.body }); },
      ).finally(() => { clearInterval(timer); controller.close(); });
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
