import { CASES, conceptBriefSchema, parseDraftListProposal, parseNarrativeProposal, roleResultSchema, storyOutlineSchema, validateRoleResult, type DraftCharacterListContent, type DraftLocationListContent, type ExperimentMode, type Persona, type RoleResult } from "@/lib/contracts/experiment-runner";
import type { createExperimentContextService } from "@/lib/experiment-runner/context";

type Context = Awaited<ReturnType<ReturnType<typeof createExperimentContextService>["getOperationContext"]>>;
type Case = keyof typeof CASES;
type Task = "J01" | "J02";
const sourceConstraintPrefix = "Approved concept constraint: ";

type DraftFixtureInput = {
  mode: ExperimentMode;
  persona: Persona;
  brief: string;
  approvedConcept: unknown;
  approvedOutline: unknown;
  currentContent?: unknown;
  answers?: { question: string; answer: string }[];
  revision?: string;
  materialQuestion?: string;
};
type DraftFixtureResult<T> = { kind: "clarification"; question: string } | { kind: "proposal"; content: T; warnings: ReturnType<typeof parseDraftListProposal>["warnings"] };

// Pinned Ali J03/J04 source: 631f547ec3f7ce375f740dd6f2b1b9aaebbde940.
// Adaptations: fixed persona cases, delegated tester approval outside this local
// fixture, and warning-only preferences. Approved J01/J02 remain the sources.
export function simulateDraftListResult(task: "J03", input: DraftFixtureInput): DraftFixtureResult<DraftCharacterListContent>;
export function simulateDraftListResult(task: "J04", input: DraftFixtureInput): DraftFixtureResult<DraftLocationListContent>;
export function simulateDraftListResult(task: "J03" | "J04", input: DraftFixtureInput): DraftFixtureResult<DraftCharacterListContent | DraftLocationListContent> {
  if (input.mode !== "simulated") throw new Error("Draft list fixtures require simulated mode.");
  if (input.brief !== CASES[input.persona].brief) throw new Error("Fixture requires an exact fixed case brief.");
  const concept = conceptBriefSchema.parse(input.approvedConcept);
  const outline = storyOutlineSchema.parse(input.approvedOutline);
  if (concept.sourceInput !== input.brief) throw new Error("Approved concept does not match the fixed case brief.");
  const expectedLocations = input.persona === "professional_creator" ? 2 : 1;
  if (outline.characters.length !== 2 || outline.locations.length !== expectedLocations) throw new Error("Approved outline does not match the fixed case counts.");
  const answers = input.answers ?? [];
  if (input.materialQuestion && !answers.some((item) => item.question === input.materialQuestion && item.answer.trim())) {
    return { kind: "clarification", question: input.materialQuestion };
  }
  const answerNotes = answers.filter((item) => item.answer.trim()).map((item) => `${item.question}: ${item.answer}`);
  if (task === "J03") {
    const current = input.currentContent === undefined ? null : parseDraftListProposal("J03", input.persona, input.currentContent).content;
    const content = {
      schemaVersion: "2" as const, title: current?.title ?? outline.title,
      characters: current?.characters ?? outline.characters.map((item, index) => {
        const entryKey = (`character_${index + 1}` as "character_1" | "character_2");
        return { entryKey, nameOrRole: item.nameOrRole, narrativeFunction: item.narrativeRole,
          role: index === 0 ? "main" as const : "supporting" as const, knownRelationship: item.relationship,
          knownFacts: [], openQuestions: item.openDetails };
      }),
      castNotes: [...(current?.castNotes ?? []), ...answerNotes.filter((note) => !current?.castNotes.includes(note)), ...(input.revision ? [`Revision request: ${input.revision}`] : [])],
      representationAndSafety: current?.representationAndSafety ?? [], manuscriptQuestions: current?.manuscriptQuestions ?? [],
      approvalQuestions: current?.approvalQuestions ?? ["Does this cast reflect the approved story outline?"],
    };
    const parsed = parseDraftListProposal("J03", input.persona, content);
    return { kind: "proposal", ...parsed };
  }
  const current = input.currentContent === undefined ? null : parseDraftListProposal("J04", input.persona, input.currentContent).content;
  const content = {
    schemaVersion: "2" as const, title: current?.title ?? outline.title,
    locations: current?.locations ?? outline.locations.map((item, index) => {
      const entryKey = (`location_${index + 1}` as "location_1" | "location_2");
      return { entryKey, title: item.name, storyPurpose: item.storyPurpose,
        knownFacts: [], likelyScenes: [item.storyPurpose], openQuestions: item.openDetails };
    }),
    worldAndSafetyNotes: [...(current?.worldAndSafetyNotes ?? []), ...answerNotes.filter((note) => !current?.worldAndSafetyNotes.includes(note)), ...(input.revision ? [`Revision request: ${input.revision}`] : [])],
    manuscriptQuestions: current?.manuscriptQuestions ?? [],
    approvalQuestions: current?.approvalQuestions ?? ["Do these places serve the approved story outline?"],
  };
  const parsed = parseDraftListProposal("J04", input.persona, content);
  return { kind: "proposal", ...parsed };
}

