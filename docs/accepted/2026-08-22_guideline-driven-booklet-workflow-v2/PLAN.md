# Guideline-driven booklet workflow v2 — implementation plan

**Status:** Draft; approve this plan before runtime implementation.

**PRD:** [`guideline-driven-booklet-workflow-v2-prd.md`](guideline-driven-booklet-workflow-v2-prd.md)
**Task map:** [`ARTIFACT-GUIDELINE-MAPPING-REVIEW.md`](ARTIFACT-GUIDELINE-MAPPING-REVIEW.md)

## Outcome

Implement `guided-v2` as the default workflow for new booklets while preserving existing booklets as `legacy`. The new workflow contains fourteen artifact-producing specialist tasks and one non-artifact orchestration guideline. It removes the duplicate outline Character List and World/Setting Guide from the v2 design.

```text
Concept Brief → Story Outline → Draft Character List + Draft Location List
→ Page-by-Page Manuscript → Final Character List + Final Location List
→ Visual Style → Character Sheets + Location Sheets → Pagination & Layout
→ Final Page Bible → Final Page Illustrations → Book Export
```

## Architecture and ownership

| Concern | Owner |
| --- | --- |
| Select the next eligible specialist, pass approved context, route revisions | Manager + deterministic workflow registry |
| Ask focused questions and draft one task's structured result | Specialist agent |
| IDs, storage, versions, approvals, dependency graph, invalidation, stage transitions | Application |
| Image-job orchestration, file naming, asset records, reference attachment validation | Application |
| Export preflight, PDF/output creation, delivery asset persistence | Application |
| Agent definitions, task instructions, versions, lifecycle events | Additive MongoDB seed |

Specialists never persist artifacts directly, grant approvals, create durable IDs, choose a stage independently, run image jobs, or export a book.

## Artifact graph and contracts

Implement one typed artifact contract and materializer for every row below. `+` marks sibling artifacts that can be drafted in either order after their shared predecessor; all required siblings must be approved before the next gate.

| Order | Artifact key | Sources | Required fields / package entries |
| ---: | --- | --- | --- |
| 1 | `conceptBrief` | creator input | audience, premise, theme, emotional promise, tone, constraints, deferred decisions |
| 2 | `storyOutline` | approved concept brief | concise story, embedded main/supporting character shortlist, key places, arc, open decisions |
| 3 | `draftCharacterList` | approved outline | role/name, story function, known facts, open questions |
| 4 | `draftLocationList` | approved outline | title, story purpose, known facts, likely scenes, open questions |
| 5 | `manuscript` | approved concept/outline/draft lists | complete prose, dialogue, scene/action, required characters/locations, list-expansion notes |
| 6 | `finalCharacterList` | approved manuscript + draft list | ID/name/role, background, age, physical description, attire/accessories, recurrence, sheet requirement |
| 7 | `finalLocationList` | approved manuscript + draft list | ID/title, description, anchors/features, continuity, sheet requirement |
| 8 | `visualStyle` | approved final lists + narrative sources | style definition, typography/bubble direction, shared prompt module, validation samples/build records |
| 9 | `characterSheets` | final character list + visual style | profile, required attire/accessories/expressions, module, build record, front/back/side + face/expression sheet, approval |
| 10 | `locationSheets` | final location list + visual style | profile, anchors, module, build record, isometric + surrounding-view sheet, approval |
| 11 | `paginationLayout` | manuscript, final lists, style, all sheets | fixed canvas, font/bubble system, physical-page/panel plan, safe areas, source routing |
| 12 | `finalPageBible` | manuscript, pagination, style, final lists, sheets | exact per-page/panel action, composition, text, bubble/text treatment, sheet references |
| 13 | `finalPageIllustrations` | approved Page Bible and all applicable sources | composition brief, attachment roles, prompt record, candidate/final asset lineage, page approval |
| 14 | `bookExport` | pagination + every approved final page | ordered source-page manifest, preflight, output settings, export asset/delivery record |

### Dependency and invalidation rules

- An artifact version records exact approved upstream version IDs.
- A revision starts a new artifact version and marks dependent downstream artifacts as `needs_review`; it does not edit approved history.
- Revising a Final Character List or Final Location List also marks its affected sheet and every page that references that sheet for review.
- Revising the Pagination & Layout Plan invalidates Page Bible and final-page artifacts whose canvas, page order, panel, typography, or routing changed.
- A Page Bible revision invalidates only the affected page package(s), unless global Page Bible rules changed.
- Export availability depends on the current approved version of every physical page.

## Specialist contracts and seed

