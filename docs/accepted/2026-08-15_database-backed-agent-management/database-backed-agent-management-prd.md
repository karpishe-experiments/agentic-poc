# Product Requirements Document: Database-backed runtime agent management POC

**Status:** Approved 2026-08-15

**Issue:** #10 — Agent management discovery

**Parent:** #9 — Database-backed runtime agent definitions and admin management
**Authoritative scope:** This document extends the accepted Kids Booklet POC PRD. Where they conflict, this document governs the agent-management feature; the Kids Booklet PRD continues to govern the booklet workflow.

## 1. Product summary

The Kids Booklet application currently creates its manager and generic specialist harnesses from TypeScript. This POC moves their editable runtime configuration into SQLite while retaining the application's bounded-skill architecture:

```text
saved booklet context
  -> active persisted manager version selects one registered skill
  -> application validates the route and resolves the active persisted specialist for that skill
  -> specialist produces a schema-validated proposal
  -> application services persist decisions and advance workflow only after validation
```

An operator can inspect, create, edit, version, confirm, activate, retire, and (in a narrow safe case) delete draft agent versions from a local backoffice. The existing booklet flow must continue to work using seeded database-backed manager and specialist versions.

This is an agent-configuration POC, not a general agent platform. Runtime skills, schemas, tool capability, state mutation, and workflow authority remain application code.

## 2. Goals and completion criteria

### 2.1 Goals

1. Replace hard-coded runtime manager and specialist configuration with database-backed versions while preserving the existing bounded manager-then-specialist flow.
2. Let a trusted local operator manage agents through a minimal but usable backoffice.
3. Preserve an auditable history of versions and the exact effective configuration used for every model call.
4. Prove that the existing booklet workflow runs with persisted agents under the deterministic fake runtime.

### 2.2 Completion criteria

The POC is complete when:

- a migration creates and seeds one active manager and one active specialist for each of the seven currently registered runtime skills;
- the saved definitions reproduce the current default manager/specialist behavior;
- an operator can create, branch, edit, confirm, activate, retire, and safely delete an eligible draft version from one local admin page;
- every manager, specialist, and direct quality-review call identifies the selected agent version and records an immutable effective-configuration snapshot;
- the fake-provider booklet golden path completes after a user-created or forked specialist version is activated and invoked; and
- the existing workflow contracts—one stage-valid skill per material turn, schema validation, deterministic persistence and transition authority—remain true.

## 3. Scope

### 3.1 In scope

- SQLite/Drizzle persistence for logical runtime agents and versioned agent configurations.
- The two supported roles: `manager` and `specialist`.
- One local-only `/admin/agents` backoffice page for list, creation, draft editing, lifecycle actions, coverage visibility, and version history.
- Full editable manager/specialist instruction text, plus typed OpenAI runtime settings.
- Seeded migration data for the current manager and all seven current specialist-skill configurations.
- Database-backed resolution for normal manager routing and the direct Story Plan quality-review path.
- Version attribution and configuration snapshots on model-call evidence.
- Deterministic fake-runtime resolution and automated booklet-flow verification.

### 3.2 Out of scope

- Authentication, RBAC, sharing, tenancy, production deployment hardening, or hosted backoffice access.
- New runtime skills, uploaded code, arbitrary tools, arbitrary output schemas, arbitrary agent-to-agent delegation, or a skill authoring UI.
- Additional model-provider adapters, provider credential management, or a provider-selection experience. A provider field is retained only for future-compatible persisted data; this POC accepts `openai` only.
- Per-booklet agent pinning, agent priorities, multi-agent selection for a skill, branch comparison/merge UI, import/export, or a reusable prompt-template system.
- Real-provider acceptance runs. The implementation may still be used with `MODEL_RUNTIME=real`, but this PRD requires deterministic fake-provider evidence only.

## 4. Current-state constraints

The implementation being evolved has these authoritative constraints:

