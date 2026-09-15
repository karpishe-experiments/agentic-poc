export async function readOperationResponse<T>(response: Response): Promise<{ ok: boolean; status: number; body: T }> {
  if (!response.headers.get("content-type")?.includes("application/x-ndjson")) return { ok: response.ok, status: response.status, body: await response.json() as T };
  if (!response.body) throw new Error("The operation response had no body.");
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    buffer += value ?? "";
    const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line) continue;
      const record = JSON.parse(line) as { type?: string; status?: number; body?: T };
      if (record.type === "result" && record.status && record.body !== undefined) return { ok: record.status >= 200 && record.status < 300, status: record.status, body: record.body };
    }
    if (done) break;
  }
  throw new Error("The operation ended without a final result. Reload persisted state before retrying.");
}
