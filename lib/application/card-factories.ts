import { SCHEMA_VERSION } from "@/lib/contracts/common";
import type { GenUICard } from "@/lib/contracts/cards";

type CardIdentity = { cardId: string; title: string; explanation?: string };

export function createProgressCard(input: CardIdentity & {
  variant: "artifact_generation" | "page_batch" | "export";
  completed: number;
  total: number;
  currentLabel?: string;
}): GenUICard {
  return {
    schemaVersion: SCHEMA_VERSION,
    cardId: input.cardId,
    family: "progress",
    variant: input.variant,
    status: "active",
    title: input.title,
    explanation: input.explanation,
    allowedActions: [],
    payload: {
      completed: input.completed,
      total: input.total,
      currentLabel: input.currentLabel,
    },
  };
}

function createIssueCard(input: CardIdentity & {
  variant: "quality" | "generation_failure" | "validation_failure" | "recovery";
  code: string;
  summary: string;
  details?: string[];
  allowedActions: GenUICard["allowedActions"];
}): GenUICard {
  return {
    schemaVersion: SCHEMA_VERSION,
    cardId: input.cardId,
    family: "issue",
    variant: input.variant,
    status: "active",
    title: input.title,
    explanation: input.explanation,
    allowedActions: input.allowedActions,
    payload: { code: input.code, summary: input.summary, details: input.details ?? [] },
  };
}

export function createQualityIssueCard(input: CardIdentity & { code: string; summary: string; details?: string[] }): GenUICard {
  return createIssueCard({ ...input, variant: "quality", allowedActions: ["retry", "edit", "accept_with_issue"] });
}

export function createGenerationFailureCard(input: CardIdentity & { code: string; summary: string; details?: string[] }): GenUICard {
  return createIssueCard({ ...input, variant: "generation_failure", allowedActions: ["retry", "edit"] });
}

export function createValidationFailureCard(input: CardIdentity & { code: string; summary: string; details?: string[] }): GenUICard {
  return createIssueCard({ ...input, variant: "validation_failure", allowedActions: ["retry", "edit"] });
}

export function createRecoveryCard(input: CardIdentity & { code: string; summary: string; details?: string[] }): GenUICard {
  return createIssueCard({ ...input, variant: "recovery", allowedActions: ["continue", "retry"] });
}
