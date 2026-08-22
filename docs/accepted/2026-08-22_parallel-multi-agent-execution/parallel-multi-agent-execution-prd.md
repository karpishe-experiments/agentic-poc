# Product Requirements Document: Parallel multi-agent execution

**Status:** Accepted for implementation planning
**Issue:** [#18](https://github.com/karpishe-experiments/agentic-poc/issues/18) — Support parallel multi-agent execution and normalized contracts
**Authority:** This document extends the accepted Kids Booklet POC PRD and the database-backed runtime agent-management PRD. It supersedes their singleton-specialist and no-multi-agent-selection constraints; all other bounded-skill and application-authority rules remain in force.

## 1. Product summary

Kids Booklet evolves from one active specialist per skill to one-or-more active, typed execution agents for each skill or image operation. The manager continues to route exactly one stage-valid skill. A single persisted Agent run card carries a step from its prefilled agent team through execution, results, completion, and restart. When more than one compatible agent is active, the creator may change the remembered team, sees its independent progress and normalized results, and chooses exactly one successful result before application state changes. A sole valid candidate runs without redundant selection or result-choice steps.

The POC remains local, single-user, application-controlled, and intentionally small. Agents cannot write workflow state, define arbitrary schemas, create tools, or merge results. The application owns canonical schemas, normalization, durable work, artifact creation, active asset selection, and workflow transitions.

## 2. Goals and boundaries

### Goals

1. Support one-or-more active execution agents for every registered text skill and for reference/page image generation or edit operations.
2. Let creators run or revise a visible, prefilled per-booklet, per-target agent team from one evolving Agent run card.
3. Run all selected candidates concurrently, retain each outcome, and materialize only an explicitly selected successful result when alternatives exist.
4. Normalize each candidate's native schema through a code-registered execution profile into the application-owned canonical contract.
5. Preserve visible, recoverable history, evidence, and current assets/artifacts through failures, reloads, and restarts.

### Out of scope

- Multiple active managers, automatic candidate choice, automatic merging/synthesis, silent fallback, cancellation, or global/account preferences.
- Arbitrary operator-authored schemas, mapping code, tools, provider credentials, or runtime skill definitions.
- Production concurrency controls, multi-user coordination, provider comparison dashboards, or new provider credentials.

## 3. Creator experience

### 3.1 Agent run card

- **MA-001:** Each text or image execution step shall use one application-owned, persisted Agent run card with `ready`, `running`, `results`, and `completed` states. State changes update the same logical card rather than emitting separate selection, progress, and result cards.
- **MA-002:** After routing a multi-candidate text skill, the manager shall narrate that the saved agent team will be used and may be changed before running. Choices, validation, and state transitions remain deterministic application data. Direct quality and image work use the same card without an additional manager call.
- **MA-003:** On first use of a target with multiple compatible candidates, the ready state shall require a non-empty selection. It shall show every compatible active candidate, display name, purpose, profile/model summary, searchable/filterable labels, checkboxes, selected count, and a clear cost/concurrency notice.
- **MA-004:** On later uses, the ready state shall show the remembered team collapsed with **Change agents** and **Run this step**. Expanding Change agents exposes the same complete searchable checklist; the POC imposes no user-visible candidate-count cap.
- **MA-005:** Submitting a new team shall replace the remembered logical-agent IDs for that booklet and execution target. Inactive, retired, or incompatible remembered agents are omitted with an explanation and require a valid replacement before execution.
- **MA-006:** When exactly one compatible agent is active, the application shall skip team selection, run that agent, implicitly select its valid result, and continue to the normal artifact review. The completed card still records which agent ran.

### 3.2 Progress, outcomes, and restart

- **MA-007:** Starting the ready card shall create a durable execution batch and one durable item per selected agent, then move the same card to running. Items shall display queued, running, succeeded, or failed status, elapsed time, retry state, and a concise accessible status announcement.
- **MA-008:** Candidate items in a batch shall run concurrently. The card moves to results only after every selected candidate succeeds or fails.
- **MA-009:** Results shall be summary-first in the same card, with a compact normalized summary or safe error per candidate. Creators may expand text details or open a keyboard-operable full image preview on demand.
- **MA-010:** When multiple candidate results exist, the creator shall select exactly one validated success before a text proposal becomes an artifact version or an image becomes active. In mixed outcomes, the creator may choose a success, retry only failed candidates, or change agents and rerun. If none succeeds, only retry/change-team recovery is available.
- **MA-011:** After materialization, the same card moves to completed and shows the selected agent/result in a collapsed summary. It and the produced artifact expose **Restart with agents**. Restarting returns the card to a prefilled ready state, keeps prior batches available in collapsed run history, and leaves current workflow state unchanged until a replacement succeeds and is selected; normal immutable-version and downstream `needs_review` behavior then applies.

### 3.3 Image item flow

- **MA-012:** Every reference and page image item is an independent Agent run step. Its ready state shows the remembered image team collapsed and permits an item-level Change agents action when multiple compatible agents are active.
- **MA-013:** A changed image team becomes the remembered default for the next item of the same booklet and image target. Existing reference/page order remains sequential; selected candidates for one item run in parallel, and the next item does not begin until the current item has a successful image implicitly or explicitly selected. Failure recovery remains on the current item.
- **MA-014:** The selected image's source/composed assets become active only after success and implicit sole-agent or explicit multi-agent selection. Changing or restarting an item's team shall not affect completed items, and existing assets remain active through failed alternatives and restarts.

### 3.4 Accessibility and restoration

- **MA-015:** Team selection, search, filters, result expansion, previews, retries, restart, and card state changes shall use labeled keyboard-operable controls, visible focus, status conveyed by text/icon as well as color, concise `aria-live` updates, and no forced scrolling.
- **MA-015a:** Reloading or navigating back to the workspace shall restore the same Agent run card, its state, remembered or frozen team, per-agent progress/results, and available actions from persisted application state.

## 4. Execution and schema model

An execution target is either a registered text `skill:<skillId>` or one of two image targets: reference image or page image. Each image target covers both generation and edit operations for its item type. A candidate is a persisted agent version whose code-registered execution profile is compatible with that target.

- **MA-016:** The active manager remains unique. A valid text/image target has one-or-more active compatible candidates; no logical agent has more than one active version.
- **MA-017:** An execution profile shall be code-registered and versioned. It owns executor kind (`specialist` or `image`), target compatibility, typed settings schema, native input/output schemas, canonical-to-native input adapter, and native-to-canonical output adapter.
- **MA-018:** The canonical text contract remains the registered `SkillDefinition` input/output schemas. Canonical image contracts remain `ImageRequest` and `ImageResult`. Native request/result values validate before and after adapter use.
- **MA-019:** The manager receives a canonical routing interface and compatible capability summaries; it shall not author provider-native requests. Application code maps canonical semantics such as geometry/quality into each profile's native dimensions/quality controls.
- **MA-020:** Candidate selection freezes exact active agent-version and profile snapshots for that batch. An activation/deactivation affects only later cards. Availability changes before selection submission return a recoverable refreshed card without workflow mutation.

## 5. Persistence, admin, and evidence

- **MA-021:** Persist execution preferences, execution batches, execution items, terminal result summaries, selected-result provenance, and frozen agent/profile snapshots.
- **MA-022:** Extend model-call evidence with execution batch/item ID, target, candidate identity, profile/version, normalized canonical request/result references, provider/model, latency, usage, cost, and error classification.
- **MA-023:** The Agents backoffice shall use a persistent three-panel layout: **Targets**, **Agents**, and **Details**. Targets contains the manager, every bounded text skill, reference-image generation, and page-image generation. Selecting a target updates Agents without leaving the page; selecting or adding an agent updates Details without leaving the page.
- **MA-023a:** Agents shall show the selected target's active team first, followed by compatible inactive agents, with search and **Add agent**. Incompatible and retired agents remain inspectable in a collapsed unavailable section but cannot be activated. Each row shows name, model/profile, active state, compatibility or configuration warnings, and an active-team toggle when activation is allowed. New agents save inactive and require a separate activation action.
- **MA-023b:** Candidate activation is additive. Deactivation or retirement is rejected if it would leave a text/image target without an active compatible candidate. The manager uses **Set as active manager** instead of a pool toggle, and replacement shall be atomic so exactly one manager remains active.
- **MA-023c:** Details shall expose the selected agent's editable configuration, compatible profile and typed settings, validation, and a read-only capability summary. Input/output schemas and canonical mappings remain read-only. Confirmation, explicit branching, version history, retirement, and draft deletion are secondary controls collapsed by default.
- **MA-023d:** Editing a confirmed version shall automatically create an editable draft successor without requiring the operator to invoke an explicit fork action. Draft editing, confirmed-version immutability, monotonic version history, retirement rules, and the limit of one active version per logical agent remain unchanged.
- **MA-023e:** On narrow viewports, the three panels shall become an accessible **Targets → Agents → Details** drill-down flow with visible back navigation. Both layouts shall support labeled keyboard operation, visible focus, independent panel scrolling where panels are simultaneous, and no forced page scrolling.
- **MA-024:** Operators may choose and inspect only compatible code-registered profiles and their typed settings. Profile capabilities and schema summaries are read-only; arbitrary schemas, mappings, code, and credentials are not editable.
- **MA-025:** Existing singleton seed agents shall migrate unchanged as valid one-candidate pools. Seed one compatible active candidate for each reference- and page-image target so existing image flows retain valid coverage.

## 6. Verification and acceptance

Automated fake-provider evidence shall prove the single card's ready/running/results/completed transitions and restoration; first-use selection; remembered collapsed selection; changed preference; sole-agent implicit selection; stale preference recovery; candidate-pool lifecycle; concurrent execution; terminal-only result choice; mixed outcomes with targeted retry; all-failed recovery; per-image-item team changes; selected-only materialization; prior-asset retention; schema/profile normalization; immutable evidence; restart/reload persistence; and accessibility controls.

Admin component and browser evidence shall verify that target selection updates Agents, agent selection and Add agent update Details, active agents precede compatible inactive agents, search filters the selected target's agents, and a newly saved agent remains inactive until separately activated. It shall also verify additive activation, last-candidate protection, atomic manager replacement, compatibility and validation feedback, automatic draft succession when editing a confirmed version, collapsed advanced lifecycle/schema information, and preservation of immutable execution snapshots after pool changes.

Responsive browser evidence shall verify the **Targets → Agents → Details** drill-down and visible back navigation on narrow viewports, as well as keyboard operation, visible focus, independent panel scrolling, no forced page scrolling, and restoration of the selected target and agent-management view after reload.

Browser evidence shall cover first-use and remembered collapsed teams, Change agents, selection search/filtering, multiple selection, live per-agent status in the same card, summary-first expansion, sole-agent flow without redundant choices, image preview, status announcements, restart-with-agents, per-item image-team changes, unaffected completed images, and exact card restoration after reload. Existing manager fixtures become one manager route plus every selected candidate call while retaining stage legality and code-owned workflow authority.

## 7. Final decisions

- Preferences are per booklet and execution target, never global or account-based.
- Selection, progress, results, completion, retry, and restart are states/actions of one persisted Agent run card.
- All compatible active candidates can be selected; no user-visible concurrency cap exists.
- Results are summary-first and expanded on demand.
- A sole valid candidate is implicitly selected and proceeds directly to normal artifact review.
- Every page/reference item shows its remembered image team collapsed; an item-level change becomes the next item's default.
- Partial successes remain selectable only after every batch item reaches a terminal state.
- Agent management is target-centric and uses a three-panel **Targets / Agents / Details** layout, degrading to a three-step drill-down on narrow viewports.
- Routine administration uses active-team controls and inactive-first agent creation; version branching and lifecycle mechanics remain available as collapsed advanced controls.
- Implementation phase status and evidence are tracked in `roadmap.md` in this directory.
