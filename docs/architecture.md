# Kids Booklet POC architecture

This document describes the current implementation for contributors and coding agents. The [canonical PRD](accepted/2026-08-01_end-to-end-poc/kids-comic-poc-prd.md) remains authoritative for product requirements and scope. The [accepted plan](accepted/2026-08-01_end-to-end-poc/PLAN.md) records implementation decisions and evidence; when source code changes, keep this current-state guide aligned with the verified behavior.

## System boundaries

Kids Booklet is a strict-TypeScript Next.js App Router monolith. The browser renders a persisted workspace and uses Vercel AI SDK UI for chat transport. Route handlers call deterministic application services, which are the only owners of workflow state, durable IDs, artifact versions, approvals, jobs, assets, and exports. OpenAI Agents SDK agents may route or author validated proposals, but they cannot persist data or advance the workflow directly.

```mermaid
flowchart TB
  UI[Next.js workspace and typed cards] --> API[Route handlers]
  API --> CHAT[Chat and card services]
  CHAT --> MGR[Manager agent]
  MGR --> SPEC[One bounded specialist]
  SPEC --> CHAT
  CHAT --> ART[Artifact and approval services]
  ART --> DB[(MongoDB through official-driver repositories)]
  CHAT --> JOB[Persisted sequential jobs]
  JOB --> IMG[ImageProvider and prompt serializer]
  IMG --> FS[Filesystem AssetStore]
  JOB --> PDF[pdf-lib export]
  CHAT --> EVID[Traces, model calls, quality and cost evidence]
  EVID --> DB
```

The root responsibilities are:

| Area | Owner | Responsibility |
| --- | --- | --- |
| Browser UI | `app/`, `components/` | Workspace, AI SDK UI transport, typed cards, artifact views, progress and recovery controls. |
| Contracts | `lib/contracts/` | Versioned Zod schemas for every persisted or transported domain value. |
| Agent definitions | `db/agent-repository.ts`, `lib/application/agent-resolver.ts`, `lib/agents/` | Versioned persisted configuration, fresh immutable resolution, OpenAI runtime adapters, and run metadata normalization. |
| Runtime skills | `lib/skills/` | Versioned skill definitions, schemas, deterministic fake behavior, and the stage-filtered registry. |
| Workflow | `lib/application/` | Context building, routing orchestration, validation, persistence, approvals, quality gates, generation and export. |
| Jobs | `lib/jobs/` | Startup recovery, sequential execution bootstrap, and safe diagnostics. |
| Image pipeline | `lib/images/`, `lib/composition/` | Provider seam, prompt serialization, image calls, and geometry-only normalization. |
| Persistence | `db/` | Official MongoDB driver, typed repositories, indexes, initialization, and verification. |

## Artifact and decision flow

### Issue #65 local foundation

The [Dify booklet experiment](accepted/2026-09-27_dify-booklet-runner/PRD.md)
has a separate `dify_booklet_v1` booklet profile. Its current local foundation
uses `lib/contracts/experiment-runner.ts` and `db/experiment-repository.ts`.
Experiment runs, single-operation claims and delegation grants use additive
Mongo collections. Normal artifacts, immutable versions, dependencies, approvals
and messages retain the created content and decision provenance.

The local narrative implementation covers J01–J07, through the final character
and location lists. Live configuration remains restricted to M1's six bindings
and J01/J02 boundary until M2 bindings are verified. Configuration accepts only
complete six-slot M1 or eleven-slot J01–J07 bundles, not partial profiles.
The app API executes the latest publication; saved publication evidence is not
an execution-version selector. Verified completed slice boundaries remain saved
after a binding change. Unfinished changed configurations are blocked and need
linked successors. Completion atomically saves the
proposal and operation result. Explicit tester review or a current scoped grant
accepts an exact version; manager and judge results cannot approve it. Revisions
retain history and mark dependent current work for review. Preferred-length
warnings do not reject valid content.

