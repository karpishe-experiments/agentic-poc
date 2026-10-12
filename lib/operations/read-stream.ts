/** Cancel the actual reader when its request budget expires. */
export async function readStreamChunk<T>(reader: ReadableStreamDefaultReader<T>, signal: AbortSignal) {
  signal.throwIfAborted();
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    const value = await reader.read();
    signal.throwIfAborted();
    return value;
  } finally { signal.removeEventListener("abort", abort); }
}
