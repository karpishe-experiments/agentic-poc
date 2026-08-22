# Guideline-Driven Booklet Workflow v2 PRD

**Status:** Draft; requires explicit approval before runtime implementation.

**Prepared:** 2026-08-23

**Implementation plan:** [`PLAN.md`](PLAN.md)
**Current-code review:** [`CHANGE-SURFACE-REPORT.md`](CHANGE-SURFACE-REPORT.md)
**Workflow orchestration:** [`task-guidelines/00-booklet-workflow-orchestration.md`](task-guidelines/00-booklet-workflow-orchestration.md)

## 1. Product summary

Guideline-Driven Booklet Workflow v2 turns a creator's free-form book idea into an approved, downloadable illustrated children's book through a clear sequence of typed, persistent artifacts. Each task has one paired artifact guideline. The single exception is the orchestration guideline, which controls sequencing, specialist selection, context handoff, revision routing, and approval gates rather than producing an artifact.

New booklets use `guided-v2`. Existing booklets retain the `legacy` workflow and are not migrated, deleted, or altered. The application remains responsible for durable state, IDs, versioning, approvals, jobs, asset records, filenames, stage transitions, and export execution; specialists create structured artifact drafts only.

## 2. Goals and non-goals

### Goals

1. Turn a creator's initial input into an approved booklet through a coherent narrative, visual-reference, layout, page-production, and export workflow.
2. Keep the first narrative pass concise, then expand it into a complete page-by-page, scene-by-scene manuscript that is readable as a non-illustrated storybook.
3. Use draft Character and Location Lists as a working memory before manuscript writing, then replace them with approved Final Character and Final Location Lists after manuscript approval.
4. Require an approved Visual Style Package before any character or location sheet is generated.
5. Produce and individually approve a Character Sheet for every recurring character and a Location Sheet for every final-list location.
6. Lock a consistent page system, including canvas, typography, and speech/thought-bubble direction, before creating the Final Page Bible.
7. Require an approved Page Bible before final page generation, preserving page-level review in both one-by-one and batch modes.
8. Allow explicit export only after all physical pages are individually approved.
9. Support retrospective revisions by returning to the correct owning specialist and marking only affected downstream work as needing review.
10. Add all new agent definitions and skills to MongoDB without deleting or altering existing records.

### Non-goals

- Migrating, deactivating, or editing legacy booklets or their existing MongoDB records.
- Automatic approval, automatic export, automatic paid-image retries, or post-generation text overlays.
- User-uploaded image references, generic asset libraries, collaboration, publishing, payments, commercial-printing integrations, or production hardening.
- Allowing a specialist to persist data, assign durable IDs, approve artifacts, execute jobs, name assets, or transition stages.

## 3. Product rules

### 3.1 Clarification and approval

- Every specialist first reviews approved inputs and relevant chat context.
- Before its first draft, it asks concise questions for material gaps or offers bounded creative options where the creator left a consequential choice open.
- It must not repeat questions already answered in the approved artifacts or chat context.
- Every artifact begins as **Draft awaiting approval**. The creator's explicit approval is required before its downstream gate can advance.

### 3.2 Revisions

- A revision goes to the specialist that owns the earlier artifact.
- The application creates a new version and displays affected downstream artifacts, sheets, pages, and exports as needing review.
- A sheet review that changes a stable character/location fact also revises the corresponding Final List entry before the sheet is regenerated.
- Final Page Bible and Final Page Illustration revisions are scoped to the affected physical page unless an upstream shared source changes.

### 3.3 Source hierarchy

For `guided-v2`, resolve conflicts in this order:

1. Explicit creator decisions captured in approved artifacts or current chat context.
2. This approved PRD and approved implementation plan.
3. The paired task guideline.
4. The orchestration guideline.
5. Legacy POC documents, only for retained platform behavior.

## 4. Creator workflow

