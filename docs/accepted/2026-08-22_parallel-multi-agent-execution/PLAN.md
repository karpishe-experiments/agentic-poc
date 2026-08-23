# Parallel Multi-Agent Execution Implementation Plan

**Status:** Verified — implementation checkpoint published 2026-08-22

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
3. gemini-image version 1, compatible with both image targets for generate and edit. Its closed catalog contains `gemini-3.1-flash-image` as the fast/general model and the stable `gemini-3-pro-image` as the quality-oriented model. The former preview alias `gemini-3-pro-image-preview` is rejected by the closed catalog. Settings are provider=google, modelId, and resolution=1K|2K|4K; only model-supported resolution/aspect-ratio combinations are selectable. The adapter maps canonical geometry to `response_format.aspect_ratio`, sends the selected resolution as `response_format.image_size` with the required uppercase K, supplies references as ordered `input` image objects, requests image-only output, and normalizes the returned model-output image bytes. Within the application's eight-reference ceiling, Flash enforces at most four character references; Pro enforces six total references, at most five character references, and at most three style references.
4. flux-image version 1, compatible with both image targets for generate and edit. Its closed catalog contains the fixed `flux-2-pro` endpoint and `flux-2-flex`; preview, max, klein, dev, and legacy FLUX.1 endpoints remain out of scope. Settings are provider=bfl and modelId. The adapter maps canonical geometry to explicit width/height and models at most eight ordered references as native `input_image` URL fields. Fake mode validates generate/edit mapping and normalization. In real mode, native fetch is enabled only when the canonical request has no image references or edit target; accepted HTTPS polled results are immediately normalized into retained image bytes.

The gemini-image v1 native wire contract is fixed to `POST https://generativelanguage.googleapis.com/v1beta/interactions`, with `Content-Type: application/json` and the environment-only key in `x-goog-api-key`. The strict request body is:

```json
{
  "model": "<closed modelId>",
  "input": [
    { "type": "text", "text": "<serialized prompt>" },
    { "type": "image", "mime_type": "<accepted source MIME>", "data": "<base64 bytes>" }
  ],
  "response_format": {
    "type": "image",
    "mime_type": "image/png",
    "aspect_ratio": "<closed canonical mapping>",
    "image_size": "<1K|2K|4K>"
  },
  "store": false
}
```

The `input` array contains the prompt first and zero or more deduplicated canonical references in their frozen order. The native input schema rejects unexpected keys, including camelCase `aspectRatio`/`imageSize`, legacy `generationConfig`, tools, and interaction chaining. The response must be a completed Interaction with `object="interaction"`, the requested closed `model`, and `steps`; the adapter walks documented step/content variants and normalizes the last `type="image"` content block from a `type="model_output"` step, matching the documented SDK `output_image` convenience semantics. That image requires non-empty base64 `data` and an accepted `mime_type`; no output image, nonterminal status, mismatched model, malformed base64, or text-only output fails the item before asset creation. Native fetch does not expect or read the SDK-only top-level `output_image` property. Exact serialized-request fixtures cover both closed models, every supported geometry/resolution mapping, and zero/ordered-reference inputs; exact response fixtures cover single- and multi-step completed Interactions, last-image selection, and each rejection case without a paid call.

BFL documents FLUX.2 image inputs as provider-retrievable URLs, while this POC's AssetStore is filesystem-local. This plan therefore does not add a public asset route, tunnel, upload service, or signing configuration. CandidateExecutionService still validates MIME type, byte/pixel limits, reference count, deduplication, and deterministic ordering (edit target first, then canonical references) and proves `input_image` through `input_image_8` mapping with fake native fixtures. Before any real provider submission, a FLUX request containing a reference or edit target is runtime-ineligible with a safe explanation; no provider call or workflow mutation occurs. Enabling real FLUX image-input execution requires a separately approved public-delivery design and plan update. Native evidence stores only asset IDs, roles, hashes, and dimensions; local paths and fixture URLs are never persisted or logged.

Keep existing typed columns as the settings storage instead of adding arbitrary settings JSON:

- provider and modelId remain required;
- reasoningEffort and maxTurns become nullable and are required only for manager/specialist configurations;
- add nullable imageQuality, required only by openai-image, and nullable imageResolution, required only by gemini-image;
- add nullable profileId and profileVersion, required for specialist/image and null for manager.
- instructions becomes nullable: it remains required for manager/specialist and is null for image agents because image wording stays in the application-owned prompt plan/serializer.

The profile registry assembles and parses the settings object from those fields. The admin form renders controls from the profile's code-owned field metadata. No arbitrary keys, JSON editor, schemas, mappings, tools, credentials, temperature, or provider request body are stored.

modelId remains a persisted string at the shared document boundary, but it is never free-form in the admin or runtime: every configuration validates against the selected profile's closed model catalog. Supporting another model is a code/profile catalog change with native-contract fixtures and capability tests.

The implementation uses the existing OpenAI package for OpenAI and native server-side fetch for Gemini and BFL, so no provider SDK dependency is added. `GEMINI_API_KEY` and `BFL_API_KEY` are optional environment-only secrets. Admin capability checks show a non-secret credential-availability warning and block activation/start when the selected real provider key is missing; real FLUX requests with any image input are additionally blocked by the fixed local-capability gate above. Fake mode exercises every profile without provider keys. Keys, provider request bodies, local asset paths, and signed provider result URLs never enter agent settings, frozen snapshots, cards, or evidence payloads.