Narrative source checks share `lib/experiment-runner/narrative-tasks.ts` across
preparation, completion, approval and specialist context. Its ordered J01–J07
graph requires both draft lists before manuscript work. Only current approved,
unambiguous source versions are eligible. Saved configurations enable J03–J07
only with all seven distinct specialist bindings; old snapshots retain J01/J02.
Booklet adds stable character/location IDs by draft `entryKey` and manuscript
unit IDs by `unitKey`. Final lists validate exact subject/occurrence references.
Revisions invalidate current descendants through saved dependency edges, retain
unrelated siblings, and preserve versions and approvals. Grouped approval uses
dependency order; invalidated content needs a new proposal before acceptance.
The content materializer uses the same completion transaction and collections,
not a second subject registry or workflow service. Local M2 fixtures exercise
all three cases through J07; actual Dify M2 execution remains unverified.

The local image-storage foundation saves an exact prompt, ordered source versions
and request fingerprint on the existing operation. Source checks require current
approved versions and exact approval records; style samples may use their current
draft J08 style version. Completion decodes PNG/JPEG/WebP pixels, hashes the
original bytes, and claims a 60-second completion lease before using AssetStore.
It reads stored bytes back before atomically saving the normal asset and operation
result. Same-byte recovery preserves request counters; conflicting bytes or stale
sources cannot replace a saved result. Missing or corrupt stored bytes remain a
technical blocker even after database completion. The local image callback routes
use the normal authorization claim and return the saved image request context.
The authenticated fixture GET does not reserve again; binary POST validates and
saves original bytes. The proxy transport limit has headroom above the handler's
20 MiB limit. Dify binary transfer and automatic image dispatch remain unverified.
Filesystem AssetStore publishes complete temporary-file bytes through an atomic
no-clobber hard link, so an interrupted write cannot occupy the final asset URI.
Image failures retain their original category and timestamp when recorded;
successful recovery clears the current failure, not its evidence history.

Specialist context includes saved task-specific answers and global manager
answers. During a revision, clarification preserves the original target and
instruction. The matching tester answer restores that revision without another
revision debit. Restart reads reconstruct this context from saved operations and
tester messages.

Legacy booklet projections exclude this profile because their eight-stage
parsers cannot read J01/J02. Subject-aware artifact uniqueness uses booklet,
artifact type, subject kind and subject ID. Missing legacy subject fields share
the same null identity, preserving legacy type uniqueness. Setup adds this index
and retains an exact existing artifact-type index; it never removes or recreates
that older restriction. Existing databases therefore still need a controlled
index transition before multiple same-type sheets can be stored. Deploy the
compatibility release first so later index removal has a viable rollback image;
the host's automatic image rollback does not restore the database. No reset or
sheet-dispatch enablement is part of this compatibility step.
`verifyExperimentData` checks experiment references without legacy agent seeds.
The enabled, non-production runner profile initializes experiment structure
without local-agent seeds or a host OpenAI key. It retains seed assets for health
checks and leaves existing legacy seeds unchanged. Disabled settings retain
legacy initialization and execution.

`lib/experiment-runner/` supplies strict six- or eleven-module configuration, browser
run APIs, six exact machine callback routes, a sequential dispatcher and bounded
application-key transport. A transactional dispatch marker precedes each single
POST. Callback authorization reserves once. A retained workflow-run ID permits
GET-only recovery; unknown work without an ID blocks instead of replaying.
Published workflow identities and the saved configuration snapshot must match.
Three unchanged progress observations block the run. Pause prevents admission
but does not cancel in-flight work; an authorized result can still be stored.

With the runner enabled, `/experiments/booklet-runs` shows saved J01/J02 work,
warnings, exact version approvals, limits and Pause/Resume. Only Simulated runs
can be created. The approved J02/J03 boundary remains a queued partial booklet,
not completion. The legacy home and agent navigation remain when disabled.
The six M1 Community bindings and all three live Simulated J01/J02 cases are
verified; [M1 evidence](accepted/2026-09-27_dify-booklet-runner/M1-runner.md)
records their release and run identifiers. Reload and idle Pause/Resume preserve
saved results without duplicate execution. The deployed UI recovers a definite
control revision conflict with a current-state read and at most one control retry;
it does not retry an uncertain write. Live active-operation Pause persisted after
reload and Resume did not duplicate work. Rapid progression can exhaust the
single retry and require another Pause click. Production, Cloud and the diagnostic
probe are unchanged.