- `ManagerService` filters registered skills by saved booklet stage and, for Story Plan work, operation. It routes one material turn through a manager and then one specialist.
- `SkillRegistry` and `lib/contracts/skills.ts` own the closed skill IDs, schemas, stage eligibility, and deterministic fake implementations. They are not administrator-managed data.
- Runtime skills in `lib/skills/` are application capabilities. Repository development skills under `.agents/skills/` are instructions for coding agents and are never loaded, displayed, or managed as runtime agents.
- `QualityService` directly invokes the `quality_review_targeted_repair@1` specialist for Story Plan review; it must use the same persisted-specialist resolution contract as manager-routed work.
- Application services, not agents, own persistent IDs, artifacts, approvals, jobs, model-call records, and stage transitions.
- The app is local-first and currently has no account or session model.

The current registered skills are `intake_readiness@1`, `story_planning_revision@1`, `quality_review_targeted_repair@1`, `visual_direction_reference_planning@1`, `booklet_specification@1`, `page_planning_writing@1`, and `image_prompt_compilation@1`.

## 5. Personas and access boundary

### 5.1 Local operator

The sole POC administrator is a trusted person operating the local application. They can manage agent versions and run booklets. Administrative lifecycle events record the fixed actor value `local-admin` because no identity system exists.

`/admin/agents` is intentionally not authenticated. It must clearly state that it is a trusted local-development backoffice and is not safe to expose on an untrusted network. Adding authentication is deferred rather than approximated with a weak credential mechanism.

### 5.2 Booklet creator

The creator continues using the existing booklet workspace. They do not select models, skills, agents, or versions. They receive the same typed cards and recoverable workflow behavior. An active agent-version change affects their next material turn because runtime resolution is dynamic.

## 6. Agent and skill model

### 6.1 Definitions and versions

A **logical agent** is a stable record used to group related versions. An **agent version** is the complete runtime configuration used to construct an SDK agent. All user-visible, editable behavior is versioned.

Every version contains:

- display name and purpose;
- `manager` or `specialist` role;
- a nullable skill ID: required for specialists and absent for managers;
- complete editable instruction text;
- typed runtime configuration: provider, model ID, reasoning effort, and bounded maximum turns;
- status (`draft`, `confirmed`, or `retired`), active flag, parent-version reference, version number, timestamps, and audit actor.

The provider field is persisted but validation accepts only `openai`. The database is the source of truth for text-agent settings after migration; the current `OPENAI_MANAGER_*`, `OPENAI_SKILL_*`, and `OPENAI_REVIEW_*` values are not runtime overrides for persisted versions. The migration seeds the repository's current default values as stable data.

### 6.2 Skills remain code-owned

A specialist version binds to exactly one registered skill. The database does not define the skill's schema, stage eligibility, deterministic fake behavior, function-tool implementation, or persistence behavior.

The manager receives only registered skills that are valid for the saved stage and operation. It selects a skill, not an arbitrary specialist. The application resolves the unique active specialist version bound to that skill and constructs the bounded specialist with the persisted configuration.

This gives deterministic specialist selection while retaining the POC's model-led skill routing. Stage and operation applicability remain derived from the code registry; no separate assignment table is required for this POC.

### 6.3 Safe runtime envelope

Instruction text is fully editable. The runtime envelope is not: the application must continue to enforce role-aware limits that preserve the core contract.

- A material manager run requires one stage-valid tool selection, forbids parallel tool calls, and stops after the first selected skill.
- A specialist has no arbitrary tools, receives only validated input and bounded context, returns only the registered skill's structured output, and cannot persist state.
- Maximum turns are configurable only within role-aware bounds that preserve the existing single-manager/single-specialist call shape.
- Application validation rejects incompatible provider, role, skill, model settings, or execution settings before a version can be saved or activated.

Editable instructions never grant direct database, filesystem, job, approval, or transition authority.

## 7. Lifecycle and coverage

### 7.1 Version lifecycle

New agents start as inactive version-1 drafts. Drafts are mutable. The operator may create many draft branches from any version, including another draft; every branch records its parent and receives the next monotonic version number for its logical agent.

| Status | Mutable | May be active | Meaning |
| --- | --- | --- | --- |
| Draft | Yes | Yes | A work-in-progress configuration, including live in-flow testing. |
| Confirmed | No | Yes | A reviewed immutable configuration. Editing forks a new draft. |
| Retired | No | No | Historical configuration that cannot be reactivated. |

