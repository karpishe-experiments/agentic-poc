# Parallel multi-agent implementation roadmap

**Status:** Verified
**Authority:** [Parallel multi-agent execution PRD](parallel-multi-agent-execution-prd.md)
**Implementation plan:** [PLAN.md](PLAN.md)
**Tracking:** Update phase and checklist status as implementation progresses.

Status values: `Not started` · `In progress` · `Blocked` · `Verified`

## Phase 1 — Foundation and text execution

**Outcome:** Text skills support durable parallel candidate execution and selected-only artifact creation.

- [x] Add execution targets, four registered profiles, closed OpenAI/Gemini/FLUX image-model catalogs, typed settings, schemas, and normalization adapters.
- [x] Migrate specialist slots to candidate pools while retaining one manager.
- [x] Seed complete text and image candidate coverage.
- [x] Persist booklet-target preferences, batches, items, snapshots, results, and evidence.
- [x] Implement the durable parallel runner, recovery, retry, and batch polling.
- [x] Add the persisted ready/running/results/completed Agent run card.
- [x] Split manager routing from specialist execution.
- [x] Run selected text agents concurrently and materialize only the chosen valid result.
- [x] Preserve the sole-agent shortcut and direct quality flow.
- [x] Pass focused migration, contract, service, fixture, reload, and text browser tests.

**Gate:** Existing single-agent behavior remains green, a multi-agent text step works end to end, and the mandatory review/fix, roadmap, next-phase-plan, publish, and Issue #18 checkpoint in PLAN.md is complete.

## Phase 2 — Image execution

**Depends on:** Phase 1
**Outcome:** Each reference and page item supports parallel image candidates safely.

- [x] Connect reference/page generation and editing to OpenAI, Gemini, and FLUX registered image profiles.
- [x] Give each image item its own Agent run batch.
- [x] Run selected candidates concurrently within the current sequential item.
- [x] Store candidate outputs as inactive preview assets.
- [x] Activate and compose only the selected valid image.
- [x] Automatically activate a valid sole-agent image.
- [x] Remember item-level team changes as the next item's default.
- [x] Keep failure recovery on the current item.
- [x] Preserve completed items and active assets through retries and restarts.
- [x] Pass quality/resolution/dimensions normalization, model-limit, credential, FLUX polling recovery, preview, failure, ordering, reload, and selected-only activation tests without paid automated calls.

**Gate:** Multi-agent reference and page generation work end to end without changing prior assets prematurely, and the mandatory checkpoint in PLAN.md is complete.

## Phase 3 — Three-panel agent management

**Depends on:** Phases 1–2
**Outcome:** Operators can safely manage all candidate pools.

- [x] Build the persistent Targets / Agents / Details layout.
- [x] Show active agents first, compatible inactive agents next, and unavailable history collapsed.
- [x] Add search and inactive-first agent creation.
- [x] Add profile selection, typed settings, validation, and read-only capabilities.
- [x] Add additive active-team controls.
- [x] Preserve atomic Set as active manager behavior.
- [x] Prevent removal or retirement of the final compatible candidate.
- [x] Automatically create a draft when editing a confirmed version.
- [x] Collapse advanced history and lifecycle actions.
- [x] Add responsive Targets → Agents → Details navigation.
- [x] Pass lifecycle, compatibility, keyboard, focus, scrolling, responsive, and reload tests.

**Gate:** Operators can create and manage multiple active agents without producing invalid target coverage, and the mandatory checkpoint in PLAN.md is complete.

## Phase 4 — Verification and handoff

**Depends on:** Phases 1–3
**Outcome:** Every PRD requirement has direct evidence and no open in-scope defects remain.

- [x] Verify fresh and upgraded database setup, initialization, migration, and repeated execution.
- [x] Run typecheck, lint, unit/integration tests, agent fixtures, build, and Playwright.
- [x] Complete the fake-provider multi-agent booklet golden path through PDF export.
- [x] Verify mixed failures, retries, stale selections, restart, and reload recovery.
- [x] Audit profile snapshots, normalized references, timing, usage, cost, and failure evidence.
- [x] Prove invalid outputs never mutate workflow state.
- [x] Render and inspect the generated PDF.
- [x] Confirm retained real-provider evaluation booklets remain unchanged.
- [x] Update architecture, operator documentation, implementation audit, project issue, and verified learnings.
- [x] Complete a final defect-first review and resolve every in-scope finding.

**Gate:** All acceptance checks pass, documentation matches verified behavior, the mandatory checkpoint in PLAN.md is complete, and the feature is ready for human acceptance.

## Completion status

| Phase | Status | Evidence |
| --- | --- | --- |
| 1. Foundation and text execution | Verified | Durable candidate pools, Agent Run cards, profiles, evidence, and selected-only text materialization verified by focused fixtures and full suite. |
| 2. Image execution | Verified | Reference/page candidate execution, previews, selected-only activation, retry and recovery covered by integration fixtures. |
| 3. Agent management | Verified | Desktop/narrow three-panel browser specification covers profiles, lifecycle protection, search, URL restoration, and focus. |
| 4. Verification and handoff | Verified | db setup/init/verify, typecheck, lint, serial full suite (62 suites / 121 tests), 12 agent fixtures, build, and 9/9 isolated Playwright passed; the regenerated PDF was rendered and visually inspected. |