Every legacy-profile booklet has eight ordered artifact records:

```text
Audience Profile → Story Plan → Visual Style → Visual Bible
→ Booklet Specification → Page Plan → Final Pages → PDF Export
```

`BOOKLET_ARTIFACT_TYPES` in `lib/contracts/domain.ts` defines this order. `ArtifactService` records explicit upstream-version dependencies and derives the current stage as the first artifact that is not approved. Revising an upstream artifact creates a new immutable version and can mark dependent work for review.

Three actors have deliberately separate authority:

- **Agents** select a bounded skill or propose structured content.
- **Application services** validate cross-document invariants, assign persistent IDs, create versions, start jobs, and calculate transitions.
- **The creator** makes material decisions through validated cards and explicitly approves current artifact versions.

The four card families are `question`, `artifact_review`, `progress`, and `issue`. Cards and their responses are persisted with the conversation. Submitting a card updates both its authoritative row and its saved UI-message projection, so reload and restart restore the same decision state. Expected workflow failures become typed recovery cards only when replacing the current decision is safe.

The chat route returns an AI SDK UI message stream with a transient working status followed by one atomic, already-persisted narration and `data-card` result. Token-by-token model narration and a second agent-session store are intentionally absent.

## Agents, skills, and handoffs

### Manager

For a material conversational turn, `ChatService` builds a `SkillContext` from the saved stage, requested operation, user intent, known facts, recent messages, approved artifact-version IDs, and a trace ID. `ManagerService` filters the registry by stage and, for Story Plan work, by operation.

The manager agent receives only those eligible skills as function tools. Its persisted active version supplies its display name, complete instruction text, OpenAI model, reasoning effort, and one-to-two turn bound; code still requires a tool call, disables parallel tool calls, stops after the first tool, and rejects a route outside the supplied allowlist before parsing specialist input.

### Specialist

Before a material call, `AgentResolver` reads one complete active MongoDB transaction snapshot: one manager plus one specialist for each registered skill. It freezes the resolved manager/specialists for that invocation, so an activation affects only later calls. After routing, the application selects the frozen specialist for the selected skill, validates its input, and invokes it with the persisted version's configuration. The generic specialist receives the skill ID, stage, operation, intent, validated skill input, known facts, recent messages, and approved artifact-version IDs. It returns the code-owned structured output envelope.

Specialists cannot write workflow state, issue approvals, access arbitrary tools, or create durable entity/page IDs. Their result is transient until an application service validates, materializes, and persists it. This is an application-controlled handoff, not a free-form SDK handoff:

```text
manager selection → route validation → specialist execution
→ output validation → application persistence → creator decision
```

`MODEL_RUNTIME=fake` uses deterministic routing and each registered skill's `run` function for tests and local no-cost work while still resolving persisted versions. `MODEL_RUNTIME=real` uses the OpenAI manager and generic specialist adapters. Manager and specialist calls are recorded separately with provider/model, status, latency, usage, request/trace IDs, cost, resolved definition/version IDs, and immutable effective-configuration snapshots. `ChatService` passes its single preflighted active set to both the manager turn and automatic Story Plan quality review, so an in-flight activation applies only to a later turn. Direct quality review resolves a fresh persisted quality specialist immediately before its call.

Story readiness may invoke the review specialist through `QualityService`; generation-readiness and final-page quality are deterministic application gates. In every case, application services retain transition authority.

### Parallel candidate execution

