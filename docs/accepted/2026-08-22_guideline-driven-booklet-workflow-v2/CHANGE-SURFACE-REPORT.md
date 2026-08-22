# Guided-v2 change-surface report

**Reviewed:** 2026-08-22  
**Baseline:** Current `legacy` Kids Booklet implementation at the time of review
**Requirement source:** [`guideline-driven-booklet-workflow-v2-prd.md`](guideline-driven-booklet-workflow-v2-prd.md)  
**Implementation source:** [`PLAN.md`](PLAN.md)

## 1. Executive assessment

The current application is a strong platform baseline for `guided-v2`, but its workflow schema is not extensible enough to represent the new workflow without deliberate branching. The persistence, immutable artifact versions, scoped approvals, manager/specialist split, agent evidence, sequential jobs, selective retry, filesystem assets, and PDF assembly are reusable. The current eight-value artifact enum, single global stage order, closed seven-skill registry, stage-specific `ChatService` branches, and legacy-shaped UI are the principal constraints.

The recommended approach is **not** to stretch the existing legacy artifact documents until they contain v2 fields. Add a persisted workflow discriminator and a workflow registry, preserve the current schemas and handlers as the `legacy` implementation, and introduce v2 artifact contracts and materializers beside them. Shared repositories and services should accept workflow-aware definitions rather than importing one global artifact list.

| Assessment | Meaning for v2 |
| --- | --- |
| Reuse | MongoDB repository boundaries, immutable versions, approvals, model-call evidence, persisted jobs, retry/continue mechanics, asset storage, provider adapters, and PDF byte assembly. |
| Extend | Booklet documents, artifact identity/contracts, dependency derivation, cards, image requests, export records, agent seeding/verification, and workspace selection. |
| Add | Workflow registry, thirteen skill contracts/materializers, v2 artifact schemas, package collection semantics, eligible-reference catalogue, Final Page Bible, page-scoped candidate lineage, additive seed command, and v2 fixtures/evaluations. |
| Preserve | All current legacy records, stage values, seven specialist definitions, APIs, typed-card flow, and resume behavior. |

This is a broad but concentrated change. The greatest risk is not MongoDB or the model runtime; it is allowing the new workflow to leak into global closed enums and legacy-specific service branches, which would make compatibility difficult to prove.

## 2. Current implementation model

### 2.1 Booklets and workflow state

`lib/contracts/booklets.ts` persists `currentStage` but has no `workflowVersion`. `db/documents.ts` mirrors that shape, and `db/repositories.ts` always creates a booklet at `audience_profile`. Existing rows are parsed through the legacy `artifactTypeSchema`.

The current flow is globally defined by `BOOKLET_ARTIFACT_TYPES` in `lib/contracts/domain.ts`:

```text
audience_profile → story_plan → visual_style → visual_bible
→ booklet_specification → page_plan → final_pages → pdf_export
```

`BookletService` creates all eight artifact rows from that constant. `ArtifactService` uses the same constant to validate completeness and derive `currentStage` as the first artifact not approved. This is correct for legacy, but there is currently no seam for selecting an ordered artifact set by booklet workflow version.

### 2.2 Artifact persistence and approvals

The reusable foundation is substantial:

- Artifact versions are immutable and retain `sourceVersionId`.
- Dependencies point to exact upstream version IDs.
- Approval records support artifact, content, reference, and page scopes plus `subjectKey`.
- Upstream revisions can invalidate downstream work.
- `Visual Bible` already requires content approval followed by reference-level approvals.
- `Final Pages` already requires every page-level approval before artifact approval.

The limitation is that schemas and dependency rules are a single closed map. `artifactDocumentSchemas` is a `Record<ArtifactType, ZodType>`, while `ArtifactService` owns one legacy dependency map and embeds legacy-only validation for Story Plan IDs, Visual Bible references, Booklet Specification, Page Plan, and Final Pages.

### 2.3 Agents and skills

The runtime architecture already matches the v2 authority boundary:

- One persisted manager receives only eligible tools.
- One bounded specialist is called for a material turn.
- Specialists return validated proposals and cannot persist state.
- Application services materialize IDs, artifacts, approvals, jobs, and transitions.
- Model calls retain resolved definition/version and effective configuration evidence.

