export class OpenAIExperimentImageAdapter {
  public constructor(private readonly input: { apiKey: string; fetch?: typeof fetch }) {}

  public async generate(prompt: string): Promise<{ bytes: Uint8Array; mimeType: "image/png" }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);
    try {
      const response = await (this.input.fetch ?? fetch)("https://api.openai.com/v1/images/generations", {
        method: "POST",
        signal: controller.signal,
        headers: { Authorization: `Bearer ${this.input.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-image-2", prompt, size: "1536x1536", quality: "medium" }),
      });
      if (!response.ok) throw new Error(`OpenAI image generation returned HTTP ${response.status}.`);
      const payload = await response.json() as { data?: Array<{ b64_json?: string }> };
      const bytesBase64 = payload.data?.[0]?.b64_json;
      if (!bytesBase64) throw new Error("OpenAI image generation did not return image bytes.");
      return { bytes: Uint8Array.from(Buffer.from(bytesBase64, "base64")), mimeType: "image/png" };
    } finally {
      clearTimeout(timeout);
    }
  }
}