| Order | Artifact | Specialist task | Approval / completion rule |
| ---: | --- | --- | --- |
| 1 | Book Concept Brief | `book_concept_brief@1` | Captures audience, premise, theme, tone, constraints, and deferred decisions. |
| 2 | Story Outline | `story_outline@1` | Concise story skeleton with its embedded shortlist of main/supporting characters and key places. |
| 3 | Draft Character List | `draft_character_list@1` | Working cast memory derived from the outline; no detailed design. |
| 4 | Draft Location List | `draft_location_list@1` | Working place memory derived from the outline; no visual-location design. |
| 5 | Page-by-Page Manuscript | `page_by_page_manuscript@1` | Complete child-facing page/scene story with narration, dialogue, action, required characters, and locations. |
| 6 | Final Character List | `final_character_list@1` | Complete production cast source: identity/role, background, age/life stage, physical description, attire, accessories, recurrence, and sheet requirement. |
| 7 | Final Location List | `final_location_list@1` | Complete production place source: title, basic description, stable anchors, features, continuity, and sheet requirement. |
| 8 | Visual Style Package | `visual_style_package@1` | Approved art direction, typography/bubble direction, unchanged shared style prompt module, and validation samples. |
| 9 | Individual Character Sheet Packages | `individual_character_sheet_package@1` | One approved sheet per final-list recurring character or explicitly requested additional character. |
| 10 | Location Sheet Packages | `location_sheet_package@1` | One approved sheet per Final Location List entry. |
| 11 | Pagination & Layout Plan | `pagination_layout_plan@1` | Fixed canvas, page architecture, aspect ratio, typography/font and bubble system, panel/image counts, text-safe areas, and sheet routing. |
| 12 | Final Page Bible | `final_page_bible@1` | Exact per-physical-page action, composition, panel/image requirements, sheet references, readable text, and bubbles. |
| 13 | Final Page Illustration Packages | `final_page_illustration_package@1` | One reviewable, approved, natively lettered final image and build record for each physical page. |
| 14 | Book Export Package | `book_export_package@1` | Approved page manifest and preflight record; application creates the final downloadable export only on the creator's explicit request. |

The Draft Character List and Draft Location List form one sequential planning gate after the outline; their records may be drafted in either order. The Final Character List and Final Location List form one post-manuscript production-source gate and may be drafted in either order. Character and Location Sheet Packages may be generated in parallel after Visual Style approval, but every required sheet must be approved before Pagination & Layout Plan approval.

## 5. Artifact contracts

Every artifact is versioned and records its source artifact versions, structured content, draft/approval state, approval provenance, and applicable scoped review status.

- **Book Concept Brief:** faithful source input; audience; premise; theme/emotional promise; tone; representation, safety, and content constraints; deferred decisions.
- **Story Outline:** concise causal story; embedded main/supporting character shortlist; key places; major action; resolution; open decisions.
- **Draft Character / Location Lists:** working memory only. They support manuscript creation and are superseded by final lists after manuscript approval.
- **Page-by-Page Manuscript:** prose, dialogue, scene/action, required characters, and locations for each narrative unit; expanded-list notes; no physical page or final-art constraints.
- **Final Character List:** stable identifier/name or role, narrative function, pages/scenes, background, age/life stage, physical description, acting/personality notes, attire/accessories, recurrence, and Character Sheet requirement.
- **Final Location List:** stable ID/title, pages/scenes, purpose, basic description, stable anchors, required features, continuity, and Location Sheet requirement.
- **Visual Style Package:** style definition; typography/bubble direction; canonical shared Style Prompt Module; 2–4 validation samples; assembled prompt records; approval record.
- **Character Sheet Package:** profile, attire/accessory and expression requirements, character-specific module, assembled build record, sheet asset, and approval/version record. Its sheet includes full-body front/back/side views, a detailed neutral face, and three defined expression shots.
- **Location Sheet Package:** profile, stable anchors, location-specific module, assembled build record, sheet asset, and approval/version record. Its sheet includes an isometric overview and multiple surrounding-angle views.
- **Pagination & Layout Plan:** trim/orientation/aspect/working pixels/bleed/live-text margins; font and text/bubble system; book architecture; page/panel allocation; text-safe strategy; and character/location sheet routing.
- **Final Page Bible:** a complete production entry per physical page and panel/image: story action, composition, exact text, text form, speaker, placement, typography/bubble treatment, and sheet references.
- **Final Page Illustration Package:** page-specific composition brief, selected asset references and roles, native-text prompt/build record, candidate/approved asset lineage, per-page review, and approval.
- **Book Export Package:** source page manifest, export settings, preflight, delivered PDF/output asset, and delivery record.