const stories = {
  playful_kid: {
    title: "The Kite Rescue", ageBand: "6-8", premise: "A young inventor and a tiny robot rescue a runaway kite in their neighborhood park.", theme: "Helping together makes a hard problem smaller.", promise: "A playful rescue ends with everyone safe and proud.", tone: "Playful and reassuring", scope: "Three single-scene story pages plus a cover, with two recurring characters and one park location.",
    characters: [{ nameOrRole: "Young inventor", narrativeRole: "Invents a safe way to reach the kite", relationship: "Friend and maker of the tiny robot", openDetails: [] }, { nameOrRole: "Tiny robot", narrativeRole: "Spots the kite and helps test the plan", relationship: "Trusted companion of the inventor", openDetails: [] }],
    locations: [{ name: "Neighborhood park", storyPurpose: "The kite escapes and is recovered here", openDetails: [] }],
    arc: ["The inventor and robot fly a kite in the park.", "A gust carries the kite into a tree.", "Their first reach falls short, so they assemble a gentle retrieval tool.", "The inventor listens to the robot's safer route around the tree.", "They recover the kite and fly it together again."],
  },
  enthusiast_parent: {
    title: "The Rainy Room Adventure", ageBand: "3-5", premise: "A child and grandparent turn a rainy afternoon into an indoor adventure.", theme: "Imagination and companionship brighten a quiet day.", promise: "A warm adventure ends in comfort and shared delight.", tone: "Warm and gentle", scope: "Five story pages plus a cover, with two recurring characters, one home location, and one simple two-panel page.",
    characters: [{ nameOrRole: "Child", narrativeRole: "Chooses the adventure's destination", relationship: "Grandchild of the grandparent", openDetails: [] }, { nameOrRole: "Grandparent", narrativeRole: "Helps build and explore a pretend world", relationship: "Grandparent of the child", openDetails: [] }],
    locations: [{ name: "Family living room", storyPurpose: "A safe room becomes the imagined adventure setting", openDetails: [] }],
    arc: ["Rain keeps the child and grandparent inside.", "The child imagines the sofa as a boat.", "They build a blanket sail and encounter a pretend storm.", "The child suggests steering toward a pillow island.", "They arrive, share a snack, and listen to the rain together."],
  },
  professional_creator: {
    title: "The Observatory Lantern", ageBand: "9-12", premise: "Two friends repair a community observatory after a disagreement.", theme: "Trust grows when friends listen and share responsibility.", promise: "An honest repair restores both the observatory and the friendship.", tone: "Reflective and hopeful", scope: "Eight story pages plus a cover, with two recurring characters, two locations, and at least two multi-panel pages.",
    characters: [{ nameOrRole: "First friend", narrativeRole: "Finds the damaged observatory lantern", relationship: "Friend and project partner of the second friend", openDetails: [] }, { nameOrRole: "Second friend", narrativeRole: "Diagnoses the lantern and proposes a repair", relationship: "Friend and project partner of the first friend", openDetails: [] }],
    locations: [{ name: "Community observatory", storyPurpose: "The damaged lantern must be repaired before viewing night", openDetails: [] }, { name: "Workshop", storyPurpose: "The friends test a replacement part and talk through their disagreement", openDetails: [] }],
    arc: ["The friends prepare the observatory for viewing night.", "A disagreement distracts them and the lantern stops working.", "Separate repair attempts fail, and the opening time approaches.", "They acknowledge each other's ideas and combine their plans.", "The lantern works; they welcome neighbors and watch the stars together."],
  },
} as const;

function currentVersion<T extends { id: string; content: unknown }>(artifact: { currentVersionId: string | null; versions: T[] }): T | null {
  return artifact.versions.find((version) => version.id === artifact.currentVersionId) ?? null;
}