The current skill contract is nevertheless closed to seven legacy IDs in `lib/contracts/skills.ts`, and `lib/skills/default-registry.ts` registers only those skills. `ChatService` constructs input and materializes output through a nested set of legacy stage checks. Adding thirteen IDs to the enum is straightforward; safely routing and materializing them requires replacing the single legacy branch chain with workflow-specific handlers.

### 2.4 Image generation, jobs, and assets

The current implementation already has:

- Character, location, and style reference roles.
- Up to eight references on an image request.
- Provider-native reference inputs.
- Ordered persisted generation items.
- Single-item and selected-page jobs.
- Selected retry, explicit Continue, and restart recovery.
- Candidate asset creation and replacement lineage.
- Prompt, request, job, model-call, latency, usage, and cost evidence.

There is one important contract mismatch: `imageRequestSchema` treats any request with references as an `edit`. A v2 final page is conceptually **reference-backed generation**, not editing an existing page. The operation/mode contract must distinguish fresh generation with input references from targeted edit/regeneration.

Current page generation reads reference IDs directly from the legacy Page Plan, truncates them to the provider limit, and assigns roles heuristically. V2 instead requires an application-built eligible catalogue, specialist selection from that catalogue, rejection rather than truncation, required-subject coverage, and persisted attachment roles/build records.

### 2.5 UI and routes

The workspace rail, selected artifact parsing, home-stage labels, artifact viewer, cards, and API route validation all import the global legacy artifact type. The artifact viewer also contains specialized legacy renderers and exposes an advanced JSON editor.

The existing route shapes can mostly be retained, but their artifact parameter validation must become booklet-aware. A string that is a valid v2 artifact is not valid for a legacy booklet, and vice versa. Package stages and Final Page Illustrations also need item-scoped actions that do not fit a single whole-artifact approval button.

## 3. Schema fit by requirement

| PRD surface | Current fit | Required change |
| --- | --- | --- |
| `workflowVersion` with missing values normalized to `legacy` | Missing | Add `legacy | guided-v2` to the public booklet contract and MongoDB document. Normalize absent values on read; create new booklets explicitly as `guided-v2`. Do not rewrite old rows merely to read them. |
| Workflow-specific ordered stages | Missing | Add a code-owned workflow registry containing stage IDs, labels, artifact schemas, dependencies, completion rules, eligible skills, and route/card capabilities. Preserve the existing order as the legacy definition. |
| Fourteen v2 stages | Missing | Add thirteen artifact stages plus application-owned export. Do not replace the legacy artifact enum globally without a compatibility-aware union and per-workflow validation. |
| Versioned artifacts and exact dependencies | Reusable | Generalize artifact creation and stage derivation to use the selected workflow definition. Retain current immutable-version and dependency records. |
| Concept Brief | Partial | Audience Profile and Story Plan contain some fields, but v2 needs a distinct faithful-source-prompt, premise, arc, safety/representation, tone, constraints, and deferred-decisions schema. |
| Story Outline | Partial | Story Plan provides beats, entities, arc, ending, and continuity, but the v2 outline must avoid unapproved visual/layout decisions and preserve causal beat structure as its own artifact. |
| Two Character Lists | Missing | Add distinct outline-derived and manuscript-derived contracts. The second owns downstream recurrence/continuity/package routing. They must not alias the current Story Plan character array. |
| Page-by-Page Manuscript | Partial | Legacy Page Plan mixes reader copy, composition, references, and layout. V2 needs a manuscript-only artifact with child-facing text and story requirements, deliberately excluding unapproved visual/layout details. |
| Visual Style Package | Partial | Legacy Visual Style captures direction and style assets. Extend into a v2 schema with immutable shared prompt module, diagnostic sample purposes, approved sample IDs, exact prompts, and build records. |
| Character/Location package collections | Partial | Legacy Visual Bible has individually keyed definitions and scoped reference approvals. V2 needs separately versioned package entries or clearly addressable entries inside an immutable stage version, routed from approved lists, each with profile, local prompt module, build record, current asset, replacement history, and scoped approval. |
| World / Setting Guide | Missing | Add a distinct reusable-world-facts artifact. Do not fold it into Required Locations; they have different source and completion rules. |
| Required Locations List | Partial | Story Plan settings exist, but v2 needs manuscript-derived recurrence, continuity, and package routing. |
| Pagination & Layout Plan | Partial | Legacy Booklet Specification and Page Plan provide page count, geometry, page order, and normalized text regions. Add physical-page mapping, working pixels, trim/bleed/live-text assumptions, page-turn purpose, and source-package routing. |
| Final Page Bible | Partial | Legacy Page Package lettering already has exact text, form, speaker, delivery, and placement hints. Promote and expand this into its own approved artifact with exactly one entry per physical page, hierarchy, visual treatment, and explicit no-text support. |
| Final Page Illustrations | Partial | Legacy Final Pages stores source/composed assets and page approvals. Add composition brief, eligible/selected references and roles, final prompt/build record, candidate/final lineage, review results, and page-level version/replacement state. |
| Explicit PDF export | Partial | Export assembly and records exist. Gate export on current scoped approval for each physical page, expose an explicit action, persist ordered source IDs and preflight/evidence, and avoid coupling export to automatic artifact advancement. |