## 6. Specialist and MongoDB seed requirements

The existing manager remains the sole manager. It receives only stage-eligible specialist tools and chooses the correct specialized task from the artifact graph and chat context. Each of the fourteen artifact tasks has one MongoDB-backed specialist definition:

```text
book_concept_brief@1
story_outline@1
draft_character_list@1
draft_location_list@1
page_by_page_manuscript@1
final_character_list@1
final_location_list@1
visual_style_package@1
individual_character_sheet_package@1
location_sheet_package@1
pagination_layout_plan@1
final_page_bible@1
final_page_illustration_package@1
book_export_package@1
```

The `book_export_package` specialist creates a structured manifest/preflight proposal. Deterministic application code, not the specialist, validates pages, generates the export file, persists the asset, and records delivery.

`db:seed-guideline-agents` must be additive and idempotent. It inserts or verifies only the fourteen deterministic `guided-v2` agent definitions, versions, and lifecycle records. It must never update, deactivate, retire, delete, or otherwise mutate existing MongoDB records.

## 7. Final-page generation and export

### 7.1 Page generation

- The final image request uses the approved Page Bible entry, approved pagination entry, unchanged Style Prompt Module, and only relevant approved Character/Location Sheet assets.
- The model generates all required narration, dialogue, balloons, titles, and diegetic text natively in the image. The application never adds a later text overlay.
- The creator selects **page by page** or **batch** generation. Batch mode creates ordered draft candidates only; every page remains independently reviewable and approvable.
- Every page asset uses an application-owned, stable sortable filename: `[booklet-slug]_page-[physical-page-3-digits]_r[revision-2-digits].png`.
- An upstream revision blocks only affected pages from export and indicates whether they need revision or regeneration.

### 7.2 Export

- Export is unavailable until every physical page has a current approval and passes preflight against the Pagination & Layout Plan.
- The creator explicitly requests export after reviewing the Book Export Package.
- The application produces the PDF/output in approved reading order, records the exact page manifest and export settings, and allows explicit retry if export fails without invalidating approved page art.

## 8. Acceptance criteria

1. The task-guideline directory contains one orchestration guideline plus exactly fourteen artifact guidelines, with no duplicate standalone outline-character-list or world-setting task.
2. The Story Outline contains a concise shortlist of main/supporting characters and key places; it is not a separate Character List artifact.
3. Both draft lists are created after outline approval; the manuscript uses them as working memory and is a complete readable non-illustrated story.
4. Final Character and Location Lists are created only from the approved manuscript and are the authoritative source for all sheet packages.
5. Character Sheet Packages meet the required front/back/side, neutral face, three-expression, attire, and accessory requirements.
6. Location Sheet Packages meet the required isometric overview and surrounding-angle requirements for every final-list location.
7. Pagination locks canvas, typography/font, text/bubble system, panel/image allocation, and sheet routing before a Page Bible is created.
8. The Page Bible contains a complete per-physical-page production source, and final pages cannot be generated without it.
9. Both page-by-page and batch generation retain individual page review, approval, revision, asset lineage, and stable filenames.
10. Export occurs only by explicit creator request after every current final page is approved.
11. The orchestrator asks the correct specialist to clarify/draft/revise, and returns to the owning specialist for retrospective changes.
12. The agent seed is repeatable and does not change or delete existing MongoDB records; legacy booklets retain their behavior.

## 9. Implementation boundary

This PRD defines a documentation-approved product direction only. Runtime implementation, database seeding, paid provider calls, external cloud execution, and changes to legacy records require an approved implementation plan and subsequent creator authorization.
