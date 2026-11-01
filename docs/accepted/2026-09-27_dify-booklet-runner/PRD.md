# Dify booklet experiment — product requirements

**Status:** Accepted product direction. M4 Balanced acceptance completed on 2026-10-27; M5 Real implementation and live acceptance remain incomplete.
**Date:** 2026-09-27
**Tracking:** [Issue #65](https://github.com/karpishe-experiments/agentic-poc/issues/65)
**Delivery roadmap:** [PLAN.md](PLAN.md)

## 1. Outcome and authority

Prove that a Dify-managed agent suite can take an idea through Ali's creative journey to a complete illustrated booklet, with an external tester agent acting as the creator. First prove reliable completion; then evaluate visual consistency, adherence to creator intent, cost, and UX.

The source is [Ali's proposal in PR #26](https://github.com/karpishe-experiments/agentic-poc/pull/26), pinned to [the complete artifact suite at `631f547ec3f7ce375f740dd6f2b1b9aaebbde940`](https://github.com/karpishe-experiments/agentic-poc/tree/631f547ec3f7ce375f740dd6f2b1b9aaebbde940/docs/accepted/2026-08-22_guideline-driven-booklet-workflow-v2). It includes the PRD, PLAN, adoption guide, artifact mapping, orchestration guideline, and fourteen task guidelines. This experiment adopts the creative responsibilities, not every platform choice in that package.

For this experiment, explicit adaptations in this PRD take precedence over the source proposal and the older [POC PRD](../2026-08-01_end-to-end-poc/kids-comic-poc-prd.md). The existing [architecture guide](../../architecture.md) describes the current implementation, not evidence that this target already exists.

### Explicit adaptations

- Replace the application-managed agent runtime and agent administration with Dify. Do not retain a second editable agent registry.
- External persona testers provide creator decisions, explicit reviews and scoped delegation through application rules. The visible journey adapts to their preferred involvement.
- Quality findings are warnings with bounded revisions, not mandatory quality gates.
- Finish at generated story pages and cover. Defer task 14, Book Export Package, PDF, front matter, and back matter.
- Use a clean local and staging application-data baseline. Preserve production and existing Dify resources. Exact destructive targets require verification before execution.
- Reuse useful Booklet persistence and services; do not maintain legacy runtime compatibility solely for this experiment.
- Keep the runner UI simple and reuse existing booklet/artifact viewers where suitable.

These decisions supersede issue #65's earlier preservation requirement and the earlier trial's two-attempt preservation requirement for the planned local/staging reset. They do not authorize an unverified reset now. Preserve a sanitized summary of the prior trial before deletion.

### Experiment development standard

Optimize for fast learning and an observable end-to-end result, not production readiness. Use the smallest implementation that demonstrates the agreed journey. Reuse existing services, deployment, credentials and Dify capabilities; avoid new infrastructure, generic frameworks and duplicate control systems without a demonstrated need.

- **Build the experience:** Codex iterates through implementation, focused tests, authorized deployment, automated feedback and repairs. Catch application defects primarily through repeated Simulated runs, then Balanced runs, before Real acceptance.
- **Run and improve:** Once the runner works, prioritize changes to agents, prompts, delegation and workflows. Record necessary application repairs separately.
- **Quality:** Completion and useful evidence come first. Minimize warnings over time, but require no top-quality score, perfect image/text fidelity, polished UI or zero-warning result. Report inconsistencies during the flow and in tester/judge assessments.
- **Engineering:** Use targeted tests for the named acceptance and recovery cases. No exhaustive edge-case coverage, benchmark program, high availability, distributed execution, enterprise observability or elaborate configuration/version bureaucracy is required. Preserve enough evidence to explain and reproduce a run.
- **Security:** This is a trusted developer/operator experiment, not a public multi-tenant product. Reuse the existing access gate and callback authentication. Do not add a new account/RBAC system, compliance program, penetration-test gate or production threat-modeling project merely for this experiment.
- **Minimum safeguards:** Keep secrets out of committed files and evidence, protect production/unrelated resources, verify destructive targets, enforce operation identity/approval and request limits, and do not automatically repeat uncertain paid calls. These practical protections are not waived by the relaxed development standard.

Milestones are short working checkpoints, not approval ceremonies. Within granted authority, Codex can continue routine edit/test/diagnose cycles without asking about each node or prompt change. Obtain authorization for actions outside that scope; no standing deployment, paid-call or browser-control permission is created by this PRD.

## 2. Journey and suite

Provide one Dify manager, thirteen separately identifiable specialist tasks, image workflows, three external persona testers, and an independent Dify judge. Deliver complete instructions, input/output contracts, bindings, and fixtures rather than prompt placeholders. A task is a distinct responsibility; the technical plan must verify how Dify hosts it without assuming unlimited app capacity.

Prefer independently editable/testable modules; use small, focused groups only
where necessary. Never put the entire suite into one large workflow. Verify
reusable-module capabilities and capacity; thirteen responsibilities do not
require thirteen separate apps. Codex selects and records the simplest verified
layout within these boundaries. Ask again only if the choice changes scope, cost,
workspace plan or preservation requirements. This decision grants no paid-call,
reset, deployment or browser authority.

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

Both members of each list pair must be approved before the next internal gate. All required sheets must be approved before pagination. Approval may come from explicit review or recorded delegation as defined below. Sibling tasks may be prepared in either order. Manuscript units need not map one-to-one to physical pages.

### Adaptive creator interaction and delegation

The thirteen tasks define internal production responsibilities, not thirteen mandatory creator interactions. The manager can group reviews, use agreed defaults and complete delegated production decisions without exposing every intermediate artifact. All artifacts remain saved and inspectable.

| Persona | Default interaction |
| --- | --- |
| Playful Kid | Short playful creative choices, simple language and substantial delegation of production details. |
| Enthusiast Parent | Few high-value questions, sensible defaults and grouped reviews that minimize time invested. |
| Professional Creator | Detailed choices, precise feedback and artifact-level review when useful. |

A persona default guides the tester's behavior; it does not itself grant approval authority. The tester records its chosen delegation through a creator action and can narrow, expand or revoke it during the run. Grouped review identifies the exact artifact versions included. Each page or sheet retains its own approval record even when accepted in a group.

Booklet records the delegation's scope, originating tester decision and changes, and links each delegated acceptance to the exact artifact version and applicable delegation. The application validates that scope before recording acceptance; the manager cannot invent a grant. Completed approvals remain historical when delegation changes; later acceptances use the current scope, and revisions require a new version-specific acceptance.

Ask the tester when a decision exceeds the delegation or materially conflicts with the approved brief. The tester may clarify intent or change its delegation; the manager must not silently override either. Delegation cannot raise request/revision limits or bypass required content, dependency or identity checks. Warning-bearing usable artifacts can advance under valid delegation without repeated approval prompts or forced quality repair.

### Orchestration and revisions

- The manager reads saved context and selects the eligible owning specialist before each material action.
- Specialists clarify material gaps or offer bounded creative options. They do not repeat questions already answered by approved artifacts or conversation.
- Drafts remain unapproved until explicit review or application-validated delegation accepts the exact version. Image generation alone does not imply approval.
- Revisions create new versions and mark only affected downstream work as needing review. Do not silently rewrite approved history.
- A sheet correction that changes a stable fact revises the corresponding Final List first or in the same scoped revision.
- Page Bible and page-image revisions remain page-scoped unless a shared source changed.
- Quality warnings do not make an otherwise usable artifact ineligible for approval. Technical identity, authorization and dependency checks still apply.

### Visual execution

Inject the approved shared style module unchanged into image requests. Attach only relevant approved character/location sheets to final-page requests. Preserve exact approved text in prompts and generate lettering natively; no later text-overlay fallback.

Support page-by-page and selected ordered-batch generation. Batch results remain independently reviewable drafts until explicitly or validly delegated acceptance is recorded for each page. Preserve application-owned stable page IDs, revisioned asset names, prompts and attachment records. Required visual features are production instructions and review criteria; imperfect rendering produces warnings, not an endless regeneration loop.

## 3. Ownership, interfaces and data

| Owner | Responsibility |
| --- | --- |
| Dify | Editable agent definitions, prompts, model bindings, specialists, image workflows, testers and judge. |
| Booklet | Durable IDs, persistence, artifact versions/dependencies, approvals, authorization, request limits, jobs, assets, completion and UI projections. |
| Codex | Authorized configuration/build/test/diagnosis/repair/publication cycle; not an actor repairing an acceptance run. |

Reuse existing booklet, artifact, approval, conversation, job, asset and model-call records where suitable. Add experiment-run records linking persona, fixed brief, mode, booklet, predecessor run, effective configuration evidence, Dify execution/node IDs, decisions, warnings/errors, request reservations, usage/cost, timing, assets and reports. Retain delegation grants/changes and explicit-versus-delegated approval provenance alongside artifact versions.

Configuration snapshots are evidence, not editable local agent definitions. Retire old agent administration and seeding requirements in the runtime transition. No legacy-record migration is required for the approved clean start.

Provide bounded application interfaces for run creation/inspection, Pause/Resume, creator responses and delegation, artifact proposals, provider authorization, image completion/failure, and evidence retrieval. Route them through domain services rather than duplicating lifecycle logic. Tester interfaces cannot use manager-only mutations; neither a manager nor a judge may fabricate creator approval or delegation.

Exact routes, schema fields, Dify node contracts and provider accounting mechanics must be verified in milestone 0 and recorded in the implementation plan before the affected runtime slice. This PRD does not claim those interfaces already exist.

Access readiness is also a prerequisite for dependent work: identify the logins, credential references, published bindings, integrations and execution authorizations required for each environment. Follow the [roadmap's access-readiness matrix](PLAN.md#access-readiness-matrix). Verify non-billable paths first, reuse existing credentials where suitable, and distinguish working technical access from permission to perform a specific operation. A missing dependency blocks only the work that needs it.

## 4. Personas and fixed acceptance cases

| Persona | Brief and output | Layout | Revision ceiling |
| --- | --- | --- | --- |
| Playful Kid | Young inventor and tiny robot rescue a runaway kite; playful and reassuring; readers 6–8; 3 story pages + cover; 2 recurring characters, 1 location. | Single-scene pages. | 1 text, 1 image. |
| Enthusiast Parent | Child and grandparent turn a rainy afternoon into an indoor adventure; warm; readers 3–5; 5 story pages + cover; 2 recurring characters, 1 location. | Includes one simple two-panel page. | 1 text, 1 image. |
| Professional Creator | Two friends repair a community observatory after a disagreement; precise emotional arc; readers 9–12; 8 story pages + cover; 2 recurring characters, 2 locations. | At least two multi-panel pages. | 3 text, 2 images. |

Each physical page is one generated image. With two style samples and all required sheets, initial image outputs are **9, 11 and 15** (35 total), before revisions/retries. Keep briefs within this small cast/location scope. A tester's age/persona is separate from the intended reader age.

Testers use stable goals and adaptive dialogue, not fixed transcripts. The kid is playful/exploratory; the parent seeks good results with minimal interaction; the creator values precision and quality. Each can adjust involvement and delegation without being forced through every internal artifact. Use synthetic context, not identifying child data.

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

Treat preferred story lengths, image dimensions/aspect ratios and rendering details as guidance, not rejection gates when the result remains usable. Report deviations with the saved artifact. Do not reject an otherwise valid result solely for harmless extra content fields or an inaccurate image MIME label; canonicalize supported content and inspect actual image bytes. Required content, valid references and decodable supported images remain necessary. Define concrete storage/decoder bounds in the affected slice rather than building a generic validation framework.

## 6. Runner UI and evaluation

Provide mode/persona selection (one or all), progress/current task, warnings/limits, Pause/Resume, conversation/decision history, failures, saved-booklet links and tester/judge reports. Make delegation and approval provenance inspectable without requiring every internal artifact to appear as a creator-facing step. Reuse existing viewers, extending them for the new artifacts. No manual mid-run takeover or new agent-authoring UI.

The independent Dify judge receives the brief, dialogue, decisions, artifacts and images. It reports intent adherence, visual consistency, interaction quality and available cost evidence. It cannot approve artifacts, trigger regeneration or block saved-booklet completion. Retain tester feedback separately. Mark simulated assessments as simulated, not real quality evidence.

Distinguish booklet generation completion from evaluation status. A failed advisory call must not undo stored generation success. For M4 Balanced acceptance, valid generation and accounting plus a verified terminal tester or judge failure permit completion with evaluation incomplete. Retain the failed attempt, omit a judge dependent on a failed tester, and do not retry the report. Unknown outcomes and unresolved ownership remain blocking. Retained reports remain required for the separately authorized Real acceptance. API-driven testers assess interaction flow, not human UI usability; browser checks provide separate UI evidence.

For M5 Real acceptance, an allowance-exhausted run may pause for a specific
operator approval and continue under a recorded finite allowance. This
approval-only pause does not count as manual repair. Resume alone cannot grant
allowance. A run with manual data or output repair does not satisfy the retained
same-run Real acceptance case; retain its failure and use a separately authorized
linked successor. A budget increase does not resolve an unknown provider outcome.
For a current approval-based Real run, an operator may explicitly approve one
replacement of a terminal unknown image after its deadline expires and current
sources, original bytes and absence of active owners are verified. Preserve its
original outcome and liability, use a new operation identity/deadline, and retain
late evidence without overwriting the replacement. Label accepted completion
"completed with an approved replacement". Each replacement and any additional
allowance needs exact explicit authority; there are no automatic paid retries.

## 7. Observable acceptance

| ID | Required evidence |
| --- | --- |
| AC01 | Thirteen specialist contracts, complete instructions/bindings/fixtures, and correct manager delegation and revision routing. |
| AC02 | All three cases and recovery scenarios pass through actual Dify Simulated paths with zero real provider calls. |
| AC03 | All three Balanced cases complete within LLM limits and with zero real image calls. |
| AC04 | Real acceptance proceeds 3 → 5 → 8 pages, each plus cover; each retained run completes without manual data or output repair. Recorded allowance approvals and an explicitly labelled approved image replacement under section 6 may continue the same run. |
| AC05 | Required artifacts/images, current approvals, source lineage and run evidence are durably stored; quality warnings do not block completion. |
| AC06 | Pause/restart/recovery, duplicates, concurrent completion, stale results and limits preserve completed work and do not automatically repeat uncertain paid work. |
| AC07 | Tester and independent judge reports cover intent, consistency, cost and interaction quality; UI verification is separately recorded. M4 may retain verified terminal advisory failure with evaluation incomplete under section 6; this does not claim report coverage passed. |
| AC08 | Codex's configuration → test → diagnosis → repair → publish → tool-sync → verify path works without routine manual clicks. |
| AC09 | Local/staging transition is target-verified; production and existing Dify resources are unchanged. |
| AC10 | Failures and linked successors remain inspectable; code repairs are distinguished from agent improvements. |
| AC11 | Kid/parent cases complete with delegated internal work and grouped reviews; the creator can retain detailed control. All thirteen responsibilities still execute, and every acceptance has exact-version provenance. |
| AC12 | Delegation changes govern later acceptances; out-of-scope or brief-conflicting actions ask the tester. Delegation cannot bypass technical checks or limits, and quality warnings do not cause endless review loops. |
| AC13 | Required access and authorization are recorded per dependency/environment with verification evidence and outstanding handoffs before dependent execution; secret values are excluded. |

No production adoption, PDF, unrelated infrastructure, sensitive child data, unlimited paid loops or competing custom Agent Studio is required.

## 8. Decision coverage and remaining technical work

This register makes the interview decisions discoverable without requiring the chat history.

| Agreed decision | Requirement location |
| --- | --- |
| Adopt Ali's complete pre-export journey and specialist responsibilities, not the old eight-stage journey | Sections 1–2, J01–J13 |
| Replace local agent management with Dify; retain Booklet authority and reuse/improve its schema | Section 3 |
| Clean local/staging reset; production and existing Dify resources untouched | Section 1, AC09 |
| Codex operates build/verification and then primarily agent improvement | Experiment development standard, AC08/AC10 |
| Unattended persona-driven testing; only Pause/Resume intervention controls | Sections 4–6 |
| Three fixed persona briefs; 3/5/8 story pages plus cover; persona-specific layouts and bounded revisions | Section 4 |
| Two style samples, small fixed cast/locations, all required reference sheets | Sections 2 and 4 |
| Actual Dify Simulated paths, then all Balanced cases, then Real 3 → 5 → 8 | Section 5, AC02–AC04 |
| Reuse verified models; request ceilings include testers/judge/retries; no exact monetary cap | Section 5 |
| Bounded safe recovery; inspect unknown paid outcomes before repeating | Section 5, AC06 |
| Advisory tester and judge feedback; warning-based completion; no quality perfection gate | Sections 1, 5–6, AC05/AC07 |
| Simple runner plus existing viewers; no PDF, front/back matter or new agent editor | Sections 1 and 6 |
| Retain failures, configuration/run evidence and linked repaired successors | Section 3, AC10 |
| Fast experimental implementation, targeted verification and basic safeguards only | Experiment development standard |
| Persona-adaptive visible journey, grouped reviews and traceable delegated approval | Section 2, AC11–AC12 |
| Verify logins, keys, integrations and execution authority before dependent work | Section 3, AC13; roadmap access-readiness matrix |
| Prefer MCP, then inspected CLI, with authorized Chrome control last | Roadmap M0 and detailed M0 plan |
| Prefer maintainable modules; the single giant workflow is not accepted | Section 2; M0 packaging decision |

Product decisions above are accepted. Exact Dify packaging, model IDs/token bounds, per-request accounting, API schemas and local/staging setup are technical work in milestone 0 and the affected slices, not evidence of completed capability. If a verified limitation requires changing an accepted product decision, return that specific tradeoff to the user rather than silently reducing the journey or increasing limits.