Confirming a draft freezes it in place without changing its active state. Retiring requires the version to be inactive. An inactive draft may be deleted only when it has no model-call evidence and no child versions.

An active draft may be edited live for its instructions and runtime settings. It may not change role or skill binding while active; the operator must activate an appropriate replacement first, then edit the inactive draft. This keeps coverage and resolution unambiguous without a multi-agent swap workflow.

### 7.2 Active-use invariants

The active flag governs normal runtime use independently from status:

- exactly one active manager version exists globally;
- exactly one active specialist version exists for each registered skill ID;
- at most one version of a logical agent is active;
- every active specialist has a valid matching role and skill binding; and
- retired versions are never active.

Backoffice mutations must preserve all coverage invariants transactionally. Activating a replacement atomically deactivates the current version in that manager or skill slot and any other active version of the same logical agent. A direct deactivation or edit that would leave the manager or a registered skill uncovered is rejected with a clear conflict message.

Active versions apply to all future material turns of every booklet. Past calls remain attributable to their version and snapshot; booklets do not pin a version at creation or at a stage boundary.

## 8. Backoffice experience

`/admin/agents` is one purpose-built server-rendered backoffice page, enhanced only where client interaction is needed. It must be workable with keyboard navigation and show loading, empty, validation, conflict, and request-failure states.

The page provides:

1. A coverage summary showing the active global manager and active version for each of the seven skills, including status, model, and draft warning.
2. A list of logical agents with their active version, role, skill binding, current status, and version count.
3. Creation controls for a manager or a skill-bound specialist. Specialist creation selects one of the closed registered skills.
4. A version editor for drafts with name, purpose, role, skill binding when inactive, complete instructions, provider, model, reasoning, and maximum turns.
5. Version history and actions to fork, confirm, activate, retire, or safely delete a draft.
6. Actionable errors explaining invalid configuration, immutable versions, coverage conflicts, and deletion restrictions.

The UI need not support search, filters, diffing, branch visualization, bulk operations, or rich prompt editing features. Plain textarea editing and chronological version history are sufficient.

## 9. Runtime resolution and failure behavior

For a manager-routed material turn, the application:

1. loads the unique active manager;
2. derives stage/operation-valid registered skills from the saved `SkillContext`;
3. supplies those skills to the manager;
4. validates the returned skill ID against that supplied allowlist;
5. loads the unique active specialist for the selected skill; and
6. runs the bounded specialist, validates its output, and gives the existing application service the result.

`QualityService` resolves the active specialist for `quality_review_targeted_repair@1` before its direct review call. It does not use a hard-coded review harness or model role after migration.

`MODEL_RUNTIME=fake` follows the same persisted manager/specialist resolution and evidence path, but retains existing deterministic skill routing and `SkillDefinition.run` behavior. Therefore fake runs prove configuration resolution, version attribution, and workflow compatibility—not model-prompt quality.

If required active configuration cannot be resolved because of data corruption, an incomplete migration, or a stale concurrent change, the application must not mutate booklet state. It returns a recoverable configuration error that identifies the missing manager or skill and points the local operator to `/admin/agents`. Normal valid backoffice actions prevent these gaps.

## 10. Persistence, migration, and evidence

### 10.1 Data and repository requirements

The database must store logical agents and agent versions with version lineage, lifecycle state, active-use state, and all editable configuration. Repository and service boundaries hide the database driver from route handlers, UI, agents, and skills.

Partial uniqueness or equivalent transactional constraints must enforce global manager uniqueness, one active specialist per registered skill, and one active version per logical agent. Mutation races return a recoverable conflict rather than silently replacing an unintended version.

### 10.2 Seeded migration

The checked-in migration creates the data model and embeds idempotent, stable default records:

- one active confirmed manager configured with the current manager instruction and default OpenAI model/reasoning settings;
- seven active confirmed specialists, one per registered skill, each carrying the current generic specialist behavior relevant to that skill and its current model/reasoning settings; and
- stable identifiers that make upgrades and tests repeatable.

Migration alone must leave both fresh and existing local databases able to run the booklet flow. The existing `seed` command continues to own visual style and font assets; it does not become a prerequisite for runtime-agent defaults.