Create the fourteen registered skills below. Each contract has a Zod schema, deterministic fake-runtime fixture, manager-routing fixture, materializer, artifact view card, and test coverage.

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

Build `db:seed-guideline-agents` as an idempotent additive seed. It may insert or verify only deterministic v2 definitions, versions, and events. It must never update, deactivate, retire, or delete existing MongoDB records. The existing manager remains the sole active manager. The Export Package specialist drafts a preflight/manifest only; application code executes export after explicit user request.

## Implementation slices

### Slice 1 — Workflow registry and narrative foundation

Implement `workflowVersion` (`legacy` default for existing records, `guided-v2` for new booklets), v2 stage registry, route validation, artifact graph, generic draft/approval/version records, and the first five artifacts:

1. Concept Brief
2. Story Outline
3. Draft Character List
4. Draft Location List
5. Page-by-Page Manuscript

Deliverable: a creator can begin from free-form input, answer focused questions, approve each narrative artifact, and read the final manuscript as a complete non-illustrated story.

### Slice 2 — Production-source lists and visual style

Implement Final Character List, Final Location List, Visual Style Package, validation-sample assets, immutable shared style prompt module, and revision routing from sheets back to final lists.

Deliverable: an approved manuscript produces one authoritative cast record and one authoritative location record; style approval includes reusable visual, typography, and bubble direction.

### Slice 3 — Sheet packages

Implement package queues, per-entry approval, image jobs, source-reference validation, asset/build records, and revision behavior for:

- Character Sheets: full-body front, back, and side; detailed neutral face; three list/user-defined expressions; required accessories and attire.
- Location Sheets: isometric overview plus multiple surrounding-angle views covering all stable required areas.

Deliverable: all recurring characters and all final-list locations have current approved sheets before pagination may advance.

### Slice 4 — Pagination and Page Bible

Implement fixed physical-canvas selection, typography/font and speech/thought-bubble system, page architecture, panel/image allocation, text-safe areas, sheet-routing tables, and per-page Bible entries.

Deliverable: every physical page has an approved layout and one complete production entry with exact text, action, composition, bubbles, and reference sources.

### Slice 5 — Final pages and export

Implement page-by-page and batch job modes, deterministic naming, native-text prompt assembly, per-page review/revision/approval, export preflight, explicitly initiated PDF export, and recovery.

Deliverable: draft batch pages are individually reviewed; exports use only current approved pages in pagination order and are retryable without regenerating page art.

## UI flows

1. **Start a booklet:** input free-form idea → specialist clarifies material gaps/options → approve Concept Brief.
2. **Narrative authoring:** approve concise Story Outline with embedded shortlists → approve draft character/location records → approve the complete manuscript.
3. **Production references:** approve final lists → Visual Style Package → all required Character and Location Sheets.
4. **Book production:** approve Pagination & Layout → approve Final Page Bible → choose page-by-page or batch generation → individually review every physical page.
5. **Delivery:** review export manifest/preflight → explicitly request export → download output.
6. **Revision:** choose an earlier artifact → orchestrator identifies affected downstream work → owning specialist creates new version → creator reapproves only required dependent artifacts/pages.

The UI must make current source versions, approval status, revision impact, page order, page filenames, batch job state, and recovery actions visible. Legacy booklets retain their existing stage rail and behavior.

## Verification

1. Contract, materializer, fake-runtime, and manager-routing tests cover all fourteen specialists.
2. Artifact-graph tests prove all gates, sibling-pair rules, scoped package/page approvals, and revision invalidation rules.
3. Sheet tests enforce the character front/back/side, neutral face, three-expression, attire/accessory rules and location isometric/surrounding-angle rule.
4. Page tests enforce approved Page Bible/text propagation, only relevant sheet references, fixed canvas, native-text request requirements, stable filenames, one-by-one review, batch draft status, and per-page revision.
5. Export tests reject missing/stale approvals, preserve pagination order/geometry, record the manifest, and recover after a failed export.
6. Seed tests run against a database containing legacy records and verify idempotency and zero legacy mutations.
7. Run typecheck, lint, focused tests, MongoDB verification, and desktop Playwright paths for legacy resume plus the v2 golden path. Retain three v2 evaluation booklets with rendered PDF, trace, cost, and quality evidence.

## Assumptions and intentionally deferred work

- Every artifact uses an explicit creator approval gate; sibling lists/sheets can be prepared in parallel but all required items must be approved before the next gate.
- Final page text remains native to the generated page image; no post-generation overlay is allowed.
- Export is a `Book Export Package` artifact and deterministic app action, not automatic background work.
- Existing legacy data and agents remain untouched.
- This plan does not authorize runtime implementation until the creator explicitly approves it.
