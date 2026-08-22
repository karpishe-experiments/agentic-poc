# Guideline-Driven Booklet Workflow v2 PRD

**Status:** Draft based on the approved v2 implementation plan; requires explicit PRD approval before runtime implementation.

**Prepared:** 2026-08-22  
**Implementation plan:** [`PLAN.md`](PLAN.md)  
**Current-code review:** [`CHANGE-SURFACE-REPORT.md`](CHANGE-SURFACE-REPORT.md)
**Task guidance:** [`task-guidelines/`](task-guidelines/)

## 1. Product summary

Guideline-Driven Booklet Workflow v2 is the default workflow for newly created Kids Booklet projects. It turns a creator’s free-form idea into an approved, print-aware illustrated children’s book through a sequence of typed, persistent, creator-approved artifacts.

The workflow replaces the planning path for new booklets, not the historical data model for existing work. Existing eight-stage booklets continue as `legacy`; they are neither migrated nor altered. New booklets use `guided-v2` and retain the project’s existing local-first TypeScript, MongoDB, OpenAI, filesystem-asset, recovery, evidence, and PDF-export foundations.

The workflow must demonstrate that bounded specialists can apply the supplied task guidelines while deterministic application services retain authority over artifacts, approvals, identifiers, image jobs, asset records, and stage transitions.

## 2. Goals and non-goals

### 2.1 Goals

1. Guide a creator from a raw book idea to an approved, downloadable illustrated booklet through explicit, reviewable artifacts.
2. Preserve the supplied guideline documents verbatim as the durable source of task intent.
3. Provide one bounded, versioned MongoDB-backed specialist for every guideline task and one additional Final Page Bible specialist.
4. Keep story, cast, location, style, page text, and image-reference decisions consistent across the complete booklet.
5. Let the creator choose one-at-a-time or batch final-page image generation, while retaining per-page review and approval.
6. Generate final page text natively in the page image from an approved Page Bible; never add copy as a post-generation overlay.
7. Require explicit creator-triggered PDF export only after every final physical page is approved.
8. Preserve legacy booklets and their runtime agents without migration, deletion, deactivation, or data loss.

### 2.2 Non-goals

- Editing or rewriting the copied guideline contents.
- Migrating legacy booklets into `guided-v2`.
- Deleting, retiring, or replacing existing MongoDB agent records.
- Authentication, collaboration, public publishing, payments, commercial printing integrations, or production operations.
- Arbitrary print sizes beyond the application’s current three supported geometries.
- User-uploaded reference images, generic asset libraries, manual image compositing, OCR correction, or post-generation text overlays.
- Automatic PDF export, automatic approval, or automatic retry of failed paid image work.

## 3. Source precedence

For `guided-v2`, apply sources in this order:

1. Explicit creator decisions captured through typed cards.
2. This approved PRD and its approved implementation plan.
3. The copied task guideline applicable to the current task.
4. The copied artifact-structure document.
5. Legacy POC documents, only for retained platform behavior and compatibility.

Where the guideline documents conflict with each other, the following project decisions apply:

- The outline-derived Character List and manuscript-derived Character List are separate tasks.
- The World / Setting Guide runs before the Required Locations List.
- Batch final-page generation creates unapproved drafts; every page is still reviewed and approved separately.
- PDF generation is an explicit application action, not a specialist decision.

## 4. Creator workflow

New booklets use the following fixed ordered flow. Every artifact begins as a draft, is revisionable, and advances only after the creator approves the current version or required scoped items.

| Order | Artifact | Specialist task | Completion rule |
| --- | --- | --- | --- |
| 1 | Book Concept Brief | Book Concept Brief | Creator approves a concise concept with audience, premise, constraints, and deferred decisions. |
| 2 | Story Outline | Story Outline | Creator approves causal narrative beats and emotional arc. |
| 3 | Outline Character List | Outline Character List | Creator approves the early story-relevant cast record. |
| 4 | Page-by-Page Manuscript | Page-by-Page Manuscript | Creator approves child-facing manuscript text and per-page story requirements. |
| 5 | Manuscript Character List | Manuscript Character List | Creator approves the manuscript-derived cast and package routing. |
| 6 | Visual Style Package | Visual Style Package | Creator approves the style definition, immutable shared prompt module, and validation samples. |
| 7 | Individual Character Packages | Individual Character Package | Every routed recurring character has an approved profile, module, sheet, and build record. |
| 8 | World / Setting Guide | World / Setting Guide | Creator approves stable reusable setting facts. |
| 9 | Required Locations List | Required Locations List | Creator approves manuscript-derived location routing. |
| 10 | Location Definition Packages | Location Definition Package | Every routed recurring location has an approved profile, module, sheet, and build record. |
| 11 | Pagination & Layout Plan | Pagination & Layout Plan | Creator approves physical-page order, canvas, live-text area strategy, and source routing. |
| 12 | Final Page Bible | Final Page Bible | Creator approves exact text, form, speaker, hierarchy, and placement for each physical page. |
| 13 | Final Page Illustrations | Final Page Illustration Package | Every physical page has an approved final natively lettered image and reproducible build record. |
| 14 | PDF Export | Application-owned export | Creator explicitly starts export after all final pages are approved. |