`CandidatePoolService` resolves all valid active specialist or image candidates for a closed execution target. `AgentRunService` and `ImageAgentRunService` persist a ready/running/results/completed card projection with server-only ready input, frozen agent/profile snapshots, per-candidate attempts, retry/change/restart history, and selected-only materialization. The manager remains the single route selector; candidates never advance workflow state directly. In normal runtime, a sole compatible candidate starts server-side without a remembered-team write; text fixtures retain their ready card only so tests can control the batch explicitly. Starting a batch atomically claims the persisted ready card, creates its batch/items, and updates the saved message projection; a losing concurrent request leaves the winning run intact. Interrupted materialization resets to a recoverable result state and is redispatched only by its matching text or image service. The runner supplies recovered image materialization with the owning generation continuation, so the persisted sequential reference/page job advances after the selected image is finalized. The workspace reconciles persisted message projections on refresh even when an Agent Run retains the same message ID, so ready, results, and completed actions stay current without a full reload.

### Runtime skill contract

`SkillDefinition` contains a versioned ID, routing description, eligible stages, input schema, output schema, and deterministic `run` implementation. `lib/contracts/skills.ts` owns the closed skill-ID and shared context contracts; `lib/skills/default-registry.ts` is the active registry.

The registered skills are:

| Skill | Eligible stage |
| --- | --- |
| `intake_readiness@1` | Audience Profile |
| `story_planning_revision@1` | Story Plan |
| `quality_review_targeted_repair@1` | Story Plan quality operation |
| `visual_direction_reference_planning@1` | Visual Style and Visual Bible |
| `booklet_specification@1` | Booklet Specification |
| `page_planning_writing@1` | Page Plan |
| `image_prompt_compilation@1` | Final Pages review |

Runtime skills in `lib/skills/` are unrelated to `.agents/skills/`. The latter are repository-local instructions used by coding agents while developing this project and are not loaded by the booklet application.

## Prompt ownership

Runtime prompts are versioned MongoDB documents, not environment variables or standalone prompt files. Idempotent initialization seeds the current manager and seven specialist defaults; runtime never falls back to those TypeScript seed values. `/admin/agents` is the trusted-local-only lifecycle surface. Its Server Component performs one transaction snapshot read and passes only serializable coverage, definition, version, and skill-choice data to a client controller. Pure view-model helpers derive slot/agent/version selection; focused form, version-workspace, and native-dialog components reuse the existing Server Actions for creation, draft editing, confirmation, replacement activation, retirement, and eligible draft deletion.

- `db/agent-defaults.ts` holds the migration-verification seed manifest only; it is not a runtime fallback.
- `lib/agents/manager.ts` and `lib/agents/specialist.ts` receive persisted names, instructions, models, and reasoning settings, while retaining code-owned tools, output schemas, and turn constraints.
- `lib/agents/openai-specialist-runtime.ts` serializes the validated skill input and bounded `SkillContext` into the runtime request.
- Skill input/output Zod schemas constrain what the model can receive and return.
- `lib/images/prompt-serializer.ts` deterministically serializes the provider-neutral image prompt plan, including exact approved lettering, continuity, no-panel constraints, relevant references, and targeted revision instructions.

Change an agent prompt by forking or editing a draft in `/admin/agents`, then activating it after review. Code changes remain necessary for skill schemas, tool bounds, registry eligibility, or the supported model catalog. Image-provider wording belongs in the shared image serializer. Keep configuration, schemas, application materialization, and focused tests consistent.

If active coverage is missing or malformed, resolution returns a safe recoverable configuration error pointing to `/admin/agents` before a new material message, card, artifact, approval, job, or stage mutation. A previously accepted card response stays pending; the workspace offers exact retry during the session and **Resume saved decision** after reload.

## Persistent generation and recovery

Reference and page work is stored as idempotent jobs with ordered items. The Node instrumentation bootstrap starts one in-process runner, recovers interrupted follow-ups/items, and processes runnable jobs sequentially. A global per-job promise map prevents duplicate same-process execution.

Every generation failure is a user-controlled pause:

1. The failing item is saved as failed and later items remain pending.
2. No provider error is retried automatically.
3. The creator retries only the selected failed item.
4. A successful retry leaves the job paused when pending items remain.
5. The creator explicitly chooses Continue before the runner processes the remaining queue.

