import { CASES, conceptBriefSchema, parseDraftListProposal, parseNarrativeProposal, parseNarrativeTaskProposal, roleResultSchema, storedDraftCharacterListSchema, storedDraftLocationListSchema, storedManuscriptSchema, storyOutlineSchema, validateRoleResult, type DraftCharacterListContent, type DraftLocationListContent, type ExperimentMode, type Persona, type RoleResult } from "@/lib/contracts/experiment-runner";
import type { createExperimentContextService } from "@/lib/experiment-runner/context";
import { simulateReferenceProposal } from "@/lib/experiment-runner/reference-fixtures";
import { BOOK_TASKS, isNarrativeTask } from "@/lib/experiment-runner/narrative-tasks";
import { simulatePaginationProposal } from "@/lib/experiment-runner/pagination-fixtures";
import { simulatePageBibleProposal } from "@/lib/experiment-runner/page-bible-fixtures";
import { assembledVisualStyleSchema, parseReferenceProposal } from "@/lib/contracts/experiment-references";

type Context = Awaited<ReturnType<ReturnType<typeof createExperimentContextService>["getOperationContext"]>>;
type Case = keyof typeof CASES;
type Task = "J01" | "J02" | "J03" | "J04" | "J05" | "J06" | "J07" | "J08";
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

const manuscriptProse: Record<Case, readonly [string, string, string, string, string]> = {
  playful_kid: [
    "The young inventor lifted a bright kite into the park breeze. The tiny robot rolled beside them, chirping as the kite climbed. For a while, they watched it dance above the grass together.",
    "A sudden gust tugged the string from the inventor's hand. The kite caught high in a tree, beyond either friend's reach. The robot spotted it first and gave a worried beep.",
    "The inventor tried a long stick, but its tip fell short. They stopped before shaking the branch and made a soft hook from the safe things in their bag. Even that tool could not reach from where they stood.",
    "The robot rolled around the trunk and found a clear path to a lower branch. The inventor listened, moved with the robot, and lifted the hook gently. Together they eased the kite free without hurting the tree.",
    "Back on the grass, the inventor checked the kite and smiled at the robot. They held the string together as the breeze lifted it again. The rescue had worked because each friend noticed something the other had missed.",
  ],
  enthusiast_parent: [
    "Rain tapped the living room window all afternoon. The child looked at the gray sky, and the grandparent settled beside them. They decided that staying inside could be the start of an adventure.",
    "The child pointed to the sofa and imagined a boat. The grandparent stepped aboard the rug beside it, and together they named their quiet room a wide sea. The child became the captain.",
    "They draped a blanket over the sofa to make a sail. When the rain grew louder, they pretended a storm had found their boat. The sail slipped, so they held it steady and waited together.",
    "The child saw a pile of pillows across the room and called it an island. The grandparent followed the captain's plan as they steered their pretend boat toward it. Soon the blanket sail rested safely beside the pillows.",
    "On their pillow island, the child and grandparent shared a snack. The rain was still falling, but it sounded gentle now. They sat close, pleased with the world they had made together.",
  ],
  professional_creator: [
    "The two friends opened the community observatory before viewing night. One checked the lantern while the other arranged the tools they would need. They had built this evening together, and both wanted their neighbors to feel welcome.",
    "When the lantern failed, each friend thought they knew the cause. Their disagreement grew sharper as the room darkened. They turned away from each other, and the observatory remained unready.",
    "Each friend tried a separate repair, but neither attempt restored the light. The opening hour drew closer. Looking at their unfinished work, they began to understand that the fault needed both of their ideas.",
    "At the workshop, one friend explained the damaged part while the other described a safer connection. They apologized for talking past each other and tested a replacement together. The lantern glowed steadily in their hands.",
    "They carried the repaired lantern back to the observatory. As neighbors arrived, the friends welcomed them side by side under the new light. Above them, the first stars appeared, and their shared work felt stronger than either plan alone.",
  ],
};

function currentVersion<T extends { id: string; content: unknown }>(artifact: { currentVersionId: string | null; versions: T[] }): T | null {
  return artifact.versions.find((version) => version.id === artifact.currentVersionId) ?? null;
}

type Source = { taskId: Task; id: string; content: unknown };
type LaterContext = Context & { approvedSources?: Source[] };

