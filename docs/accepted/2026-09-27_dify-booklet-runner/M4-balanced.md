# M4 — Simulation hardening and Balanced acceptance

**State:** The original Kid run is paused after 30 paid text requests and five simulated images. Its retained J11 result is saved and independently verified. Normal staging deployment failed during initialization; admission remains closed. Parent and Creator remain unstarted; M4 is not complete. **Coverage:** AC01-AC03, AC05-AC08, AC10-AC13.
**Predecessor:** [M3](M3-completion.md). Apply [EXECUTION](EXECUTION.md).

## Supported recovery follow-up - 2026-10-18

**Current implementation and live state - 2026-10-19:** PR #215 merged at
`f6ef69c13da448fea60c4365797e2b795ae6e666`. Two independent reviews and lean
CI `39250813474`/`39250970728` passed. Supported J11 recovery v7 committed the
original result; verification-only `39254103801` proved durable completion and
preservation before restoring the prior app ready with admission closed. No paid
request was replayed. Backup `staging-recovery-issue65-m4-j11-20261019-v7` and all
failed recovery journals remain retained.

PR #205 then merged at `7f195b57411a54051ea56dc95d43e43b92280e0b`.
Normal deployment `39254742459` selected image
`sha256:084a19907ea3118ea881dd429115096965a5da45ff590e2ffea4f4ea0b0c1f5b`
but failed in `initialize-deployment`. The private host diagnostic reports a
MongoDB `getMore` socket-read timeout after 27,962 ms; it does not identify the
collection. Backup `staging-20261019T125219Z-4e70a40e25dc961d` contains 162 assets.
The serving app is stopped and admission is closed. Preserve the original request
and deadline; inspect supported expired-deployment recovery before new delivery.

The bounded initializer correction reads only identity/provenance fields in
indexed pages of at most 100 rows. Every existing integrity check and collection
row remains covered. Saved outputs, prompts and preparation payloads are excluded
from these reads. A failed read emits a fixed phase, collection, allowlisted error
kind, elapsed time and completed-row count, then preserves the original error.
The related host correction pins and archives a completed recovery handoff only
after expired-deployment compatibility/readiness pass. This avoids pinning the next
corrective release to the failed candidate tree. Original journals/deadlines and
saved results stay unchanged. No timeout, schema, initializer compatibility
fingerprint or credential changes are included. Local fixtures verify pagination and final-page corruption;
this is not proof of live latency or of the exact collection that timed out.

Next: finish focused validation and two clean reviews, publish the correction,
install the reviewed dispatcher correction, recover the expired delivery through
supported controls, deploy normally and
verify release/admission. Then explicitly Resume the same Kid run and continue
Parent and Creator within the existing conditional $5 and no-successor limits.

The bounded diagnostic follow-up adds paginated operation state and claim/presence
flags to existing read-only inspection. MongoDB returns content type markers,
not saved output; claim expiry is diagnostic only. One real-persistence fixture
checks missing/null content, retained expired claims and sanitization. Use a new
inspection-only request before selecting another recovery action. Preserve the
interrupted request, checkpoint, backup and all private phase evidence.

The next bounded correction adds an explicit linked claim-release purpose to the
existing candidate-reconcile control. A new reviewed image must prove that the
exact expired claim is the only difference from the interrupted request's complete
checkpoint. It restores the original null/missing representation with an exact
compare-and-set, records provenance in a separate child checkpoint and leaves
the original journal/checkpoint, stopped service and closed admission unchanged.
Repeated requests verify only; they cannot clear a successor claim or replay J11.
An explicit child abort requires unchanged full pre-write state and the exact
retained claim; it closes only that child and rejects a committed release.
Then the original request's supported abort must independently prove unchanged
state before restoring the prior service with admission closed. Diagnose the
transaction failure before another separately previewed reconciliation attempt.
Normal failed-completion cleanup gets its own existing five-second cleanup budget;
sanitized repository error codes remain visible at the recovery boundary. Required
verification covers original snapshot equality, source/approval/accounting drift,
active/replaced claims, cancelled cleanup and interrupted/duplicate child requests.
Credential inventory impact: none; no secret storage, transfer or consumer changes.

The user approved replacing repeated manual repair scripts with supported narrow
operator actions before paid M4 work resumes. Implementation is in progress;
no successful live recovery or additional provider call is claimed. Supported inspection
`39111819466` found only the retained Kid run and J11 operation, with no unrelated
work or mutation ownership. The reviewed dispatcher was installed with backup
`/var/lib/kids-booklet/issue65-recovery-dispatcher.tLAD2Xzq/dispatcher.before`.
Read-only previews `39111874396` and `39114863072` failed with
`MongoOperationTimeoutError` before admission closure or recovery apply. The
failing read was not identified. The bounded correction reads the same complete
preservation evidence in keyset pages and reports the failing inspection phase.
It does not assert that pagination resolves the live timeout; live readback is
still required. No dispatcher change, credential change or provider request is
needed for this correction. Candidate preview `39115827216` then failed at
`snapshot.assets` with generic `Error`, still before admission closure or apply.
Inspection found that budget expiry was omitted from the diagnostic allowlist;
the phase is consistent with cumulative budget exhaustion, but does not prove it.
The follow-up retains explicit `OperationBudgetExpired` diagnostics and increases
bounded pages from 32 to 256. A 600-row unit fixture now needs three requests
instead of nineteen, with identical complete hashes. The 90-second budget and
all preservation, grant and accounting gates remain unchanged in that correction.
Preview `39116827001` then reached `remote_observation` and explicitly reported
`OperationBudgetExpired`, before admission closure or apply. No slow-provider
diagnosis follows from this: earlier work consumes the same maintenance budget.

The next correction removes duplicate fresh-apply preview work: one service-owned
preview awaits its durable checkpoint, rechecks current eligibility and closed
admission, then uses normal reconciliation. Full pre/post proof remains; fresh
apply needs three snapshots instead of five. Each snapshot reads at most four
collections concurrently, stopping new scheduling after a failure and settling
started reads. A deterministic delayed-read fixture completes eleven 10ms reads
in 30ms instead of 110ms serially; this is local evidence, not live latency.
The maintenance budget is 150 seconds, leaving 30 seconds within the existing
180-second host bound for cancellation/shutdown. This changes no persisted provider
deadline or claim lease. Live resolution remains unverified.

Change-surface forecast: shared sanitized inspection and a maintenance-only
recovery CLI; staging candidate-image and expired-deployment actions in the
existing dispatcher/workflow; an artifact-only path in Deploy; and focused
application/host tests. Existing materialization, approval and accounting services
remain authoritative. Public routes, workflow publications, credentials, schema,
campaign limits and persona counts remain unchanged. Recovery provenance is held
in protected host checkpoints and existing operation metadata, without migration.

Candidate recovery is limited to an exact granted retained J11 completion. Normal
Inspect/Stop cover supported uncertain/stopped executions. Unknown identities,
invalid outputs and unrelated or unsupported bookkeeping remain explicit blockers;
there is no general record editor. Preview pins retained data and grant identities.
Apply requires quiescence, a verified backup and the same fingerprint. Interrupted
application writes are inspected, never automatically replayed. Recovery leaves
the Kid paused until separate normal delivery and preflight succeed.

Acceptance requires focused fake-provider/real-persistence proof, shell lifecycle
tests, storage checks, typecheck, focused lint, documentation checks, two clean
independent reviews and lean CI. Installed capability and live recovery evidence
remain separate gates. Existing M3 and efficiency evidence remains valid.

## Authorized same-run continuation - 2026-10-16

The latest user grant permits necessary reviewed corrections, staging delivery and
M4 execution within the existing USD 5 conditional campaign ceiling. Preserve the
same campaign, its frozen models/prices/request definitions, all reservations and
120/160/220 persona, 500 campaign and three judge request ceilings. No new budget,
successor, automatic provider retry, model escalation or paid image is introduced.

The first inspected continuation was Kid `c79b63dd-6ebb-4c49-8be3-d0bb409ac49e`,
failed manager `ac39211f-4e61-4c08-a3b6-81f922bf9be4`. Eight requests already count;
112 Kid and 492 campaign requests remain. Retain J01-J03 and the failed response.
Do not salvage its JSON prefix or increase output limits without measured cause.

Change-surface forecast: extend the protected non-secret grant with exact
run/operation continuation identities. The existing authenticated Resume route
consumes one matching authorization transactionally. Require a stopped campaign,
blocked definite failure, matching frozen identities, no active/unresolved work,
authenticated terminal failure evidence, attributable settlement and retained count
liability. Reopen the same campaign and queue the same run; leave the failed
operation unchanged except for appended continuation provenance. Never clear its
result evidence, counters or reservations. New preparation links the next operation
once to that provenance and reserves it normally. A later failure requires a new
reviewed exact continuation record under this user grant, not an automatic replay.

Extract the existing terminal failure proof for read-only reuse. Final accounting
must include authorized failed requests and independently revalidate their retained
proof. Late inspection must leave continued historical failures resolved while
rejecting conflicting execution identities. Historical runs without provenance keep
existing behavior. Public routes and Dify envelopes/publications remain unchanged;
optional persisted metadata needs no migration. Credential use/storage is unchanged.

Focused verification: duplicate/concurrent Resume consumes one grant, exact
identity/evidence and budget guards reject drift, no unresolved work can continue,
old operations/approvals/charges remain, one new operation links to the failure,
late inspection cannot re-block or replay it, and exit accounting includes its charge.
Run affected integration/units, typecheck, focused lint, links and whitespace; obtain
two clean independent reviews and lean CI for the selective staging delivery. Then
resume Kid, inspect any measured failure before correction, and proceed sequentially
to Parent and Creator. M4 passes only after all three retain complete outputs/reports.



### Measured J11 correction and request-definition amendment

The resumed Kid reached 26 text requests and five simulated images, then stopped
at specialist operation `e46b6b9b-a751-4809-87a5-f4aa8df49903` (Dify
`e45b4b23-797b-4992-9f3f-eab7b1bb81bf`). Its completed response placed every
normalized text-safe rectangle at x=y=0.5 with width=height=1, outside the page.
It also supplied two two-panel Kid story pages. Original output remains saved;
J01-J10 approvals/assets and earlier failure evidence remain unchanged. The ledger
retains 26 requests, 24,592 settled microdollars and 23,400 assumed count liability.

Extend the existing exact continuation to inspected pre-generation specialist
failures using the same terminal proof and accounting guards. Add this exact J11
identity to the protected grant. No report/judge retry or automatic replay is added.

Clarify the J11 request: x/y are top-left normalized coordinates, width/height are
sizes, x+width and y+height must be <=1; include a valid fractional example. Pin
persona page counts and Kid single-panel structure in the generated output schema;
state Parent's exactly one two-panel page and Creator's at least two multi-panel
pages. Preserve all ordinary owning-service source and semantic validation.

Request-definition amendment boundary: keep the campaign's original frozen policy,
prices, models, limits and grant reference unchanged. A reviewed grant may declare
one exact from/to request-bundle hash plus authorization reference. Configuration
and preparation require that amendment to match the running request code; absent,
wrong or revoked amendments prevent new claims. New preparations retain the
amendment and effective definition/request digests. Historical preparations and
failure evidence keep their original bytes and remain readable; never rewrite
the campaign policy or old output to match new prompts. Reject stale corrected
preparations when authority changes. Dify's generic decoder consumes the newly
saved request; no graph, plugin or credential change is needed.

Focused proof covers the captured rectangle/Kid-panel failure, valid layouts for
all personas, old-policy preparation under the exact amendment, absent/mismatched
amendment rejection, specialist continuation with inclusive charges and unchanged
prior work, then typecheck/lint/links and two clean reviews/lean CI of both diffs.
Deliver once through the existing staging process and continue the same Kid.