Completed items and active assets are never discarded because another item fails. Selective regeneration resolves the current page/reference target and asset lineage on the server, creates a one-item job, and publishes a replacement only after it succeeds.

The progress panel and persisted progress cards share one poller per job. Running jobs poll every five seconds; non-running observable states poll every fifteen seconds. Publishing a retry or Continue response updates the same coordinator immediately. Diagnostics record safe job/item boundaries and waiting heartbeats without prompts, image bytes, credentials, or arbitrary provider response bodies.

`IMAGE_PROVIDER_MODE` selects only `fake` or `real`. The selected frozen image-agent profile supplies provider, model, quality, and resolution; no global image model or quality setting exists. Real requests use provider-native square, landscape, or portrait sizes, then Sharp normalizes them to the approved final canvas without stretching or drawing text. PDF export uses approved composed assets in deterministic cover-first order.

## Changing the architecture

### Add or revise a skill

1. Define or version the skill's input and output schemas. Use a new `@N` ID for an incompatible contract.
2. Add the ID to the closed skill-ID schema and implement the deterministic `run` behavior under `lib/skills/`.
3. Register its description, stages, schemas, and implementation in the default registry.
4. For a conversational skill, extend `ChatService` to assemble authoritative input and convert the validated result into an artifact/card outcome. For a non-conversational skill, extend its owning application service with equivalent validated input, persistence, and evidence handling.
5. Add or update the applicable routing fixtures, schema tests, service/manager-contract tests, and artifact-flow integration test.

### Change the artifact flow

1. Update the artifact-type contract and ordered stage list.
2. Update upstream dependency rules, content parsing, persistence initialization, and derived-stage behavior.
3. Update stage-specific agent input/result handling, cards, approvals, quality gates, jobs, workspace rendering, and recovery paths.
4. Add migration/seed changes only when persisted storage requires them, then cover the complete transition and restart path.

Do not encode stage advancement only in a prompt. The application must be able to derive and validate every transition from persisted state.

### Add a distinct agent role

Most new capabilities should be runtime skills wrapped by the existing generic specialist. Add a distinct agent only when it needs different instructions, tools, model-role configuration, execution limits, or evidence semantics. In that case, add an agent factory and runtime adapter, route it explicitly from an application service, validate its inputs/outputs, and record its model calls. Preserve the one-specialist-per-material-turn contract unless the PRD and fixtures are deliberately revised.

## Verification and evidence

- `npm run typecheck`, `npm run lint`, and `npm test` validate contracts and services.
- `npm run test:agent` verifies stage eligibility, expected routing, bounded calls, and structured repair behavior.
- Integration tests cover artifact dependencies, approvals, restart/resume, generation failure, selected retry, explicit Continue, and evidence records.
- Playwright covers the persisted typed-card golden path in desktop Chromium with fake providers.
- Retained real-provider evaluations preserve accepted and rejected PDFs, findings, manifests, traces, usage, latency, and estimated cost.

When behavior or architecture changes, update this guide after verification. Keep reusable failure modes and guidance deduplicated in `LESSONS-LEARNED.md`; do not turn this guide into a chronological work log.
# Deployment runtime

Deployed environments use the same application services and MongoDB job contracts as local development. `DEPLOYMENT_ENV` selects `local`, `_staging`, or `_prod`. `ASSET_STORAGE` selects the local filesystem or the S3 `AssetStore`; application services obtain storage through the central factory and keep existing relative asset URIs.

VPS deployment uses a persisted `deployment_control` record. Mutation entrypoints and the job runner check it before accepting work. The runner records startup, heartbeat, and fatal state. Maintenance containers set `RUNNER_ENABLED=false`, so initialization, readiness, backup, restore, and reset cannot recover or claim queued work.

`/api/health/live` is the only unauthenticated route and reports process liveness. The deployment proxy applies Basic authentication to pages, APIs, assets, admin actions, and Server Actions. Authenticated readiness verifies MongoDB structure, runner state, maintenance state, and required asset access without invoking a provider. Slow mutation routes stream NDJSON heartbeats and a terminal status/body record. Chat keeps the AI SDK UI stream open with transient heartbeat records.

