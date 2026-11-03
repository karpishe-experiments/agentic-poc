// New-profile report evidence only. The caller first applies the historical
// current-version projection; this removes generation instructions, not words
// that belong to the approved story, design or Page Bible.
type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Real report evidence must be an object.");
  return value as RecordValue;
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("Real report evidence must be an array.");
  return value;
}
function pick(value: RecordValue, keys: string[]) {
  return Object.fromEntries(keys.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]]));
}

function creativeContent(task: unknown, raw: unknown): unknown {
  const content = record(raw);
  if (task === "J08") return {
    ...pick(content, ["schemaVersion", "title", "styleDefinition", "typographyDirection", "speechAndThoughtBubbleDirection",
      "stylePromptModule", "exclusions", "approvalQuestions", "draftStyleVersionId"]),
    samples: list(content.samples).map(rawSample => {
      const sample = record(rawSample);
      return { ...pick(sample, ["sampleKey", "purpose"]), build: pick(record(sample.build), ["assetId", "sourceVersionIds"]) };
    }),
  };
  if (task === "J09" || task === "J10") return {
    ...pick(content, ["schemaVersion", "title", "finalListVersionId", "styleVersionId", "reviewQuestions",
      "characterId", "characterDesignProfile", "attireRequirements", "accessories", "requiredViews", "additionalExpressions",
      "locationId", "locationDefinitionProfile", "stableAnchors", "requiredFeatures", "overview", "supportingViews"]),
    build: pick(record(content.build), ["assetId", "sourceVersionIds"]),
  };
  if (task === "J13") return pick(content, ["schemaVersion", "pageId", "pageIndex", "pageBibleVersionId", "assetId",
    "runId", "operationId", "workflowRunId", "publishedWorkflowId", "parentWorkflowRunId", "inputFingerprint",
    "output", "sourceVersionIds", "candidateLineage", "attachments", "warnings"]);
  // J01-J07, J11 and J12 retain every approved creative field verbatim.
  return raw;
}

export function projectRealReportContext(raw: RecordValue): RecordValue {
  const currentArtifacts = list(raw.currentArtifacts).map(rawArtifact => {
    const artifact = record(rawArtifact);
    const versions = list(artifact.versions).map(rawVersion => {
      const version = record(rawVersion);
      if (version.id !== artifact.currentVersionId) throw new Error("Real report projection requires current versions only.");
      return { ...version, content: creativeContent(artifact.taskId, version.content) };
    });
    if (versions.length !== 1) throw new Error("Real report projection requires one current version.");
    return { ...artifact, versions };
  });
  return { ...raw, currentArtifacts, reportContextVersion: "real_report_context_v2",
    evidenceScope: { ...record(raw.evidenceScope),
      images: "Original current final images are supplied in manifest order. Reference-sheet pixels and historical images are not supplied.",
      lettering: "Required visible text is the exact current approved J12 panel lettering, including noText. Manuscript routing does not independently require additional cover dialogue or narration.",
      generation: "Generation prompts and duplicate sheet style modules are omitted; approved creative facts, source identities and original final images remain evidence.",
    } };
}