### 10.3 Model-call attribution and reproducibility

Every manager, specialist, and quality-review model-call record must include the selected logical-agent and agent-version identifiers. It must also retain an immutable snapshot of the effective instruction text and runtime configuration used for that call, including role, skill binding where applicable, provider, model, reasoning, and execution settings.

The snapshot is required because an active draft may be edited after invocation. Historical model-call evidence must remain explainable even if its mutable draft later changes, is confirmed, retired, or becomes inactive. Pre-migration calls remain readable with null agent references and no snapshot.

## 11. Functional requirements

- **AM-001:** The application shall persist manager and specialist logical agents and versions in SQLite.
- **AM-002:** The application shall seed one active confirmed manager and one active confirmed specialist for each of the seven registered runtime skills through the checked-in migration.
- **AM-003:** The backoffice shall allow a local operator to create a manager or a specialist draft, with specialists bound to one existing registered skill.
- **AM-004:** The backoffice shall allow draft mutation and arbitrary draft branching while retaining parent lineage and monotonic version numbers.
- **AM-005:** The backoffice shall permit confirmation, activation, retirement, and safe deletion according to the lifecycle rules in section 7.
- **AM-006:** The backoffice shall reject invalid configuration, unsupported providers, incompatible role/skill pairs, immutable edits, coverage gaps, duplicate active slots, and unsafe deletion with actionable feedback.
- **AM-007:** The active manager shall select only code-registered, stage- and operation-valid skills for a material turn.
- **AM-008:** The application shall resolve exactly one active specialist version for the selected skill before specialist execution.
- **AM-009:** The quality-review path shall resolve its active specialist from the same persisted version source.
- **AM-010:** The application shall retain schema validation, bounded handoff, deterministic fake behavior, and application ownership of all state mutation.
- **AM-011:** The application shall resolve active versions on every invocation; version changes shall affect only future calls.
- **AM-012:** Each relevant model-call record shall retain agent/version attribution and an immutable effective-configuration snapshot.
- **AM-013:** The database shall be authoritative for text-agent runtime configuration after migration.
- **AM-014:** The existing booklet flow shall complete with database-backed agents under the fake runtime.

## 12. Acceptance and verification

### 12.1 Automated evidence

- Migrations succeed against an empty database and a representative database created by the prior migration.
- Post-migration inspection finds the active manager plus seven active skill specialists, with no duplicate active slots.
- Repository/service tests cover lifecycle transitions, branched drafts, mutation guards, activation replacement, coverage conflicts, deletion guards, and concurrent activation conflict handling.
- Manager tests prove only stage-valid skills are offered, selection stays bounded, and the resolved specialist matches the selected skill's active version.
- Quality tests prove direct review resolves the persisted quality specialist.
- Evidence tests prove successful and failed calls retain the resolved version and effective configuration snapshot; existing call rows remain readable.
- Existing deterministic agent fixtures and booklet integration tests pass with database-backed runtime resolution.
- Typecheck, lint, focused tests, `test:agent`, build, and desktop fake-provider Playwright coverage pass.

### 12.2 Human golden path

On a local fake-runtime environment, the operator:

1. opens `/admin/agents` and verifies active coverage for the manager and all seven skills;
2. forks or creates an inactive specialist draft for an existing skill;
3. edits its instructions and typed model configuration, confirms or leaves it as a live-test draft, and activates it as the replacement for that skill;
4. starts or resumes a booklet through the matching stage and verifies the selected agent version and effective configuration in evidence;
5. completes the existing fake booklet golden path to a downloadable PDF; and
6. restores or activates another valid version, confirming coverage remains complete.

## 13. Risks and POC mitigations

| Risk | POC mitigation |
| --- | --- |
| Editable prompt behavior can reduce quality. | Keep schemas, tools, stage eligibility, and application authority code-owned; fake tests verify flow rather than prompt quality. |
| An active draft changes historical meaning. | Snapshot the effective configuration in every model-call record. |
| Agent changes make routing ambiguous or leave stages unusable. | Enforce one active manager and one active specialist per skill transactionally; prevent gaps. |
| A local unauthenticated backoffice is exposed. | Mark it local-only and defer authentication; do not represent it as production-safe. |
| Branching drafts add UI complexity. | Support chronological branches only; omit compare, merge, search, and bulk controls. |
| Seeded defaults drift from code-owned skills. | Seed stable configurations only for the existing closed registry and verify all seven slots after migration. |