The VPS topology and operational sequence are documented in [the deployment runbook](deployment/runbook.md). Terraform owns Cloudflare R2, Tunnel, Access and DNS rules. The root-owned host dispatcher owns Compose releases and a persistent operation journal; host flock and GitHub concurrency serialize changes. See [deployment contracts](deployment/contracts.md) for scope and acceptance limits.

The temporary Dify trial adds optional host secrets and selects real mode only in staging. The application branch owns experiment availability, tool authorization, and approval checks. The host support is removed if Dify is rejected after the trial or replaced by the accepted long-term design if Dify is adopted. See the [experiment configuration](accepted/2026-09-16_agent-platform-decision/configuration.md).

The Dify collaboration service uses the API runtime's 1536 MiB memory limit,
a bounded healthcheck, and local Engine.IO readiness verification. Its targeted
repair uses the shared operation lock and journal and recreates only that service
after an idle check; it does not change Booklet release state or Dify data.

Issue #69 prepares a separate Dify Community stack on the same VPS. The pinned
upstream Compose release and repository override keep its databases, networks,
and data separate from Booklet; nginx binds only localhost port 3300 behind a
maintenance-gated Tunnel route. The candidate staging-only probe has no model
or image node. Booklet starts it with an application API key, receives an
authenticated callback on one exact route, and retrieves the saved Dify result
by workflow run ID with the same runtime key. Probe records are isolated in
`dify_community_probes` and do not mutate booklet/artifact/approval state.
Production and disabled staging deployments reject all probe routes. See the
[Community runbook](deployment/dify-community.md). The operator verified the
public deterministic round trip and runtime lookup on 2026-10-03; interrupted
response and platform backup/restore readiness remain separate checks.
The candidate authenticated staging fault header discards the Dify start response
before reading its identity. Recovery uses the callback's persisted ID and a GET,
never a replacement execution. Production and disabled profiles remain closed.

The protected staging key workflow can provision the Community probe as one
four-setting patch. The master-owned host dispatcher limits it to staging,
validates the exact field set, merges it without replacing unrelated secrets,
and uses the existing serialized secret rotation. Dify's callback variable and
application API key remain private operator bindings; no provider call is needed.

The same protected workflow can stage the issue #65 runner's five settings from
one private JSON bundle. The host validates the fixed staging/Community origins
and the complete six-slot M1 or eleven-slot narrative bindings, including disabled
bundles, then preserves existing
Cloud, probe and application secrets during the normal serialized rotation.
Compose defaults the runner off. Private module keys/publications, exact-target
reset approval and authorized enablement remain separate readiness checkpoints.

The staging reset can select a fully validated, prepared Dify runner bundle for
maintenance initialization while the running service retains disabled settings.
After the reset, it activates that bundle before restarting the app.
Maintenance containers still set `RUNNER_ENABLED=false`. The reset requires the
exact staging bucket and completed backup coverage for every bucket object;
its backup includes unreferenced objects. A reset interrupted during deletion
or verification cannot be replayed through Resume. Inspect the retained backup
and database before explicit recovery.

### Consolidated VPS deployment boundary

VPS deployment is owned by `scripts/deploy/vps-deployment.sh`. Setup discovers Cloudflare and host ownership and configures database-scoped Atlas users and the exact VPS allowlist. Finalize creates absent environment branches from the reviewed commit containing `infra/config/vps.json`. Terraform owns Cloudflare R2, Tunnel, DNS and cache/rate-limit resources. `_staging` and `_prod` are independent reviewed release lines and may diverge from `master`. GitHub Actions verify the current environment-branch commit, build public GHCR environment-tagged images, and deploy only their immutable digests through the restricted VPS command interface. Compose overlays hold non-secret configuration; root-only final overrides hold secrets, including staged rotation files. Preview is the default and mutations require `--apply`. TypeScript owns application initialization, readiness, drain, backup/restore, and staging-reset behavior.
