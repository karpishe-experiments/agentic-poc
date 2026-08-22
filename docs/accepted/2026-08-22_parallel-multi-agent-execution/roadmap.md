# Parallel multi-agent implementation roadmap

**Status:** Not started
**Authority:** [Parallel multi-agent execution PRD](parallel-multi-agent-execution-prd.md)
**Tracking:** Update phase and checklist status as implementation progresses.

Status values: `Not started` · `In progress` · `Blocked` · `Verified`

## Phase 1 — Foundation and text execution

**Outcome:** Text skills support durable parallel candidate execution and selected-only artifact creation.

- [ ] Add execution targets, registered profiles, typed settings, schemas, and normalization adapters.
- [ ] Migrate specialist slots to candidate pools while retaining one manager.
- [ ] Seed complete text and image candidate coverage.
- [ ] Persist booklet-target preferences, batches, items, snapshots, results, and evidence.
- [ ] Implement the durable parallel runner, recovery, retry, and batch polling.
- [ ] Add the persisted ready/running/results/completed Agent run card.
- [ ] Split manager routing from specialist execution.
- [ ] Run selected text agents concurrently and materialize only the chosen valid result.
- [ ] Preserve the sole-agent shortcut and direct quality flow.
- [ ] Pass focused migration, contract, service, fixture, reload, and text browser tests.

**Gate:** Existing single-agent behavior remains green, and a multi-agent text step works end to end.

## Phase 2 — Image execution

**Depends on:** Phase 1
**Outcome:** Each reference and page item supports parallel image candidates safely.

- [ ] Connect reference/page generation and editing to registered image profiles.
- [ ] Give each image item its own Agent run batch.
- [ ] Run selected candidates concurrently within the current sequential item.
- [ ] Store candidate outputs as inactive preview assets.
- [ ] Activate and compose only the selected valid image.
- [ ] Automatically activate a valid sole-agent image.
- [ ] Remember item-level team changes as the next item's default.
- [ ] Keep failure recovery on the current item.
- [ ] Preserve completed items and active assets through retries and restarts.
- [ ] Pass normalization, preview, failure, ordering, reload, and selected-only activation tests.

**Gate:** Multi-agent reference and page generation work end to end without changing prior assets prematurely.

## Phase 3 — Three-panel agent management

**Depends on:** Phases 1–2
**Outcome:** Operators can safely manage all candidate pools.

- [ ] Build the persistent Targets / Agents / Details layout.
- [ ] Show active agents first, compatible inactive agents next, and unavailable history collapsed.
- [ ] Add search and inactive-first agent creation.
- [ ] Add profile selection, typed settings, validation, and read-only capabilities.
- [ ] Add additive active-team controls.
- [ ] Preserve atomic Set as active manager behavior.
- [ ] Prevent removal or retirement of the final compatible candidate.
- [ ] Automatically create a draft when editing a confirmed version.
- [ ] Collapse advanced history and lifecycle actions.
- [ ] Add responsive Targets → Agents → Details navigation.
- [ ] Pass lifecycle, compatibility, keyboard, focus, scrolling, responsive, and reload tests.

**Gate:** Operators can create and manage multiple active agents without producing invalid target coverage.

## Phase 4 — Verification and handoff

**Depends on:** Phases 1–3
**Outcome:** Every PRD requirement has direct evidence and no open in-scope defects remain.

- [ ] Verify fresh and upgraded database setup, initialization, migration, and repeated execution.
- [ ] Run typecheck, lint, unit/integration tests, agent fixtures, build, and Playwright.
- [ ] Complete the fake-provider multi-agent booklet golden path through PDF export.
- [ ] Verify mixed failures, retries, stale selections, restart, and reload recovery.
- [ ] Audit profile snapshots, normalized references, timing, usage, cost, and failure evidence.
- [ ] Prove invalid outputs never mutate workflow state.
- [ ] Render and inspect the generated PDF.
- [ ] Confirm retained real-provider evaluation booklets remain unchanged.
- [ ] Update architecture, operator documentation, implementation audit, project issue, and verified learnings.
- [ ] Complete a final defect-first review and resolve every in-scope finding.

**Gate:** All acceptance checks pass, documentation matches verified behavior, and the feature is ready for human acceptance.

## Completion status

| Phase | Status | Evidence |
| --- | --- | --- |
| 1. Foundation and text execution | Not started | — |
| 2. Image execution | Not started | — |
| 3. Agent management | Not started | — |
| 4. Verification and handoff | Not started | — |