import type { PersistedMessage } from "@/lib/contracts/booklets";
import type { Booklet } from "@/lib/contracts/domain";
import type { SkillContext } from "@/lib/contracts/skills";

function messageText(message: PersistedMessage): string[] {
  const saved = message.message;
  if (!saved || typeof saved !== "object" || !("parts" in saved) || !Array.isArray(saved.parts)) return [];
  return saved.parts.flatMap((part) => Boolean(part) && typeof part === "object" && "type" in part && part.type === "text" && "text" in part && typeof part.text === "string" ? [part.text] : []);
}

export function buildSkillContext(input: {
  booklet: Booklet;
  intent: string;
  originalIdea: string;
  previousMessages: PersistedMessage[];
  approvedArtifactVersionIds: string[];
  traceId: string;
  operation: string;
}): SkillContext {
  const priorText = input.previousMessages.flatMap(messageText);
  return {
    bookletId: input.booklet.id,
    stage: input.booklet.currentStage,
    operation: input.operation,
    intent: input.intent,
    knownFacts: [...new Set([input.originalIdea, input.intent, ...priorText])],
    recentMessages: input.previousMessages.slice(-12).map((message) => JSON.stringify(message.message)),
    approvedArtifactVersionIds: input.approvedArtifactVersionIds,
    traceId: input.traceId,
  };
}
