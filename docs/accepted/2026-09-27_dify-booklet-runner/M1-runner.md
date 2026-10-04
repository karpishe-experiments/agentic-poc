# M1 — Durable runner, Concept Brief and Outline

**State:** Local foundation in progress; staging bindings/release/reset remain pending. **Coverage:** J01–J02; AC01, AC05–AC06, AC09, AC11–AC12.
**Predecessor:** [M0](M0-readiness.md). Follow [EXECUTION](EXECUTION.md) at entry,
review and publication. These are proposed shared contracts; finalize them from
M0's verified packaging before implementing the dependent interfaces.

Before handing a slice to Sol/low, fill the compact
[execution package](EXECUTION.md#sol-low-execution-packages) in this file using
M0 evidence. The contracts below remain proposed until that reconciliation;
do not treat them as a completed implementation package.

## Bounded local execution packages — 2026-10-04

M0 proves separate workflow invocation, publication/tool synchronization,
restoration, explicit lineage transport and diagnostic runtime-key recovery.
The selected layout is nineteen independent workflows. Production, Cloud,
existing probes and private keys remain unchanged. Paid calls and staging reset
remain ungranted. Runner publication authority is recorded in EXECUTION.

| Field | S1: typed contracts and fixtures |
| --- | --- |
| Goal and components | Add `lib/contracts/experiment-runner.ts` and focused contract tests. Reuse UUID/timestamp helpers; keep legacy artifact enums/schema version unchanged. |
| Contract and examples | Closed task IDs J01–J13, roles, personas, modes, statuses, fixed case ceilings and strict mutation/lineage envelopes. J01 audience/premise/theme/emotional promise/tone/constraints/deferred decisions; J02 causal arc, character/place shortlists and deferred decisions. Content strips extra fields; preferred lengths warn. Hard bounds: title 1,000 characters, each other text field 16,000 characters, 100 entries per list, canonical UTF-8 content 2 MiB. |
| Ordered edits | Define types and J01/J02 content parsers; add fixed-case data and warnings; test role/result separation, required fields, overlength warnings, unknown content stripping and strict envelope rejection. No Mongo writes or Dify calls. |
| Verification | Focused Vitest contract tests with `--bail=1 --retry=0`, typecheck and lint. |
| Completion and escalation | Passing local contracts. Escalate a required field/role change; do not invent a live binding or weaken authorization. |

| Field | S2: durable run and single-operation claims |
| --- | --- |
| Goal and components | Add experiment documents/handles/indexes and `db/experiment-repository.ts`; reuse `withMongoTransaction`. Atomically create a v2 booklet/run; do not create v2 artifacts until S3. |
| Contract and examples | `queued → running`; Pause prevents new claims, permits an authorized late result; Resume reads stored unfinished work. A prepared operation claims once and atomically reserves logical/payable counters. A repeated claim returns no permission. Unknown outcomes remain stored, not requeued. |
| Ordered edits | Add additive collections/indexes; implement run creation/read, CAS controls, operation preparation/claim/identity recording and terminal persistence. Filter v2 booklets from legacy parsers. Keep the old artifact index intact until exact-target reset; no startup index drop. |
| Verification | Isolated replica-set tests without seeded agents: creation rollback, concurrent claims, duplicate keys, pause-in-flight, stale revisions, limits, identity conflicts and restart reads. Run typecheck/lint and affected legacy repository tests. |
| Completion and escalation | Local storage proof only. No dispatch/bootstrap/routes yet; no live app writes. Escalate incompatible indexes, unknown provider outcomes or changes to paid scope. |

| Field | S3: atomic narrative materialization and tester provenance |
| --- | --- |
| Goal and components | Extend the experiment repository with a narrowly scoped narrative materializer and an `experiment_delegations` collection. Reuse normal artifacts, immutable versions, dependencies, approvals and messages. |
| Contract and examples | J01 proposals have no upstream source; J02 requires the current approved J01 version. Capture target/source versions at preparation and reject changed sources at completion. Proposal, version, warnings and terminal operation commit together. Tester decisions are explicit approval, scoped delegation replacement/revocation, answer or revision. The application assigns decision/delegation/version IDs; manager/judge results never approve. |
| Ordered edits | Define strict tester decision and question payloads; add additive provenance fields/partial indexes; capture narrative source identity; implement atomic version writes, current-version approvals and latest-grant validation. A revised J01 marks only J02 for review. Persist each accepted version separately, including grouped approvals. No image/page materialization in this slice. |
| Verification | Isolated Mongo tests for J01/J02 dependencies, current/source mismatch, duplicate callbacks, approval provenance, grouped review, grant narrowing/revocation, revision ceilings, question matching and warning-bearing delegated progress. Verify no local agent registry is required. |
| Completion and escalation | Local narrative storage proof, not a Dify/staging acceptance run. Do not interpret opaque payloads as approvals. Escalate a creative contract change; leave paid and deployment prerequisites pending. |

| Field | S4a: saved context and narrative routing |
| --- | --- |
| Goal and components | Add a small `lib/experiment-runner/context.ts` service and focused Mongo tests. Read the experiment repository and normal artifact/version/approval/message rows; do not write or dispatch. |
| Contract and examples | Return saved run progress and J01/J02 artifacts with warnings and exact source versions. A manager can inspect eligibility and pending creator decisions. A tester sees creator-facing content and current decisions, not configuration credentials or mutation authority. Specialists receive the fixed brief, their current target, exact approved inputs, saved relevant question/answer pairs and a matching revision instruction. Clarification can suspend that revision; the exact answer restores it without another revision debit. |
| Ordered edits | Build canonical saved projections; identify pending question/revision, current approval and the next narrative task. Do not route while paused, blocked or active; J03 is an explicit slice boundary, not booklet completion. Verify owned operation/run identities for role context. |
| Verification | Focused read-only context tests after grant, proposal, approval, revision, Pause and unknown outcome. Check that credentials/configuration snapshots do not enter tester or specialist context. |
| Completion and escalation | Local read projections only. Do not claim deployed simulation or provider readiness. Escalate missing persisted input or an ambiguous role contract. |

| Field | S4b: deterministic narrative fixtures |
| --- | --- |
| Goal and components | Add `lib/experiment-runner/fixtures.ts` and focused tests for all three fixed persona cases. These pure fixtures supplement local contract tests and become inputs to explicit Dify simulation branches; they do not replace deployed-flow proof. |
| Contract and examples | Manager routes an eligible J01/J02 task. Kid and Parent record scoped J01/J02 delegation; Creator reviews exact current versions. Specialists produce complete Concept Brief and Story Outline content from the fixed case. Questions receive deterministic answers and revisions use the current target rather than recreating unrelated content. |
| Ordered edits | Define canonical case fixtures and role result selection from saved role context. Validate every result with the owning role/content schema. Reject unsupported tasks, modes and slice completion rather than inventing progress. No provider SDK or transport. |
| Verification | Unit tests for all personas, complete required fields, different involvement defaults, exact pending-question answer, revisions and role separation. |
| Completion and escalation | Supplemental local fixtures only. Do not claim Dify execution, approvals or storage from a pure function result. |

S4c adds runner routes,
bounded dispatch, independently published model-free Dify modules and the small UI.
Finalize those packages before their dependent edits. New module application keys,
callback bindings, exact reset targets and runner release authority are a
consolidated private/operator checkpoint before staging acceptance, not a blocker
for S1/S2 or isolated local S3 tests. Local tests do not mark M1 complete.

### Local foundation evidence

S1–S4b now have source and focused tests. On 2026-10-04, the combined local
candidate passed typecheck and lint in a clean detached verification checkout,
66 tests across ten focused/legacy files, twelve deterministic agent fixtures,
thirteen CI selector tests, local documentation links and whitespace checks.
The normal worktree's stale `.next` files and nested `output` worktrees were not
changed to obtain that result. The Mongo test process required forced shutdown
after reporting passing tests; the test command returned zero.

All three local persona cases save accepted J01/J02 versions, exact tester
provenance and parent/child operation identities, and read them after repository
reconstruction. Their payable counters remain zero. These tests use local
transport fixtures, not the deployed Dify interfaces. The run remains `queued`
at the J03 slice boundary, not `completed`.

The Creator regression also revises J01, approves only its new draft, refreshes
J02 against that approved version and approves J02. Previous versions and
approval records remain saved; a stale downstream version is not grouped into
the revised J01 review.
Its refreshed content uses the newly approved Concept Brief's title, premise,
tone, theme, emotional promise and constraints while retaining the Outline's
unrelated cast, locations, story arc and open decisions.

Current pending work is S4c: runner availability/configuration, dispatch and
callbacks, the small UI, independent Dify simulation modules, and staging
acceptance. New private suite keys and exact-target reset authorization remain
handoffs. Runner PR merge, staging release and UI browser verification are now
authorized as recorded in [EXECUTION](EXECUTION.md#b-authorization-register).
Production, paid calls and existing Dify-resource changes remain excluded.

## Entry and manual setup

Reconcile M0's selected verified packaging, actual workflow schema/bindings and code
baseline. Invocation/credential details below must be finalized from that proof,
not from the superseded single-workflow proposal. Before local implementation,
verify contracts, fixtures and local test storage. Before staging verification,
verify execution credentials, callback key, origin reachability, database
and AssetStore access and release permissions. Bundle any
missing login/key installation and deployment grant into one handoff. No paid
authority is needed. Run the entire milestone in Simulated mode.

The experiment-runner callback routes do not exist at entry. The deployed Community
diagnostic callback proves the origin/access path, not these new contracts;
verify the exact new routes after deployment and before the first Dify smoke.
Perform the one authorized clean staging reset before the first durable runner
case, using M5's target/backup procedure. Include that exact-target approval in
this milestone's entry handoff; do not defer it until after acceptance evidence
has accumulated.

Local reset can wait while isolated test data suffices. Before the retained local
clean-baseline verification, perform the agreed reset of identified old data.
First show the
resolved database and descendant DATA_ROOT, inventory what will be removed,
preserve the prior-trial summary and obtain exact-target approval. Never use
production data to make an integration test pass.

## Proposed architecture and files

Extend current repositories/services; add `lib/experiment-runner/` for orchestration
and Dify transport, not another database or generic workflow platform. Use the
existing instrumentation and sequential runner in `lib/jobs/runner-bootstrap.ts`.
One active operation per experiment run; queue persona runs sequentially. No
parallel provider calls are needed for this experiment.

Add `lib/contracts/experiment-runner.ts` and `db/experiment-repository.ts`.
Extend `db/documents.ts`, `collections.ts`, `indexes.ts`, `setup.ts`, `verify.ts`,
`initialize.ts`, `lib/contracts/domain.ts`, artifact contracts/services and normal
booklet/asset projections. Reuse `runTrackedMutation` and AssetStore.

Introduce a `dify_booklet_v1` execution profile on new booklets. During the staged
transition, legacy records are not migrated or executed by the new runner. Keep
their data untouched until the authorized reset. New runner routes cannot call
AgentResolver, local agent seeds, candidate execution or PDF generation. Remove
old agent administration/navigation and new-booklet entrypoints from the enabled
experiment UI; do not delete unrelated prototype/mockup surfaces.

Initialization/readiness for this profile verifies the new schema and bindings,
not local manager/specialist seeds. Change reset/verification accordingly before
using them. Production is not deployed and must not become a reset target. Remove
obsolete transition paths only once M5's clean baseline is confirmed.

## Persistence contract

Use application-generated opaque UUIDs. Store timestamps in existing millisecond
form and expose ISO timestamps. All writes below use Mongo transactions/CAS and
unique indexes as appropriate. No general event-sourcing framework.

| Record | Required additions/invariants |
| --- | --- |
| Booklet | Execution profile, run ID, schema version 2; ordinary title/cover ID; no PDF prerequisite for completion |
| Artifact | `taskId` J01–J13, `subjectKind` book/character/location/page and `subjectId`; unique `(bookletId,taskId,subjectKind,subjectId)`; book subject uses booklet ID |
| Artifact version | Immutable canonical content, exact dependency version IDs, source operation ID and warning list; new version on every revision |
| Approval | Exact artifact version, run ID, tester decision ID, explicit/delegated origin, nullable delegation ID and review-group ID; never inferred from image existence |
| `experiment_runs` | Booklet, persona, fixed brief, mode, status, state revision, predecessor run, configuration snapshot/hash, request/revision counters, pending decision, pause flag, timestamps, evaluation status, safe failure |
| `experiment_operations` | Run/role/task/subject, unique idempotency key, expected input-version fingerprint, mode, provider kind, state, Dify execution/node IDs, reservation count, deadline, result/digest/asset references, bounded error, timestamps |
| `experiment_delegations` | Run, tester decision/event, allowed tasks/subjects/actions, effective sequence, revoked/superseded link; no budget-changing capability |
| Existing messages/model calls/jobs/assets | Run/operation IDs and Dify IDs; retain conversations, actual/estimated/unknown usage, job ordering and asset lineage; local agent-version IDs nullable for this profile |

Use M0's verified explicit lineage envelope for nested calls: correlation ID,
parent Dify run ID, child Dify run ID, role and application-owned operation ID.
Validate against the dispatched operation; retain it with the operation record.
The probe's `correlation:role` operation IDs suffice only for its single call per
role. Real runner revisions/retries need distinct application operation IDs.

Replace the old `artifacts_booklet_type_unique` constraint for the clean v2
baseline: it prevents multiple subjects of the same task. Implement the named
subject-key index above and verify it in setup/readiness/tests. Do not silently
drop indexes during an ordinary startup. The authorized clean reset builds the
new indexes; the initial transition release must remain deployable against the
old database with the runner disabled until that reset finishes. Test that
deployment-initialize → reset → readiness order before the staging release.

Run statuses: `queued`, `running`, `paused`, `blocked`, `completed`, `failed`.
Evaluation status is separate: `pending`, `running`, `complete`, `failed`.
Operation states: `prepared`, `started`, `succeeded`, `failed`, `unknown`.
Do not reuse `failed` for a merely uncertain network result.

An operation key includes run, role, task, subject, exact input-version fingerprint
and explicit attempt ordinal. Retry with the same key reads the existing result;
a new paid attempt requires a new authorized ordinal within limits. Creation,
claim and request-counter increment are atomic. Completed artifact/version writes
and the operation result commit together. Same completion digest is idempotent;
a different result on a completed operation conflicts.

Delegation defaults are behavior suggestions, not grants. The tester's initial
decision records scope. Approvals validate the latest grant at write time and
reference exact versions. Group review writes one approval per version. Revocation
affects future accepts, not history; changed sources invalidate dependent current
acceptance even if their previous approvals remain in history.

## Application API contract

Prefix browser APIs with `/api/experiments/booklet-runs`; use the existing Basic
Auth gate and same-origin checks. `POST /` accepts `{persona,mode,predecessorRunId?}`
and creates the fixed-case booklet/run. `GET /` lists runs. `GET /:runId` returns
progress, current decisions, artifacts, warnings, counters and evidence links.
`POST /:runId/pause` and `/resume` accept `{expectedRevision}`; pause is idempotent.
Resume schedules persisted unfinished work, never a completed provider operation.

Callback prefix: `/api/experiments/booklet-tools`. Allow only its enumerated
routes past Basic Auth in `proxy.ts`; each still authenticates `X-Booklet-Tool-Key`
and rejects production/disabled runner. Do not exempt the whole experiment tree.

| Route | Input and result |
| --- | --- |
| `POST /authorize` | `{runId,operationId,workflowRunId}`; claim prepared operation, return `{started,role,taskId,subjectId,mode,context,inputFingerprint}`; existing claim never returns a new permission |
| `POST /context` | Same identifiers; return role-filtered saved context for the matching operation only; read does not reserve another call |
| `POST /result` | Identifiers, fingerprint, `{kind,payload}`; accept only result kinds allowed for persisted role; return saved IDs/state/warnings |
| `POST /failure` | Identifiers, category `definite_failure` or `unknown_outcome`; application-owned message; never overwrite success |
| `POST /image` | Identifiers as unique validated query fields, original binary image body; M2 implements the shared completion validator |
| `POST /image-json` | Same query identity; bounded provider JSON body with exactly one base64 image; M2 decodes and uses the same completion validator |
| `GET /reference/:assetId` | Operation-bound authorization header, current approved reference belonging to that booklet; return stored bytes/MIME; M2 implements |

Reject duplicate/malformed identifiers and unknown envelope fields. Ignore harmless
extra content fields inside artifact payloads. Return `{error:{code,message,field?}}`
with a bounded message, no raw provider response. Use 401 for auth, 409 for stale
identity/conflict, 422 for invalid content and 503 for maintenance/setup.

Role result kinds:

- Manager: `delegate` (eligible task/subject/operation) or `ask` (material question).
- Specialist: `proposal` (one subject's content) or `clarification`.
- Tester: `decision` (answer, explicit/group approval, delegation change, revision)
  or final `feedback`.
- Judge: `assessment` only.
- Image: binary saved result only, never approval.

The server derives role/mode/task from the operation. Workflow input cannot grant
a different role. Keep callback keys and operation authorization out of model
prompts. Manager/specialist branches cannot submit tester decisions. The workflow
uses authorization's literal `started=true` and server-returned mode before any
provider node. A lost authorization response consumes the claim but never grants
a duplicate provider call.

## Bounded execution and recovery

Each provider-bearing operation reserves one request before execution; only use
a path with verified one-request behavior. Keep logical text/image counters in
every mode and payable text/image counters separately. Simulation consumes the
logical reservation but increments no payable counter. Apply the case ceilings
to logical calls in simulation as well, so the same cap-exhaustion tests exercise
authorization without spending. Balanced simulated images consume logical image
allowance but zero payable image allowance. Both counters and the operation
claim update atomically; duplicates cannot debit twice. Token/retry bounds come
from M0's verified manifest.
All run steps, including manager/tester/judge and repairs, count against limits.

Use a 10-minute operation deadline and 60-second completion claim for image saves.
Timeout means `unknown`, not permission to regenerate. Store workflow execution ID
as soon as available. A late completion is accepted if the same operation remains
unresolved and its input versions are still current; pause alone does not reject it.
Superseded operations cannot publish. Do not automatically replay a started
operation on process restart. Inspect Dify evidence first.

Use the runtime-credential recovery interface only after M0 proves status/result
retrieval and records its identifiers. Do not assume app-key support or use Codex's
administrative MCP session as application recovery. Reconcile saved execution IDs
without provider execution. If Dify still reports
active work, continue observing it. If it supplies a completed result, recover
that result idempotently. If the state/result cannot be established, mark blocked
unknown and retain it; never automatically create another paid attempt. A failed
acceptance run remains evidence and any repaired successor is a new run.

Use 300 operation steps per run, three consecutive no-progress steps, and two safe
read/write transport retries as initial deterministic bounds. Exceeding a bound
blocks the run with an inspectable reason; it does not grant a paid retry. Simulated
fixture failure recovery must finish within those bounds. App run loops are not
held open in a browser request. Track mutations so maintenance drains active work;
new claims stop during pause/maintenance, already authorized saves finish where
the maintenance policy permits or are recovered afterward.

Progress means a newly saved artifact version, accepted decision/approval, stored
asset or resolved question—not an operation timestamp, heartbeat or repeated
narration. Compare that durable progress fingerprint after each bounded operation.

## First vertical slice

Read Ali's pinned orchestration and task 01–02 guidelines before writing the
manager/specialist instructions. Record the PRD adaptations, including delegated
reviews, so source quality gates do not become mandatory creator interactions.

1. Add schema/repository/index changes and role/operation contracts, then CAS tests.
2. Implement run creation, sequential dispatch and callbacks with deterministic
   transport fixtures. Add the M0-verified app/module credential-reference map,
   callback binding, app/base URLs and enabled-profile config; secrets remain
   optional outside enabled runtime. Do not assume one app key works for all modules.
3. In Dify, add manager/tester/J01/J02 simulation branches with canonical fixtures.
   J01: audience, premise, theme, emotional promise, tone, constraints, deferred
   decisions. J02: causal outline, character/place shortlists, arc/open decisions.
4. Materialize stable entity IDs in Booklet, not model output. Ask only missing
   material questions. Persist tester grants and explicit/delegated approvals.
5. Add `/experiments/booklet-runs` and run-detail page with create, progress,
   messages, current artifacts and Pause/Resume. Use current viewer components
   where possible; do not route v2 content through old eight-stage parsers.
6. Deploy the reviewed slice through EXECUTION D. Set the private app/callback
   bindings before executing a Dify smoke. Publish/synchronize/read back Dify.
7. Run a staging Simulated J01→J02 case, reload, pause/resume and inspect persistence.

## Verification and exit

Create focused tests under `tests/unit/experiment-runner-*.test.ts` and
`tests/integration/experiment-runner-*.test.ts`; use the existing Vitest setup.
Run `npm run typecheck`, `npm run lint`, then focused files with `--bail=1 --retry=0`.
No production build outside Deploy.

Test creation/idempotency, wrong roles, stale source versions, duplicate callbacks,
each J01/J02 clarification/draft/revision contract,
restart before/after claim, pause while in flight, grant narrowing/revocation,
group approvals and escalation outside scope. Test that a broken/empty local agent
registry does not affect this profile. Test production callback rejection and
normal route authentication. Browser smoke must show saved J01/J02 after reload.

Exit: two current accepted artifacts, exact decision/delegation provenance, no
provider execution, persistent progress, and matching staging/Dify release evidence.
Complete two clean reviews and the authorized PR/CI/deploy/check cycle. Revise M2
with the real contract and remaining setup; do not mark M1 complete on local mocks.