export function simulateNarrativeResult(context: Context, mode: ExperimentMode): RoleResult {
  if (mode !== "simulated") throw new Error("Narrative fixtures require simulated mode.");
  if (context.role === "manager") {
    const taskId = context.eligibleRoute;
    if (taskId !== "J01" && taskId !== "J02") throw new Error("Manager has no eligible narrative task.");
    return validateRoleResult("manager", { kind: "delegate", payload: { taskId, subjectKind: "book", subjectId: context.run.bookletId } });
  }
  if (context.role === "tester") {
    const pending = context.pendingDecision as { kind?: string; questionId?: string; taskId?: Task } | null;
    if (pending?.kind === "question") {
      if (!pending.questionId) throw new Error("Pending question has no saved ID.");
      return validateRoleResult("tester", { kind: "decision", payload: { decision: { action: "answer", questionId: pending.questionId, text: "Keep the story age-appropriate, gentle, and faithful to the stated case brief." } } });
    }
    if (pending?.kind === "revision") throw new Error("A pending revision belongs to its specialist.");
    if (pending) throw new Error("Unsupported pending decision.");
    if (context.persona !== "professional_creator" && !context.activeDelegation && context.creatorMessages.length === 0) {
      const subjectId = context.bookletId;
      if (context.currentArtifacts.some((item) => item.subjectKind !== "book" || item.subjectId !== subjectId)) throw new Error("Book subject is inconsistent.");
      return validateRoleResult("tester", { kind: "decision", payload: { decision: { action: "delegate", taskIds: ["J01", "J02"], subjectId } } });
    }
    const concept = context.currentArtifacts.find((item) => item.taskId === "J01");
    const approvedConceptId = concept?.state === "approved" ? concept.currentVersionId : null;
    const current = context.currentArtifacts.flatMap((item) => {
      if (item.state !== "draft") return [];
      const version = currentVersion(item);
      if (!version) throw new Error("Draft has no current version.");
      if (item.taskId === "J02" && (!approvedConceptId || JSON.stringify(version.dependencyVersionIds) !== JSON.stringify([approvedConceptId]))) return [];
      return [version.id];
    });
    if (current.length === 0) throw new Error("No current eligible draft version to review.");
    return validateRoleResult("tester", { kind: "decision", payload: { decision: { action: "approve", versionIds: current } } });
  }
  if (context.role !== "specialist") throw new Error("Unsupported fixture role.");
  if (context.taskId !== "J01" && context.taskId !== "J02") throw new Error("Specialist task is outside the narrative slice.");
  const persona = context.persona as Case;
  const story = stories[persona];
  if (!story || context.brief !== CASES[persona].brief) throw new Error("Fixture requires an exact fixed case brief.");
  const taskId = context.taskId;
  const answerDetails = context.questionAnswers.filter((item) => item.answer && (item.taskId === null || item.taskId === taskId)).map((item) => `${item.question}: ${item.answer}`);
  const previous = context.currentTarget && currentVersion(context.currentTarget);
  const revision = context.matchingRevision as { instruction?: string } | null;
  let content: unknown;
  if (taskId === "J01") {
    const base = previous ? conceptBriefSchema.parse(previous.content) : {
      schemaVersion: "2" as const, title: story.title, sourceInput: context.brief,
      audience: { ageBand: story.ageBand, readingNeeds: `Clear language and pacing for readers ${story.ageBand}.` },
      premise: story.premise, theme: story.theme, emotionalPromise: story.promise, tone: story.tone,
      storyScope: story.scope, contentRequirements: [story.scope], knownConstraints: ["Keep the named cast and locations consistent."], deferredDecisions: ["Character appearance and visual style remain for later planning."], approvalQuestions: ["Does this concept match the intended audience and tone?"],
    };
    content = { ...base, tone: revision?.instruction ? `${base.tone}. Revision request: ${revision.instruction}` : base.tone, knownConstraints: [...base.knownConstraints, ...answerDetails.filter((detail) => !base.knownConstraints.includes(detail))] };
  } else {
    if (!context.approvedUpstream) throw new Error("J02 requires an approved J01 source.");
    const upstream = conceptBriefSchema.parse(context.approvedUpstream.content);
    const base = previous ? storyOutlineSchema.parse(previous.content) : {
      schemaVersion: "2" as const, title: upstream.title, summary: `${upstream.premise} ${story.arc[4]} Tone: ${upstream.tone}.`,
      characters: story.characters.map((item) => ({ ...item })), locations: story.locations.map((item) => ({ ...item })),
      storyArc: { opening: story.arc[0], incitingAction: story.arc[1], escalation: story.arc[2], decisiveChoice: story.arc[3], resolution: story.arc[4] },
      theme: upstream.theme, emotionalArc: upstream.emotionalPromise, deferredDecisions: ["Exact page dialogue and visual design remain for later planning.", ...upstream.knownConstraints.map((item) => `${sourceConstraintPrefix}${item}`)], approvalQuestions: ["Does this causal outline and resolution work for the audience?"],
    };
    const sourceChanged = context.currentTarget?.state === "needs_review";
    const retainedDecisions = sourceChanged ? base.deferredDecisions.filter((item) => !item.startsWith(sourceConstraintPrefix)) : base.deferredDecisions;
    const sourceDecisions = sourceChanged ? upstream.knownConstraints.map((item) => `${sourceConstraintPrefix}${item}`) : [];
    const summary = sourceChanged ? `${upstream.premise} ${base.storyArc.resolution} Tone: ${upstream.tone}.` : base.summary;
    content = {
      ...base,
      title: sourceChanged ? upstream.title : base.title,
      theme: sourceChanged ? upstream.theme : base.theme,
      emotionalArc: sourceChanged ? upstream.emotionalPromise : base.emotionalArc,
      summary: revision?.instruction ? `${summary} Revision request: ${revision.instruction}` : summary,
      deferredDecisions: [...retainedDecisions, ...sourceDecisions, ...answerDetails.filter((detail) => !retainedDecisions.includes(detail) && !sourceDecisions.includes(detail))],
    };
  }
  const parsed = parseNarrativeProposal(taskId, content);
  return validateRoleResult("specialist", roleResultSchema.parse({ kind: "proposal", payload: { taskId, content: parsed.content } }));
}