## 4. File-level change surface

### 4.1 Contracts and workflow definitions — high change

| Existing file | Change |
| --- | --- |
| `lib/contracts/domain.ts` | Introduce `workflowVersionSchema`; separate legacy stage identity from the v2 stage union; stop treating one enum as the only workflow order. Keep legacy values stable. |
| `lib/contracts/booklets.ts` | Add `workflowVersion` to booklet and workspace schemas. |
| `lib/contracts/artifacts.ts` | Keep legacy document schemas; add or import v2 contracts rather than widening legacy documents. Provide workflow-aware parsing. |
| `lib/contracts/skills.ts` | Add thirteen v2 skill IDs and workflow-aware stage context. Existing `stage: artifactTypeSchema` is insufficient. |
| `lib/contracts/cards.ts` | Make artifact targets workflow-aware; add package queue, generation-mode selection, selected-pages, page draft review, and explicit-export variants/actions. |
| `lib/contracts/images.ts` | Add reference-backed generation semantics, richer attachment roles/build metadata, and validation that rejects unsupported/excess/ineligible attachments. |
| `lib/contracts/regeneration.ts` | Extend targets for v2 package and final-page candidates while preserving current legacy targets. |

Recommended new modules:

- `lib/workflows/registry.ts`
- `lib/workflows/legacy.ts`
- `lib/workflows/guided-v2.ts`
- `lib/contracts/guided-v2/artifacts.ts`
- `lib/contracts/guided-v2/skills.ts`
- One small contract module per complex package/page artifact if the combined file becomes difficult to review.

The registry should be static application code, not model-authored data. It should answer: valid stages, order, artifact schema, upstream dependencies, completion policy, valid scoped approvals, eligible skills, labels, and UI capabilities.

### 4.2 MongoDB documents and repositories — medium change

| Existing file | Change |
| --- | --- |
| `db/documents.ts` | Add optional `workflowVersion` to stored booklet documents so historical documents remain readable. |
| `db/repositories.ts` | Normalize absent workflow version to `legacy`; persist `guided-v2` for new booklets; accept workflow-specific initial artifacts and stage identity. |
| `db/indexes.ts` | Review indexes for workflow/stage queries; no migration is justified unless a real query requires a new index. |
| `db/agent-repository.ts` | Reuse versioned definitions and lifecycle records; no destructive behavior. |
| `db/agent-defaults.ts` | Leave legacy defaults unchanged. Do not mix the additive v2 seed into legacy initialization semantics. |
| `db/seed.ts`, `db/verify.ts` | Add workflow-complete coverage checks while retaining historical rows and exactly one active manager. |

Recommended additions:

- `db/guideline-agent-defaults.ts` containing only deterministic v2 specialist seed manifests.
- `scripts/seed-guideline-agents.ts` implementing `db:seed-guideline-agents` as insert-or-verify, never update/deactivate/retire/delete.

No new database is required. Current artifact, approval, dependency, job, item, asset, export, card, message, and model-call collections can support v2 if their discriminators and payload contracts become workflow-aware. Package-entry lookup may justify denormalized keys or indexes, but the PRD does not require a generic package collection or repository framework.

### 4.3 Application services — high change

