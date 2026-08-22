import type { ExecutionProfileSettings } from "@/lib/contracts/execution-profiles";
import { FakeImageProvider } from "@/lib/images/fake-image-provider";
import { FluxImageProvider } from "@/lib/images/flux-image-provider";
import { GeminiImageProvider } from "@/lib/images/gemini-image-provider";
import { OpenAIImageProvider } from "@/lib/images/openai-image-provider";
import type { ImageProvider } from "@/lib/images/provider";

/**
 * Provider selection is code-owned by the immutable execution profile. This
 * intentionally has no generic provider/model escape hatch.
 */
export function createProfileImageProvider(settings: Extract<ExecutionProfileSettings, { profileId: "openai-image" | "gemini-image" | "flux-image" }>, runtimeMode: "fake" | "real"): ImageProvider {
  if (runtimeMode === "fake") return new FakeImageProvider();
  switch (settings.profileId) {
    case "openai-image": return new OpenAIImageProvider();
    case "gemini-image": return new GeminiImageProvider();
    case "flux-image": return new FluxImageProvider();
  }
}
