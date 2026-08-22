import type { AgentVersion } from "@/lib/contracts/agents";
import type { SkillId } from "@/lib/contracts/skills";

export const AGENT_SEED_TIMESTAMP = 1_786_752_000_000;
export const AGENT_SEED_ACTOR = "local-admin";

export const defaultManagerInstructions = "Choose exactly one registered specialist tool. Never write data or perform workflow transitions.";

const specialistInstructions = [
  "You are a bounded Kids Booklet specialist.",
  "Author only the requested structured result from the supplied approved context and skill input.",
  "Use the story's actual names, setting, actions, reading age, and continuity constraints; never replace them with generic placeholders.",
  "Keep reader-facing titles and text concise enough to fit their specified booklet page region.",
  "For Story Plan entity changes, use kind 'existing' only with an ID supplied in the input; use kind 'new' with a clientKey and never invent a persistent ID.",
  "For Page Plan drafts, never supply pageId values; the application assigns and preserves them.",
  "For Page Plan work, create professional single-scene comic lettering. Each page lettering array is the exact reading order and may contain title, narration, dialogue, thought, and sound_effect elements. Use dialogue or effects only when they strengthen the supplied beat. Dialogue and thought elements must name a supplied on-page character ID as speakerEntityId. Keep story pages to at most five elements and 45 total words. readerText must equal the lettering texts joined with one space. The input copyMode controls authorship: creative may rewrite the beat into concise age-appropriate comic copy; exact must preserve the supplied reader-facing wording and only classify or split it. Never ask the image model to invent story copy.",
  "For visual direction work, return only the result for the supplied stage. At visual-style return only visual_style. At visual-bible use the already selected style, define only supplied Story Plan entities, preserve their IDs when possible, and do not add incidental props or background subjects. The application owns final entity membership, IDs, reference requirement, and asset lineage.",
  "Do not write workflow state, issue approvals, access tools, or add prose outside the structured result.",
].join(" ");

type SeedSpec = { suffix: string; skillId: SkillId | null; displayName: string; purpose: string; modelId: "gpt-5.6-luna" | "gpt-5.6-terra" | "gpt-5.6-sol" };
const seedSpecs: SeedSpec[] = [
  { suffix: "001", skillId: null, displayName: "Kids Booklet Manager", purpose: "Select one stage-valid registered specialist.", modelId: "gpt-5.6-luna" },
  { suffix: "101", skillId: "intake_readiness@1", displayName: "Intake Readiness Specialist", purpose: "Assess audience-profile readiness.", modelId: "gpt-5.6-terra" },
  { suffix: "102", skillId: "story_planning_revision@1", displayName: "Story Planning Specialist", purpose: "Draft and revise story plans.", modelId: "gpt-5.6-terra" },
  { suffix: "103", skillId: "quality_review_targeted_repair@1", displayName: "Story Quality Specialist", purpose: "Review and repair story-plan quality.", modelId: "gpt-5.6-sol" },
  { suffix: "104", skillId: "visual_direction_reference_planning@1", displayName: "Visual Direction Specialist", purpose: "Plan visual style and canonical references.", modelId: "gpt-5.6-terra" },
  { suffix: "105", skillId: "booklet_specification@1", displayName: "Booklet Specification Specialist", purpose: "Recommend booklet geometry and page count.", modelId: "gpt-5.6-terra" },
  { suffix: "106", skillId: "page_planning_writing@1", displayName: "Page Planning Specialist", purpose: "Create structured page plans and comic lettering.", modelId: "gpt-5.6-terra" },
  { suffix: "107", skillId: "image_prompt_compilation@1", displayName: "Image Prompt Specialist", purpose: "Compile approved constraints into image prompts.", modelId: "gpt-5.6-terra" },
];

const uuid = (kind: string, suffix: string) => `00000000-0000-4000-8000-00000000${kind}${suffix}`;

export const agentSeedDefaults: AgentVersion[] = seedSpecs.map<AgentVersion>((spec) => ({
  id: uuid("b", spec.suffix), agentId: uuid("a", spec.suffix), versionNumber: 1, parentVersionId: null,
  displayName: spec.displayName, purpose: spec.purpose, role: spec.skillId ? "specialist" : "manager", skillId: spec.skillId, imageTarget: null,
  instructions: spec.skillId ? specialistInstructions : defaultManagerInstructions, provider: "openai", modelId: spec.modelId,
  reasoningEffort: spec.skillId ? "medium" : "low", maxTurns: spec.skillId ? 1 : 2, profileId: spec.skillId ? "openai-specialist" : null, profileVersion: spec.skillId ? 1 : null, imageQuality: null, imageResolution: null, status: "confirmed", isActive: true, revision: 1,
  createdAt: new Date(AGENT_SEED_TIMESTAMP).toISOString(), updatedAt: new Date(AGENT_SEED_TIMESTAMP).toISOString(), createdBy: AGENT_SEED_ACTOR, updatedBy: AGENT_SEED_ACTOR,
 })).concat([
  { id: uuid("b", "201"), agentId: uuid("a", "201"), versionNumber: 1, parentVersionId: null, displayName: "Reference Image Agent", purpose: "Generate canonical visual references.", role: "image", skillId: null, imageTarget: "reference", instructions: null, provider: "openai", modelId: "gpt-image-2", reasoningEffort: null, maxTurns: null, profileId: "openai-image", profileVersion: 1, imageQuality: "auto", imageResolution: null, status: "confirmed", isActive: true, revision: 1, createdAt: new Date(AGENT_SEED_TIMESTAMP).toISOString(), updatedAt: new Date(AGENT_SEED_TIMESTAMP).toISOString(), createdBy: AGENT_SEED_ACTOR, updatedBy: AGENT_SEED_ACTOR },
  { id: uuid("b", "202"), agentId: uuid("a", "202"), versionNumber: 1, parentVersionId: null, displayName: "Page Image Agent", purpose: "Generate booklet page illustrations.", role: "image", skillId: null, imageTarget: "page", instructions: null, provider: "openai", modelId: "gpt-image-2", reasoningEffort: null, maxTurns: null, profileId: "openai-image", profileVersion: 1, imageQuality: "auto", imageResolution: null, status: "confirmed", isActive: true, revision: 1, createdAt: new Date(AGENT_SEED_TIMESTAMP).toISOString(), updatedAt: new Date(AGENT_SEED_TIMESTAMP).toISOString(), createdBy: AGENT_SEED_ACTOR, updatedBy: AGENT_SEED_ACTOR },
]);

export const AGENT_SEED_SKILL_IDS = agentSeedDefaults.filter((agent) => agent.skillId !== null).map((agent) => agent.skillId) as SkillId[];