// Pinned Ali J03–J07 source: 631f547ec3f7ce375f740dd6f2b1b9aaebbde940.
// Fixed-case simulation preserves dependencies and complete canonical content;
// Booklet owns IDs/acceptance, and preferred quality findings remain warnings.
function simulateLaterNarrativeTask(
  context: Context, taskId: Exclude<Task, "J01" | "J02">, persona: Case,
  previous: { content: unknown } | null,
  revision: string | undefined, answerDetails: string[],
): RoleResult {
  const sources = (context as LaterContext).approvedSources ?? [];
  const source = (id: Task) => {
    const row = sources.find((item) => item.taskId === id);
    if (!row) throw new Error(`${taskId} requires approved ${id}.`);
    return row.content;
  };
  const sourceChanged = context.currentTarget?.state === "needs_review";
  const keepCurrent = previous && !sourceChanged;
  const note = [...answerDetails, ...(revision ? [`Revision request: ${revision}`] : [])];
  const addNotes = (existing: string[], additions: string[]) => [...existing, ...additions.filter((item) => !existing.includes(item))];
  let content: unknown;
  if (taskId === "J08") {
    const version = (id: Task) => {
      const row = sources.find((item) => item.taskId === id);
      if (!row) throw new Error(`J08 requires approved ${id}.`);
      return { versionId: row.id, content: row.content };
    };
    const assembled = keepCurrent ? assembledVisualStyleSchema.safeParse(previous.content) : null;
    const priorStyle = assembled?.success ? { ...assembled.data, samplePlan: assembled.data.samples.map(({ sampleKey, purpose }) => ({ sampleKey, purpose })) } : keepCurrent ? previous.content : undefined;
    const result = simulateReferenceProposal("J08", { mode: "simulated", persona,
      brief: context.brief ?? CASES[persona].brief, concept: version("J01"), outline: version("J02"),
      manuscript: version("J05"), finalCharacters: version("J06"), finalLocations: version("J07"),
      currentContent: priorStyle, sourceChanged, revision,
      answers: (context.questionAnswers ?? []).filter((item) => item.answer).map((item) => ({ question: item.question, answer: item.answer! })),
    });
    if (result.kind !== "proposal") throw new Error("Expected style proposal.");
    content = result.content;
  } else if (taskId === "J03" || taskId === "J04") {
    const concept = conceptBriefSchema.parse(source("J01"));
    const outline = storyOutlineSchema.parse(source("J02"));
    const input = {
      mode: "simulated", persona, brief: context.brief ?? CASES[persona].brief, approvedConcept: concept, approvedOutline: outline,
      currentContent: keepCurrent ? previous.content : undefined, answers: (context.questionAnswers ?? []).filter((item) => item.answer).map((item) => ({ question: item.question, answer: item.answer! })),
      revision,
    } as const;
    const list = taskId === "J03" ? simulateDraftListResult("J03", input) : simulateDraftListResult("J04", input);
    if (list.kind !== "proposal") throw new Error("Expected draft list proposal.");
    content = list.content;
  } else if (taskId === "J05") {
    const outline = storyOutlineSchema.parse(source("J02"));
    const cast = storedDraftCharacterListSchema.parse(source("J03"));
    const places = storedDraftLocationListSchema.parse(source("J04"));
    const current = keepCurrent ? storedManuscriptSchema.parse(previous.content) : null;
    const arc = Object.values(outline.storyArc);
    const characterIds = cast.characters.map((item) => item.characterId);
    const firstPlace = (places.locations.find((place) => place.entryKey === "location_1") ?? places.locations[0]).locationId;
    const workshop = places.locations.find((place) => place.entryKey === "location_2")?.locationId;
    content = {
      schemaVersion: "2", title: current?.title ?? outline.title,
      continuityNotes: addNotes(current?.continuityNotes ?? [`${cast.characters[0].nameOrRole} and ${cast.characters[1].nameOrRole} remain the same two story characters throughout.`], note),
      units: current?.units ?? arc.map((beat, index) => ({
        unitKey: `beat_${index + 1}`, beatTitle: ["A shared beginning", "The trouble", "A first attempt", "A better choice", "A shared ending"][index],
        prose: `${beat} ${manuscriptProse[persona][index]}`,
        action: beat, narration: beat, charactersPresent: characterIds,
        locationId: persona === "professional_creator" && index === 3 ? workshop! : firstPlace,
        dialogue: [{ speakerId: characterIds[index % 2], text: index === 4 ? "We did it together!" : index === 3 ? "Let's listen and try together." : "Let's see what we can do." }],
      })),
      expansionNotes: current?.expansionNotes ?? [`The story uses five narrative beats. Physical page count and layout remain later decisions.`],
      openQuestions: current?.openQuestions ?? [],
      approvalQuestions: current?.approvalQuestions ?? ["Does this complete story preserve the approved arc and character relationships?"],
    };
  } else if (taskId === "J06") {
    const cast = storedDraftCharacterListSchema.parse(source("J03"));
    const manuscript = storedManuscriptSchema.parse(source("J05"));
    const current = keepCurrent ? parseNarrativeTaskProposal("J06", persona, previous.content).content : null;
    content = {
      schemaVersion: "2", title: current?.title ?? manuscript.title,
      characters: current?.characters ?? cast.characters.map((character) => {
        const unitIds = manuscript.units.filter((unit) => unit.charactersPresent.includes(character.characterId)).map((unit) => unit.unitId);
        return {
          characterId: character.characterId, nameOrRole: character.nameOrRole, narrativeFunction: character.narrativeFunction,
          background: `${character.nameOrRole} is ${character.knownRelationship.toLowerCase()} in this story.`,
          lifeStage: persona === "enthusiast_parent" && character.entryKey === "character_2" ? "Grandparent" : persona === "playful_kid" && character.entryKey === "character_2" ? "Small companion robot" : persona === "professional_creator" ? "Young community member" : "Child",
          physicalDescription: persona === "playful_kid" && character.entryKey === "character_2" ? "A small, sturdy robot with a friendly face display." : "A recognizable figure with a consistent silhouette and expressive face.",
          personalityAndActing: character.narrativeFunction,
          attireRequirements: [], accessories: [], expressions: ["Curious", "Concerned", "Relieved"],
          openQuestions: character.openQuestions, unitIds, recurrence: unitIds.length > 1 ? "recurring" : "single_scene", sheetRequired: unitIds.length > 1,
        };
      }),
      profileGuidance: addNotes(current?.profileGuidance ?? ["Keep each character recognizable across manuscript units."], note),
      representationAndContinuity: current?.representationAndContinuity ?? ["Preserve the saved character identities and relationships."],
      approvalQuestions: current?.approvalQuestions ?? ["Does this cast cover every manuscript scene?"],
    };
  } else {
    const places = storedDraftLocationListSchema.parse(source("J04"));
    const manuscript = storedManuscriptSchema.parse(source("J05"));
    const current = keepCurrent ? parseNarrativeTaskProposal("J07", persona, previous.content).content : null;
    content = {
      schemaVersion: "2", title: current?.title ?? manuscript.title,
      locations: current?.locations ?? places.locations.map((place) => ({
        locationId: place.locationId, title: place.title, storyPurpose: place.storyPurpose,
        basicDescription: `${place.title} is a recognizable setting for ${place.storyPurpose.toLowerCase()}.`,
        stableAnchors: [place.title], requiredFeatures: place.knownFacts,
        continuityNotes: ["Keep the place recognizable whenever the story returns."], openQuestions: place.openQuestions,
        unitIds: manuscript.units.filter((unit) => unit.locationId === place.locationId).map((unit) => unit.unitId), sheetRequired: true,
      })),
      profileGuidance: addNotes(current?.profileGuidance ?? ["Use stable environmental anchors in every return to a location."], note),
      worldSafetyAndAccessibility: current?.worldSafetyAndAccessibility ?? ["Keep paths and activity suitable for the intended readers."],
      approvalQuestions: current?.approvalQuestions ?? ["Does each location support its manuscript scenes?"],
    };
  }
  const parsed = taskId === "J03" || taskId === "J04" ? parseDraftListProposal(taskId, persona, content) : parseNarrativeTaskProposal(taskId, persona, content);
  return validateRoleResult("specialist", roleResultSchema.parse({ kind: "proposal", payload: { taskId, content: parsed.content } }));
}

