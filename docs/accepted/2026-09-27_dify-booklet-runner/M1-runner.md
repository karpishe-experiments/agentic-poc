# M1 — Durable runner, Concept Brief and Outline

**State:** All three live Simulated J01–J02 cases passed, including reload persistence and exact approval/lineage evidence. Idle Pause/Resume passed; active-progress control conflict recovery has a local correction pending publication and live verification. **Coverage:** J01–J02; AC01, AC05–AC06, AC09, AC11–AC12.
**Predecessor:** [M0](M0-readiness.md). Follow [EXECUTION](EXECUTION.md) at entry,
review and publication. These are proposed shared contracts; finalize them from
M0's verified packaging before implementing the dependent interfaces.

Before handing a slice to Sol/low, fill the compact
[execution package](EXECUTION.md#sol-low-execution-packages) in this file using
M0 evidence. The contracts below remain proposed until that reconciliation;
do not treat them as a completed implementation package.

## Bounded local execution packages — 2026-10-04

### Current staging transition evidence

Reviewed reset source `59e954f5a03101ec9240e94dd4e64813cde32edd` merged through
PR #94 to master `403ee5d9b6c55a656db07c646dc92c1f668bbf0f`. Two independent
reviews and Validate `37214780043` passed, including both Linux shell suites.
Infrastructure `37215111698` synchronized the reviewed host dispatcher.
Selective staging PR #95 passed two release reviews and Validate `37215287229`.
Release `80d62c4615f901e2f548877ede79c45029e75b05` passed Deploy `37215558501`
and Check `37215933838`; its image is
`sha256:5dfaf055485b54fd52ecb4c7554f9d0291c0846796ee870d470df081070dcd09`.

Inventory `37215969214` verified the exact staging targets before deletion:
one booklet, four asset records, four model-call records, ten agent definitions,
eleven agent versions, eight artifacts and seven messages; no experiment runs,
operations or delegations. The whole asset bucket contained six objects totaling
12,901,577 bytes. Reset `37216104737` retained complete backup
`staging-20261004T161608Z-54752b58ec7bc071`, reset the approved database/bucket,
initialized the Dify profile without legacy agent seeds and activated the
Simulated-only runner. Post-reset Check `37216248316` passed. Production,
existing Dify resources and diagnostic/recovery buckets were not reset.

The existing private preparation was uploaded with the enabled flag after reset
to keep the GitHub settings bundle aligned with the host. No new key, workflow
execution or provider call was made. Chrome control now works. The first
Playful Kid Simulated run `b42c808f-7d5d-43d4-8486-8f6a0a1fb658` remains saved
as blocked; Dify run `54f72080-9a7d-4316-b7a0-068f195dbc93` sent an empty
authorization body and received HTTP 400, with zero provider calls. The graph
builder used `text` instead of Dify's raw-text item `value` field. The correction
covers both authorization and result callbacks in all six modules; regression
tests check their exact selectors. PR #97 passed Validate `37225604910` and
merged to master `38e9a6ff12f257868acdbea74f705369d36b24cc`. CLI import preserved
the private bindings; MCP published and read back all six corrected versions.
Protected staging settings rotation `37225932334` passed. The UI correction adds an explicit `Start linked successor` control for
blocked/failed Simulated runs, retains its creation key on response loss, and
shows the saved predecessor. It does not retry the failed operation. PR #98 merged
to master `c856c285333c95afcc8105a2ebf236aeb793f61e`; Validate `37226314159`
passed. Selective release PR #99 passed two independent reviews and Validate
`37226612877`. Staging `eea06e7b94a375629a25eef818e1eecf98a2fa6d` passed
Deploy `37226862962` and Check `37227297740`, with immutable image
`sha256:fef41a6d5d1c7c197fe123ad525ec2a78e37698eeefb32732284bfe753f6bcde`.
The deployment retained backup `staging-20261004T190850Z-8a099e6e0d4d9fa4`;
it did not reset data. The earlier
slice records below describe their publication-time evidence, not current reset
status.

### Live browser acceptance — 2026-10-04

| Persona | Booklet run | J01 version | J02 version | Logical text / payable text |
| --- | --- | --- | --- | --- |
| Kid | `e8406369-4716-4144-8a9c-4d928595aa98` | `2fa3a3cb-8950-4174-bff5-8a41d716a157` | `c19bf4b8-4592-429d-927d-066f129b8f44` | 5 / 0 |
| Parent | `0529e13a-5d18-4ce9-8a8c-3404300598f2` | `dfde3142-0297-4f31-bf97-d57ac8eef56a` | `d2f71246-aefb-4cd2-95bf-0598a6d3831e` | 5 / 0 |
| Creator | `5cdba706-8cd1-4bf7-8ed3-6bc94f204acf` | `5bfef8d4-5f87-4a5b-8845-f5a8cb524795` | `e13693af-7767-4c1e-9983-c4c5c784e6c9` | 6 / 0 |

All three reached `slice_complete`, with approved current artifacts and exact J02
source-version references. Kid and Parent used recorded delegation; Creator used
two explicit tester reviews. All sixteen Dify executions were read back through
MCP as `succeeded` with `total_tokens=0`. Image counts were zero. Each specialist
trace retained its preceding manager workflow-run ID. Reload retained artifacts,
decisions, limits and traces. The failed Kid predecessor remains recorded and
linked; no failed operation was replayed.

Kid Pause persisted as revision 26 after reload. Resume reached revision 27 with
the same five operations and unchanged artifact versions. Pause clicks during
rapid active progression returned definite revision conflicts instead of pausing;
they did not bypass CAS or replay work. The candidate UI reads the current run
after that specific rejection and retries the control once unless already applied
or no longer permitted. Lost responses and other failures are not retried.
This correction needs reviewed release and live verification before M1 control
acceptance is complete. The queued J03 boundary is not a completed booklet, and
neither images nor Balanced/Real behavior has been tested here.

| Module | Corrected published workflow ID |
| --- | --- |
| Manager | `7fdf6889-cc91-4ecd-abbe-8d23e09738f5` |
| J01 | `dc48fa97-f6ba-49d9-9785-ab4e67855ef7` |
| J02 | `a633aa82-bfdd-4b91-8462-de8837e18113` |
| Kid tester | `9ae4c560-91b9-4e92-9ff7-a65d312c0477` |
| Parent tester | `4a080bd6-2ed7-4791-96ba-7e48d671ae80` |
| Creator tester | `8dda908c-24f1-4108-9e64-3fa16c99022a` |

M0 proves separate workflow invocation, publication/tool synchronization,
restoration, explicit lineage transport and diagnostic runtime-key recovery.
The selected layout is nineteen independent workflows. Production, Cloud,
existing probes and private keys remain unchanged. Paid calls remain ungranted.
The later staging-reset grant and runner publication authority are recorded in EXECUTION.

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

| Field | S4c1: availability, bindings and application interfaces |
| --- | --- |
| Goal and components | Add narrow runner configuration/HTTP services and the browser run routes plus four machine callbacks. Extend the existing proxy only for those exact callbacks. Reuse experiment repositories, saved context, Basic Auth and tracked mutations. |
| Contract and examples | `DIFY_BOOKLET_RUNNER_ENABLED` defaults off and cannot enable production. Use a Community HTTPS origin, configured Booklet origin, dedicated callback key and protected JSON bindings for six M1 modules: manager, J01, J02 and three testers. Each binding records app/publication/tool identifiers and its private application key. Store only selected-persona non-secret identifiers in run evidence. Only Simulated creation is enabled in this slice. |
| Ordered edits | Validate bindings without logging values; expose safe setup errors. Add list/create/detail and revision-bound Pause/Resume. Creation uses an opaque idempotency header so a lost browser response does not create another run. Callback envelopes include the required nullable parent workflow ID. Authenticate before body parsing, bound streamed JSON, derive role/mode from saved operations, and keep unknown outcomes distinct from failures. |
| Verification | Focused HTTP/configuration and isolated Mongo tests: disabled/production, wrong key/Basic Auth/origin, malformed/extra fields, body limits, creation replay, CAS controls, exact callback identity and zero payable reservations. Typecheck/lint and affected proxy/env contracts. |
| Completion and escalation | Local API proof only. Startup selection, host-key independence, dispatch, live bindings and UI remain S4c2/S4c3. Do not enable staging or invoke Dify without the reviewed transport/configuration and private bindings. Escalate a required interface or credential-scope change. |

| Field | S4c2: dispatch identity and deterministic recovery |
| --- | --- |
| Goal and components | Extend experiment operation storage/repository and add a small sequential orchestration/transport service. Use the selected module's runtime key, never administrative MCP or a provider SDK. |
| Contract and examples | Atomically persist `dispatchStartedAtMs` and parent identity before one runtime POST. A crash after that marker cannot grant another POST. Save a returned workflow ID even before authorization. Only the matching callback claim reserves requests; unclaimed unknown work has no reservation and cannot save a result. |
| Ordered edits | Add dispatch CAS and sanitized outcome/recovery methods with isolated Mongo tests. Route an initial Kid/Parent delegation, then saved manager delegation, owning specialist and tester reviews. Stop at J03 without marking the booklet complete. Reconcile stored IDs through bounded GET only; no ID means blocked unknown. Count durable progress, not narration, and block after three no-progress steps. |
| Verification | Fake-transport tests for concurrent dispatch, crash before/after claim, lost POST response with/without ID, paused authorization, wrong publication/identity, duplicate callback, restarted routing and all persona slices. No network/provider calls. Run typecheck/lint and affected repository tests. |
| Completion and escalation | Local transport proof only. Read back each model-free published module and verify runtime lookup before live execution. Unknown or mismatched outcomes block; never replay or increase limits. A verified paused, unclaimed execution may close without a reservation; Resume prepares new unfinished work, not a completed call. |

S4c3 selects the enabled startup/verification profile, removes the new path's
local-agent and host-provider requirements, adds the inspection UI and prepares
the reviewed simulation modules. Preserve disabled legacy/Cloud defaults.

| Field | S4c3: enabled profile and inspection UI |
| --- | --- |
| Goal and components | Select the experiment loop in the existing runner bootstrap. Extend environment, initialization and preflight checks; add `/experiments/booklet-runs` and a small client inspector. |
| Contract and examples | With the valid non-production runner flag enabled, initialize experiment structure without local-agent seeds, use no host provider key and run only the sequential Simulated dispatcher. Keep seed assets for current health checks. Disabled settings preserve legacy behavior. Show all personas, saved artifacts, warnings, decisions, limits and Pause/Resume; Balanced/Real remain unavailable. The J03 boundary is not complete. |
| Ordered edits | Add profile-aware checks and regression tests. Add safe operation/status projections. Route enabled home/navigation to the runner, keeping unrelated legacy data and Cloud endpoints intact. Prepare six independent model-free modules only after obtaining current node schemas; publication/private binding remain a separate live checkpoint. |
| Verification | Focused environment/bootstrap/initialization and UI tests, affected legacy checks, typecheck/lint in the clean verification checkout. Test controls with fake HTTP responses; verify live browser behavior after authorized staging release. |
| Completion and escalation | Local application candidate, not deployed simulation. Private keys and exact reset remain unresolved until consolidated handoff. Do not invoke models, expose configuration, reset data or modify old Dify apps. |

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

The S4c application and module evidence follows below. Live bindings, runner
enablement and staging acceptance remain pending.
Private suite keys are installed and exact-target reset authorization is granted
as recorded below. Runtime acceptance remains pending. Runner PR merge, staging release and UI browser verification are now
authorized as recorded in [EXECUTION](EXECUTION.md#b-authorization-register).
Production, paid calls and existing Dify-resource changes remain excluded.

### S4c candidate and private binding checkpoint

The local candidate now includes the enabled profile, strict run/callback APIs,
durable dispatch/recovery and the inspection UI. Six independent model-free
module graphs are prepared by
`npx tsx scripts/prepare-dify-booklet-module.ts --module <name>`.
Use `--help` for the six exact names and `--graph` for offline validation.
The source fixture is [dify/m1-simulation.py](dify/m1-simulation.py). Python and
TypeScript fixture parity tests cover all personas, questions and revisions.
The six model-free modules are now published as recorded below. They are not
live-accepted; runtime binding verification and runner enablement remain pending.

The current Community MCP still verifies the intended workspace. Its current
code/HTTP defaults and the pinned 1.17.1
[conditional-node tests](https://github.com/langgenius/dify/blob/8387590ace4a094de812b7847fc6a4c3a27cd52b/api/tests/unit_tests/core/workflow/nodes/test_if_else.py)
supplied the node contracts. Offline validation of all six candidates returned
no errors or warnings. This does not verify callbacks, secret binding or runtime execution.

Before live execution, privately bind one dedicated runner callback key into
each new module's `BOOKLET_TOOL_KEY`, and each app execution key into Booklet's
protected `DIFY_BOOKLET_BINDINGS_JSON`. Record app and publication identifiers,
and nullable tool-provider identifiers. Set `DIFY_BOOKLET_BASE_URL` to the
Community origin and `DIFY_BOOKLET_PUBLIC_ORIGIN` to the exact Booklet origin.
Do not reuse diagnostic or Cloud keys. Keep `DIFY_BOOKLET_RUNNER_ENABLED=false`
until setup, release verification and exact-target reset approval are complete.
The S4d change below adds protected runner settings and passed required Linux CI.
Host synchronization passed through Infrastructure `37207147716` on reviewed
master `e3b8695e57c46cc4b6c7cec0537597d28f08543d`, with zero Terraform changes.
Disabled settings installation passed in [37208460526](https://github.com/karpishe-experiments/agentic-poc/actions/runs/37208460526);
[staging check 37208551295](https://github.com/karpishe-experiments/agentic-poc/actions/runs/37208551295) passed.
Backup `staging-20261004T141351Z-b3a7865b1ca8e267` is retained.
This verifies installation and health, not runtime key matching or callbacks.

With valid local/staging bindings, enabled initialization verifies experiment
references without local-agent seeds or a host provider key. It retains seed
assets for the existing health check. Disabled settings preserve the legacy
path. No paid mode can be created through these APIs. The retained unknown
operation is inspected through GET only; automatic polling stops at its saved
deadline. No-ID work remains blocked for inspection.
After a lost response, a saved callback result still requires runtime read-back
of the published workflow identity before another operation can start. Keep the
result, but block progress if that identity cannot be verified.

This checkpoint requires runtime verification: private settings installation and
reset authority are recorded below, not supplied by application code or offline validation.

### Staging and module readiness — 2026-10-04

S4c and its narrow server-build correction reached staging through PRs #88/#90.
Release `ed4927da72c313ff5a06ef2ba7661917ab81f2f9` passed
[Deploy 37203706818](https://github.com/karpishe-experiments/agentic-poc/actions/runs/37203706818)
and [Check deployment 37204107325](https://github.com/karpishe-experiments/agentic-poc/actions/runs/37204107325).
The image digest is `sha256:4edd1ad1e9bf8aded0428211dcc440ff427597d92dc1300b45ab3e494f676d8c`.
Cloud and the Community diagnostic probe were preserved. The runner remains off;
this is deployment readiness, not M1 acceptance. Browser verification could not
start because the browser plugin could not load its request-header policy.

S4d source `12eeb3da7926bc91ec79dc226ee0303726138017` merged through PR #91.
[Validate 37204097124](https://github.com/karpishe-experiments/agentic-poc/actions/runs/37204097124)
passed, including both complete Linux shell suites, ShellCheck, Actionlint,
typecheck, lint and selected deployment contracts. Two consecutive independent
reviews passed. Live dispatcher synchronization subsequently passed through
[Infrastructure 37207147716](https://github.com/karpishe-experiments/agentic-poc/actions/runs/37207147716).
Private disabled-settings rotation and health verification passed as recorded
above. Runner enablement and reset have not occurred.

Community MCP reverified workspace `ffac910f-2786-490e-90d8-07243d49741b`.
The seven retained apps stayed unchanged. Each new graph has only start, code,
HTTP, conditional and end nodes, with controllable retries off. Server-backed
validation returned zero errors/warnings. Imported node data matched the reviewed
candidate; published graph hashes matched their drafts on read-back.

| Module | App ID | Initial published workflow ID after private preparation |
| --- | --- | --- |
| Manager | `eca554a2-34bd-489c-b05d-713a6876b448` | `e501763a-a2c5-4f97-a641-68c3acea9555` |
| Concept J01 | `7c186b42-a069-4059-aac6-5589e870951f` | `09f5449e-50f9-4fd3-93d2-c4eec7e890dc` |
| Outline J02 | `4b49ed43-218d-4892-981f-acfe7181c60c` | `0f2c85f4-374b-4496-ba6c-1bc6a2ec3bb2` |
| Playful Kid tester | `973d697b-68dd-4b05-bd57-ededfa383a14` | `53233260-819d-49e4-901e-36b2596a343c` |
| Enthusiast Parent tester | `33d47b5c-77c0-4ab5-86d0-6ee7da8fca1d` | `25bd2bf1-b0a2-427f-ac0b-782c5b28df5c` |
| Professional Creator tester | `99e1740f-52f2-467e-9553-81104564c3ae` | `be28be1b-1a2f-4725-9421-982868ab8de7` |

These modules use direct application-key invocation, not Workflow Tools; their
tool-provider identifiers are null. No workflow was executed. Secret masks do
not prove callback-key binding. The operator reported successful private
preparation of the callback and six application keys in the Windows-account
encrypted local file. MCP retrieved each latest published version listed above;
all six retain model-free graphs and the corrected branch outputs. No private
key value or encrypted file was read during this check. Callback-key agreement
and runtime-key validity remain unverified until the authorized runtime check.
Studio rejected the initial graphs because both End nodes exposed the same
output names, despite successful bridge validation and backend publication.
All six drafts now expose `booklet_result` only from saved completion and
`authorization_reason` only from pause. Authorized Chrome editing preserved
the environment bindings; MCP read-back confirmed that only these two existing
node fields changed. All six Studio checklists report that all issues are resolved.
Seven graph/fixture tests and focused lint passed. Two independent code reviews
passed. A detached clean checkout passed full typecheck and the same seven tests;
the original checkout's stale generated types and ignored nested checkouts were
left unchanged. Private preparation and publication
are now reported/read back, respectively; no workflow execution started during
this repair or publication verification. The reviewed host dispatcher is now
synchronized and the disabled settings are installed. The operator approved
resetting staging `kids_booklet` and the whole `kids-booklet-staging-assets`
bucket, followed by Simulated-only activation. Inventory, complete asset backup
and the initializer transition must pass before deletion. Production, existing
Dify resources, diagnostic/recovery buckets and paid calls remain excluded.
Do not use diagnostic or Cloud keys, run a test, reset data or enable the runner
as part of credential preparation.

## Entry and manual setup

### S4d: protected staging runner bindings

| Field | Bounded execution package |
| --- | --- |
| Goal and components | Extend the existing `Dify staging key` workflow, canonical host dispatcher and Compose default for the five runner settings. Reuse private SSH staging, exact-field validation, merge-patch preservation, shared lock/journal, drain, backup and readiness. No live credential entry or enablement in this implementation slice. |
| Contract and examples | Add the staging-only selector `DIFY_BOOKLET_RUNNER` and protected Actions secret `DIFY_BOOKLET_RUNNER_SETTINGS_JSON`. Its JSON object contains exactly `DIFY_BOOKLET_RUNNER_ENABLED`, `DIFY_BOOKLET_BASE_URL`, `DIFY_BOOKLET_PUBLIC_ORIGIN`, `DIFY_BOOKLET_TOOL_KEY`, `DIFY_BOOKLET_BINDINGS_JSON`. Origins are fixed to Community and Booklet staging. The flag is a string `false` or `true`; initial private setup uses `false`. Binding JSON is a string containing the six strict M1 bindings from `config.ts`, with unique app UUIDs and exact role/task/persona slots. Validate both disabled and enabled bundles; a disabled bundle is not permission to store malformed credentials. Reject production and unknown fields before staging. |
| Ordered edits | Add bounded bundle parsing/building and host validation. Validate the complete merged override, including existing Cloud/probe fields; preserve all unrelated secrets and the existing host OpenAI key. Extend full protected-file input support without requiring runner fields in legacy setups. Add only a default-off Compose switch. Extend the master-freshness-checked workflow with the selector and protected secret reference; keep summaries allowlisted. Update deployment contracts/runbook and architecture. |
| Verification | Add shell tests for missing/malformed settings, six-slot/UUID validation, duplicate apps, dollar escaping, false/true flags, extra fields, production rejection and preservation of Cloud/Community/application fields. Run `bash -n`, ShellCheck, both deployment shell suites, Actionlint, isolated deployment contracts and `recovery-storage.test.ts`. Windows limitations require Linux CI, not a local full-suite claim. |
| Completion and escalation | Reviewed repository plumbing only. Private keys, exact-target reset approval, host synchronization and enablement remain separate checkpoints. Do not rotate credentials, dispatch maintenance, reset data or enable the runner. Escalate incompatible host secret contracts rather than deleting legacy settings. |

An enabled bundle can be applied only after the private-binding and exact-target
reset checkpoint. Installing a disabled bundle does not verify Dify publication,
runtime callbacks or live acceptance.

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