| Existing file | Change |
| --- | --- |
| `lib/application/booklet-service.ts` | Create new booklets as `guided-v2`; initialize artifacts from the workflow registry; order snapshots using the booklet workflow. |
| `lib/application/artifact-service.ts` | Replace the single dependency map and global order with workflow definitions. Move legacy cross-artifact checks into a legacy validator and add v2 validators/materializers. Preserve immutable versions and current scoped approvals. |
| `lib/application/chat-service.ts` | Replace nested legacy stage branches with a workflow/stage handler dispatch. Each handler assembles authoritative input, invokes one skill, validates output, materializes deterministic IDs, persists a draft, and creates the review card. |
| `lib/application/skill-context.ts` | Carry workflow version and a workflow-specific stage ID without weakening route validation. |
| `lib/application/manager-service.ts` | Reuse one-skill routing; filter the registry using both workflow and stage. |
| `lib/application/agent-resolver.ts` | Reuse snapshot resolution; require active coverage for registered legacy and v2 skills. |
| `lib/application/entity-materialization.ts` | Extend deterministic ID assignment to character/location package identities, manuscript units, physical pages, Page Bible items, and candidates. Models still cannot supply durable IDs. |
| `lib/application/generation-service.ts` | Split legacy generation from a v2 orchestration path or delegate to workflow-specific planners. Add source preflight, eligible catalogue construction, validated reference selection, page/batch job creation, draft candidate publication, page approval/revision, and build records. |
| `lib/application/export-service.ts` | Accept workflow-specific approved-page projections; enforce all current v2 page approvals; preserve explicit invocation and ordered physical pages. |
| `lib/application/card-service.ts` | Add v2 package/page/export response handlers and ensure duplicate-submit protection remains intact. |
| `lib/application/revision-service.ts` | Add v2 invalidation rules and package/page targeted revision without mutating approved candidates. |
| `lib/application/quality-service.ts` | Expose the v2 final-page checklist and persist results; do not silently approve or automatically retry paid work. |

The safest internal shape is a small `WorkflowDefinition` plus explicit stage handlers, not a generic workflow engine. That preserves the POC's deterministic authority without introducing infrastructure excluded by the PRD.

### 4.4 Runtime skills and agent seeds — high additive change

Add thirteen skill implementations under `lib/skills/`, each with:

- A versioned ID.
- Input/output Zod schemas.
- Eligible workflow/stage metadata.
- Deterministic fake behavior.
- A bounded specialist output only.
- An application materializer owned outside the skill.

`lib/skills/default-registry.ts` can remain the aggregate registry if `SkillDefinition` includes workflow eligibility. The seven legacy registrations must remain byte-for-byte behaviorally compatible.

The manager remains shared. The v2 seed adds thirteen confirmed specialist definitions using the required provider, model, reasoning, and turn settings. It must not reuse ordinary initialization if initialization updates or reconciles existing records; the additive command has a stricter insert-or-verify contract.

### 4.5 Images, jobs, and export — medium-to-high change

The provider interface and runner are reusable. The new work is predominantly preflight and metadata:

1. Resolve current approved source versions for the selected page.
2. Build an eligible reference catalogue from approved style samples, character sheets, location sheets, and explicitly relevant approved pages.
3. Give only this catalogue to the illustration specialist.
4. Validate its selection for required subjects, setting, relevance, catalogue membership, and provider limit.
5. Assemble the prompt deterministically, preserving the approved style module and Page Bible wording verbatim.
6. Persist the exact prompt, attachment IDs/roles, source versions, provider request, and candidate lineage before/with the job item.
7. Send the selected images as provider inputs in reference-backed generation mode.
8. Publish output as an unapproved candidate; never replace the current approved asset until a successful targeted revision is approved.

The current pause/retry/Continue runner behavior already matches v2 closely. Batch needs a creator-selected ordered subset and must never imply approval. The existing job-item persistence should be extended, not replaced.

PDF byte assembly through `pdf-lib` and filesystem assets is reusable. V2 needs a workflow-specific projection of approved physical pages and stricter preflight/evidence, not a second PDF engine.

### 4.6 UI and routes — high change