export function simulateNarrativeResult(context: Context, mode: ExperimentMode): RoleResult {
  if (mode !== "simulated") throw new Error("Narrative fixtures require simulated mode.");
  if (context.role === "manager") {
    const taskId = context.eligibleRoute;
    if (taskId === "J11") return validateRoleResult("manager", { kind: "delegate", payload: { taskId, subjectKind: "book", subjectId: context.run.bookletId } });
    if (taskId === "J09" || taskId === "J10" || taskId === "J12" || taskId === "J13") {
      if (!context.eligibleTarget || context.eligibleTarget.taskId !== taskId) throw new Error("Manager has no eligible subject.");
      return validateRoleResult("manager", { kind: "delegate", payload: { taskId, subjectKind: context.eligibleTarget.subjectKind, subjectId: context.eligibleTarget.subjectId } });
    }
    if (!taskId || !(BOOK_TASKS as readonly string[]).includes(taskId)) throw new Error("Manager has no eligible narrative task.");
    return validateRoleResult("manager", { kind: "delegate", payload: { taskId, subjectKind: "book", subjectId: context.run.bookletId } });
  }
  if (context.role === "tester") {
    const pending = context.pendingDecision as { kind?: string; questionId?: string; taskId?: Task | "J09" | "J10" } | null;
    if (pending?.kind === "question") {
      if (!pending.questionId) throw new Error("Pending question has no saved ID.");
      return validateRoleResult("tester", { kind: "decision", payload: { decision: { action: "answer", questionId: pending.questionId, text: pending.taskId === "J09" ? "Use Curious, Concerned, and Relieved expressions. Keep the character faithful to approved facts." : "Keep the story age-appropriate, gentle, and faithful to the stated case brief." } } });
    }
    if (pending?.kind === "revision") throw new Error("A pending revision belongs to its specialist.");
    if (pending) throw new Error("Unsupported pending decision.");
    if (context.persona !== "professional_creator" && !context.activeDelegation && context.creatorMessages.length === 0) {
      const subjectId = context.bookletId;
      if (context.currentArtifacts.some((item) => item.subjectKind !== "book" || item.subjectId !== subjectId)) throw new Error("Book subject is inconsistent.");
      const eligibleTaskIds = "eligibleTaskIds" in context && Array.isArray(context.eligibleTaskIds) ? context.eligibleTaskIds : ["J01", "J02"];
      return validateRoleResult("tester", { kind: "decision", payload: { decision: { action: "delegate", taskIds: eligibleTaskIds, subjectId } } });
    }
    const approvedIds = new Set(context.currentArtifacts.filter((item) => item.state === "approved").map((item) => item.currentVersionId));
    const current = context.currentArtifacts.flatMap((item) => {
      if (item.state !== "draft") return [];
      const version = currentVersion(item);
      if (!version) throw new Error("Draft has no current version.");
      const dependencies = version.dependencyVersionIds as string[];
      if (item.taskId === "J08") {
        const style = assembledVisualStyleSchema.safeParse(version.content);
        if (!style.success || version.sourceVersionId !== style.data.draftStyleVersionId ||
            dependencies[0] !== style.data.draftStyleVersionId || dependencies.slice(1).some((id) => !approvedIds.has(id))) return [];
      } else if (item.taskId === "J09" || item.taskId === "J10") {
        try {
          const sheet = parseReferenceProposal(item.taskId, "assembled", version.content).content;
          if (!("build" in sheet) || !("finalListVersionId" in sheet)) return [];
          const subjectId = "characterId" in sheet ? sheet.characterId : sheet.locationId;
          if (subjectId !== item.subjectId || item.subjectKind !== (item.taskId === "J09" ? "character" : "location") ||
              !version.sourceVersionId || dependencies.length !== 3 || dependencies[0] !== version.sourceVersionId ||
              dependencies[1] !== sheet.finalListVersionId || dependencies[2] !== sheet.styleVersionId ||
              dependencies.slice(1).some((id) => !approvedIds.has(id))) return [];
        } catch { return []; }
      } else if (dependencies.some((id) => !approvedIds.has(id))) return [];
      return [version.id];
    });
    if (current.length === 0) throw new Error("No current eligible draft version to review.");
    if (context.persona !== "professional_creator" && context.activeDelegation &&
        context.currentArtifacts.some((item) => ["J08", "J09", "J10", "J13"].includes(item.taskId) && current.includes(item.currentVersionId ?? "") && context.activeDelegation!.taskIds.includes(item.taskId))) {
      return validateRoleResult("tester", { kind: "decision", payload: { decision: { action: "delegate", taskIds: context.activeDelegation.taskIds, subjectId: context.bookletId } } });
    }
    return validateRoleResult("tester", { kind: "decision", payload: { decision: { action: "approve", versionIds: current } } });
  }
  if (context.role !== "specialist") throw new Error("Unsupported fixture role.");
  if (context.taskId === "J12") {
    const previous = context.currentTarget && currentVersion(context.currentTarget);
    const result = simulatePageBibleProposal({ persona: context.persona, pageId: context.subjectId, sources: context.approvedSources,
      currentContent: previous?.content, sourceChanged: context.currentTarget?.state === "needs_review",
      revision: (context.matchingRevision as { instruction?: string } | null)?.instruction,
      answers: context.questionAnswers.filter((item) => item.answer && (item.taskId === null || item.taskId === "J12"))
        .map((item) => `${item.question}: ${item.answer}`) });
    return result.kind === "clarification" ? validateRoleResult("specialist", { kind: "clarification", payload: { question: result.question } }) :
      validateRoleResult("specialist", { kind: "proposal", payload: { taskId: "J12", content: result.content } });
  }
  if (context.taskId === "J09" || context.taskId === "J10") {
    const source = (taskId: string) => {
      const value = context.approvedSources.find((item) => item.taskId === taskId);
      if (!value) throw new Error("Sheet source is missing.");
      return { versionId: value.id, content: value.content };
    };
    const previous = context.currentTarget && currentVersion(context.currentTarget);
    const sourcesChanged = previous && JSON.stringify((previous.dependencyVersionIds as string[]).slice(-2)) !== JSON.stringify(context.approvedSources.map((item) => item.id));
    const input = { mode: "simulated" as const, persona: context.persona, brief: context.brief,
      finalList: source(context.taskId === "J09" ? "J06" : "J07"), style: source("J08"), styleVersionId: source("J08").versionId,
      targetId: context.subjectId, currentContent: previous?.content, sourceChanged: Boolean(sourcesChanged),
      revision: (context.matchingRevision as { instruction?: string } | null)?.instruction,
      answers: context.questionAnswers.filter((item) => item.answer).map((item) => ({ question: item.question, answer: item.answer! })) };
    const result = context.taskId === "J09" ? simulateReferenceProposal("J09", input) : simulateReferenceProposal("J10", input);
    return result.kind === "clarification" ? validateRoleResult("specialist", { kind: "clarification", payload: { question: result.question } }) :
      validateRoleResult("specialist", { kind: "proposal", payload: { taskId: context.taskId, content: result.content } });
  }
  if (context.taskId === "J11") {
    const previous = context.currentTarget && currentVersion(context.currentTarget);
    const revision = context.matchingRevision as { instruction?: string } | null;
    const result = simulatePaginationProposal({ persona: context.persona, sources: context.approvedSources,
      currentContent: previous?.content, sourceChanged: context.currentTarget?.state === "needs_review",
      revision: revision?.instruction,
      answers: context.questionAnswers.filter((item) => item.answer && (item.taskId === null || item.taskId === "J11")).map((item) => `${item.question}: ${item.answer}`),
    });
    return result.kind === "clarification" ? validateRoleResult("specialist", { kind: "clarification", payload: { question: result.question } }) :
      validateRoleResult("specialist", { kind: "proposal", payload: { taskId: "J11", content: result.content } });
  }
  if (!isNarrativeTask(context.taskId)) throw new Error("Specialist task is outside the narrative slice.");
  const persona = context.persona as Case;
  const story = stories[persona];
  if (!story || context.brief !== CASES[persona].brief) throw new Error("Fixture requires an exact fixed case brief.");
  const taskId = context.taskId;
  const answerDetails = context.questionAnswers.filter((item) => item.answer && (item.taskId === null || item.taskId === taskId)).map((item) => `${item.question}: ${item.answer}`);
  const previous = context.currentTarget && currentVersion(context.currentTarget);
  const revision = context.matchingRevision as { instruction?: string } | null;
  if (taskId !== "J01" && taskId !== "J02") return simulateLaterNarrativeTask(context, taskId, persona, previous, revision?.instruction, answerDetails);
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