These model IDs and mappings are based on provider documentation reviewed on 2026-08-22: [OpenAI GPT Image 2](https://developers.openai.com/api/docs/models/gpt-image-2), [Gemini image generation](https://ai.google.dev/gemini-api/docs/image-generation), the [Gemini Interactions API reference](https://ai.google.dev/api/interactions-api), the [stable Gemini 3 Pro Image model reference](https://ai.google.dev/gemini-api/docs/models/gemini-3-pro-image), [FLUX.2 overview](https://docs.bfl.ai/flux_2/flux2_overview), [FLUX.2 text-to-image](https://docs.bfl.ai/flux_2/flux2_text_to_image), and [FLUX.2 editing](https://docs.bfl.ai/flux_2/flux2_image_editing). The implementation phase must re-check these code-owned catalogs and exact native contracts against the same official sources before enabling real calls; a changed or removed provider contract is a Phase 2 finding, not a reason for silent fallback.

### 3.3 Candidate-pool semantics

AgentRepository.resolveActiveCandidates(targetKey) returns every active, non-retired version bound to the target, after configuration and profile compatibility validation, in deterministic display-name/agent-ID order. Runtime selection uses logical-agent IDs, then resolves their current active versions when the run is submitted.

Normal data must satisfy:

- exactly one active manager;
- at least one active compatible candidate for every registered skill and both image targets;
- at most one active version per logical agent;
- every active candidate has a compatible registered profile; and
- no retired version is active.

Any active but malformed/incompatible persisted configuration makes that target unavailable instead of being silently omitted. The recoverable error points to /admin/agents. Runtime availability is handled separately: in real image mode, a candidate whose required environment credential is missing, or a FLUX candidate whose request contains a reference/edit target unsupported by the local-only AssetStore, is ineligible for that card and is omitted with a safe explanation; the target is unavailable only when no eligible candidate remains. Inactive, retired, or runtime-ineligible stale preferences are omitted from a ready card with an explanation.

Candidate activation is additive: activating a specialist/image version deactivates only another active version of the same logical agent. It never replaces a different logical agent in the pool. Manager activation remains an atomic replacement. Direct candidate deactivation is allowed only when another active compatible candidate remains. Retirement keeps its existing inactive-only rule and applies the same last-candidate guard.

### 3.4 Preferences and stale selection

Store selected logical-agent IDs, never version IDs, in one preference per booklet and target. A changed non-empty team is validated and saved in the same transaction that creates the batch. First use of a multi-candidate target has no implicit default. Later use preselects the valid remembered subset.

If a multi-candidate remembered team loses any member, do not offer the collapsed Run shortcut. Expand the refreshed choices, explain each omitted logical agent, and require the creator to submit a valid non-empty replacement team. The sole-candidate shortcut still applies when the current compatible pool itself has exactly one member.

Each ready card carries a candidate-pool fingerprint made from target, runtime mode, active agent IDs, active version IDs, profile IDs/versions, version revisions, and each candidate's non-secret eligibility state. Run submission first rebuilds the pool and credential/operation eligibility, including the fixed real-FLUX image-input gate, then recomputes the fingerprint before opening the preference/batch transaction:

- an exact match validates the private ready input, freezes the selected versions, replaces the preference when changed, and creates the batch in one transaction;
- a pool, runtime-mode, credential-availability, or operation-eligibility mismatch returns HTTP 409, updates the same card to a refreshed recoverable ready state, and does not change the preference, workflow, batch, or artifact state; and
- if no eligible candidate remains, the same preflight returns the recoverable configuration issue without creating a response claim or any workflow/execution row.

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

Persist the validated pre-run input privately on the authoritative card row, outside cardJson/uiMessageJson: readyInputJson, readyInputSchemaVersion, readyWorkflowFingerprintJson, and nullable readyPreviousBatchId. Manager routing, direct quality, or GenerationService writes those fields in the same transaction that creates/refreshes the ready card. Run submission parses them, verifies that the workflow fingerprint is still current, copies the input/fingerprint/schema version into the new batch, and clears the ready-only fields in the same transaction. Thus a multi-candidate ready card can reload and run without another manager call or conversation reconstruction. Do not add a fourth collection for this transient ready state.

Add optional Agent run provenance to ordinary review cards: summary/editable artifact reviews carry a sourceAgentRunCardId, and visual-gallery rows carry their item-level sourceAgentRunCardId. This lets the produced artifact or image row invoke Restart with agents without guessing from conversation order.

Add actions run_agents, select_agent_result, retry_failed_agents, change_agents, and restart_with_agents. In `ready`, Change agents is a local expand/collapse control until Run is submitted. In `results`, `change_agents` is a persisted change-and-rerun transition available only after the current batch is terminal and before any result is selected or materialized. All mutations include responseId and expected card revision for idempotency/concurrency.

For a results-state change-and-rerun, one transaction validates the card/batch relationship, terminal batch, current workflow fingerprint, no prior selection/materialization, response ID, and expected card revision; copies the batch's canonical input and schema version back into the card's private ready fields; recomputes the current workflow and candidate-pool fingerprints; stores the source batch ID in `readyPreviousBatchId`; moves the same card to `ready` with that batch retained in collapsed history; appends the action response; and updates the saved UI-message projection. It does not create a batch, replace the preference, or mutate workflow/artifact/asset state. The next `run_agents` submission validates the refreshed pool, persists the newly submitted team preference, creates the replacement batch with `previousBatchId=readyPreviousBatchId`, and clears all ready-only fields atomically. A stale workflow returns `execution_workflow_stale` without changing the card, preference, batch, or workflow.

Unlike ordinary one-shot cards, Agent run actions do not mark the card submitted on every response. Add a repository operation that transactionally appends the action response, updates the cards row, and replaces the matching data-card part in the saved message projection. The card becomes submitted only after completed. The dedicated restart exception may update a submitted/superseded Agent run card back to active/ready and supersede the current ordinary decision card. There remains only one current workflow decision at a time.

Starting a restart does not alter the current artifact or active image. Restart clones the source batch's canonical input and schema version so different agents receive the same task. It is an explicit revision command, not a new manager route, so normal current-stage routing eligibility is not reapplied. Before changing any card, ExecutionService instead verifies that the source batch target and subject match the provenance action, the source result still produces the current artifact version or active image for that subject, every recorded upstream dependency/version and referenced asset still exists and is current, and the closed target materializer still permits that revision. It then computes a fresh workflow fingerprint, writes the cloned input as the card's private ready input, records `readyPreviousBatchId`, and only then supersedes the current ordinary decision. When Run creates the replacement batch, `readyPreviousBatchId` becomes `previousBatchId` and is cleared with the other ready-only fields. If any check fails, execution_restart_stale returns a recoverable action to use the current workflow and leaves cards, artifacts, preferences, and batches unchanged. Because cancellation is out of scope, a creator whose restart reaches ready completes that recoverable run by selecting a success or retrying/changing its team.

### 3.6 Batch, item, and retry lifecycle

The ready card and its server-only validated ready input exist before a batch. Run submission atomically copies that input into one execution batch and creates one execution item per selected logical agent.

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
- `resultChoicePolicy: implicit_sole | explicit`, derived from the eligible pool rather than terminal success count;
- a workflow fingerprint containing the current stage and relevant upstream/current artifact-version IDs; and
- a deterministic materialization key/IDs.

Result selection is accepted only when every item is terminal, the chosen item succeeded, no result was already selected, and the workflow fingerprint is still current. Implicit selection is permitted only when the batch's frozen `resultChoicePolicy` is `implicit_sole`, which Run may set only when the eligible pool itself contains exactly one compatible candidate and the batch contains that one item. Every batch created from a multi-candidate eligible pool freezes `resultChoicePolicy=explicit`, even if the creator selects only one agent. A multi-item batch never becomes implicit merely because only one succeeds; it remains in `results` so the creator may select that success, retry failed agents, or change agents and rerun. A stale workflow leaves results intact and changes the card to a recoverable restart state without workflow mutation.

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
6. Only a batch frozen with `resultChoicePolicy=implicit_sole` implicitly selects its valid success. Every batch originating from a multi-candidate eligible pool waits for explicit selection, even when one agent was selected or exactly one item succeeds; mixed outcomes remain in `results` with select-success, retry-failed, and change-and-rerun actions.
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
- lib/contracts/cards.ts: agent_run card and actions; no maximum candidate count; keep private ready-input fields out of the public card schema.
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
- resultChoicePolicy (`implicit_sole` or `explicit`);
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

- cards with nullable server-only readyInputJson, readyInputSchemaVersion, readyWorkflowFingerprintJson, and readyPreviousBatchId fields that are never copied into cardJson/uiMessageJson;
- artifact_versions with nullable sourceExecutionBatchId;
- quality_reviews with nullable sourceExecutionBatchId;
- generation_items with nullable executionCardId/executionBatchId and candidate-waiting status;
- model_calls with executionBatchId, executionItemId, executionTarget, profileId/profileVersion, nativeInputRefJson, and nativeOutputRefJson. Existing inputRefJson/outputRefJson remain canonical request/result references;
- agent_versions with imageTarget, profileId/profileVersion, imageQuality, imageResolution, and nullable reasoning/max-turn fields.

Do not add an execution-ready-input or execution-attempt collection, profile table, assignment table, target table, agent/team join table, event bus, outbox, or provider-response blob collection.

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

db:reset:

- creates the three collections and new indexes;
- performs the exact legacy specialist-index replacement;
- retains the transaction probe and final structural verification;
- is safe on a fresh database and exact repeat.

db:reset:

- backfills missing openai-specialist profile ID/version and role-specific null fields on the seven deterministic existing specialist versions;
- leaves the manager's existing model/reasoning/max-turn configuration and stable IDs unchanged;
- seeds stable active confirmed image candidates using suffix 201 for reference and 202 for page, profile openai-image v1, model gpt-image-2, quality auto, the existing fixed seed timestamp/actor, and c/d/e lifecycle events; Gemini and FLUX models are code-registered but do not create extra seeded logical agents;
- runs before exact deterministic seed verification; and
- is safe on exact repeat without rewriting later operator edits.

The image profile, model, quality, and resolution become database-authoritative candidate settings. IMAGE_PROVIDER_MODE continues to choose fake versus real execution. global image model and quality settings are removed from runtime selection and then from env/preflight/operator documentation once Phase 2 is verified. Existing default behavior is preserved by the seeded gpt-image-2/auto settings; custom local overrides must be recreated as an agent draft before activation. Add optional GEMINI_API_KEY and BFL_API_KEY parsing and preflight only when a real active/selected agent needs that provider; never require them for fake mode or an OpenAI-only pool.

db:verify validates references, JSON payload schemas, one manager, one-or-more compatible candidates for every target, active logical-agent uniqueness, private ready-input field/state consistency and absence from public card/message JSON, rerun/restart/previous-batch provenance, batch/item/card/asset provenance, selected-item membership, terminal/completed consistency, and model-call batch/item/profile references.

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
- CandidatePoolService for target resolution, runtime eligibility, preferences, availability-aware fingerprints, and ready-card view.
- CandidateExecutionService for one attempt and normalized evidence.
- ExecutionService for private ready-input lifecycle, atomic batch creation, concurrent dispatch, polling view, selection, results rerun, completed restart provenance/currentness, and recovery.
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
- execution_workflow_stale (409, ready input or result no longer matches current workflow);
- execution_restart_stale (409, source result/dependencies are no longer current);
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

### 8.1 Terra session operating model

Treat one implementation session as one bounded vertical slice. A session may complete a small prerequisite repair discovered inside that slice, but it must not begin the next slice, combine unrelated cleanup, or reopen a settled product decision. Resume from the last verified evidence, this plan's ledgers, and the current diff instead of repeating broad repository discovery.

Every session starts with this preflight:

1. Inspect `git status`, the current slice diff, and the last verified checkpoint; preserve unrelated work.
2. Re-read the exact PRD requirements, slice packet, applicable contract checklist, and recorded findings/decisions—not the entire project history.
3. Inspect the existing contracts, repositories/services, UI projection, and focused tests named by the slice packet before editing. Confirm the prerequisite slice evidence still exists.
4. State the slice boundary, expected usable outcome, invariants, and smallest focused proof. If the current source contradicts the packet materially, stop and classify the conflict before coding.
5. Use fake providers and isolated test data. Never make a paid provider call, mutate retained evaluation data, or perform a destructive operation without the approval required below.

Within a session, work contract-first in this order when applicable: contracts and indexes/migrations → repositories → services/materializers → saved card projection/API → UI → recovery → focused proof. Do not build UI against an unverified persistence/service contract or add broad browser coverage before the underlying focused checks pass.

Every session ends with a compact handoff in the coding agent's final response. That response is the handoff; do not create an implementation report, handoff log, session-notes file, or chronological diary. Record only confirmed unresolved defects in the existing Open Findings Ledger, and record verified phase status/evidence only in the existing roadmap tracker at the applicable gate. The final response contains:

- slice and status: completed, partial, or blocked;
- files changed and the responsibility of each change group;
- invariants preserved and any invariant not yet proven;
- exact tests/commands run, with pass/fail/not-run results;
- known findings classified by the failure taxonomy in Section 10.1;
- durable evidence or fixture paths needed to resume; and
- the exact next slice—or the unfinished step within the current slice—without starting it.

On resume, trust verified commands and evidence unless affected files, dependencies, provider contracts, or database structure changed afterward. Re-run the smallest invalidated proof; do not rediscover settled architecture or reconsider PRD decisions merely because a new session started.

Stop before expanding the slice and request direction when any of these occurs:

- **Product decision:** the PRD and this plan permit materially different user-visible behaviors or authority boundaries.
- **Architecture conflict:** the verified repository cannot support the planned contract without changing a shared boundary, phase order, or excluded architecture.
- **Paid provider call:** proof would incur provider cost or require real credentials; provide the exact purpose and expected cost first.
- **Destructive action:** data, retained assets/evaluations, indexes beyond the exact approved migration, or user work could be deleted or overwritten.
- **Scope expansion:** completion appears to require a new dependency, service, infrastructure component, abstraction, production hardening, or unrelated refactor.

Ordinary code defects, stale fixtures with an unchanged contract, and reproducible local setup faults are not product questions; classify and handle them under Section 10.1.

### 8.2 First implementation preflight

Before the first implementation edit after explicit plan approval:

1. Re-read AGENTS.md, the PRD, this plan, roadmap, architecture, and current Issue #18.
2. Confirm branch issue-18-parallel-multi-agent-execution and a understood working tree; preserve unrelated work.
3. Update Issue #18/project status to In progress and roadmap Phase 1 to In progress.
4. Record the baseline: npm run db:reset, npm run db:verify, npm run typecheck, npm run lint, npm test, npm run test:agent, npm run build, npm run test:e2e. Classify inherited failures; do not redefine them as acceptable.
5. Use fake providers for implementation checks. Do not make real-provider calls without a separate user approval and cost statement.

### 8.3 Mandatory phase gate

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

### 8.4 Contract-first implementation checklists

Apply only the checklist rows relevant to the current slice. Close each checked row with the named evidence before depending on it in a later slice.

| Checklist | Invariant | Failure mode prevented | Required evidence |
| --- | --- | --- | --- |
| [x] Persistence, indexes, and migration | Persisted documents parse under versioned contracts; references/indexes enforce the planned cardinality; setup/init are fresh-, repeat-, and upgrade-safe; only the exact legacy index is removed. | Partial upgrades, rewritten operator edits, duplicate pools/batches, or an unintended destructive index change. | Contract tests, index inspection, fresh/repeat/upgrade setup-init-verify, deterministic seed/backfill comparison. |
| [x] Batch, item, and attempt lifecycle | One frozen item exists per selected logical agent; claims are exclusive; attempts append; batch results wait for all terminal items; retry targets failed items only. | Duplicate calls, lost retry evidence, early result selection, or a batch stuck after restart. | Repository/service transition tests, deferred-barrier overlap, mixed/all-failed retry, crash/startup recovery, status projection assertions. |
| [x] Saved card and UI-message projection | The authoritative card row and matching saved data-card part change transactionally at one expected revision; private ready input and unbounded details never enter public JSON. | Reload showing a different decision, duplicate action application, leaked prompts/bytes/secrets, or a card that cannot resume. | Projection transaction/idempotency tests, serialized schema checks, ready/running/results/completed reload fixtures, stale-revision conflict test. |
| [x] Selection and materialization authority | Only application services may select/materialize; implicit selection requires frozen `resultChoicePolicy=implicit_sole`; otherwise a terminal validated success, explicit creator response, and current workflow fingerprint are required; one batch produces at most one immutable outcome. | Agent-authored mutation, unselected/invalid output activation, duplicate versions/assets, or stale workflow mutation. | Selected-only service tests, sparse provenance uniqueness, invalid/unselected no-mutation assertions, duplicate/crash-resume materializer proof. |
| [x] Image native/canonical adapters and retained assets | Shared image intent remains provider-neutral; every candidate receives a profile-valid canonical/native request; returned bytes/MIME/dimensions validate; candidate assets remain unlinked until selection. | Cross-provider setting leakage, malformed provider output, bytes in MongoDB, premature composition/linkage, or prior-asset replacement on failure. | Closed-model fixtures, reference/geometry-limit rejection, byte inspection, retained-unlinked provenance checks, selected-only compose/link and failure-retention tests. |
| [x] Admin lifecycle and coverage | Exactly one manager and one-or-more active compatible candidates per target remain; one active version per logical agent; confirmed edits create inactive drafts; capabilities/mappings stay code-owned/read-only. | Empty target coverage, multiple managers, incompatible activation, mutation of confirmed history, or arbitrary runtime configuration. | Lifecycle/coverage integration tests, atomic replacement and last-candidate rejection, draft-successor/no-op Save, settings/schema UI validation, snapshot immutability. |
| [x] Rerun, restart, and idempotency | Results rerun and completed restart restore the source input only after the applicable terminal/currentness/provenance checks; stale transitions are no-write; retries/recovery reuse durable IDs and provider task state. | Comparing different tasks, losing ready input/history, overwriting current artifacts early, duplicate provider submissions/outcomes, or stale dependency mutation. | Results change-and-rerun transaction/reload, current/stale restart, readyPreviousBatchId→previousBatchId provenance, no-write assertions, response replay, stable materialization IDs, FLUX poll-resume/no-resubmit proof. |

## 9. Four implementation phases and self-contained slices

### 9.1 Dependency and sequencing controls

The slice order is mandatory. Later-slice scaffolding may be inspected, but it must not be implemented before its prerequisite proof is green. Card projection, persistence, selected-only materialization, and recovery are explicit dependencies, not cleanup deferred to a phase gate.

| Phase | Required sequence | Safely parallelizable after prerequisites | Must remain sequential |
| --- | --- | --- | --- |
| 1 | 1.1 contracts/migration → 1.2 persistence, lifecycle, projection, recovery → 1.3 routing integration → 1.4 materialization/restart | Read-only source inspection, independent fixture preparation, and focused tests that do not edit shared contracts | Migrations, execution/card contracts, repositories, ExecutionService, ChatService, materializers, and saved-message projection |
| 2 | 2.1 provider adapters/assets → 2.2 reference integration → 2.3 page/composition integration | Independent provider-native fixtures and read-only official-contract checks; reference/page test design after 2.1 is frozen | Image contracts, GenerationService, generation state, AssetStore provenance, composition, and runner recovery |
| 3 | 3.1 lifecycle/service contract → 3.2 desktop panels → 3.3 narrow navigation/accessibility | Read-only UX/a11y review and isolated view-model/component tests after the server snapshot is stable | Agent lifecycle mutations, admin Server Actions/snapshot, URL selection model, and shared panel controller |
| 4 | 4.1 data/recovery regression → 4.2 browser/PDF golden path → 4.3 retained-artifact/docs audit | Evidence reconciliation that reads stable outputs | Database repair, golden-path fixture state, retained artifacts, roadmap/docs/issue updates, and final acceptance audit |

Across phases, enforce these dependencies:

- A saved Agent run UI may be wired only after batch/item/card persistence and transactional card/message projection are proven.
- Manager and image flows may consume ExecutionService only after its lifecycle, retry, terminal-state, and reload contracts pass focused tests.
- No result materializer or image composer may run until terminal-only selection and selected-item provenance are enforced below the UI layer.
- Recovery tests and startup wiring follow stable claim/attempt/materialization idempotency; they must replay the same durable command rather than invent a parallel path.
- Broad Playwright and PDF checks follow focused contract, repository, service, and component proof for the slice they exercise.

### 9.2 Phase slices

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

**Slice execution packet**

| Field | Instruction |
| --- | --- |
| Outcome | Fresh and upgraded databases expose valid code-registered targets/profiles and one-or-more compatible candidates without changing current seeded identities. |
| Coverage | MA-016–MA-018, MA-021, MA-024, MA-025; candidate-pool lifecycle, profile compatibility, immutable snapshots, upgraded seeds, and exact-repeat initialization. |
| Inspect first | Existing agent/skill/image contracts; agent defaults/repository; MongoDB documents, indexes, setup/init/verify; focused tests and deterministic seed fixtures. |
| Owner and expected change | Contracts/profile registry and persistence own schemas, migration/indexes, backfill, seeds, and pool resolution; runtime flow and final admin UX remain unchanged. |
| Invariants | Exactly one manager; one-or-more compatible candidates per target; one active version per logical agent; stable agent IDs/history; only the exact legacy index is dropped; no arbitrary settings/schema storage. |
| Proof | Contract/profile fixtures; fresh, repeated, and upgraded setup/init/verify; pool/last-candidate repository tests; deterministic seed comparison. |
| Stop/escalate | Apply Section 8.1. Stop for an unexpected production-shaped index/data state, an unresolved profile requirement, any destructive migration beyond the exact index replacement, or paid provider validation. |

#### Slice 1.2 — Durable batches, evidence, recovery, and card projection

**Usable result:** A fake candidate batch can be created, run concurrently, restored, retried, selected, and represented by one evolving persisted card without booklet artifact mutation.

- Implement preference, execution, private ready-input, card-projection, and evidence repository methods.
- Implement runtime-availability-aware pool fingerprints and no-write stale submission behavior.
- Implement CandidateExecutionService and ExecutionService with concurrent claims/attempts.
- Extend the runner and startup recovery.
- Add Agent run card schema/actions/component/status endpoint/shared poller.
- Prove private ready-input reload without another manager call, terminal-only selection, retry-failed-only, all-failed recovery, prior history, and exact reload restoration.

**PRD:** MA-001, MA-003–MA-010, MA-015, MA-015a, MA-020–MA-022.

**Focused evidence:** repository/service concurrency tests with controllable deferred fake candidates; card projection/idempotency/reload tests; component keyboard/aria-live tests.

**Slice execution packet**

| Field | Instruction |
| --- | --- |
| Outcome | A durable fake Agent run moves through ready/running/results/completed, restores exactly, and retries without mutating booklet artifacts. |
| Coverage | MA-001, MA-003–MA-010, MA-015, MA-015a, MA-020–MA-022; card restoration, remembered/stale teams, true parallel items, terminal-only choice, retry, evidence, and accessibility. |
| Inspect first | 1.1 execution contracts; current card/message schemas and projection transaction; conversation/evidence repositories; runner/job recovery; repository, service, component, and reload tests. |
| Owner and expected change | Execution persistence/ExecutionService own lifecycle; ConversationRepository owns atomic card/message projection; UI only projects validated state/actions. Add preferences, batches/items, polling, recovery, and Agent run UI. |
| Invariants | Private ready input never enters public JSON; each selected agent has one durable item; attempts append; all items are terminal before selection; no workflow mutation; the same card restores after reload. |
| Proof | Deferred-barrier overlap; projection/idempotency; stale/no-write; retry/all-failed/recovery; keyboard/aria-live component tests. |
| Stop/escalate | Apply Section 8.1. Stop if atomic saved-message projection cannot be preserved, durable claims require new infrastructure, recovery would resubmit completed work, or UI needs authority absent from ExecutionService. |

#### Slice 1.3 — Manager route split and routed text runs

**Usable result:** A material text turn makes one manager routing call, displays the saved team, runs selected agents, and waits for a chosen success.

- Split ManagerService routing from specialist execution.
- Replace complete singleton preflight with eligible pool preflight.
- Persist deterministic manager narration plus ready/automatic Agent run through the existing AI SDK UI stream.
- Update fake and real specialist runtimes to execute through openai-specialist v1.
- Update agent fixtures to assert one manager call plus all explicitly selected candidate calls.

**PRD:** MA-002, MA-006–MA-010, MA-016–MA-020, MA-022.

**Focused evidence:** manager allowlist/profile-summary tests; one/three candidate concurrency fixture; stale pool/no-mutation tests; AI SDK route/message validation tests.

**Slice execution packet**

| Field | Instruction |
| --- | --- |
| Outcome | One manager route produces one persisted text Agent run whose selected candidates execute through the registered specialist profile. |
| Coverage | MA-002, MA-006–MA-010, MA-016–MA-020, MA-022; one legal route plus selected candidate calls, canonical routing, sole-agent behavior, concurrency, and immutable evidence. |
| Inspect first | Verified 1.1–1.2 contracts/services; ManagerService, ChatService, AgentResolver, skill registry, fake/OpenAI runtimes, AI SDK transport, and agent fixtures. |
| Owner and expected change | ManagerService routes only; ChatService owns canonical input and persisted narration/card; CandidateExecutionService owns calls/normalization. No materializer runs yet. |
| Invariants | One manager and stage-valid skill per turn; no native manager input or second manager call; frozen candidate versions; activation affects future cards; no artifact mutation. |
| Proof | Allowlist/capability tests, one-/three-candidate barrier fixtures, saved-message validation, stale-pool no-mutation, and manager/candidate evidence reconciliation. |
| Stop/escalate | Apply Section 8.1. Stop if routing cannot separate without changing stage legality, a skill contract must change incompatibly, another manager call appears necessary, or central message transport must be redesigned. |

#### Slice 1.4 — Selected-only text materialization and direct quality

**Usable result:** Selecting a normalized text success produces exactly one existing application outcome; sole-agent and direct-quality flows require no redundant decisions.

- Add idempotent TextResultMaterializer and batch provenance.
- Move the existing ChatService result switch behind selection.
- Start direct quality as its own Agent run after Story Plan materialization.
- Preserve one targeted repair, entity/page IDs, artifact dependencies, card follow-ups, and downstream needs_review.
- Add Restart with agents to completed Agent run and its produced artifact.

**PRD:** MA-006, MA-010, MA-011, MA-018–MA-022.

**Focused evidence:** each skill materializer; sole-agent implicit result; multi-result selected-only version; quality partial/all failure; crash-resumed materialization; stale workflow; restart creates one new immutable version.

**Slice execution packet**

| Field | Instruction |
| --- | --- |
| Outcome | Exactly one validated text result creates the existing outcome; sole-agent/direct-quality paths avoid redundant choices and restart is idempotent. |
| Coverage | MA-006, MA-010, MA-011, MA-018–MA-022; selected-only mutation, implicit sole selection, direct quality, restart/history, provenance, stale recovery, and downstream review. |
| Inspect first | Verified execution lifecycle; ChatService result switch, QualityService, ArtifactService dependencies, seven skill materialization paths, card factories, and integration tests. |
| Owner and expected change | TextResultMaterializer and existing application services own mutation; selection invokes a closed materializer and completion/restart follows durable provenance. |
| Invariants | Agents never persist; one batch creates at most one outcome; unselected/invalid results never mutate; IDs/dependencies/one-repair remain; restart preserves current artifacts until replacement. |
| Proof | Seven materializer cases, sole/multi selection, quality failures, duplicate/crash resume, stale restart no-mutation, immutable replacement, and needs_review. |
| Stop/escalate | Apply Section 8.1. Stop for an uncovered target outcome, ambiguous mutation authority, restart without provable currentness, or any candidate synthesis/merge. |

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
- Add gemini-image v1 using native fetch against the exact `POST /v1beta/interactions` contract in Section 3.2: snake_case `response_format.aspect_ratio`/`image_size`, ordered inline `input` image objects, strict completed-Interaction response parsing, and model-output image-byte normalization. Include the stable `gemini-3-pro-image` catalog entry and explicit rejection fixture for `gemini-3-pro-image-preview`.
- Add flux-image v1 using native fetch for requests without image inputs, numeric dimensions, fake native fixtures for up to eight ordered/deduplicated URL reference fields, persisted submit/poll recovery, and immediate signed-result retrieval.
- Phase 2 decision gate: keep every real FLUX request containing references or an edit target runtime-ineligible in this local POC. Do not add public asset delivery. Enabling it later requires separate user approval of the public-origin mechanism, setup/security/verification scope, and a corresponding plan update; fake coverage must still prove generate/edit normalization and limits.
- Keep fake/real provider choice through IMAGE_PROVIDER_MODE and provide deterministic fake execution for every profile.
- Execute selected image agents concurrently and store successful source assets with batch/item provenance.
- Prove quality-versus-resolution-versus-dimensions mapping, model-specific invalid combinations, versioned cost calculation, credential availability, and invalid native/canonical output isolation without paid automated calls.

**PRD:** MA-012–MA-014, MA-017–MA-022.

**Slice execution packet**

| Field | Instruction |
| --- | --- |
| Outcome | Every image profile validates native/canonical requests and retains each successful candidate as an inactive source asset. |
| Coverage | MA-012–MA-014, MA-017–MA-022; provider normalization/limits, concurrency, retained assets, task recovery, cost/evidence, and invalid-output isolation. |
| Inspect first | Image/asset contracts; provider seam, prompt serializer, pricing, Sharp, AssetStore, Phase 1 execution lifecycle, provider/generation tests, and dated official contracts. |
| Owner and expected change | Profiles own native adapters; CandidateExecutionService owns per-candidate canonical requests/evidence; AssetStore owns bytes. Sequential reference/page flow is not connected yet. |
| Invariants | Profile-neutral shared intent; distinct validated ImageRequest per candidate; all native values parse; bytes stay out of MongoDB; assets remain unlinked; FLUX resumes polling; no paid calls. |
| Proof | Closed-model fixtures including stable Gemini Pro ID and preview-alias rejection; exact Gemini endpoint/header/body fixtures for both models, every geometry/resolution mapping, and zero/ordered references; exact completed-Interaction response and invalid/camelCase/legacy/SDK-only response rejection fixtures; invalid combinations/limits; ordered FLUX URL-field fixtures; real FLUX image-input ineligibility with no provider call; byte/MIME/dimensions; barrier overlap; no-resubmit recovery; provenance; and cost tests. |
| Stop/escalate | Apply Section 8.1. Stop for changed official contracts, real/paid calls, provider input requiring new infrastructure/dependencies, or asset safety unprovable with AssetStore. |

#### Slice 2.2 — Reference-item Agent runs

**Usable result:** Each ordered canonical reference pauses for its own ready/results decision and only the selected reference becomes current.

- Connect reference generation/edit items to ExecutionService.
- Restore remembered reference teams; update the preference on item-level change.
- Auto-select only when Run froze `resultChoicePolicy=implicit_sole` from an eligible pool of exactly one compatible candidate; every batch originating from a multi-candidate pool requires explicit success selection, regardless of selected-agent or success count.
- Keep failures/retries on the current item and advance only after selection.
- Make final Visual Bible linkage idempotent.

**PRD:** MA-006–MA-015a, MA-020–MA-022.

**Slice execution packet**

| Field | Instruction |
| --- | --- |
| Outcome | Each ordered reference item uses one Agent run, remembers its team, and advances only after one valid source is selected. |
| Coverage | MA-006–MA-015a, MA-020–MA-022; per-reference defaults, sequential order, recovery, sole-agent flow, reload, selected-only linkage, and asset retention. |
| Inspect first | Verified 2.1 profiles/assets; GenerationService, generation job/item/runner, Visual Bible linkage, job/card polling, reference recovery, and selective-regeneration tests. |
| Owner and expected change | Generation job remains sequence owner; ExecutionService owns the current candidate batch; Visual Bible materialization links only the selection at normal finalization. |
| Invariants | One current reference item; only candidate calls parallelize; changes affect the next same-target item; failed/unselected assets never become primary; completed references stay active. |
| Proof | First/remembered/changed teams, overlap, sole/explicit selection, mixed/all-failed retry, reload states, sequential advance, idempotent linkage, and retention. |
| Stop/escalate | Apply Section 8.1. Stop if integration creates a second image workflow, advances before selection, changes reference ordering, or cannot preserve the current Visual Bible through failure. |

#### Slice 2.3 — Page-item Agent runs and composition

**Usable result:** Each ordered page uses its own team and only the selected source is composed/activated.

- Connect page generation/edit items to ExecutionService.
- Compose only after selection and preserve current page assets through restarts/failures.
- Retain unrelated/completed pages on item-level team change.
- Preserve existing Final Pages gallery, selective regeneration, and job recovery.

**PRD:** MA-006–MA-015a, MA-020–MA-022.

**Slice execution packet**

| Field | Instruction |
| --- | --- |
| Outcome | Each ordered page runs candidates in parallel, composes only the selected source, and preserves existing page behavior. |
| Coverage | MA-006–MA-015a, MA-020–MA-022; per-page teams, sequential items, previews, selected-only activation, restart/reload, unaffected pages, and evidence. |
| Inspect first | Verified 2.1–2.2 integration; page generate/edit, composition/geometry, Final Pages materialization/gallery, asset lineage, regeneration, and recovery tests. |
| Owner and expected change | Generation job owns sequence; ExecutionService owns candidates; composition runs after selection; Final Pages publication remains the aggregate boundary. |
| Invariants | No composition before selection; exactly one primary source; completed/current pages survive failure; lettering/geometry are unchanged; unselected assets stay inactive. |
| Proof | Page generate/edit, overlap, preview/selection, composition ordering, team defaults, recovery/reload, selective regeneration, and final asset order. |
| Stop/escalate | Apply Section 8.1. Stop if composition must inspect unselected results, lettering/geometry rules change, page order cannot remain sequential, or a new asset/job abstraction is proposed. |

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

**Slice execution packet**

| Field | Instruction |
| --- | --- |
| Outcome | Services/actions safely manage manager replacement and additive candidate pools with typed profiles and preserved coverage. |
| Coverage | MA-016, MA-020, MA-023b–MA-025; inactive-first creation, additive activation, last-candidate protection, atomic manager replacement, draft succession, compatibility, and snapshots. |
| Inspect first | Agent/profile contracts; AgentRepository/lifecycle service; current admin Server Actions/forms; active-version indexes/guards; lifecycle, coverage, and concurrency tests. |
| Owner and expected change | Repository/lifecycle service owns atomic validation/mutation; Server Actions remain thin callers. Three-panel presentation waits for 3.2. |
| Invariants | Exactly one manager; every target retains a candidate; activation affects future runs; confirmed versions stay immutable; changed confirmed Save creates one inactive draft; history/evidence guards remain. |
| Proof | Create/edit/confirm/activate/deactivate/retire/delete integration; manager replacement; last-candidate rejection; settings; no-op Save; draft successor; stale revision; snapshot immutability. |
| Stop/escalate | Apply Section 8.1. Stop for coverage corruption that cannot be repaired progressively, lifecycle conflict with the PRD, destructive repair, or a new admin API/persistence model. |

#### Slice 3.2 — Desktop Targets / Agents / Details

**Usable result:** Selecting a target updates the active-first searchable agent list; selecting/adding an agent updates persistent details without leaving the page.

- Build the three panels from a minimal server snapshot and pure view-model helpers.
- Add inactive-first creation and separate activation.
- Show warnings and collapsed unavailable/history/lifecycle/schema details.
- Keep schemas/mappings/capabilities read-only.
- Provide independent panel scrolling and no page-scroll jumps.

**PRD:** MA-023–MA-024.

**Slice execution packet**

| Field | Instruction |
| --- | --- |
| Outcome | Desktop/tablet operators manage targets and agents through persistent Targets/Agents/Details panels without leaving the page. |
| Coverage | MA-023–MA-024; target/list/detail updates, active-first order, search/add, inactive creation, typed settings, warnings, collapsed details, panel scrolling, and reload selection. |
| Inspect first | Verified 3.1 services/actions; current admin Server Component/controller/view models/forms/dialogs, responsive styles, and admin component/browser tests. |
| Owner and expected change | Server Component owns the minimal snapshot; client controller owns selection/search/disclosures; lifecycle actions remain server-owned. Build only against the stable 3.1 contract. |
| Invariants | No client DB access; active compatible agents precede inactive; schemas/mappings read-only; new agents inactive; panel scroll does not force page scroll; refresh does not steal focus. |
| Proof | Ordering/filter view-model tests; target/agent/add component tests; validation/disclosures; desktop keyboard/focus/scroll browser evidence; URL reload restoration. |
| Stop/escalate | Apply Section 8.1. Stop if UI needs unbounded snapshots, duplicates lifecycle rules client-side, requires broad admin restyling, or changes creator/runtime behavior. |

#### Slice 3.3 — Narrow drill-down, focus, and reload

**Usable result:** The same admin tasks work as Targets → Agents → Details on narrow screens and restore after reload.

- Add URL-backed target/agent/version/view selection.
- Add visible Back controls and deterministic focus restoration.
- Verify keyboard controls, labels, focus visibility, live validation/status, and responsive overflow.

**PRD:** MA-023e and accessibility acceptance.

**Slice execution packet**

| Field | Instruction |
| --- | --- |
| Outcome | The same admin tasks work as an accessible Targets → Agents → Details narrow drill-down and restore predictably. |
| Coverage | MA-023e and responsive/accessibility acceptance for Back, keyboard, focus, overflow, no forced scrolling, and restored management view. |
| Inspect first | Verified desktop controller/view models; current URL search-param handling, focus patterns, responsive component tests, and narrow Playwright setup. |
| Owner and expected change | The shared controller owns URL target/agent/version/view state; responsive presentation changes panel visibility only and does not fork lifecycle behavior. |
| Invariants | Desktop/narrow share data/actions; Back restores opener focus; URL stores selection but not search/disclosures; refresh never forces focus or scrolling. |
| Proof | Narrow forward/Back flow, keyboard-only use, focus restoration, visible focus/status, overflow/no-scroll, viewport transition, and reload at each level. |
| Stop/escalate | Apply Section 8.1. Stop if narrow support requires separate business state, mobile scope beyond drill-down, a new routing system, or broad cross-browser acceptance. |

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

**Slice execution packet**

| Field | Instruction |
| --- | --- |
| Outcome | Data, lifecycle, recovery, evidence, and existing single-agent behavior are reconciled before broad acceptance testing. |
| Coverage | MA-001–MA-025 regression evidence for persistence, recovery, normalization, authority, lifecycle, and reload; Section 6 automated acceptance except final browser/PDF inspection. |
| Inspect first | All phase handoffs/evidence, findings ledger, migrations/verification, execution/generation recovery, evidence records, retained fixtures, and affected test inventory. |
| Owner and expected change | This is defect fixing/evidence reconciliation across existing owners, not a refactor. Repair only confirmed in-scope defects and keep contracts stable unless escalated. |
| Invariants | Fresh/repeat/upgrade agree; recovery never duplicates; invalid/unselected outputs never mutate; evidence matches snapshots; existing single-agent behavior stays green. |
| Proof | Database commands, interruption/idempotency suites, full affected commands, and requirement-linked evidence with classified failures. |
| Stop/escalate | Apply Section 8.1. Stop for product ambiguity, retained-data mutation, paid evaluation, unexpected architecture migration, or a failure that cannot be classified without weakening acceptance. |

#### Slice 4.2 — Fake-provider booklet golden path and PDF

- Extend the existing desktop Chromium golden path through at least one multi-agent text step, one reference item, one page item, restart, reload, selected-only activation, approval, and PDF download.
- Keep fake providers and isolated MongoDB/filesystem data.
- Render the generated PDF with the repository PDF workflow and inspect page count/order/geometry/readability.
- Retain screenshots/traces/download under ignored output/playwright paths.

**Slice execution packet**

| Field | Instruction |
| --- | --- |
| Outcome | The fake-provider desktop golden path proves multi-agent text, reference, page, restart/reload, selected-only activation, and readable PDF export. |
| Coverage | Section 6 browser acceptance and MA-001–MA-015a, MA-020–MA-022 end-to-end proof; completion audit for concurrency, sole-agent flow, asset retention, and PDF. |
| Inspect first | Verified 4.1 state; current Playwright golden path/fixtures, fake providers, isolated DB/filesystem setup, export/download, PDF workflow, and output conventions. |
| Owner and expected change | Browser fixtures/tests own orchestration; application fixes remain with their established owner. PDF inspection verifies output and changes rendering only for a confirmed defect. |
| Invariants | No real calls; isolated data; barriers prove concurrency; only the chosen result mutates; output order/geometry/readability remain deterministic; retained evaluations untouched. |
| Proof | Golden path traces/screenshots/download, exact reload states, mixed retry/restart, image selection, final export, and rendered PDF page/order/visual inspection. |
| Stop/escalate | Apply Section 8.1. Stop for a real/paid call, retained evaluation overwrite, non-isolated data, product-level flow change, or PDF work beyond the existing renderer. |

#### Slice 4.3 — Retained-evaluation regression and documentation

- Do not rerun paid evaluations.
- Confirm the existing accepted early-reader, developing-reader, and older-reader manifests/PDFs remain readable and unchanged unless a separately approved defect requires a rerun.
- Update docs/architecture.md, README/operator/user guidance, the implementation audit, roadmap, Issue #18, and evidence-based lessons.
- Complete the requirement-by-requirement audit and final defect-first review.

**Slice execution packet**

| Field | Instruction |
| --- | --- |
| Outcome | Retained evaluations remain unchanged and verified documentation/evidence accurately describe the completed implementation. |
| Coverage | MA-001–MA-025 final traceability, all Section 6 acceptance, documentation end state, and completion/change-control audit. |
| Inspect first | Verified phase evidence, fake golden-path artifacts, retained manifests/PDFs, architecture/operator/user docs, roadmap, implementation audit, Issue #18, and learnings guidance. |
| Owner and expected change | Documentation/evidence owners record verified behavior only; roadmap/Issue follow the phase gate; retained artifacts are read-only. |
| Invariants | No paid rerun or retained artifact change without approval; every trace claim has scope-matched evidence; no open finding; no speculative docs. |
| Proof | Retained comparison/readability, requirement audit, final defect-first review, documentation diff, git diff check, and complete command/evidence summary. |
| Stop/escalate | Apply Section 8.1. Stop for a retained difference, missing acceptance evidence, unresolved finding, issue closure/merge, or unsupported documentation claim. |

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

Gate each slice through the smallest applicable progression before running phase-wide commands:

1. contract/schema and pure adapter/view-model tests;
2. repository/index/transaction integration tests;
3. service lifecycle, authority, idempotency, and recovery tests;
4. focused component accessibility/projection tests;
5. focused agent fixture or Playwright path only when the slice crosses that boundary; and
6. the affected full commands at the phase gate.

A later layer cannot compensate for a failing or omitted earlier layer. Record not-run checks and why; do not call a slice verified when its required proof is deferred to the phase gate.

Classify every failure before acting:

| Classification | Signal | Required action |
| --- | --- | --- |
| Code defect | The implementation violates the PRD, plan contract, or a previously passing affected invariant. | Fix within the current slice, add/regress the smallest proof, and rerun affected layers. |
| Stale fixture | The intended contract is unchanged and implementation evidence passes, but expected fixture data reflects the old singleton/card/provider shape. | Update only the affected fixture, explain the contract-preserving delta, and rerun its producer/consumer tests. |
| Environment/setup issue | Failure occurs before the changed behavior or depends on unavailable local MongoDB, browser, filesystem, or optional credentials. | Reproduce with the documented setup, record exact diagnostics, avoid product-code workarounds, and mark blocked only if the required environment cannot be restored. |
| Provider-contract change | A dated official OpenAI, Gemini, or BFL contract no longer matches the closed profile catalog/adapter. | Record a Phase 2 finding with the official evidence; do not silently coerce, fall back, enable the model, or make a paid call. Escalate if resolving it changes planned product support. |
| Unresolved product decision | Authoritative requirements allow materially different behavior or resolving the issue changes scope/authority/acceptance. | Stop the slice, preserve evidence, and request user direction; do not encode a preference as implementation detail. |

### 10.2 Required scenario matrix

| Area | Required scenarios |
| --- | --- |
| Preferences | first-use no selection; non-empty submit; remembered collapsed team; changed preference; stale subset; runtime-mode/credential change before submit; no valid remainder; no preference/batch write on rejection |
| Pools | additive activation; active logical version replacement; last-candidate deactivate/retire rejection; atomic manager replacement; malformed active profile |
| Batches | all selected queued; overlapping execution; terminal-only selection; `implicit_sole` only when the eligible pool has one candidate; selecting one from a multi-candidate pool remains explicit; two selected with one success/one failure stays in results with no implicit selection; mixed outcomes; all failed; retry failed only; results change-and-rerun restores frozen input and transfers readyPreviousBatchId to previousBatchId; completed restart history |
| Sole candidate | exactly one eligible compatible candidate freezes `implicit_sole` and has no checkbox or result choice; invalid sole output does not materialize; valid sole output auto-selects; selecting one from a larger pool and terminal success count never convert an explicit batch into sole-candidate flow |
| Cards | same logical card/revision; private ready input survives reload and never enters UI JSON; Run copies the identical input without a manager call; results change-and-rerun transaction restores ready input/history without preference or workflow mutation; saved message projection; exact ready/running/results/completed reload; stale action conflict |
| Text | all seven closed materializers; direct quality; selected-only version; one-repair limit; downstream needs_review |
| Images | reference/page generate and edit; per-item preference; sequential items; multi preview; selected-only compose/link; prior asset retention |
| Profiles | compatible/incompatible targets/operations; closed model IDs including stable `gemini-3-pro-image` and rejected preview alias; OpenAI size/quality; exact Gemini Interactions endpoint, headers, snake_case request body, ordered references, completed model-output image response, and camelCase/legacy/SDK-only rejection; FLUX dimensions and ordered URL-field fixtures; real FLUX image-input ineligibility/no-call; limits and poll recovery; versioned cost; native/canonical invalid output |
| Evidence | immutable snapshots after admin edits; batch/item IDs; canonical/native references; usage/cost/error; no bytes/secrets |
| Admin | target/list/detail selection; ordering/search/add; inactive creation; auto draft; advanced disclosures; URL reload; narrow focus/back |
| Recovery | process interruption while running and materializing; retry action idempotency; results change-and-rerun restores frozen input/history across reload; restart clones input when source/dependencies remain current; stale rerun/restart has no mutation; stale workflow; missing pool; filesystem asset already written |

### 10.3 Required commands

Use the scripts already present:

- npm run db:reset
- npm run db:reset
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
| 1. Foundation and text execution | Verified | Current branch checkpoint | MA-001–MA-011, MA-015–MA-022, MA-024–MA-025 | Candidate-pool, batch, snapshot, materialization, recovery, and evidence unit/integration coverage; full serial suite passed. |
| 2. Image execution | Verified | Current branch checkpoint | MA-006–MA-015a, MA-017–MA-022 | Profile/native adapter, candidate-preview, selected-only asset, retry/restart, and recovery fixtures passed. |
| 3. Agent management | Verified | Current branch checkpoint | MA-016, MA-020, MA-023–MA-025 | Agent lifecycle/coverage integrations and 5 browser admin scenarios passed. |
| 4. Verification and handoff | Verified | Current branch checkpoint | MA-001–MA-025 | db setup/init/verify, typecheck, lint, 121/121 Vitest, agent fixtures, build, 9/9 Playwright, PDF render/visual inspection, and retained-artifact timestamp audit passed. |

Allowed values are Not started, In progress, Blocked, and Verified. Verified requires the full Section 8 gate.

### 12.2 Open findings ledger

No open findings remain after the final defect-first review. The former Phase 2 BFL catalog check is recorded as a resolved implementation decision below; real image-input execution remains intentionally gated by the local AssetStore capability.

### 12.3 Decision log

| Decision | Rationale | Source |
| --- | --- | --- |
| Extend role with image; derive target key | Represents image candidates without inventing runtime skills or a target assignment table. | PRD §§4–5 |
| Manager is not an execution-profile candidate | Profile executor kinds are specialist/image; manager remains the unique router with existing closed configuration. | MA-016–MA-019 |
| Typed columns, no arbitrary settings JSON | Covers current text/image settings with code-owned schemas and minimal persistence. | MA-017, MA-024; minimal scope |
| Four production profiles, five model choices, and one dated OpenAI snapshot ID | Adds the requested OpenAI/Gemini/FLUX coverage while keeping catalogs and mappings closed and code-owned. | User annotation; MA-017–MA-019 |
| Ready card precedes batch with private input on the card row | MA-007 creates a batch only when Run is submitted while reload-safe server-only input avoids a fourth collection or manager rerun. | MA-001, MA-007, MA-015a |
| Append attempts inside execution item | Retains retries/failures without a fourth collection. | MA-007–MA-010, MA-021 |
| Poll persisted state; no resumable LLM stream | Existing AI SDK data-card transport is atomic; durable runner survives client disconnect/reload. | MA-015a; installed AI SDK 7 docs |
| Idempotent materializers with batch provenance | Closes crash gaps without an outbox/workflow engine. | MA-010–MA-011, MA-020–MA-022 |
| Results rerun and completed restart restore frozen input behind currentness gates | `change_agents` returns an unselected terminal batch to ready without mutation; `restart_with_agents` revises a completed outcome only when its provenance remains current. Both transfer `readyPreviousBatchId` into the replacement batch. | MA-010–MA-011, MA-020 |
| Real FLUX image-input execution is gated out of the local POC | BFL requires provider-retrievable image URLs, while assets are filesystem-local. Fake fixtures retain complete adapter/limit coverage; real requests with references/edit targets fail eligibility before any provider call unless a later public-delivery design is separately approved. | MA-017–MA-019, MA-022; minimal scope |
| Existing asset kinds remain | Unlinked reference/page_source assets already express inactive candidates; selection controls linkage/composition. | MA-014, MA-021 |
| Existing generation job remains sequence owner | Avoids two competing image workflows; parallelism belongs inside current item. | MA-012, MA-013, MA-014 |
| Database-authoritative image model/quality/resolution | Agent versions/profile snapshots must explain exact execution; environment keeps only provider credentials and the fake/real switch. | MA-017, MA-022, MA-024 |
| URL stores admin selection, not search | Restores meaningful navigation without adding global/account preference or local-storage schema. | MA-023e |
| Native fetch for Gemini/BFL; no new packages or services | The current Node runtime supplies HTTP; one adapter per provider is smaller than adding two SDKs or a generic provider framework. | Minimal scope |
| Reconcile persisted card projections by content, not message ID | An Agent Run card evolves in place under one saved message ID; `router.refresh()` must replace client message data so result selection and recovery actions appear without reload. | MA-001, MA-015a; browser result-selection regression fixed 2026-08-22 |

Add only material implementation discoveries. Product decisions must not be silently changed here.

## 13. Risks, controls, and intentional exclusions

| Risk | Required control | Explicitly not added |
| --- | --- | --- |
| Provider overload from selecting all candidates | Clear parallel/cost notice and evidence; execute exactly user selection | UI cap, hidden throttle, auto cancellation |
| Stale pool, runtime availability, ready input, rerun/restart source, or workflow mutates state | availability-aware fingerprints, private-input/currentness checks before transactions, optimistic revisions, frozen snapshots, selection-time revalidation | silent fallback |
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

Do not create a second plan, an implementation report, a handoff/session-notes file, a chronological implementation diary, or a speculative postmortem. Session handoffs exist only in the coding agent's final response; durable facts belong only in the existing plan ledger, roadmap evidence tracker, architecture/operator documentation, implementation audit, or verified learnings according to their defined scopes.

## 15. Completion audit and change control

The implementation is complete only when:

- [x] Every MA-001–MA-025 traceability row has scope-matched evidence.
- [x] All four roadmap phases are Verified with pushed checkpoint commits and Issue #18 updates.
- [x] The Open Findings Ledger is empty after final defect-first review.
- [x] Fresh, repeated, and upgraded MongoDB setup/init/verify pass.
- [x] Typecheck, lint, unit/integration tests, agent fixtures, build, and Playwright pass.
- [x] Fake text, reference, and page multi-agent paths prove actual overlap and selected-only materialization.
- [x] Ready/running/results/completed, retry, restart, history, and reload are proven.
- [x] Sole-agent text/image paths add no redundant creator decision.
- [x] Profile/native/canonical validation and immutable evidence reconcile.
- [x] Invalid/unselected outputs never mutate artifacts, quality state, jobs, or active assets.
- [x] Three-panel desktop and narrow admin acceptance pass.
- [x] The generated fake-provider PDF is rendered and visually inspected.
- [x] Existing retained evaluation artifacts are unchanged or any approved change is explicitly evidenced.
- [x] Architecture, roadmap, operator/user guidance, audit, learnings, and Issue #18 match verified behavior.

Passing a subset of tests or completing the code without the phase gates does not satisfy this plan.

Plan approval permits implementation within these decisions. Ask the user before changing product behavior, adding excluded scope/dependencies/services, making paid provider calls, overwriting retained evaluations, merging, or closing Issue #18. Equivalent code/file adjustments discovered during implementation may be recorded in the Decision Log and next-phase plan review when they preserve the PRD and minimal architecture.
