# Lessons learned

Keep only verified, reusable lessons. This file does not mark M0 complete.

## Candidates

### Propagate the owning maintenance deadline through storage

A backup storage request was aborted by the operation budget timer while the
overall backup budget still had time. Recovery storage used an implicit
30-second nested maximum. Focused fake-clock tests verify that transfers can
exceed 30 seconds within their parent budget, and that sequential transfers and
reentry do not renew that budget. Keep timeout ownership explicit. Cancellation
must cover response bodies and a separately bounded cleanup of the exact owned
container. Emit fixed phase and byte measurements on stderr so future failures
identify the transfer boundary without exposing object names or breaking receipts.
The original transfer's size and cause of delay remain unknown; local tests do
not prove live recovery. Promotion candidate: **Documentation** for maintenance
deadline and command-response contracts.

### Separate command receipts from structured telemetry

Accounting instrumentation emitted JSON to standard output during a protected
read-only recovery preview. The command returned eleven objects including one
verified result; a single-object wrapper rejected the entire stream. Keep a
machine response protocol explicit. If existing telemetry shares that channel,
validate its complete known shape, measurements, outcome and applicable target
identity before separating it from exactly one receipt. Unknown records and
duplicate results remain errors. Test the normal deployment handoff as well as
direct recovery: the handoff supplies target arguments without recovery globals.
PR #295, its shell regressions and successful retained preview/apply verify this
correction. Promotion candidate: **Documentation** for command response contracts.

### Keep completion reads proportional to their consumers

Evaluation ordering and completion used full successful tester/judge documents,
although they consumed only identity fields and report results. Large historical
preparations therefore crossed the database boundary again near the final gate.
The shared projected reader preserves the filter and malformed JSON while
omitting unused bodies. Persistence tests verify exact consumed values for all
three personas and unchanged stored records. Keep accounting proof inputs complete;
use separate projections for report selection. Promotion candidate:
**Documentation** for consumer-specific database reads.

### Associate a saved failure reason with its recorded revision

A continuation retains the previous diagnostic as history. A later block can have
no classified reason; status alone must not make the earlier reason current again.
Display a diagnostic as current only for its recorded blocked revision, and show
unavailable current details otherwise. Use fixed origin classifications without
exception text. Persistence and UI regressions verify durable storage and historical
display. Promotion candidate: **Documentation** for saved failure visibility.

### Test repair delivery from the retained failure

