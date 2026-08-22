# Parallel Multi-Agent Execution Implementation Plan

**Status:** Proposed — awaiting explicit implementation approval

**Implementation issue:** [#18](https://github.com/karpishe-experiments/agentic-poc/issues/18) — Support parallel multi-agent execution and normalized contracts

**Authoritative PRD:** [parallel-multi-agent-execution-prd.md](parallel-multi-agent-execution-prd.md)

**Implementation tracker:** [roadmap.md](roadmap.md)

**Working branch:** issue-18-parallel-multi-agent-execution

## 1. Authority, outcome, and approval gate

This is the canonical implementation plan for the accepted parallel multi-agent execution PRD. That PRD governs candidate pools, creator selection, execution profiles, durable Agent run cards, and the three-panel agent-management experience. The accepted Kids Booklet and database-backed agent-management PRDs continue to govern every behavior not explicitly superseded. docs/architecture.md remains a current-state guide and must be updated only after behavior is verified.

The outcome is a small extension of the existing monolith:

- one active manager still routes exactly one legal skill;
- one or more active execution agents may serve each text skill and each reference/page image target;
- one durable Agent run card owns selection, progress, results, completion, retry, and restart;
- selected candidates execute concurrently inside one item while application workflow and image-item ordering remain deterministic;
- exact agent/profile versions and normalized evidence remain recoverable after reload or process restart; and
- only the one implicitly or explicitly selected valid result may create a proposal, artifact version, quality outcome, or active image.

This document is planning-only until the user explicitly approves implementation. Before approval, do not edit runtime code, mutate MongoDB data, move the roadmap into In progress, or begin an implementation phase. Plan approval authorizes the primary implementation agent to complete, review, commit, push, and report each verified phase on the working branch. It does not authorize merging, closing Issue #18, changing the PRD, making paid real-provider calls, or expanding scope.

## 2. Planning basis and verified baseline

This plan was prepared against the repository on 2026-08-22 and directly inspected:

- the accepted multi-agent PRD, four-phase roadmap, experiment brief, current architecture, and predecessor accepted PRDs/plans;
- current agent, card, message, image, asset, job, evidence, and artifact contracts;
- MongoDB documents, indexes, setup, deterministic agent initialization, verification, repositories, and transactions;
- ManagerService, ChatService, QualityService, AgentResolver, GenerationService, the in-process job runner, image providers, composition, and filesystem AssetStore;
- the persisted AI SDK UI message/data-card transport, card-response recovery, workspace polling, and current agent admin route/actions/components;
- installed Next.js 16.2.12, React 19.2.8, AI SDK 7.0.47, @ai-sdk/react 4.0.50, OpenAI Agents SDK 0.14.2, MongoDB driver 7.5.0, Zod 4.4.3, Vitest 4.1.10, and Playwright 1.62.1; and
- the installed AI SDK 7 persistence, custom data-part reconciliation, createUIMessageStream, and createUIMessageStreamResponse documentation.

No dependency addition or upgrade is planned. Keep the existing Node.js App Router monolith, MongoDB replica-set transactions, AI SDK UI transport, in-process runner, filesystem assets, fake/real runtime switches, Sharp composition, and pdf-lib export.

Current constraints that drive the change:

- AgentResolver and the active-specialist index currently require exactly one specialist per skill.
- ManagerService currently combines manager routing and one specialist invocation.
- ChatService currently materializes specialist output immediately.
- GenerationService currently invokes one image provider and publishes its successful asset during the item run.
- cards and saved UI-message projections are already updated together when a decision status changes, but there is no general evolving-card projection method.
- generation jobs already provide sequential, restartable item coordination; parallelism is needed only inside the current item.
- the admin page is currently slot-oriented and two-column; its Server Component, Server Actions, lifecycle service, and repository boundaries should be retained.

## 3. Decisions closed by this plan

These decisions are implementation authority unless repository evidence proves an equivalent correction is required. A product-level change must return to the user.

### 3.1 Execution targets and agent roles

Use one closed ExecutionTargetKey union:

- manager, used only by administration and manager resolution;
- skill:<SkillId> for each code-registered text skill;
- image:reference for reference generation or edit; and
- image:page for page generation or edit.

Extend the persisted agent role union from manager | specialist to manager | specialist | image. Keep skillId for specialists and add nullable imageTarget for image agents:

| Role | skillId | imageTarget | Profile |
| --- | --- | --- | --- |
| manager | null | null | none; retains the existing closed manager model configuration |
| specialist | required | null | required specialist profile |
| image | null | reference or page | required image profile |

Derive target keys in code; do not persist a second target string that can drift from role/binding fields. A logical agent still has at most one active version.

### 3.2 Code-registered profiles and settings

Add a closed, versioned execution-profile registry under lib/execution-profiles. A profile definition owns:

- profile ID and integer version;
- executor kind: specialist or image;
- compatible target, operation, and model predicate;
- a Zod settings schema and operator-facing field metadata;
- native input and output Zod schemas;
- canonical-to-native and native-to-canonical adapters;
- a safe capability summary; and
- the executor adapter used by fake and real modes.

Register four production profiles in this PRD:

1. openai-specialist version 1, compatible with every currently registered skill target. Its settings are the existing provider=openai, closed text model ID, reasoning effort, and maxTurns=1. Its canonical schemas come from the selected SkillDefinition.
2. openai-image version 1, compatible with image:reference and image:page for generate and edit. Its closed catalog contains GPT Image 2 (`gpt-image-2`) and its current dated snapshot (`gpt-image-2-2026-04-21`). Settings are provider=openai, modelId, and quality=auto|low|medium|high. The adapter maps canonical geometry to OpenAI-supported pixel sizes and quality to the native control. It never sends the legacy input-fidelity option to GPT Image 2. Keep the existing application limit of eight source images.
3. gemini-image version 1, compatible with both image targets for generate and edit. Its closed catalog contains `gemini-3.1-flash-image` as the fast/general model and `gemini-3-pro-image-preview` as the quality-oriented model. Settings are provider=google, modelId, and resolution=1K|2K|4K; only model-supported resolution/aspect-ratio combinations are selectable. The adapter maps canonical geometry to Gemini aspectRatio, sends imageSize with the required uppercase K, supplies references as inline image parts, requests image-only output, and normalizes the returned inline image bytes. Within the application's eight-reference ceiling, Flash enforces at most four character references; Pro enforces six total references, at most five character references, and at most three style references.
4. flux-image version 1, compatible with both image targets for generate and edit. Its closed catalog contains the fixed `flux-2-pro` endpoint and `flux-2-flex`; preview, max, klein, dev, and legacy FLUX.1 endpoints remain out of scope. Settings are provider=bfl and modelId. The adapter maps canonical geometry to explicit width/height, supplies at most eight references as input_image fields, submits through native fetch, and accepts only an HTTPS polled result URL, then immediately normalizes it into retained image bytes.

Keep existing typed columns as the settings storage instead of adding arbitrary settings JSON:

- provider and modelId remain required;
- reasoningEffort and maxTurns become nullable and are required only for manager/specialist configurations;
- add nullable imageQuality, required only by openai-image, and nullable imageResolution, required only by gemini-image;
- add nullable profileId and profileVersion, required for specialist/image and null for manager.
- instructions becomes nullable: it remains required for manager/specialist and is null for image agents because image wording stays in the application-owned prompt plan/serializer.

The profile registry assembles and parses the settings object from those fields. The admin form renders controls from the profile's code-owned field metadata. No arbitrary keys, JSON editor, schemas, mappings, tools, credentials, temperature, or provider request body are stored.

modelId remains a persisted string at the shared document boundary, but it is never free-form in the admin or runtime: every configuration validates against the selected profile's closed model catalog. Supporting another model is a code/profile catalog change with native-contract fixtures and capability tests.

The implementation uses the existing OpenAI package for OpenAI and native server-side fetch for Gemini and BFL, so no provider SDK dependency is added. `GEMINI_API_KEY` and `BFL_API_KEY` are optional environment-only secrets. Admin capability checks show a non-secret credential-availability warning and block activation/start when the selected real provider key is missing; fake mode exercises every profile without provider keys. Keys, provider request bodies, and signed result URLs never enter agent settings, frozen snapshots, cards, or evidence payloads.

These model IDs and mappings are based on provider documentation reviewed on 2026-08-22: [OpenAI GPT Image 2](https://developers.openai.com/api/docs/models/gpt-image-2), [Gemini image generation](https://ai.google.dev/gemini-api/docs/image-generation), [FLUX.2 overview](https://docs.bfl.ai/flux_2/flux2_overview), [FLUX.2 text-to-image](https://docs.bfl.ai/flux_2/flux2_text_to_image), and [FLUX.2 editing](https://docs.bfl.ai/flux_2/flux2_image_editing). The implementation phase must re-check these code-owned catalogs against the same official sources before enabling real calls; a changed or removed provider contract is a Phase 2 finding, not a reason for silent fallback.

### 3.3 Candidate-pool semantics

AgentRepository.resolveActiveCandidates(targetKey) returns every active, non-retired version bound to the target, after configuration and profile compatibility validation, in deterministic display-name/agent-ID order. Runtime selection uses logical-agent IDs, then resolves their current active versions when the run is submitted.

Normal data must satisfy:

- exactly one active manager;
- at least one active compatible candidate for every registered skill and both image targets;
- at most one active version per logical agent;
- every active candidate has a compatible registered profile; and
- no retired version is active.

Any active but malformed/incompatible row makes that target unavailable instead of being silently omitted. The recoverable error points to /admin/agents. Inactive or retired stale preferences are omitted from a ready card with an explanation.

Candidate activation is additive: activating a specialist/image version deactivates only another active version of the same logical agent. It never replaces a different logical agent in the pool. Manager activation remains an atomic replacement. Direct candidate deactivation is allowed only when another active compatible candidate remains. Retirement keeps its existing inactive-only rule and applies the same last-candidate guard.

### 3.4 Preferences and stale selection

Store selected logical-agent IDs, never version IDs, in one preference per booklet and target. A changed non-empty team is validated and saved in the same transaction that creates the batch. First use of a multi-candidate target has no implicit default. Later use preselects the valid remembered subset.

If a multi-candidate remembered team loses any member, do not offer the collapsed Run shortcut. Expand the refreshed choices, explain each omitted logical agent, and require the creator to submit a valid non-empty replacement team. The sole-candidate shortcut still applies when the current compatible pool itself has exactly one member.

Each ready card carries a candidate-pool fingerprint made from target, active agent IDs, active version IDs, profile IDs/versions, and version revisions. Run submission recomputes it:

- an exact match freezes the selected versions and creates the batch;
- a mismatch returns HTTP 409, updates the same card to a refreshed recoverable ready state, and does not change the preference, workflow, batch, or artifact state.

When exactly one compatible candidate exists, the application bypasses selection and starts it automatically. It does not write a one-agent preference because the pool itself is authoritative; the completed card still records the candidate and implicit selection.

### 3.5 One evolving Agent run card

Add the agent_run card family with one variant and payload state ready | running | results | completed. It is an application-owned projection, not model-authored UI.

The payload contains only display-safe, bounded data:

- card revision, target, subject label, state, and current batch ID;
- candidate summaries and the pool fingerprint while ready;
- selected logical-agent IDs and preference/stale-selection notices;
- per-agent status, elapsed time, attempt/retry count, safe failure, and normalized result summary;
- the selected result and implicit/explicit selection mode;
- prior batch summaries in collapsed history; and
- allowed actions for the current state.

Do not embed image bytes, provider bodies, prompts, full snapshots, or unbounded evidence in cardJson/uiMessageJson. Full text result details are loaded from the validated execution item on demand; image previews use the existing asset response.

Add optional Agent run provenance to ordinary review cards: summary/editable artifact reviews carry a sourceAgentRunCardId, and visual-gallery rows carry their item-level sourceAgentRunCardId. This lets the produced artifact or image row invoke Restart with agents without guessing from conversation order.

Add actions run_agents, select_agent_result, retry_failed_agents, change_agents, and restart_with_agents. Change agents is a local expand/collapse control until Run is submitted. All mutations include responseId and expected card revision for idempotency/concurrency.

Unlike ordinary one-shot cards, Agent run actions do not mark the card submitted on every response. Add a repository operation that transactionally appends the action response, updates the cards row, and replaces the matching data-card part in the saved message projection. The card becomes submitted only after completed. The dedicated restart exception may update a submitted/superseded Agent run card back to active/ready and supersede the current ordinary decision card. There remains only one current workflow decision at a time.

Starting a restart does not alter the current artifact or active image. Because cancellation is out of scope, a creator who deliberately restarts completes that recoverable run by selecting a success or retrying/changing its team.

### 3.6 Batch, item, and retry lifecycle

The ready card exists before a batch. Run submission creates one execution batch and one execution item per selected logical agent.

Batch statuses are queued | running | results | materializing | completed. The card maps queued/running/materializing to running, while results and completed map directly. An all-failed batch remains results with only retry/change actions.

Item statuses are queued | running | succeeded | failed. Each item keeps an append-only attempts array containing attempt number, status, start/end/latency, safe error classification, canonical/native evidence references, and result reference. Retry appends a new attempt and resets only failed items to queued. It never reruns or discards a successful item.

The in-process runner claims queued batches and executes all currently queued items using Promise.allSettled. There is no product-visible or hidden application concurrency cap, no automatic retry, no cancellation, no fallback, and no synthesis. A process-global per-batch promise map prevents duplicate same-process execution. MongoDB conditional updates prevent two runner claims from executing the same queued attempt.

On startup:

- running attempts return to queued with an interrupted classification;
- running/materializing batches are made runnable;
- succeeded/failed attempts and candidate assets remain unchanged; and
- a materializing batch resumes its idempotent materializer.

### 3.7 Result validation, selection, and idempotent materialization

Every candidate call follows:

canonical input parse
→ profile settings parse
→ canonical-to-native adapter
→ native input parse
→ executor
→ native output parse
→ native-to-canonical adapter
→ canonical output parse
→ persisted terminal result

Any failure marks only that item failed and records safe evidence. Invalid native or canonical output never reaches a target materializer.

For images, the batch stores one profile-neutral ImageExecutionInput containing operation, prompt plan/prompt, geometry, references, and edit target. CandidateExecutionService combines that shared intent with the frozen agent settings to construct and validate a distinct canonical ImageRequest for each execution item. Replace the current provider-shaped quality field with a discriminated outputControl union: quality(auto|low|medium|high), resolution(1K|2K|4K), or dimensions(width,height). openai-image emits quality, gemini-image emits resolution, and flux-image emits dimensions; each profile rejects the other variants before native adaptation. ImageRequest/ImageResult therefore remain canonical without forcing heterogeneous candidates to share native settings.

Use these deterministic geometry mappings:

| Canonical geometry | OpenAI GPT Image 2 | Gemini image | FLUX.2 |
| --- | --- | --- | --- |
| square_1_1 | 1536x1536 | 1:1 plus selected resolution | 1536x1536 |
| landscape_5_4 | 1600x1280 | 5:4 plus selected resolution | 1600x1280 |
| portrait_4_5 | 1280x1600 | 4:5 plus selected resolution | 1280x1600 |

The OpenAI dimensions satisfy GPT Image 2's documented flexible-size constraints; Gemini uses its enumerated ratio/resolution controls; FLUX receives numeric dimensions below its 4MP limit. The selected result still passes through Sharp metadata inspection and the existing composition sizing, so provider-reported MIME type or dimensions are never trusted without validation. Expand canonical provider to openai|google|bfl|fake and accepted raster MIME types to image/png|image/jpeg|image/webp; bytes, detected MIME, positive dimensions, provider/model, request ID, usage when available, and safe errors must agree with the success/failure discriminant.

Each code-owned image-model entry also supplies operation/reference limits and a versioned cost calculator. Extend the existing pricing module to calculate estimatedCostUsd from provider usage when returned, otherwise from the validated model, output control/dimensions, and reference count according to the checked-in pricing version. Tests use fixed fixtures and rates; runtime never fetches pricing. Evidence records the pricing version and inputs used, without image bytes or secrets.

The batch freezes:

- canonical input and schema/profile versions;
- exact agent-version and profile snapshots;
- a workflow fingerprint containing the current stage and relevant upstream/current artifact-version IDs; and
- a deterministic materialization key/IDs.

Result selection is accepted only when every item is terminal, the chosen item succeeded, no result was already selected, and the workflow fingerprint is still current. A stale workflow leaves results intact and changes the card to a recoverable restart state without workflow mutation.

Materialization is a durable idempotent command:

1. claim the selection response and set materializationStatus=running;
2. call the closed target-specific materializer;
3. make the materializer return an existing outcome when the same sourceExecutionBatchId was already applied;
4. record selected item, selection mode, produced artifact/version/asset IDs, and completion; and
5. update the Agent run card/message projection and emit the normal next review/decision card.

Add nullable sourceExecutionBatchId with a sparse unique index to text-created artifact_versions and quality_reviews. Multi-item image artifact finalization continues to use its generation job as the aggregate boundary; image provenance stays on generation items and source/composed asset metadata. Stable preallocated IDs and existing exclusive filesystem writes make a resumed materializer return the already-created asset instead of producing duplicates.

This is the minimal crash-safe boundary: do not add an outbox, message broker, workflow engine, or separate attempts collection.

### 3.8 Text routing and materialization

Split ManagerService into two responsibilities without adding another model call:

- route(context, input, preparedManager) performs one manager call, validates one stage-valid skill and canonical skill input, and records manager evidence;
- CandidateExecutionService executes a frozen specialist profile for that routed skill and records candidate evidence.

Before the manager call, resolve the manager and all candidate pools for the stage/operation-eligible skill allowlist in one fresh snapshot. Missing or malformed coverage returns the existing recoverable configuration error before a user message, route, card, artifact, or workflow mutation is persisted. The manager receives legal SkillDefinitions and safe candidate capability summaries, never provider-native request shapes.

After routing, ChatService persists the user turn plus a deterministic narration and Agent run card. It does not run or materialize the specialist. The narration says the saved team will be used and can be changed; it is part of the same existing atomic AI SDK UI message stream and requires no second manager call.

Move the existing output switch into a closed TextResultMaterializer that preserves current behavior:

| Skill | Materialized application outcome |
| --- | --- |
| intake_readiness@1 | next application question or Audience Profile proposal/review |
| story_planning_revision@1 | immutable Story Plan proposal, then a direct quality Agent run |
| quality_review_targeted_repair@1 | quality record and at most the existing one targeted repair, then Story Plan review |
| visual_direction_reference_planning@1 | Visual Style choice or Visual Bible proposal/review |
| booklet_specification@1 | Booklet Specification proposal and geometry confirmation |
| page_planning_writing@1 | Page Plan proposal/review with existing ID materialization |
| image_prompt_compilation@1 | current Final Pages review decision |

The materializer reuses existing entity/page ID assignment, cross-artifact validation, dependency tracking, downstream needs_review, quality limits, card factories, and workflow authority. It does not become a dynamic callback stored in MongoDB.

Direct Story Plan quality is its own skill target and Agent run with no manager call. After a selected Story Plan result is materialized, QualityService builds and starts the direct quality run. A sole quality candidate auto-runs and auto-selects; multiple candidates require creator selection and then one successful quality result. Existing one-repair semantics remain unchanged.

### 3.9 Image sequencing and asset publication

Keep generation_jobs and generation_items as the sequential reference/page coordinator. Do not create a second image workflow.

For the current generation item:

1. GenerationService builds and validates the shared profile-neutral ImageExecutionInput and workflow fingerprint; each candidate later receives its own settings-complete canonical ImageRequest.
2. It creates or restores that item's Agent run card.
3. A sole image candidate auto-starts; multiple candidates use the remembered target team in ready state.
4. Candidate items execute concurrently through their image profiles. A FLUX attempt persists its provider request ID and polling URL immediately after submission and resumes polling that same task after process recovery; the signed result URL is fetched promptly into the AssetStore and is not retained.
5. Each successful native result is validated and written once as an unlinked source asset using existing kind reference or page_source, with batch/item metadata.
6. Multi-candidate results wait for explicit selection; a sole success is selected implicitly.
7. A selected reference source or selected-and-composed page source is recorded as the generation item's sole primary asset.
8. The generation item completes, then the existing sequential runner advances to the next item and creates its ready/automatic Agent run. Existing job finalization aggregates all selected item assets into one normal Visual Bible or Final Pages revision; a one-item selective-regeneration job revises only that item in the existing artifact.

Unselected candidate assets remain retained, unlinked preview/evidence assets. No new asset kind is needed. Image bytes never enter MongoDB. Inside an in-progress job, the selected generation-item asset is authoritative for that item; the active artifact changes only at existing job finalization. A failed/restarted selective-regeneration job therefore continues to expose its prior artifact asset until the replacement job finalizes.

The generation job gains waiting_for_agents and waiting_for_selection observable states derived from its current item/batch. Existing pending/running/paused/failed/succeeded behavior remains for non-candidate failures and export. Item-level team changes update the booklet/target preference and become the next item default. Completed items, current Visual Bible references, current Final Pages, and active assets never change until the replacement selection succeeds.

### 3.10 Admin information architecture

Keep /admin/agents as a dynamic Node.js Server Component with direct service reads and Server Actions for mutations. Do not add an admin REST API.

Desktop/tablet uses three persistent independently scrollable panels:

1. Targets: Manager, all registry-ordered skill targets, Reference images, Page images.
2. Agents: active compatible team first, compatible inactive logical agents next, search, Add agent, and collapsed unavailable/history.
3. Details: selected version summary, editable configuration/draft form, profile settings, validation, read-only capabilities, and collapsed advanced lifecycle/history/schema sections.

The page awaits Next.js 16 searchParams and passes a minimal serializable view model. The client controller keeps target/agent/version/view selection in the URL using router.replace with scroll:false. Search text and disclosure state remain local. Reload restores target, agent, version, and drill-down level; it need not restore a transient search query.

On narrow viewports, render one panel at a time as Targets → Agents → Details. Visible Back controls restore focus to the row/button that opened the next panel. Desktop panel selection also moves focus only after an explicit add/save/navigation action; ordinary background refresh never steals focus.

Use native buttons, checkboxes, labeled inputs, details/summary disclosures, visible focus, text/icon status, role=status or concise aria-live regions, and no forced page/conversation scrolling. Use useDeferredValue only if measured list filtering needs it; the expected small POC list should use a simple memoized filter first.

New agents save as inactive version-1 drafts. Selecting Save while viewing a confirmed version validates the proposed changes and, only when something changed, atomically creates and selects an inactive draft successor. An active confirmed version remains active. Active drafts may edit non-binding fields and compatible profile settings; role/skill/image target cannot change while active.

## 4. Architecture and ownership

The future flow remains application-controlled:

    Creator
      → persisted Agent run card
      → ExecutionService / existing sequential generation job
      → frozen candidate items in parallel
      → registered profile adapters and existing fake/real runtimes
      → normalized terminal results
      → one implicit/explicit selection
      → closed application materializer
      → immutable artifact/quality/asset revision

| Boundary | Owner | New responsibility |
| --- | --- | --- |
| Browser | components/cards, components/workspace | Render/poll one Agent run card, local disclosure/search/preview state, accessible actions. |
| Route handlers | app/api | Validate IDs/actions, return typed envelopes/status; no workflow decisions. |
| Chat/quality/generation | lib/application | Build canonical inputs, route one skill, create/restart runs, choose materializer, enforce workflow fingerprints. |
| Execution service/runner | lib/application, lib/jobs | Freeze batches, claim attempts, execute concurrent candidates, normalize results, recover work. |
| Profile registry | lib/execution-profiles | Code-owned settings/native schemas/adapters/executor compatibility. |
| Skill registry | lib/skills | Unchanged canonical text inputs/outputs, stage legality, deterministic fake implementations. |
| Image provider/composition | lib/images, lib/composition | Execute validated native image requests; compose only the selected page source. |
| Persistence | db | Candidate pools, preferences, batches/items, idempotency/provenance, card projection, evidence integrity. |
| Admin | app/admin/agents, components/admin/agents | Target-centric pool/lifecycle/profile management through existing service/actions. |

Agents and profiles cannot persist data, author UI, choose another agent, activate assets, approve artifacts, or advance stages.

## 5. Contract and persistence specification

### 5.1 New and revised contracts

Add or revise:

- lib/contracts/execution.ts: target keys, preference, batch/item/attempt statuses, frozen snapshots, result summaries, action values, status response.
- lib/contracts/execution-profiles.ts: profile IDs/versions, safe capabilities, settings-field metadata, native-reference envelopes.
- lib/contracts/agents.ts: image role/target, profile binding, nullable role-specific settings, pool coverage, admin snapshot.
- lib/contracts/cards.ts: agent_run card and actions; no maximum candidate count.
- lib/contracts/messages.ts: the existing data-card union automatically includes Agent run; keep workingStatus unchanged.
- lib/contracts/images.ts: keep ImageRequest/ImageResult canonical while adding the discriminated outputControl, provider/MIME unions, and strict success/failure refinements; keep each provider-native schema under its profile implementation.
- lib/contracts/assets.ts: no new kind; validate candidate provenance metadata where read.

All persisted/transported timestamps remain ISO strings in contracts and milliseconds in documents. Server-to-client values remain plain serializable objects.

### 5.2 MongoDB documents

Add three collections.

execution_preferences:

- _id, bookletId, targetKey;
- selectedAgentIdsJson, revision;
- createdAtMs, updatedAtMs.

execution_batches:

- _id, bookletId, cardId, targetKey, subjectKind, subjectId;
- previousBatchId, poolFingerprint;
- status and materializationStatus;
- canonicalInputJson, workflowFingerprintJson, schemaVersion;
- selectedItemId, selectionMode, selectionResponseId;
- producedArtifactVersionId, producedQualityReviewId, producedAssetId;
- queuedAtMs, startedAtMs, terminalAtMs, completedAtMs, updatedAtMs.

execution_items:

- _id, batchId, agentId, agentVersionId, profileId, profileVersion;
- agentSnapshotJson, profileSnapshotJson;
- status, attemptCount, attemptsJson, including internal provider request/poll state needed to resume FLUX without resubmission;
- resultSummaryJson, canonicalResultJson, candidateAssetId, safeErrorJson;
- startedAtMs, finishedAtMs, updatedAtMs.

Extend:

- artifact_versions with nullable sourceExecutionBatchId;
- quality_reviews with nullable sourceExecutionBatchId;
- generation_items with nullable executionCardId/executionBatchId and candidate-waiting status;
- model_calls with executionBatchId, executionItemId, executionTarget, profileId/profileVersion, nativeInputRefJson, and nativeOutputRefJson. Existing inputRefJson/outputRefJson remain canonical request/result references;
- agent_versions with imageTarget, profileId/profileVersion, imageQuality, imageResolution, and nullable reasoning/max-turn fields.

Do not add an execution-attempt collection, profile table, assignment table, target table, agent/team join table, event bus, outbox, or provider-response blob collection.

### 5.3 Required indexes

Add:

- unique execution_preferences(bookletId, targetKey);
- execution_batches(bookletId, targetKey, updatedAtMs desc);
- execution_batches(status, updatedAtMs) for recovery;
- unique execution_items(batchId, agentId);
- execution_items(batchId, status);
- sparse model_calls(executionBatchId, executionItemId);
- sparse unique artifact_versions(sourceExecutionBatchId);
- sparse unique quality_reviews(sourceExecutionBatchId);
- agent_versions(role, skillId, imageTarget, isActive) non-unique lookup;
- existing unique active manager and active logical-agent indexes remain.

Remove only the known legacy agent_versions_active_specialist_unique index. setupMongoStructure may drop it only when its keys, uniqueness, and partial filter exactly match the checked-in legacy definition; an unexpected same-name/same-key index remains a hard error. This is the only destructive structure migration in scope.

### 5.4 Initialization and upgraded databases

db:setup:

- creates the three collections and new indexes;
- performs the exact legacy specialist-index replacement;
- retains the transaction probe and final structural verification;
- is safe on a fresh database and exact repeat.

db:init:

- backfills missing openai-specialist profile ID/version and role-specific null fields on the seven deterministic existing specialist versions;
- leaves the manager's existing model/reasoning/max-turn configuration and stable IDs unchanged;
- seeds stable active confirmed image candidates using suffix 201 for reference and 202 for page, profile openai-image v1, model gpt-image-2, quality auto, the existing fixed seed timestamp/actor, and c/d/e lifecycle events; Gemini and FLUX models are code-registered but do not create extra seeded logical agents;
- runs before exact deterministic seed verification; and
- is safe on exact repeat without rewriting later operator edits.

The image profile, model, quality, and resolution become database-authoritative candidate settings. IMAGE_PROVIDER_MODE continues to choose fake versus real execution. OPENAI_IMAGE_MODEL and OPENAI_IMAGE_QUALITY are removed from runtime selection and then from env/preflight/operator documentation once Phase 2 is verified. Existing default behavior is preserved by the seeded gpt-image-2/auto settings; custom local overrides must be recreated as an agent draft before activation. Add optional GEMINI_API_KEY and BFL_API_KEY parsing and preflight only when a real active/selected agent needs that provider; never require them for fake mode or an OpenAI-only pool.

db:verify validates references, JSON payload schemas, one manager, one-or-more compatible candidates for every target, active logical-agent uniqueness, batch/item/card/asset provenance, selected-item membership, terminal/completed consistency, and model-call batch/item/profile references.

## 6. Service and route contracts

### 6.1 Repository surfaces

Add focused repositories rather than expanding one untyped method:

- ExecutionRepository: preferences, ready-card pool snapshots, batch creation, claims, attempt completion/failure/retry, status projection, selection/materialization state, recovery.
- AgentRepository: resolve manager, resolve candidate pool/versions, additive activate/deactivate, lifecycle mutations with pool guards.
- ConversationRepository: updateAgentRunProjection and appendAgentRunActionResponse, both updating card plus saved message transactionally.
- EvidenceRepository: new optional batch/item/profile/native references.

Keep route handlers and React components free of direct MongoDB access.

### 6.2 Application services

Add:

- ExecutionProfileRegistry for closed profile lookup/compatibility/adapters.
- CandidatePoolService for target resolution, preferences, fingerprints, and ready-card view.
- CandidateExecutionService for one attempt and normalized evidence.
- ExecutionService for batch/action lifecycle, concurrent dispatch, polling view, selection, restart, and recovery.
- TextResultMaterializer for the closed skill-to-existing-application switch.

Refactor, do not duplicate:

- ManagerService to route only.
- ChatService to persist routed Agent run cards and invoke materializers after selection.
- QualityService to create/materialize direct quality runs.
- GenerationService to use ExecutionService inside its current sequential items.
- runner-bootstrap to recover/run both execution batches and generation jobs in one loop.

### 6.3 HTTP and UI transport

Retain:

- POST /api/chat/[bookletId] with createUIMessageStream and createUIMessageStreamResponse;
- POST /api/booklets/[bookletId]/cards/[cardId]/responses for Agent run actions and ordinary cards;
- existing job, retry, continue, asset, and export routes.

Add:

- GET /api/booklets/[bookletId]/agent-runs/[batchId] returning the validated status/detail projection for polling and on-demand text detail.

The card response route dispatches by validated card family. It does not accept arbitrary target/profile data; submitted logical-agent IDs must be present in the current card candidate set and revalidated by CandidatePoolService.

Generalize the existing module-level job status coordinator into a small endpoint-keyed durable-status poller shared by job and Agent run cards. Preserve 5-second running and 15-second non-running intervals, request deduplication, and immediate publication after local actions. Stop polling a terminal completed batch; results remain pollable only while the card is visible and waiting for selection.

### 6.4 Failure envelopes

Use existing typed application/HTTP errors and add:

- execution_pool_stale (409, refreshed card persisted);
- execution_pool_unavailable (503, /admin/agents);
- execution_batch_not_terminal (409);
- execution_result_invalid (409);
- execution_workflow_stale (409, restart required);
- execution_action_conflict (409, reload exact card);
- execution_materialization_failed (recoverable, no duplicate on retry).

Provider/native validation failures are item failures, not route exceptions. Return only safe error classifications/messages to the creator; full prompt/provider bodies remain excluded.

## 7. Exact source areas expected to change

The list is directional, not permission for unrelated refactors.

| Area | Expected files |
| --- | --- |
| Contracts/config | lib/contracts/agents.ts, cards.ts, messages.ts, execution.ts, execution-profiles.ts, images.ts; lib/config/agent-models.ts, new image-models.ts, pricing.ts, env.ts |
| Profiles/executors | new lib/execution-profiles/**; focused changes in lib/agents/openai-specialist-runtime.ts and lib/images/** |
| Persistence | db/documents.ts, indexes.ts, setup.ts, verify.ts, agent-defaults.ts, agent-repository.ts, repositories.ts, client collection typing, init/setup scripts |
| Execution/runtime | new execution/pool/materializer services; manager-service.ts, chat-service.ts, quality-service.ts, agent-resolver.ts, generation-service.ts, runner-bootstrap.ts |
| Cards/workspace | card factories/registry, new AgentRunCard components, workspace conversation, shared status poller, card-response route, new Agent run GET route |
| Admin | app/admin/agents/page.tsx/actions.ts; components/admin/agents/**; model/view tests |
| Tests/fixtures | contracts, repositories, services, generation, card UI, admin UI, runner recovery, agent fixtures, Playwright golden path |
| Docs after verification | roadmap.md, docs/architecture.md, README/operator/user guidance, implementation audit, verified lessons |

Do not modify prototype/**, introduce a second application, replace the existing database/asset/job systems, or broadly restyle unrelated workspace/admin UI.

## 8. Execution protocol and mandatory phase gate

Before the first implementation edit after explicit plan approval:

1. Re-read AGENTS.md, the PRD, this plan, roadmap, architecture, and current Issue #18.
2. Confirm branch issue-18-parallel-multi-agent-execution and a understood working tree; preserve unrelated work.
3. Update Issue #18/project status to In progress and roadmap Phase 1 to In progress.
4. Record the baseline: npm run db:setup, npm run db:init, npm run db:verify, npm run typecheck, npm run lint, npm test, npm run test:agent, npm run build, npm run test:e2e. Classify inherited failures; do not redefine them as acceptable.
5. Use fake providers for implementation checks. Do not make real-provider calls without a separate user approval and cost statement.

Every phase ends with this gate, in order:

1. **Review and fix all outstanding issues.** Perform a defect-first review of the complete phase diff against the PRD, this plan, architecture, repository rules, and applicable skills. Put confirmed issues in the Open Findings Ledger. Fix and retest until no in-scope finding remains; a phase cannot be Verified with an open finding.
2. **Verify the phase.** Run its focused commands plus every broader check affected. Record exact passes, failures, and intentionally omitted checks with direct evidence. A partial suite cannot prove a broader gate.
3. **Update verified documentation.** Update architecture, setup/operator/user guidance, implementation audit, and verified learnings only where behavior or setup now changed. Do not write speculative or chronological reports.
4. **Update the roadmap.** Set the completed phase to Verified with commit/evidence links and set the next phase to In progress only when its work actually begins. roadmap.md remains the single high-level status artifact.
5. **Review and update the next phase plan if needed.** Reconcile discoveries against the next phase's contracts, file list, risks, and tests. Changes may clarify implementation within the PRD; any product/scope change requires user direction. Record material changes in this plan's Decision Log.
6. **Commit and publish.** Run git diff --check and a final docs/code diff inspection, commit one coherent verified checkpoint, and push the branch. Do not describe unverified partial work as a completed phase.
7. **Update Issue #18 with progress.** Through GitHub MCP when available, otherwise gh CLI, post phase, commit SHA, MA coverage, commands/results, evidence paths, resolved findings, documentation/plan changes, known nonblocking limitations, and next phase. Do not close the issue or merge.

The next phase may begin only when the current gate is complete, the findings ledger is empty, the roadmap/evidence is current, the checkpoint commit is pushed, and Issue #18 is updated.

If blocked by a product decision, mark the phase Blocked in roadmap.md with the exact missing decision and preserve completed evidence. Do not invent scope or weaken acceptance to advance.

## 9. Four implementation phases and self-contained slices

### Phase 1 — Foundation and text execution

**Outcome:** Every text skill has a durable candidate pool and one end-to-end Agent run that materializes only a selected valid result.

#### Slice 1.1 — Profiles, targets, migration, and seeded coverage

**Usable result:** A fresh or upgraded database resolves one manager, one-or-more text candidates per skill, and seeded image coverage through registered profiles.

- Add target/profile/agent contracts, the four production profiles, and the closed OpenAI/Gemini/FLUX image-model catalogs.
- Add role-specific validation and immutable profile snapshots.
- Replace the legacy singleton-specialist index with pool lookup indexes.
- Add execution collections/documents/indexes and upgraded-db backfill.
- Seed reference/page image candidates and verify exact-repeat initialization.
- Keep the existing admin page compiling and usable for manager/text inspection; the final three-panel UX waits for Phase 3.

**PRD:** MA-016–MA-018, MA-021, MA-024, MA-025.

**Focused evidence:** contract/profile adapter tests; fresh/repeated/upgraded setup-init-verify tests; additive pool/last-candidate repository tests; deterministic seed inspection.

#### Slice 1.2 — Durable batches, evidence, recovery, and card projection

**Usable result:** A fake candidate batch can be created, run concurrently, restored, retried, selected, and represented by one evolving persisted card without booklet artifact mutation.

- Implement preference, execution, card-projection, evidence repository methods.
- Implement pool fingerprint/stale submission behavior.
- Implement CandidateExecutionService and ExecutionService with concurrent claims/attempts.
- Extend the runner and startup recovery.
- Add Agent run card schema/actions/component/status endpoint/shared poller.
- Prove terminal-only selection, retry-failed-only, all-failed recovery, prior history, and exact reload restoration.

**PRD:** MA-001, MA-003–MA-010, MA-015, MA-015a, MA-020–MA-022.

**Focused evidence:** repository/service concurrency tests with controllable deferred fake candidates; card projection/idempotency/reload tests; component keyboard/aria-live tests.

#### Slice 1.3 — Manager route split and routed text runs

**Usable result:** A material text turn makes one manager routing call, displays the saved team, runs selected agents, and waits for a chosen success.

- Split ManagerService routing from specialist execution.
- Replace complete singleton preflight with eligible pool preflight.
- Persist deterministic manager narration plus ready/automatic Agent run through the existing AI SDK UI stream.
- Update fake and real specialist runtimes to execute through openai-specialist v1.
- Update agent fixtures to assert one manager call plus all explicitly selected candidate calls.

**PRD:** MA-002, MA-006–MA-010, MA-016–MA-020, MA-022.

**Focused evidence:** manager allowlist/profile-summary tests; one/three candidate concurrency fixture; stale pool/no-mutation tests; AI SDK route/message validation tests.

#### Slice 1.4 — Selected-only text materialization and direct quality

**Usable result:** Selecting a normalized text success produces exactly one existing application outcome; sole-agent and direct-quality flows require no redundant decisions.

- Add idempotent TextResultMaterializer and batch provenance.
- Move the existing ChatService result switch behind selection.
- Start direct quality as its own Agent run after Story Plan materialization.
- Preserve one targeted repair, entity/page IDs, artifact dependencies, card follow-ups, and downstream needs_review.
- Add Restart with agents to completed Agent run and its produced artifact.

**PRD:** MA-006, MA-010, MA-011, MA-018–MA-022.

**Focused evidence:** each skill materializer; sole-agent implicit result; multi-result selected-only version; quality partial/all failure; crash-resumed materialization; stale workflow; restart creates one new immutable version.

#### Phase 1 gate

- Existing single-agent fake flow stays green with seeded one-candidate pools.
- A multi-agent text step works from manager route through selected result and normal artifact review.
- Run focused tests plus db setup/init/verify, typecheck, lint, npm test, test:agent, build, and the focused text Playwright scenario.
- Complete the mandatory phase gate in Section 8.

**Suggested checkpoint commit:** feat: add durable parallel text agent runs

### Phase 2 — Image execution

**Outcome:** Every reference/page item runs candidate images in parallel while preserving sequential item order and current assets.

#### Slice 2.1 — Native image profiles and candidate assets

**Usable result:** Image candidates validate canonical/native requests and retain independent unlinked preview assets.

- Re-check the dated official provider contracts recorded in Section 3.2 before enabling real calls.
- Move OpenAI native size/quality mapping behind openai-image v1 and remove legacy GPT Image input-fidelity behavior.
- Add gemini-image v1 using native fetch, aspectRatio/imageSize validation, inline reference inputs, and inline-byte output normalization.
- Add flux-image v1 using native fetch, numeric dimensions, up to eight references, persisted submit/poll recovery, and immediate signed-result retrieval.
- Keep fake/real provider choice through IMAGE_PROVIDER_MODE and provide deterministic fake execution for every profile.
- Execute selected image agents concurrently and store successful source assets with batch/item provenance.
- Prove quality-versus-resolution-versus-dimensions mapping, model-specific invalid combinations, versioned cost calculation, credential availability, and invalid native/canonical output isolation without paid automated calls.

**PRD:** MA-012–MA-014, MA-017–MA-022.

#### Slice 2.2 — Reference-item Agent runs

**Usable result:** Each ordered canonical reference pauses for its own ready/results decision and only the selected reference becomes current.

- Connect reference generation/edit items to ExecutionService.
- Restore remembered reference teams; update the preference on item-level change.
- Auto-select a sole valid success; require explicit multi-success selection.
- Keep failures/retries on the current item and advance only after selection.
- Make final Visual Bible linkage idempotent.

**PRD:** MA-006–MA-015a, MA-020–MA-022.

#### Slice 2.3 — Page-item Agent runs and composition

**Usable result:** Each ordered page uses its own team and only the selected source is composed/activated.

- Connect page generation/edit items to ExecutionService.
- Compose only after selection and preserve current page assets through restarts/failures.
- Retain unrelated/completed pages on item-level team change.
- Preserve existing Final Pages gallery, selective regeneration, and job recovery.

**PRD:** MA-006–MA-015a, MA-020–MA-022.

#### Phase 2 gate

- Multi-agent references and pages complete end to end.
- Every next item uses the latest same-target preference; completed items and prior active assets remain unchanged until selection.
- Run focused profile/image/generation/asset/recovery tests plus affected full checks and image Playwright scenarios.
- Complete the mandatory phase gate in Section 8.

**Suggested checkpoint commit:** feat: add parallel image candidate runs

### Phase 3 — Three-panel agent management

**Outcome:** A local operator safely manages manager replacement and all candidate pools from the target-centric UI.

#### Slice 3.1 — Pool lifecycle and typed profile administration

**Usable result:** Service/actions can create, edit, confirm, additively activate/deactivate, retire, and delete valid versions without breaking target coverage.

- Finish candidate-pool coverage view and mutation simulation.
- Add separate candidate deactivate action and manager replacement wording.
- Enforce compatible profile choices/settings and read-only capabilities.
- Make confirmed Save create an inactive draft successor atomically only when changed.
- Preserve optimistic revision checks, active-draft rules, monotonic history, evidence/child deletion guards, and progressive repair of corrupt coverage.

**PRD:** MA-016, MA-020, MA-023b–MA-025.

#### Slice 3.2 — Desktop Targets / Agents / Details

**Usable result:** Selecting a target updates the active-first searchable agent list; selecting/adding an agent updates persistent details without leaving the page.

- Build the three panels from a minimal server snapshot and pure view-model helpers.
- Add inactive-first creation and separate activation.
- Show warnings and collapsed unavailable/history/lifecycle/schema details.
- Keep schemas/mappings/capabilities read-only.
- Provide independent panel scrolling and no page-scroll jumps.

**PRD:** MA-023–MA-024.

#### Slice 3.3 — Narrow drill-down, focus, and reload

**Usable result:** The same admin tasks work as Targets → Agents → Details on narrow screens and restore after reload.

- Add URL-backed target/agent/version/view selection.
- Add visible Back controls and deterministic focus restoration.
- Verify keyboard controls, labels, focus visibility, live validation/status, and responsive overflow.

**PRD:** MA-023e and accessibility acceptance.

#### Phase 3 gate

- Operators can create and manage multiple active text/image agents without invalid target coverage.
- Manager replacement is atomic; last-candidate removal is rejected; immutable execution snapshots survive later pool edits.
- Run lifecycle/profile/service/component/browser checks plus affected full checks.
- Complete the mandatory phase gate in Section 8.

**Suggested checkpoint commit:** feat: add target-centric agent management

### Phase 4 — Verification and handoff

**Outcome:** Every PRD requirement has direct evidence and no open in-scope defect remains.

#### Slice 4.1 — Data, recovery, evidence, and regression audit

- Prove fresh, exact-repeat, and upgraded setup/init/verify.
- Exercise interrupted batches, attempts, materialization, jobs, stale pools/workflows, all-failed, mixed retry, and reload.
- Reconcile agent/profile snapshots, canonical/native references, provider/model, timing, usage, cost, and failure classification.
- Prove invalid output and unselected output never mutate workflow state.
- Run typecheck, lint, unit/integration, agent fixtures, build, and Playwright.

#### Slice 4.2 — Fake-provider booklet golden path and PDF

- Extend the existing desktop Chromium golden path through at least one multi-agent text step, one reference item, one page item, restart, reload, selected-only activation, approval, and PDF download.
- Keep fake providers and isolated MongoDB/filesystem data.
- Render the generated PDF with the repository PDF workflow and inspect page count/order/geometry/readability.
- Retain screenshots/traces/download under ignored output/playwright paths.

#### Slice 4.3 — Retained-evaluation regression and documentation

- Do not rerun paid evaluations.
- Confirm the existing accepted early-reader, developing-reader, and older-reader manifests/PDFs remain readable and unchanged unless a separately approved defect requires a rerun.
- Update docs/architecture.md, README/operator/user guidance, the implementation audit, roadmap, Issue #18, and evidence-based lessons.
- Complete the requirement-by-requirement audit and final defect-first review.

#### Phase 4 gate

- Every traceability row in Section 11 is Proven with evidence matching its scope.
- All required commands pass, PDF inspection passes, no open finding remains, and docs match verified behavior.
- Complete the mandatory phase gate in Section 8, but do not close Issue #18 or merge without user approval.

**Suggested checkpoint commit:** test: verify parallel multi-agent execution

## 10. Verification design

### 10.1 Test boundaries

- Unit: target/profile/settings/native/canonical schemas, adapters, fingerprints, card/action validation, view models, summaries, cost calculations.
- MongoDB integration: migration/indexes, pools/lifecycle, preferences, concurrent claims, append-only attempts, projection transactions, idempotent materialization, reference integrity.
- Application integration: manager route split, all text materializers, direct quality, image sequence, stale state, asset retention, recovery.
- Component: Agent run and admin keyboard/focus/disclosure/aria-live behavior with fake timers/status.
- Agent fixtures: stage-valid manager route plus N explicitly selected candidate calls; fake output still traverses profile/native/canonical validation.
- Browser: desktop Chromium fake-provider flows; narrow viewport only for admin drill-down acceptance.
- PDF: render the fake golden-path export and visually inspect; no paid provider.

Concurrency tests must use deferred barriers and assert overlapping running windows, not elapsed-time guesses.

### 10.2 Required scenario matrix

| Area | Required scenarios |
| --- | --- |
| Preferences | first-use no selection; non-empty submit; remembered collapsed team; changed preference; stale subset; no valid remainder |
| Pools | additive activation; active logical version replacement; last-candidate deactivate/retire rejection; atomic manager replacement; malformed active profile |
| Batches | all selected queued; overlapping execution; terminal-only selection; one success; mixed outcomes; all failed; retry failed only; restart history |
| Sole candidate | no checkbox or result choice; invalid sole output does not materialize; valid sole output auto-selects |
| Cards | same logical card/revision; saved message projection; exact ready/running/results/completed reload; stale action conflict |
| Text | all seven closed materializers; direct quality; selected-only version; one-repair limit; downstream needs_review |
| Images | reference/page generate and edit; per-item preference; sequential items; multi preview; selected-only compose/link; prior asset retention |
| Profiles | compatible/incompatible targets/operations; closed model IDs; OpenAI size/quality; Gemini ratio/resolution; FLUX dimensions/reference limits/poll recovery; versioned cost; native/canonical invalid output |
| Evidence | immutable snapshots after admin edits; batch/item IDs; canonical/native references; usage/cost/error; no bytes/secrets |
| Admin | target/list/detail selection; ordering/search/add; inactive creation; auto draft; advanced disclosures; URL reload; narrow focus/back |
| Recovery | process interruption while running and materializing; retry action idempotency; stale workflow; missing pool; filesystem asset already written |

### 10.3 Required commands

Use the scripts already present:

- npm run db:setup
- npm run db:init
- npm run db:verify
- npm run typecheck
- npm run lint
- npm test
- npm run test:agent
- npm run build
- npm run test:e2e

Phase-focused Vitest/Playwright invocations may run first, but the phase gate records the affected full commands. Real-provider smoke/eval commands are omitted unless separately approved.

### 10.4 Browser acceptance

The extended golden path must demonstrate:

1. first multi-candidate text target selection with search/checkboxes/cost notice;
2. parallel per-agent progress and terminal-only result selection;
3. selected-only normal artifact review;
4. later collapsed remembered team and Change agents;
5. mixed failure and retry-failed-only in the same card;
6. Restart with agents while the current artifact remains;
7. per-reference and per-page team defaults with selected-only activation;
8. reload in ready, running, results, and completed using controlled persisted fixtures;
9. keyboard result expansion/image preview, visible focus, status text/live announcements, and no forced scroll; and
10. final approval/export/download.

Admin browser coverage separately proves desktop panels and narrow drill-down with reload/focus restoration.

## 11. PRD traceability

| Requirement | Primary phase/slice | Required proof |
| --- | --- | --- |
| MA-001 | 1.2 | One persisted card and exact four-state projection/reload |
| MA-002 | 1.3–1.4 | One manager route, deterministic narration, direct quality without manager |
| MA-003, MA-004, MA-005 | 1.1–1.2 | Complete searchable pool, non-empty first use, remembered/change/stale preference |
| MA-006 | 1.2–1.4, 2 | Sole text/image auto-run and auto-selection |
| MA-007, MA-008, MA-009 | 1.2 | Durable per-agent statuses, real overlap, terminal summaries/details/previews |
| MA-010, MA-011 | 1.2–1.4, 2 | Selected-only materialization, targeted retry, restart/history/current-state retention |
| MA-012, MA-013, MA-014 | 2.1–2.3 | Per-item runs/preferences, sequential items, selected-only active assets |
| MA-015, MA-015a | 1.2, 2, 3 | Keyboard/focus/status/no-scroll and exact persisted restoration |
| MA-016 | 1.1, 3.1 | Singleton manager, target pools, one active version/logical agent |
| MA-017, MA-018, MA-019 | 1.1, 1.3, 2.1 | Registered profiles, typed settings/native adapters, manager canonical-only input |
| MA-020 | 1.2, 1.4, 2 | Frozen snapshots, stale pool/workflow recovery, future-only activation |
| MA-021, MA-022 | 1.1–1.4, 2 | Preference/batch/item/provenance and complete evidence audit |
| MA-023, MA-023a, MA-023b, MA-023c, MA-023d, MA-023e | 3.1–3.3 | Three panels, ordering/search/add/toggles, lifecycle, auto draft, narrow flow |
| MA-024 | 1.1, 3 | Compatible profile selection and read-only schemas/mappings |
| MA-025 | 1.1 | Unchanged text seed identities plus reference/page image seeds |

Phase 4 audits every row against actual test/output evidence. Passing nearby tests or the absence of a reported defect is not sufficient.

## 12. Living progress, findings, and decisions

### 12.1 Phase progress ledger

roadmap.md is the high-level status authority. Mirror evidence here only for implementation detail.

| Phase | Status | Commit | PRD coverage | Evidence |
| --- | --- | --- | --- | --- |
| 1. Foundation and text execution | Not started | — | MA-001–MA-011, MA-015–MA-022, MA-024–MA-025 | — |
| 2. Image execution | Not started | — | MA-006–MA-015a, MA-017–MA-022 | — |
| 3. Agent management | Not started | — | MA-016, MA-020, MA-023–MA-025 | — |
| 4. Verification and handoff | Not started | — | MA-001–MA-025 | — |

Allowed values are Not started, In progress, Blocked, and Verified. Verified requires the full Section 8 gate.

### 12.2 Open findings ledger

| ID | Phase | Severity | Finding | Status/evidence |
| --- | --- | --- | --- | --- |
| — | — | — | No implementation findings; implementation has not started. | — |

Replace the placeholder with confirmed findings during execution. Resolve, verify, and remove each finding into phase evidence. A phase cannot be Verified while a row remains open.

### 12.3 Decision log

| Decision | Rationale | Source |
| --- | --- | --- |
| Extend role with image; derive target key | Represents image candidates without inventing runtime skills or a target assignment table. | PRD §§4–5 |
| Manager is not an execution-profile candidate | Profile executor kinds are specialist/image; manager remains the unique router with existing closed configuration. | MA-016–MA-019 |
| Typed columns, no arbitrary settings JSON | Covers current text/image settings with code-owned schemas and minimal persistence. | MA-017, MA-024; minimal scope |
| Four production profiles, five model choices, and one dated OpenAI snapshot ID | Adds the requested OpenAI/Gemini/FLUX coverage while keeping catalogs and mappings closed and code-owned. | User annotation; MA-017–MA-019 |
| Ready card precedes batch | MA-007 creates a batch only when Run is submitted; avoids empty durable batches. | MA-001, MA-007 |
| Append attempts inside execution item | Retains retries/failures without a fourth collection. | MA-007–MA-010, MA-021 |
| Poll persisted state; no resumable LLM stream | Existing AI SDK data-card transport is atomic; durable runner survives client disconnect/reload. | MA-015a; installed AI SDK 7 docs |
| Idempotent materializers with batch provenance | Closes crash gaps without an outbox/workflow engine. | MA-010–MA-011, MA-020–MA-022 |
| Existing asset kinds remain | Unlinked reference/page_source assets already express inactive candidates; selection controls linkage/composition. | MA-014, MA-021 |
| Existing generation job remains sequence owner | Avoids two competing image workflows; parallelism belongs inside current item. | MA-012, MA-013, MA-014 |
| Database-authoritative image model/quality/resolution | Agent versions/profile snapshots must explain exact execution; environment keeps only provider credentials and the fake/real switch. | MA-017, MA-022, MA-024 |
| URL stores admin selection, not search | Restores meaningful navigation without adding global/account preference or local-storage schema. | MA-023e |
| Native fetch for Gemini/BFL; no new packages or services | The current Node runtime supplies HTTP; one adapter per provider is smaller than adding two SDKs or a generic provider framework. | Minimal scope |

Add only material implementation discoveries. Product decisions must not be silently changed here.

## 13. Risks, controls, and intentional exclusions

| Risk | Required control | Explicitly not added |
| --- | --- | --- |
| Provider overload from selecting all candidates | Clear parallel/cost notice and evidence; execute exactly user selection | UI cap, hidden throttle, auto cancellation |
| Stale pool or workflow mutates state | fingerprints, optimistic revisions, frozen snapshots, selection-time revalidation | silent fallback |
| Crash duplicates an artifact/asset or FLUX submission | stable materialization IDs, sparse unique provenance, recovery replay, persisted FLUX request/poll state | distributed queue/outbox; impossible guarantees across the remote-submit/DB-write gap |
| Invalid or changed provider/model shape reaches workflow | closed model catalogs, official-contract recheck, native and canonical parsing before terminal success | free-form model IDs, best-effort coercion |
| Multiple card actions race | response IDs, card revision, conditional transactions | client-only locks |
| Unselected images become active | unlinked candidate source assets; compose/link only selection | candidate merging |
| Large histories bloat messages | summary-only card projection; details/evidence by ID | bytes/provider bodies in MongoDB |
| Admin creates invalid coverage | code profile compatibility, additive activation, last-candidate guards | arbitrary schema/tool editor |
| Phase scope expands | four fixed phases, mandatory findings/gate/plan review | broad refactor/production hardening |

Deferred: authentication, multi-user coordination, production rate/concurrency controls, distributed workers, admin-managed credentials, providers/models beyond the closed OpenAI/Gemini/FLUX catalog, dashboards, cancellation, synthesis/ranking, global preferences, mobile creator scope, cross-browser acceptance.

## 14. Documentation end state

During implementation, keep:

- roadmap.md as the compact phase/status/evidence tracker;
- this PLAN.md as the canonical decisions, contracts, slices, gates, findings, and traceability source;
- parallel-multi-agent-execution-prd.md stable after this approved provider-catalog and link clarification; later product changes still require user approval;
- docs/architecture.md aligned to verified current boundaries after each material phase;
- README/operator/user guidance aligned to verified setup and controls;
- a requirement-level IMPLEMENTATION-AUDIT.md created/updated in Phase 4; and
- LESSONS-LEARNED.md updated only through the capture-project-learnings workflow when verified reusable knowledge exists.

Do not create a second plan, a chronological implementation diary, or speculative postmortem.

## 15. Completion audit and change control

The implementation is complete only when:

- [ ] Every MA-001–MA-025 traceability row has scope-matched evidence.
- [ ] All four roadmap phases are Verified with pushed checkpoint commits and Issue #18 updates.
- [ ] The Open Findings Ledger is empty after final defect-first review.
- [ ] Fresh, repeated, and upgraded MongoDB setup/init/verify pass.
- [ ] Typecheck, lint, unit/integration tests, agent fixtures, build, and Playwright pass.
- [ ] Fake text, reference, and page multi-agent paths prove actual overlap and selected-only materialization.
- [ ] Ready/running/results/completed, retry, restart, history, and reload are proven.
- [ ] Sole-agent text/image paths add no redundant creator decision.
- [ ] Profile/native/canonical validation and immutable evidence reconcile.
- [ ] Invalid/unselected outputs never mutate artifacts, quality state, jobs, or active assets.
- [ ] Three-panel desktop and narrow admin acceptance pass.
- [ ] The generated fake-provider PDF is rendered and visually inspected.
- [ ] Existing retained evaluation artifacts are unchanged or any approved change is explicitly evidenced.
- [ ] Architecture, roadmap, operator/user guidance, audit, learnings, and Issue #18 match verified behavior.

Passing a subset of tests or completing the code without the phase gates does not satisfy this plan.

Plan approval permits implementation within these decisions. Ask the user before changing product behavior, adding excluded scope/dependencies/services, making paid provider calls, overwriting retained evaluations, merging, or closing Issue #18. Equivalent code/file adjustments discovered during implementation may be recorded in the Decision Log and next-phase plan review when they preserve the PRD and minimal architecture.