The UI must render the stage rail, current stage, artifact views, cards, and route validation from the booklet’s workflow version. Legacy booklets retain the legacy stage rail and APIs.

## 5. Artifact and approval requirements

### 5.1 General artifact rules

- Every artifact is a versioned MongoDB record with immutable prior versions, explicit upstream version dependencies, state, and approval provenance.
- Agents may return validated structured proposals only. Application code assigns all durable IDs, persists content, creates jobs and assets, validates dependencies, and derives stages.
- Revising an approved upstream artifact marks affected downstream artifacts as needing review; no downstream image job runs against stale dependencies.
- Typed review cards present the material decision, revision path, and recovery path. Free-form agent prose is not authoritative state.
- Character and location packages are collections of individually addressable entries. A one-off character or location remains page-level information unless the approved routing requires a reusable package.

### 5.2 New structured artifacts

The application must define Zod contracts and deterministic materializers for all `guided-v2` artifacts. At minimum, each contract records the source artifacts, approval state, human-readable content, and structured fields required by downstream services.

- **Book Concept Brief:** audience, faithful source prompt, premise, emotional arc, representation/safety constraints, tone, and deferred decisions.
- **Story Outline and manuscript:** causal beats; required action, characters, setting, and reader-facing text by manuscript unit; no unapproved visual or layout details.
- **Character and location records:** narrative role, recurrence, continuity need, routing, package identity, and approved package/source references.
- **Visual Style Package:** style definition, immutable reusable style prompt module, diagnostic sample purposes, approved sample asset IDs, and sample build records.
- **Character and Location Packages:** stable profile, local prompt module, exact assembled prompt, approved reference-sheet asset ID, source artifact versions, and approval/version record.
- **Pagination & Layout Plan:** physical pages, story-to-physical-page mapping, geometry, working pixels, trim/bleed/live-text assumptions, page-turn purpose, and source-package routing.
- **Final Page Bible:** exactly one entry per physical page with either the exact textual items or an explicit no-text decision. Each item records wording, text form, speaker when applicable, hierarchy, placement, and visual treatment.
- **Final Page Illustrations:** per-page composition brief, selected reference assets and roles, final prompt record, generated candidate/final asset lineage, review results, and scoped page approval.

## 6. Specialist and runtime requirements

### 6.1 Bounded specialist model

The existing manager remains the sole active manager. It receives only stage-eligible skill tools and must call exactly one eligible tool for a material turn. Each new task receives a specialist configuration persisted in MongoDB; schemas, tool bounds, fake behavior, application materialization, and stage transitions remain code-owned.

The thirteen new specialist skills are:

1. `book_concept_brief@1`
2. `story_outline@1`
3. `outline_character_list@1`
4. `page_by_page_manuscript@1`
5. `manuscript_character_list@1`
6. `visual_style_package@1`
7. `individual_character_package@1`
8. `world_setting_guide@1`
9. `required_locations_list@1`
10. `location_definition_package@1`
11. `pagination_layout_plan@1`
12. `final_page_bible@1`
13. `final_page_illustration_package@1`

Each initial specialist seed uses provider `openai`, model `gpt-5.6-terra`, medium reasoning effort, and a one-turn limit. Its versioned instruction must apply its paired guideline while obeying the shared application boundary: no direct persistence, no approvals, no stage changes, no invented durable IDs, no arbitrary tools, and no text outside its structured result.

### 6.2 Additive seed behavior

- Add `db:seed-guideline-agents` as an idempotent additive command.
- It inserts or verifies only the deterministic new definitions, confirmed active versions, and lifecycle events.
- Existing manager/specialist definitions, versions, events, drafts, and custom records remain unchanged.
- Verification requires exactly one active manager and exactly one active specialist for every registered legacy and `guided-v2` skill. Historical records remain valid.

## 7. Image-generation requirements

### 7.1 Reference selection and prompt assembly

Before generating a final page, the application must verify that the approved Page Bible, manuscript entry, pagination entry, visual style package, and all required character/location packages exist and are current.