The M4 semantic-decision repair passed the full Creator continuation fixture,
reviews and CI. Normal staging deployment still stopped during draining because
the serving release retained the very started tester operation that the new
release was meant to close. Read-only journal and blocker inspection proved this
ordering conflict; it was not an observer timeout alone. Test the complete
serving-release, exact recovery, deployment and continuation boundary. Keep
unknown operations and unrelated owners as drain blockers. Reuse the protected
recovery interface for a separately authorized exact closure rather than adding
a general drain exception. The [M4 checkpoint](M4-balanced.md#decision-repair-delivery-checkpoint--2026-10-26)
records the observed failure and verified exact recovery. Normal delivery and
Creator acceptance remain separate gates. Promotion
candidate: **Documentation** for repair delivery and acceptance fixtures.

### Test admission-dependent helper composition

A retirement preview required open, idle admission, but its shared helper called
a verifier that required closed admission. Isolated tests stubbed that helper and
missed the conflict. Separate immutable provenance from live admission-dependent
verification. Exercise the real composition at both boundaries. PR #301's Linux
regressions and the subsequent successful closure and normal deployment verify
this correction. The deployment observer expired after five minutes while the
host completed within its original budget; reconcile saved host status before
interpreting a workflow timeout as deployment failure or submitting another job.
Promotion candidate: **Documentation** for recovery composition and observation.

### Verify a clean experience separately from repaired acceptance history

The additional USD1 Balanced Kid experience completed generation and both reports
in 27.77 minutes with 39 text calls, nine simulated image calls and no failed
operation or mid-run intervention. Earlier Kid acceptance retained repairs and a
failed advisory report. Keep those histories, but use a separately identified
clean run to measure current behavior. Do not attribute differences to one fix
without controlling the other changes. Delegated approvals prove the automated
persona path; simulated images still do not prove visual quality or print
readiness. See the [additional Kid result](M4-balanced.md#verified-additional-kid-result).
Promotion candidate: **Documentation** for experiment evidence and comparison.

### Offer only actions that remain eligible

The M4 reviewer received saved revision counts but its schema still offered an
exhausted revision. It repeatedly interpreted accepted simulated image geometry
as a required regeneration, and the repository correctly rejected the next
revision. Supply the simulation boundary explicitly and bind task/version choices
to remaining allowances. Keep final source and byte validation authoritative.
Preserve a successful provider response that requests an unavailable action;
record a separately proven semantic rejection instead of changing it to approval
or calling valid JSON malformed. The focused persistence cases and full Creator
fixture verify unchanged response/charges, atomic rollback, one fresh reviewer
and accounting after completion. Promotion candidate: **Documentation** for
model action contracts and authenticated-result recovery.

### Separate failed preparation from repeated creative decisions

An explicitly verified continuation can leave creative evidence unchanged. The
next valid manager decision must not inherit a loop count accumulated across the
earlier technical failures. Retain the fingerprint, original operations and all
liabilities, but start a new observation interval only after the exact continuation
proof passes. Keep the normal repeated-decision limit. The M4 accounting and
control cases cover this reset, genuine-loop blocking, concurrent recovery and a
later separately authorized continuation. Promotion candidate: **Documentation**
for agent progress and recovery contracts.

### Test recovery with the dependency graph that the failed stage uses

A J01 recovery fixture passed without exercising J12's reference verifiers.
Those verifiers re-read persisted run state and correctly reject a blocked run;
passing a changed in-memory object does not make that state eligible. Stage the
eligibility change inside the same transaction, then create fresh verification
metadata and check original assets and accounting before commit. Roll back all
tentative changes on failure. The full-reference J12 case verifies corrupt-byte
rollback, successful recovery and specialist dispatch with the saved manager
parent. Promotion candidate: **Documentation** for transactional recovery tests.

### Check each transport's serialized boundary before dispatch

A provider request can fit its canonical carrier but exceed a smaller HTTP
response limit after JSON escaping. Removing efficiency caps exposed this gap.
Use the same serializer for preparation and authorization, and bound changing
fields conservatively. Retain transport limits as hard limits while treating
efficiency targets as warnings. The M4 escaped-report integration case verifies
that a below-1-MiB request can fail before dispatch, preserve accounting, and end
advisory evaluation without a retry. Promotion candidate: **Documentation** for
provider transport boundaries.

### Separate current creative evidence from execution history

Model context and verification need different views of the same saved record.
Current creative projections retain exact wording, identities, approvals and
source relationships; original records remain authoritative for verification.
J12 needs the selected layout page plus lettering derived from the complete
approved routing. Compact J09/J11/J12 output fixtures verify equivalent hydration
without sending image execution prompts or old drafts. Preserve unknown creator
message fields rather than assuming that they contain only control metadata.
Size diagnostics belong outside request and legacy preparation hashes, and their
failure must not change execution eligibility. Promotion candidate:
**Documentation** for model-context construction.

### Share observation contexts when a cached client crosses module bundles

A process-global MongoDB client can retain listeners from a different Next.js
bundle than the request that starts a diagnostic scope. Module-local
AsyncLocalStorage then yields empty observations despite successful reads. A
module-reload fixture reproduces this boundary; process-shared observation scopes
restore live command and checkout events. Treat missing events as unavailable,
not evidence of zero work. Keep numeric diagnostic results in a small, sanitized
process buffer when a read can exceed the observer's wait; later retrieval must
not repeat the query. The original execution deadline still bounds that read.
See the [M4 measured evidence](M4-balanced.md#current-creator-admission-checkpoint).
Promotion candidate: **Documentation** for application diagnostics.

### Select the final structured answer before JSON validation

The bounded provider extractor joined every assistant message and reasoning
summary. Responses API messages can distinguish commentary from the final answer.
For structured tasks, select one completed final message; permit one phase-less
message for legacy responses. Reject ambiguous selection without erasing provider
usage. Do not repair JSON substrings or retry automatically. Offline transport
fixtures prove this boundary; missing historical phase metadata does not prove
that concatenation caused a particular saved malformed response. Promotion
candidate: **Documentation** for provider integration.

### Separate mutation acknowledgement from full-detail reads

A control can save its state before a later detail read fails. Receipt requests
now acknowledge only after the tracked mutation and its cleanup succeed, then the
UI loads details separately. HTTP and UI fixtures cover successful saves followed
by failed detail reads, lost acknowledgements and stale polling responses. Use a
compact authenticated state read to reconcile uncertain replies; do not repeat
an uncertain mutation. Preserve errors from mutation validation and cleanup.
The retained Kid response exception remains unverified; this boundary correction
does not establish that a timeout caused it. Promotion candidate:
**Documentation** for application control responses.

### Prove the complete recovery and delivery boundary

Routine initialization called the comprehensive historical audit. Two retained
deployments failed on cursor read timeouts; the exact collection and underlying
latency cause remain unproven. Availability now checks required metadata and seeds,
while the explicit audit keeps corruption detection. Raw source hashes also rejected
a runtime-erased optional annotation; new images declare their data contract.
Test recovery, ordinary deployment/readiness and explicit Resume together, including
one saved completion that must not dispatch again. The combined fixture uses fake
providers, real application persistence and isolated mocked host commands; it does
not establish live host latency. Promotion candidate: **Documentation** for bounded
experimental delivery and recovery.

### Keep deterministic routing independent of the full provenance graph

Even metadata-only artifact projections can exceed a fixed manager request limit
as page dependencies grow. Full Parent and Creator persistence fixtures exposed
this after the creative bodies had already been removed. When the application
has selected one eligible route and target, send that choice and minimal identity
to the manager. Retain source, approval and accounting validation in application
admission, and keep full evidence for specialists and advisory reports. The
bounded manager fixtures complete both larger personas without raising the
16 KiB limit. Promotion candidate: architecture documentation.

### Project provenance before scanning growing run histories

Deployment initialization loaded complete experiment operations and artifacts even
though its integrity checks consume only identities and provenance. The retained
host error proves a cursor `getMore` timeout, but does not identify its collection.
Use minimal projections and indexed pages while retaining every row and check.
The same rule applies inside image-source verification and saved-run inspection:
image lineage consumes image and parent-manager fields, not retained text preparations or
provider observations. A 37-operation large-payload fixture verifies that those
text bodies remain stored while image verification excludes those bodies. Keep operational
read failures outside model-output validation catches; a failed read does not
prove invalid content. Preserve the original failure and unresolved accounting.
The focused 205-operation persistence fixture verifies three pages and rejects a
broken final-page reference; the read-failure fixture retains the original error
without logging its private message. Local checks do not prove live latency.
Promotion candidate: **Documentation** for maintenance integrity verification.

### Complete the failed-delivery handoff boundary

A successful candidate recovery pins its source tree for the next deployment.
If that deployment fails initialization, restoring the prior app while retaining
the active handoff would prevent a corrected source tree from deploying. Pin the
handoff in expired-recovery preview, validate its completed parent and failed-image
tree, then archive its exact bytes after compatibility/readiness checks. Preserve
all original journals and deadlines. Mocked lifecycle cases cover exact archival,
preview drift rejection and interrupted restoration from the archive.
Promotion candidate: **Documentation** for supported deployment recovery.

### Separate recovery observation from permission to repeat work

A failed control process does not prove that its database transaction failed.
Checkpoint the exact target before mutation, then verify saved completion after
an interrupted response. Keep provider starts unavailable to that recovery path.
Focused recovery fixtures verify one materialization with unchanged reservation
and charge evidence after repeated observation. Blocker diagnostics must distinguish
a database read failure from actual work and identify the bounded set of records.
Promotion candidate: **Documentation**, after supported live delivery is verified.

### Validate manuscript coverage at the booklet boundary

Context: real-text J05 supplied an approved cover unit and three story units.
Completed J11 routed each once, but the story-only coverage validator rejected the
cover allocation. Require complete booklet coverage without guessing placement
from free-form unit keys; retain unknown-unit and exact reference checks. Recover
valid retained output through normal materialization and an exact protected grant,
without regenerating it or changing its charge/deadline. Evidence: saved Kid J11
`055c52c5-35c5-4a70-be1d-f126139a58d8` and focused routing/recovery checks.
Promotion target: application boundary and recovery guidance. Simulated fixture
coverage alone did not expose the mismatch; its cover contains no manuscript unit.

### Distinguish content size from whitespace token exhaustion

- **Observation:** A paid J11 response exhausted 8,192 output tokens with 24,078
  trailing whitespace characters after 6,729 non-trailing-whitespace characters.
  The provider marked it incomplete; the application rejected it and retained the
  charge. This does not establish a schema contradiction or justify a larger limit.
- **Guidance:** Inspect attributable output and usage before changing a ceiling.
  Request concise compact JSON and explicit closure as a bounded mitigation, not a
  proven cure. Preserve failed output; never salvage its prefix as completion.
- **Evidence:** [Retained J11 record](M4-balanced.md#current-j11-cover-routing-recovery---2026-10-17).
- **Promotion target:** Bounded structured-output experiment guidance.

### Compare equivalent completion boundaries when optimizing delegation

- **Context:** Booklet separates provider output, image assembly and creator approval.
- **Observation:** The Kid fixture repeated the same delegation after each assembled
  image package. Applying its existing current grant through the normal approval
  service removes eight tester invocations and retains exact approval provenance.
  Comparing image-only timing would omit the old separate approval operation.
- **Guidance:** Measure equivalent durable end states. Keep original-byte checks and
  current mutable-source checks distinct; scope any byte reuse to one preparation.
  Report query/storage counts alongside timing and distinguish local from live proof.
- **Evidence:** Focused dispatch/context/reference-upload tests and the
  [efficiency record](M4-balanced.md#execution-efficiency-follow-up--2026-10-13).
- **Promotion target:** Documentation for deterministic orchestration around agents.


### Separate Simulated completion from paid-provider readiness

- **Context:** M3 completed three persona journeys through Booklet and Dify.
- **Observation:** Parent and Creator retained their required pages, approvals,
  references, assets and independent reports with zero payable calls. Simulated
  reports correctly left creative quality unassessed. Code inspection then found
  Simulated-only checks across admission, context, image assembly and completion;
  the current reservation counts also do not retain provider token/cost usage.
- **Guidance:** Reuse valid completion evidence, but audit the whole changed mode
  path before enabling a paid branch. With exactly one provider request per
  invocation, reuse its reservation; prove no hidden retries or repair calls.
  Record effective model/token settings and attributable usage separately from
  reserved attempts. Do not infer provider readiness or image quality from a
  successful deterministic campaign.
- **Evidence:** [M3 persona exit](M3-completion.md#persona-exit-evidence) and
  [M4 readiness boundaries](M4-balanced.md#m4-readiness-plan--2026-10-13).
- **Promotion target:** Documentation for staged provider experiments.

### Verify complete operator input before execution

- **Context:** A separately authorized operator must execute reviewed application
  code when the installed application cannot complete its own delivery drain.
- **Observation:** A long terminal paste was corrupted. A compressed transfer
  checked against the pinned procedure hash loaded the exact reviewed bytes.
  Preview then exposed a separate race with a tracked observation of the same
  stopped operation; waiting only for its exact owner preserved the zero-active
  mutation gate. Backup-protected reconciliation completed without changing
  reservations, counters or stop history.
- **Guidance:** Verify payload integrity and syntax before loading it. Report
  allowlisted failure stages and state fields. Bound any wait for known work;
  do not clear ownership or treat unrelated work as idle. Keep apply separate
  from preview and retain evidence after an uncertain outcome.
- **Evidence:** [Verified M3 reconciliation](M3-completion.md#current-progress-and-blockers--2026-10-13),
  backup `staging-stopped-probe-20261013T090710Z-2622181` and diagnostics
  `38374753642`.
- **Promotion target:** Documentation for exceptional operator handoffs; no new
  host action or infrastructure acceptance gate.

### Keep experiment acceptance proportional to its product flow

- **Context:** M3 needs Simulated Kid, Parent and Creator completion.
- **Observation:** Live host restart/cancellation probes introduced repeated
  manual handoffs; the delayed probe completed, while cancellation hit a Booklet
  reconciliation gap. Infrastructure timing windows were unrelated to persona
  output acceptance.
- **Guidance:** Test application/workflow boundaries with focused local cases and
  validate persona completion live. Treat infrastructure as a working dependency;
  report observed external blockers without adding resilience campaigns.
- **Evidence:** [M3 scope correction](EXECUTION.md#m3-experiment-only-scope) and
  [retained live results](M3-completion.md#current-progress-and-blockers--2026-10-13).
- **Promotion target:** Agent instruction for proportional experiment validation.

### Retain deterministic continuation after output completion

- **Context:** Image output is saved before the final artifact and review card.
- **Observation:** An in-memory callback can be lost after the completed batch
  commits. Focused restart tests recover a persisted pending continuation without
  another image-provider call and reject stale output that would replace newer work.
- **Guidance:** Save pending continuation atomically with completion. Clear it
  only after the required saved projections exist. Make finalization idempotent;
  callback delivery alone is not proof that downstream bookkeeping finished.
- **Evidence:** [Image recovery tests](../../../tests/integration/reference-generation.test.ts).
  Live verification of this candidate remains pending.
- **Promotion target:** Documentation for multi-stage saved-output recovery.

### Keep observation writes out of callback finalization transactions

- **Context:** An asynchronous runner polls the same operation that a callback
  reads and updates inside a MongoDB snapshot transaction.
- **Observation:** The focused overlap test made one observation write after the
  callback's snapshot read. The complete materialization ran twice.
  A persisted finalization lease suppressed both observation and wake writes;
  the same test then materialized once with unchanged identity and reservation.
  A second overlap reproduction confirmed the same retry mechanism before the
  authorization reservation. Coordinate that transaction separately as well.
- **Guidance:** Coordinate observers with long saves through a bounded persisted
  lease. Preserve expiry recovery and original deadlines. Recreate source checks
  on genuine transaction retries; do not weaken validation or replay execution.
- **Evidence:** [Focused finalization tests](../../../tests/integration/experiment-runner-finalization.test.ts).
  This proves the conflict mechanism locally, not the complete cause of a live
  timeout. Compare live callback and transaction-attempt timings after deployment.
- **Promotion target:** Documentation for asynchronous persistence.

### Correlate container snapshots with kernel OOM evidence

- **Context:** A Dify scheduler restarts during its Flask migration subprocess.
- **Observation:** Kernel events identified memory-cgroup OOM kills in the exact
  scheduler container, despite a running snapshot with `oomKilled=false` and
  zero sampled cgroup counters. The configured limit was 256 MiB.
- **Guidance:** Identify the killed process and container in kernel records before
  excluding OOM. Verify application startup and a stable restart count after a
  repair; a momentary running state does not establish recovery.
- **Evidence:** Operator kernel output from 2026-10-11 and the
  [Community runbook](../../deployment/dify-community.md#automated-diagnostics-and-sandbox-memory).
  The 1536 MiB repair passed startup and stability verification; subsequent
  readback showed 409.3 MiB usage, zero restarts and zero OOM counters.
- **Promotion target:** Documentation for container failure diagnosis.

### Reload authorization evidence after asynchronous reconciliation

- **Context:** A callback completes before terminal publication readback.
- **Observation:** The dispatcher persisted verified publication evidence but
  passed its earlier, unverified manager snapshot to dependent page admission.
  The focused callback-first J13 regression failed before the reload and passed
  afterward, with one dependent image submission and no manager replay.
- **Guidance:** Reload the exact operation after reconciliation before dependent
  admission. Do not weaken publication checks to accept a stale snapshot.
- **Evidence:** [dispatcher](../../../lib/experiment-runner/dispatch.ts) and
  [callback-first regression](../../../tests/integration/experiment-runner-style-dispatch.test.ts).
- **Promotion target:** Documentation for asynchronous operation recovery.

### Bind the active publication, not a matching history entry

- **Context:** Application-key execution on Dify Community 1.17.1.
- **Observation:** The first workflow-history entry and the active workflow had
  equal graph hashes but different IDs. Execution used the active ID, and Booklet
  correctly stopped a run configured with the history ID.
- **Guidance:** Read `app_get.workflow.id`, retrieve that exact version, verify
  its graph, and bind its ID. Preserve rejected runs and use linked successors
  after correcting settings. Do not relax publication-identity checks.
- **Evidence:** [M3 deployed candidate](M3-completion.md#current-deployed-candidate--2026-10-06)
  and runtime run `22fcdfd1-491c-4cfb-a28e-0dfe75ba04cb`.
- **Promotion target:** Dify integration documentation; verified on this release.

### Publish complete asset bytes before recording completion

- **Context:** An image operation stores original bytes at an immutable attempt URI.
- **Observation:** A direct exclusive filesystem write can leave a partial final
  file on interruption. Atomic publication from a complete sibling temporary file
  prevents that failure; competing writes retain one winner without overwriting it.
- **Guidance:** Publish complete bytes without clobbering an existing asset, then
  verify their digest before recording database completion. Recovery reuses the
  original operation and bytes without another provider request. Record each
  failure when it occurs, not from mutable run timestamps during recovery.
- **Evidence:** [Atomic filesystem tests](../../../tests/unit/filesystem-asset-store-atomic.test.ts)
  and [image-storage tests](../../../tests/integration/experiment-runner-image-storage.test.ts).
- **Promotion target:** Asset and recovery documentation. These are local tests,
  not live Dify binary-transfer evidence.

### Preserve subject identity independently of names and array order

- **Context:** Draft cast/location lists become manuscript sources and final lists.
- **Observation:** A cast rename and reordered proposal retain Booklet-owned IDs
  when versions match entries by stable `entryKey`. Rebuilding the manuscript
  retains unit IDs by `unitKey`; dependency edges invalidate the final lists
  without changing the unrelated location draft.
- **Guidance:** Assign IDs during transactional materialization, not in model
  proposals. Match stable keys, validate references against current approved
  sources, and preserve earlier versions instead of replacing evidence.
- **Evidence:** [M2 narrative tests](../../../tests/integration/experiment-runner-m2-narrative.test.ts).
- **Promotion target:** Persistence and artifact-contract documentation. This is
  local fixture proof; live M2 execution remains a separate checkpoint.

### Validate HTTP body fields against a live callback

- **Context:** Generated HTTP nodes in Dify Community 1.17.1.
- **Observation:** A raw-text body item with `text` passed graph preparation but
  sent an empty HTTP body. The first live tester callback returned HTTP 400.
- **Guidance:** Use the supported `value` field and check both authorization and
  result selectors. A successful HTTP node can still contain an error response;
  inspect the HTTP status and saved callback outcome.
- **Evidence:** Dify run `54f72080-9a7d-4316-b7a0-068f195dbc93` and
  [graph regression](../../../tests/unit/experiment-runner-workflow-graph.test.ts).
- **Promotion target:** Integration documentation; verified on this pinned release.

### Preserve answered questions and interrupted revisions in saved context

- **Context:** Local J01/J02 specialists run as separate operations, with an
  external tester answering clarification questions.
- **Observation:** Saving an answer is insufficient if the next specialist sees
  only the original brief. A revision also needs its target and instruction
  retained while clarification waits for an answer.
- **Guidance:** Reconstruct relevant question/answer pairs from saved operations
  and decisions. Suspend and restore the same revision after the exact answer;
  do not debit the revision allowance again.
- **Evidence:** Restarted specialist context and revision/clarification tests in
  [context tests](../../../tests/integration/experiment-runner-context.test.ts)
  and [narrative tests](../../../tests/integration/experiment-runner-narrative.test.ts).
- **Promotion target:** Integration documentation. Live Dify behavior remains
  unverified for this slice.

### Carry explicit lineage when inspected tool traces omit child run IDs

- **Context:** Community 1.17.1 workflow-tool calls.
- **Observation:** Inspected native manager nodes report provider IDs, not child
  run IDs. A deterministic caller can pass its system run ID and correlation into
  the child; the child can return its own system run ID. Independent saved-run
  reads confirm the exact relationship without timestamp matching.
- **Guidance:** Retain and validate that explicit envelope with the application
  operation. Use distinct operation IDs for revisions and retries. Do not claim
  native trace linkage or application persistence from a transport probe.
- **Evidence:** [M0 lineage proof](M0-readiness.md#explicit-parentchild-lineage-proof--2026-10-03),
  parent `fbff27e2-634f-45fa-8558-e8ea981e99a5` and its independently read children.
- **Promotion target:** Integration documentation; runner contract guidance.

### Verify runtime access separately from administrative access

- **Context:** A Booklet runtime calls a Dify workflow with an application API key.
- **Observation:** The deployed diagnostic probe completed through an authenticated
  callback and a separate Booklet result lookup using runtime credentials.
  Administrative MCP discovery alone did not establish that path. A separate
  staging fault discarded the successful start response before parsing its IDs;
  the callback retained the ID and GET recovered the saved result without a
  replacement POST. This does not establish recovery without a retained ID.
- **Guidance:** Verify application execution, persisted callback identity and
  runtime-key lookup together. Retain correlation and run IDs. Test lost-response
  recovery separately; a successful ordinary lookup does not prove interruption
  handling, and an unknown outcome is not permission to replay.
- **Evidence:** [M0 runtime integration handoff](M0-readiness.md#runtime-integration-handoff),
  ordinary run `18381193-b811-4809-a673-4784bf2d572f` (2026-10-03) and fault
  recovery run `eb586ddf-243d-40a5-8a45-27935cf9d653` (2026-10-04), independently
  retrieved with matching identifiers and zero tokens.
- **Promotion target:** Integration documentation.

### VPS releases snapshot master-owned Compose files

- **Context:** Independent `master` and `_staging` release lines on the shared VPS.
- **Observation:** Infrastructure sync transfers master's Compose files. The host's
  `prepare_release` copies those installed files into immutable per-commit releases;
  it does not obtain configuration from the application branch. A selective app port
  can therefore preserve its source defaults but still inherit different host defaults.
- **Guidance:** Compare both configuration sources before release. Correct and
  synchronize reviewed host defaults first, then create a new release snapshot.
  Do not expect redeploying an existing commit to replace its saved configuration.
- **Evidence:** `sync_host_configuration` and `prepare_release` in
  [the dispatcher](../../../scripts/deploy/vps-deployment.sh);
  `preserves Cloud staging defaults in master-owned host configuration` in
  [deployment contracts](../../../tests/unit/deployment-contracts.test.ts).
- **Promotion target:** Deployment documentation; reflected in the canonical runbook.

### Published callers do not pin child Workflow Tool bindings

- **Context:** Dify Community 1.17.1; a published caller invokes separate workflows
  through Workflow Tools.
- **Observation:** Editing the child draft did not change the published caller.
  Publishing the child without tool synchronization also kept the old result.
  Refreshing the child tool changed the same pinned caller's result. Restoring,
  republishing and refreshing the child recovered the original result without
  rebuilding the caller or changing the provider ID.
- **Guidance:** Do not claim transitive version isolation from the caller version
  alone. Stop dispatch, reconcile active work, synchronize child tools, and retain
  effective child publication evidence for successor runs. Inspect a failed or
  uncertain refresh before retrying; publication alone is not synchronization.
- **Evidence:** [M0 binding-change and restoration results](M0-readiness.md#binding-change-and-restoration-evidence),
  including changed caller run `a383fb0b-160a-4f9c-b94d-31b8a5f54787` and restored
  caller run `1ffa1a98-2674-4c79-96db-2bb693c7b62f`; zero reported tokens.
- **Promotion target:** Documentation and the Dify operations skill.
- **Status:** Candidate; behavior was verified on this pinned release only.

### Unit checks do not prove server package initialization

- **Context:** Next.js 16.2.12, Zod 4.4.3 and the runner configuration imported
  by the root layout.
- **Observation:** Typecheck, lint and runtime tests passed, but the release build
  failed at `/_not-found` when Zod's bundled ISO/schema cycle accessed
  `ZodISODateTime` before initialization. A clean debug build reproduced the
  failure at `lib/contracts/common.ts:7`; native Node imports passed. The same
  checkout completed the ordinary build with only Zod added to
  `serverExternalPackages`. No dependency or validation rule changed.
- **Guidance:** Diagnose generated server initialization with a clean checkout
  and source-mapped failure. For this verified package cycle, retain native
  server loading rather than weakening schemas or changing the whole bundler.
  PR validation stays non-build; the deployment build remains a separate gate.
- **Evidence:** [server configuration](../../../next.config.ts),
  [configuration regression](../../../tests/unit/next-config.test.ts), and
  [Next.js external-package contract](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages).
- **Promotion target:** Documentation; reverify before removing the workaround
  or changing Next.js/Zod versions. Linux container deployment remains the live
  release checkpoint.

### Studio validates output names across branches

- **Context:** Dify Community 1.17.1 workflows with separate completion and pause End nodes.
- **Observation:** Bridge validation and backend publication accepted duplicate
  End output names. Studio blocked publication until those names were unique
  across the graph. All six M1 checklists passed after each branch exposed only
  its consumed output.
- **Guidance:** Check global End output-name uniqueness in graph fixtures and
  verify the Studio checklist. Backend publication alone does not prove editor
  acceptance. Preserve the saved-completion acknowledgement gate when repairing
  branch outputs.
- **Evidence:** [graph regression](../../../tests/unit/experiment-runner-workflow-graph.test.ts)
  and [M1 draft repair](M1-runner.md#entry-and-manual-setup).
- **Promotion target:** Documentation; reverify for other Dify releases.

### Handler upload limits need proxy transport headroom

- **Context:** Image callbacks behind Next.js 16.2.12 proxy body cloning.
- **Observation:** The installed clone defaults to 10 MiB and truncates larger
  bodies before the handler's 20 MiB validator. A 32 MiB transport setting
  preserves an allowed 20 MiB upload and lets the handler reject a chunked
  20 MiB-plus-one-byte body with HTTP 413.
- **Guidance:** Test the framework transport as well as the route factory.
  Keep a bounded transport allowance above the application's content limit.
- **Evidence:** [transport regression](../../../tests/unit/experiment-image-proxy-body.test.ts)
  and [Next.js proxy limit](https://nextjs.org/docs/app/api-reference/config/next-config-js/proxyClientMaxBodySize).
- **Promotion target:** Documentation; reverify when Next.js or limits change.

### Maintenance must preserve callback recovery and finalization

- **Context:** A staging schema transition whose maintenance gate also rejects
  external workflow callbacks.
- **Observation:** A tracked-mutation count of zero does not prove the external
  operation ledger is idle. Closing admission can prevent unresolved work from
  completing. An interruption after admission reopens can also leave a journal
  whose ordinary resume path would incorrectly stop the running app.
- **Guidance:** Check external work before closing admission and again after drain,
  before stop. On a pre-change race, reopen admission while the app is still
  running. Record a finalization checkpoint before reopening admission; its resume
  must not replay stop, backup or mutation. Preserve the pre-change backup after
  the mutation checkpoint.
- **Recovery extension:** Retain exact mutation owners across process interruption.
  Release an interrupted owner only after its operation has verified terminal
  evidence. A lost stop acknowledgement remains history, not a permanent blocker
  after verified completion. Keep unrelated or unidentified owners blocked.
  The [drain ownership regressions](../../../tests/integration/deployment-drain-control.test.ts)
  verify this behavior locally; live deployment proof remains pending.
- **Evidence:** [Mongo ledger tests](../../../tests/integration/experiment-maintenance.test.ts)
  and [host interruption/race scenarios](../../../tests/shell/vps-host.test.sh).
  Focused local scenarios passed; complete Linux suites and live retirement remain
  separate verification gates.
- **Promotion target:** Documentation; reverify the admission and callback behavior
  before using this pattern for another runtime.

### A workflow failure does not prove that its callback did not save

- **Context:** An external workflow times out while an authorized callback is
  still running.
- **Observation:** Dify can report a failed run after its save-node read timeout.
  That status alone does not establish the callback's outcome. Clearing a claimed
  operation can prevent its late result from saving.
- **Guidance:** Classify the observation against the current persisted claim in
  the outcome transaction. Retain uncertain claimed operations and their identities;
  inspect the saved result before any replacement execution. Reuse expensive source
  verification only within one transaction attempt, never across requests or retries.
  Batch independent evidence reads while keeping Mongo transaction commands serial.
  Avoid calling a source verifier twice when the downstream assembly verifier
  already enforces the same sources and final bytes. Preserve ownership, approval
  scope, dependency membership and corrupt-byte rejection in focused regressions.
- **Evidence:** [outcome transaction](../../../db/experiment-repository.ts),
  [pagination completion](../../../db/experiment-narrative.ts), and
  [generation verification](../../../db/experiment-completion.ts),
  [retained live failure](M3-completion.md#j11-dify-preparation-package).
- **Promotion target:** Documentation; verify the callback and runtime recovery
  interfaces before applying this pattern to another integration.

### Validation normalization can change approved lettering

- **Context:** A page-production fixture reads an approved manuscript through a
  schema that trims strings.
- **Observation:** Schema validation produced normalized narration and dialogue.
  A fixture test with leading whitespace and a trailing newline detected a change
  to the approved text.
- **Guidance:** Validate the structure, but preserve the saved original strings
  when the output contract requires exact approved lettering. Test whitespace as
  well as words. Do not substitute normalized text for the approved source.
- **Evidence:** [J12 fixture](../../../lib/experiment-runner/page-bible-fixtures.ts)
  and [exact-lettering tests](../../../tests/unit/experiment-runner-page-bible-fixtures.test.ts).
- **Promotion target:** Documentation for exact-text artifact transformations.

### Capability flags must survive saved configuration projection

- **Context:** A new capability is optional in a runtime binding while older runs
  compare saved configuration bytes or hashes.
- **Observation:** The snapshot producer selects an explicit field list. Adding
  a flag only to the input schema would omit it from saved evidence. Regression
  tests prove that true-only projection changes enabled evidence while omission
  preserves the legacy JSON and SHA-256 value.
- **Guidance:** Update input validation, saved validation and projection together.
  Omit absent flags rather than applying a default. Keep saved and public profile
  shapes separate, and retain the original legacy schema surface.
- **Evidence:** [snapshot producer](../../../lib/experiment-runner/config.ts) and
  [configuration regression tests](../../../tests/unit/experiment-runner-config.test.ts).
- **Promotion target:** Documentation for versioned capability configuration.

### Provider completion is not job completion

- **Context:** An image callback succeeds before reference read-back or page
  materialization fails.
- **Observation:** A succeeded J13 operation can coexist with a blocked run and
  a stale running generation item. The deployment drain correctly refuses that
  running bookkeeping record. Focused regression checks cover this boundary.
  Separate failure-path reproductions showed that dispatch outcomes and failure
  callbacks also need the same cleanup, including idempotent terminal readback.
- **Guidance:** Close eligible item/job bookkeeping transactionally when the
  owning run becomes definitely blocked. Preserve provider results and assets;
  never turn unknown evidence into a terminal result or replay it to clear drain.
  Apply the invariant to each terminal-failure entry point, not only `blockRun`.
- **Evidence:** [terminal bookkeeping helper](../../../db/experiment-page-batch-failure.ts)
  and [reference read-back regression](../../../tests/integration/experiment-runner-style-dispatch.test.ts).
- **Promotion target:** Documentation for multi-stage external-operation jobs.

### Keep observation separate from submission and callback completion

- **Context:** An external workflow can outlive an HTTP request or finish its
  callback before its terminal acknowledgement reaches the application.
- **Observation:** Focused async tests prove saved-ID recovery after restart,
  one GET per observation slot, Pause preservation and retained lane ownership
  after callback-first completion. No second POST is required.
- **Guidance:** Save identity early, retain the original deadline, and reconcile
  terminal evidence before releasing the lane. A timeout does not authorize replay.
  Keep that observation path available during drain after a callback clears the
  active-operation pointer. Gate new work only after admitted reconciliation.
- **Evidence:** [transport tests](../../../tests/unit/experiment-runner-transport.test.ts)
  and [recovery tests](../../../tests/integration/experiment-runner-style-dispatch.test.ts).
  The 2026-10-13 delayed probe saved output during drain but exposed this ordering
  defect; [dispatcher regression](../../../tests/integration/experiment-runner-dispatch.test.ts)
  proves publication readback without another POST or reservation.
- **Promotion target:** Documentation for asynchronous external-operation recovery.

### Save attributable usage before image storage

- **Context:** A provider can charge for an image before the workflow stores its
  output. A tool's emitted messages do not necessarily reach downstream nodes
  immediately.
- **Observation:** Dify 1.17.1 pins Graphon 0.7.0. Its tool node buffers JSON
  until tool message consumption finishes; blob-storage failure can discard that
  output. Emitting usage JSON before a blob does not preserve the usage record.
- **Guidance:** Save attributable usage through an authenticated, idempotent
  callback before output materialization. Retain the reservation when evidence
  is unavailable. Reconcile the saved operation after an acknowledgement failure;
  do not repeat the provider request. Keep callback credentials outside the
  semantic provider request and use the workflow's secret-masked parameter path.
- **Evidence:** The pinned Graphon tool-node source and the offline ordering and
  callback-failure cases in [the image adapter tests](dify/m5-openai-image-bounded-tests.py).
  These tests do not establish live callback reachability or provider permissions.
- **Promotion target:** Documentation for external paid-operation accounting.

### Completion acknowledgements must cover every admitted task

- **Context:** A callback saves a valid manager result before constructing its
  allowlisted response summary.
- **Observation:** J13 was accepted by the manager and repository, but the summary
  allowed only text-specialist task IDs. Response validation could therefore
  return HTTP 400 after the completion transaction succeeded.
- **Guidance:** Keep acknowledgement fields aligned with the admitted result
  domain. Test first completion and duplicate completion at the HTTP boundary,
  not only repository persistence. Do not relax admission checks to fix a response.
- **Evidence:** [callback summary](../../../lib/experiment-runner/http.ts) and
  [J13 acknowledgement regression](../../../tests/unit/experiment-runner-http.test.ts).
- **Promotion target:** Documentation for external completion callbacks.

### Test bounded Mongo cursors across batches

- **Context:** The MongoDB 7.5 driver uses client-side timeouts in transactions.
- **Observation:** Session-only cursor timeouts caused an invalid `maxTimeMS`
  on `getMore`, blocking a valid two-page selection after its image was saved.
- **Guidance:** Give transactional find/aggregate cursors a supported
  collection-level timeout default. Do not override transaction command timeouts
  or use driver internals. Force multiple batches in regression tests.
- **Evidence:** [cursor adapter](../../../db/bounded-collection.ts) and
  [multi-batch regression](../../../tests/integration/bounded-mongo-cursors.test.ts).
- **Promotion target:** Documentation for bounded MongoDB transaction reads;
  recheck this driver-specific behavior when upgrading MongoDB dependencies.

### Share verification reads only within one transaction attempt

- **Context:** Several consumers verify the same approved sources during one
  callback, including every page at final completion.
- **Observation:** Retained server timings showed metadata-only verification
  taking several seconds. Focused tests prove that consumers can share seven
  serial metadata reads and one read of each immutable original per attempt,
  while still rejecting stale approvals and changed or corrupt sources.
- **Guidance:** Share read evidence inside the transaction callback. Create fresh
  evidence on retry, later requests and mutation phases. Keep per-consumer
  ownership, currentness, lineage and byte checks; do not persist a validity flag.
- **Evidence:** [verification metadata](../../../db/experiment-verification-metadata.ts),
  [source tests](../../../tests/integration/experiment-runner-page-illustration-sources.test.ts)
  and [completion tests](../../../tests/integration/experiment-runner-style-dispatch.test.ts).
  Deployed latency improvement remains unverified.
- **Promotion target:** Documentation for transactional external-workflow callbacks.

### Isolate lease clocks from database-driver clocks

- **Context:** Integration tests advance elapsed time to prove authorization and
  finalization expiry without waiting for a real lease.
- **Observation:** Mocking global `performance.now()` also advanced MongoDB's I/O
  timeout clock, producing a driver timeout before the intended lease assertion.
- **Guidance:** Inject the repository's elapsed-time source. Keep the production
  monotonic default and the driver's clock independent. Use one clock domain for
  a fixture's persisted deadline and its HTTP handler.
- **Evidence:** [finalization tests](../../../tests/integration/experiment-runner-finalization.test.ts)
  and [repository clock](../../../db/experiment-repository.ts).
- **Promotion target:** Documentation for deterministic integration-test clocks.

### Preserve provider evidence through workflow text processing

- **Context:** A Dify LLM node returns structured creative content plus provider
  identity and usage to an application-owned callback.
- **Observation:** The pinned Graphon reasoning filter removes inline `<think>`
  blocks without parsing JSON. The provider content helper also flattens refusal
  blocks into ordinary text. A completed refusal can resemble valid JSON.
- **Guidance:** Preserve a trusted refusal discriminator separately from content.
  Test the actual downstream text filter. Escape angle brackets in the outer JSON
  envelope and decode them only in the trusted parser. Do not accept content based
  on its shape alone or treat missing usage as zero charges.
- **Evidence:** [bounded-provider cases](dify/m4-openai-bounded-tests.py) prove the
  pinned filter boundary, completed JSON-shaped refusal and unavailable usage
  locally. Installation is verified; callback integration remains pending in [M4](M4-balanced.md#local-bounded-provider-correction-candidate---2026-10-14).
- **Promotion target:** Documentation for external provider-result adapters.

### Validate package versions at every consuming boundary

- **Context:** A locally corrected Dify provider package crosses the daemon decoder
  and the Dify API response model before installation.
- **Observation:** The daemon accepted `1.0.7-m4r1`; the API's packaging-version
  validator rejected it and returned a generic response-parse error. The corrected
  `1.0.7-dev1` version passed both validators and reached successful installation.
- **Guidance:** Test the receiving API validator as well as the package decoder.
  Keep failed uploads and inspect current installation state before a correction;
  an API parse failure does not prove the daemon stored nothing.
- **Evidence:** [pinned-validator regression](dify/m4-openai-bounded-tests.py) and
  [verified delivery](M4-balanced.md#local-bounded-provider-correction-candidate---2026-10-14).
- **Promotion target:** Documentation for versioned external integration packages.

### Verify request carriers at each workflow boundary

- **Context:** A workflow transports an application-prepared Responses request
  through a model node without changing its prompts or strict output schema.
- **Observation:** Graphon 0.7.0 limits variable model-parameter strings to 1,024
  characters. Its plain message template can carry longer strings. The Code node
  also limits arrays, while the HTTP node limits the whole escaped response to
  1 MiB. Testing only the unescaped inner request misses that final constraint.
- **Guidance:** Carry exact prepared bytes through a verified plain-message path,
  check the digest before provider execution, and bound the serialized response
  before reserving money. Keep static model/token limits independent of the
  carrier. Reject overflow visibly instead of truncating required content.
- **Evidence:** [graph tests](../../../tests/unit/experiment-m4-workflow-graph.test.ts),
  [pinned Graphon rehearsal](../../../tests/helpers/m4-graphon-rehearsal.py) and
  [HTTP cases](../../../tests/integration/experiment-m4-http.test.ts) verify the
  source/local boundary with fake providers. The published graph decoder, selectors and report return were also rehearsed through HTTP and isolated persistence; this does not prove live engine latency or provider reliability.
- **Promotion target:** Documentation for externally hosted workflow adapters.

### Separate terminal notification from authoritative provider output

- **Context:** Streaming notifications and callbacks can arrive before original
  saved workflow output is available or after an application deadline.
- **Observation:** The Balanced observer saves original authenticated GET content
  and attributable usage before parsing creative output. Malformed output can
  still consume money. Duplicate notification cannot authorize another request.
  The live M4 Kid trace confirms that Dify workflow success can carry an incomplete
  provider response at its output ceiling; Booklet stops and retains its usage.
- **Guidance:** Let notifications request observation. Retain maximum liability
  for unknown usage, stop new campaign work on technical failure, and preserve
  late-result inspection without automatic replay. Reconcile exit counters with
  all reservations rather than trusting a successful creative result alone.
- **Evidence:** [provider-result tests](../../../tests/integration/experiment-m4-provider-results.test.ts),
  [accounting tests](../../../tests/integration/experiment-m4-accounting.test.ts) and
  [dispatch tests](../../../tests/integration/experiment-m4-dispatch.test.ts).
- **Promotion target:** Documentation for bounded paid-provider execution.

### Verify equivalent configuration order across admission boundaries

- **Context:** Prepared bindings and a frozen manifest can contain the same
  publication identities in different array orders.
- **Observation:** Identity-only preflight passed, but ordered campaign comparison
  rejected creation before a run/provider action. Earlier fixtures derived both
  arrays from the same policy order and did not expose the mismatch.
- **Guidance:** Compare complete binding entries independent of array order while
  retaining multiplicity and all identity fields. Preserve historical saved bytes
  and hashes. Include a reordered configuration in the HTTP creation regression,
  alongside missing, duplicate and changed identities.
- **Evidence:** [HTTP regression](../../../tests/integration/experiment-m4-http.test.ts)
  and [campaign regressions](../../../tests/integration/experiment-m4-campaign.test.ts).
- **Promotion target:** Documentation for frozen configuration admission.


### Paid failure recovery must also satisfy accounting exit

Context: Balanced Kid retained attributable usage for an incomplete manager
response. Closure safely released operation ownership, but ordinary Resume and
accounting exit both rejected paid failed history. A recovery change must preserve
the failed operation, approve only an inspected new invocation, and include both
requests in final counters and money totals. Test continuation together with exit
accounting and late historical inspection. Evidence: the focused same-campaign
manager continuation cases in `experiment-m4-provider-results.test.ts`. Promotion
target: application recovery and accounting guidance; no new runtime platform.


### Structured layout output still needs explicit coordinate semantics

Context: the first real-text J11 response completed as JSON but treated normalized
x/y as centers, producing x=y=0.5 and width=height=1 for every text-safe region.
The parser correctly rejected all rectangles; the same response also used two
multi-panel Kid story pages. State top-left coordinate semantics with a valid
example, constrain simple persona cardinalities in provider schemas, and retain
independent cross-field/persona validation. Preserve failed output and account for
its charge; do not silently clamp geometry or discard panels. Evidence: retained
Dify execution `e45b4b23-797b-4992-9f3f-eab7b1bb81bf` and focused J11 request/output
regressions. Promotion target: structured-generation and bounded repair guidance.

### Persona completion does not prove failure-boundary coverage

Context: Balanced reconciliation and operator recovery added paths that successful
Simulated persona runs did not exercise. Cancellation can also disable cleanup;
a lost commit reply or later progress-read failure does not prove failed completion.
Test each ownership and durable-write boundary with the actual budget wrapper,
fake providers and real persistence. Inject failures before and after commit and
journal checkpoints; assert retained accounting and no replay. Keep diagnostic
projections explicit because typed identity objects can carry extra runtime fields.
Review the complete path through progress reads, preparation expiry and terminal
bookkeeping; terminal state must take precedence over lease-expiry classification.
Evidence: completion/finalization/image persistence fixtures and mocked host
reentry scenarios. Promotion target: focused failure-test and diagnostic guidance.

### Maintenance inherits the interactive completion window

The retained J11 diagnostic identified budget expiry during an uncommitted
completion transaction, with exact-claim cleanup completed. A 150-second outer
maintenance budget did not remove the nested 20-second interactive Inspect cap.
Trace composed budgets and measure remaining time at the failing phase before
changing a timeout. Exact granted maintenance can reuse its same-invocation
authenticated response through shared completion services without another GET;
it still needs full preservation proof, fresh mutable checks and a bounded outer
request. Fake-provider persistence tests must advance the actual budget clock,
not only use fast deterministic responses. Local proof is not live recovery.

### Measure combined admission with retained failure history

When a later persona must audit multiple completed runs, isolated successful
fixtures do not represent accumulated failure proofs. Live Creator admission used
about 21 seconds in accounting and exhausted its 30-second budget before saving.
Measure accounting, generation audit, transaction and response separately before
changing a timeout. Batch evidence reads within one transaction attempt, then run
every existing predicate. Materialization checks must keep their global scope:
a wrongly owned source version also invalidates a claimed failure. Evidence:
bounded admission diagnostics and the combined Kid/Parent persistence fixture.
Promotion candidate: documentation for transaction-local verification and sizing;
the observed attempt after batching still exceeded the budget. Query reduction
alone did not identify the dominant cost; time actual cursor completion and
validation separately, and omit bodies that the consumer does not use.

### Recheck a pinned proof within its mutation scope

After the interactive cap was removed from exact maintenance recovery, the next
live diagnostic showed outer-budget exhaustion during uncommitted completion.
An existing full preview digest can serve as the baseline for one fresh complete
post-observation snapshot. Apply need not first scan another baseline and then
scan again, provided the pinned digest covers the mutation's required evidence and
grant, and normal post-checkpoint mutable checks remain.
The later count-failure preview exhausted its budget in historical operation
snapshotting: the inherited proof read every full document in eleven collections.
For a closure that only updates one operation and run, pin exact records, current
sources/approvals and campaign exposure; prove write confinement in tests. Keep
global quiescence inspection, but separate comprehensive historical audits. Test
large unrelated prepared contexts and assert filters/projections and unchanged
snapshot size. Preserve the interpretation of older saved checkpoints explicitly.
The observed timeout does not isolate payload size from latency or connectivity.
A read-only status workflow must also bypass the mutation queue it observes;
retain the original group and host lock for mutating actions.

### Bound context for its consumer and retain pre-generation evidence

The M4 Kid manager received 114,101 context characters as completed page images
added full artifact bodies and assembled prompts. Routing needs current status,
version, approval and dependency identities; independent reports need creative
content. Use explicit projections for each consumer and measure the remaining
journey through both reports. The first proposed 64 KiB report byte guard failed
the offline fixture at 80,310 context bytes. Byte limits do not prove model token
counts; retain the independent exact-token guard and fail visibly rather than
truncate required evidence.

The dev2 count guard threw before generation without returning structured
evidence. Authenticated terminal failure and zero reported generation tokens did
not satisfy the normal accounting proof, so the maximum reservation remained
uncertain. Return typed, sanitized pre-generation evidence at the provider
boundary; preserve exposure and require explicit continuation. Legacy recovery
must use separate provenance from reviewed code and authenticated execution,
without creating a provider result or usage record retroactively.

Evidence: the current [M4 record](M4-balanced.md#current-execution-record---2026-10-21),
bounded provider tests and the count-failure/recovery/deployment/Resume Kid fixture.
Promotion target: provider-boundary and role-context test guidance.

### Advisory evaluation must not invalidate verified generation

When reports are advisory, preserve generation and evaluation as separate
outcomes. A verified terminal report failure can end evaluation while retaining
valid generation. Unknown provider outcomes, active owners and unresolved
accounting still block completion. Recheck saved generation and liabilities
before finalization; repeated acknowledgements must return the terminal outcome
without another request or campaign reopening.

Compact report evidence reduces duplicated transport data, but does not guarantee
that creative content fits a model limit. Keep the authoritative count guard and
record oversize as a visible evaluation failure. Retain original evidence and
require `not_assessed` where the projection cannot support a finding.

Evidence: the all-persona advisory integration matrix, Balanced Kid count/size
failure and retained-finalization cases, and request projection unit tests.
Promotion target: documentation for advisory evaluation and terminal outcomes.

## Keep saved reference identity assembly in application code

In Balanced J11 output, individually valid reference IDs formed an invalid tuple:
a character version pointed to a location image, and the location was repeated.
Independent field enums cannot establish a relationship between IDs. Let the model
select unique subjects and let application code resolve the complete tuple from
saved approved evidence. Select compatibility from the saved preparation, never
from model output. Keep downstream currentness and asset checks. Evidence: the
retained Parent J11 failure and M4 output/dispatch tests. Promotion candidate:
**Documentation** for application-owned reference assembly.

## Distinguish inherited evidence from editable design

J09 copies approved J06 attire evidence unchanged. A Creator reviewer repeatedly
requested removal of an inherited note even though the editable design already
contained the requested appearance. Tell specialists and reviewers which fields
the application owns, and distinguish an earlier unknown detail from a binding
constraint. Preserve actual constraints and current image-lineage checks. Evidence:
the retained Creator J09 history, request-definition and hydration regressions.
Promotion candidate: **Documentation** for agent field ownership.

## Fence both dispatch and late cleanup when cancelling preparation

Pause can arrive while a text request is being prepared. Cancelling that local
attempt requires a transaction that fences dispatch, retains the operation and
proves no reservation, output or unresolved claim. A worker error arriving later
must recheck the exact cancellation before it blocks the run. Inspection failure
must preserve that cancellation too. Evidence: `experiment-undispatched-text.test.ts`
and the shared no-dispatch proof. Promotion candidate: **Documentation** for
concurrent control handling; no provider retry or persisted validity flag follows.

## Measure evidence reads separately from proof validation

Creator admission exhausted its existing budget while auditing retained Kid and
Parent runs. Granular phases measured 10,450/4,240 ms for full failed-proof reads
and only 99/64 ms for validation. Query batching alone did not establish live
success. Preserve complete failure evidence and distinguish transfer/read cost
from validation before changing checks. Shared-driver compression tests prove
lossless large reads, transactions and uncompressed fallback; local byte reduction
does not prove live latency. The subsequent live compressed attempt retained
approximately the same failed-proof read timings and still exhausted its budget.
Do not infer transfer cost from read duration alone. Measure returned evidence
volume and exclude only fields/rows that existing proof predicates do not consume.
Evidence: the [Creator checkpoint](M4-balanced.md#current-creator-admission-checkpoint)
and `mongodb-compression.test.ts`. Promotion candidate: **Documentation** for
bounded persistence diagnosis.

The operator's direct indexed query returned six full records in 12,495 ms and
IDs only in 370 ms. Most preparation data was request/context duplication.
Duplication can still protect a proof: this verifier compares the saved context
with the request message and legacy proofs hash the complete preparation. A
smaller response must preserve that comparison against storage in the same
snapshot before reconstructing omitted data. Local candidate tests demonstrate
exact reconstruction, corruption fallback and fresh retry evidence; they do not
establish a live speedup. Measure both the smaller response and the additional
comparison input before adoption. Evidence: `experiment-candidate-proofs.test.ts`
and the M4 candidate contract. Promotion candidate: **Documentation** for lossless
proof-read optimization.

The live candidate reduced combined Kid/Parent returned JSON by about 41%, with
all nine contexts matching and no fallback. Combined read time increased from
14,669 to 14,879 ms because the comparison request added 4,514/1,808 ms. Moving
duplicate text from a response into a verification command did not improve this
deployment's latency. Count both directions and all commands; a smaller response
alone is insufficient evidence to adopt an optimization. The measured gate kept
normal admission unchanged. Evidence: the M4 live-result table. Promotion target:
**Documentation** for measured persistence changes.

## Test the host's empty native-file conversion

The first Real Kid image request supplied no references. Dify 1.17.1 converted
the absent optional FILES input into `[None]`, so tests with only `None` and `[]`
did not cover the actual plugin boundary. The adapter rejected it before provider
dispatch. Normalize only that exact placeholder for a no-reference generation;
retain rejection of missing edit references and malformed lists. Include the
host's cast shape in fake-provider tests. Evidence: the
[first Kid checkpoint](M5-real.md#first-real-kid-checkpoint---2026-10-28) and the
twenty image-adapter cases. Promotion candidate: **Documentation** for native-file
compatibility verification.

## Resolve installed tool credentials through the supported runtime path

Dify 1.17.1 distinguishes an installed plugin from the workflow node's provider
type. Its `plugin` runtime returns the tool without resolving workspace credentials;
the `builtin` runtime loads the existing authorization for the same provider ID.
An installed package and a visible default authorization did not prove that the
generated node would receive credentials. Pin the supported node classification
in the graph contract. Evidence: the retained dev2 Kid pre-provider `credentials`
rejection, official ToolManager branches and focused graph tests. No image request
began. Promotion candidate: **Documentation** for Dify graph compatibility.

## Preserve complete graphs across tool boundaries

Large execution-tool output can truncate a string inside otherwise valid JSON.
During M5 publication preparation, graph source read through shell output lost
content. Validation caught this before any save. Use a direct local graph file
for submission, or bounded UTF-8 chunks with exact length checks. Compare the
saved and immutable published graph with the complete reviewed input. JSON
parsing alone does not prove content preservation. Evidence: eighteen M5 graph
and publication readbacks. Promotion candidate: **Documentation** for configuration
transport verification.

## Bound reviewer evidence to its current decision

A mid-run Creator reviewer exceeded the unchanged 32,000-token guard while its
context still included historical artifact bodies and repeated execution prompts.
Final reports already used a smaller current-version projection. Reuse that
projection for reviewers while retaining drafts, exact lettering, source identities,
approvals, saved feedback and revision counts. State omitted evidence explicitly;
missing historical bodies are not evidence of missing current creative work.
Evidence: the retained first-J12 count rejection and all-persona projection tests.
Smaller inputs do not guarantee a later provider count will fit. Promotion
candidate: **Documentation** for bounded agent evidence.
