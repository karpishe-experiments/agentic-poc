# Dify booklet experiment — product requirements

**Status:** Accepted product direction; runtime implementation and live acceptance are not complete.
**Date:** 2026-09-27
**Tracking:** [Issue #65](https://github.com/karpishe-experiments/agentic-poc/issues/65)
**Delivery roadmap:** [PLAN.md](PLAN.md)

## 1. Outcome and authority

Prove that a Dify-managed agent suite can take an idea through Ali's creative journey to a complete illustrated booklet, with an external tester agent acting as the creator. First prove reliable completion; then evaluate visual consistency, adherence to creator intent, cost, and UX.

The source is [Ali's proposal in PR #26](https://github.com/karpishe-experiments/agentic-poc/pull/26), pinned to [the complete artifact suite at `631f547ec3f7ce375f740dd6f2b1b9aaebbde940`](https://github.com/karpishe-experiments/agentic-poc/tree/631f547ec3f7ce375f740dd6f2b1b9aaebbde940/docs/accepted/2026-08-22_guideline-driven-booklet-workflow-v2). It includes the PRD, PLAN, adoption guide, artifact mapping, orchestration guideline, and fourteen task guidelines. This experiment adopts the creative responsibilities, not every platform choice in that package.

For this experiment, explicit adaptations in this PRD take precedence over the source proposal and the older [POC PRD](../2026-08-01_end-to-end-poc/kids-comic-poc-prd.md). The existing [architecture guide](../../architecture.md) describes the current implementation, not evidence that this target already exists.

### Explicit adaptations

- Replace the application-managed agent runtime and agent administration with Dify. Do not retain a second editable agent registry.
- External persona testers provide creator decisions and explicit approvals through application rules.
- Quality findings are warnings with bounded revisions, not mandatory quality gates.
- Finish at generated story pages and cover. Defer task 14, Book Export Package, PDF, front matter, and back matter.
- Use a clean local and staging application-data baseline. Preserve production and existing Dify resources. Exact destructive targets require verification before execution.
- Reuse useful Booklet persistence and services; do not maintain legacy runtime compatibility solely for this experiment.
- Keep the runner UI simple and reuse existing booklet/artifact viewers where suitable.

These decisions supersede issue #65's earlier preservation requirement and the earlier trial's two-attempt preservation requirement for the planned local/staging reset. They do not authorize an unverified reset now. Preserve a sanitized summary of the prior trial before deletion.

## 2. Journey and suite

Provide one Dify manager, thirteen separately identifiable specialist tasks, image workflows, three external persona testers, and an independent Dify judge. Deliver complete instructions, input/output contracts, bindings, and fixtures rather than prompt placeholders. A task is a distinct responsibility; the technical plan must verify how Dify hosts it without assuming unlimited app capacity.

| ID | Artifact / specialist responsibility | Required production meaning |
| --- | --- | --- |
| J01 | Book Concept Brief | Audience, premise, theme, emotional promise, constraints, deferred decisions; no premature plot or visual design. |
| J02 | Story Outline | Concise causal story, embedded cast/place shortlists, agency and resolution. |
| J03 | Draft Character List | Working cast memory, confirmed facts and open questions; not visual design. |
| J04 | Draft Location List | Working place memory and narrative purpose; not a world encyclopedia. |
| J05 | Page-by-Page Manuscript | Complete readable story, action, narration/dialogue, characters and places per narrative unit. |
| J06 | Final Character List | Authoritative stable character facts, recurrence, attire, accessories, expressions and sheet requirements. |
| J07 | Final Location List | Authoritative places, stable anchors, features, continuity and sheet requirements. |
| J08 | Visual Style Package | Style and typography/bubble direction, unchanged shared prompt module, two generated validation samples and build records. |
| J09 | Individual Character Sheet Packages | Every recurring character: front/back/side full-body views, neutral face, three expressions, required attire/accessories. |
| J10 | Location Sheet Packages | Every final-list location: isometric overview and surrounding-angle views of required anchors. |
| J11 | Pagination and Layout Plan | Physical-page order, canvas, text-safe areas, typography/bubbles, panel allocation and reference routing. |
| J12 | Final Page Bible | Exact per-page/panel action, composition, lettering, speaker, placement and approved sheet references. |
| J13 | Final Page Illustration Packages | One image per physical page, prompt/build record, source versions, reference roles, candidate lineage and scoped approval. |

The dependency graph is:

```text
Concept → Outline → Draft Character + Draft Location → Manuscript
→ Final Character + Final Location → Style
→ Character Sheets + Location Sheets → Pagination → Page Bible → Page Images
```

Both members of each list pair must be approved before the next gate. All required sheets must be approved before pagination. Sibling tasks may be prepared in either order. Manuscript units need not map one-to-one to physical pages.

### Orchestration and revisions

- The manager reads saved context and selects the eligible owning specialist before each material action.
- Specialists clarify material gaps or offer bounded creative options. They do not repeat questions already answered by approved artifacts or conversation.
- Drafts remain unapproved until an explicit tester action approves the exact version. Image generation does not imply approval.
- Revisions create new versions and mark only affected downstream work as needing review. Do not silently rewrite approved history.
- A sheet correction that changes a stable fact revises the corresponding Final List first or in the same scoped revision.
- Page Bible and page-image revisions remain page-scoped unless a shared source changed.
- Quality warnings do not make an otherwise usable artifact ineligible for approval. Technical identity, authorization and dependency checks still apply.

### Visual execution

Inject the approved shared style module unchanged into image requests. Attach only relevant approved character/location sheets to final-page requests. Preserve exact approved text in prompts and generate lettering natively; no later text-overlay fallback.

Support page-by-page and selected ordered-batch generation. Batch results remain independently reviewable drafts, not automatically approved pages. Preserve application-owned stable page IDs, revisioned asset names, prompts and attachment records. Required visual features are production instructions and review criteria; imperfect rendering produces warnings, not an endless regeneration loop.

## 3. Ownership, interfaces and data

| Owner | Responsibility |
| --- | --- |
| Dify | Editable agent definitions, prompts, model bindings, specialists, image workflows, testers and judge. |
| Booklet | Durable IDs, persistence, artifact versions/dependencies, approvals, authorization, request limits, jobs, assets, completion and UI projections. |
| Codex | Authorized configuration/build/test/diagnosis/repair/publication cycle; not an actor repairing an acceptance run. |

Reuse existing booklet, artifact, approval, conversation, job, asset and model-call records where suitable. Add experiment-run records linking persona, fixed brief, mode, booklet, predecessor run, effective configuration evidence, Dify execution/node IDs, decisions, warnings/errors, request reservations, usage/cost, timing, assets and reports.

Configuration snapshots are evidence, not editable local agent definitions. Retire old agent administration and seeding requirements in the runtime transition. No legacy-record migration is required for the approved clean start.

Provide bounded application interfaces for run creation/inspection, Pause/Resume, creator responses, artifact proposals, provider authorization, image completion/failure, and evidence retrieval. Route them through domain services rather than duplicating lifecycle logic. Tester interfaces cannot use manager-only mutations; neither a manager nor a judge may fabricate creator approval.

Exact routes, schema fields, Dify node contracts and provider accounting mechanics must be verified in milestone 0 and recorded in the implementation plan before the affected runtime slice. This PRD does not claim those interfaces already exist.

## 4. Personas and fixed acceptance cases

| Persona | Brief and output | Layout | Revision ceiling |
| --- | --- | --- | --- |
| Playful Kid | Young inventor and tiny robot rescue a runaway kite; playful and reassuring; readers 6–8; 3 story pages + cover; 2 recurring characters, 1 location. | Single-scene pages. | 1 text, 1 image. |
| Enthusiast Parent | Child and grandparent turn a rainy afternoon into an indoor adventure; warm; readers 3–5; 5 story pages + cover; 2 recurring characters, 1 location. | Includes one simple two-panel page. | 1 text, 1 image. |
| Professional Creator | Two friends repair a community observatory after a disagreement; precise emotional arc; readers 9–12; 8 story pages + cover; 2 recurring characters, 2 locations. | At least two multi-panel pages. | 3 text, 2 images. |

Each physical page is one generated image. With two style samples and all required sheets, initial image outputs are **9, 11 and 15** (35 total), before revisions/retries. Keep briefs within this small cast/location scope. A tester's age/persona is separate from the intended reader age.

Testers use stable goals and adaptive dialogue, not fixed transcripts. The kid is playful/exploratory; the parent seeks good results with minimal interaction; the creator values precision and quality. Use synthetic context, not identifying child data.

Revision ceilings are maximum requests, not compulsory calls. Once exhausted, testers accept technically usable results with warnings. All consequential downstream regeneration still consumes the image-request budget; a text revision does not grant additional image allowance.

## 5. Execution modes and limits

| Mode | Text, including manager/testers/judge | Images |
| --- | --- | --- |
| Simulated | Deterministic simulation | Deterministic simulation |
| Balanced | Real | Simulated |
| Real | Real | Real |

Simulation must exercise actual Dify workflow interfaces and application callbacks, persistence, approvals and recovery. Local mocks supplement rather than replace that proof. Branch before provider execution: no real manager/tester call may decide whether a run is simulated. Dify platform quotas may still apply.

| Case | Maximum real LLM requests per run | Maximum real image requests per Real run |
| --- | ---: | ---: |
| 3 pages | 120 | 12 |
| 5 pages | 160 | 14 |
| 8 pages | 220 | 20 |

Balanced permits zero real image requests. Simulated permits zero real provider requests. Bound each simulated run's loops/no-progress behavior, but do not cap the number of separate simulated development runs.

Count manager, specialist, tester, judge, revision and retry calls. Reserve allowance before execution. Audit internal agent calls and hidden plugin retries; retrospective usage alone is not enforcement. Never automatically increase limits. Record model-specific token bounds and controllable retry settings before paid execution. Reuse verified working bindings; do not invent model availability.

Report actual usage, estimates and unavailable cost separately. No exact dollar cap or exactly-once provider billing guarantee is promised. These configuration limits are not paid-execution authorization.

### Pause and recovery

Pause prevents new work; in-flight work may finish and save. Resume uses persisted state without repeating completed work. Retry safe reads/idempotent writes within bounds. Definite provider failures may retry within remaining allowance. Unknown outcomes require trace inspection and recovery of existing outputs before another paid call.

Missing required artifacts/assets, corrupt images, failed storage, invalid authorization, stale identity/dependencies and exhausted limits are technical blockers. Visual inconsistency, imperfect lettering/rendering and other quality shortcomings remain reported warnings. Do not label missing or unsaved output as completion.

## 6. Runner UI and evaluation

Provide mode/persona selection (one or all), progress/current task, warnings/limits, Pause/Resume, conversation/decision history, failures, saved-booklet links and tester/judge reports. Reuse existing viewers, extending them for the new artifacts. No manual mid-run takeover or new agent-authoring UI.

The independent Dify judge receives the brief, dialogue, decisions, artifacts and images. It reports intent adherence, visual consistency, interaction quality and available cost evidence. It cannot approve artifacts, trigger regeneration or block saved-booklet completion. Retain tester feedback separately. Mark simulated assessments as simulated, not real quality evidence.

Distinguish booklet generation completion from evaluation status. A failed judge call must not undo stored generation success, but final experiment acceptance requires the retained reports. API-driven testers assess interaction flow, not human UI usability; browser checks provide separate UI evidence.

## 7. Observable acceptance

| ID | Required evidence |
| --- | --- |
| AC01 | Thirteen specialist contracts, complete instructions/bindings/fixtures, and correct manager delegation and revision routing. |
| AC02 | All three cases and recovery scenarios pass through actual Dify Simulated paths with zero real provider calls. |
| AC03 | All three Balanced cases complete within LLM limits and with zero real image calls. |
| AC04 | Real acceptance proceeds 3 → 5 → 8 pages, each plus cover; each retained run completes without manual repair during that run. |
| AC05 | Required artifacts/images, current approvals, source lineage and run evidence are durably stored; quality warnings do not block completion. |
| AC06 | Pause/restart/recovery, duplicates, concurrent completion, stale results and limits preserve completed work and do not automatically repeat uncertain paid work. |
| AC07 | Tester and independent judge reports cover intent, consistency, cost and interaction quality; UI verification is separately recorded. |
| AC08 | Codex's configuration → test → diagnosis → repair → publish → tool-sync → verify path works without routine manual clicks. |
| AC09 | Local/staging transition is target-verified; production and existing Dify resources are unchanged. |
| AC10 | Failures and linked successors remain inspectable; code repairs are distinguished from agent improvements. |

No production adoption, PDF, unrelated infrastructure, sensitive child data, unlimited paid loops or competing custom Agent Studio is required.