### J11 incomplete-output correction - 2026-10-17

PRs #200/#201 delivered the geometry/cardinality correction at release
`e48d38648d273242d83354ee0907b6aed03c6c84`, image
`ghcr.io/karpishe-experiments/agentic-poc@sha256:d1f092887c7bef0f00d2336abf3af72bb73a9279a76460598179e8701e050523`.
Deploy `39030111095`, archived host readback `39030453642` and Check `39030471545`
passed. Preflight read the normal manager `46572ccb-d954-45e5-b73d-90fd0995cdb6`,
publication `64d08408-4ab7-4413-a5a1-0fccadd2ff26`, ready=true and idle=true.
The approved operator recovery retained the original failed deployment journal
and deadline unchanged; backup `staging-20261016T202602Z-eb767c57208dac24` was
verified. The successful separate deployment retained its new backup
`staging-20261017T114932Z-61c1f7d0730293ca`. No recovery gate is added to acceptance.

The same Kid continued once. J11 operation `cbc18fd7-7aa5-475e-bc0a-a312e584d25c`,
Dify execution `4ef7f9bf-f48e-4634-8e73-5d33b3820c1e`, returned provider status
incomplete/max_output_tokens: 15,874 input tokens, 8,192 output tokens including
78 reasoning tokens. Its 30,807-character response has 6,729 non-trailing-whitespace
characters followed by 24,078 whitespace characters; JSON remains unfinished.
Do not salvage it or increase token limits. Kid is blocked at revision 200 with
28 text requests, five simulated images and all J01-J10 approvals retained.
The stopped campaign retains 32,847 settled and 25,200 reserved microdollars;
remaining conditional allowance is 4,941,953 microdollars. Parent/Creator remain
unstarted. Original failed responses, preparations and charges stay saved.

Amend only J11 instructions to require a complete compact JSON object, concise
field values, no indentation/blank lines outside strings, closure of every array
and object, and an immediate stop after the final brace. This mitigates the observed
whitespace exhaustion; it is not a proven cure for provider/constrained-decoding
behavior. Keep every output schema, owning parser, model, token limit, price,
workflow and credential unchanged. Append only the exact inspected operation to
the continuation grant. Keep the original request-bundle hash `293dce28…` as the
amendment source; new preparations use the reviewed replacement, while prior
`49607704…` preparations remain immutable and independently attributable.

Focused proof: compare all 48 definition/schema identities; reject and charge
incomplete whitespace-heavy output; retain prior approvals/assets/accounting
through exact continuation; verify historical amended preparation proof under a
changed amendment; reject stale/revoked preparation authority. Run affected units,
J11-only local integration and preparation checks, typecheck/lint/links; then two
clean reviews, lean CI and selective staging delivery. No paid smoke, successor,
new allowance, provider retry or persona campaign is added. Credential-inventory
impact: none; existing Dify-only storage and consumers remain unchanged.

### Current J11 cover-routing recovery - 2026-10-17

PRs #202/#203 passed two clean independent reviews and lean CI
`39032038325`/`39032047644`. Release `5335746bf11e1af1f1d2f429ea3ee3708b7b8b18`
uses image `sha256:d79882c41256316fabad292443d75b0675391e02c853dd189b5b433843497b03`.
Deploy `39032272766` reached its client wait limit; the original host request
completed and archived without replay, verified by `39032868955`. Backup
`staging-20261017T122714Z-ba99c94444a315a2`, Check `39032956244` and ready/idle
normal-binding preflight are retained.

The exact continuation produced a successful manager and completed J11 operation
`48e69de1-cbc9-4ac6-a5d2-bd81dddffad9`, Dify
`055c52c5-35c5-4a70-be1d-f126139a58d8`: 15,909 input and 2,334 output tokens,
including 66 reasoning tokens, 22.431 seconds in Dify. Its 7,422-character JSON
passes provider schema and layout validation. J05 contains a cover unit and three
story units; J11 routes all four known units across pages 0-3. Booklet's story-only
coverage check rejects the cover unit despite complete booklet coverage. The
operation remains active/started, run revision 212 blocked/definite_failure, and
campaign stopped. Retain 30 requests, 38,177 settled plus 27,000 assumed-count
microdollars; remaining conditional allowance is 4,934,823 microdollars.

Change-surface forecast: require manuscript coverage across the complete booklet,
including cover, with unknown-unit and exact approved-sheet checks unchanged.
Do not classify free-form unit keys or rewrite J05/J11. Add a protected exact
`completionRecoveries` grant for this active J11 operation. Original authenticated
GET evidence, request/usage identities, approvals, dependencies and bytes must pass
normal completion. Only that named pre-generation J11 operation may cross the
definite-blocker gate. Materialization, recovery provenance and reopening of its
matching stopped campaign commit atomically; other unresolved work prevents it.
Preserve every request, reservation, counter, charge, failed predecessor and original
deadline. Expired completion retains failed-attempt history and pauses normally;
explicit Resume can then continue without regenerating J11. Ordinary definite
blockers, Stop, missing/revoked grants and conflicting evidence remain blocked.

No prompt, workflow, model, token limit, price or credential changes are needed.
Focused checks cover complete cover/story routing, missing/unknown units and stale
references; exact saved-result recovery, duplicate inspection, unchanged accounting
and deadline, late pause and changed-source/evidence rejection. Run affected checks,
typecheck/lint/links, two clean reviews and lean CI before selective delivery.
Delivery constraint: the old application cannot materialize this result and normal
drain counts its active operation. Do not start a deployment known to fail. Prepare
one bounded operator execution of the reviewed recovery code after verified backup
and fresh identity/admission checks; preserve evidence and stop on uncertain
execution. This is a necessary manual checkpoint, not a permanent host action.
Normal selective deployment follows only after the operation is safely resolved.
Credential-inventory impact: none. The Simulated J12 fixture assumes title-only
cover lettering; it is not used by live Balanced J12 and remains a documented
fixture limitation. Do not claim whole-manuscript word equality from structural
J12 checks. M3/efficiency acceptance remains complete.

