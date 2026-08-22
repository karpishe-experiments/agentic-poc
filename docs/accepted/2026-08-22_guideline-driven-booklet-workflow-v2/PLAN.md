# Guideline-driven booklet workflow v2

## Summary

- Add the supplied guidelines unchanged under `docs/task-guidelines/`, with normalized workflow-order filenames:
  `00-artifact-structure`, `01-book-concept-brief` through `11-pagination-and-layout-plan`, plus `12-final-page-illustration-package`.
- Create a new `guided-v2` workflow for all newly created booklets. Existing MongoDB booklets, agents, and the eight-stage POC remain usable as `legacy`.
- Add thirteen runnable, MongoDB-seeded specialist agents: the twelve guideline tasks plus a Final Page Bible specialist. Keep the existing manager and seven specialists unchanged.

## Workflow and contracts

- Define a versioned workflow registry keyed by each booklet’s persisted workflow version; older records without the field resolve as `legacy`, while new booklets are created as `guided-v2`.
- Implement this fixed v2 sequence:

  `Concept Brief → Story Outline → Outline Character List → Page-by-Page Manuscript → Manuscript Character List → Visual Style Package → Individual Character Packages → World/Setting Guide → Required Locations List → Location Definition Packages → Pagination/Layout Plan → Final Page Bible → Final Page Illustrations → explicit PDF Export`

- Make every stage an application-owned, typed artifact with draft, approval, dependency, invalidation, and recovery behavior. Character and location package stages hold individually approved reusable packages; the stage advances only when every routed package is approved.
- Use the current three supported page geometries as the permitted canvas choices. The Pagination agent records one confirmed geometry, trim assumptions, fixed working pixels, bleed/live-text margins, physical page order, and source-package routing.
- Add a Final Page Bible artifact containing the exact wording, text form, speaker, hierarchy, and placement for every physical page. It must be approved before any final image request.
- The Final Page Illustration specialist receives only approved source artifacts plus an application-built, page-specific eligible-reference catalogue. It returns composition briefs, exact prompt plans, and selected reference IDs. Application validation requires every depicted named character and location to have its approved sheet attached, permits only relevant optional style samples, and rejects missing or unrelated references.
- Extend the image request/provider contract with a reference-backed generation mode. It sends the selected assets as real image inputs, records the full attachment list and assembled prompt, preserves native in-image text requirements, and keeps targeted regeneration separate from a fresh reference-backed generation.
- At Final Page Illustrations, provide a creator choice to generate one selected page or a selected batch. Batch generation creates unapproved draft candidates only; each candidate is reviewed, approved, or regenerated independently. Drafts never become continuity references for other draft pages.
- Keep PDF assembly application-owned and explicitly triggered only after every final page is approved. It exports the approved physical-page order and records existing evidence/preflight data.

## Agents and additive MongoDB seed

- Add the thirteen v2 skill IDs, schemas, deterministic fake implementations, stage eligibility, manager routing fixtures, and application materialization handlers. Agents author validated proposals only; IDs, artifacts, approvals, jobs, attachments, and transitions remain deterministic application responsibilities.
- Append thirteen confirmed, active specialist definitions to a dedicated additive guideline-agent seed. Use `openai`, `gpt-5.6-terra`, medium reasoning, and one turn, with task-specific instructions derived from the corresponding guideline; the Final Page Bible instructions derive from the final-page guideline’s required input contract.
- Add a `db:seed-guideline-agents` command that only inserts or verifies deterministic new records, events, and definitions. It never updates, deactivates, retires, or deletes existing records.
- Update initialization and verification to require exactly one active specialist for every registered legacy and v2 skill, while allowing all historical draft/version records. The existing manager remains the one active manager for both workflows.

## UI, documentation, and compatibility

- Render the stage rail, workspace labels, artifact viewer, cards, routes, and API validation from the booklet’s workflow registry rather than a single global artifact list.
- Add typed review cards for all new planning artifacts, package approval queues, page-generation mode selection, per-page draft review, and explicit PDF export.
- Update the README, canonical PRD, canonical implementation plan, and architecture guide to designate `guided-v2` as the new-booklet workflow and document legacy compatibility, agent seeding, package/reference gates, batch behavior, and explicit export.
- Preserve the current uncommitted changes in `package.json`, `package-lock.json`, and `next-env.d.ts`; reconcile any overlap before edits.

## Verification

- Verify source guideline copies byte-for-byte against the supplied files and preserve the inline final-page guideline verbatim.
- Add contract, artifact-graph, workflow-version, routing, and materialization tests for all thirteen specialists.
- Test additive seed idempotency against a database containing legacy records; confirm no legacy agent/document is altered and both workflows have complete active coverage.
- Test final-page gates: missing approval/reference rejection, exact Page Bible text propagation, relevant attachment selection, eight-reference limit, native-text prompt constraints, and saved reproducibility metadata.
- Test one-page and batch jobs, draft-batch per-page approval, selective regeneration, failure/retry/continue recovery, restart/resume, and export rejection until all physical pages are approved.
- Run typecheck, lint, unit/integration tests, agent fixtures, the updated desktop Playwright golden path for both legacy resume and new workflow creation, MongoDB verification, and three retained guided-v2 evaluation booklets with rendered PDF inspection and cost/trace evidence.

## Assumptions

- The two Character List guidelines remain separate tasks: the outline-derived list is an early planning artifact; the manuscript-derived list is the authoritative downstream cast-routing artifact.
- The World/Setting Guide runs after approved character packages and before the Required Locations List, as selected.
- Existing legacy booklets remain executable and are not migrated; all new booklets use guided-v2.
- The provided guidelines are reference instructions, while the user’s explicit requirements control batch generation and explicit export behavior.
