# M1 — Durable runner, Concept Brief and Outline

**State:** Planned. **Coverage:** J01–J02; AC01, AC05–AC06, AC09, AC11–AC12.
**Predecessor:** [M0](M0-readiness.md). Follow [EXECUTION](EXECUTION.md) at entry,
review and publication. These are proposed shared contracts; finalize them from
M0's verified packaging before implementing the dependent interfaces.

## Entry and manual setup

Reconcile M0's selected verified packaging, actual workflow schema/bindings and code
baseline. Invocation/credential details below must be finalized from that proof,
not from the superseded single-workflow proposal. Before local implementation,
verify contracts, fixtures and local test storage. Before staging verification,
verify execution credentials, callback key, origin reachability, database
and AssetStore access and release permissions. Bundle any
missing login/key installation and deployment grant into one handoff. No paid
authority is needed. Run the entire milestone in Simulated mode.

The new callback routes do not exist at entry. Verify the origin/access path now;
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