| Existing surface | Change |
| --- | --- |
| `components/home/create-booklet-form.tsx` | No creator-facing workflow picker; all new creations become `guided-v2`. |
| `components/home/booklet-list.tsx` | Resolve stage labels from each booklet's workflow. Optionally identify legacy projects without encouraging migration. |
| `components/workspace/artifact-rail.tsx` | Render ordered stages and package/page subitems from the workflow definition. |
| `components/workspace/workspace-shell.tsx` | Use workflow labels/capabilities and pass workflow-aware selections. |
| `components/workspace/artifact-viewer.tsx` | Add typed creator views for every v2 artifact, package queue, Page Bible, candidate gallery, page review, and export. Preserve legacy renderers. Avoid relying on raw JSON as the normal v2 approval experience. |
| `components/cards/card-registry.tsx` | Render new typed variants with finite application-owned components. |
| `components/workspace/job-progress-panel.tsx` | Show selected batch, failed item, explicit retry, and explicit Continue while retaining existing recovery coordination. |
| `app/booklets/[bookletId]/page.tsx` | Validate selected artifact against the booklet's workflow registry. |
| Artifact API routes | Parse the booklet first, then validate the artifact key against its workflow. |
| Generation routes | Add explicit page/selected-pages commands and scoped page approval/revision endpoints or equally explicit typed-card actions. |
| Export route/action | Expose explicit export only after server-side page-approval preflight. |

Route validation must be server-authoritative. Hiding an invalid button is not sufficient to enforce current dependencies, reference eligibility, approvals, or workflow compatibility.

### 4.7 Tests and retained evidence — high additive change

Retain the existing legacy tests. Add:

- Workflow-version normalization and new-booklet default tests.
- Legacy snapshot/stage/API regression coverage.
- Workflow registry ordering, dependency, completion, and invalid-stage tests.
- Schema and deterministic materialization tests for all thirteen skills.
- Manager stage filtering and one-skill-per-turn v2 fixtures.
- Additive seed idempotency with pre-existing legacy/custom/history rows.
- Package routing and scoped approval tests.
- Upstream revision and stale-package invalidation tests.
- Eligible-reference catalogue and required-reference rejection tests.
- Exact Page Bible text propagation and no-overlay assertions.
- Eight-reference rejection rather than silent truncation.
- One-page and selected-batch job tests.
- Draft candidate, individual approval, failed item, retry, explicit Continue, and restart tests.
- Export rejection before all scoped approvals and retry without image regeneration.
- Desktop Playwright paths for new guided creation and legacy resume.
- Three retained guided-v2 evaluations with rendered PDF inspection and model/image cost evidence.

The current test suite and fake providers are strong reusable infrastructure. The main adjustment is fixture shape and workflow-aware setup, not a new test framework.

## 5. Requirement traceability summary

| PRD acceptance criterion | Primary code surface | Status before implementation |
| --- | --- | --- |
| Guideline copies remain exact | `docs/.../task-guidelines/`, verification script/test | Files present; byte-source verification mechanism not identified. |
| New `guided-v2`; legacy resumes unchanged | booklet contract/document/repository, workflow registry, workspace | Missing discriminator and registry. |
| One eligible persisted specialist per turn | manager, registry, resolver, evidence | Architecture reusable; thirteen skills and v2 filtering missing. |
| Thirteen contracts, fake fixtures, routing, materialization | contracts, skills, fake runtime, chat/stage handlers, tests | Missing. |
| Current dependencies and explicit/scoped approval | artifact service/repository | Generic foundation present; v2 rules missing. |
| Package prompts, assets, build and replacement history | v2 schemas, generation, assets | Partial lineage foundation; package artifacts/build records missing. |
| Reject stale/missing/unrelated references | eligible catalogue and generation preflight | Partial current validation; v2 catalogue and strict rejection missing. |
| Single and batch generation with per-page approval | cards, generation jobs, artifact approvals | Selected page jobs and page approvals partially reusable; explicit modes and batch draft semantics missing. |
| Exact Page Bible text and native rendering | Page Bible, prompt assembly, image request | Legacy lettering partially reusable; separate Bible and exact-propagation proof missing. |
| Retry/Continue/restart without loss | runner, jobs, UI | Largely reusable; v2 batch integration and tests required. |
| Explicit gated PDF export | export service, UI/action, approval preflight | PDF engine reusable; v2 gate/action/evidence missing. |
| Additive idempotent agent seed | agent repository, new seed command, verification | Repository foundation present; command and nondestructive proof missing. |
| Full checks and three evaluations | tests, scripts, `evaluations/` | Legacy infrastructure/evaluations exist; v2 coverage/evidence missing. |

