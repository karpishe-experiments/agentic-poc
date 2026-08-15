# Database-backed Runtime Agent Management POC Implementation Plan

**Status:** Draft for explicit approval

**Planning issue:** #11 — Agent management planning

**Implementation issue:** #12 — Agent management execution

**Parent issue:** #9 — Database-backed runtime agent definitions and admin management

**Authoritative PRD:** [`database-backed-agent-management-prd.md`](database-backed-agent-management-prd.md)

**Working branch:** `issue-10-database-backed-agent-management` (reuse explicitly approved by the user)

## 1. Authority, outcome, and approval gate

This is the canonical implementation plan for the approved database-backed runtime agent management PRD. The agent-management PRD governs this feature. The accepted Kids Booklet PRD continues to govern the surrounding booklet workflow, and `docs/architecture.md` describes verified current behavior rather than future intent.

The implementation outcome is a local-only agent backoffice and database-backed runtime resolution that preserve the existing application-controlled manager → specialist flow. Runtime skills, schemas, tools, materialization, persistence, approvals, jobs, and stage transitions remain code-owned.

This plan is planning-only until the user explicitly approves it. Do not begin application implementation, run a migration against user data, or move Issue #12 to In progress before that approval is recorded on Issue #11. Once approved, this plan authorizes the implementation agent to commit and push each verified phase on the approved working branch and to post the required progress/evidence comments on Issues #12 and #9 without requesting separate end-of-phase authorization. Approval does not authorize merging, closing issues, making real-provider calls, or expanding the PRD.

## 2. Planning basis and verified baseline

The plan was prepared against the repository state on 2026-08-15, including:

- the approved agent-management PRD;
- `docs/architecture.md`, `docs/experiment-brief.md`, and the accepted Kids Booklet PRD/plan;
- the current Drizzle schema, migration journal, repositories, application services, agent factories/runtimes, configuration, evidence path, admin-adjacent UI patterns, and automated tests;
- installed versions: Next.js 16.2.12, React 19.2.8, AI SDK 7.0.47, `@ai-sdk/react` 4.0.50, OpenAI Agents SDK 0.14.2, Drizzle ORM 0.45.2, Zod 4.4.3, Vitest 4.1.10, and Playwright 1.62.1;
- version-matched package source/documentation before using SDK APIs;
- official OpenAI guidance for the configured GPT-5.6 model family and Agents SDK behavior; and
- the system `openai-docs` workflow and the project-local `ai-sdk`, `next-best-practices`, `vercel-react-best-practices`, `web-design-guidelines`, `playwright`, `pdf`, and `capture-project-learnings` workflows.

No dependency addition or upgrade is required. The admin work uses React/Next.js primitives already installed. The Vercel AI SDK chat transport is not redesigned; it receives regression coverage because configuration failures must remain recoverable through the existing typed UI flow.

## 3. Scope reconciliation and decisions closed by this plan

The following choices are implementation authority unless a verified code or SDK constraint requires an equivalent correction.

### 3.1 Eligibility replaces assignment persistence

The discovery issue discussed assignment tables and priorities, but the approved PRD made a narrower decision: stage and operation eligibility remain in `SkillRegistry`, the manager selects one allowed skill, and the database supplies exactly one active specialist for that skill. Therefore:

- do not create an assignment table, priority field, stage table, operation table, or admin assignment editor;
- the coverage summary is the configuration view: one global manager slot plus one slot for each of the seven registered skills;
- adding or versioning a skill remains a code change under `lib/contracts/skills.ts` and `lib/skills/`; and
- ambiguity is prevented by unique active slots rather than priority resolution.

This resolves the older issue wording in favor of the approved PRD.

### 3.2 Persisted prompt is the complete agent instruction

Each agent version stores the complete `instructions` string passed to the OpenAI Agents SDK. The migration copies the current manager instruction and compiles one complete current specialist instruction per registered skill, including the existing Page Plan and visual-direction rules where applicable.

The runtime factory does not silently append editable behavioral prompt text. It continues to enforce the non-editable envelope structurally through the registered tool list, structured output schema, role-aware turn bounds, required manager tool use, disabled parallel tool calls, and stop-on-first-tool behavior.

### 3.3 Supported persisted settings

The POC authoring surface is deliberately closed:

| Field | Supported value and validation |
| --- | --- |
| Display name | Trimmed string, 1–120 characters. |
| Purpose | Trimmed string, 1–1,000 characters; displayed to the operator, not injected into the runtime prompt. |
| Role | `manager` or `specialist`. |
| Skill binding | `null` for managers; exactly one current `SkillId` for specialists. |
| Instructions | String, 1–20,000 characters; plain text only. |
| Provider | Persisted as `openai`; every other value is rejected. |
| Model ID | One value from the code-owned supported text-agent catalog: `gpt-5.6-luna`, `gpt-5.6-terra`, or `gpt-5.6-sol`. |
| Reasoning effort | `low`, `medium`, or `high`, preserving the current application surface. |
| Maximum turns | Manager: integer 1–2, seeded as 2. Specialist: exactly 1. |

Temperature, top-p, penalties, text verbosity, tools, MCP, handoffs, output schemas, provider credentials, prompt templates, arbitrary JSON settings, and code are not authorable.

`lib/config/agent-models.ts` owns the closed model catalog. Each entry records provider, allowed roles, allowed reasoning efforts, required function-calling/structured-output capabilities, and optional checked-in pricing. All three initial GPT-5.6 entries permit both roles and the POC reasoning subset (`low`, `medium`, `high`); current official model pages identify function calling and structured outputs as supported. The form renders a select, not a free-form model input. A new model ID is a reviewed code/catalog change with official capability verification and tests; the no-generation preflight only verifies account access and does not substitute for capability validation. Unsupported or catalog-incompatible values are rejected at the contract, Server Action, service, and resolver boundaries before save or activation.

Create-form defaults are deterministic: no role is preselected; name, purpose, skill, and instructions begin empty; provider is read-only `openai`; selecting manager defaults model/reasoning/max turns to Luna/low/2; selecting a normal specialist defaults to Terra/medium/1; selecting the quality skill defaults to Sol/medium/1. Changing role or skill may update untouched defaults but never overwrites a field the operator already changed. Forking remains the safe way to copy complete existing behavior.

### 3.4 Lifecycle and direct deactivation

- A new logical agent has inactive draft version 1.
- Any version may be forked into a new inactive draft with a parent link and the next monotonic number.
- Only drafts are editable. An active draft may change name, purpose, instructions, model, reasoning, and maximum turns; it may not change role or skill.
- Confirmation freezes a draft without changing its active flag.
- Activation atomically replaces the current version in the target manager/skill slot and deactivates any other active version of the same logical agent.
- There is no standalone “Deactivate” action because exact coverage makes every direct deactivation invalid. Deactivation is observable only as the transactional side effect of activating a valid replacement.
- Retirement requires an inactive draft or confirmed version and makes it permanently inactive and immutable.
- Deletion is limited to an inactive draft with no children and no model-call evidence. If it is the logical agent’s only version, the empty logical-agent row is deleted in the same transaction. An immutable audit event retains the deleted IDs.
- Every mutation calculates the proposed post-transaction coverage. A role/skill-changing version cannot be activated if deactivating another version of the same logical agent would uncover a different slot.

Coverage repair is explicit rather than deadlocking on corrupt data. When pre-state coverage is exact, every mutation must preserve it. When pre-state coverage is incomplete, read/inspect and inactive create/edit/fork/confirm/retire/delete operations are allowed only when they do not touch an active row or add a new violation. Activation is allowed only when the post-state violation set is a strict subset of the pre-state set and it introduces no duplicate slot, active-retired row, role/skill mismatch, or second active version for a logical agent. This permits repairing two or more missing slots one at a time; once coverage is exact, the normal invariant applies. No action may worsen or merely reshuffle corrupt coverage.

### 3.5 Concurrency and freshness

Every version has an integer `revision` used for optimistic concurrency. Draft edits, forks, confirmation, activation, retirement, and deletion submit the revision the operator observed. Activation also submits the observed active version IDs for the target slot and logical agent. The service rechecks them inside the transaction; stale state returns a recoverable `agent_conflict` and never silently replaces a newly activated version.

Runtime resolution performs a database read for the manager immediately before manager execution and another read for the selected specialist immediately before specialist preparation/execution. `QualityService` performs the same specialist lookup before Story Plan quality review. There is no process, request-shared, React, or route cache for active agent versions. A resolved immutable object is used for the duration of one call; subsequent calls see later edits or activations.

### 3.6 Seed behavior and quality specialist model

The checked-in migration, not `npm run seed`, inserts stable version-1 defaults:

| Slot | Logical ID suffix | Version ID suffix | Seed model | Reasoning | Max turns | Instruction source |
| --- | --- | --- | --- | --- | ---: | --- |
| Manager | `a001` | `b001` | `gpt-5.6-luna` | low | 2 | Current `createManagerAgent` instruction. |
| `intake_readiness@1` | `a101` | `b101` | `gpt-5.6-terra` | medium | 1 | Current generic specialist instruction. |
| `story_planning_revision@1` | `a102` | `b102` | `gpt-5.6-terra` | medium | 1 | Current generic specialist instruction. |
| `quality_review_targeted_repair@1` | `a103` | `b103` | `gpt-5.6-sol` | medium | 1 | Current generic specialist instruction; uses the current review-role model because both manager-routed and direct quality calls resolve this one specialist. |
| `visual_direction_reference_planning@1` | `a104` | `b104` | `gpt-5.6-terra` | medium | 1 | Generic instruction plus both current stage-conditional visual rules. |
| `booklet_specification@1` | `a105` | `b105` | `gpt-5.6-terra` | medium | 1 | Current generic specialist instruction. |
| `page_planning_writing@1` | `a106` | `b106` | `gpt-5.6-terra` | medium | 1 | Generic instruction plus current comic-lettering rule. |
| `image_prompt_compilation@1` | `a107` | `b107` | `gpt-5.6-terra` | medium | 1 | Current generic specialist instruction. |

Use full valid UUIDs `00000000-0000-4000-8000-00000000<suffix>` for these stable IDs. All eight versions are active, confirmed, authored by `local-admin`, and use provider `openai`. Use the fixed seed timestamp `1786752000000` (`2026-08-15T00:00:00.000Z`). For each slot suffix, use event ID prefixes `c`/`d`/`e` for the `create`/`confirm`/`activate` events respectively (for example manager events end in `c001`, `d001`, and `e001`). The complete event enum is `create`, `edit`, `fork`, `confirm`, `activate`, `deactivate`, `retire`, and `delete`. Event metadata is a versioned JSON object limited to 4,096 serialized characters and may contain only structural IDs/revisions/replacement information—never instructions, model input/output, credentials, or provider bodies. A checked-in `db/agent-defaults.ts` manifest holds the expected stable seed values and events for migration verification only; runtime code never imports it as configuration.

### 3.7 Evidence and cost semantics

`model_calls.provider` and `model_calls.model` continue to identify the runtime actually executed (`fake`/fake model IDs in deterministic mode, OpenAI/persisted model in real mode). Each manager, specialist, and direct quality-review row additionally records the resolved logical/version IDs and a versioned immutable configuration snapshot.

The snapshot contains agent/version IDs, version number, display name, role, skill, full instructions, persisted provider/model/reasoning/max turns, derived code-owned execution settings, and runtime mode. A fake call therefore proves which persisted definition was selected without pretending a paid model ran.

Cost estimates become catalog-model-aware rather than role-based. The three initial catalog models use their checked-in verified prices. A future reviewed catalog entry may intentionally have null pricing, in which case usage is retained while estimate and pricing version are null. Arbitrary user-entered model IDs are not accepted. Real pricing changes remain outside this feature and require the existing verified pricing workflow.

### 3.8 Next.js admin boundary

`/admin/agents` is a dynamic Node.js Server Component that reads directly from `AgentManagementService`. Internal mutations use Server Actions in `app/admin/agents/actions.ts`, Zod/FormData parsing, `useActionState`, `useFormStatus`, and `revalidatePath`. No duplicate REST API is added because there is no external admin client.

Small Client Components own pending state, unsaved-change warnings, field-error focus, and destructive confirmation. Server Components receive only serializable view models with ISO timestamps. The page has explicit loading, empty/corrupt-coverage, route error, validation, stale conflict, success, and request-failure states.

The page and every action prominently state that the surface is unauthenticated and safe only for trusted local development. Do not add middleware/proxy, cookies, a password, RBAC, or a misleading partial authentication mechanism.

## 4. Execution protocol and mandatory phase checkpoint

After explicit plan approval, the primary implementation agent owns sequencing, cross-cutting decisions, migration integration, verification, commits, pushes, and GitHub updates. Follow `AGENTS.md` and apply the relevant repository skills only within this PRD’s POC scope.

Before the first implementation edit:

1. Re-read the PRD, this plan, `AGENTS.md`, `docs/architecture.md`, and current Issue #12/#9 state.
2. Confirm the approved planning branch and working tree; preserve unrelated work.
3. Move Issue #12 to In progress and assign it as directed by the user/project.
4. Continue on `issue-10-database-backed-agent-management` as explicitly directed by the user; do not create another implementation branch unless the user later changes that direction.
5. Inspect version-matched package docs/source before changing SDK calls. Use official OpenAI documentation for OpenAI behavior.
6. Record a pre-change fake-provider baseline: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:agent`, `npm run build`, and `npm run test:e2e`. Distinguish inherited failures from regressions; do not normalize a failing baseline into acceptance.
7. Verify `npx` is available. Verify `pdfinfo` and `pdftoppm` before Phase 6; on the reference Windows environment, if Poppler is missing, pause and request approval for the README-documented `winget install --id oschwartz10612.Poppler --exact` prerequisite rather than silently omitting visual PDF verification.
8. Use fake providers for all automated checks. Real-provider acceptance and new retained evaluations are outside this PRD.

Every phase ends with all of the following steps, in this order:

1. **Review and repair:** inspect the complete phase diff against the PRD, this plan, current architecture, and relevant skills. Add every confirmed defect to the Open Findings Ledger in Section 5. Fix findings and repeat focused review/testing until the ledger has zero open entries. Do not defer an in-scope defect merely to finish the phase.
2. **Verify:** run the phase’s focused commands and any broader regression command affected by the change. Record exact pass/fail/omitted results and direct evidence; “not observed failing” is not proof.
3. **Update documentation:** update `docs/architecture.md`, README, user/operator guidance, or lessons when verified behavior/setup materially changed or conflicts with current text. Use `capture-project-learnings` for durable verified lessons; do not record hypotheses or a chronological diary.
4. **Revise the remaining plan:** re-check later phases against discoveries. Adjust file lists, contracts, risks, or verification while preserving PRD scope. Record material plan changes and rationale in the decision log.
5. **Record coverage and progress:** update the Phase Progress Ledger and traceability status in this plan, plus the implementation tracker in the PRD. Requirement wording stays unchanged; only status/evidence fields change.
6. **Publish:** commit the coherent phase with a clear message and push the branch. This is authorized by plan approval and does not need another end-of-phase confirmation. Do not publish failing or partially reviewed phase work as a completed checkpoint.
7. **Update GitHub:** comment on Issue #12 with phase name, commit SHA, implemented AM IDs, commands/results, evidence paths, resolved findings, documentation changes, core decisions, known nonblocking limitations, and next phase. Update parent #9 at major milestones and final evidence. These progress comments are authorized by plan approval; do not close or merge without user authorization.

The next phase begins only after the current phase’s outcome works, required evidence passes, the Open Findings Ledger is empty, docs/trackers are current, and the checkpoint commit is pushed.

## 5. Living progress, findings, and decisions

### 5.1 Phase Progress Ledger

| Phase | Status | Commit | PRD coverage | Evidence |
| --- | --- | --- | --- | --- |
| 1. Schema, migration, and seeded coverage | Verified | `5e1aad7` | AM-001, AM-002, AM-012 | Fresh and representative `0000` → current migration, stable coverage, legacy evidence, and backup tests pass. |
| 2. Management domain and inspect/create/edit/fork UI | Verified | `5e1aad7` | AM-003, AM-004, AM-006 | Admin route/actions, validation focus, and focused browser create/fork proof pass. |
| 3. Database-backed runtime, attribution, and recovery | Verified | `5e1aad7` | AM-007–AM-014 | Resolver, manager/specialist/quality frozen attribution, malformed-config recovery, pending resume, and fake booklet flow pass. |
| 4. Lifecycle, activation, conflicts, and deletion UI | Verified | `5e1aad7` | AM-001, AM-005, AM-006, AM-011 | Lifecycle, progressive repair, concurrency, deletion guards, and browser activation confirmation pass. |
| 5. Evidence presentation, configuration cleanup, and runtime regression | Verified | `5e1aad7` | AM-010–AM-014 | DB-authoritative text configuration, catalog-aware preflight, and regression coverage pass. |
| 6. Browser proof, documentation, and completion audit | Verified | `5e1aad7` | AM-001–AM-014 | Fake golden path/PDF inspection, current UI review, documentation, and completion audit pass; human verification remains. |

Allowed status values are `Not started`, `In progress`, `Verified`, and `Blocked by decision`. `Verified` requires the mandatory checkpoint.

### 5.2 Open Findings Ledger

| ID | Phase | Severity | Finding | Owner | Status/evidence |
| --- | --- | --- | --- | --- | --- |
| — | — | — | No open findings during planning. | — | Empty |

Replace the placeholder with confirmed open findings during execution. When fixed and reverified, move the resolution into that phase’s evidence/GitHub checkpoint and remove it from this open ledger. A phase cannot be marked Verified while any row remains.

### 5.3 Decision log

| Decision | Rationale | Source |
| --- | --- | --- |
| No assignment table or priority | Approved PRD derives applicability from the closed skill registry and requires one active specialist per skill. | PRD §§6.2, 7.2, 15 |
| Exact persisted prompt passed to SDK | Makes all editable behavior versioned and snapshots reproducible; code enforces capability structurally. | PRD §§6.1–6.3, 10.3 |
| Server Components + Server Actions | Internal-only admin page needs direct reads and mutations, not a duplicate public REST surface. | PRD §8; Next.js project skill |
| Integer revision optimistic concurrency | Timestamp collisions are avoidable and stale writes/activations must fail explicitly. | PRD §§7.2, 10.1 |
| No runtime cache | The PRD requires every invocation to observe current active configuration. | AM-011 |
| Quality skill seeded with review model | One persisted specialist must serve manager-routed and direct quality review consistently. | PRD §§4, 9, 10.2 |
| Closed compatible model catalog | Official model pages verify the initial GPT-5.6 family supports required function calling and structured outputs; code-owned entries prevent saving an image/audio/incompatible model that merely exists. | PRD §6.3; official OpenAI model catalog |
| Resolve all required text agents before workflow mutation | Manager/specialist selection, automatic Story Plan quality, and card-follow-up recovery must satisfy the PRD no-mutation guarantee with frozen per-invocation configurations. | PRD §9; AM-009–AM-011 |
| Runtime attribution precedes activation UI | Database-backed resolution and immutable call attribution ship together before the operator can activate a replacement, so every visible phase is truthful and auditable. | PRD §§2.2, 7.2, 10.3 |
| Progressive corrupt-coverage repair | Inactive preparation plus strictly reducing activation repairs multiple missing slots without weakening exact coverage in normal state. | PRD §§7.2, 9 |
| Server actions remain unauthenticated/local-only | Authentication is explicitly out of scope; a weak substitute would misrepresent safety. | PRD §§3.2, 5.1 |
| Reuse the current branch | The user explicitly approved continuing on `issue-10-database-backed-agent-management`; implementation checkpoints publish there unless redirected. | User direction, 2026-08-15 |

## 6. Architecture and ownership

```text
/admin/agents Server Component
  -> AgentManagementService -> AgentRepository -> SQLite/Drizzle
  -> Server Actions ---------^        |
                                      +-> immutable audit events

