import { Agent } from "@openai/agents";
import { z } from "zod";
import type { SkillContext } from "@/lib/contracts/skills";
import type { SkillDefinition } from "@/lib/skills/registry";

/**
 * A specialist authors only a validated, transient result. Application services
 * remain the sole owners of persistence, IDs, approvals, and workflow state.
 */
export function createSpecialistAgent(definition: SkillDefinition, input: unknown, context: SkillContext, options: { model?: string; reasoning?: "low" | "medium" | "high" } = {}) {
  void input;
  // The Agents SDK accepts a Zod object as the top-level output type. Wrapping
  // each registered schema also supports the visual-direction discriminated
  // union while preserving the original skill schema for application validation.
  const outputEnvelope = z.object({ result: definition.outputSchema });

  return new Agent({
    name: `Kids Booklet ${definition.id} specialist`,
    instructions: [
      "You are a bounded Kids Booklet specialist.",
      "Author only the requested structured result from the supplied approved context and skill input.",
      "Use the story's actual names, setting, actions, reading age, and continuity constraints; never replace them with generic placeholders.",
      "Keep reader-facing titles and text concise enough to fit their specified booklet page region.",
      "For Story Plan entity changes, use kind 'existing' only with an ID supplied in the input; use kind 'new' with a clientKey and never invent a persistent ID.",
      "For Page Plan drafts, never supply pageId values; the application assigns and preserves them.",
      definition.id === "page_planning_writing@1"
        ? "Create professional single-scene comic lettering. Each page lettering array is the exact reading order and may contain title, narration, dialogue, thought, and sound_effect elements. Use dialogue or effects only when they strengthen the supplied beat. Dialogue and thought elements must name a supplied on-page character ID as speakerEntityId. Keep story pages to at most five elements and 45 total words. readerText must equal the lettering texts joined with one space. The input copyMode controls authorship: creative may rewrite the beat into concise age-appropriate comic copy; exact must preserve the supplied reader-facing wording and only classify or split it. Never ask the image model to invent story copy."
        : "",
      definition.id === "visual_direction_reference_planning@1"
        ? context.stage === "visual_style"
          ? "This is the visual-style stage: return only the visual_style result; do not return a Visual Bible yet."
          : "This is the Visual Bible stage: return only the visual_bible result using the already selected style; do not ask for or return another visual-style choice. Define only the supplied Story Plan entities, preserve their exact IDs when possible, and do not add incidental props or background subjects. The application owns the final entity membership, IDs, reference requirement, and asset lineage."
        : "",
      "Do not write workflow state, issue approvals, access tools, or add prose outside the structured result.",
    ].join(" "),
    model: options.model,
    modelSettings: {
      ...(options.reasoning ? { reasoning: { effort: options.reasoning } } : {}),
    },
    outputType: outputEnvelope,
  });
}