## 6. Compatibility boundaries

These boundaries should be treated as invariants during implementation:

1. Missing `workflowVersion` means `legacy`; it is not an error and does not trigger migration.
2. Existing artifact and skill identifiers retain their meaning.
3. Legacy booklets initialize, resume, revise, generate, recover, and export through their current rules.
4. The v2 seed never updates, deactivates, retires, or deletes an existing agent record.
5. There remains exactly one active manager shared across workflows.
6. Routes validate a requested stage/artifact against the target booklet's workflow.
7. V2 upstream revisions cannot cause automatic paid image regeneration.
8. Draft v2 pages never become continuity references.
9. Application code remains the only authority for durable IDs, persistence, approvals, dependencies, jobs, assets, and transitions.
10. PDF and raster composition never add or repair reader-facing text after image generation.

## 7. Recommended implementation sequence

1. **Workflow discriminator and registry:** add read normalization, guided creation, legacy definition, and regression tests without changing visible legacy behavior.
2. **V2 artifact contracts and graph:** add schemas, deterministic IDs/materializers, dependency rules, initialization, scoped completion, and artifact tests.
3. **Thirteen skills and additive seed:** add closed contracts, fake implementations, persisted configurations, safe seed/verify, manager filtering, and fixtures.
4. **Planning vertical slices:** implement Concept Brief through manuscript, then style/character packages, then world/location packages, with typed review cards and approvals at each usable slice.
5. **Pagination and Final Page Bible:** introduce physical-page mapping and exact text authority before touching final image generation.
6. **Reference-backed final generation:** add eligible catalogue, strict selection validation, prompt/build records, provider mode, single-page and batch jobs, page review, and recovery.
7. **Explicit export:** gate on all current page approvals, reuse PDF assembly, and retain export evidence/retry.
8. **Compatibility and acceptance:** legacy resume golden path, guided golden path, database verification, full checks, and three paid evaluations only after an explicit cost report/approval.

This order creates usable vertical slices and postpones paid image work until the deterministic workflow and approvals are proven.

## 8. Decisions and clarifications to resolve before runtime work

The PRD and plan determine most architecture choices. The following implementation details should be resolved in the first contract slice rather than improvised in UI or prompts:

1. **V2 artifact identifiers:** choose stable snake-case IDs and decide whether repeating package stages use one artifact with scoped entries or parent plus child records. The existing repository favors one immutable stage artifact with scoped approvals; separate package records may improve targeted versioning but expand repository/API surface.
2. **Physical-page model:** define whether cover, end matter, and story pages share one physical-page union. The PRD requires one entry per physical page, so all downstream code must use the same ordered identity.
3. **Reference-backed provider operation:** name the operation/mode so fresh generation with references cannot be confused with targeted editing.
4. **Final Page Bible source guidance:** record the exact approved source for the additional specialist because the copied task-guideline directory contains an illustration guideline but not a separate Final Page Bible file.
5. **Package replacement history:** decide whether it is represented through immutable artifact versions plus asset lineage alone or an explicit structured history list. Avoid two competing authorities.

None of these require a production workflow engine, relational redesign, or migration of existing booklets.

## 9. Overall conclusion

The guided PRD matches the **architectural philosophy** of the current code very well: bounded agents, deterministic application authority, typed decisions, immutable artifacts, persisted recovery, evidence, and explicit creator control are already present. It does **not** match the current closed workflow schema. The implementation should therefore preserve and reuse the platform while introducing workflow-aware contracts and dispatch at its core boundaries.

The critical design move is to make workflow version an input to artifact ordering, parsing, dependency validation, skill eligibility, materialization, routes, cards, and UI rendering. Once that seam exists, most of the remaining work is additive: new schemas, skills, stage handlers, package/page views, reference preflight, and tests. Without that seam, adding thirteen stages directly to the current global enums would put legacy compatibility and acceptance evidence at unnecessary risk.
