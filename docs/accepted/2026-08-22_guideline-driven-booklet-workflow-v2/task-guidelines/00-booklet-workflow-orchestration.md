# Guideline — Orchestrating the Guided Booklet Workflow

## Purpose

This is the one guideline that does not produce an artifact. It defines how the orchestrator moves a booklet through the artifact workflow, chooses the correct specialist, gathers context, manages approvals, and returns to an earlier task when a revision makes one necessary.

## Artifact sequence

```text
Book Concept Brief
  → Story Outline (includes a shortlist of main and supporting characters and key places)
  → Draft Character List + Draft Location List
  → Page-by-Page Manuscript
  → Final Character List + Final Location List
  → Visual Style Package
  → Individual Character Sheet Packages + Location Sheet Packages
  → Pagination & Layout Plan
  → Final Page Bible
  → Final Page Illustration Packages
  → Book Export Package
```

The draft Character List and Draft Location List may be created in either order after the Story Outline, because neither depends on the other. The Final Character List and Final Location List may likewise be prepared together after manuscript approval. Character Sheet Packages and Location Sheet Packages may be generated in parallel after the approved Visual Style Package, but every required sheet must be approved before pagination begins.

## Orchestrator responsibilities

Before every material turn, the orchestrator must:

1. Inspect the booklet's complete artifact graph, each artifact's approval state and version, scoped approvals for sheets and pages, and relevant conversation context.
2. Determine whether the next action is to collect missing information, draft the next eligible artifact, request approval, revise a current artifact, create a required package, generate/review pages, or export.
3. Select only the specialist responsible for that task and provide it the approved upstream artifacts, relevant current drafts, relevant user decisions, and a narrowly scoped task.
4. Keep application-owned responsibilities deterministic: durable IDs, persistence, versioning, approval state, dependency checks, asset records, jobs, filenames, stage transitions, and export execution are never delegated to a specialist.

## Clarification and drafting rule

Every specialist begins by reviewing its input and the conversation context. Before making a first draft, it must either:

- ask concise clarifying questions for information whose absence would materially change its artifact; or
- offer bounded options when the user has intentionally left a consequential creative choice open.

It must not ask questions whose answers are already available in approved artifacts or chat context. After required answers or a selected option exist, it creates a clearly labelled **Draft awaiting approval**. No artifact becomes approved and no downstream task starts until the user explicitly approves it.

## Revision and invalidation rule

The workflow is not strictly forward-only. When a user asks to revise an earlier decision, the orchestrator must invoke the specialist that owns that artifact and pass the affected artifact, downstream impact, and user request.

- A revision creates a new version; it never silently edits an approved historical version.
- The application marks only dependent downstream artifacts, sheets, pages, and exports as needing review or regeneration.
- A correction to a Final Character List or Final Location List may require both the list and its affected sheet package to be revised and reapproved.
- A correction to a Page Bible or Page Illustration Package affects only the relevant physical page unless the underlying shared source changed.
- The user sees what requires reapproval before any regeneration is run.

## Approval gates

| Gate | Required approval before the next gate |
| --- | --- |
| Narrative foundation | Book Concept Brief, then Story Outline |
| Draft planning records | Draft Character List and Draft Location List |
| Complete story | Page-by-Page Manuscript |
| Production source records | Final Character List and Final Location List |
| Shared art direction | Visual Style Package |
| Visual references | Every required Character Sheet and Location Sheet |
| Physical book plan | Pagination & Layout Plan |
| Per-page production source | Final Page Bible |
| Final pages | Each Final Page Illustration Package, individually |
| Delivery | Book Export Package and explicit user-triggered export |

## Final-page generation modes

After Page Bible approval, the orchestrator asks the user to choose one of two modes:

- **Page by page:** generate one physical page, present it for review, obtain approval or a scoped revision, then move to the next page.
- **Batch:** generate a selected ordered batch of physical pages. Every resulting page remains a draft. The user later reviews each page independently; revisions and approvals are always per page.

Batch generation never implies batch approval. The application records stable page identifiers and revisioned filenames for every candidate and approved page.
