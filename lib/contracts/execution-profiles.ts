import { z } from "zod";
import { imageTargetSchema } from "@/lib/contracts/execution";

export const executionProfileIdSchema = z.enum(["openai-specialist", "openai-image", "gemini-image", "flux-image"]);
export const executionProfileVersionSchema = z.literal(1);
export const imageOutputControlSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("quality"), value: z.enum(["auto", "low", "medium", "high"]) }),
  z.object({ kind: z.literal("resolution"), value: z.enum(["1K", "2K", "4K"]) }),
  z.object({ kind: z.literal("dimensions"), width: z.number().int().positive(), height: z.number().int().positive() }),
]);
export const executionProfileSettingsSchema = z.discriminatedUnion("profileId", [
  z.object({ profileId: z.literal("openai-specialist"), profileVersion: executionProfileVersionSchema, provider: z.literal("openai"), modelId: z.enum(["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"]), reasoningEffort: z.enum(["low", "medium", "high"]), maxTurns: z.literal(1) }),
  z.object({ profileId: z.literal("openai-image"), profileVersion: executionProfileVersionSchema, provider: z.literal("openai"), modelId: z.enum(["gpt-image-2", "gpt-image-2-2026-04-21"]), imageQuality: z.enum(["auto", "low", "medium", "high"]) }),
  z.object({ profileId: z.literal("gemini-image"), profileVersion: executionProfileVersionSchema, provider: z.literal("google"), modelId: z.enum(["gemini-3.1-flash-image", "gemini-3-pro-image"]), imageResolution: z.enum(["1K", "2K", "4K"]) }),
  z.object({ profileId: z.literal("flux-image"), profileVersion: executionProfileVersionSchema, provider: z.literal("bfl"), modelId: z.enum(["flux-2-pro", "flux-2-flex"]) }),
]);
export const executionProfileCapabilitySchema = z.object({ profileId: executionProfileIdSchema, profileVersion: executionProfileVersionSchema, executorKind: z.enum(["specialist", "image"]), targetKinds: z.array(z.enum(["skill", "image"])), imageTargets: z.array(imageTargetSchema), operations: z.array(z.enum(["generate", "edit", "text"])), modelIds: z.array(z.string().min(1)), summary: z.string().min(1) });
export type ExecutionProfileSettings = z.infer<typeof executionProfileSettingsSchema>;
export type ExecutionProfileCapability = z.infer<typeof executionProfileCapabilitySchema>;