The Final Page Illustration specialist receives a constrained catalogue of only approved, eligible source assets and artifacts for each selected physical page. It selects the required character sheets, required location sheet, and only relevant optional style validation samples. Application code rejects:

- missing required character or location packages;
- assets not present in the eligible catalogue;
- unrelated cast/location sheets;
- more references than the provider’s supported limit;
- a reference selection inconsistent with the page’s required subjects or setting.

The final request must send the selected assets as actual image inputs. It must include the unchanged approved style module, the page-only composition brief, every Page Bible text item verbatim, its form and placement, and page-specific continuity constraints. The final image model must render all readable text natively; no later raster/PDF text overlay is allowed.

### 7.2 Generation modes and reviews

- The creator chooses **Generate this page** or **Generate selected pages** from a typed card.
- Single-page mode creates one persisted job item and returns its candidate for review.
- Batch mode creates a persisted ordered job for the selected pages. All candidates remain drafts until individually approved.
- A failed item pauses the job. The creator may retry only that item, then explicitly continue the remaining queue. Restart recovery preserves completed candidates and restores interrupted work safely.
- Draft candidates never become references for other draft pages. Approved pages may be used as continuity references only when the final-page guidance explicitly makes them relevant.
- Each approved final page is immutable until the creator requests a targeted revision; revision creates a new candidate, build record, and page approval requirement.

### 7.3 Quality gates

The final-page review must make these checks visible: canvas dimensions, required story action, exact/legible text, text-safe composition, character continuity, location continuity, visual-style continuity, safety, prohibited additions, watermark/extra-text absence, and complete attachment/build-record lineage.

## 8. PDF export requirements

- Export is available only after every physical page in the Final Page Illustrations artifact has a current scoped approval.
- Export preserves the Pagination & Layout Plan’s approved physical-page order and geometry.
- The application records the source final-page artifact version, ordered page asset IDs, preflight checks, export status, PDF asset, and evidence summary.
- Export failure does not invalidate approved page assets. The creator can retry export explicitly.

## 9. Persistence, evidence, and recovery

- `workflowVersion` is persisted on booklets. Existing records without the field normalize to `legacy`; new records are `guided-v2`.
- Database documents remain MongoDB-driver managed and transactionally consistent within existing repository boundaries.
- Every specialist call records its selected skill, model/provider, resolved agent definition/version, immutable configuration snapshot, trace/request identity, latency, usage, cost estimate or actual cost, and structured validation failure when relevant.
- Every image request records its assembled prompt, selected reference IDs and roles, provider request identity, asset lineage, job/item status, and retry history without storing credentials or raw secret values.
- Conversation cards, artifact drafts/approvals, image jobs, completed page candidates, and export records survive normal application restarts.

## 10. Acceptance criteria

The feature is complete only when all conditions below are demonstrated:

1. Every copied guideline file is present at its documented destination and matches its source byte-for-byte; the final-page guideline matches the creator-provided text.
2. A new booklet is created as `guided-v2`, while a pre-existing legacy booklet still resumes with its original artifact sequence and runtime agents.
3. The manager selects only one stage-eligible specialist per material `guided-v2` turn, and traces identify the resolved persisted agent version.
4. Every one of the thirteen specialist contracts has fake-runtime fixtures, routing coverage, and artifact/materialization coverage.
5. All stage transitions require current upstream dependencies and explicit creator approval; package and final-page scoped approvals are enforced.
6. The visual, character, and location package flows save their exact prompt modules, build records, approved assets, and replacement history.
7. Final-page generation refuses missing/stale source packages and selects only relevant approved reference assets.
8. Single-page and batch generation both work; batch output stays draft until every page is individually reviewed and approved.
9. Final prompts contain exact approved Page Bible text and required attachment roles; generated text is never overlaid after generation.
10. Failed image work supports selected retry, explicit continuation, and restart recovery without losing completed work.
11. PDF export is unavailable before all final-page approvals and produces a correctly ordered readable PDF after explicit creator action.
12. The additive agent seed is safe to run repeatedly and does not alter or delete pre-existing MongoDB records.
13. Typecheck, lint, focused tests, agent fixtures, MongoDB verification, and desktop Playwright coverage pass. Three retained `guided-v2` evaluations produce rendered and inspected PDFs with trace, cost, and quality evidence.

## 11. Implementation boundaries

This PRD authorizes the behavior described above only after approval. It does not authorize removal of legacy data, use of real MongoDB credentials in a cloud environment, paid provider evaluations without an explicit cost report, merging a pull request, or closing the associated implementation issue without creator approval.