## 14. Assumptions and deferred concerns

- The application remains a single local process with SQLite. The transactional uniqueness rules are sufficient for this POC; distributed coordination is deferred.
- The checked-in migration is the only supported upgrade route from the current schema. Restoring a backup remains the recovery path for a failed local migration; no down-migration UI is required.
- The prompt/model configuration seeded by the migration uses the repository's current defaults. A local installation that previously changed text-agent settings through environment variables must reapply those choices through the backoffice after migration.
- Fake-runtime verification proves the data path and workflow contract, not the quality of an edited prompt. Real-provider evaluation, prompt evaluation metrics, and cost governance are deferred.
- The unprotected backoffice is permitted only because this is a local POC. Authentication, authorization, audit identities, and secure deployment are explicit follow-on work.

## 15. Final decisions

- The feature is a minimal configuration layer over the existing bounded runtime, not an arbitrary agent platform.
- Skills, schemas, fake implementations, and workflow authority stay in TypeScript.
- The manager selects a skill; application code deterministically selects the active specialist for that skill.
- There is one active manager and one active specialist per registered skill at all times.
- Drafts may be active and live-edited for prompt/runtime experiments, with evidence snapshots preserving history.
- Agent settings are database-authoritative; only OpenAI is supported.
- The admin surface is one trusted local-only page without auth.
- Default runtime-agent records are embedded in the database migration.
- Fake end-to-end verification is the required proof; real-provider acceptance is intentionally deferred.

## 16. Implementation tracking

This table tracks implementation coverage without changing the approved requirements above. The canonical implementation plan is [`PLAN.md`](PLAN.md). Status changes require direct evidence; “not observed failing” is not proof.

| Requirement | Plan phases | Status | Evidence |
| --- | --- | --- | --- |
| AM-001 | 1–4 | Verified | Additive migration plus lifecycle, coverage-repair, conflict, deletion, and concurrency matrix in `agent-management.test.ts`. |
| AM-002 | 1 | Verified | Fresh seeded coverage and an actual `0000` → current upgrade fixture preserve legacy model-call evidence. |
| AM-003 | 2 | Verified | `/admin/agents` Server Actions and focused browser create flow pass. |
| AM-004 | 2 | Verified | Draft edit/fork lineage plus concurrent monotonic fork coverage pass. |
| AM-005 | 4 | Verified | Lifecycle guards/conflicts and browser fork → confirm → activation replacement confirmation pass. |
| AM-006 | 2, 4 | Verified | Closed contracts, action validation/focus, conflict feedback, local-only warning, and control review pass. |
| AM-007 | 3 | Verified | Manager-contract and all deterministic agent fixtures pass. |
| AM-008 | 3 | Verified | Persisted complete-set resolver, selected-skill lookup, malformed-config recovery, and fake evidence pass. |
| AM-009 | 3 | Verified | Focused direct fake-quality fixture proves persisted specialist resolution and immutable evidence attribution. |
| AM-010 | 3–6 | Verified | Existing bounded schemas/services and fake browser flow remain green. |
| AM-011 | 3–5 | Verified | Fresh active-draft resolution and frozen preflight manager/quality invocation tests pass. |
| AM-012 | 1, 3, 5 | Verified | Fresh/prior migration, success/failure snapshot, and legacy evidence coverage pass. |
| AM-013 | 3, 5 | Verified | Persisted factories/resolver and exact-coverage/catalog preflight guard pass. |
| AM-014 | 3–6 | Verified | Fake-provider booklet e2e completes with database-backed agents; the exported PDF was rendered and inspected, and activation replacement passes in the admin browser flow. |

Allowed status values are `Not started`, `In progress`, `Verified`, and `Blocked by decision`. At each implementation phase checkpoint, update this table and the plan’s phase/traceability ledgers together so omissions remain visible.