Track private setup and paid permissions only in the
[readiness/manual-handoff register](EXECUTION.md#b-authorization-register).
Keep model/accounting proof and campaign evidence here. Apply the
[three validation levels](EXECUTION.md#validation-levels-and-result-reuse);
reuse valid tests and repeat only affected checks during implementation/corrections.
Complete broader affected checks before publication, not after each local commit.

M3 Simulated acceptance completed on 2026-10-13. Its original handoff authorized
M4 readiness planning only. The later continuation authorizes the
[non-billable application foundation](#non-billable-application-foundation---2026-10-14)
and accepted implementation slices. It grants no paid execution, new credentials
or additional live delivery authority. Infrastructure remains an
assumed dependency; no restart campaign, fault injection, restore rehearsal or
host automation belongs to this readiness step.

## Execution efficiency follow-up ? 2026-10-13

**State:** Improvements deployed and the single authorized Simulated Kid comparison
passed. M3 acceptance stays complete; later non-billable implementation is recorded
below, and Balanced execution remains unstarted.

Main PR #188 merged reviewed commit `9e1b819cadd62d8ffd692134d5036b000e594356`
after lean CI `38406602852`. Staging PR #189 carried only the reviewed changes;
two clean delivery reviews and lean CI `38407168602` passed. Release
`db9321091cb7864f57f71419797f8eca9ba6fe5c` uses image
`ghcr.io/karpishe-experiments/agentic-poc@sha256:82e75c990184dffd2842367158899fedd5712dfc72ae0d845795e7be08f78dd1`.
Deploy `38407581872` reached its client wait limit while the host continued;
exact request `38407581872-1` completed and archived without replay, verified by
status `38408949314`. Backup `staging-20261013T134930Z-da101f91a5fcca21` is retained;
application Check `38409180811` passed. Normal eighteen bindings remain unchanged.

Comparison run [`5490f4e0-b966-40d5-8295-1e094f8f328a`](https://booklet-staging.uniwares.co.uk/experiments/booklet-runs/5490f4e0-b966-40d5-8295-1e094f8f328a),
booklet `6d84ef9b-8fc6-4fbc-80dc-5e0cee441491`, was submitted once and completed
without repair at revision 279. Generation and evaluation are complete; active
operation and preparation are null. Final diagnostics `38411518567` confirms
48 succeeded operations, one reservation each, saved results/materialization and
expected publication identities. All 48 authenticated Dify execution readbacks
succeeded with zero tokens and no LLM/Agent/tool provider nodes. Early diagnostics
`38409611919` remains retained.

The saved output has all J01?J13 responsibilities, 20 current approved versions,
one delegated tester decision, nine assets, cover index 0 and three single-panel
story pages. Each story page retains its current Page Bible and three approved
reference attachments; cover has zero attachments. Application saved completion
provides original-byte verification. UI readback confirms version/reference/digest
identities; no new storage hashing campaign was performed. Tester feedback
`c7e3041a-dac5-4143-b1ba-fe31a21a5ae7` (publication
`dd1cf687-2c2c-45bc-9c1e-10fffa820909`) and independent judge
`87f2419d-2de9-4851-ac47-1eb59d58e6a1` (publication
`539c1fa5-a07d-40d2-835f-b290d3c8bab9`) match all 20 current versions and
configuration `f2b7e9a84a114d05e9c857fa01c09443d1849544a288b4768fb42d5e5654d5fa`.
Simulated creative findings remain unassessed and 8x8 fixture geometry advisory.

| Measured evidence | Original Kid baseline | New efficiency run |
| --- | --- | --- |
| Text / image / total operations | 47 / 9 / 56 | 39 / 9 / 48 |
| Saved delegation decisions | 9 | 1 |
| First Dify start ? final judge end | 37m 05s | 14m 28s |
| Combined Dify execution time | 8m 00s | 5m 26s |
| Time outside Dify execution intervals, approximate | 29m 05s | 9m 02s |
| Inter-execution gap median / maximum | 27s / 79s | 7s / 45s |
| Payable text / image | 0 / 0 | 0 / 0 |

New Dify timestamps span 17:28:24?17:42:52 on 2026-10-13, Asia/Tehran. Compare
this same clock/window for each run; it excludes initial submission and final
Booklet evaluation bookkeeping. Duration is 61.0% shorter than the original.
A newer completed pre-change Kid `36c696df-a50d-4aa9-8fa4-18bbc50802c3` used the
same 56 operations and took 21m 00s; the new run is 31.1% shorter than that more
recent baseline. These are observed runs under potentially different load, not
a controlled attribution of every saved second to this change.

Final-page J13 work remains the largest stage: 6m 30s of the new measured window,
including four manager/image pairs, reference preparation, assembly and approval.
The manager ? image gaps total 154s across four pages. Lifecycle preparation before
image dispatch totals 154.253s across all nine images, maximum 39.739s. These two
measurements overlap and must not be summed. Final callback authorization p95/max
is 5.611/10.172s; its nested claim p95/max is 4.540/4.951s and context is
2.008/9.841s. Image callback maximum is 10.065s; storage maximum 1.545s and decode
maximum 81ms. Source/approval verification and reference preparation remain the
next bounded profiling targets. The existing host diagnostic allowlist returns
callback summaries; the new fine-grained application phase events were not exported
through that interface. Infrastructure changes and further runs are outside this
completed comparison.

The saved Kid baseline `fd21423e-0c6f-4303-80c8-9205900e5656` used 47 text and
9 image operations. Its 56 Dify executions succeeded with zero tokens/provider
nodes/payable calls. First execution start to final judge end was 37m 05s:
approximately 8m inside Dify and 29m between executions. Those historical gaps
include unpartitioned application/network work; they do not identify its cause
or establish current staging latency.

The candidate retains all roles and public workflow envelopes. Execution views
load current versions and relevant approvals; inspection and final report context
retain history. Scheduling uses targeted operation reads and a revision-scoped
view. Completed progress and page assembly are reused. Current scoped grants
approve assembled style/sheets/page images through the normal approval service;
Creator explicit approval and revoked/narrowed grants remain effective. Reference
preparation reuses original bytes within one invocation while each upload admission
rechecks metadata, sources, parent and run state. Strict operation admission,
authorization and completion keep independent byte verification. Historical terminal
operations without an end timestamp show duration unavailable. No persisted schema,
credential inventory or Dify publication changes are required.

Local comparison uses fake providers and isolated real MongoDB, with identical
endpoints: a saved J01 result, and a saved approved J13 image with three references.
Read counts cover find/findOne/aggregate calls, not writes or individual returned
records. Phase events overlap and must not be summed. The comparable local samples were:

| Durable endpoint | Before | Candidate | Work reduction |
| --- | --- | --- | --- |
| Manager ? saved J01 | 144 ms; 125 read queries | 137 ms; 115 read queries | 10 fewer reads (8.0%) |
| Manager ? approved J13 with three references | 1,784 ms; 542 read queries; 94 storage reads | 1,184 ms; 392 read queries; 61 storage reads | 150 fewer reads (27.7%); 33 fewer storage reads (35.1%) |

These are single local samples with fake providers and real persistence. They
support deterministic reductions in work, not a staging latency forecast. The
image-only candidate also performs approval that the old image-only endpoint
omitted; that unequal endpoint must not be used to claim a speed improvement.
Focused query/storage assertions and the unchanged Kid fixture protect these
reductions. Verification passed: 54 dispatch/orchestration/reference-upload integration cases,
15 context/J13 admission cases (the corrected historical fixture also passed alone),
23 UI/lifecycle/contracts units, five profile/grant/Kid completion cases, four image
recovery safeguards, six approval/corruption/no-progress cases, and the five-case
progress-compatibility correction check. Typecheck, focused lint and agent fixtures
passed; 147 local documentation links/anchors passed independent verification.
The progress correction retains historical approval IDs/nulls and ordered image
identities in its persisted fingerprint, without loading historical version content.
Reviewed publication, delivery and the single live completion/comparison passed.
The deterministic Kid fixture must complete with 39 text + 9 image operations
(48 total) and one saved delegation decision. No paid execution is authorized.

The authorized comparison is complete. Retain both baselines and the new run;
do not start another persona campaign or paid execution from this exit record.

## M4 readiness plan — 2026-10-13

Use the [M3 exit evidence](M3-completion.md#persona-exit-evidence) and unchanged
passing checks. Kid used 47 logical text/9 image calls, Parent 55/11 and Creator
84/15, all zero payable. These counts measure deterministic orchestration;
they are not forecasts of real model requests, tokens, cost or creative quality.
M3 acceptance used release `db51e9b394ddb01b14a4a832f862b53a3cfd0b7b` and
the eighteen restored bindings recorded in M3. The delivered efficiency release
above retains those bindings. Do not repeat its delivery,
operator exception, binding restoration or persona campaign.

### Selected policy and implementation contract - 2026-10-13

This section records the user's selected policy and governs the later implementation.
It grants no implementation or paid execution under this documentation task.

| Invocation | Model | Reasoning | Maximum output tokens |
| --- | --- | --- | ---: |
| Manager and persona decisions | `gpt-6-luna` | `none` | 2,048 |
| J01-J12 creative specialists | `gpt-6-luna` | `low` | 8,192 |
| Final tester report | `gpt-6-luna` | `none` | 8,192 |
| Independent final judge | `gpt-6-sol` | `low` | 8,192 |

Use Standard processing, at most 32,000 total input tokens per request, and output
limits that include reasoning and other billed output tokens. No automatic retries,
paid tools, model escalation or real image calls. Run Kid, Parent, Creator in that
order, one initial run each, with text-request ceilings 120/160/220 and 500 total.
Stop the campaign on technical failure. No successor or additional judge request
is authorized by unused allowance. Paid execution needs the final explicit grant
in [EXECUTION](EXECUTION.md#b-authorization-register), after readiness passes.

The selected ceiling is USD 5 of incremental campaign model charges, excluding
earlier account usage. This is not an account-wide cap or a forecast. All paid
requests, including any separately authorized repairs, must fit the same ledger.

#### Observed configuration and precise remaining blocker

Read-only Community MCP inspection on 2026-10-13 identifies workspace
`ffac910f-2786-490e-90d8-07243d49741b`, provider `langgenius/openai/openai`, and active
`gpt-6-luna`/`gpt-6-sol` model metadata. Installed model plugin:
`langgenius/openai:1.0.7@f36c3761167b3af0bfb4975b728fe3cd126342d076e1ec5359e6d4f92557d3d4`.
Its manifest exposes `max_tokens`, `reasoning_effort`, `reasoning_mode`,
`service_tier`, `enable_stream` and JSON-schema output. Provider configuration
exposes `api_protocol=responses`. These are available parameters, not proof of
the active request settings or a successful paid invocation.

The user reports the OpenAI key provisioned privately in Dify. No key value was
retrieved, copied or changed. The screenshot shows model-list read and text-request
permissions; it does not prove model entitlement, funding or end-to-end execution.
Credential inventory impact: reuse the existing Dify provider-key row in the
[inventory](../../deployment/contracts.md#dify-accounts-provider-bindings-and-developer-sessions);
no live name, storage, transfer or consumer changes occur. The installed opt-in correction adds conditional token counting through the same credential; inventory use metadata is updated. Permission/billing remains unverified and no count request was made.

`plugin.list` and `plugin.get` return manifests, not executable implementation.
The 2026-10-14 [exact-package audit](#exact-provider-package-audit---2026-10-14)
resolves source availability through the public marketplace package. The installed
plugin cannot yet satisfy the bounded execution/usage contract. Prepare the
correction below before integration; do not silently install it, copy a credential
into a direct HTTP node, or move provider execution into Booklet.

#### Exact provider package audit - 2026-10-14

The pinned Dify 1.17.1 [marketplace helper](https://github.com/langgenius/dify/blob/1.17.1/api/core/helper/marketplace.py)
defines the public package GET path `/api/v1/plugins/download-url` with the exact
`unique_identifier` query. Download of the installed 1.0.7 identity succeeded
without credentials. ZIP SHA-256 is
`ac6299b0f0cffa264acab719d78360b0a2bf63088979d2490bcbba5ffc7b4b94`.
Reproducing Dify's sorted path/content digest from
[checksum.go](https://github.com/langgenius/dify-plugin-daemon/blob/635d262e8e93e34ffb948573327d8486b97a11a3/pkg/plugin_packager/decoder/checksum.go)
produces `f36c3761167b3af0bfb4975b728fe3cd126342d076e1ec5359e6d4f92557d3d4`,
exactly the installed metadata checksum. This is content-identity verification;
no independent package-signature or live host-filesystem attestation is claimed.
The private ignored package and extracted sources remain under
`output/issue65-openai-plugin-audit/` and are not vendored into Git.

The [non-billable audit fixture](dify/m4-openai-provider-audit.py.txt) checks that
identity and loaded source bytes. It uses the package's selected versions:
OpenAI 3.26.0, Dify plugin SDK 0.10.2 and tiktoken 0.14.0, in an isolated Python
3.14 environment. Transitive dependencies were resolved locally, not asserted to
match the installed host. Real socket connections are forbidden; all SDK calls
use an in-memory mock transport and a dummy key. Eight cases passed.

| Verified finding | Consequence / minimum correction |
| --- | --- |
| `models/common_openai.py` supplies no SDK retry/timeout overrides. Selected SDK defaults are two retries and a 600-second read timeout. One mocked 429 produced three attempts. | An LLM-node retry toggle cannot bound SDK attempts. Use explicit `max_retries=0` and a per-invocation timeout no greater than 120 seconds or the remaining operation deadline. Mocked 429/500/timeout with those overrides each produced one attempt. This proves the SDK option, not an installed plugin correction. |
| `responses.parameters` maps `max_tokens` to `max_output_tokens`, effort/mode to `reasoning`, and JSON schema to `text.format`. Luna none/low and Sol low mappings passed. | Reuse these translations; capture the full request after the correction and confirm Standard tier, no tools and no history continuation. |
| `responses.usage` substitutes local counts when provider usage is absent, then passes them through the same calculation interface as reported counts. | Add explicit provenance and raw reported token details/request identity. Booklet must retain its maximum reservation when provider evidence is absent; never settle against this estimate. |
| `tokens.count_messages` describes its overhead as approximate and falls back to `o200k_base` for unknown models. | Do not use it as proof of a 32,000-token upper bound. Require a separately verified complete-request bound/counting path before admitting Balanced. |

**Prepared correction contract:** Prefer an opt-in change to this same provider,
with normal behavior preserved when the flag is absent. Add a model parameter for
Booklet bounded execution, disabled by default and supported only for Luna/Sol.
In that path reject streaming, tools, history continuation, unsupported tiers and
missing/invalid remaining-time policy before creating a client. Consume internal
policy parameters before the API call; set SDK retries to zero and cap timeout.
An SDK phase/read timeout is not a total wall-clock deadline. Keep the original
operation deadline authoritative for new admission and observation; test delayed
connect/read and late completion separately before claiming total-duration bounds.
Keep provider credentials in their existing binding. Emit trusted provider
evidence alongside creative content with explicit `provider_reported` or
`unavailable` usage provenance, response/request ID, model, tier, status and raw
token details. Preserve incomplete/refused content and evidence for inspection;
do not manufacture completion or usage. The workflow adapter must receive that
evidence through an actually exposed LLM-node output, not assume an opaque SDK
field survives Dify. Its exact wire shape and Dify compatibility are part of the
later integration contract and must pass the changed-path rehearsal.

No plugin correction, installation or credential change occurred during this audit.
Before installing a reviewed candidate, verify the supported package-install path,
signature policy, credential retention, all workspace consumers and absence of
active/uncertain work. Do not weaken signature policy or replace another consumer's
provider silently. If opt-in installation cannot preserve those boundaries, report
that concrete incompatibility and request a bounded integration decision with the
reviewed package/diff; do not introduce a new credential path by default.

#### Local bounded-provider correction candidate - 2026-10-14

The subsequent user instruction authorizes continuing the non-billable correction
work. The [candidate module](dify/m4-openai-bounded.py),
[opt-in provider patch](dify/m4-openai-bounded.patch) and
[focused candidate tests](dify/m4-openai-bounded-tests.py) define the current local
provider candidate. The installed `1.0.7-dev1` package described below predates the
request-digest guard added to these sources. The candidate is unsigned; existing workflow routes retain false/absent
opt-in behavior. No Balanced workflow or paid execution is enabled. After checking the
original content identity, normalize affected text and patch line endings to LF,
apply the zero-context patch with `git apply --unidiff-zero` to the exact audited
source and copy the module to `models/llm/booklet_bounded.py`;
the unchanged source package remains retained separately. Do not install these
artifacts directly as an official signed upstream release.

The module validates explicit Luna/Sol, effort, schema, Standard tier, text-only
context and a remaining timeout before creating a zero-retry client. It rejects
streaming, tools, stop sequences, conversation replay and unsupported parameters.
The boolean `booklet_bounded_execution` defaults false; the original route is
preserved when absent/false. Only Luna/Sol model parameter catalogs add that flag
and `booklet_timeout_seconds`; the local candidate also adds
`booklet_request_digest`. No provider credential schema changes.

Before its single generation request the candidate calls
`responses.input_tokens.count` on the same input, reasoning and text/schema fields,
including framing. OpenAI's [token-count contract](https://developers.openai.com/api/docs/guides/token-counting)
describes that complete count. It blocks above 32,000 or on a failed count, then
reduces the generation timeout by elapsed counting time. Neither request retries.
This adds one non-generating count request per invocation; it must be tracked
separately from the at-most-500 generation allowance. The documentation consulted
does not establish count-endpoint billing or this key's permission. The later
[current implementation record](#non-billable-application-foundation---2026-10-14)
records the disclosed experiment assumption and first-invocation permission gate.
Include any attributable charge in the same USD 5 ledger. The USD 4.509472
generation-only bound must not silently absorb an unknown fee.

The exact count currently occurs after application reservation but before model
generation. A failed count leaves the original counted reservation for recovery;
it grants no replay. The earlier pre-claim preparation projection remains necessary
for current source/request identity, but the implementation must not claim a
provider-verified count before the actual counting step. Its full-payload digest
includes model, inputs and output/schema policy. The local candidate requires
`booklet_request_digest` and compares it before client creation, counting or
generation. It owns a serialized snapshot and isolates counting from generation
so later caller mutations cannot change the admitted payload. Canonical bytes use
Python JSON with sorted keys, compact separators, UTF-8, unescaped Unicode and
finite numeric values only. Integration must prepare these exact bytes; do not
assume a different language's key ordering or number serialization is equivalent.

**Remaining readiness gate:** Booklet must supply the digest through the protected
operation context, bound to the prepared request and admission. A workflow-supplied
self-calculated digest alone does not establish authorization. Completion must also
match the digest. The installed package lacks this enforcement; deliver the reviewed
candidate with the later integration rather than reopen signature policy now.

Provider evidence travels in the LLM's text as JSON with
`schemaVersion=booklet_provider_v1`, `content` (original creative string) and
`providerEvidence`. Evidence has provider response/request IDs, model, tier,
status, explicit refusal flag, safe incomplete reason, request digest, counted input
and raw input/output/cache/reasoning counts. Downstream validation must reject a
refusal even when status is completed and the refusal text resembles valid JSON.
Usage provenance is `provider_reported` only when both total counts are valid;
otherwise it is `unavailable`, with no estimate substituted. The Dify node's
generic empty usage object in that case is not payable-usage evidence. Booklet
must use the provenance field and retain its maximum reservation. Incomplete and
refused results retain evidence for validation/inspection rather than triggering
another provider request.

Dify 1.17.1 pins Graphon 0.7.0. Its official wheel SHA-256
`6f7608aaaa65607c4935735137ed4b7029b1e6ca80202cbe829af3370cf4404e`
was inspected without installing it. The LLM node exposes `text`; its separated
reasoning filter removes inline `<think>` blocks without parsing JSON. The
candidate escapes angle brackets in the outer JSON so decoding restores original
content. A test executes the wheel's actual separated reasoning filter and proves
that content and provider evidence survive. This is a source/local boundary proof,
not a live published-node rehearsal. Configure Dify node-level structured-output
postprocessing off for this wrapper; the provider request still uses its strict
creative-output schema, and the trusted downstream code parses the outer wrapper.

Fifteen socket-denied cases passed for the installed package: count equality at 32,000, rejection at
32,001, one attempt each for count/generation 429/500/timeout, timeout expiry after
count, policy/history/stream and non-strict schema rejection, missing usage, incomplete/refused output,
actual opt-in routing, false opt-in compatibility, SDK model-catalog validation and
the Graphon text boundary and both package-version validators. The patch was replayed against an untouched source copy
after normalizing the three affected text files and the patch to LF; original
package bytes remain retained. Existing eight audit
cases remain unchanged. No paid request was made; live provider delivery is
recorded below.

**Local request-digest follow-up:** Eighteen socket-denied cases pass against a
separate patched source copy. They retain the fifteen installed-package checks and
add rejection of missing/invalid/mismatched digests, prompt/schema/output-policy
drift before any client/request, and mutation isolation after admission. The patch
replays against the audited original source. No new package was built or installed.
This changes no credential storage, transfer or consumer; the existing conditional
provider use remains unchanged. Application integration is still pending.

**Selected delivery path - 2026-10-14:** The user prefers the existing OpenAI
plugin and permits an experiment signature exception where signing adds work.
The HTTP-node alternative is not selected. Reuse the stored provider credential;
no new signing key or OpenAI credential transfer is introduced.

The complete local package is `output/issue65-openai-plugin-audit/openai-1.0.7-dev1.difypkg`
(487,180 bytes), SHA-256 `7da1e41e8a3c481aa803bd6a3946da19d23f93de6726105277451ab53e17867a`.
Its Dify identifier is
`langgenius/openai:1.0.7-dev1@da51ec682f9505bb0dbd3f6caa8f3e0980ac1761c70b014a1eeda82f0ccec74f`.
It retains all original assets and 93 unchanged original files. Changes are the
three patched sources and the manifest's explicit local version, plus the new
adapter. Original verification metadata and ZIP signature are removed, not copied.
The package stays ignored; all fifteen focused cases pass against its extracted
bytes. It is not an official vendor release. Installation is verified below.

The prior `1.0.7-m4r1` package remains retained unchanged. Its upload failed before
Install became enabled: the API could not parse `PluginDecodeResponse`. The daemon
version regex accepts that suffix, but the pinned API's
[second version validator](https://github.com/langgenius/dify/blob/8387590ace4a094de812b7847fc6a4c3a27cd52b/api/core/plugin/entities/plugin.py#L115)
rejects it through `packaging.version.Version`. A regression executes that actual
method and reproduces the rejection; `1.0.7-dev1` passes both validators. Only the
manifest version differs between these two packages. This explains the observed
error without claiming a live API-log attestation. Before replacement, the original 1.0.7 manifest remained readable and its
installation identity was unchanged. Failed
upload can retain a cached package; no cleanup or replay of that upload occurred.
The exact API source fixture stays ignored at
`output/issue65-openai-plugin-audit/dify-1.17.1-plugin-entity.py`, SHA-256
`f57e8f058bf733485ad02960e09bf72ff14572a25547c861c00abe378df39f84`.

**Delivery verified - 2026-10-14:** The user gave action-time approval for this exact
package. Dify displayed Installation successful; authenticated MCP readback confirms
the identifier above with `source=package`. The UI retains `API KEY 1`; no key value
was retrieved, copied or re-entered. Both observed Unibase drafts retain their exact
hashes and four GPT-4.1 mini bindings. Their workflows were not executed.

The operator opened the temporary signature window with a verified configuration
backup at `/var/lib/kids-booklet/issue65-m4-plugin-policy.RUZBmSux/runtime.env.before`.
After installation, the same reviewed procedure restored verification to `true`;
backup: `/var/lib/kids-booklet/issue65-m4-plugin-policy.wIr9ro9o/runtime.env.before`.
Operator readbacks report the pinned daemon running and other services unchanged.
After restoration, MCP still returns the installed identity and 56 model metadata
entries, including active Luna/Sol. This proves post-restoration availability, not
provider entitlement, request execution or billable usage. No paid calls were made.

Pinned [single-package upload](https://github.com/langgenius/dify-plugin-daemon/blob/635d262e8e93e34ffb948573327d8486b97a11a3/internal/service/plugin_decoder.go#L57)
supports `FORCE_VERIFYING_SIGNATURE=false`. Leave Langgenius-specific and third-party
verification settings unchanged; do not use bundle installation. This flag affects
Community plugin uploads across the instance, not only Booklet. Temporarily disable
it for this exact reviewed upload, then restore `true`. Existing local runtime
[startup](https://github.com/langgenius/dify-plugin-daemon/blob/635d262e8e93e34ffb948573327d8486b97a11a3/internal/core/control_panel/builder.go#L29)
does not re-enforce the upload flag. Post-restoration installed identity and model
metadata are now verified above; no additional restart campaign is needed.
Do not add restart tests; ordinary service readback after configuration apply is
sufficient. Later re-upload again needs an explicit bounded exception.

The [local installer](https://github.com/langgenius/dify/blob/8387590ace4a094de812b7847fc6a4c3a27cd52b/web/app/components/plugins/install-plugin/install-from-local-package/steps/install.tsx#L71)
removes the old installation with `preserveCredentials:true`, then installs the
candidate. This is not atomic. Retain the original signed package and privately
back up affected configuration before replacement. Two observed Unibase drafts
also use this provider; all consumers briefly lose it during replacement, then use
the new package with the unchanged false/absent route. Read back their bindings
and retained credential presence without generating requests. Require installed
`source=package`; pinned automatic-upgrade selection includes only Marketplace
installations, so preserve the current LATEST policy. On uncertain failure,
inspect the installation task before any further action; do not replay or remove
credentials. Do not call successful credential retention verified until read back.

**Delivery checkpoint complete:** The restricted dispatcher had no signature-policy
action, so the operator executed the reviewed one-time procedure. It added no
permanent host action or entrypoint. Browser installation received the required
confirmation. Signature verification is restored; no manual delivery step remains.
Future re-upload needs another bounded exception. Request-digest enforcement before
count/generation, count permission/billing, Balanced routing/callback integration
and atomic campaign accounting remain paid-readiness gates. Paid execution is not
authorized by this delivery.

#### Selected provider request contract

Use one Dify LLM node through the existing OpenAI provider's Responses path per
authorized text invocation. Set `api_protocol=responses`, `service_tier=default`,
`reasoning_mode=standard`, `enable_stream=false`, and the table's explicit effort.
The outgoing API request must contain `max_output_tokens` (mapped from the plugin's
`max_tokens`) and `reasoning.effort`, a task-specific structured output schema,
no tools, no prior-response/conversation continuation and no automatic truncation.
The official [reasoning contract](https://developers.openai.com/api/docs/guides/reasoning)
includes reasoning tokens in `max_output_tokens`; reaching that limit can produce
an incomplete response with no visible output. Keep that failure and its charge.

Prepare the exact role prompt, schema and selected context before authorization;
count all serialized provider input, including system instructions/schema overhead.
Require a verified model tokenizer or provider-supported non-generating counter;
block if its upper bound cannot establish the 32,000 ceiling. Persist a request
fingerprint and reject any difference between prepared and executed input. Dify
owns role prompts and creative output; Booklet owns state, approvals and admission.
Retain the existing operation deadline; provider timeout is at most 120 seconds
and at most the remaining deadline. Disable node retries and verify SDK retries
are zero. A timeout or lost response is inspected, never automatically replayed.

#### Incremental implementation slices

1. **Manifest and mode contracts (AC01-AC03, AC08, AC13).** Extend existing binding
   configuration with a versioned non-secret execution policy. Save that policy
   separately from the historical `configurationJson` array; preserve old hashes.
   Pin provider/plugin checksum, models, reasoning, API/token parameters, prices,
   timeout/retry policy, prompt/schema/request fingerprints and publication IDs.
   Add optional policy/campaign references to new run and operation records;
   require them for Balanced, leave historical records unchanged. UI and CLI expose
   Balanced only when readiness is verified; server independently enforces it.
   Keep Real and production rejected. Propagate mode through dispatch, context,
   narrative/reference/page paths and callbacks; Balanced images use fixture bytes.
2. **Campaign admission (AC08, AC13).** Add one campaign document in the existing
   MongoDB database, with immutable policy hash, explicit grant reference, three
   persona slots, request/judge counters, integer USD microdollar totals, revision
   and active/stopped/completed state. Create it only from reviewed protected
   server configuration after the later execution grant; no budget-edit public API.
   Extend run creation with optional `campaignId`, required for Balanced. Atomically
   claim the unique persona slot; concurrent creates cannot start a second run.
   Parent requires Kid generation/evaluation success; Creator requires Parent.
3. **Atomic monetary reservation (AC08, AC13).** Extend the existing operation
   claim transaction to update operation, run and campaign together. Enforce
   Pause/Stop, deadline, publication/policy/request identity, current sources,
   persona order, per-run/500-request limits and at most three judge requests
   (one per run). Store each operation's maximum reservation in integer
   microdollars. Admit only when settled charges plus unresolved reservations
   plus the new maximum do not exceed 5,000,000 microdollars. Concurrent claims
   contend on the campaign revision. Duplicates return the prior claim and cannot
   invoke the provider again. Count requests permanently, including failures.
4. **Completion and usage (AC05-AC08, AC10-AC13).** Extend existing result callbacks
   additively for Balanced with provider response/request identity, requested and
   returned model/service tier, input/output/cached/reasoning counts and usage
   provenance. Bind evidence to operation, workflow execution and policy; reconcile
   it with authenticated Dify execution metadata. Persist usage even when content
   validation fails. Settle once when usage is attributable and consistent; otherwise
   retain the full reservation and mark cost unavailable. Store provider-reported
   cost separately from price-derived cost; never label an estimate as invoiced cost.
   A conflicting or over-limit result blocks further campaign admission. Late
   valid completion can settle the original operation without a new request.
5. **Workflow delivery and experience (AC01-AC03, AC05-AC13).** Keep the deterministic
   branch and existing result envelopes; add only the bounded text branch and usage
   fields. Do not consolidate roles. Reuse normal grants, Creator explicit approvals,
   image/reference journals and materialization. UI/CLI show campaign remaining
   allowance, settled/reserved charges and unavailable usage. Reports retain source
   versions and independent judge identity, and label images synthetic. A malformed,
   refused or incomplete provider result blocks with its retained evidence; no
   automatic repair loop. Explicit future repair requires an additional grant,
   a new counted operation and remaining campaign limits, never a counter reset.

Build slices 1-4 with fake providers before any live graph mutation. Slice 5 needs
later implementation authorization and the provider-correction verification gate above. Public
route paths stay unchanged; only optional fields are added for new Balanced records.
No historical migration/backfill, new service or credential is required by this plan.
Update architecture and credential inventory when later verified implementation
changes their boundaries; do not describe planned behavior as deployed today.

#### Non-billable application foundation - 2026-10-14

The latest operator continuation authorizes the accepted non-billable application
slices. The [policy contract](../../../lib/experiment-runner/m4-policy.ts) freezes
the selected model/effort/token/retry/price limits, eighteen publications, plugin
identity and request-definition hash. Counting requires an explicit charge
ceiling/reference and a verified/assumed status; absent fee evidence cannot become a zero default. These are
frozen planning inputs, not fresh live price or permission verification.

The [campaign ledger](../../../db/experiment-campaign.ts) uses the existing MongoDB
database and caller-owned transactions. New Balanced runs require a protected
policy and explicit grant reference injected into the repository; no route or
environment reader supplies these yet. Run creation atomically saves a separate
policy snapshot, claims one initial persona slot and checks predecessor persona
success. Historical configuration arrays/hashes remain unchanged; no backfill runs.
The new `experiment_campaigns` collection uses its standard unique `_id`; existing
additive initialization owns its creation. No live initialization occurred.

Ledger primitives atomically reserve each operation maximum against the USD 5,
500-request, persona and judge ceilings. Duplicate reservations reuse the original.
Failures/uncertainty retain the maximum; no release API exists. Attributable
settlement is idempotent, retains charges above the reservation, and stops admission
on excess or conflicting evidence. Its evidence is an internal trusted input;
authenticated provider attribution and token-based charge calculation must be
implemented before callbacks can call it. The protected text-claim integration
described below connects these primitives to operation/run writes. All public
Balanced routes remain closed; Real remains rejected. The internal execution seam
is available only to focused fake-provider tests.

Focused evidence: three policy units, seven real-persistence ledger cases and
eleven existing repository/HTTP cases pass. Coverage includes duplicate/concurrent
reservation and settlement, exactly USD 5/one microdollar above, shared-cap overlap,
transaction rollback, exhausted requests/judges, Pause/deadline, slot ordering,
conflicting evidence and preserved historical configuration. No providers execute.
Full prepared-source/approval checks, callbacks, mode propagation, reports and
workflow rehearsal remain pending. Existing runtime evidence outside this surface
is reused. Credential inventory impact: no names, storage, transfer or consumers
change; no live policy, grant or campaign has been provisioned.

The next request-definition bundle must be reviewed once and consumed by both Dify
graph generation and protected Booklet preparation. It must contain the Dify-owned
prompt, task-specific strict output schema, role projection and rendering version.
Current deterministic fixtures are examples, not real-text prompts. Prove byte
parity with the adapter's Python JSON encoding before claim integration; do not
substitute the scheduling fingerprint or a workflow's self-calculated digest.

**Current implementation record — 2026-10-14:** The documentation MCP restart is
complete. Official [token-count guidance](https://developers.openai.com/api/docs/guides/token-counting),
[structured-output guidance](https://developers.openai.com/api/docs/guides/structured-outputs),
[reasoning guidance](https://developers.openai.com/api/docs/guides/reasoning) and
[pricing](https://developers.openai.com/api/docs/pricing) were checked. They support
the selected request/schema contract but do not establish the count endpoint's
fee, failed-request billing or exact restricted-key permission. The user asked to
proceed with available documentation instead of a support handoff. No account
verification or paid request occurred.

The proposed experiment manifest reserves **900 microdollars (USD 0.0009) per
count**, explicitly marked `assumed`. This allowance is a planning assumption,
not a documented price or an invoice guarantee. It stays reserved after model
usage settles. The final spending request must disclose this uncertainty and
obtain acceptance before execution. Count permission will be checked by the first
authorized Kid invocation, without a separate probe or automatic retry. A denied
count prevents generation and stops the campaign for inspection.

The local [request bundle](../../../lib/experiment-runner/m4-request.ts) defines
48 role/task/persona/report variants. It retains all roles and uses exact saved
context strings, strict output schemas and protected eligible identities. Its
integer-only wire encoding matches Python canonical JSON; fractional context
values remain inside the exact context string. A socket-denied translation fixture
compares Node requests with the audited provider's actual parameter/message
translation. The bounded adapter pins the global OpenAI endpoint, so regional or
environment endpoint overrides cannot silently change the price basis.

[Preparation](../../../db/experiment-text-preparation.ts) takes a read-only role
projection before dispatch, saves exact request bytes/digest and binds them to
current sources, approvals, policy, publication and manager parent. It makes no
reservation. Unchanged preparation is reused; changed sources are rejected without
replay. The internal text claim rechecks currentness, Pause/Stop/deadline/drain,
then commits operation, run and campaign reservations together. Exhausted campaign
allowances block the run and stop campaign admission without a partial reservation.
Duplicate authorization admits one action.

Report preparation uses a separate read-only generation-verification phase. It
requires the current unreserved, undispatched report operation, original deadline,
retained Balanced policy/bindings, matching operation modes, exact approvals and
lineage, and original asset bytes. Tester precedes judge. Each preparation attempt
independently reads the nine fixture assets; no byte cache crosses requests.
Simulated report lifecycle checks remain unchanged. Balanced assembly mutations
and final completion were closed in that published slice. The current candidate
below adds the image/accounting integration.

[Creative output assembly](../../../lib/experiment-runner/m4-output.ts) restores
workflow-owned identities, exact approved sheet facts, style hashes and report
identity/evidence fields from the saved context. It does not authorize completion
or release money. Reports remain text-only with visual consistency unassessed.
The owning completion services must still verify approvals, source lineage and
bytes. The local provider-evidence assessor checks request/model/tier identity,
token ceilings and usage consistency independently of creative parsing. It
allocates model charges at frozen upper rates, not invoice prices. Incomplete or
refused output retains attributable usage and cannot materialize. Missing usage or
attribution retains the maximum. Authenticated readback/persistence/settlement integration,
callback wiring, Balanced image routing,
workflow generation and public configuration/UI/CLI remain separate unfinished
readiness gates. The installed plugin predates these local digest/endpoint changes;
do not infer live delivery from local validation.

Focused local verification for this slice: 23 policy/request/choice/output/usage
units; 25 campaign, preparation and context integration cases; one full synthetic
Balanced report-preparation case and two existing Simulated report lifecycle/order
cases; 20 socket-denied provider cases; and 48 exact Node/Python request translations.
Typecheck, focused lint, agent fixtures, 77 local documentation links/anchors and
whitespace checks passed. These are non-billable fixtures, not M4 persona acceptance.

#### Current delivery record - 2026-10-15

**Current campaign result - 2026-10-16: STOPPED.** Kid run
`c79b63dd-6ebb-4c49-8be3-d0bb409ac49e`, booklet
`59318286-36f3-4be6-8264-8ef00423f3b3`, is `blocked/definite_failure`.
Seven text operations succeeded; the eighth failed. J01–J03 are saved and approved.
There are no generated images or final reports. Parent and Creator were not
submitted. All eight operations retain one reservation each, their lifecycles are
resolved, and the active-operation pointer is null. No paid replay, successor or
saved-output repair occurred. This result supersedes pending delivery/retry statements
below. The authorized initial Kid run is consumed; another paid attempt needs a
new explicit decision. Remaining allowance does not authorize another attempt.

Failed manager operation: `ac39211f-4e61-4c08-a3b6-81f922bf9be4`; Dify execution:
`0e1597d7-b917-4fd5-ae55-59e89bdbe206`. Its decoded request matches the provider
request digest and selects `gpt-6-luna`, reasoning `none`, strict JSON schema,
`max_output_tokens=2048` and disabled truncation. The provider returned
`status=incomplete`, `incompleteReason=max_output_tokens`, 2,900 input tokens,
2,048 output tokens and zero reasoning tokens. The content begins with a J04
routing decision, then contains invalid trailing output. Dify marked the outer
workflow succeeded; Booklet rejected the incomplete provider result and stopped
campaign admission. Model access and input-count permission worked for these eight
Luna calls; Sol access and count-endpoint invoice fees remain unverified.

| Measured Kid result | Value |
|---|---:|
| Text invocations / image invocations | 8 / 0 |
| Provider input / output tokens | 10,961 / 3,864 |
| Reasoning tokens (included in output) | 205 |
| Creation-to-block wall time | 167.865 s |
| Sum of operation elapsed times | 150.345 s |
| Sum of Dify workflow elapsed times | 75.231 s |
| Derived frozen-price model estimate | USD 0.003305 |
| Assumed count-fee allowance, eight times USD 0.0009 | USD 0.007200 |
| Combined conditional estimate/allowance | USD 0.010505 |
| Saved campaign remaining allowance | USD 4.989495 |

Monetary values are calculated from attributable provider usage and frozen prices,
with per-request microdollar rounding. Booklet's saved accounting readback matches:
campaign `stopped`, eight requests, 3,305 microdollars settled, 7,200 reserved and
4,989,495 remaining. These are upper-charge/allowance values, not an invoice. Count
fees remain an assumption and their liability stays reserved. No token, request or
dollar allowance was increased. Retained sanitized
evidence: `output/issue65-m4-kid-booklet-summary.json` and
`output/issue65-m4-kid-usage-evidence.json` contain identities, usage and timings,
without prompts, credential values or raw model content.

The preceding creation-order defect is corrected by PR #196 (`d2419c3`) and
selective staging PR #197 (`076db92`), each with two clean reviews and lean CI
`38946321320` / `38946333987`. Nineteen affected integration cases, seven units,
typecheck, focused lint and documentation checks passed; actual staging typecheck
and seven units passed. Staging release `810bb7d806a3f4a01ecc25a7c92b2fd9b83efc91`
uses image `ghcr.io/karpishe-experiments/agentic-poc@sha256:ff556a8adaf11770ed417a702a40321ee72c50e77020327ccb009167a039aff1`.
Deploy `38946688084` reached its client wait bound; original host request
`38946688084-1` completed/archived without replay, read back by `38948062986`.
Backup: `staging-20261016T182551Z-48675a61d6579613`; Check `38948198271` passed.
Fresh no-run readback and ready/idle preflight preceded the explicitly approved
same-key creation retry, which saved this one initial run. Complete binding entries
are now compared independently of order; historical serialization/hashes and
missing/duplicate/changed identity rejection remain intact. Policy, workflow
publications and credentials are unchanged. Failed creation evidence is retained
in `output/m4-creation-failure-reproduction.log`.

**Current authorization - 2026-10-16:** The user explicitly approved the three-run
campaign and required reviewed activation delivery, merging PR #193 at
`b2f63e3887accda3ffc7efec70e79b2d363cbc69`, and Booklet browser submission/monitoring.
PR #193 merged as `444950c9812aa685cf0c9d01e681a760d9d1fe10` after two clean reviews
and lean CI `38765776275`. Campaign `690b0237-9c0d-4eb2-99ec-edf02356b70a` records
this grant without changing policy hash
`b05ef70a81049a46bfb6fd456fc112fdc8bb61a3a79444ea0a145db37e57f1e3`.
Deliver the reviewed `granted` manifest before submitting Kid, then Parent, then
Creator, one initial run each, no successors. Request ceilings are 120/160/220,
500 total and three judges. The USD 5 incremental ceiling is conditional on frozen
prices and the assumed USD 0.0009 input-count fee per invocation; its actual fee
remains unverified. The first Kid invocation checks model access/count permission,
without an extra smoke allowance. Images stay simulated. No automatic retries,
tools or escalation are permitted. Stop the campaign on technical failure and
preserve all results, uncertain reservations and saved predecessors. No credential
storage or transfer changes are needed. This authorization supersedes pending-grant
statements below; it does not establish paid acceptance or live model reliability.

This current section supersedes earlier installation/publication pending statements.
The final application candidate `481ca7b900ca8a0c6d055b583e650e7f76fe6691`
passed two clean independent reviews and lean CI `38735679197` in PR #191,
merged to master as `9a2574d0811c90943120dcb0ea76171944961d14`.
Staging PR #192 carried the selective port at
`ab2df91e9a168c0bc923fae40dc9783362cc6a00`, with two clean independent reviews,
actual staging typecheck, seven focused configuration/policy units and lean CI
`38736888137`. Staging Cloud differences and the 53 unrelated unstaged deletions
were preserved. The user explicitly approved both exact merges and delivery.
OpenAI `1.0.7-dev2` is now installed in Community workspace
`ffac910f-2786-490e-90d8-07243d49741b`, from the reviewed package with SHA-256
`015884036390e78469e1190db677b3bd20bad957cfefde28c64b33356c28e15d`.
MCP readback identifies
`langgenius/openai:1.0.7-dev2@5a3107c1a2237e76ac04e09198a1fb1fbe446747d23ab4574f8c0aec914cfb3d`.
The operator restored signature verification to `true`; protected configuration
backup: `/var/lib/kids-booklet/issue65-m4-plugin-policy.kMgTf9MY/runtime.env.before`.
The existing provider credential remains present; its value was not retrieved.
The prior Unibase app IDs no longer resolve. Current Unibase app
`cf2b1066-319e-42c1-84bc-6bfc558d91e2` retains four `gpt-4.1-mini` binding nodes;
metadata readback is not an execution or unchanged-history proof.

All eighteen graphs passed server-aware validation, publication and semantic
readback against the reviewed UTF-8 source. App identities, existing variables
and features are preserved. Exact publication IDs and frozen model/token/price
policy are in the [ready manifest](../../../lib/experiment-runner/m4-campaign-manifest.json).
Manager publication: `64d08408-4ab7-4413-a5a1-0fccadd2ff26`.
Request bundle: `293dce288d003e7d65c7cced8d9c0becf5d74230495e46e6052f26d714fdcf5a`.
Policy hash: `b05ef70a81049a46bfb6fd456fc112fdc8bb61a3a79444ea0a145db37e57f1e3`.
No tool-provider synchronization is needed: the eighteen existing runtime bindings
have null tool-provider IDs. The eighteen reviewed publications are now active in staging.

The installed MCP bridge rejects graph saves because it replays an unsupported
legacy environment-variable field. The inspected CLI export/import fallback
preserved the existing variables. Private before/reviewed DSL copies remain under
`%LOCALAPPDATA%\DifyWf-Community-Codex\issue65-m4-before-publication-20261015`;
they contain existing Booklet callback variables, not the OpenAI provider key.
The user explicitly approved these protected copies after automatic review stopped
that transfer step. Never print or commit these files. Non-secret graph backups
and publication evidence are retained separately. No workflow execution occurred.

Release `e9881fa59088e49eddaf377a90a5cf991411e9a8` uses image
`ghcr.io/karpishe-experiments/agentic-poc@sha256:d07768bcdef219a223654d155164f60c0e8ff05337e2d631d61907aab7dd1763`.
Deploy `38758478279` reached its client wait limit during backup. The original
host request `38758478279-1` completed and was archived without stop or replay,
confirmed by read-only status `38760486852`. Retained deployment backup:
`staging-20261015T152033Z-9146c600793d6b6d`.
The reviewed protected helper preserved all eighteen keys and changed only
publication IDs in the existing Actions secret; it created no credential file.
Activation `38760684688` passed and retained the same image, with backup
`staging-20261015T152924Z-5b7ea79384c834e4`. Check deployment `38761539391` passed.
One authenticated read-only application preflight returned `ready=true`,
`callbackConfigured=true`, `idle=true` for the exact manager app/publication above.
The UI reports `ready`, which requires all eighteen runtime bindings to match the
frozen manifest. Balanced and Real creation remain unavailable. Workspace graph
readback establishes retained Dify variable presence; runtime preflight does not
independently attest their values. No acceptance run was submitted.

The post-publication rehearsal retrieved the exact manager, J01 and Kid tester
versions above and compared their graphs with reviewed source before executing
their Python decoder and conditional/end selectors. Actual Booklet HTTP
authorization, original saved-result GET observation, accounting and report
materialization passed against isolated MongoDB with scripted provider responses.
The existing offline generation fixture supplied valid report prerequisites;
no live persona campaign or provider request ran. The tester used its separate
report model/return branch. All original operation deadlines were preserved.
An additional synthetic payload exercised the exact 1,048,576-byte escaped HTTP
envelope and lossless graph carrier; it does not establish provider token capacity.
Ordinary affected integration cases, typecheck and focused lint also pass.
These are local graph-path measurements, not live Dify engine execution, staging
latency or evidence of model reliability. Balanced callbacks remain notification
hints; authenticated original GET owns results. Retained notification/failure,
provider retry and Graphon parameter checks remain applicable without another run.

| Local rehearsal path | Authorization bytes / ms | Result bytes / decode-return ms | Completion reconciliation ms |
|---|---:|---:|---:|
| Manager | 4,527 / 62 | 886 / 95 | 65 |
| J01 specialist | 4,540 / 35 | 1,939 / 84 | 75 |
| Final tester report | 172,818 / 51 | 1,575 / 97 | 346 |
| Synthetic envelope boundary | 1,048,576 / 164 | 33 / 130 | Not a completion fixture |

Original GET readback used the scripted in-process transport and rounded to 0 ms.
The 16 affected HTTP/dispatch cases and six graph units pass. Explicit local
publication mode also passes the two focused graph-path/payload cases. Retained
non-secret inputs/timings are under `output/issue65-m4-published-rehearsal.json`,
`output/issue65-m4-rehearsal-phases.json` and
`output/issue65-m4-rehearsal-payload.json`; these ignored local files contain no
credential, prompt or image contents in the timing records. The graph input
contains reviewed code only. No new credential storage or transfer is introduced
by the rehearsal tests.

Remaining execution gate: the explicit three-run paid grant, including the assumed
count charge and unresolved account entitlement/permission disclosure. The first
authorized Kid invocation checks model access and input-count permission; it does
not verify the count-fee assumption. No separate paid smoke call or successor is authorized.
`ready` supplies no authority and cannot admit Balanced execution. Seven focused
configuration/policy units pass, including the actual release manifest and drift
rejection. No paid call or live model reliability is inferred.

#### Local integration evidence - 2026-10-15

This section supersedes earlier pending statements for local implementation only.
Published commit `188fcc7ec974484ce1575a7247b1cd02a2a00db1` in PR #191 has two
clean reviews and successful lean CI `38583085271`. The integration candidate is
verified locally. Its publication requires two clean reviews and lean CI; exact
reviewed and CI identities are recorded in PR #191. Installation
and deployment are pending. M3 and the efficiency run
remain complete. No paid execution occurred or is authorized.

- The non-secret campaign manifest defaults to `disabled`. `ready` records a
  complete reviewed policy; only `granted` permits staging Balanced creation and
  dispatch. Public input cannot supply a campaign, policy, grant or successor.
  Simulated stays the default and Real remains rejected.
- Authorization verifies the original running Dify execution and saved publication
  before claim. The complete escaped response must fit Dify's 1 MiB HTTP text
  boundary before any reservation. It contains the exact prepared request, not a
  rebuilt UI context. Provider time excludes the original reconciliation reserve.
- The candidate graph carries exact request JSON in a plain user message. The
  adapter unwraps it before OpenAI and verifies canonical bytes, digest, static
  role/model/effort/output limits, global endpoint and original deadline. Graphon
  model parameters cannot carry the full schema because its variable resolver
  caps strings at 1,024 characters. Thirty-two named text chunks avoid Code array
  limits without bypassing the complete HTTP response cap. No Agent, memory,
  vision, paid tool, escalation or node retry is added.
- The pinned daemon retries local stdin acquisition/write failures. The selected
  SDK reader dispatches complete newline frames only. An opt-in runtime guard
  checks SDK 0.10.2 and its exact reader-source hash before creating a client.
  Source/local tests support this bounded path; they do not claim that every
  transport retry is disabled or prove live provider execution.
- Original authenticated GET results retain bounded provider content and usage
  before creative parsing. Balanced text result/failure callbacks only request
  observation. Known malformed/refused/incomplete results stop campaign admission;
  unknown usage retains the maximum. Inspection can recover the same valid result
  without another provider request. Pause stops new work; a valid admitted result
  can still settle. No automatic replay or reservation reset occurs.
- Balanced image work retains simulated bytes and existing reference ordering,
  current source/approval checks, upload journals, assembly, delegation provenance
  and Creator controls. Terminal exit reconciles run counters, reservations and
  campaign totals. Verified unclaimed Pause attempts remain preserved history,
  without becoming provider requests. Reports freeze an upper charge allocation
  through their own request; invoice cost remains unavailable. Inspection exposes
  campaign/run allowances and labels assumed count charges.

Focused offline evidence includes manager-to-specialist dispatch, duplicate
authorization, source drift, Pause/deadline gates, authenticated settlement,
malformed output, accounting corruption and three-reference uncertain uploads.
Provider tests deny sockets; image fixtures use isolated persistence and storage.
These prove local contracts, not paid model quality or live latency. Final review
and CI evidence will be attached to the exact published candidate.

Known failure closure uses retained authenticated evidence and settlement, even
when the Dify execution succeeded but its creative output is invalid. Repeated
Inspect and deadline Stop preserve closure, including unknown or failed GET
readback. Image failure callbacks, terminal conflicts, exhausted logical allowances
and preparation failure/Stop also stop the matching campaign atomically. Duplicate
failure preserves counters, reservations, assets and history. Forty-two focused
dispatch/failure cases pass after these corrections. Earlier combined validation
passed 77 integration cases and 94 affected units; unchanged evidence is reused.
No persona acceptance is inferred from these fixtures.

The full isolated Balanced Kid fixture passes through actual preparation, atomic
claims, fake authenticated Dify GET results, materialization and owning completion
verification. It completes J01-J13 with 39 text operations and nine simulated
images, four final pages, approved artifacts and two reports matching current
versions. All 48 operations succeed with one reservation each. Nine original 8x8
PNG assets pass digest/geometry readback. The tester's cost snapshot includes its
own request and stays byte-identical after the judge; final ledger totals reconcile.
The fixture uses fake usage and prices, not real provider requests or paid
acceptance. TypeScript and focused lint pass. Fifteen existing lifecycle cases
pass, and all eighteen candidate graphs prepare through the actual CLI with valid
edges; fourteen graph/CLI units pass. No workflow was published by these checks.

The complete ignored provider candidate is
`output/issue65-openai-plugin-audit/openai-1.0.7-dev2.difypkg`, 491,984 bytes,
SHA-256 `015884036390e78469e1190db677b3bd20bad957cfefde28c64b33356c28e15d`.
It preserves 93 original files. Only the manifest version, three patched sources
and bounded adapter differ from the audited original; original verification
metadata/signature are not copied. All 25 socket-denied provider cases and 48
exact Node/Python translations with fake carrier invocations pass against its
extracted bytes. The package is not uploaded or installed. Its Dify content
identifier remains pending daemon decode.

Remaining delivery gates: finish focused validation and two clean independent
reviews; package and install the reviewed provider update through a new bounded
signature window; prepare/publish/read back all eighteen graphs; selectively
deliver Booklet staging and its non-secret ready manifest; perform application
preflight. The installed dev1 predates the carrier, digest, endpoint and SDK guards.
No hidden paid smoke allowance is reserved. The final three-run grant must disclose
the assumed count fee and unresolved account entitlement/permission, checked by
the first authorized Kid invocation. Credential inventory impact: reuse existing
Dify-only OpenAI and existing Booklet callback/module keys; no new secret,
credential transfer, public route or permanent host action.

#### Price basis and bounded calculation

Official prices checked 2026-10-13, USD per million tokens:
[Luna](https://developers.openai.com/api/docs/models/gpt-6-luna) input 0.10,
cache-write 0.125, output 0.50;
[Sol](https://developers.openai.com/api/docs/models/gpt-6-sol) input 2.00,
cache-write 2.50, output 10.00. Reserve input at the higher cache-write rate;
ignore cache discounts. Standard processing only, no regional premium or paid tools.
If the effective price/tier differs, stop before execution and revise the manifest.

At 32,000 input and 8,192 output tokens, maximum reservations are USD 0.008096
per Luna request and USD 0.161920 per Sol request. The deliberately loose bound
`497 * 0.008096 + 3 * 0.161920 = 4.509472` rounds up to USD 4.51. It assumes at most
500 requests, at most three Sol judges, the stated complete input/output bounds,
no hidden requests and the verified price policy. Smaller decision outputs reduce
it. This is conditional planning arithmetic, not measured cost or implemented
enforcement. The independent USD 5 ledger remains mandatory; unknown charges
retain their maxima. No paid smoke call is outside this allowance.

With the explicitly unverified count allowance, the conservative planning total is
`4.509472 + 500 * 0.0009 = 4.959472`, leaving USD 0.040528 below the selected USD 5
ceiling. The USD 4.509472 figure covers generation under its stated assumptions;
it excludes unknown count charges. Neither figure proves an undocumented fee bound.
The ledger enforces its frozen reservations; it cannot enforce unknown invoice
charges. Keep the assumption and unsettled count allowance visible in results.

The user tightened the ceiling from USD 10 to USD 5 after the initial decision.
Do not use planning headroom to
increase tokens, add retries or relax price verification. Recompute reservations
before approval if any premise changes; stop rather than silently reduce required
content or increase spending.

#### Failure-prevention gaps from M3 and the Balanced transition

These checks refine the existing slices; they are not another campaign. M3 proves
deterministic completion, not that real models will follow every contract. Use
the saved Kid/Parent/Creator artifacts as offline inputs without rewriting them.

| Gap and evidence | Required prevention before the first paid run |
| --- | --- |
| **Fixtures hide real-output variation.** Current result contracts contain unions, task-specific content and strict IDs; valid JSON alone is insufficient. M3 already exposed a J13 acknowledgement schema mismatch after a successful save. | Derive each provider output schema from the relevant task contract, including report and clarification variants. Supply exact eligible targets/current version IDs as allowed choices. Construct run/operation/workflow IDs, fingerprints, lineage and usage in trusted workflow code, never ask the model to invent them. Parse through the actual HTTP callback and owning service, testing first and duplicate completion. Reject unsupported structured-output schema features in a non-billable adapter check before publication. |
| **Preparation currently depends on authorization.** `getOperationContext` requires a started/unknown active claim, while the selected request contract requires exact input preparation before that claim. | Add an internal read-only preparation projection for the already prepared operation. It must not reserve or return permission to execute. Store the request fingerprint against the run revision and exact source versions; the normal claim rechecks these and admits only that prepared request. Keep the existing claimed-context route protected. Test a source/approval change between prepare and claim. |
| **Context and output ceilings can fail late.** Current report context includes artifact content, creator messages and operation history. Creator is larger than Kid; low reasoning can also consume the output allowance before JSON finishes. | Render/count the exact prompts and schemas offline for all distinct task shapes and the largest retained Creator report. Keep required content and current evidence; omit unrelated historical content using explicit role projections. Reject overflow before dispatch. Include a maximum-size valid output and an incomplete/refusal fixture per structurally different output family. Complete-request token bounds and task-specific schema compatibility remain readiness gates. Fake tests do not establish real model reliability; do not raise ceilings automatically. |
| **Successful provider output can precede failed saving or acknowledgement.** M3 retained callback timeout, publication/readback and terminal-job defects. | Prove save-before-ack recovery and authenticated original-result retrieval for the new text/usage envelope. Observe the same execution after timeout. Never re-invoke the model to recover a saved result or repair bookkeeping. Preserve complete generation when reports fail; retain valid output and settle attributable usage independently of report/content validation. |
| **New campaign writes can recreate transaction contention.** Parent attempt 2 timed out during authorization after observation writes retried its transaction. | Keep network calls, tokenization and context construction outside the atomic claim. The transaction contains only currentness/allowance checks and owned writes. Keep existing authorization leases and observation suppression. Add one focused overlap case using the campaign document, not a load/restart campaign. Account for preparation, provider and callback time within the original deadline; check the minimum timeout across the whole path. |
| **Persona decisions can consume attempts without technical progress.** Deterministic testers follow a fixed happy path; real testers may repeatedly revise, ask or delegate beyond their scope. | Keep the existing revision/no-progress limits, eligible action list and delegation provenance authoritative. Prompts must distinguish technical missing output from advisory creative preferences. Test a repeated question, exhausted revision allowance and narrowed Creator grant using scripted responses. No new scoring loop or automatic repair invocation. |
| **Metadata does not prove a bounded paid request.** Active models and plugin manifests do not prove SDK retries, exact parameter mapping, reachable branches, account entitlement or usage persistence. | Before the paid grant, reuse the completed exact-source audit, then verify the corrected captured-request adapter already required above. Check all eighteen published bindings against the policy, including final tester/judge routes. Keep provider credentials private. If account entitlement cannot be established without generation, label it unverified until the first authorized Kid request; do not consume an undisclosed paid probe. |

Evidence: [M3 Parent authorization failure](M3-completion.md#parent-attempt-2-and-authorization-coordination--2026-10-11),
[retained callback/job/acknowledgement lessons](LESSONS-LEARNED.md#completion-acknowledgements-must-cover-every-admitted-task),
[claimed context](../../../lib/experiment-runner/context.ts),
[result contracts](../../../lib/contracts/experiment-runner.ts).

**Attempt policy:** Stop new campaign admission on a technical failure, retain its
run and reservation evidence, and inspect before changing anything. Inspection or
idempotent saving of the same valid result consumes no new provider request. Resume
that same run only if inspection proves the failure was an observation/acknowledgement
problem and current policy still matches. A prompt/schema/config repair that needs a
new provider action is outside the three-initial-run/no-successor grant until a
separate finite repair decision. Do not automatically restart Kid or proceed to the
next persona. Group related causes into one correction package and one affected
verification pass; retain the repository's repeated-blocking-review stop rule.

**Minimum rehearsal:** In the changed text-node adapter, replace only the provider
transport with scripted non-billable responses. Exercise the actual new request,
result parsing, usage and authenticated GET-result path; the unchanged deterministic branch alone
is insufficient. Cover one normal manager-to-specialist handoff, final report and
largest valid payload through the HTTP boundary, plus the failure cases above.
After reviewed publication in the later implementation task, exercise the changed
selectors and separate report-return route once with the same provider-shaped fake
response path and real Booklet persistence, with provider execution disabled.
Verify non-empty authorization/result bodies and the active publication identity. This bounded
graph-path check must execute zero provider requests and consume no paid allowance.
Reuse all unchanged persona/image evidence. Measure result observation and authorization
phases for that payload so configured timeouts cover the application work without
extending original operation deadlines. This is a focused integration rehearsal,
not a new live persona campaign or a reliability claim about real model outputs.

#### Focused acceptance and handoff

Use named tests in the existing config/contracts, repository, dispatch, context,
reference-upload, report and UI/CLI suites. Add only necessary persistence cases:
concurrent claims at the dollar/request boundary; duplicate create/authorize/result;
one reservation before one provider action; Pause/Stop/deadline/source changes;
input/output exhaustion; absent/conflicting/late usage; malformed/refused output;
loss after provider execution; judge failure retaining generation; and zero real
image calls through Balanced J13. Test exactly 5,000,000 microdollars and one above,
microdollar rounding, three-judge maximum, changed policy/publication and old records.
Use one non-billable Dify-provider adapter fixture to capture outgoing Responses
parameters and count network attempts on timeout/429/5xx; a node toggle is not proof.
Token accounting includes schema overhead and reasoning; completion does not release
uncertain reservations. Preserve all M3 personas and the efficiency baseline.

Finish affected units/integration, typecheck, focused lint, agent fixtures, local
links and a fake-provider UI/CLI journey; reuse unrelated passes. Obtain two clean
independent reviews and lean CI, then use the existing selective staging process.
Read back exact publications, policy and release identity without executing a paid
preflight. Present the frozen manifest, remaining technical gaps (none required for
execution), USD 5 ledger proof and three-run allowance for the final explicit paid
grant. Stop here until that grant; this document does not mark M4 ready or complete.

### Minimum implementation changes for a later task

| Boundary | Current restriction or gap | Minimum change and protected behavior |
| --- | --- | --- |
| Admission, UI and CLI | `http.ts` rejects non-Simulated create/tool calls; `dispatch.ts` and `transport.ts` reject or send only Simulated; `scripts/experiment-runner.ts` fixes request/response mode. | Add explicit Balanced admission and mode propagation through these existing surfaces. Keep Real unavailable, production rejected and saved Simulated runs readable. Require the approved configuration before any claim. |
| Dify roles | Current published manager, specialists, testers and judge use deterministic Code fixtures and reject non-Simulated mode. | Keep the fixture branch. Add one bounded text-provider request per eligible role invocation, using the existing saved-context and result envelope. Booklet continues to validate tasks, source ownership and approvals; Dify owns instructions and creative output. No opaque Agent loop. |
| Image path and callbacks | `db/experiment-images.ts`, style/sheet/page assembly, reference uploads, page batches, J13 authorization, narrative routing and completion contain Simulated-only checks. `context.ts` fixes image/report context to Simulated. | Distinguish run mode from provider kind consistently: Balanced images remain synthetic. Extend existing authorization, context, storage, assembly and completion guards only for that route. Preserve exact references, native lettering, digests, callback claims, original deadlines and terminal bookkeeping. No real-image provider branch is reachable. |
| Configuration evidence | Saved configuration hash pins app/publication identities, but not a complete effective provider/model/token/retry policy. | Freeze a non-secret per-role manifest with publication, provider/model ID, token parameter/ceiling, context ceiling, timeout, retry policy and number of provider nodes. Read back the published graph and compare it before admission. Version the evidence without rewriting historical snapshots; choose the smallest compatible persistence change during implementation. |
| Reservations and usage | Repository already makes Balanced text payable and Balanced images non-payable, but reserves once per operation. Transport does not retain attributable provider token/cost usage. | Permit at most one generation and one separately recorded input-count request per reserved text invocation. Reserve before both requests; include any count fee, failed/uncertain requests and explicit repairs. Persist provider request identity, input/output tokens and actual or unavailable cost separately from the reservation. Never treat missing usage as zero or refund uncertainty. If this two-request maximum and fee bound cannot be proved, block paid readiness; do not hide additional calls inside one invocation. |
| Reports | Report schema already accepts modes and checks current version/asset ownership; current report producers are deterministic and context fixes Simulated. | Pass actual run mode and make tester/judge text-backed under Balanced. Preserve independent judge identity and advisory findings. Label image findings as based on synthetic images; retain unavailable/estimated cost explicitly. No scoring framework. |

These are application/workflow changes for a later implementation task. No
runtime API, persisted schema, Dify publication or credential changes occur in
this readiness-planning revision. Reuse existing credentials only if verified
sufficient; otherwise consolidate the missing private provider binding into one
handoff. Do not create it under this task.

### Evidence reuse and focused gaps

| Requirement | Reuse | Check only uncovered or changed behavior later |
| --- | --- | --- |
| Full persona outputs and approval behavior | Three M3 completions; Parent delegated approvals; Creator's 31 explicit approvals; required 3/5/8-page layouts, sources and assets. | Focused mode/routing fixtures for each persona. The inspect/revise/narrow-grant scenario below still needs its own evidence where not already covered; do not rerun unchanged full Simulated personas. |
| Reservation, duplicate/stale callbacks, deadlines and uncertain outcomes | Existing focused repository/dispatch/completion tests, retained delayed recovery and resolved stopped probe. | One representative fake-provider case for changed Balanced authorization, duplicate/lost callback and late completion; assert retained ledger and output. No forced restart. |
| Assets, references and reports | M3 stored-byte completion checks, ordered J13 references, separate matching tester/judge reports, advisory geometry warnings. | Balanced run mode with synthetic images through source upload, storage and final verification; report mode and attributable usage. No real-image test. |
| Bounds and internal calls | Existing 120/160/220 logical ceilings and per-operation reservation tests. | Fake provider proves one reservation precedes the count and at most one generation, exhaustion blocks both requests, count fees and explicit repairs are covered, no hidden retry/subcall exists and Real/image-provider branches cannot execute. |
| Published provider configuration | M3 publication readback proves deterministic graphs only. | Read-only exact model/token/retry manifest and reachable-branch audit. A node toggle alone does not prove provider SDK/plugin retry behavior. |

Select named affected unit/contract tests and the minimum persistence integration
case for each changed boundary. Add one non-billable fake-provider end-to-end case
only where unit/integration evidence does not cover the actual route. Do not add
a broad suite or infrastructure campaign. Reuse unrelated passes; two clean
independent reviews, lean CI and the existing staging process apply to the later
implementation candidate.

### Token controls and later spending checkpoint

Apply the [selected policy](#selected-policy-and-implementation-contract---2026-10-13).
The model and token choices are settled; their live enforcement is not verified.
Preserve exact lettering and required references; fail visibly rather than silently
truncating them. Verify model-specific parameters before paid readiness.

Automatic provider, SDK/plugin, node and transport retries must be disabled and
verified. An explicit correction is a new attributable request within the same
run allowance; an uncertain request is inspected, never automatically replayed.
Provider reservations must cover every paid call, including report/repair calls.

After non-billable implementation/readiness passes, present the frozen manifest
and final execution request: Kid → Parent → Creator, three initial runs, zero
successors, ceilings 120/160/220 text requests, at most 500 total and three judge
requests, zero real images and the selected USD 5 ceiling. Include the verified
per-role token limits and price calculation, then obtain explicit approval before execution.
Any successor requires its own finite allowance and additional worst-case bound.
This plan grants no spending and does not mark M4 complete.

## Three execution checkpoints

| Checkpoint | Work | Exit |
| --- | --- | --- |
| 1. Close readiness gaps | Reuse valid M3 simulation, recovery and browser evidence. Test uncovered scenarios and changed paths. Verify real-text routing, simulated-image routing, model/token settings, disabled automatic provider retries and reservations covering all internal calls. Consolidate missing credentials and campaign authorization into one handoff. | Required simulated scenarios have evidence; published configuration and accounting are verified; campaign authorization is recorded. |
| 2. Execute one Balanced campaign | Run Kid → Parent → Creator sequentially. Use real text and simulated images. Retain artifacts, per-page approvals, reports, usage and timing. Quality findings remain warnings. | All three cases complete within 120/160/220 LLM requests respectively, with zero real image calls. |
| 3. Record results and prepare M5 | Keep one concise exit record linking configuration, runs, failures, successors and remaining limitations. Pass measured usage and exact bindings to M5. | No known technical completion blocker; evidence supports the next Real-readiness checkpoint, not Real execution authorization. |

The requirements below support these three checkpoints, not another execution
sequence. Reuse existing UI and short tester/judge reports; do not add a scoring
framework or new report hierarchy.

## Checkpoint 1 — Readiness and spending handoff

Reconcile M3's complete simulated runs and measured request/context counts.
Require verified model IDs, token parameters/ceilings, zero automatic provider
retries, actual Dify publication/tool binding, and per-node reservation evidence.
Inspect source/configuration for hidden provider retries, not just node toggles.
An opaque unbounded node is not acceptable for paid readiness.

Before paid execution starts, reconcile model/binding evidence here with the shared
readiness register and bundle only its unresolved required actions into one handoff.
Selected campaign policy: three initial runs, one per persona, zero successors,
at most 500 LLM requests (120 + 160 + 220), three judge requests and USD 5 total.
This is not paid execution authorization.
If successors are requested, obtain a finite allowance and show its additional
worst-case request total before execution. No image spending is permitted in
Balanced mode. Without paid approval, finish non-billable readiness work and stop
at the paid checkpoint; do not claim the milestone exit.

### Required simulation evidence

Reuse M3 results only while their relevant code, graphs, bindings and environment
assumptions remain valid. Do not repeat unchanged M3 campaigns. Use one
representative recovery test per shared mechanism and focused persona contracts;
add a case for a materially different path. Every required scenario below still
needs evidence, including the three deployed persona completions.

Use the same deployed Dify entrypoint and callback routes as Balanced/Real. Keep
small deterministic fault fixtures in a test-only mode that staging operators
explicitly select; production rejects the entire runner. Do not expose fault
injection as a normal agent capability.

| Scenario | Observable assertion |
| --- | --- |
| Three complete persona cases | Saved cover/pages/reference counts, all J01–J13 and reports; zero real-provider nodes/payable counters; logical reservations recorded |
| Low interaction/group review | Kid/parent do not individually review all internal artifacts; exact approval provenance retained |
| Detailed creator control | Creator can inspect/revise an artifact and narrow delegation; only current grant applies |
| Scope/brief conflict | Tester is asked; manager cannot grant itself authority or change limits |
| Duplicate/lost authorization | One claim, at most one simulated provider action; inspection, not re-execution |
| Pause and application recovery | In-flight result can save; no new claims while paused; resume does not repeat completed work. Reuse retained restart evidence; do not add a forced-restart campaign. |
| Missing/corrupt asset, storage failure | Technical blocked state; existing-result recovery retains counter and prior pages |
| Concurrent/superseded completion | One winner; old result cannot overwrite replacement |
| Exhausted calls/revisions | No extra provider call; usable quality result accepted with warning; required missing output remains blocked |
| Judge failure | Generation remains complete; evaluation retry/recovery is separately recorded within allowance |

A fault fixture is complete only when the final state and persisted ledger are
asserted, not merely when a request returned 200. Run focused Vitest, typecheck,
lint, agent routing fixtures and actual fake-provider Playwright execution. CI's
browser discovery is not a substitute.

## Checkpoint 2 — Balanced campaign

1. Read back suite configuration and statically inspect every reachable branch.
   Balanced must route manager/specialists/testers/judge to real text calls and
   images to fixture transport before any image provider node.
2. Set per-run real LLM ceilings 120/160/220; real image allowance zero. Token
   ceilings and models must match the approved readiness manifest. All retries,
   output repairs and judge subcalls count. Counters are never reset for a retry.
3. Run Kid, Parent, Creator sequentially through the normal runner. Observe by
   persisted run ID and Dify execution ID. Do not change a running case's suite.
4. For a technical failure, retain the run. Diagnose with traces, prefer a bounded
   prompt/schema/config correction, rerun affected simulation and tests, obtain two
   consecutive clean independent reviews, publish/synchronize/deploy if needed, then start a linked successor
   only within the approved campaign allowance. No silent paid trial loops.
5. Record real usage/latency and reported cost; distinguish estimates or unavailable
   fields. Save tester/judge reports but label visual judgments as based on
   simulated images, not evidence of provider image quality.

Aim for one reviewed configuration/release candidate. Before changing configuration,
stop new dispatch and reconcile active or uncertain work; Pause alone is not a
drain. Recover unknown outcomes through inspection, without automatic replay.

## Checkpoint 3 — Evidence and M5 handoff

Use EXECUTION C/D for every relevant correction; do not waive CI because a prompt
change is small. Dify-only updates require graph/prompt checks and two reviews,
publication/tool sync/read-back, but not an unchanged application deployment.
App changes require the normal PR/CI/staging cycle.

Keep one concise exit record here with evidence links, published bindings, usage,
failures/successors and remaining limitations. A successful run alone does not
require another deployment.

Exit: all named simulated scenarios and all three Balanced cases pass, no real
image calls, complete artifacts/reports, request enforcement verified, and no known
technical blocker. Record failed predecessors and successful successors. Update
M5 with exact bindings, measured consumption, confirmed staging/reset state and
the bounded Real campaign authorization request.

For changes to this plan, check consistency with the PRD and roadmap, local links,
whitespace and documentation-only CI selection; obtain an independent read-only
review. This revision changes no runtime APIs, schemas, request ceilings,
deployment authority or production scope.
