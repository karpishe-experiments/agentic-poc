// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CardRegistry } from "@/components/cards/card-registry";
import type { GenUICard } from "@/lib/contracts/cards";

const id = "00000000-0000-4000-8000-000000000101";
const assetId = "00000000-0000-4000-8000-000000000102";
const base = { schemaVersion: "1" as const, cardId: id, status: "active" as const };

const cards = [
  { ...base, family: "question", variant: "free_text", title: "Free text", allowedActions: ["submit"], payload: { prompt: "Tell us more" } },
  { ...base, family: "question", variant: "single_select", title: "One choice", allowedActions: ["select"], payload: { prompt: "Choose one", choices: [{ id: "one", label: "One" }, { id: "two", label: "Two" }] } },
  { ...base, family: "question", variant: "multi_select", title: "Many choices", allowedActions: ["select"], payload: { prompt: "Choose more", choices: [{ id: "one", label: "One" }, { id: "two", label: "Two" }] } },
  { ...base, family: "artifact_review", variant: "summary", title: "Summary review", allowedActions: ["approve_and_continue"], payload: { artifactType: "audience_profile", versionId: null, summary: [{ label: "Age", value: "6–8" }] } },
  { ...base, family: "artifact_review", variant: "editable_form", title: "Editable review", allowedActions: ["approve_and_continue"], payload: { artifactType: "story_plan", versionId: null, fields: [{ key: "title", label: "Title", value: "Moon boat", multiline: false }] } },
  { ...base, family: "artifact_review", variant: "visual_gallery", title: "Gallery review", allowedActions: ["select"], payload: { artifactType: "visual_bible", versionId: null, items: [{ assetId, label: "Watercolor", selected: true }] } },
  { ...base, family: "progress", variant: "artifact_generation", title: "Artifact progress", allowedActions: [], payload: { completed: 1, total: 2 } },
  { ...base, family: "progress", variant: "page_batch", title: "Page progress", allowedActions: [], payload: { completed: 1, total: 3 } },
  { ...base, family: "progress", variant: "export", title: "Export progress", allowedActions: [], payload: { completed: 1, total: 1 } },
  { ...base, family: "issue", variant: "quality", title: "Quality issue", allowedActions: ["retry"], payload: { code: "quality", summary: "Review this", details: [] } },
  { ...base, family: "issue", variant: "generation_failure", title: "Generation issue", allowedActions: ["retry"], payload: { code: "generation", summary: "Try again", details: [] } },
  { ...base, family: "issue", variant: "validation_failure", title: "Validation issue", allowedActions: ["retry"], payload: { code: "validation", summary: "Correct this", details: [] } },
  { ...base, family: "issue", variant: "recovery", title: "Recovery issue", allowedActions: ["continue"], payload: { code: "recovery", summary: "Continue saved work", details: [] } },
] satisfies GenUICard[];

describe("CardRegistry", () => {
  it.each(cards)("renders the finite $family/$variant card", (card) => {
    render(<CardRegistry card={card} submitResponse={async () => {}} />);
    expect(screen.getByRole("heading", { name: card.title })).toBeTruthy();
  });
});
