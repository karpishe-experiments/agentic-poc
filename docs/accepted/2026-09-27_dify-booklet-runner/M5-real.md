# M5 — Staging transition and staged Real acceptance

**State:** Planned. **Coverage:** AC04–AC13.
**Predecessor:** [M4](M4-balanced.md). Apply [EXECUTION](EXECUTION.md).

For this milestone, "uninterrupted" means no manual data or output repair.
A recorded operator approval that extends a finite allowance may pause and
continue the same run; that approval alone does not invalidate acceptance.

Track private setup, any new reset and campaign permissions only in the
[readiness/manual-handoff register](EXECUTION.md#b-authorization-register).
Keep model/image proof and acceptance evidence here. Apply the
[three validation levels](EXECUTION.md#validation-levels-and-result-reuse):
focused checks during corrections, valid-result reuse at local commits, broader
affected checks and two clean reviews before publication. Paid/live acceptance
proof is still required; test reuse does not replace it.

M4 completed under its accepted Balanced criterion on 2026-10-27. M5 remains
planned. This plan update does not start runs, reset data, deploy changes or grant
paid execution authority.

The [M4 exit](M4-balanced.md#m4-exit-evidence---2026-10-27) records all three
original Balanced generations complete with reconciled accounting and zero paid
image calls. Kid and Parent retain terminal pre-generation tester count failures
and no dependent judge reports. Creator retains two current reports. None has
active or unresolved ownership. The original USD 5 campaign has 202 requests
and USD 0.661455 upper-bound exposure, including reserved liabilities. The
separate USD 1 Kid experience completed with two reports; it does not change the
original campaign disposition or authorize M5 spending.
The [context-policy activation checkpoint](M4-balanced.md#context-policy-activation-checkpoint--2026-10-25)
records reviewed dev5 installation, signature restoration and staging delivery.
New requests can use the saved 128,000-token amendment with a 32,000-token warning;
historical requests keep their original policy. Local compatibility tests and a
healthy deployment do not prove live amended generation, real-image support or
M5 readiness. The completed manager used the amendment with 555 counted input
tokens. A later reviewer succeeded with 34,048 input tokens and advisory warnings,
proving that live text path above 32,000. This does not establish real-image readiness.

The selected image target is `gpt-image-2.5-sunburst`, replacing the earlier
`gpt-image-2` planning target. Verify quality, dimensions, output format/count,
reference ordering, provider permissions, retry behavior and price limits before
choosing the M5 configuration. Do not carry Image 2 settings over as verified
Sunburst behavior. The M4 USD 5 budget covers its text campaign only; it grants
no image spending. See the [M4 selected policy](M4-balanced.md#selected-policy-and-implementation-contract---2026-10-13)
and [official model reference](https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst).

## Accepted M5 implementation sequence - pending delivery and paid grants

These packages set the M5 implementation order. They do not assert delivery or
authorize a paid call. Keep earlier M4 failure and recovery sections as historical
evidence; use the current exit above for readiness decisions.

| Package | Smallest useful result and verification |
| --- | --- |
| A. Close M4 | Reconcile the three retained read-only run snapshots and campaign accounting. Preserve the Kid/Parent failed advisory attempts, Creator reports and the separate Kid experience. Do not run another M4 persona, retry a report, reset data or add an infrastructure or performance gate. |
| B. Compact run cards | Show run title/persona, progress, generation and evaluation states, timestamps and wall duration, per-run settled and reserved upper-bound exposure, call counts and one attention reason with available actions. Place artifact detail before reports; collapse traces by default. Do not label campaign exposure as a run cost. Verify the saved detail and UI flow with focused tests and browser evidence. |
| C. Approval-only allowance | Add a versioned execution policy for new Balanced and Real runs, separate from the frozen M4 profile. Record each finite operator allowance and predecessor link in append-only history. Start with one new paid run per campaign; Parent and Creator need separate later grants. Keep current default ceilings of 120/160/220 text calls, 12/14/20 images, 300 steps and existing revision limits. Monetary, call, step, revision and no-progress exhaustion may pause pending approval. An explicit allowance must state new totals. Add a same-origin operator `POST /runs/:id/approval` endpoint with compare-and-swap, idempotency and a compact receipt. Resume does not grant allowance; callbacks cannot approve. An authenticated operator's UI approval is the decision; Codex may submit approval only after specific chat authorization. Approval cannot resolve an unknown outcome, edit saved data/output, renew a deadline or disguise a manual repair. Verify persistence and stale/duplicate requests. |
| D. Shared Real path | Add Real admission and paid-image pre-call reservation, uncertain-liability retention, attributable usage, original-byte output recovery, ordered reference transport and a judge that sees actual images. Disable automatic paid retries. Before a paid request, verify the selected `gpt-image-2.5-sunburst` model's configured provider capability, permissions, settings and price bound. The official model page does not prove installed Dify plugin `0.2.2` support. If unsupported, report the concrete constraint and an alternative for approval; do not silently select another model. Use fake-provider and focused contract checks before reviewed delivery. |
| E. Real Kid | Request a separate finite spending grant with an explicit amount for one 3-page-plus-cover Kid run, at most 120 text and 12 image calls. Use its first required image as the provider checkpoint, without a hidden paid probe. Verify images, lineage, approvals, both reports, bytes and accounting. An approval-only pause can resume the same run after authorization; manual data or output repair requires a retained failure and an authorized linked successor. Complete Kid-specific gaps before Parent; defer quality-only findings to M6. The earlier USD 1 Kid grant cannot fund this run. |
| F. Parent then Creator | After accepted Kid evidence, request separate finite grants based on measured exposure. Run Parent (5 pages plus cover, 160 text/14 image ceiling) and then Creator (8 pages plus cover, 220 text/20 image ceiling). Retain predecessor links, required multi-panel outputs, reports, approval provenance, bytes and usage. Advance only after each accepted run. |

Each reviewed release needs affected checks, lean CI and two independent clean
reviews. Reuse unchanged validation. Host shell suites apply only if a host
surface changes. No routine reset, infrastructure exercise or speed target is
part of M5 acceptance. The existing three-persona Real proposal remains a limit
framework, not a combined spending grant.

## Implementation checkpoint - 2026-10-27

Package A is complete from retained evidence. Package B adds compact list summaries,
per-run settled estimates and retained liabilities, local timestamps with UTC
metadata, stable terminal duration and current attention. Selected-run artifacts
precede reports; raw content and technical activity remain expandable. Historical
runs without terminal or accounting evidence remain usable with unavailable values.

Verification: 92 focused units passed, including receipt reconciliation, local
clock display and historical duration. Three disposable MongoDB Kid journeys passed
for completed reports and retained advisory failures, including stable repeated
completion acknowledgements. The isolated browser journey passed creation, detail,
Pause, saved page order, Resume, original asset access and completed duration with
no external provider traffic. Typecheck and focused ESLint passed.

Package C adds an immutable `execution_v1` technical profile, a separate explicit
finite allowance in one-run campaigns, pre-dispatch approval pauses, a new-only
tester revision request, atomic approval/decline history and an operator review
view. Approval queues a saved run after current ownership, source and accounting
checks. The historical M4 profile and request hashes remain unchanged. Real
admission remains closed pending Package D image-provider and liability work.

Package C verification: 107 focused units and 64 historical M4 contract units
passed; eight disposable MongoDB allowance cases passed with fake provider
readback and no provider POST. They cover a claimed tester request through
completion and approval, retained settled and held amounts, no-progress
threshold, simultaneous allowance exhaustion, duplicate approvals, concurrent
claim after repository reconstruction, and historical undispatched cancellation
after source changes. Typecheck, ESLint and production build passed. The isolated
waiting-for-approval browser case passed with mocked traffic. No new paid grant
or Real run exists.

Credential inventory impact: none. Packages B and C change inspection, terminal
metadata and execution allowances. Credential names, storage, transfer and
consumers remain unchanged.

## Three execution checkpoints

### Historical carry-forward review before the M4 exit

This table preserves the earlier readiness assessment. Its pending Creator and
M4-exit actions are superseded by the [retained exit](M4-balanced.md#m4-exit-evidence---2026-10-27).

| Boundary exposed during M4 | Delivered correction or retained limitation | M5 action |
| --- | --- | --- |
| Historical records grew both database responses and model inputs | Consumer projections, current creative contexts and separate size/phase diagnostics are delivered. The lossless proof-read candidate reduced bytes but failed its measured speed gate and was not adopted. Underlying external latency remains unconfirmed. | Reuse these corrections. Inspect saved warnings at normal checkpoints; investigate the measured phase if a new failure occurs. Do not make a speed target an acceptance gate. |
| Local efficiency targets stopped otherwise eligible text work | New amended requests warn above 32,000 authoritative tokens and enforce 128,000. Historical operations retain their saved policy and liabilities. | Verify the live amended Creator result at M4 exit. Carry exact policy identities and frozen-rate reservations into any separately approved Real configuration. |
| Removing efficiency limits exposed a smaller escaped HTTP boundary | Preparation now checks the same serialized authorization response as dispatch. Carrier and transport limits remain hard. | Include real reference transport in image-specific compatibility checks; text-only parity does not prove that path. |
| A saved control change could be hidden by a failed detail refresh | Receipts acknowledge tracked mutation completion; read-only reconciliation handles lost acknowledgements without a second mutation. | Preserve request keys and reconcile the same run/operation after interruption. Do not treat an observer timeout as a failed generation or permission to replay. |
| Advisory failure was confused with generation failure | Verified terminal advisory failures permit M4 completion; missing or unknown provider outcomes remain unresolved. | Preserve those M4 results. The separate Real acceptance requirements below still govern M5 reports and uninterrupted runs. |
| Technical continuations inherited an earlier creative-loop count | Verified continuations reset only the observation interval; the exact saved-manager recovery preserves history and the genuine loop limit. Its J12 fixture verifies original-byte rollback and retained-parent reuse. | Verify the live recovery and Creator outcome at M4 exit. Exercise recovery with the actual stage's dependency graph; transaction-local eligibility must precede readers that re-read saved state. |
| A repair depended on a release that could not drain past the retained failure | The decision repair passed local continuation tests and review, but normal delivery stopped on the same started tester operation. The existing recovery contract does not cover that semantic rejection. No drain exception or provider replay was used. | Resolve the exact recovery before M4 exit. For any M5 repair, test delivery from the failed serving release through recovery, normal drain/readiness and explicit continuation; a new-release repository test alone is insufficient. |

Remaining entry gaps are specific: separately authorized finite Real runs and
verified real-image configuration, reference
transport, original-byte retrieval and pre-call accounting. The shared runner
currently rejects `mode: real` in `lib/experiment-runner/http.ts`; the M4 policy
authorizes simulated images only. Readiness therefore requires reviewed Real
admission and image-policy support, not merely selecting a different model in
Dify. M4 text reservations and zero paid images do not prove paid-image liability
enforcement. Model availability, plugin support and prices remain unverified here.

Real admission requires coordinated changes to HTTP, repository creation/claims,
dispatch, image completion and generation verification. The current Dify image
workflow returns synthetic images; the older application's real-image path does
not establish experiment-runner support. Implement pre-call image reservations,
uncertain-liability retention and attributable settlement under a separate finite
grant. Read back effective child workflow and provider identities; a published
caller does not by itself pin a later child-tool binding.

Real judge input must also include the actual images required by this experiment's
PRD. Current M4 reports send text evidence and require simulated visual assessment
to remain `not_assessed`. Review the Real request, schema, transport and accounting
contracts together rather than removing that limitation from simulated evidence.

| Checkpoint | Work | Exit |
| --- | --- | --- |
| 1. Confirm readiness once | Reconcile M4 successes, published bindings, actual reference-image transport, provider accounting and model/token/retry settings. Reuse valid evidence; run missing or invalidated non-billable checks. Request the first finite Kid grant after readiness. | Exact configuration and permissions are recorded; Kid allowance is explicit. |
| 2. Run the ordered Real campaign | Kid 3 pages → Parent 5 pages → Creator 8 pages, each plus cover. Use the same completion checklist for each. Advance only after an uninterrupted successful run. | Three successful runs retain all required artifacts, approvals, reports and durable images within limits. |
| 3. Record evidence and hand off | Keep one concise M5 exit record linking runs, configuration, assets, usage, failures and successors. Defer quality-only improvements to M6. | Retained evidence supports PRD Real acceptance. |

The requirements below support these checkpoints, not another release sequence.
Keep production and Cloud resources unchanged. Reuse the recorded staging reset
and the verified M4 release when they still satisfy the prerequisites.

## Checkpoint 1 — Readiness and authorization

Reconcile M4's tested release, usage and provider bindings. Require completed
generation and accounting for all three Balanced personas under the accepted M4
criterion, with evaluation complete or a verified advisory failure explicitly
recorded. Do not require replay of failed advisory reports. Reuse the valid
simulated recovery suite. Verify actual reference-image
transport, model availability evidence and request accounting. Official image
API capability is not proof that the configured Dify plugin supports it.

Resolve the required rows in the shared readiness register and consolidate only
remaining private actions/approvals before starting. Propose the three
ordered runs with zero successors by default. This is a proposal, not spending
authorization:

| Case | LLM ceiling | Real image ceiling | Baseline outputs |
| --- | ---: | ---: | ---: |
| 3 pages + cover | 120 | 12 | 9 |
| 5 pages + cover | 160 | 14 | 11 |
| 8 pages + cover | 220 | 20 | 15 |

Baseline outputs are not request ceilings. The aggregate for one run of each is
at most 500 LLM and 46 image requests. Any successor allowance
must be explicitly finite and added to that aggregate. No exact dollar cap is
claimed without an independently enforceable mechanism.

If the operator authorizes no successors, Codex can diagnose/repair without paid
calls but must pause before an extra Real run. Unattended execution never means
unlimited spending. Do not consume acceptance allowance on a hidden preflight call.
Request Parent and Creator grants separately after the preceding accepted run.

### Baseline check — no routine reset

The staging reset is recorded as completed on 2026-10-04 in
[EXECUTION](EXECUTION.md#b-authorization-register). Verify its evidence and
current applicability; do not repeat it merely because M5 starts. The conditional
reset procedure below applies only if a new reset is necessary and separately
authorized for exact targets. Preserve all M1–M4 records and assets first.

1. Check whether the required reset already happened in an earlier milestone.
   Never reset again merely because M5 starts; preserve the new runner's failures,
   Balanced evidence and configuration history.
2. Before the first reset only, save a sanitized prior-trial summary and private
   backup. Identify exact local database/asset root and staging `kids_booklet`,
   actual asset bucket and recovery backup ID. Verify production uses distinct
   targets. Existing reset deletes the full asset bucket; if it is shared, correct
   the reset to an explicitly owned prefix before execution or stop for direction.
3. Confirm new initialization no longer requires/seeds local runtime agents and
   readiness accepts the new schema. Deploy that compatible initializer before
   executing its reset, not an older reset that reseeds the retired runtime.
4. Use the existing serialized Reset staging workflow on `_staging` with exact
   database confirmation after authorization. Observe its actual run/host state.
   Never issue ad hoc database/drop or bucket-wipe commands as a shortcut.
5. Verify new database structure, assets and authenticated readiness. Record what
   was removed and recovery backup/retention. Do not delete existing Dify apps.

If reset is deferred until M5, preserve M1–M4 evidence and records outside the reset
targets first and restore their inspectable archive links; do not claim retained
failed-run history while erasing it. Prefer performing the one clean-baseline reset
before the first durable staging runner case to avoid this extra work.

### Release check — no routine redeployment

Reuse the verified M4 release if code, configuration, bindings and environment
assumptions are unchanged. Reuse valid simulated/Balanced proof; recheck changed
paths and image-specific capabilities, not the entire unchanged campaign.
Deploy only required changes after affected validation and two consecutive clean
independent reviews. Follow authorized PR/CI/staging delivery and Check deployment
through EXECUTION D; Dify-only changes do not redeploy unchanged application code.
Stop new dispatch and reconcile active/uncertain work before configuration changes.
Read back
the exact Dify publication/tool version. Confirm old app API credentials are not
mistakenly calling the trial workflow. New run remains unstarted during checks.

For missing or invalidated evidence, verify with simulated requests: callback auth, state/approval rejection, current
bindings, byte recovery, zero duplicate execution, asset retrieval and stable
reference membership. Confirm no unresolved run or host operation is active.
Record current model/token/retry settings and disable controllable paid retries.

## Checkpoint 2 — Ordered Real campaign

Use one completion checklist per persona: all thirteen responsibilities, required
style samples/reference sheets and page/cover counts; exact approved versions and
per-page approval/delegation provenance; unchanged style module, exact lettering
and relevant reference routing; tester/judge reports; durable bytes after reload
and process-independent retrieval; request reservations, usage and no manual repair.
Creative inconsistencies remain warnings. Missing/corrupt outputs, invalid
authorization and exhausted limits remain technical blockers.

1. Create the Kid 3-page Real case through the runner after its separate finite
   grant. Freeze configuration evidence
   at run start. Let Dify tester drive all choices/approvals/delegation; Codex only
   observes. Do not manually repair this run and retain it as uninterrupted.
2. Observe saved status and trace IDs periodically. When a call exceeds observation
   time, inspect the same task; do not start another run/call. An uncertain paid
   result must be recovered or conclusively resolved before another request.
3. On completion verify all 9 initial required assets (or their current revised
   replacements), cover + 3 pages, approved exact versions, reports, actual byte
   retrieval, counts within caps and no operator repair. Browser-inspect saved
   booklet and run history; quality inconsistencies are warnings, not rejection.
4. On technical failure retain evidence. Pause progression, diagnose, fix within
   scope, rerun affected simulated/Balanced verification, complete two consecutive
   clean independent reviews and publish the correction. Paid Balanced reruns also need remaining
   campaign authority. Start a linked successor only within authorized allowance.
   An approval-only allowance pause may continue the same run after a specific
   recorded grant; it cannot repair saved data/output or resolve an unknown call.
5. Advance only after an uninterrupted successful Kid run. Repeat for Parent
   5 pages (11 initial outputs, one two-panel page), then Creator 8 pages
   (15 initial outputs, at least two multi-panel pages).
6. Never raise a per-run limit, reset a request counter or reset the project to
   conceal a failure. Quality-only suggestions may wait for M6.

## Checkpoint 3 — Evidence and M6 handoff

Retain one uninterrupted successful Real run per persona, in order, with normal
booklet IDs, all source and final assets, reports, configuration publication IDs,
call reservations/usage, approvals/delegations and predecessor links. Verify
durable image bytes after a page reload and process-independent retrieval.
Record review/CI/deploy/check IDs and browser observations. Distinguish actual cost,
estimated cost and missing cost; no invented figures.

M5 passes only when these three runs meet PRD acceptance. Do not call a repaired
in-place run uninterrupted. Update M6 with the retained baseline and ranked
agent-improvement opportunities; preserve all campaign evidence. Keep one concise
exit record in this document; do not add a report hierarchy.

For plan changes, verify PRD/roadmap consistency, local links, whitespace and
documentation-only validation selection; obtain an independent read-only review.
No runtime change, reset, deployment or paid execution is part of this revision.