booklet material turn
  -> ManagerService -> AgentResolver -> active manager snapshot
  -> code registry filters stage/operation skills
  -> manager runtime selects one allowed SkillId
  -> AgentResolver -> active specialist snapshot for SkillId
  -> specialist runtime -> registered structured output schema
  -> application service validates/materializes/persists
  -> model-call evidence stores version IDs + immutable snapshot

direct Story Plan quality review
  -> QualityService -> same AgentResolver -> quality specialist snapshot
  -> same bounded specialist runtime/evidence contract
```

| Area | Owner after implementation | Responsibility |
| --- | --- | --- |
| Agent contracts | `lib/contracts/agents.ts` | Closed roles/status/provider/reasoning schemas, configuration limits, action inputs, admin view models, effective snapshot. |
| Logical/version persistence | `db/schema.ts`, `db/repositories.ts` | Rows, indexes/checks, mapping, transactions, optimistic concurrency, audit events. |
| Seed manifest/migration | `db/agent-defaults.ts`, `db/migrations/0001_*.sql` | Stable expected records and checked-in SQL inserts. Runtime does not read the manifest. |
| Management policy | `lib/application/agent-management-service.ts` | Registry-aware validation, lifecycle/coverage rules, admin snapshot, action errors. |
| Runtime resolution | `lib/application/agent-resolver.ts` | Fresh manager/specialist lookup, schema parsing, immutable effective snapshot, configuration failure. |
| Agent construction | `lib/agents/manager.ts`, `lib/agents/specialist.ts` | Construct SDK agents from resolved prompts/config plus code-owned tools/output/limits. |
| Orchestration | `ManagerService`, `QualityService` | Resolve at call time, preserve route/schema/application authority, record evidence. |
| Admin UI | `app/admin/agents/**`, `components/admin/agents/**` | Local warning, coverage, list/history, forms/actions, accessible state/recovery. |
| Skill applicability | Existing `lib/contracts/skills.ts`, `lib/skills/**` | Closed IDs, stages, operations, schemas, deterministic fake behavior. Never admin-managed. |
| Evidence | `model_calls`, `EvidenceRepository`, `EvidenceService` | Actual execution identity plus persisted agent attribution/snapshot. |

## 7. Persistence and migration contract

### 7.1 Tables and columns

| Table | Required columns and constraints |
| --- | --- |
| `agent_definitions` | `id` text PK; `created_at_ms` integer; `created_by` text. It contains stable identity only because all user-visible configuration is versioned. |
| `agent_versions` | `id` text PK; `agent_id` FK; `version_number` integer; nullable self-FK `parent_version_id`; `display_name`; `purpose`; `role`; nullable `skill_id`; `instructions`; `provider`; `model_id`; `reasoning_effort`; `max_turns`; `status`; integer boolean `is_active`; integer `revision`; `created_at_ms`; `updated_at_ms`; `created_by`; `updated_by`. |
| `agent_version_events` | `id` text PK; stable `agent_id` and `agent_version_id` text identifiers; closed `action`; `actor`; nullable `metadata_json` with `length(metadata_json) <= 4096`; `created_at_ms`. IDs deliberately remain after an eligible draft/version definition is deleted. |
| `model_calls` additions | Nullable `agent_definition_id` FK; nullable `agent_version_id` FK; nullable `agent_config_snapshot_json`. Existing rows remain valid with all three null. |

`agent_versions` requires:

- unique `(agent_id, version_number)`;
- partial unique active manager index on `role` where `is_active = 1 AND role = 'manager'`;
- partial unique active specialist index on `skill_id` where `is_active = 1 AND role = 'specialist'`;
- partial unique active logical-agent index on `agent_id` where `is_active = 1`;
- indexes for `(agent_id, created_at_ms)`, `(skill_id, is_active)`, and child lookup by `parent_version_id`;
- check constraints for allowed role/status/provider/reasoning, role/skill compatibility, positive version/revision, role-aware maximum turns, and `status != 'retired' OR is_active = 0`.

Database uniqueness prevents duplicates; service transactions enforce exact coverage and registry membership because SQLite cannot require a row for each code-owned skill.

### 7.2 Migration behavior

Generate a new migration after updating `db/schema.ts`, inspect it, then add the stable idempotent seed inserts to that checked-in migration. Do not edit `0000_left_sleepwalker.sql`.

Before applying the new migration to the configured local file database, stop the development server and create a consistent backup with a small checked-in `scripts/backup-local-db.ts` helper. The helper resolves `DATABASE_URL` to an absolute `file:` path, refuses memory/remote/out-of-workspace targets without explicit user direction, checkpoints any SQLite WAL, closes the client, and copies the database into `output/backups/agent-management/<UTC timestamp>/booklets.db`. It writes a manifest containing the source path, byte size, SHA-256, and pre-migration journal state, then reopens the backup read-only enough to verify the journal and a representative booklet count. Temporary migration tests and the isolated e2e database do not require this user-data backup.

If migration fails, do not automatically overwrite the source database. Preserve the failed file, report the verified backup path/hash, and ask before restoring. The documented restore procedure stops all app processes, validates both resolved paths, moves the failed database aside, copies the verified backup into the original location, and rechecks the migration journal/booklet count. This is the only local rollback path.

The migration must:

1. create the three new tables, checks, indexes, and nullable model-call columns without rewriting or deleting existing rows;
2. insert eight logical definitions, eight active confirmed versions, and the 24 specified create/confirm/activate audit events using the fixed IDs/timestamp and `INSERT ... ON CONFLICT DO NOTHING` or an equivalent idempotent statement;
3. leave existing booklets/model calls untouched and readable;
4. produce exact manager + seven-skill coverage immediately after migration, without running `npm run seed`; and
5. fail atomically on an unexpected incompatible schema. Recovery is restoring the user’s local database backup and correcting the migration; there is no down-migration UI.

`tests/integration/agent-migration.test.ts` creates two isolated databases:

- a fresh empty database migrated through the complete journal; and
- a representative pre-change database built by applying only migration 0000 from a temporary migration directory, inserting a booklet and legacy model-call row, then applying the full journal.

It proves stable seed contents/events/timestamps, idempotent insert semantics, complete/unique coverage, legacy row readability with null attribution, and preservation of representative data. A focused backup-helper test uses a temporary file database to prove path refusal, manifest/hash creation, and readable backup contents without touching the configured user database. Temporary databases live under the OS temporary directory or existing validated test roots and are cleaned only through the existing Windows-safe test cleanup path.

### 7.3 Transaction contracts

| Operation | Atomic behavior |
| --- | --- |
| Create logical agent | Insert logical row, version 1 inactive draft, and create event. |
| Edit draft | Compare `revision`; enforce mutable fields/active role-skill guard; update + increment revision + edit event. |
| Fork | Compare source revision; allocate `max(version_number)+1`, copy full configuration, set inactive draft/parent, insert fork event. Unique conflict becomes `agent_conflict`. |
| Confirm | Compare revision; draft → confirmed; increment revision; insert event; active flag unchanged. |
| Activate | Compare revisions and observed slot IDs; validate target/registry; compute final coverage; deactivate replaced slot and same-logical active version; activate target; increment affected revisions; insert deactivate/activate events. Roll back on any constraint/conflict. |
| Retire | Compare revision; require inactive/non-retired; set retired, increment revision, insert event. |
| Delete draft | Compare revision; require inactive draft, no child, no `model_calls`; insert delete event; delete version; delete logical row if no versions remain. |

All domain conflicts become typed recoverable errors; raw libSQL/Drizzle messages do not reach the UI.

## 8. Contracts, repository, and services

### 8.1 Zod/TypeScript contracts

Add `lib/contracts/agents.ts` with:

- `agentRoleSchema`, `agentVersionStatusSchema`, `agentProviderSchema`, `agentReasoningEffortSchema`, and `agentEventActionSchema`;
- `agentVersionConfigurationSchema` with cross-field role/skill/max-turn rules;
- `agentDefinitionSchema`, `agentVersionSchema`, `agentCoverageSlotSchema`, `agentAdminSnapshotSchema`, and `agentVersionEventSchema`;
- `createAgentInputSchema`, `updateAgentDraftInputSchema`, `forkAgentVersionInputSchema`, and lifecycle action schemas carrying UUIDs and expected revision/slot values;
- `effectiveAgentConfigurationSnapshotSchema` with `schemaVersion: "1"` and derived execution settings; and
- `agentCoverageFingerprintSchema` plus a serializable `pendingCardFollowupSchema` containing only `responseId`, safe summary, and status for retry/resume;
- `agentActionStateSchema` for `success`, `validation_error`, `conflict`, and `failure`, including field errors and a safe next step.

Parse at every database, Server Action, runtime, and evidence boundary. Repositories return domain/view types rather than raw rows or JSON strings.

### 8.2 Repository surface

Extend `Repositories` with `agents: AgentRepository`:

```ts
type AgentRepository = {
  getAdminSnapshot(): Promise<AgentPersistenceSnapshot>;
  getVersion(id: string): Promise<AgentVersion | null>;
  resolveActiveManager(): Promise<AgentVersion | null>;
  resolveActiveSpecialist(skillId: SkillId): Promise<AgentVersion | null>;
  resolveCompleteActiveCoverage(): Promise<AgentCoveragePersistenceSnapshot>;
  create(input: CreateAgentRecord): Promise<AgentVersion>;
  updateDraft(input: UpdateAgentDraftRecord): Promise<AgentVersion>;
  fork(input: ForkAgentVersionRecord): Promise<AgentVersion>;
  confirm(input: VersionMutationRecord): Promise<AgentVersion>;
  activate(input: ActivateAgentVersionRecord): Promise<AgentVersion>;
  retire(input: VersionMutationRecord): Promise<AgentVersion>;
  deleteDraft(input: VersionMutationRecord): Promise<void>;
};
```

The existing conversation repository additionally exposes `getLatestPendingCardFollowup(bookletId)` for the workspace read model. It returns only a validated pending/running response identity plus a safe card summary, never raw error/provider text. Startup and request recovery reset an orphaned `running` claim to `pending` using the existing compare-and-set method before offering Resume.

Mutation methods own transactions and compare-and-swap details. `AgentManagementService` owns product validation and error wording. `AgentResolver` owns runtime validation and snapshot derivation. Route/UI code never imports Drizzle or database rows.

### 8.3 Management service behavior

`AgentManagementService` receives repositories plus `SkillRegistry`. It exposes:

- `getAdminSnapshot()` — active manager, seven ordered skill slots, warnings, logical agents, chronological versions/events, and closed skill choices;
- `create`, `updateDraft`, `fork`, `confirm`, `activate`, `retire`, and `deleteDraft` — all actor-stamped `local-admin`;
- deterministic field validation before repository calls; and
- safe error mapping: `agent_not_found` 404, `agent_invalid_configuration` 400, `agent_immutable` 409, `agent_coverage_conflict` 409, `agent_delete_blocked` 409, and `agent_conflict` 409.

The service calculates a deterministic set of coverage violations from the current registry before and after each mutation. Exact pre-state must remain exact. Incomplete pre-state follows the progressive-repair rule in Section 3.4: inactive preparation may preserve but not worsen the violation set, while activation must strictly reduce it. The admin snapshot exposes every missing/malformed slot and the next repair action; tests cover two simultaneous missing slots so recovery is demonstrably reachable.

### 8.4 Runtime resolver behavior

`AgentResolver` exposes:

```ts
resolveManager(runtimeMode: "fake" | "real"): Promise<ResolvedAgentConfiguration>;
resolveSpecialist(skillId: SkillId, runtimeMode: "fake" | "real"): Promise<ResolvedAgentConfiguration>;
prepareCompleteActiveSet(runtimeMode: "fake" | "real"): Promise<PreparedActiveAgentSet>;
```

It performs fresh repository reads, validates the complete row against the same contract and supported-model catalog, checks role/skill/status/active/registry compatibility, freezes a plain resolved object, and derives the effective snapshot. `prepareCompleteActiveSet` reads one consistent repository snapshot, validates/freezes the manager plus all seven specialists, and returns the ordered configurations and diagnostic ID/revision fingerprint. Missing, duplicate, retired, unsupported, or malformed configuration throws `agent_configuration_unavailable` with the missing manager/skill and `/admin/agents` next step.

Before `CardService` persists any card response/action that requires an agent follow-up, it calls `prepareCompleteActiveSet` as a no-write preflight; failure leaves the card, response, artifacts, approvals, jobs, messages, and stage unchanged. A successfully accepted creator decision is independently durable and may remain `pending` while its later chat follow-up is retried. The follow-up request prepares its own fresh complete set rather than reusing the earlier one. Normal admin mutations cannot create a gap after preflight because they preserve valid coverage transactionally; later external corruption causes the follow-up to fail without adding chat/workflow state and leaves the saved response pending.

For a manager-routed material turn, prepare one fresh complete active set before any SDK call or durable write, then use its frozen manager and selected specialist (and quality specialist when needed) throughout that turn. No user/assistant message, evidence row, new card, artifact, approval, job, or stage mutation occurs until that preparation succeeds. Once it succeeds, provider/schema attempts may write their own success/failure evidence even if execution later fails, but workflow mutation still waits for successful execution. Application-only paths such as PDF export do not resolve text agents and retain their existing deterministic ordering.

## 9. Runtime, evidence, and configuration changes

### 9.1 Manager-routed material turn

1. Build and validate saved `SkillContext` as today.
2. Resolve/freeze one complete active set from a consistent database snapshot; use its manager configuration.
3. Derive stage/operation-valid `SkillDefinition`s from the code registry.
4. Run real or fake manager with the resolved configuration and the same allowlist.
5. Validate the selected skill against that exact allowlist.
6. Select the already frozen active specialist for the chosen `SkillId` from that set.
7. If the selected skill can produce a Story Plan, prepare the already frozen quality specialist from that set for one-use review.
8. Validate specialist input, run the real adapter or deterministic `SkillDefinition.run`, and validate output.
9. Record manager and specialist success/failure rows with their own resolved IDs/snapshots. Pass any pre-resolved quality configuration into `QualityService` so an in-flight activation affects only the next invocation.
10. After all required configurations and model results have succeeded, append the user message and return the transient proposal to the existing application materialization/persistence path. Preserve the separate deterministic PDF-export branch.

The real manager factory receives persisted name/instructions/model/reasoning and code-owned tools/settings; `Runner.run` receives persisted max turns. The specialist factory receives persisted name/instructions/model/reasoning, no tools, and the registered output envelope; its runner receives one turn.

### 9.2 Direct quality review

`QualityService.prepareStoryReadiness` resolves/freezes `quality_review_targeted_repair@1` and returns a typed prepared invocation that `runStoryReadiness` must consume exactly once. The automatic new-Story-Plan path prepares it before artifact persistence. The card-approval path resolves it before mutating the card response and may then execute immediately. Remove the runtime’s `skill`/`review` constructor role and all hard-coded review model/harness lookup. Deterministic generation-readiness and final-page checks remain application-only and do not resolve or record a text agent.

### 9.3 Failure behavior

| Failure | User/application behavior | Persistence/evidence |
| --- | --- | --- |
| Missing/corrupt active manager | Recoverable configuration issue pointing to `/admin/agents`. | No manager call row because no agent was resolved; no workflow mutation. |
| Manager chooses disallowed skill | Existing typed recovery behavior. | Failed manager row includes resolved manager IDs/snapshot. |
| Missing/corrupt selected specialist | Recoverable configuration issue naming the skill. | Manager evidence is buffered until required resolution succeeds, so no call row or new chat/workflow mutation is written; a previously accepted creator response remains pending. |
| Missing/corrupt automatic quality specialist | Recoverable configuration issue naming the quality skill. | It is conservatively resolved before planning-specialist execution or evidence persistence, so no call row or new Story Plan/message/card is written. |
| Specialist input/output/provider failure | Existing safe retry/validation behavior. | Failed specialist row includes resolved IDs/snapshot. |
| Stale admin mutation | Inline conflict telling operator to reload/review. | Transaction rolls back; audit event is not written. |
| Unsupported/incompatible model | Save, activation, resolver, and preflight reject it with a catalog-safe message. | No runtime call or workflow mutation. |
| Future supported catalog model without verified price | Runtime may execute after capability review. | Usage retained; estimate/pricing version null. |

Do not add `agent_configuration_unavailable` to the persisted typed-recovery-card set: doing so would create a new decision. Map it to the existing safe non-2xx JSON error envelope with a closed `code`, user-safe `message`, `recoverable: true`, and `details.adminPath: "/admin/agents"`. On this error, `ChatService` resets a claimed card follow-up from `running` to `pending`; it does not delete the independently saved creator response.

`WorkspaceConversation` owns a typed `pendingSend` value containing text plus optional `responseId`. Set it before `sendMessage`; clear it only after successful finish. The installed AI SDK invokes `onError` and then `onFinish` for a failed send, so `onFinish({ isError })` must leave error/retry state intact when `isError` is true. `onError` parses only the known safe envelope from the transport error, reconciles optimistic messages to `initialMessages`, restores free text to the input, and renders a non-persisted error with Agents, Retry, and Reload actions. Retry resends the retained text and exact response ID. On reload, the workspace read model supplies the latest pending card follow-up (`responseId` and safe summary) and renders “Resume saved decision”; this makes the persisted `pending` response recoverable after process/browser restart. Unknown/malformed bodies use the current generic interruption text. Never render arbitrary provider/database error text and never auto-mutate configuration.

### 9.4 Environment and preflight

After migration, remove `OPENAI_MANAGER_MODEL`, `OPENAI_MANAGER_REASONING`, `OPENAI_SKILL_MODEL`, `OPENAI_SKILL_REASONING`, `OPENAI_REVIEW_MODEL`, and `OPENAI_REVIEW_REASONING` from runtime parsing and `.env.example`. They no longer override the database.

Update `scripts/preflight-env.mjs` to read the migrated database’s active OpenAI text model IDs, validate them against the code-owned catalog, add `OPENAI_IMAGE_MODEL`, deduplicate them, and use authenticated no-generation model lookups. This verifies account access only; catalog validation owns capability compatibility. If agent tables/coverage are missing, fail safely with “run `npm run db:migrate`” and no secrets. README Quick Start therefore runs backup/migration before preflight. `npm run dev` may continue to invoke preflight.

Update the opt-in real smoke script to resolve the active manager from the database and use the same runtime contract. It remains paid/networked, explicitly gated, and is not required by this PRD’s acceptance run.

## 10. Admin route and interaction specification

### 10.1 Files and rendering boundary

```text
app/admin/agents/page.tsx              dynamic Node Server Component
app/admin/agents/loading.tsx           coverage/list skeleton with status text
app/admin/agents/error.tsx             client error boundary with retry/Home link
app/admin/agents/actions.ts             internal Server Actions
components/admin/agents/
  agent-admin.tsx                      serializable snapshot composition
  coverage-summary.tsx                 manager + seven ordered slots
  create-agent-form.tsx                client form/action state
  agent-list.tsx                       logical-agent summaries
  agent-version-panel.tsx              editor/history and lifecycle actions
  agent-lifecycle-actions.tsx           pending/confirmation/conflict UI
  agent-action-message.tsx             live success/error region
```

Add an `Agents` navigation link in `app/layout.tsx`. The page is `runtime = "nodejs"` and `dynamic = "force-dynamic"`; do not cache database state.

### 10.2 Page topology

1. `h1` and persistent warning: “Trusted local backoffice — no authentication; do not expose on an untrusted network.”
2. Coverage summary with one manager card and seven registry-ordered specialist cards showing active version, status/draft warning, model, reasoning, and logical agent.
3. Create-agent form with no preselected role, role-dependent catalog/defaults, read-only OpenAI provider, and a persistent warning that instructions are snapshotted in evidence and must not contain secrets or private data.
4. Logical-agent list showing current active version/slot, role, version count, and chronological expandable version panels.
5. Draft editor with all supported fields and visible immutable/active restrictions.
6. Version actions: Fork, Confirm, Activate Replacement, Retire, and Delete Eligible Draft. The currently active seeded version remains easy to restore.

Use semantic headings, lists/tables, labels, buttons, and links. Long prompt/model text must wrap without horizontal overflow. Dates use `Intl.DateTimeFormat`; version numbers use tabular numerals. The finite expected list does not need virtualization, search, filtering, pagination, diffing, branch graphs, or a rich editor.

### 10.3 Interaction and state rules

- Forms use meaningful names, labels, `autocomplete="off"`, and uncontrolled/default values where practical.
- Pending controls say “Saving…”, “Activating…”, etc. and disable only after submission begins.
- Field errors render beside controls, link through `aria-describedby`, announce through `aria-live="polite"`, and focus the first invalid field.
- An edited draft installs one deduplicated `beforeunload` listener while dirty and intercepts same-origin anchor navigation in the admin subtree during capture. Both paths use the browser confirmation prompt; cancel preserves the form and focus, while confirm removes the guard and continues. Successful save/reset clears dirty state. Back/forward traversal is covered with a focused browser test; no custom router blocker is assumed.
- Success and failure messages are specific and include the next action.
- Activate confirmation names the version currently occupying the slot and explains that only future calls change.
- Retire and Delete use explicit confirmation UI; deletion is never one click.
- Conflicts preserve typed input and tell the operator to reload/review current state.
- Empty/corrupt coverage remains inspectable and points to migration or a valid activation; the page does not invent records client-side.
- Role/skill fields are disabled for active drafts and all confirmed/retired versions; immutable state is explained in text, not color alone.
- Keyboard order follows visual order, focus remains visible, and no interaction requires hover, drag, or pointer-only behavior.
- Reuse the app’s main-content skip link and semantic heading order. Buttons/links have specific Title Case labels plus hover/focus/active states; native selects set explicit foreground/background colors; identifiers use `translate="no"`; all controls retain zoom, paste, and keyboard behavior.
- Expanded version details use native `<details>`/`<summary>` because they are disclosure-only, not a selected application state. The page has no filters, tabs, or pagination requiring URL synchronization.

Before Phase 6 completion, fetch the then-current Web Interface Guidelines and run a terse file:line review over `app/admin/agents/**`, `components/admin/agents/**`, and affected global navigation/styles. Fix every in-scope finding and rerun the review until the Open Findings Ledger is empty.

## 11. Exact source areas expected to change

| Area | Planned changes |
| --- | --- |
| `db/schema.ts` | Add agent definitions/versions/events, constraints/indexes, and nullable model-call attribution/snapshot fields. |
| `db/repositories.ts` | Add row mappers, `AgentRepository`, transactions, evidence fields, legacy-null parsing. Keep driver details contained. |
| `db/migrations/0001_*.sql`, metadata | Generated schema migration plus reviewed stable idempotent default inserts. |
| `db/agent-defaults.ts` | Test-only stable expected seed manifest and complete extracted current prompts. |
| `lib/contracts/agents.ts` | New closed domain/action/snapshot/view contracts. |
| `lib/config/agent-models.ts` | Closed reviewed text-model catalog, role/reasoning/capability compatibility, and optional pricing metadata. |
| `lib/application/agent-management-service.ts` | New admin lifecycle/coverage policy. |
| `lib/application/agent-resolver.ts` | New fresh runtime resolution/snapshot/error boundary. |
| `lib/agents/manager.ts`, `specialist.ts` | Accept resolved configuration; remove hard-coded editable instructions/model settings. |
| `lib/agents/openai-manager-runtime.ts`, `openai-specialist-runtime.ts` | Per-call resolved config/max turns; one specialist adapter for normal and quality work. |
| `lib/application/manager-service.ts`, `quality-service.ts` | Fresh resolution, evidence attribution, same quality specialist source, no state mutation on config failure. |
| `lib/application/evidence-service.ts`, `lib/application/model-call-cost.ts`, `lib/config/pricing.ts` | Expose parsed snapshot/IDs and model-aware nullable estimate. |
| `lib/application/card-service.ts`, `lib/application/chat-service.ts`, `lib/http/errors.ts`, `components/workspace/workspace-conversation.tsx` | Preflight follow-up coverage, retain pending response identity, defer chat/workflow mutation until resolution succeeds, and show safe retry/resume recovery without changing the AI SDK message-stream contract. |
| `lib/config/env.ts`, `lib/config/models.ts`, `.env.example` | Remove database-authoritative text-agent overrides; retain image/runtime/trace settings. Delete `models.ts` if no legitimate imports remain. |
| `scripts/backup-local-db.ts`, `scripts/preflight-env.mjs`, `scripts/smoke-real-agent.ts`, test setup scripts | Verified local backup, database-backed active model discovery/resolution, and migrated isolated test data. |
| `app/admin/agents/**`, `components/admin/agents/**`, `app/layout.tsx`, minimal styles | Add the one local backoffice and discoverable navigation. |
| Tests listed in Sections 12–13 | Migration, contracts, services, runtime, evidence, UI, fixtures, browser, regression. |
| `docs/architecture.md`, `README.md`, this plan, agent-management PRD tracker, lessons if proven | Align current behavior/setup and record verified evidence. |

Do not modify runtime skill schemas/implementations, artifact transitions, image/PDF pipelines, existing retained evaluation artifacts, or creator UI beyond a safe configuration recovery message and global Agents navigation link.

## 12. Ordered implementation phases

### Phase 1 — Schema, migration, and seeded coverage

**Working outcome:** `npm run db:migrate` upgrades fresh and existing databases to contain one active confirmed manager and seven active confirmed skill specialists. The existing booklet runtime still works through its current hard-coded path while the new data is introduced safely.

**Primary files:** `lib/contracts/agents.ts`, `db/schema.ts`, `db/agent-defaults.ts`, new migration/metadata, agent migration tests, evidence repository parsing for nullable new fields.

**Code changes**

- Implement the closed agent/version/evidence snapshot contracts and validation limits.
- Add the three tables, constraints/indexes, model-call columns, row mappers, and seed manifest.
- Generate and inspect migration SQL; add stable default records/events.
- Implement and test `scripts/backup-local-db.ts`; run it against the configured local file database and record the verified manifest before `db:migrate`. Do not run the migration if backup verification fails.
- Keep current runtime/config behavior temporarily intact so this slice is migration-only.
- Add a repository coverage query used by tests and later services.

**Tests and validation**

- Fresh migration and prior-migration upgrade scenario.
- Exact eight-version seed manifest and prompt/config equality.
- One manager + seven unique skill slots + one active per logical agent.
- Migration seed statements are conflict-safe/idempotent.
- Seed audit rows have the specified stable IDs, timestamp, action values, actor, and bounded structural metadata; the backup-helper fixture proves checkpoint/copy/hash/readability and refuses unsafe targets.
- Existing booklet/model-call data remains readable with null attribution.
- Commands: `npm run db:generate`, inspect SQL/metadata, focused migration tests, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.

**Phase evidence:** schema/index inspection, fresh/upgrade database assertions, legacy row assertion, no change to existing booklet runtime behavior.

**End-of-phase gate:** execute every mandatory checkpoint step in Section 4; update both trackers for AM-001/AM-002 and the persistence portion of AM-012; publish only after zero open findings.

**Suggested commit:** `feat: add versioned runtime agent storage`

### Phase 2 — Management domain and inspect/create/edit/fork UI

**Working outcome:** the operator can open `/admin/agents`, inspect complete seeded coverage and chronological versions, create a safe inactive manager/specialist draft, edit it, and fork any version. Existing booklet behavior remains unchanged.

**Primary files:** agent repository/service, `/admin/agents` route/loading/error/actions, admin components, navigation, contract/repository/service/component tests.

**Code changes**

- Implement `AgentRepository` reads plus create/update/fork transactions and audit events.
- Implement `AgentManagementService.getAdminSnapshot/create/updateDraft/fork` with registry-aware validation and revision conflicts.
- Implement the Server Component page, coverage/list/history, create form, draft editor, action state, loading/error/empty states, and local-only warning.
- Preserve long user text, unsaved-change warning, serializable Server/Client props, accessible form/error behavior, and direct server reads.

**Tests and validation**

- Contract limits and role/skill/max-turn cross-field validation.
- Version 1 creation, arbitrary draft branching, monotonic numbering, stale edit/fork rejection, active-draft role/skill guard, audit actor/event.
- Admin snapshot orders all seven skill slots and shows draft/coverage warnings.
- Component tests for loading, empty, long prompt, validation, pending, success, and conflict states.
- Browser smoke: page loads from seeded migration, keyboard reaches every form/action, no horizontal overflow at desktop acceptance viewport.
- Commands: focused unit/integration/component tests, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`; Playwright CLI smoke as useful, not yet the final spec.

**End-of-phase gate:** Section 4 checkpoint; AM-003/AM-004 and relevant AM-006 tracker rows updated; docs updated only for verified visible/architecture changes; zero open findings before publish.

**Suggested commit:** `feat: add runtime agent draft management`

### Phase 3 — Database-backed runtime, attribution, and recovery

**Working outcome:** both fake and real adapters resolve the seeded active manager/specialist from SQLite for each call; every attempted manager, specialist, and direct quality call is attributable to its immutable resolved version/snapshot; configuration failures are safely retryable without workflow mutation. Activation remains unavailable until Phase 4.

**Primary files:** model catalog, resolver, agent factories/runtimes, `ManagerService`, `QualityService`, `CardService`, `ChatService`, evidence repository/service, HTTP error mapping, `WorkspaceConversation`, and runtime/evidence/recovery tests.

**Code changes**

- Implement the closed model catalog, fresh resolver, complete-coverage preflight, and immutable effective snapshots.
- Refactor manager/specialist factories so fake and real paths use exact persisted instructions/config while skills, tools, schemas, limits, and application authority stay code-owned.
- Resolve manager, selected specialist, and any automatic Story Plan quality specialist before the first workflow mutation; direct quality review uses the same persisted quality specialist.
- Persist independent success/failure attribution for each resolved call and expose it through Evidence JSON, preserving legacy null rows and fake execution identity.
- Preflight card actions that require follow-up, retain a pending response identity, and implement the safe error envelope, optimistic rollback, exact Retry, and reload-time “Resume saved decision” behavior in Section 9.3.
- Keep deterministic PDF export on its application-only path and leave activation/retirement/deletion actions unavailable.

**Tests and validation**

- Catalog tests cover all three allowed model IDs, roles, reasoning values, and required capabilities; tampered provider/model values fail at contract/action/resolver boundaries.
- Existing agent fixtures prove stage-valid routing and exact selected-specialist resolution through persisted fake configuration.
- Missing/corrupt manager, specialist, and automatic quality cases compare messages/evidence/cards/artifacts/approvals/jobs/stage before and after; no new row may remain, while an independently accepted earlier card response stays pending.
- Chat/client tests prove the installed AI SDK error-then-finish sequence preserves retry state, exact response ID retry, reload resume, optimistic rollback, and safe malformed-body fallback.
- Success/provider/schema failures retain independent immutable attribution; active draft edits affect only the next invocation; legacy and fake rows stay readable/correct.
- Existing booklet integration tests pass with seeded DB-backed resolution.
- Commands: focused catalog/resolver/manager/quality/card/chat/evidence tests, `npm run test:agent`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.

**End-of-phase gate:** Section 4 checkpoint; AM-007–AM-014 runtime/evidence portions recorded; `docs/architecture.md` describes verified persisted resolution and recovery; zero open findings before publish.

**Suggested commit:** `feat: resolve and attribute runtime agents from sqlite`

### Phase 4 — Lifecycle, activation, conflicts, and deletion UI

**Working outcome:** the operator can confirm, activate a replacement, retire, and safely delete eligible drafts while coverage remains exact. Because Phase 3 already owns runtime resolution and attribution, activation immediately and observably affects the next matching call.

**Primary files:** agent repository/service/action/component lifecycle paths plus focused lifecycle, concurrency, runtime-freshness, and recovery tests.

**Code changes**

- Implement confirm, activate replacement, retire, and delete transactions/events.
- Calculate deterministic before/after violation sets inside activation and enforce exact coverage or the progressive multi-gap repair rule.
- Enforce one active logical version, atomic slot replacement, active role/skill immutability, permanent retirement, child/evidence deletion guards, and last-version cleanup.
- Add confirmation/replacement explanations, action eligibility, conflict preservation, reload/review recovery, and no standalone deactivate action.

**Tests and validation**

- Complete lifecycle matrix, immutable edits, retired reactivation rejection, delete guards, and audit events.
- Exact-state coverage remains exact; a fixture with two missing specialist slots can prepare inactive drafts and activate them one at a time, with each activation strictly reducing the violation set.
- Two competing/stale activations leave one intended winner, return `agent_conflict` to the other, and preserve coverage.
- Activate an edited draft and prove the next invocation/evidence uses it while an already resolved in-flight snapshot stays unchanged; restore the seeded version and prove the subsequent call changes back.
- UI action availability, destructive confirmation, unsaved navigation, safe configuration recovery, and conflict preservation tests.
- Commands: focused lifecycle/concurrency/runtime/UI tests, `npm run test:agent`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.

**End-of-phase gate:** Section 4 checkpoint; AM-001/AM-005/AM-006 and activation-freshness evidence updated; zero open findings before publish.

**Suggested commit:** `feat: enforce runtime agent lifecycle coverage`

### Phase 5 — Evidence presentation, configuration cleanup, and regression

**Working outcome:** every relevant fake/real manager, specialist, and Story Plan quality call is attributable to the resolved version and immutable snapshot. Text-agent environment overrides are gone, preflight reads active database models, and legacy evidence remains readable.

**Primary files:** evidence repository/service, manager/quality call-recording paths, pricing/cost, env/example/preflight/smoke, evidence/config/runtime tests, README setup section.

**Code changes**

- Complete evidence presentation and cost summaries built on the IDs/snapshots already written in Phase 3; preserve nulls for legacy rows.
- Make estimates exact-model-aware and null for unpriced models.
- Remove text model/reasoning env overrides and obsolete `ModelRole` configuration.
- Update preflight order/DB model discovery and opt-in real smoke wiring.
- Add explicit no-secret/safe-error checks for snapshots and preflight output.

**Tests and validation**

- Evidence UI/JSON presents manager/specialist/direct-quality success and provider/schema failure snapshots written in Phase 3 without exposing private prompt text in screenshots or issue comments.
- Historical snapshots remain unchanged after active-draft edits and activation; the next-call behavior was already proven at the Phase 3/4 boundaries.
- Legacy model-call row remains readable with null IDs/snapshot.
- Fake rows retain fake execution provider/model and zero cost while snapshot identifies selected persisted OpenAI config.
- Priced catalog model estimate vs a reviewed catalog fixture with null pricing; arbitrary unknown models are rejected and never reach costing.
- Environment tests reject removed overrides as runtime authority; preflight failure safely identifies missing migration/coverage.
- Full existing integration/fixture regression.
- Commands: focused evidence/config tests, `npm run test:agent`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`; no real smoke required.

**End-of-phase gate:** Section 4 checkpoint; AM-010–AM-014 statuses/evidence updated; README quick-start change verified; capture durable lessons if proven; zero open findings before publish.

**Suggested commit:** `feat: attribute model calls to agent versions`

### Phase 6 — Browser golden path, docs, and completion audit

**Working outcome:** automated desktop Chromium proves the full local operator + booklet path with a forked/created specialist replacement, evidence attribution, complete PDF flow, and restored coverage. Canonical docs describe verified current behavior and every acceptance item has direct evidence.

**Primary files:** Playwright specs/setup, any defect fixes, `README.md`, `docs/architecture.md`, this plan, PRD tracker, lessons if verified.

**Code/review changes**

- Extend the isolated e2e migration setup; keep one SQLite worker and fake providers.
- Add/extend the browser golden path in Section 13.3.
- Render the downloaded fake-provider PDF with Poppler and inspect every page image for page order, legibility, clipping, overlap, and geometry regressions; keep temporary renders under `tmp/pdfs/agent-management-golden/` and remove them after recording the result.
- Run the current web-design-guidelines review over the complete admin UI and affected navigation; fix and rerun to zero findings.
- Run a defect-first implementation review against PRD, plan, architecture, migration SQL, service boundaries, and evidence.
- Update architecture current-state flow, prompt/config ownership, tables, resolution/failure sequence, extension guidance, and verification.
- Update README migration-before-preflight order, removed env variables, local-only `/admin/agents` usage/warning, model configuration workflow, commands, and PRD/plan/issue links.
- Do not change creator User Guide/Help unless verified creator-facing recovery changed. Do not rerun or rewrite the three retained real-provider evaluation booklets.

**Tests and validation**

- All focused tests and existing regressions.
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:agent`, `npm run build`, `npm run test:e2e`.
- Fresh and prior database migration checks repeated after final migration diff.
- `pdfinfo` plus `pdftoppm` render of the downloaded golden-path PDF, with every rendered page visually inspected and the result recorded.
- Git diff/status, tracked-secret scan, docs/link/command verification.
- Complete Section 15 audit with `proven`, `failed`, or `missing`; fix all `failed`/`missing` in scope.

**End-of-phase gate:** execute Section 4 in full; every tracker row and acceptance row must be proven, Open Findings Ledger empty, docs current, final phase pushed, and Issue #12/#9 evidence checkpoint posted. Request human verification from Issue #13; do not self-approve, merge, or close.

**Suggested commit:** `test: verify database-backed agent management`

## 13. Verification design

### 13.1 Test boundaries and new files

| Layer | Primary files/scenarios |
| --- | --- |
| Contract/unit | `tests/unit/agents/contracts.test.ts`, factory tests, pricing tests, admin action-state/component tests. Cross-field schemas, effective snapshot, structural runtime settings, field/action states. |
| Migration | `tests/integration/agent-migration.test.ts`. Fresh/prior database, seeds, constraints, legacy evidence. |
| Repository/service | `tests/integration/agent-management.test.ts`. Create/edit/fork/lifecycle/coverage/deletion/concurrency/events. |
| Runtime | Extend `tests/integration/manager-contracts.test.ts`; add resolver and quality cases. Eligibility, fresh lookup, missing config, fake/real-adapter seam, no state mutation. |
| Evidence | `tests/integration/agent-evidence.test.ts`. Success/failure, active draft edit, activation history, legacy nulls, fake execution identity. |
| Agent fixtures | Existing twelve fixtures, augmented by a seeded agent-resolution harness rather than replaced. No paid calls. |
| Browser | `tests/e2e/agent-management.spec.ts` for focused admin states and extended `golden-path.spec.ts` for activation → invocation → PDF → restore. |

Tests use temporary file databases migrated from checked-in SQL; do not bypass migrations with direct schema pushes. Fake runtimes must still pass through resolver, registry, validation, evidence, and application services. Mocks may isolate the paid SDK adapter but cannot bypass the product boundary being proved.

### 13.2 Repository/service scenario matrix

- Seed coverage: exactly manager + seven registered skills; no extras/duplicates.
- Create manager/specialist version 1; invalid provider/role/skill/model/reasoning/max turns rejected.
- Update inactive and active drafts; active role/skill change rejected.
- Fork confirmed/draft versions; parent retained; version numbers monotonic under concurrent attempts.
- Confirm inactive/active draft; confirmed mutation rejected.
- Activate inactive draft/confirmed version; slot and logical-agent replacement atomic.
- Cross-slot same-logical activation that would create a gap rejected.
- Retire inactive; active retirement and retired activation rejected.
- Delete only eligible draft; child/evidence/status/active guards; last-version cleanup/event.
- Stale revision and competing activation return conflict, retain operator intent, and preserve exact coverage.
- Corrupt/missing coverage is visible and runtime-safe.

### 13.3 Desktop fake-provider browser golden path

The final serial Playwright flow uses isolated migrated data and no network model/image calls:

1. Open `/admin/agents`; verify the local-only warning, active manager, and all seven active skill slots.
2. Open the seeded `intake_readiness@1` specialist history and fork it.
3. Edit the draft’s name, instructions, catalog model selection, reasoning, and valid max turns. Verify the provider is read-only OpenAI and the role-specific defaults are deterministic. Contract/Server Action tests—not an impossible normal browser state—prove tampered provider/model/max-turn inputs are rejected.
4. Activate the draft with replacement confirmation; verify the old version becomes inactive and coverage stays complete.
5. Create a booklet and start the existing guided flow. Verify the first material turn invokes the replacement through Evidence JSON: logical/version IDs and snapshot values match the edited draft.
6. Continue the existing fake-provider golden path through every artifact, final page approval, PDF export, and download; capture the Playwright download and call `saveAs("output/playwright/agent-management-golden.pdf")`.
7. After the prerequisite check confirms `pdfinfo` and `pdftoppm`, inspect the saved PDF with `pdfinfo` and render every page into `tmp/pdfs/agent-management-golden/`; inspect page order, dimensions, text/image legibility, clipping, overlap, and blank/missing content, record pass/fail evidence, then delete only the temporary renders.
8. Reload/navigate between Home, workspace, and Agents; verify persisted agent/booklet state and no creator model selector.
9. Return to Agents, activate the seeded specialist as the replacement, and verify complete restored coverage.
10. Exercise fork/confirm/retire/delete on a separate unused draft, including confirmation and a blocked deletion case.
11. Capture only safe screenshots/traces under `output/playwright/`; do not retain full prompts in committed screenshots.

Focused Playwright assertions also cover keyboard operation, visible focus, long-text wrapping, pending labels, success announcements, conflict recovery, empty/corrupt coverage fixture, and route error retry. The existing typed-card/artifact-versioning specs remain unchanged unless a verified regression fix is necessary.

### 13.4 Required command evidence

| Command | Required proof |
| --- | --- |
| `npm run db:generate` | Generated migration matches the intended schema; no destructive rewrite of existing tables/data. |
| `npm run db:migrate` | Configured local database upgrades; repeat reports no pending failure. |
| Focused Vitest commands | Each phase’s new contracts/services/runtime/UI cases pass. |
| `npm run typecheck` | Strict TypeScript, Server/Client serialization, and action/runtime contracts pass. |
| `npm run lint` | Full repository lint passes. |
| `npm test` | All unit/integration tests pass with fake providers. |
| `npm run test:agent` | All deterministic bounded routing fixtures pass through persisted resolution. |
| `npm run build` | Next.js production build passes with admin page/actions in Node runtime. |
| `npm run test:e2e` | Serial desktop Chromium admin + full booklet golden path passes with isolated fake providers. |

New real-provider calls and retained evaluation runs are intentionally not required. If the optional real smoke is run, report expected cost and obtain the existing explicit opt-in first.

### 13.5 Retained evaluation regression boundary

Preserve the three accepted real-provider evaluation booklets exactly as historical evidence:

- `evaluations/2026-08-02/early-reader-corrected/`;
- `evaluations/2026-08-02/developing-reader-corrected/`; and
- `evaluations/2026-08-02/older-reader-corrected-v2/`.

This PRD does not justify paid reruns or rewrites. At the final checkpoint, verify `git diff -- evaluations` is empty and confirm each retained run's manifest, findings, and evidence remain present/readable. The new feature's end-to-end evidence is the deterministic fake-provider browser booklet and its rendered PDF inspection.

## 14. Requirements and acceptance traceability

| Requirement | Phases | Direct implementation/evidence |
| --- | --- | --- |
| AM-001 | 1–4 | Three tables, contracts, repository/service and migration tests. |
| AM-002 | 1 | Checked-in migration, stable manifest, fresh/upgrade/coverage assertions. |
| AM-003 | 2 | Create form/action/service tests and browser create flow. |
| AM-004 | 2 | Draft edit/fork transactions, lineage/concurrency tests, history UI. |
| AM-005 | 4 | Confirm/activate/retire/delete matrix and browser actions. |
| AM-006 | 2, 4 | Closed Zod surface, product guards, inline field/conflict/delete feedback. |
| AM-007 | 3 | Registry allowlist tests and unchanged manager tool bounds. |
| AM-008 | 3 | Resolver selected-skill lookup and eligible/ineligible/missing tests. |
| AM-009 | 3 | QualityService same-resolver/specialist test. |
| AM-010 | 3–6 | Existing schemas/services/fixtures/golden path; no admin-authored tools/state authority. |
| AM-011 | 3–5 | No-cache fresh lookup tests for edit/activation and in-flight snapshot. |
| AM-012 | 1, 3, 5 | Nullable schema migration plus success/failure/history/legacy evidence tests. |
| AM-013 | 3, 5 | Persisted factory config; removed env overrides; DB-backed preflight/smoke. |
| AM-014 | 3–6 | Existing integration suite and activated-specialist full fake browser flow to PDF. |

### 14.1 Acceptance evidence matrix

| PRD acceptance item | Required proof |
| --- | --- |
| Empty and representative prior migration | `agent-migration.test.ts` plus final checked-in SQL inspection. |
| Active manager + seven specialists, no duplicates | Seed manifest/coverage query assertions and admin coverage screenshot. |
| Lifecycle, branches, guards, replacement, conflicts, concurrent activation | `agent-management.test.ts` matrix and focused browser actions. |
| Stage-valid manager and matching specialist | Extended manager contracts and agent fixtures. |
| Direct quality persisted resolution | Quality service integration test. |
| Success/failure attribution/snapshot and legacy rows | Agent evidence integration tests and Evidence JSON browser assertion. |
| Existing deterministic fixtures/booklet integrations | Full `npm test` and `npm run test:agent`. |
| Typecheck/lint/build/desktop Playwright | Final command report with fake provider environment. |
| Human golden path | Issue #13 checklist against the final pushed commit after automated evidence. |

### 14.2 Issue #11 implementation-ready package coverage

| Requested package item | Plan section |
| --- | --- |
| Requirement-to-slice and acceptance traceability | Sections 12–14. |
| Proposed data model and constraints | Section 7. |
| API/route and service contracts | Sections 8 and 10; internal Server Actions are the mutation API. |
| Seed/migration specification | Sections 3.6 and 7.2. |
| Admin UI states/interactions | Section 10. |
| Runtime selection/failure modes | Sections 8.4 and 9. |
| Verification matrix/browser golden path | Section 13. |
| Human handoff checklist | Section 15.2 and PRD §12.2. |

## 15. Risks, recovery, completion audit, and handoff

### 15.1 Material risks and controls

| Risk | Control/recovery | Intentionally not added |
| --- | --- | --- |
| Migration damages a local database | Additive checked-in migration; executable checkpointed backup with hash/readability manifest; fresh/prior tests; explicit restore protocol; inspect SQL before run. | Down-migration UI, remote backup service. |
| Seed prompt drifts from current behavior | Test-only manifest copies current complete prompts; migrated row equality and all fixture regressions. | Runtime fallback to TypeScript defaults. |
| Active change leaves a slot uncovered | Partial uniqueness + transactional post-state coverage calculation + conflict tests. | Priority/assignment engine. |
| Concurrent operator overwrites state | Integer revisions and observed slot IDs; compare-and-swap transaction; actionable reload conflict. | Distributed locks/multi-user coordination. |
| Active draft edit changes historical meaning | Freeze resolved object and snapshot every attempted call. | Per-booklet pinning. |
| Editable instruction tries to expand authority | No arbitrary tools/schemas/code; output and persistence remain code-owned. | Prompt-only safety claims. |
| Catalog capability or account access drifts | Reviewed closed catalog owns structural compatibility; authenticated preflight verifies access; safe failure; optional price may be null. | Free-form models, provider selector, live capability inference, price service. |
| Editable instructions or evidence expose secrets | Admin warns not to paste secrets; snapshots are restricted evidence data; fixtures/screenshots/issues use redacted summaries; final secret scan covers source, DB fixtures, artifacts, screenshots, and comments. | Secret vault, field-level encryption, production audit controls. |
| Local admin exposed on network | Persistent warning and docs; no claim of authentication. | Weak password or incomplete RBAC. |
| UI grows beyond POC | One page, chronological history, native forms, no search/diff/merge/bulk. | General agent platform. |

### 15.2 Completion audit and human handoff

Before claiming Issue #12 implementation-ready for human verification, produce a table marking each item `proven`, `failed`, or `missing` with direct evidence. Fix all in-scope failed/missing items; absence of a failure is not proof.

- [x] All AM-001–AM-014 rows have scope-matched passing evidence.
- [x] Every automated acceptance row in Section 14.1 is proven.
- [x] Fresh and prior migration paths preserve data and create exact seeded coverage.
- [x] Every lifecycle transition/guard and concurrent activation behavior is proven.
- [x] Fake and real adapter seams both require a resolved configuration; automated tests make no paid call.
- [x] Manager, selected specialist, and direct quality review use fresh persisted resolution.
- [x] Successful and failed relevant calls retain immutable IDs/snapshot; legacy rows remain readable.
- [x] Existing skill schemas, one-specialist bound, materialization, persistence, approvals, jobs, and stage authority are unchanged or explicitly reverified.
- [x] Admin loading/empty/validation/conflict/failure states and keyboard/focus/destructive confirmation pass.
- [x] Missing manager/specialist/automatic-quality configuration leaves new message/card/artifact/approval/job/stage state unchanged; any creator response accepted earlier remains explicitly pending and recoverable through exact Retry or reload-time Resume, with only safe non-persisted recovery UI added.
- [x] Full activated-specialist browser flow reaches and downloads a PDF; every rendered page passes visual inspection; temporary renders are removed; coverage is restored.
- [x] The three named retained real-provider evaluation directories remain present/readable and `git diff -- evaluations` is empty.
- [x] Typecheck, lint, all tests, agent fixtures, build, and e2e pass in fake mode.
- [x] Current Web Interface Guidelines review and final defect-first review have zero open findings.
- [x] `docs/architecture.md`, README, this plan, PRD tracker, and any verified lessons match current behavior.
- [x] Secret scan confirms no keys/private data in source, snapshots fixtures, screenshots, or issue comments.
- [x] Phase commits are pushed and Issue #12/#9 contain evidence and core decisions.

Then provide Issue #13 with:

- exact commit/build and local setup commands;
- the PRD’s six-step human golden path;
- where to inspect active coverage and Evidence JSON attribution;
- how to restore the seeded version after live testing;
- screenshots/trace references that do not expose secrets or full private prompts; and
- every accepted limitation or remaining human-only check.

Do not mark human acceptance, close Issue #9/#12/#13, merge, or delete branches on the user’s behalf.

## 16. Documentation end state

At implementation completion:

- `docs/architecture.md` describes database-backed prompt ownership, the new persistence/service/resolver boundaries, per-invocation sequence, quality path, evidence snapshot, admin boundary, and extension steps as verified current behavior.
- `README.md` documents migration-before-preflight setup, current environment variables, the local-only Agents page, safe agent-version workflow, model availability check, failure recovery, and links to the agent PRD/plan/issues.
- The accepted agent-management PRD keeps its approved requirement wording and has a fully evidenced implementation tracker.
- This plan has verified phase/traceability/audit status and a concise decision log, not a diary.
- `LESSONS-LEARNED.md` changes only if `capture-project-learnings` identifies a reusable observation supported by code/tests/runtime evidence.
- Creator `USER-GUIDE.md` and `/help` change only if the creator-visible configuration recovery path materially changes; admin documentation stays in README to avoid a second operator source of truth.

## 17. Approval and change control

After explicit approval:

- Treat this plan as implementation authority subordinate to the approved PRD. Its approval authorizes coherent phase commits, pushes on the approved working branch, and the progress/evidence comments required by Section 4; do not pause for a separate authorization at each phase boundary.
- Correct factual file/API details from the current worktree or version-matched primary sources when scope/behavior is unchanged; record material corrections in the decision log and Issue #12.
- Return to the user before changing product scope, lifecycle semantics, exact coverage, provider support, auth posture, destructive migration strategy, or required verification.
- Do not weaken tests/requirements, add production infrastructure, or substitute a smaller end state because it is easier to implement.
- Revise future phases after each verified checkpoint, but never rewrite completed evidence or approved requirements to match an implementation shortcut.

Implementation may begin only after the user explicitly approves this file and that approval is recorded on Issue #11.
