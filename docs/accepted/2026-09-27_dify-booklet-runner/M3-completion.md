# M3 — Pages, runner UI and advisory evaluation

**State:** In progress; full-booklet acceptance remains pending. **Coverage:** J11–J13; AC01–AC02, AC05–AC07, AC10–AC12.
**Predecessor:** [M2](M2-references.md). Apply [EXECUTION](EXECUTION.md).

Track missing private bindings and permissions only in the
[readiness/manual-handoff register](EXECUTION.md#b-authorization-register).
Keep technical readiness and acceptance evidence here. Apply the
[three validation levels](EXECUTION.md#validation-levels-and-result-reuse);
use named cases/small suites per edit and reuse valid results at local commits.
Broad affected validation and two clean reviews belong to the frozen publication
candidate, not every implementation increment.

## Compact remaining delivery

### Current progress and blockers — 2026-10-12

This section is the current status. Later evidence supersedes earlier statements
that key preparation, collaboration repair or async restart proof are pending.
Keep historical run identities and failures; do not repeat completed private setup.

| Checkpoint | Current result | Remaining work |
| --- | --- | --- |
| Recovery candidate | PR #183 merged to master as `6d10daa2cd4b0327c31c1357535be723b67be95f`. CI `38282476173` passed in 133 seconds with unit/static/contract checks and both full Linux host suites. Five-minute budgets, stop/inspection, two-stage drain, retained mutation owners, atomic materialization, setup resume, probe preflight and paginated observation are implemented. | Finish staging delivery compatibility and its required CI. No live success is claimed. |
| Staging transition | Retained request `38149230374-1` and the exact stale Parent item/job remain the known live blocker. The installed application lacks the new drain contract. | Synchronize the reviewed dispatcher, use the explicit backup-protected legacy bootstrap, then deploy the compatible reviewed candidate. Preserve the original journal and checkpoint. |
| Model-free proof | Earlier 43.8-second same-operation restart recovery and collaboration health remain valid baseline evidence. | Prove stall, stop, restart, output recovery and active-callback drain against the new lifecycle candidate. |
| Persona acceptance | Kid functional acceptance is retained. Parent attempts 1/3 and 2/3 failed and remain saved. | Run Parent 3/3 only after the probes pass. Stop if it fails; Creator follows Parent success. No paid calls. |

Private bindings are already prepared. Pending operator actions belong only in
the [readiness register](EXECUTION.md#b-authorization-register). Daily Dify backups
and restore rehearsal remain deferred follow-up, not M3 gates.

The required Linux CI run `38258080043` exposed a multi-batch MongoDB cursor
error during selected two-page completion. The saved image was valid; a
session-only timeout produced an invalid `maxTimeMS` on `getMore`. The correction
uses a collection-level timeout default for transactional find/aggregate cursors,
without changing provider execution, approvals or request limits. The previously
failing selected-page case passed locally. A dedicated regression forces both
cursor types through multiple batches. Required CI and live proof remain gates.

Run `38270332034` passed the selected-page regression and then exposed an outdated
runtime lookup assertion. Recovery tests now check cancellation/deadline options
and the coordinator's before/after-stop observations without relaxing no-replay
checks. PR CI no longer includes unchanged slow persona-journey files by default;
changed files still run, and existing full validation retains all journeys.
The collection wrapper retains the method resolved at access time, so scoped
cursor receivers do not bypass instrumentation or recurse through retry spies.
The two-file local run passed 104 of 109 tests in 581 seconds. All five remaining
failures passed after this correction; the multi-batch cursor regression and six
budget unit tests also passed. Typecheck and focused lint passed. These local
results do not replace the pending required CI or live lifecycle probes.

The final local failure-collection pass reused the two completed application files
from CI `38274683098` and ran the other 118 selected files serially with no retries.
It finished in 611 seconds: 850 tests passed and eight failed. The complete
reference-generation file passed with its selectable-card wait. The eight failures
were stale ten-minute expectations, a global clock mock that also expired MongoDB
I/O, a synthetic-epoch operation tested through a wall-clock HTTP handler, and an
expectation of an unsanitized provider error. Corrections retain five-minute
deadlines and sanitized diagnostics. Repository elapsed-time injection isolates
lease tests from the driver clock; the production default is unchanged.
All 39 focused finalization, image HTTP, diagnostic, repository and lifecycle tests
then passed. Typecheck and focused lint passed. The other passing files are reused;
required Linux host suites and live lifecycle probes remain pending.
Credential inventory impact: none; these corrections change no credential names,
storage, transfers or consumers.

Linux CI `38278889955` passed selected application tests, then exposed a shell
test clock collision: an expired deadline of zero means disabled, not expired.
The bounded-control fixture now starts its clock above zero. Runtime behavior is
unchanged. Follow-up CI `38280232207` passed, including both full Linux host suites.
The later user-requested CI policy removes routine integration campaigns from PR
checks; focused local regressions and manual full validation remain available.
The unit-only configuration passed 80 files/537 tests in 96 seconds locally,
without MongoDB startup. Selector regression checks cover PR deferral, explicit
manual affected integration and retained full-suite execution.

Local checks for this increment: preparation/dispatch regression passed 26 cases;
the final interrupted-owner drain regression passed 13 cases serially. Probe
preflight/bootstrap passed 11 cases; API ownership passed 15; the affected
UI/recovery/storage/budget selection passed 55. Typecheck, lint and all 12 agent
fixtures passed. Filesystem cancellation/budget checks passed 7 cases; affected
deployment/transport/CLI contracts passed 43. Independent review found legacy
saved-card recovery, callback ownership and private-checkpoint inventory gaps.
The candidate corrects these gaps and fences selection against a concurrent
Change agents action. Startup-order checks passed 4 cases; saved-image recovery
passed 3, including an interrupted materialization with no image-provider replay.
Standard `npm.cmd run typecheck` and `npm.cmd run lint` passed after those
corrections. A second review found two additional recovery gaps: named host
containers could appear absent after failed cleanup, and a completed card could
commit before its batch. The candidate now checks exact container identity and
commits the card, message projection and owned batch atomically. Historical
partial commits require exact selected-output evidence; image recovery resumes
only deterministic bookkeeping. The two focused legacy files passed all 15
cases after this correction. Six focused host scenarios, shell syntax checks and
CI-level ShellCheck passed. All five restart regressions passed, including a
direct check that terminal-batch reconciliation makes no provider call.
Review A then identified a crash window before image continuation. The correction
persists pending continuation with completion, rediscovers it after restart, and
clears it only after saved artifact/card finalization. The two focused legacy
files passed all 15 cases, including fresh recovery and stale-output protection.
Review B also identified older card-only text results without exact completion
proof. Recovery now retains their selected identities, shows an unresolved warning
and blocks automatic replay. The earlier 15 passing legacy cases cover
running-card saved-image recovery without provider replay; they do not prove the
new unresolved text fallback. The final focused text file passed 14 cases,
including explicit historical intake and quality-result recovery. These cases
retain selected identities, canonical output and existing unlinked quality
evidence, show only the unresolved warning and Change agents action, and verify
stable repeated startup without provider execution or new artifacts. The command
was `npx.cmd vitest run tests/integration/parallel-agent-execution.test.ts --bail=1
--retry=0`, with fake text/image providers and a non-secret test key (20.55 seconds).
The final image-selection correction retains the original selected candidate
when a saved generation output already exists. A conflicting candidate cannot
replace that output. The image integration file passed 4 cases and the text file
passed 14 cases with fake providers and a non-secret test key. Typecheck and
focused lint passed after this correction. These results remain local evidence;
the frozen candidate still requires Linux host CI and deployed lifecycle probes.
These corrections reset the clean-review count to
zero; two consecutive clean re-reviews remain publication gates.
These results do not replace Linux host CI or live probes.

The package review after repeated blockers found that legacy recovery shortcuts
had crossed text/image boundaries and discarded candidate identity while reusing
batch-level output. Sole-candidate tests did not expose a changed explicit
selection. The running-card completion shortcut is now image-only. Text recovery
retains the original item, selection mode and response, then restores its decision
card against the same saved version. A second candidate cannot claim that output.
Focused regressions cover sole and explicit selections without a provider call.
The final text integration file passed 16 cases; typecheck and scoped lint passed.
Final reviews must inspect the complete lifecycle, including the interval between
output persistence, card projection, batch completion and continuation. Apply the
shared repeated-blocker rule before further correction cycles.

Disposable probes use the existing runner CLI with exact `--probe-app-id` and
`--probe-publication` on create. Its read-only preflight validates the live binding,
callback configuration, idle admission and response schema before the single POST.
Workspace secret-variable presence must be checked through authenticated Dify
control where observable; a valid runtime key does not prove that variable exists.
Preflight failure creates no run. Keep callback-first, missing-field and delayed
observation regressions local before consuming a live probe identity.

Use three checkpoints for the remaining M3 work. This sequence consolidates
delivery, not the PRD requirements or completion evidence. The detailed contracts
and verified evidence below support these checkpoints, not a separate release
sequence. Current entry gates remain mandatory: prove runtime-key file ownership,
ordered references, size limits and lost-response recovery before J13 dispatch.
This plan update does not start implementation, publish Dify
configuration, activate bindings or authorize new execution.

| Checkpoint | Work | Exit evidence |
| --- | --- | --- |
| 1. Finish one runnable candidate | Wire separate tester feedback and judge execution, generation/evaluation status and recovery. Reuse existing artifact/image viewers. Add a minimal single-page or ordered-batch selector, progress and Pause/Resume; retain individual page approvals. Finish compatible Dify graph/settings/host-validation changes and consolidate only missing private bindings into one handoff. | Focused contracts and integration checks cover reports, completion, exact sources/references, approvals, limits and recovery. Existing working bindings and saved evidence remain intact; unresolved live dependencies are explicit. |
| 2. Review and release one candidate | Freeze application code, Dify graphs and non-secret binding evidence together. Run one affected validation set and two consecutive independent clean reviews. Publish/read back workflows and synchronize applicable Workflow Tools, then use the reviewed staging delivery and drained binding-activation process. | Required CI, exact reviewed/published identities, synchronized applicable tool bindings and staging health pass. Stop new dispatch and reconcile in-flight/unknown work before changing configuration; Pause alone is not a drain. Private setup and release actions still require their existing authorization checkpoints. |
| 3. Verify and record one acceptance campaign | Complete all three cases through actual deployed Dify in Simulated mode. Combine browser inspection, targeted failure/recovery checks and sanitized evidence capture in the same campaign. Correct defects and rerun affected checks/reviews; use linked successors rather than rewriting failed runs. | All thirteen responsibilities, required current artifacts and images, individual approvals, tester/judge reports and durable lineage are saved. Zero real provider calls, warning-bearing completion, UI controls and no uncertain-operation replay are verified. Record limitations and hand off to M4. |

### Simplifications and retained boundaries

- **Reports:** use short structured reports with exact version references. Keep
  tester feedback separate from the independent judge. Simulated creative/visual
  assessment is explicitly `not_assessed`; retain warning and interaction-flow
  evidence without claiming human usability or real model judgement. No scoring
  framework or passing quality score is needed.
- **UI:** reuse saved booklet/artifact/image views and provide the basic selector,
  progress, warnings, history, reports and Pause/Resume. Defer richer dashboards,
  presentation polish and new agent-authoring tools, not required inspection.
- **Tests:** use one representative end-to-end case per failure mechanism where
  the execution path is shared. Use focused contracts for persona differences;
  add another recovery case only for a materially different path. All three
  deployed happy-path cases and the required failure scenarios still need proof.
- **Documentation:** keep one concise M3 exit record with evidence links and
  remaining limitations in this document. Do not create another report hierarchy.
- **Release:** aim for one candidate and staging release cycle. A discovered
  defect requires correction plus affected validation and the two-review cycle
  before republishing. A successful run alone does not require another deployment.

Do not relax thirteen specialist responsibilities, persona-adaptive delegation,
per-page approvals, exact lettering/style/reference routing, request limits,
durable outputs, unknown-outcome recovery, production/Cloud isolation or the
required reviews. Local runtime mocks cannot replace deployed Dify acceptance.
Baseline images remain 9/11/15 per case, including style samples, reference sheets,
story pages and cover; retain additional revision assets as history. Balanced/Real
readiness, paid runs, PDF and production hardening are outside M3. No reset or paid
call is part of this compact delivery.

## Current entry readiness

### Final module preparation and live judge draft

The existing `scripts/prepare-dify-booklet-module.ts` now accepts `m3-j13`.
It prepares separate manager, persona tester, J11, J12 and judge graphs and
the existing image module with final-page reference inputs. Earlier profiles
and app names remain unchanged. The helper reads no credentials and does not
publish or execute a workflow. Twelve graph/Python parity tests passed (3.96
seconds, no retries); after a profile type correction, all six affected helper
tests passed again (2.63 seconds). Focused lint, current-source typecheck and
independent review passed. The typecheck excludes ignored output copies and
stale `.next` inputs; it is not a standard typecheck pass.

Community MCP inventory reverified the intended host/workspace on 2026-10-06.
The new independent `issue65_m3_judge` draft is
`89f1adcd-1073-460d-98a3-e4df35c4263c`. MCP graph validation against Community
defaults returned no errors or warnings. Draft synchronization and readback
retained nine nodes and hash
`622a1193ef20230aaba91c4b78aaa28c97f1d4f9c4faa25ea999b3276e6b8f55`.
`BOOKLET_ORIGIN` is the reviewed staging origin; `BOOKLET_TOOL_KEY` remains an
empty Secret placeholder. The version list is empty. No workflow was executed
or published. Private J12/judge key preparation, eighteen-slot upload/host
validation, publication reviews and deployed acceptance remain pending.

### Final binding preparation candidate

The existing J12 preparation helper now has a `m3-j13` profile. It reuses the
sixteen-binding M3 file, or the seventeen-binding J12 file if present, and
collects only missing J12/judge keys with the existing callback key. It writes a
separate encrypted eighteen-binding file without overwriting prior files.
The local file-presence check found the sixteen-binding file only; no private
contents were read. Operator preparation remains pending in the
[canonical register](EXECUTION.md#b-authorization-register).

The existing uploader accepts an eighteen-publication `m3-j13` manifest and adds
`finalPageIllustration: true` only to its image binding. Its earlier profiles
remain unchanged. Focused synthetic PowerShell tests passed for legacy profiles,
both final-source paths, clipboard retry, preview isolation, malformed source
rejection and no-overwrite behavior. No real private file, upload, workflow or
host operation ran in these tests.

The host validator candidate now accepts the same complete eighteen-slot
profile, requires the final-page image flag, and rejects misplaced/false flags,
duplicate identities and extra fields. The focused staging-runner shell fixture,
Bash syntax and ShellCheck passed. Both full shell suites were attempted on
Windows: deployment-script stopped at existing Python-alias/symlink fixtures;
host tests stopped at an existing `mkdir -m` permission fixture. Neither full
suite passed. Required Linux CI must verify both before merge or deployment.
All eleven isolated deployment contracts passed (2.05 seconds, no retries),
and the implementation-loop independent review passed. Local link targets in
the five changed documents passed. This is not a full-suite or frozen-publication
review result.
These results do not establish deployed readiness or permit activation before
the frozen-candidate reviews, published readback and maintenance checkpoints.

### Local evaluation context readiness

Claimed tester and judge operations can retrieve verified generation evidence,
current artifacts, creator dialogue, warnings, counters and durable image
identities. Context retrieval does not approve artifacts, save a report or
complete the run. Report saving still requires publication verification and
rechecks the saved evidence. Unknown judge operations use the verified read-only
recovery path; no workflow replay is required.

The focused Kid J13 journey with eighteen bindings and the pre-generation judge
rejection case passed (two tests, 33.49 seconds, no retries). The journey includes
separate tester/judge reports and publication rejection/recovery. Twelve
routing/report fixture unit checks and focused lint passed. The current-source
typecheck passed with ignored output copies and stale `.next` inputs excluded;
this is not a standard typecheck pass.
Deterministic reports retain exact versions and mark creative assessment as
`not_assessed`; they do not claim image inspection. Automatic evaluation
dispatch and final completion were pending at this context checkpoint; the local
completion evidence below supersedes those two items. UI selection and deployed
acceptance remain pending.
This evidence applies to the local candidate, not a published configuration.

### Local automatic completion evidence

The eighteen-binding dispatcher now records generation success separately from
evaluation. It verifies current artifacts, approvals and durable bytes, stores
the exact generation versions and cover, then dispatches tester feedback and the
independent judge. Final run completion requires both exact verified reports.
Saved generation cannot be revised in place. Shorter saved profiles retain their
slice boundaries.

Three focused cases passed (66.12 seconds, no retries): automatic Kid completion,
direct evaluator admission/report ordering, and the existing Kid report-context
and approval journey. They cover reports before the saved generation marker,
judge-before-tester and duplicate evaluator rejection, missing reports, rejected
post-generation manager work, Pause/Resume before evaluation, lost judge response
recovery without replay, zero payable counters and idempotent final completion.
Focused lint and current-source typecheck passed; the
latter excludes ignored output copies and stale `.next` inputs. These are local
runtime fixtures, not proof of deployed Dify completion. Published judge/tester
graphs, bindings, UI inspection and the deployed all-persona campaign remain
publication/acceptance work.

The existing runner inspector now shows generation and evaluation separately,
links to the saved booklet and retains tester/judge report details with operation,
workflow, publication and current-versus-historical version evidence. Ten UI unit
checks passed. This is component-fixture evidence; browser and staging checks
remain pending. The local selector evidence below supersedes the earlier
unfinished UI status; deployed selector inspection remains pending.

Batch admission now rejects new selections after the saved generation marker,
including while advisory evaluation is pending. Existing duplicate selections
remain read-only lookups. The browser page-selection endpoint uses existing
authentication, origin, maintenance and transactional source checks. A drained
paused run can save selection intent without resuming or dispatching work.
All eleven batch-repository integration tests passed without retries (15.22
seconds), including browser-to-persistence selection and duplicate lookup.
Source verification is mocked in this suite; deployed readiness remains pending.
Eleven HTTP boundary tests passed (3.02 seconds), including staging authentication,
origin, disabled state, malformed input and maintenance admission.

The local selector now records click order for one page or a selected batch.
It appears only after current Page Bible readiness in a drained paused run;
saving does not Resume. Twelve runner UI tests passed (5.77 seconds), including
ordered submission and uncertain-response handling with no automatic replay.
The existing Parent selected-batch dispatch fixture passed (24.41 seconds,
no retries) with real saved artifact/approval/byte verification: paused projection,
selection, no dispatch while paused, explicit Resume, pages 3 then 1 and separate
results/approvals. Focused lint and current-source typecheck passed; the latter
excludes ignored output copies and stale `.next` inputs. This is local fixture
evidence, not deployed Dify or browser acceptance.

All three live Simulated M2 cases reached approved reference packages on
2026-10-05; see [M2 evidence](M2-references.md#current-live-reference-evidence--2026-10-05).
The next dependent gate is ordered reference-file transport. The current image
workflow proves binary output storage, not input attachment or judge image access.
Use a separate model-free probe to verify file count, order, identities, byte
digests and measured size limits before final-page dispatch. Administrative MCP
file access is not proof of Booklet runtime-credential access. No paid call is
needed for this check.

## Entry gate

### Model-free file-input probe evidence — 2026-10-05

The separate draft `issue65_m3_file_input_probe`, app
`64e99154-2e1d-4d87-a52e-fb43854325fd`, contains only Start and End nodes.
Its candidate [DSL](dify/m3-file-input-probe.json) passes an ordered custom
`file-list` input directly to output. Fifteen distinct synthetic 8×8 PNG files
were uploaded through administrative MCP. No provider or callback was invoked.

| Input count | Retained draft run | Observed result |
| --- | --- | --- |
| 4 | `1fa351e8-5685-4e81-a233-12aed59a2155` | Succeeded; order, identities and downloaded byte digests matched |
| 9 | `aef4c8ca-1f18-4160-8612-19feec697552` | Succeeded; count and order matched; byte verification remains pending |
| 11 | `fa25a669-b9c4-49de-8d5d-f0a8eba7c9e0` | Succeeded; count and order matched; byte verification remains pending |
| 15 | `75514ace-326b-4eef-9ef6-95d25976ffed` | Succeeded; count and order matched; byte verification remains pending |
| 16 | `3003eb1f-0a0f-4a1b-8f29-578c2f70063d` | Failed at the configured 15-file input bound; zero reported tokens |

The sixteen-input check reused one file identity to exceed the configured count;
it does not establish a distinct-file or universal platform limit. All five runs
reported zero tokens. The draft limit permits fifteen files and rejects sixteen.
Two focused DSL contract tests passed without retries.

The follow-up administrative draft run
`808c81dd-7ee2-4e2e-aa6a-ce5e943679ce` returned the same fifteen uploaded file
identities in order, with zero reported tokens. Immediate downloads matched all
fifteen original SHA-256 digests and byte lengths (95–97 bytes each; 1,445 bytes
total). This is a new model-free Start/End probe using existing uploads, not
image regeneration or recovery of the older trace's rejected links. It proves
immediate transfer of this small fixture set only.

A later download attempt using URLs retained in the nine-file trace was rejected.
The cause is not yet verified; signed-link expiry is a hypothesis, not a finding.
Do not retain signed URLs as durable asset locations or replay generation to obtain
another URL. Booklet must retain original bytes in its AssetStore and use stable
file identities for subsequent operations. Verify the recovery path separately.

This is administrative draft evidence only. Publication, application-key upload
with consistent end-user ownership, measured size limits and judge/provider image
access remain pending. These results do not clear final-page dispatch readiness.

Reconcile M2's subject artifacts, accepted references, image transport and grant
rules. Require all three simulated reference-package exits. Verify Dify file
inputs can carry the relevant reference set and judge image set using fixture
requests, without a paid provider. Resolve attachment/size limits before coding
around them. Bundle any private binding/login handoff and staging grants up front.

## Page contracts to finalize at entry

Read pinned Ali guidelines 11–13. Manuscript units are not physical pages.

### Independent local preparation: API driver

`scripts/experiment-runner.ts` uses the same create, list/detail and Pause/Resume
APIs as the UI. It supports only Simulated mode and the staging or loopback
origin. Mutations default to preview and require `--apply`; credentials come
privately from `BOOKLET_RUNNER_PASSWORD`, never a command argument. Create requires
an explicit retained request ID. Control requires the exact observed revision.
The driver sends no automatic retry and reports unknown mutation outcomes with
their identifier. Its allowlisted projection includes operation/workflow IDs,
artifact versions and zero-payable counters, not prompts or credentials.

This preparation can proceed while browser connectivity or live M2 evidence is
pending. Observation is not an acceptance assertion: the driver does not yet
verify saved image bytes, page completion or reports, and does not clear the M3
entry gate. Full acceptance assertions and the sequential all-persona campaign
remain later driver work. Focused driver/API unit tests are local evidence only.

### Independent local preparation: page-contract parser

This package can proceed before live M2 exits. It does not clear the entry gate
for page dispatch, publication or staging acceptance. Guidelines 11–13 were read
at pinned commit `631f547ec3f7ce375f740dd6f2b1b9aaebbde940`; retain their
responsibilities with the PRD's cover/story-only and warning-based adaptations.

| Field | Bounded slice |
| --- | --- |
| Goal and components | Add `lib/contracts/experiment-pages.ts` and `tests/unit/experiment-runner-page-contracts.test.ts`. Reuse Zod, opaque IDs and exact style-module hashing. Do not change runtime task admission, persistence or bindings. |
| Contract and examples | Parse J11 layout proposals and J12 per-page proposals. Kid has cover index 0 plus three single-scene pages; Parent has five story pages with one two-panel page; Creator has eight with at least two multi-panel pages. A proposal uses page indices, not invented durable page IDs. J12 names an application-supplied page ID, exact source-version IDs and approved sheet asset references. Preserve lettering whitespace and explicitly represent text-free panels. |
| Ordered edits | Define J11 canvas fields for trim/orientation/aspect ratio, working pixels, bleed, binding, live-text safe margins and reading direction. Define typography entries for narration, speech, thought, sound effects, titles, credits and diegetic text, each with font direction, size hierarchy, container/bubble treatment and placement rules. Define ordered page/panel allocations, manuscript-unit IDs, text capacity, page-turn rhythm, routed sheet references and deferred composition decisions. J12 records action/emotional beat and composition per panel; each lettering item retains exact wording, form, speaker (nullable where not applicable), panel assignment, placement and typography/bubble treatment. Define J11/J12 parsers with structural checks and preferred-length warnings; add synthetic cases. Keep subject/source existence and approval checks outside the parser for the later repository slice. |
| Verification | Run `npx.cmd vitest run tests/unit/experiment-runner-page-contracts.test.ts tests/unit/experiment-runner-reference-contracts.test.ts --bail=1 --retry=0`, `npm.cmd run typecheck` and `npm.cmd run lint` in a clean validation checkout if generated inputs in the main checkout are stale. Tests cover duplicate page/panel identities, exact lettering, explicit no-text, source/reference shape, fixed case counts and multi-panel requirements. |
| Completion and escalation | Finish on validated local shapes and two independent reviews only. Do not claim saved page identity, reference transport, approval, generation or live completion. Escalate a changed creative contract; leave measured attachment limits pending until the model-free Dify probe. J13 request/build contracts follow verified page identity and transport contracts. |

This parser package is preparation, not a substitute for any J11–J13 specialist
or the deployed all-persona simulation. Parser checks are local evidence only;
they do not clear the live entry gate.

Every J12 panel explicitly routes its manuscript-unit IDs and relevant sheet
subject IDs, artifact-version IDs and asset IDs. Missing required instructions
fail parsing; imperfect later rendering remains a warning. Tests must omit each
required canvas/typography/lettering field, reject absent panel source routing,
and prove that exact wording survives parsing. J11 proposal page indices do not
create identities; J12 receives Booklet-owned page IDs from its input context.

The local parser candidate passed 18 tests across the page and existing
reference-contract suites without retries
on 2026-10-05. The sandboxed test attempt failed before execution with `EPERM`;
the permitted clean-checkout run passed. No runtime admission, persistence,
Dify binding or provider execution changed. Independent code reviews and
publication were completed in [PR #130](https://github.com/karpishe-experiments/agentic-poc/pull/130); these tests do not establish live M3 readiness.
Review corrections permit explicitly empty routing for source-free panels,
require title lettering on the cover and test the aggregate content-size limit.
Final clean-checkout typecheck and full lint passed after these corrections.

- J11 book artifact: fixed geometry/canvas, typography/bubble system, safe regions,
  ordered physical pages including cover, panels per page, narrative-unit mapping,
  and subject/reference routing. Default square canvas; physical page IDs are
  assigned once by Booklet. Parent has one two-panel page; Creator has at least two
  multi-panel pages. A panel is composition inside one image, not another image job.
- J12 page-subject artifact: ordered panels with action/composition, character and
  location IDs, exact lettering elements (kind/text/speaker/placement), reference
  IDs, and exact accepted source versions. Require J11 and all applicable sources.
- J13 page-subject artifact: assembled prompt, unchanged style hash, ordered
  reference roles, input versions, job/operation IDs, candidate/final asset lineage,
  warning list and current per-page approval. Require accepted J12 for that page.

Cover is page index zero and participates in J11–J13, including title lettering
and approval. It is not a fourteenth specialist or an export package. Completion
requires exactly cover + 3/5/8 story page assets and current approvals, plus the
earlier required artifacts/reference assets. No PDF/ready-for-export transition.

Store exact source text in request evidence; do not normalize approved lettering
while assembling prompts. Incorrect rendering is reported as a warning. A missing
text field or reference is a structural error before the request. Use every relevant
approved reference and no unrelated subject's reference. Do not substitute textual
descriptions when the configured image path cannot accept image references.

## Scheduling, review and evaluation

### J11 local implementation package

Extend the existing operation repository, context service and dispatcher;
do not add another runner or page registry. Keep J11 separate from `BOOK_TASKS`
so narrative routing cannot skip reference-sheet production. A future complete
J11 binding profile has sixteen public slots and fourteen saved persona slots;
six/eleven/thirteen/fifteen-slot runs keep their original boundaries.

| Field | Bounded J11 slice |
| --- | --- |
| Goal and components | Persist a J11 pagination proposal with stable Booklet-owned page IDs, accept its exact version, then stop at J12. Reuse normal artifacts, versions, dependencies, approvals and the existing completion transaction. |
| Sources | Fixed book sources J01, J02, J05, J06, J07 and assembled J08, then every required J09/J10 subject from current final lists, sorted by task and subject ID. Verify exact approvals, assembly lineage and original saved bytes in repository admission paths. A pure source projection alone proves none of these records or bytes. |
| Page identity | Proposal pages remain index-based. Booklet assigns IDs once in the completion transaction, including cover index zero. Revisions reuse the previous mapping by page index; malformed saved mappings fail rather than create replacements. Restart reads saved content. |
| Ordered work | Add pure eligibility/source checks and stored-layout parsing first; then repository source/routing/materialization, approval and recovery tests; then context/dispatcher/fixtures and the complete binding profile. Publish live Dify fixtures and install bindings only after review and private key setup. |
| Verification | Focused page/source tests, then repository/context/dispatcher tests for all three personas, stale/missing/corrupt sheets, duplicate completion, revision/restart identity preservation, explicit/delegated approval and GET-only recovery. Run typecheck and lint after integration. |
| Exit and escalation | Approved J11 reaches a saved J12 boundary, not full booklet completion. Preserve unknown-outcome handling; sheet verification during recovered J11 completion must not weaken assembly admission. Runtime reference transport remains a separate J13/judge gate. |

The stored-layout parser and pure source helpers alone do not enable J11 dispatch
or prove durable page identities. The repository and runner own those operations.

The local repository/runner candidate now connects J11 to normal artifact
transactions, exact approvals and the complete sixteen-binding profile. Local
all-persona tests reached approved layouts with 4/6/9 stable page IDs and stopped
at J12. GET-only recovery did not repeat the specialist or a lost manager
delegation to J11; revision preserved IDs
and duplicate completion reused the saved result. Missing approval evidence and
corrupt saved sheets rejected admission. Two independent reviews and Validate
`37329273541` passed; [PR #136](https://github.com/karpishe-experiments/agentic-poc/pull/136)
merged the reviewed local implementation. Publication and private J11 key
preparation passed; reviewed staging activation is recorded below. These local tests are not full-booklet or
live Dify acceptance. Manuscript units can span panels/pages; coverage is required
on story pages, not satisfied by the cover alone.

Final local validation passed 137 tests across twelve affected suites without
retries, clean-checkout typecheck and lint, and twelve legacy agent fixtures.
MongoDB teardown reported a Windows shutdown timeout after the passing tests;
the test command exited zero. This is not live Dify execution evidence.

### J11 Dify preparation package

Prepare five new model-free M3 modules: manager, three persona testers and J11.
Reuse the current J01–J10 specialist and image publications in the eventual
sixteen-binding bundle. Keep M1/M2 names and generated graphs unchanged; this
preparation neither publishes nor changes active bindings.

Extend the preparation command with `--profile m3`. Concatenate the unchanged
M2 Python fixture and a short `dify/m3-pagination.py` extension in the generated
Code node; do not copy the complete fixture into another source. The extension
handles J11 and falls back to existing task behavior. Test Python/TypeScript
parity for all personas, source routing, revision, clarification, manager and
tester decisions, and missing-sheet rejection. Test generated module names,
model-free nodes and disabled retries. Record generated Code size, then verify
Studio compatibility on a disposable draft before publication. Local preparation
does not prove the Code-node size limit or live behavior. New application keys
remain a private handoff; publication, host validation and drained activation
require their separate reviewed checkpoints.

Local preparation validation passed 66 tests across six focused suites without
retries. After the final lint correction, typecheck, lint and the three affected
graph tests passed in a fresh temporary checkout. Generated Code nodes contain
47,026–47,135 UTF-8 bytes. These measurements do not establish a Studio limit;
publication and live J11 execution were separate gates, now recorded below. The five new drafts passed
server-assisted graph validation. A synthetic single-node J11 check succeeded
(`02c83edc-19a4-4e8c-a6fe-6305df04929c`) without callbacks or providers; this
verifies the imported Code node, not runtime credentials or full dispatch.

Private setup uses `scripts/prepare-dify-booklet-m3-keys.ps1`: preview by default,
`-Apply` for the operator-guided five-app secret/publication/key handoff. It reuses
the eleven M2 specialist/image credentials and creates a separate encrypted
sixteen-binding file without overwriting M2. Run the file in a child PowerShell
process instead of pasting a large function into PSReadLine. Preparation does not
print keys. Use the established copy-to-clipboard and press-Enter flow.
Temporary Windows clipboard-access failures receive five bounded reads, then
repeat only the current key prompt. Earlier collected keys remain in memory.
A failure reports only the phase, exception type and line
number; do not share exception contents or credential files. Preparation does not
upload keys or activate staging. The host validator must accept the complete
J11 bundle before activation; existing profiles remain valid. Install the reviewed
dispatcher, release the reviewed J11 application, verify publication read-back,
then activate with drained maintenance and a verified backup. No new reset.

| New module | App identifier |
| --- | --- |
| `issue65_m3_manager` | `46572ccb-d954-45e5-b73d-90fd0995cdb6` |
| `issue65_m3_playful_kid` | `bf57a8ea-1be6-4a97-a5c0-023cfde794f8` |
| `issue65_m3_enthusiast_parent` | `593fb610-624e-404c-92de-57f54e9a47fb` |
| `issue65_m3_professional_creator` | `cd284244-63d5-4169-95c3-9790001a5240` |
| `issue65_m3_J11` | `4f4704ca-de02-4a6d-8051-ba6849fdda56` |

These are application identities, not runtime-key execution evidence. Retain the existing M2
apps and keys. Read back each published configuration before constructing the
runtime settings bundle; the encrypted handoff contains credentials, not verified
publication identifiers.

The operator prepared all sixteen encrypted bindings on 2026-10-05. MCP read-back
verified the five new publications: manager `5e7ead33-6a33-45fd-8425-62e865cdad4a`,
Kid `c546bbc1-61c5-4bba-9b8d-f7e6ef4f8f4b`, Parent
`c2285100-f758-4ba5-8a40-1405c7348c0f`, Creator
`0c35b628-0908-4eaa-80b4-054fb99ea097`, and J11
`26b4f146-f4f0-4779-8a83-192cec653bee`. The eleven reused publications also
passed model-free node inspection. The linked Kid acceptance below verifies
runtime execution through J11; the Parent evidence is also retained below.
Creator J11 acceptance is recorded below.
Infrastructure `37345579673` installed reviewed master
`32befad909ffd8be207fb41e2b771ee5985757f9` with no Terraform resource changes;
it did not activate the sixteen bindings. The J11 staging candidate in
[PR #140](https://github.com/karpishe-experiments/agentic-poc/pull/140) passed
207 focused tests across 23 suites, typecheck, lint, twelve legacy fixtures and
two independent reviews. Validate `37345410931` passed and PR #140 merged as
staging commit `afe92b6509776058341cf2c4830bfe2633f83f80`. Deploy
`37346290235` and readiness check `37347710571` passed for that commit.
The reviewed helper in [PR #141](https://github.com/karpishe-experiments/agentic-poc/pull/141)
passed two independent reviews and Windows PowerShell 5.1 mocked validation.
Validate `37348398499` passed. Private settings upload succeeded; the encrypted
file has Windows access limited to the user, administrators and SYSTEM.
Drained staging activation `37348239296` completed with verified backup
`staging-20261005T172539Z-9163268c683d14ee`. No reset or paid call occurred.
Configuration activation alone is not completion; see the live acceptance below.

The first live Kid J11 attempt, run `0e907bde-cbfc-49c7-8c6a-06f561ac195b`
and booklet `2d9b0377-1f27-4327-8de9-4b959e0d7488`, retained approved J01–J10
and five fixture images, then blocked during pagination. Specialist Dify run
`daeaf29c-f977-4640-b2dd-1bba0b968f7e` links to manager
`747000d0-a6d8-417b-9aa1-5c259f8c52c4`. Authorization and simulation succeeded;
the save HTTP node failed after its 30-second read timeout. Reported tokens and
payable counters were zero. Booklet marked a definite failure; no J11 artifact
appeared on state read-back. A timed-out callback does not prove that no write
occurred. Correct redundant transaction checks and uncertain-outcome handling,
then retain a linked successor. Do not replay the original workflow automatically.

The correction candidate reuses verified pagination sources only within one
completion transaction attempt. It also classifies failed/stopped observations
against the persisted claim inside the outcome transaction, so a claimed callback
can still save a late result. Repeated source checks are a confirmed latency
contributor, not proof of the timeout's complete cause. Clean-checkout typecheck
and lint passed, as did 32 focused graph/page/transport tests and twelve legacy
agent fixtures. Five repository, verification, narrative and image-storage suites
passed 45 tests without retries. MongoDB teardown reported a Windows shutdown
timeout after those passes; the command exited zero. The final two recovery suites
passed 56 tests without retries, including transaction re-verification and late
text/image callbacks without replacement dispatch. Their Windows MongoDB teardown
also required forced shutdown after the passes. Two consecutive independent
reviews passed for the correction in [PR #142](https://github.com/karpishe-experiments/agentic-poc/pull/142),
and Validate `37354658823` passed. The selective staging correction in
[PR #143](https://github.com/karpishe-experiments/agentic-poc/pull/143) also passed
two independent reviews and Validate `37355984987`. It merged as
`0fb4c3d0d0996b38e7a8c03ffebf81793ddf1fe0`; Deploy `37356864220` and
Check deployment `37357833756` passed. No binding change or original workflow
replay was needed.

### Current live pagination evidence — 2026-10-05

The linked Kid successor `870c1d2c-963f-4aa6-83c5-67d667a74b03`, booklet
`c7553125-a287-4eb0-8537-30bbb75a253d`, reached `slice_complete` with J11
approved. Browser read-back retained predecessor
`0e907bde-cbfc-49c7-8c6a-06f561ac195b`, five saved fixture images, 29/120
logical text calls, 5/12 simulated image calls and 34/300 steps. Payable text
and image counters were zero. The failed predecessor remains unchanged.
This verifies the Kid pagination slice, not J12/J13 or full booklet completion.
The Parent run `c2aa6a9f-503b-4de4-83ad-64f2a5b6efb8`, booklet
`8ae9f1f0-d38a-4c0e-8364-be12b524d1b7`, also reached `slice_complete` with
J11 approved. Browser read-back retained five fixture images, 29/160 logical
text calls, 5/14 simulated image calls and 34/300 steps. Payable text and image
counters were zero. No repair occurred during this run.
The Creator run `7568d4b6-7748-4a06-89b4-4186f08be5be` reached
`slice_complete` with J11 explicitly approved at version
`7b162b17-8c1e-453c-9d38-3bd05c58e9b2`. Browser read-back retained
37/220 logical text calls, 6/20 simulated image calls, 43/300 steps and eleven
tester decisions. Payable text and image counters were zero.
Runtime reference inputs, J12 live execution, final pages/cover and reports
remain pending. These pagination results do not prove full-booklet completion.

`scripts/upload-dify-booklet-m3-settings.ps1` accepts a sanitized publication
manifest through `-PublicationsPath`. Preview validates sixteen distinct app and
publication identifiers, configuration hashes and model-free node types without
reading private bindings. `-Apply` joins those identifiers to the encrypted M3
bindings, validates the exact slots, saves separate encrypted settings and uploads
`DIFY_BOOKLET_RUNNER_SETTINGS_JSON` through GitHub CLI standard input. It does not
activate staging or execute Dify. After an interrupted upload, rerunning is allowed
only when the existing encrypted settings exactly match the computed payload;
different settings are not overwritten. Re-read publications before activation.

The local J12 handoff adds `-Profile m3-j12` to the same uploader. It requires
seventeen publications and the separate `issue65-m3-j12-bindings.dpapi.xml`
source; the default `m3` profile keeps its sixteen-binding behavior. The
one-app helper `scripts/prepare-dify-booklet-j12-keys.ps1` reuses all sixteen
bindings and the callback key, then privately collects only the new J12 key.
It writes a separate encrypted file without overwriting the M3 source.
Synthetic PowerShell 5.1 tests passed for both helpers, including preview
isolation, clipboard contention, exact profiles and no-overwrite behavior.
The J12 preparation helper passed two sequential independent reviews.
No J12 private key collection, publication, upload or staging activation is
claimed by these local checks.
The three focused deployment/recovery/environment contract suites passed all
37 tests. The image-digest text check normalizes CRLF to LF so Windows checkout
line endings do not create a false failure; configuration bytes are unchanged.

Local host preparation passed Bash syntax checks and the focused
`tests/shell/vps-host.test.sh booklet-runner-staging` scenario. The complete
host suite stopped at a Windows directory-permission check; the deployment suite
stopped at a Windows sandbox-configuration symlink check. Neither is a full-suite
pass. Require Linux CI, including ShellCheck and both shell suites, before merge
or dispatcher installation. The private helper passed PowerShell syntax/preview
checks and two independent reviews, including synthetic collection tests.

Reviewed master candidate `489576062d1b5d9b5698d28a9906226f34bb9f25`
passed [Validate](https://github.com/karpishe-experiments/agentic-poc/actions/runs/37372309760),
including Linux ShellCheck and both deployment shell suites. [PR #144](https://github.com/karpishe-experiments/agentic-poc/pull/144)
merged as `69df0fb814b7d0dd315ca52cb7dabfe30f31757d`. Dispatcher installation
and seventeen-binding activation remain pending.

The selective J12 staging candidate `9bd092aa7abb7a6b12e26c47f97dd433f01e9506`
in [PR #146](https://github.com/karpishe-experiments/agentic-poc/pull/146)
preserves Cloud configuration and keeps canonical plans on master. Typecheck,
lint, 26 focused unit tests, 61 integration tests and twelve retained agent
fixtures passed without test retries. Windows MongoDB teardown required forced
shutdown after the integration passes; the command exited zero. Two sequential
independent reviews passed. Validate `37374204553` passed and the release PR
merged as `d115d4a83e9b3cd4fa896bac572a594c027a3bb8`. Its automatic Deploy
`37375140444` is pending. Live J12 acceptance remains pending; this evidence
does not establish a complete booklet simulation.

### Independent local preparation: J12 Page Bible slice

This slice uses the existing page parser and artifact/operation services. It does
not clear the separate final-page reference-transport or judge-image gates.

The pure preparation check binds J12 to the selected saved page, exact source
versions, ordered panel identities and unchanged routing memberships. It preserves
lettering strings and order. It does not prove approvals, lineage or stored bytes.
J11 owns page/panel allocation; J12 owns the reviewable composition and production
lettering. A narrative unit can span pages, so do not require its complete text on
every routed panel. The current contract does not mechanically prove whole-book
text coverage; retain the approved manuscript for tester/judge comparison.

Repository verification loads current approved J11/J05/J08 with exact approval
records. It checks J11's saved dependency IDs against its edges and the current
approved upstream identities. It then reads the assembled style samples and only
the selected page's referenced sheet bytes, not every unrelated sheet. Return
dependencies as J11, J05, J08, then deduplicated selected sheets sorted by task and
subject ID. Reuse verified sources only inside one completion transaction attempt;
a retry or later request verifies again. Unknown-outcome recovery must retain the
exact active page operation, reservation and publication checks.

Local J12 dispatcher tests completed all three persona journeys through the J13
boundary, retaining 4/6/9 individually approved Page Bible artifacts, stable J11
page identities and parent/child traces. Payable counters stayed zero. The final
dispatcher suite passed 58 tests and the source-verifier suite passed three,
without retries. Four context,
dispatcher, verification and narrative regression suites passed 32 tests. Five
page/configuration unit suites passed 35 tests. Clean-checkout typecheck and lint
passed, as did twelve legacy agent fixtures. These are local fixture checks, not
live J12 Dify execution or final booklet completion. A focused lost-response test
recovers the same J12 operation and page version through GET, with no replacement
POST. The final full dispatcher regression also passed.
Windows required forced MongoDB process cleanup after the passing integration
results; the test command exited zero.

The local `m3-j12` preparation profile contains only the existing M3 manager and
the new J12 specialist. It appends the Page Bible fixture to the unchanged M2 and
J11 fixture sources. Existing preparation profiles retain their prior graphs.
Python/TypeScript parity and model-free graph checks passed fifteen tests across
three suites, including the J11 regression fixture. Final clean-checkout typecheck,
lint and those suites passed after the test-only corrections. No workspace publication,
runtime key collection or staging activation is included in this preparation.

The separate Community draft `issue65_m3_J12`, app
`f70bc4bc-7253-4031-8f9d-eb1e3aaf7df1`, was imported from the reviewed
`m3-j12` candidate. Draft read-back contains only Start, Code, HTTP, condition
and End nodes. Offline and server-assisted validation both returned zero errors
and warnings. Its single `simulate` Code node succeeded with synthetic cover
input, node execution `65bbc19a-130b-4a78-a7cf-98747d252b6c`, and returned
the expected J12 proposal. This invoked no callback or provider; the empty
execution metadata supplies no usage measurement. It proves Code-node
compatibility only. The active manager and sixteen staging bindings remain
unchanged. Publication and private J12 key entry are separate checkpoints.

| Field | Bounded J12 slice |
| --- | --- |
| Goal and components | Save and accept one Page Bible artifact per Booklet-owned J11 page, then stop at J13. Extend `db/experiment-pages.ts`, narrative/repository admission, runner contracts/config/context/dispatch and the existing fixtures. No new page registry. |
| Contract and state | J12 uses `subjectKind: page` and the stable J11 `pageId`. Require the exact current approved J11/J05/J08 versions and relevant approved sheet versions/assets, with approval records, assembly lineage and original bytes. Preserve exact lettering, panel routing, text-free panels and cover title. Each accepted page remains saved; all 4/6/9 current approvals advance to the J13 boundary, not completion. |
| Ordered edits | Add per-page source verification; integrate transactional materialization/approval and scoped invalidation; extend context/manager routing and deterministic fixtures; then add the complete seventeen-slot public profile and fifteen-slot saved persona shape. Validate exact slot identities, not count alone: the saved shape shares the old public J10 count. Preserve every older profile and boundary. |
| Publication and keys | Reuse the sixteen credentials. Create only one new J12 app/key. Republish the M3 manager for page delegation after the active J11 campaign drains; retain tester publications unless focused tests require changes. Save separate encrypted J12 bindings/settings without overwriting J11. Extend host validation and preparation/upload for the exact new profile. Never rewrite old snapshots; use linked successors after changed configuration. |
| Verification | Extend focused config/page/routing/fixture tests and repository/context/dispatch integration tests without retries. Cover all personas, old boundaries, duplicate completion, restart, GET-only recovery, exact sources/lettering, missing approvals/corrupt assets, revoked delegation and page-scoped revision. Run typecheck, lint and legacy agent fixtures; host changes require both shell suites and ShellCheck on Linux. |
| Completion and escalation | Local implementation may proceed with fixtures while private J12 setup remains pending. Require two sequential clean reviews before publication. Drain/reconcile active operations, read back changed publications, then use reviewed staging release and backed-up activation. Unknown outcomes block publication to affected bindings; do not replay POST. No reset, provider calls or final-page completion is included. |

Implement both one-page and ordered selected-batch scheduling, using existing
jobs/items with the M1 operation ledger. Batches run sequentially; every page
has its own result and approval. A later failure does not erase earlier results.
Test kid page-by-page, parent selected batch and creator a subset plus remainder.

Tester can group approvals under a recorded grant or request bounded revision.
A page-specific change invalidates only that page and its image; a shared change
invalidates actual descendants. Revision counter increments once per tester
revision request, not once per invalidated image; every replacement image still
uses its own image-request allowance. Technical safe retries do not consume the
creative revision allowance but do consume provider requests when a call occurs.

At generation completion, schedule separate tester feedback and judge operations.
Local configuration preparation now accepts an explicit eighteen-binding
evaluation profile: the complete J12/image suite plus one separate judge.
Final-page enablement is required; each persona snapshot has sixteen non-secret
rows. Older profiles retain their shape. Configuration and page-planning tests
passed (23), with focused lint and clean-checkout typecheck. Judge dispatch,
published graph, private key setup, host validation and staging activation remain
pending; accepting configuration alone is not evaluation readiness.
Judge branch receives the fixed brief, dialogue/decisions, warning and usage
evidence, all final page/cover images and reference packages. It has independent
instructions and no manager mutation tools. To keep context bounded, supply
structured artifact summaries plus exact final lettering, not every historical
version. Preserve links to full history. Do not omit final images silently to fit
a limit; verify supported image count/size or split into recorded bounded judge
observations followed by one final assessment, counting every real call.

Reports use `{summary,intent,consistency,interaction,costEvidence,findings}`;
each finding links affected artifact/page/version and has a concise explanation.
Use `not_assessed` when evidence is absent. No passing score is required. Label
simulated feedback as simulated. Judge failure leaves generation completed and
evaluation failed; final experiment acceptance still needs retained reports.

## UI and execution work

### Next local slice: runtime reference upload

Prepare one bounded upload adapter before wiring J13 dispatch. Use the official
[file API](https://docs.dify.ai/en/api-reference/files/upload-file) and the
[pinned 1.17.1 controller](https://github.com/langgenius/dify/blob/1.17.1/api/controllers/service_api/app/file.py),
not console credentials or temporary signed URLs. Send one original image per
multipart request with the target application's runtime key and the same
`booklet-<runId>` user as workflow execution. Preserve input order in the caller.
The initial local adapter limit is 10 MiB per image; verify the installed host
limit before claiming live capacity. Validate original bytes with the existing
image decoder. Retain only file ID, original byte length, canonical MIME and
digest; discard returned URLs. Reject redirects and malformed acknowledgements.
An upload timeout has an unknown outcome and is not automatically retried.

Mock tests must prove multipart identity/bytes, canonical image metadata,
rejected authentication, malformed results, bounds and no automatic retry.
This slice does not change dispatch, create approvals or invoke a workflow.
Published file-list inputs, runtime ownership, ordered consumption, measured
size and lost-response recovery remain live gates before J13 activation.
The local adapter and fourteen mocked tests are prepared. Tests passed for
original bytes and run identity, input mutation, bounds, corrupt images,
canonical metadata, HTTP rejection, uncertain failure and malformed responses.
No runtime file was uploaded by these tests and dispatch remains unchanged.

### Independent local preparation: final-page request serializer

Use the saved approved J11 layout, one J12 Page Bible version and the assembled
J08 style package to prepare a deterministic `page_source` request. Reuse the
existing page and style parsers. Preserve the style module and native lettering
without trimming or rewriting. Include canvas, typography and the selected
page's panel allocation, text-safe regions and composition instructions.

Return only the selected sheet identities, deduplicated in first-panel order,
with page identity and ordered source versions. This pure serializer cannot
prove database approvals or original asset bytes. Its later repository caller
must verify them; the assembled style's originating draft ID is not its current
approved version ID. Keep the existing prompt bound rather than raising limits.

This preparation does not enable J13 dispatch, upload files, reserve requests
or invoke providers. Runtime reference transport, per-page persistence and
approval, selected-batch jobs, reports and full-booklet completion remain pending.
Six focused serializer tests passed for cover and multi-panel requests, exact
style and lettering, selected-only references, source/hash/text-flag rejection,
distinct assembled/draft style identities, fingerprints and prompt bounds.
Clean-checkout typecheck and lint also passed. These are local checks only.

### Independent local preparation: runtime file-input serialization

Extend the existing runtime transport with optional ordered uploaded file IDs.
The pinned [1.17.1 workflow payload schema](https://github.com/langgenius/dify/blob/1.17.1/api/controllers/common/controller_schemas.py#L96-L175)
defines local descriptors with `type`, `transfer_method` and `upload_file_id`.
Custom Start variables belong in `inputs`; top-level `files` serves system inputs.
Serialize the selected IDs into `inputs.reference_files` with image/local-file
descriptors and the existing `booklet-<runId>` user. Preserve the previous body
when no files are supplied. Reject empty, duplicate, malformed or over-bound
lists before network access. Use the probe's fifteen-file bound for this initial
local path; it is not a universal platform capacity claim.

Keep POST recovery unchanged: a lost response is unknown, not permission to
repeat execution. This optional transport seam does not wire uploads or page
dispatch. Runtime ownership, published consumption, original-byte recovery and
measured image-size capacity still require the model-free live probe.
The local transport and upload-adapter suites passed 23 tests without retries,
including the ordered fifteen-file boundary and zero network requests for
invalid input. This does not prove runtime file ownership or live consumption.

### Next Simulated slice: manager-selected J13 page packages

The local saved-package contract retains the page and J12 identities, exact
executed request, output image metadata, operation/publication/manager-parent
identities, previous page-version lineage and ordered upload acknowledgements.
Its pure builder matches the supplied selected-reference order and derives the
run user. Empty attachments are valid only when the approved page routes no
references. Repository checks must still prove approvals, original bytes and
runtime ownership; schema acceptance is not that proof. Output bytes retain the
20 MiB decoder bound, while each uploaded reference retains the 10 MiB bound.
Neither bound is a claim that the live transport has been tested at that size.

Reuse the existing image app for a named J13 branch; do not add another text
call or application key merely to label the responsibility. This is a selected
implementation layout, not evidence that the branch exists or consumes files.
Keep editable task instructions and eventual provider choices in Dify.

| Field | Bounded slice |
| --- | --- |
| Goal and components | Save one independently reviewable J13 package per physical page through the existing operation, image-storage and artifact services. Extend runner contracts/config/context/dispatch, page verification, image assembly and the focused image graph. No new page registry or runtime. |
| Enablement | Add optional `finalPageIllustration: true` only to the sole image binding in the complete seventeen-slot profile. Add the optional flag to the strict saved configuration-item schema and include it in new fifteen-row persona snapshots only when true. Use no default; omit it when absent so old snapshot bytes/hash and J12 boundaries remain unchanged. Test distinct configuration evidence for enabled runs as well as unchanged legacy evidence. Extend strict repository, host and private-settings validation. Reuse the image key. |
| Input and output | Verify current approved J12/J11/J05/J08 and selected sheet versions/bytes. Save exact page identity, request, ordered attachment roles/assets/digests/MIME/file IDs and run-user ownership. Return one asset plus actual executed prompt, source versions, operation/publication/parent identities, candidate lineage and warnings. A saved image is not approval. |
| Ordered edits | Add current J12 admission and source checks; explicit manager J13 delegation; named model-free Dify page branch; persisted upload acknowledgements and GET-only execution recovery; immutable package assembly and exact explicit/delegated approval. Preserve prior versions and other pages on revision. |
| Clarification | Permit a typed clarification only for the authorized Simulated J13 image owner, before binary completion. Reuse the existing question/answer flow and retain the same page/revision target. One clarification spends its existing logical image reservation and step, creates no asset, and consumes no creative revision. After the answer, a fresh manager delegation and operation are required; never reuse the terminal clarification for generation. Count saved assets, not successful clarification operations, as generated images. |
| Verification | Cover all personas, exact sources/style/lettering/attachment order, per-page approvals, stale sources, corrupt bytes, duplicate completion, clarification-versus-image races, revision accounting, restart after upload/save, and GET-only recovery. Prove old profile snapshot bytes/hash and boundaries remain unchanged. Run focused contracts/integration, typecheck/lint and two sequential reviews. |
| Live gate and exit | Before live dispatch, prove published file-list consumption, runtime-key ownership, count/order/digests, installed size capacity and result recovery with the model-free probe. Drain users of the shared image app before publication, retain backup and read back bindings. Local mocked page packages are not full-booklet acceptance. |

The current Real claim counter increments before branch execution. It cannot
prove an actual provider request for a clarification. Keep this slice Simulated
only; accurate paid-attempt evidence remains a later readiness gate. Never refund
an uncertain provider reservation solely from a declared clarification result.
Do not force clarification for complete approved inputs; it consumes the same
bounded image allowance even when no image is generated.

Ordered selected-batch jobs, final generation completion and tester/judge reports
remain subsequent M3 work. Do not omit them from full-booklet acceptance.

The local configuration prerequisite accepts the optional true flag only on the
image binding of a complete seventeen-slot runtime profile. Its saved projection
includes the flag only when true and requires the complete fifteen-row persona
profile. Legacy saved role/task schemas and absent-flag JSON/hash remain
unchanged. Focused configuration and repository suites passed 18 tests without
retries. This does not enable J13 dispatch, update private settings or prove
final-page execution; host validation and delivery are subsequent work.

1. Add J11–J13 schemas, prompts, fixtures, source routing and completion predicate.
2. Connect image operations to page jobs and exact per-page approvals.
3. Add feedback/judge branches, result validators and separate evaluation status.
4. Complete runner list/detail: persona/mode, one/all personas, current task,
   warnings, remaining limits, Pause/Resume, conversation/decision provenance,
   failed/predecessor/successor runs, saved booklet and artifact/image links.
5. Render image at its actual aspect ratio. Recovery diagnostics expose operation
   and Dify run IDs, not credentials/raw provider responses. Keep API-driven tester
   feedback separate from browser usability evidence.
6. Add a test driver `scripts/experiment-runner.ts` using the same application APIs
   as the UI: create/observe/pause/resume/assert. It must not invent another flow
   engine or call providers directly. All-persona execution is a sequential queue.
7. Publish, deploy and run all three full Simulated cases on staging. Save actual
   application/Dify run IDs and normal booklet IDs.

## Verification and exit

The local J13 package/assembly candidate saves per-page output evidence and
immutable replacement history from completed, publication-verified operations.
Preferred canvas and MIME-label differences remain advisory. Its reference-upload
service saves a journal before each POST and ordered acknowledgements afterward.
Interrupted or unknown uploads cannot repeat their POST; completed prefix uploads
remain saved. Thirty-eight focused package, assembly, upload-journal, admission
and image-storage tests passed together without retries. Typecheck and lint passed
in the isolated verification checkout with the same candidate source files.
Admission preserves a non-null manager parent and permits a draft replacement only
for the exact pending page/version revision. Upload admission checks Pause atomically;
already admitted uploads can save their acknowledgement after Pause.
These integration fixtures mock upstream source verification;
the existing source-verifier suite checks that separate boundary. The subsequent
candidate connects dispatcher and tester approval; live application-key file inputs
and full-booklet simulation remain pending. No live bindings, provider calls or
staging resources changed in this slice.

The local manager result contract now accepts J13 delegation only for a page.
It does not add J13 to text-specialist proposals. Manager-result materialization
requires the enabled Simulated profile, current approved source evidence for every
Page Bible in the layout and an eligible target; replacing a draft requires its
exact recorded pending revision. Thirteen focused contract/admission tests passed
without retries after this change,
and typecheck and lint passed. The foundation candidate check passed all 47 tests across these six suites
without retries, including the corrected all-page manager gate.

The subsequent local dispatcher candidate saves and separately approves all 4/6/9
cover/story images in three persona tests using real MongoDB persistence and image
bytes, but simulated Dify transport. It passes ordered runtime file identifiers,
retains the manager parent across restart and blocks an unknown upload before
workflow dispatch. A focused corrupt-output test confirms that failed assembly
retains the successful operation and blocks automatic replay. The recovery/legacy
J12 selection passed 19 checks, but its eight-page journey timed out at 120 seconds
while another MongoDB suite ran. An isolated diagnostic run of that case passed in
49 seconds without retries; do not report the combined command as a pass. Final
validation must run these MongoDB suites serially. Typecheck and lint passed after
the assembly-failure correction. The local page-revision candidate now records
tester feedback and its publication provenance, preserves prior page versions,
and changes only the selected page. It checks the combined prompt before accepting
feedback, so oversized feedback does not consume an allowance or change page state.
The focused revision/allowance selection passed four tests without retries
(68 unrelated tests skipped); typecheck and lint passed after this correction.
Independent focused revision review passed. This is not a final review of the
whole candidate. The local J13 clarification candidate saves an image-owner
question before binary completion, retains its page/revision scope, and passes
the saved answer to a fresh image operation. It rejects a late binary upload to
the completed clarification. Clarification consumes its logical image reservation,
not a creative revision allowance, and is not counted as a saved image. Three
focused checks passed without retries (69 unrelated tests skipped); typecheck and
lint passed. Independent focused clarification review passed. The complete pure
contract/page-image/package suites passed all 24 tests, and the affected admission,
assembly, binary-storage and upload-journal suites passed all 30 tests without
retries. These local checks use simulated Dify transport, not deployed acceptance.
Tester/judge reports,
final completion and live Dify acceptance remain incomplete.
The pure advisory report validator is prepared with explicit role, mode, run,
configuration and current-version evidence. Findings link an exact current
artifact/version/page or the run. Visual consistency cannot be marked observed
without every final page and cover in the inspected-image evidence; missing
evidence must be marked `not_assessed`. Actual, estimated and unavailable cost
remain separate. Five focused tests, typecheck and lint passed. Report persistence,
independent judge execution, image access and final completion are not implemented
by this pure validator. Independent focused review passed after correcting cost
availability: `available` requires actual cost, `partial` requires at least one
actual or estimated value, and `unavailable` requires both values to be absent.
Verified zero actual cost remains valid. The five tests, typecheck and lint passed
after that correction.
The read-only generation verifier is also prepared. It checks the retained run
revision, all thirteen approved responsibilities, exact sheet/page sets, current
dependency edges, per-page approval and original image bytes. It returns final
and reference image identities and warning evidence for later report context;
it does not mark the run completed or dispatch evaluation. Independent focused
review passed after enforcing the exact required reference-sheet set. Final
three-persona verification passed without retries: each local journey produced
and separately approved its 4/6/9 final page/cover images and retained the expected
9/11/15 total baseline image identities. The same tests rejected a corrupt final
image; the kid case also rejected an extra approved sheet, missing page approval
and inconsistent dependency edges. Typecheck and lint passed after the final
correction. These tests use real MongoDB and image storage with simulated Dify
transport. Automatic report dispatch, independent judge execution, selected-batch jobs, final run transition
and deployed simulation still require implementation.
Tester feedback persistence now has a local candidate through the existing
immutable operation result, not a separate report registry. It rechecks generation
evidence and requires the exact saved, publication-verified tester binding before
acceptance. The runner view exposes retained reports with their operation and
publication identities and whether their artifact versions still match current
versions. The kid journey verifies rejection of an unverified report and wrong
configuration, recovery of its retained operation, identical-result reuse and
unchanged page approvals. Six focused checks, typecheck and lint passed after the
publication-gate correction. Independent focused review passed. Automatic
feedback dispatch, independent judge binding/execution, batch jobs, final status
transition and deployed acceptance remain incomplete.
Do not publish or activate this partial candidate as full M3 acceptance.

The latest Community publication and private-binding status is recorded in
[the final binding preparation candidate](#final-binding-preparation-candidate).
Do not infer runtime authentication from administrative MCP inventory.

The local J13 source verifier checks the current approved J12 page, exact
dependency edges, and selected reference bytes against saved hashes, sizes and
dimensions. It returns decoded MIME types and reports MIME-label differences as
warnings. It does not upload, dispatch or save a page image. Seventeen focused
tests passed without retries. The new source-verifier tests mock upstream style
and sheet assembly checks; they do not prove the complete production pipeline.

### Ordered batch preparation and restart ownership

The candidate page-batch contract retains the selected page order, configuration
hash, layout version, Page Bible versions and prior page versions. Each saved
item must retain its own operation, asset and illustration version. Pause stops
new items; running items require reconciliation, and failed or unknown items
cannot advance or replay automatically. Generated batch completion does not
approve pages or complete a booklet.

Legacy restart recovery now selects only `references`, `pages` and `export`
jobs. It preserves `dify_pages` jobs and items unchanged. Legacy runnable and
active-job projections exclude those jobs. Eight focused local tests passed
without retries, followed by typecheck and lint in the isolated checkout.
These checks cover the pure batch contract and restart isolation only.

The candidate selection repository now stores ordered `dify_pages` jobs and
items in the existing generation collections. It verifies the saved configuration,
current Page Bible and prior illustration versions, then admits selection with
the run revision in the same transaction. Duplicate selection returns its retained
job without another reservation. Active operations, stale revisions and overlapping
active selections reject new jobs. Drained paused runs can retain intent while
dispatch stays paused. Four initial focused integration tests passed without retries,
including concurrent duplicate selection with one retained winner;
their source-verification dependency is mocked, so they establish transaction and
ownership behavior, not real saved-artifact readiness.

The repository also binds an item to its owning prepared J13 operation before
dispatch. Reconciliation reads only that retained operation. Unknown and failed
outcomes stop later items; a saved result requires the current assembled version
and original-byte verification. Pause permits that result to be retained but
prevents the next pending item from starting. Repeated unchanged observations
do not change the run revision. Eight focused repository integration tests passed
without retries. These tests mock source and assembly verification; the existing
assembly tests own original-byte checks. The active-job projection filters saved
run identity before loading a job; another run's retained batch is not projected
as the current run's work.

The candidate dispatcher now retains a single-page job before J13 preparation
and binds its operation before reference upload or workflow dispatch. It can
consume a preselected ordered batch when its next page matches the manager's
eligible target. A verified, materialized tester answer permits a new operation
after clarification; the item retains the original clarification operation ID.
The post-callback/pre-assembly recovery path materializes the known image result
before planning more work. Local clarification, revision and interrupted-boundary
checks passed without retries. A retained natural-order two-page selection also
passed through the dispatcher with separate results and approvals. The selected
batch, lost-response, assembly-failure and uncertain-upload checks passed as four
focused tests; typecheck and lint passed. Independent focused review passed after
the run-isolation correction. Creator-facing batch selection, arbitrary subset
ordering and deployed batch acceptance remain pending.

After the batch-wiring correction, all three local Simulated generation journeys
passed again without retries (three tests, 119.53 seconds). They independently
verify 4/6/9 approved page-and-cover packages and 9/11/15 distinct baseline image
assets, including saved byte evidence. This uses the in-process workflow runtime
fixture, not the deployed Dify interface. It does not establish judge execution,
final evaluation completion or live full-booklet acceptance.

Focused tests cover each J11–J13 clarification/draft/revision contract and prove
multi-panel layouts remain one image, cover completion,
exact lettering/style propagation, reference attachment membership, selected-batch
order, duplicate completion, stale dependency rejection and scoped revision.
Test pause/restart around a completed page, unavailable assets, corrupt output,
storage failure, unknown provider outcome, cap exhaustion, warning-bearing success
and failed judge without loss of generation success.

The separate `m3-j13` graph candidate adds model-free Python manager routing for
the exact eligible J13 page. The generated code executed locally and returned
the expected delegation. Graph and Page Bible regression checks passed (11 tests),
with focused lint and typecheck. Older profiles omit the extension. This candidate
does not yet prove live tester execution, image transport, reports or publication.
The final-page tester extension now retains existing J13 delegation for Kid and
Parent when the baseline fixture selects an eligible draft for approval. Creator
keeps explicit version approval. Four generated-Python tests passed, including
all three persona decisions, and focused lint passed.
The combined graph and Python regression selection passed 14 tests without
retries, and the clean verification-checkout typecheck passed. The focused
independent routing review returned Pass; this is not a full release review.
These minimal projection
fixtures do not prove stored artifact validity; repository admission remains
responsible for that check. Image transport, reports and live publication remain
pending.
The optional final-page image graph now accepts an ordered, local-file-only image
list (maximum 15) and returns resolved descriptors for runtime read-back. Its five
graph tests and focused lint passed; the default graph stays unchanged. This
does not establish descriptor identity parity, application-key live transport or
provider reference use. Those checks remain explicit activation gates.
Local J13 reconciliation now compares returned local image descriptors, in order,
with the saved upload acknowledgements before publication verification. The parser
uses the canonical opaque `reference` defined by pinned Dify 1.17.1's
[file builder](https://github.com/langgenius/dify/blob/1.17.1/api/factories/file_factory/builders.py)
and [reference helper](https://github.com/langgenius/dify/blob/1.17.1/api/core/workflow/file_reference.py),
not the graph file ID. Two parser tests passed. Positive selected-batch and
lost-response checks passed; the reversed-reference regression then passed after
its assertion was corrected to inspect persisted blocked state rather than the
advance return value. A second advance made no new image dispatch. Focused lint
and typecheck passed before that assertion-only correction. Live transport remains
unverified.
Reference review found and corrected the zero-reference cover path: a missing
optional file output is allowed only when saved upload evidence parses as exactly
empty. Missing, corrupt or nonempty saved evidence does not receive that exception.
The cover lost-response recovery and reversed-reference tests passed (2 tests,
25.77 seconds, no retries). Recovery sent no additional image request; a later
tester call is separate. The focused independent re-review returned Pass.

The local selected-batch routing check now selects physical pages 3 then 1.
The manager follows that saved order, retains separate approvals and returns to
the remaining required pages. A prior manager selection for a different page
requires a fresh manager decision. Twelve planning tests and the focused
transactional dispatcher check passed without retries; focused lint and the clean
verification-checkout typecheck passed. This is in-process simulated runtime
evidence, not deployed Dify acceptance or creator-facing selection UI evidence.

The local pre-claim Pause correction passed eight focused integration checks
across three files without retries. Single-page and selected-batch Resume retain
the original zero-reservation attempt and earlier approved pages, then save one
fresh image attempt. Repository checks keep unknown, reserved, unverified and
failed attempts blocked. The context fixture now rejects judge admission before
saved generation. The complete affected batch-repository and context files also
passed (23 tests, no retries). Focused lint, whitespace and source typechecking
passed; the source check excludes ignored validation worktrees and stale generated
Next.js route validators. Standard clean-candidate validation remains required.
Independent review passed for this correction. This is local evidence, not live
Dify acceptance.

The late-output correction passed its focused claimed-timeout integration check
without retries. The original J13 operation saves its delayed binary output,
then GET verifies publication and assembles that result. No extra image dispatch,
reference upload or reservation occurs. Wrong callback identity and a stale J12
source are rejected. All 17 affected style/sheet assembly tests passed without
retries. Focused lint, source typechecking, whitespace, 17 local link targets and
independent review passed. This in-process test does not prove deployed callbacks.

The batch-revision correction separates active selections from historical review
hints. A completed single-page batch no longer blocks J13 regeneration after a
J12 replacement. A drained partially completed batch receives a linked successor
with current sources, preserving predecessor inputs/items and remaining page
order. Refresh is transactional and idempotent; unknown, running or unreconciled
failed work cannot be superseded. Twenty-two focused tests passed without retries,
including all batch-repository cases and both full-profile revision paths.
Focused lint, whitespace, source typechecking and independent review passed.
Final clean-candidate checks and two consecutive independent reviews remain the
publication gate; these local changes are not deployed acceptance.

Browser test through the runner: launch, inspect progress, pause/resume, reload,
open saved booklet/pages, inspect warnings and reports. Do not claim a Playwright
test-list discovery as browser execution. Use the existing e2e runner with a focused
new spec, fixtures and no providers; record a separate authorized staging browser
smoke through the live Dify simulated branch.

The default `scripts/run-e2e.ts` profile retains `next start` and local agent seeds.
Use `npm run test:e2e -- --profile experiment-runner` for the new runner fixture.
This profile starts a development server and initializes isolated MongoDB storage
without agent seeds. Its browser fixture intercepts runner APIs and image responses;
it does not prove backend persistence or deployed Dify execution. Cleanup stops the
isolated server and MongoDB. On 2026-10-06, this command passed with `--retries=0`
against clean candidate `4087484`: one browser test, including selected-persona
start, progress, saved artifact/report links, Pause/Resume and reload. No external
browser request occurred. The expanded fixture then passed without retries
(one test, 27.4 seconds): paused selection `3 → 1`, exact page-order submission,
no implicit Resume, retained order after reload, advisory warning display, the
actual saved-booklet route backed by an isolated seeded booklet, and an opened
original-image response with decoded bytes. Runner APIs and image responses remain
intercepted; this does not prove Dify-generated persistence. Deployed Dify browser
acceptance remains pending.

The clean `4087484` checkout passed standard `npm run typecheck` and `npm run lint`.
Missing/invalid profile and invalid-port preflight checks returned the expected
errors before MongoDB setup. The unchanged runtime inputs at `04bda6a` passed
`vitest run experiment-runner tests/integration/restart-resume.test.ts --bail=1
--retry=0`: 65 files and 563 tests in 1047.76 seconds, using fake providers and an
isolated database. Process cleanup completed with exit 0. Twelve agent fixtures
passed on the same runtime inputs. Two consecutive independent publication
reviews passed for candidate `a7565df02bc81d83b7d5bb3c438905620fdda281`.
Validate `37473823718` then passed, including both Linux deployment shell suites
and Terraform validation/tests. PR #149 merged into `master` as
`c3207e78188518e5defaea28d0793ecb6c8d7163`.
No production/container build was run during validation. Selective staging
delivery, final binding activation and deployed M3 acceptance remain pending.

Community MCP inventory on 2026-10-06 verified workspace
`ffac910f-2786-490e-90d8-07243d49741b`. The corrected
local judge graph has 11 nodes and 11 edges; server-default MCP validation returned
zero errors and warnings. A draft-sync preview showed only the report-routing
correction and no validation issues. The attempted MCP synchronization returned
HTTP 400 because the bridge sends `environment_variables`, which the pinned
server rejects. Read-back confirmed that this failure did not change the draft.
The inspected official CLI import then replaced only the graph from the retained
private export. Final MCP read-back matches the reviewed source exactly: judge
has 11 nodes and 11 edges, hash
`a2df41b37b6451e5dac2a130a7ca3625e1a915112f5cae14c65176d5c92d6892`.
The same fallback updated J12's final-profile simulation code. Server-default
validation returned no issues, and final graph read-back matches the reviewed
source, hash `6c5704556273dbce3cd16f8a67599987b6be0174bdb795f00cbdfd1d5237267d`.
Both app IDs and environment-variable definitions remain unchanged. Private
exports and candidate DSL files remain outside Git.
The operator subsequently published both workflows and prepared the encrypted
eighteen-binding file `issue65-m3-j13-bindings.dpapi.xml`. Active publication
read-back identifies J12 `b89109fd-7e59-4da8-9a23-48165ee74473` and judge
`539c1fa5-a07d-40d2-835f-b290d3c8bab9`. Node instructions match the reviewed
source; only start, code, HTTP, condition and end nodes are present. Neither
publication has a Workflow Tool binding. This does not prove callback-key
authentication or final-suite execution. Do not repeat private key preparation.
The [shared readiness register](EXECUTION.md#b-authorization-register) tracks
remaining publication, activation and runtime checks.

### Current deployed candidate — 2026-10-06

Main PR #150 and selective staging PR #151 merged after required CI. Staging
release `53c99366b2006a3062a48f9b8b005f8cd2ca38e4` passed
[Deploy 37483990775](https://github.com/karpishe-experiments/agentic-poc/actions/runs/37483990775)
and [Check 37485322794](https://github.com/karpishe-experiments/agentic-poc/actions/runs/37485322794).
The immutable image is
`sha256:9f1e03934d2bd64acb8c14a1e95ecd804bf9e3cf3bfe92c6e9887ec6a9d8ff60`.
All eighteen active publication graphs were read back; none has a Workflow Tool
binding. Final graph parity passed for manager, testers, image, J12 and judge.
The image validator retains its known `list-operator` recognition warning.

[Infrastructure synchronization 37488988142](https://github.com/karpishe-experiments/agentic-poc/actions/runs/37488988142)
passed with zero Terraform resource changes. Corrected eighteen-binding
[activation 37490374204](https://github.com/karpishe-experiments/agentic-poc/actions/runs/37490374204)
passed with backup `staging-20261006T154826Z-b370e46222477157`, without changing
the application image. Cloud and production were outside the activation target.

Retained Kid run `628e9054-5d8e-41f3-8256-8e7902d2b058` stopped after one saved
tester decision because history IDs had been bound instead of active publication
IDs. Dify run `22fcdfd1-491c-4cfb-a28e-0dfe75ba04cb` succeeded with zero tokens;
Booklet rejected the identity mismatch. The corrected active graphs have the same
hashes. Linked successor `43f91bcd-1325-4d0b-8b97-6df622a133a4` stopped at a
terminal model-free sandbox timeout; the exact failed node input passed a separate
diagnostic probe. Its evidence remains saved and paused, without replay.

Current linked Kid attempt `dab26b7e-e892-4c12-8b07-94ca993bfeec` reached approved
J01–J11, both character sheets, the location sheet and all four J12 Page Bibles.
Live Pause/Resume preserved completed work. A Page 1 selection was saved while
drained and paused; saving did not resume or consume a request. Manager run
`f59d5386-86f5-46b1-a346-7c4c00271af8` timed out at its result callback, but the
late result persisted and the dispatcher continued without replay or manual
repair. This proves that recovery path, not final booklet completion.

The first J13 image run `ab6e63db-78cd-4757-87ec-f826137c0b69` then failed at its
authorization callback after 30.07 seconds. The claim was saved, but image
execution did not start. The attempt remains paused with an unknown application
outcome, 38 logical text requests, 6 logical image requests and zero payable calls.
Do not replay that operation. Parent and Creator full-booklet campaigns remain
pending.

The callback correction batches shared source/version/approval reads on
the same Mongo session. Manager delegation retains full selected-page source and
byte verification, then checks every current Page Bible's approval, content and
exact dependencies/edges without rebuilding sibling image requests. Image claim
and context still perform separate source checks. The two focused integration
suites passed 24 tests without retries (33.64 seconds), and focused lint passed.
The clean candidate passed standard typecheck/lint, twelve agent fixtures,
74 affected integration checks and eight shared dispatcher cases without retries.
Two consecutive independent reviews passed for main and selective staging delivery.
[PR #152](https://github.com/karpishe-experiments/agentic-poc/pull/152) merged after
[Validate 37499392340](https://github.com/karpishe-experiments/agentic-poc/actions/runs/37499392340)
passed 814 tests across 107 files. The four-file staging carry in
[PR #153](https://github.com/karpishe-experiments/agentic-poc/pull/153) passed
[Validate 37500336682](https://github.com/karpishe-experiments/agentic-poc/actions/runs/37500336682).
Staging release `835c912794a80bf162f82342da6db19e68694cbe` passed
[Deploy 37501574059](https://github.com/karpishe-experiments/agentic-poc/actions/runs/37501574059)
and [Check 37502716764](https://github.com/karpishe-experiments/agentic-poc/actions/runs/37502716764),
retaining backup `staging-20261006T171635Z-19dbc66bd48a497d` and immutable image
`sha256:30c4b357c521cc00c621e540e9a2eb0ac2cfa010cd550c7c639aea19ccb3bd4a`.
Dify graphs and bindings are unchanged. Full all-persona completion remains
unverified; use linked successors, not replay. The next attempt's callback
measurements are recorded below.

Linked Kid successor `743163ae-d179-49de-82d7-382fa8bd1941` reached approved
J01–J11 and all four J12 Page Bibles on this release. Its first J13 workflow
`08a4cd3b-bb6f-4929-9e36-e71f4756e258` succeeded in 22.51 seconds with zero
tokens. Authorization took 10.51 seconds and the binary upload took 9.22 seconds;
this attempt cleared the earlier authorization timeout. Booklet then blocked
on reference read-back: Dify returned `reference_files: null` for the reference-free
cover, while the dispatcher accepted only omission or an empty array. The saved
image operation `0213da53-31c4-4147-bf59-7914d815218c` remains succeeded; no replay
or in-place acceptance repair occurred. Counters were 38 logical text requests,
6 logical image requests and zero payable calls. Full completion is not proved.
The reviewed correction accepts null only for an empty expected-reference list;
nonempty references still require exact ordered identities. PRs #154 and #155
merged this correction into master and staging. Deploy `37510610960` failed
before backup or release switching: drain retained one running generation item.
The prior staging release remains selected. Four focused integration cases
passed without retries (51.05 seconds): omitted/null cover output recovers without
replay, and reversed/null required-reference output blocks without another image
dispatch. Focused lint passed. The initial sandbox test launch failed with
`spawn EPERM`; the same focused command passed outside the sandbox.

The staging inspection identifies item `9ab7d95a-c722-4e06-bc9d-6ee2a75c070f`
and job `575b5f2e-4637-4a63-afe6-39ee515be532` as stale bookkeeping for the
blocked run above. Its J13 operation is succeeded, but page materialization did
not finish. The user approved failing only these two bookkeeping records after
a verified staging backup. Preserve the failed run, saved operation/result,
assets, Cloud and production; do not replay generation. The retained deployment
journal was at `draining`, with an empty backup ID. The user subsequently
approved reconciliation of three additional historical operations and their
owning paused runs. On 2026-10-07, runtime-key GETs proved two terminal failures
and one successful tester execution with a mismatched saved publication.
The exact-target repair retained successful results/materialization and recorded
provider status, prior operation state, publication identities and backup ID in
`maintenanceReconciliationJson`. It did not label the mismatched publication
verified, reopen failed runs or replay generation.

The operator's repair passed with verified backup
`staging-approved-reconciliation-20261007T083649Z-4008958`: archive SHA-256
`1256b30c03b6c96968e8784990e3b91d1e61c6295959155f7fba7a0bf1ebe2d0`,
56 referenced assets, and the complete staging collection inventory. The normal
maintenance-idle postcheck passed. The prior app restarted healthy and admission
reopened with zero active mutations. Saved data, assets, Cloud and production
were preserved. Read-only status
[37595401356](https://github.com/karpishe-experiments/agentic-poc/actions/runs/37595401356)
confirmed the unchanged retained deployment target. Maintenance resume
[37595520504](https://github.com/karpishe-experiments/agentic-poc/actions/runs/37595520504)
passed in 3m33s. It completed retained request `37510610960-1`, deployed staging
`0a8ceb4a7b23ef1a0fef62a6fba29790b4acb950` with immutable image
`sha256:772a7607f69303d46c43851cd8b4f823341953680910d9cb82151cf8f19fcbed`,
and retained normal release backup `staging-20261007T084407Z-0adf5dd0b58a1ba4`.
[Check 37596067024](https://github.com/karpishe-experiments/agentic-poc/actions/runs/37596067024)
passed in 21 seconds. The null-cover correction is deployed and healthy;
the prevention fix and linked successor acceptance remain separate checkpoints.

The local prevention correction closes eligible running item/job bookkeeping
inside `blockRun` only for a definite failure and exact terminal J13 evidence.
Eight focused checks passed; focused lint and clean-candidate typecheck passed.
The corrected unit fixture passed six checks. Independent code review passed.
Unknown outcomes and missing evidence remain untouched. Frozen publication
validation passed 108 files/822 tests, full lint, clean-candidate typecheck and
12 agent fixtures. Two consecutive independent publication reviews passed.
[PR #156](https://github.com/karpishe-experiments/agentic-poc/pull/156) merged as
`e6c2880a2b60954c44fb5482b3fa5aabee744b3b` after
[Validate 37591306685](https://github.com/karpishe-experiments/agentic-poc/actions/runs/37591306685)
passed in 8m12s. The same issue branch is refreshed and pushed. This prevention
fix subsequently deployed to staging through the selective five-file carry in
[PR #157](https://github.com/karpishe-experiments/agentic-poc/pull/157).
[Validate 37596807036](https://github.com/karpishe-experiments/agentic-poc/actions/runs/37596807036)
passed in 9m43s. Release `7ba44bb074571986a99d7b881996e0d689895428` passed
[Deploy 37598051484](https://github.com/karpishe-experiments/agentic-poc/actions/runs/37598051484)
in 7m34s and
[Check 37598968090](https://github.com/karpishe-experiments/agentic-poc/actions/runs/37598968090).
The deployment retained backup `staging-20261007T090930Z-88ccce34fab4bb73`
and immutable image
`sha256:0d2f9a51e33a3bec93d0c75533bc44c00c20b438b5ad1b579aab4467fea63972`.
Read-only Community MCP checks matched all eighteen retained publication IDs
and graph hashes; none has a Workflow Tool binding. No configuration changed.
One browser submission created linked Simulated Kid successor
`0748fbca-7fec-4265-80f6-94ec0813620e`, booklet
`8e75243d-44fa-4268-8af1-3eb2e2ef5923`, from failed predecessor
`743163ae-d179-49de-82d7-382fa8bd1941`. Its first saved tester decision grants
J01–J13, with zero payable calls. Full successor completion and the Parent/Creator
campaign remain unverified; the failed predecessor remains retained.

The successor subsequently saved and approved its cover and all three story
pages. Generation verification completed with 46/120 logical text requests,
9/12 logical image requests and zero payable calls. Evaluation remains pending.
Tester operation `5b37da71-2167-4f2e-a826-9ba143373bb9` is retained as an unknown
Booklet outcome. Read-only Community MCP inspection of Dify run
`0a794c0e-884a-4e2d-8e49-5c338fd8cf6b` confirmed a terminal failure at
`authorize` ("Reserve once in Booklet"): the read operation timed out after
30.021055 seconds. The identity node passed; no feedback simulation node ran;
Dify reported zero tokens. No replay or in-place acceptance repair occurred.
The authorization endpoint also constructs evaluation context and performs full
generation verification. Repeated source and byte verification in that path is
a performance hypothesis, not yet a measured cause. Inspect that path before
choosing a correction; retain all validity and approval checks.

The local correction batches current version, approval and dependency-edge reads
into three serial transaction commands. It retains exact artifact ownership,
run/booklet approval scope and dependency membership checks. Completion also
uses the page assembly verifier's existing source checks rather than repeating
the same source walk immediately before that verifier. Image byte verification
is unchanged. The initial batching candidate passed three focused persona cases
(76 skipped, 110.40 seconds), focused lint and independent read-only review.
The final duplicate-walk candidate passed the same three persona cases
(76 skipped, 138.98 seconds), standard typecheck in a clean candidate snapshot,
focused lint and whitespace checks. Those timings include whole local simulated
journeys and are not a callback latency benchmark. Publication-wide checks and
final independent reviews remain pending. Neither correction is deployed; live
latency and full completion remain unverified. No request timeout or automatic
retry setting changed.

Read-only node timings for this successor's successful Page 1 image workflow
`132cc880-58bd-4dea-b435-1ce3865b43e7` locate most of its 51.71818 seconds in
Booklet HTTP calls: authorization 16.516749 seconds, fixture download 8.054455
seconds and binary upload 26.108658 seconds. The identity, preparation and
acknowledgement code nodes each took less than 0.2 seconds. This trace does not
support attributing that page's latency to fake image generation or sandbox code.
The current completion correction targets evaluation checks; it does not claim
to resolve those separate image callback costs.

The saved-output correction routes booklet inspection through
`/experiments/booklet-runs/<runId>` and the existing authenticated detail API.
Legacy Booklet services still exclude `dify_booklet_v1`. J13 versions now expose
cover/page previews and original-image links, including historical outputs.
Focused UI tests passed 23 checks without retries. The isolated browser fixture
passed one test and verified navigation with an experiment-profile booklet,
cover/page previews and original links. Its API and image responses remain
fixtures; this does not prove live Dify completion. Standard typecheck passed in
clean main and staging candidate worktrees; focused lint passed. The root checkout
typecheck was contaminated by temporary worktree sources and stale Next.js types,
so it is not reported as a pass.

## Latency and asynchronous completion correction

Apply the reviewed correction before the next M3 acceptance campaign. The approved
scope is callbacks, the existing transport and dispatcher, and additive operation
observation fields. Do not add a queue, service, collection or alternate runner.
Public callback contracts, request limits, publication checks and single-persona
sequencing stay unchanged. No paid call, reset or production change is authorized.

| Checkpoint | Decision and verification | Exit evidence |
| --- | --- | --- |
| Optimize measured callbacks | Time authorization, claim, context, source checks, decode, storage and finalization using sanitized run/operation IDs and counts. Batch independent metadata reads; keep MongoDB transaction commands serial. Reuse source evidence and immutable bytes only within one transaction attempt, keyed by identity and digest. Rebuild evidence on retry. Return the verified image request from the claim instead of repeating its source walk. Synthetic fixture access validates current claim, fingerprint, sources and approvals without downloading references. Reject invalid upload identity/lease before decode or storage; retain exclusive writes, original-byte readback and full source bytes at final acceptance. | Focused stale-source, ownership, claim, corrupt-byte and callback regression checks; bounded query/storage counts. Compare Dify node timing with server spans. Inspect transaction retry, storage latency and connection reuse before assigning remaining delay to a cause. |
| Observe asynchronous execution | Submit exactly one streaming POST. Parse bounded SSE, including chunk splits, multiple events, CRLF and comments; reject malformed events. Validate the workflow run/publication identity at `workflow_started` and durably save the run ID, including matching callback-first claims. Return accepted/running, not success. Terminal GET evidence gates publication acceptance. Retain a managed reader until terminal output or the original deadline. Reconcile callbacks and one app-key GET per five-second observation cycle; terminal stream events can request immediate observation. Never repeat POST automatically. | Model-free execution lasting more than 30 seconds; early saved ID; stream-loss and restart recovery of that same operation without another submission. Local mocks do not meet this live gate. |
| Review, release and accept | Freeze one candidate; run final affected validation and two consecutive clean independent reviews, required CI and the authorized staging delivery process. Reconcile active/uncertain work before deployment. Preserve failed runs and saved assets. Check collaboration memory/health, recent OOM/restarts and Engine.IO; reuse the existing 1536 MiB correction if healthy. Reuse completed Kid evidence, then run Parent and Creator sequentially. | Each case finishes generation, tester feedback and judge assessment without repair and with zero payable calls. Callback p95 below five seconds and maximum below ten seconds are diagnostic targets, not completion gates, under the 2026-10-11 user amendment below. Record cold-start timing separately. Retain exact release/configuration/run IDs and timing evidence. |

Connection/start acknowledgement remains bounded to 30 seconds. The original
operation deadline was ten minutes in the deployed async baseline. The approved
bounded-operation correction below replaces it with five minutes from active
preparation; claim, polling, restart and reconnection must not extend it. Dify callback timeout
settings remain unchanged. A timeout is not proof of execution failure. Stream
loss with a saved ID permits GET recovery; without an ID, inspect callback state
and retain an unresolved outcome as unknown. Reconcile terminal Dify failure
against any completed or late callback. Pause stops new work, not reconciliation.
Expired or unidentified uncertain work retains the single-experiment lane until
its outcome is resolved; it does not permit replacement or another persona.

Use focused transport, callback and recovery tests during implementation. Cover
delayed completion, malformed/wrong identities, duplicate callbacks, stale
approvals, concurrent claims, source changes, corrupt/missing bytes, restart,
deadline expiry and Pause/Resume. Use injected latency and call counts rather than
fragile wall-clock assertions. Keep MongoDB files serial. Run one representative
full journey while editing and all three personas at the final affected
checkpoint. Reuse unchanged results; do not repeat the broad local suite by
default. Required CI and live acceptance remain mandatory.

Current evidence: the previous broad candidate completed with exit code 0
(108 files/822 tests); its Windows MongoDB shutdown warning was not a failing
exit. New async changes invalidate affected transport/recovery checks, not those
unrelated assertions. The callback correction is local and not deployed.
[Community check 37607695900](https://github.com/karpishe-experiments/agentic-poc/actions/runs/37607695900)
passed read-only service readiness and Engine.IO on 2026-10-07; it does not by
itself prove current memory/restart/OOM observations. Live callback targets,
long-running recovery and uninterrupted acceptance remain pending in the
[readiness register](EXECUTION.md#b-authorization-register).

The local correction now passes 53 focused transport, dispatch, image-storage
and HTTP checks (the corrected HTTP fixture passed seven checks separately),
sixteen focused async recovery/lane checks, and 12 agent fixtures. The affected
completion suite passed 78 cases; its two polling-clock fixtures subsequently
passed in the focused rerun. Earlier three-persona completion checks verified
one GET per required image and no verification HEAD calls. Standard typecheck
and lint pass in a clean candidate snapshot; generated local worktrees are not
validation inputs. Publication requires two clean independent reviews and CI.
At start acknowledgement, publication is validated but only the run ID is saved.
Terminal GET evidence still gates publication acceptance and materialization.
These local results do not establish the live callback performance targets.
The final three-persona completion selection passed three cases in 89.32 seconds.
The last correction classifies callback-completed text or image work with a
failed/stopped Dify result as a definite inspection blocker, including previously
unknown outcomes. The transaction requires the latest saved operation, exact run
ID and publication; it preserves output and never replays.
Its sixteen-case focused selection passed. Final publication review must include this
correction. No new staging release is deployed. Before reconciliation, read-only
inspection found the previous Kid tester operation unknown. The operator authorized its
backup-protected staging reconciliation and future staging reconciliations in this
session, with exact-record verification, retained data and no replay. This
reconciliation is complete, as recorded below; live acceptance remains pending.

[PR #158](https://github.com/karpishe-experiments/agentic-poc/pull/158) publishes the
reviewed async candidate. CI `37613399435` passed typecheck/lint but found a late
J11 callback regression: read-only source recovery still required terminal
publication evidence on the current unknown operation. The correction permits
only the exact dispatched, claimed Simulated text operation to read its current
sources before terminal GET. Completed source-image publication, approvals,
dependencies, bytes and the next-dispatch publication gate stay unchanged.

CI `37614794809` passed the late-callback cases, then exposed an error-category
regression in selected reference-byte verification. Digest/length mismatches
remain rejected, but must retain the corrupt-byte diagnostic instead of being
reported as unavailable storage. The attempt-scoped verifier now distinguishes
an evidence mismatch from a storage-read failure; no verification is removed.

The operator's root preview and apply passed on 2026-10-07 for tester operation
`5b37da71-2167-4f2e-a826-9ba143373bb9` and owning run
`0748fbca-7fec-4265-80f6-94ec0813620e`. Application-key GET confirmed that workflow
`0a794c0e-884a-4e2d-8e49-5c338fd8cf6b` failed under the expected publication
`dd1cf687-2c2c-45bc-9c1e-10fffa820909`, with no saved callback result. The
exact-record transaction now retains the operation as failed and the run as a
definite-failure blocker at revision 311, clears its active pointer and preserves
Pause off, counters, generation evidence and saved data. No workflow was replayed.

The verified backup is
`staging-tester-reconciliation-20261007T123825Z-455054`: archive 371714 bytes,
SHA-256 `b7e17d0af3b12687c901319ec3a11a0a7dde0e497c5bbe1869ca9ac63e26f0b3`,
with 65 assets. The same staging release
`7ba44bb074571986a99d7b881996e0d689895428` restarted healthy. Final read-back
confirmed maintenance off, zero active mutations and no other active/uncertain
work. No deployment, reset, Cloud or production change occurred. The
[readiness register](EXECUTION.md#b-authorization-register) has no remaining
manual action for this reconciliation. Do not repeat the repair. Uninterrupted
successor acceptance and the async candidate release remain separate gates.

CI `37616296644` passed 245 tests before a stale orchestration polling fixture
failed. The fixture expects another observation without advancing the injected
clock through the new five-second slot. This does not establish a runtime defect
or a passing candidate. The operator approved the focused fixture correction on
2026-10-07 after the implementation workflow's two-cycle stop. The fixtures now
advance their injected clock before expecting another GET, assert no immediate
extra GET/POST, and separately verify expired unknown recovery through its
original ID without releasing the persona lane or extending the deadline.
All 13 orchestration cases passed in 23.38 seconds; focused lint and standard
typecheck in the clean candidate snapshot passed. Its 23 affected code/test inputs
match the working candidate; ignored stale output checkouts are not inputs.
Runtime source and limits are unchanged. Required corrected-head CI remains a
publication gate. PR #158 remains unmerged; no async candidate is deployed.

Corrected-head CI `37625019731` passed typecheck, lint, agent checks and 525 tests
before the Pause-after-authorization HTTP fixture failed. That fixture created
its dispatch at millisecond 3 but invoked authorization with the current wall
clock. The preserved original deadline therefore correctly treated it as expired.
Both HTTP authorization fixtures now create their operations on the handler's
wall-clock timeline, without changing assertions or runtime deadlines. All three
HTTP cases passed in 6.35 seconds with the CI fake-provider environment; focused
lint passed. New-head CI and live acceptance remain required.

### Current correction checkpoint — 2026-10-07

PR #158 merged the fixture and async corrections into master. PR #159 carried
the reviewed correction into staging without importing unrelated master changes.
Staging CI `37628407850` passed 114 files and 896 tests. Deploy
[`37629970008`](https://github.com/karpishe-experiments/agentic-poc/actions/runs/37629970008)
and Check
[`37630937592`](https://github.com/karpishe-experiments/agentic-poc/actions/runs/37630937592)
passed for `ad49196d9f78148c85ba186f7ba07647647382ff`. The deployment retained
backup `staging-20261007T134203Z-48105390ec18c8ea` and selected image digest
`a5a1db2f176b6c0d23c53d35177f5cb8422983401f3673d1561fa1942cbeb170`.
Earlier failed-CI and undeployed-candidate statements above describe superseded
checkpoints, not the current release.

Disposable app `issue65_m3_async_recovery_probe`
(`17fc8851-9c0c-4a85-a4b4-babb47489860`) reuses the manager graph with four
sequential ten-second code delays after authorization. The corrected graph passed
server-default validation with no issues and matches the independently reviewed
node data. The browser editor changed only its connections because the pinned
MCP draft-sync request is incompatible with Community 1.17.1. Publication
`fe32380f-24d4-4a0f-8d6a-3a2eb77c67c7` was read back with hash
`f90de73ff7f9ad4c92ea86077c5f9cf7306024503904c0581d8148f23253624b`.
The operator prepared the API key privately on 2026-10-08. Separate encrypted
temporary settings preserve the normal eighteen-binding file; validation confirms
only the manager app, publication and key differ. Execution remains pending.
Protected staging activation
[`37748617266`](https://github.com/karpishe-experiments/agentic-poc/actions/runs/37748617266)
passed with verified backup `staging-20261008T081545Z-8874004239362335` and the
same application image. The first probe under that binding failed as recorded
below; it did not restart staging or prove recovery.
The private handoff is in the
[readiness register](EXECUTION.md#b-authorization-register).

The operator's root readiness check passed on 2026-10-08. The installed manager
app and publication match the temporary probe, with eighteen bindings. Staging
reported maintenance off, zero active mutations, no uncertain operations, no
runnable runs and zero running legacy work items. Collaboration reported healthy,
1536 MiB, no OOM and zero restarts; local and public Engine.IO handshakes passed.
This is operator-supplied host evidence, not a new Codex host inspection. It clears
the readiness handoff only; no workflow or restart ran. The controlled recovery
test must recheck these guards immediately before its single submission.

The controlled restart helper passed eight focused offline orchestration checks,
Bash/Python/Node syntax checks and two consecutive independent clean reviews on
2026-10-08. Its reviewed SHA-256 is
`B9D33A23CDE9A5C86415B325DFBB47DF587C68FB186A79909809DCD83074ED30`.
The Windows copy-only handoff passed PowerShell parsing and independent review.
It checks the readiness and controller hashes and copies complete Bash functions;
it does not execute host changes. The controller requires durable Pause, the exact
staging release/container, healthy restart and post-restart Booklet GET
reconciliation of the unchanged operation ID and deadline. Handled failures make
one exact-run Pause/read-back attempt; they never repeat workflow submission.
These are local helper checks, not live recovery proof. The operator handoff and
normal-binding restoration remain pending in the readiness register. That helper
is superseded for execution: its publication and request identity must be updated
for a linked successor before another submission.

The operator's first probe created run
`048c607f-87ae-4e71-87da-01f4d4b79c2c`. The tester succeeded; manager operation
`30c890b0-4ba6-4887-90ea-a609b04713b9` failed. Its Dify run
`fd9fa18e-c3e5-4be6-b98f-17ef2bd952a0` rejected the authorization callback with
HTTP 401 in 0.117 seconds, but the probe then spent approximately 40.77 seconds
in delay nodes before failing. No restart occurred. The retained run is blocked
and paused, with no active operation and zero payable calls.

The operator saved the existing callback key privately. On 2026-10-08, the probe
was corrected to validate authorization before entering its delay chain; rejected
or paused work bypasses the delays. Four focused graph checks and two independent
clean reviews passed. Browser editing changed only three connections; MCP readback
confirmed all thirteen nodes unchanged and all twelve connections matched the
reviewed candidate. Publication `977605b6-23b8-4302-8b5d-f904d2880111` was read back;
the corrected draft hash is
`4e93da8bdbf44f3c9edae97666bbb464d6967a25e7b5574f6d50a415b20c8a3e`.
The secret variable remains present. Its value was not displayed or independently
authenticated by this graph check. No workflow ran under this new publication.
This graph readback does not establish staging activation or live recovery.
Activation and successor preparation are recorded below; live recovery remains
unproven.

The corrected temporary binding was prepared in a separate encrypted v3 file and
activated by [rotation 37759093276](https://github.com/karpishe-experiments/agentic-poc/actions/runs/37759093276).
The rotation succeeded with verified backup
`staging-20261008T094800Z-d0e67cb3f022820f`, retaining the same staging release and
application image. The successor controller passed nine focused offline tests,
Bash syntax checks, PowerShell parsing and two consecutive clean independent
reviews. Its SHA-256 is
`4F10C1A7AEC3FCD8DC703F4C1AE38052D23089976CF123B617401E168D04C300`;
the matching readiness helper is
`559104C21D7D5D5BA439DBB7727849D30C62AC4299E81337D71318CACF1C9C55`.
It uses request `89a5bf8b-6f9b-4fe8-8438-8c7769489436`, links the failed predecessor,
and stops promptly on definite manager failure. No successor workflow has started.
The operator's second probe passed installed-binding, idle and collaboration
checks and created run `329e8407-22e3-44c4-88c8-a8b44341611e`. Manager operation
`5d4e8dc5-88bb-43e1-b776-2aca351e138b` was claimed once and durably paused. The
controller failed before restart because JSON omitted the not-yet-set optional
publication field and Python indexed that absent key. This is a controller defect,
not a workflow timeout. MCP later retrieved its original Dify execution
`45a8915b-3c8a-4c27-823b-7ca6efcc125d`: succeeded in 43.85756 seconds, zero tokens.
This proves long-running workflow completion, not application restart recovery.
The controller now emits null for the optional field and handles its omission;
ten focused offline tests pass, including that regression. The previous controller
hash is stale and must not be executed. The operator's subsequent read-only
inspection confirmed both tester and manager operations succeeded, with saved
results and verified publications. The run remains paused with no active operation
and zero payable calls. This clears the saved-result inspection handoff; it does
not prove restart recovery. Preserve this paused probe without replay or in-place
repair.
Recovery proof and normal-binding restoration remain pending.

The corrected next one-shot controller passed ten offline orchestration tests,
two mocked tests of its actual Node admission path, syntax checks and two
consecutive clean independent reviews. The admission tests reject six changed
prior-probe conditions before any POST. Controller SHA-256:
`CC317739FD562F3572DB40EC7B5E7868D1E7F11955E2D0ACCAF2E84EBE209B80`.
The hash-checked Windows copy helper is
`EAB30EF88EFD0F959D1EF54B443E7BF93EED65ABBCEBFCDB5F576DA860AC5F08`.
Request `dbb934e4-cd90-4c47-ac3b-f3dc26ff93e9` is a new one-shot identity, not a
replay of either earlier probe. It retains the original terminal failed run as
predecessor and verifies the second paused probe's saved result before submission.
The same reviewed publication and staging binding remain installed; no new
credentials or application deployment are required. The root recovery handoff
passed in operator-supplied root output on 2026-10-08. Run
`9b8766bd-3253-4ffc-84d8-3252323fd3de` retained manager operation
`b8e1a0a5-ae0e-44a3-8ae3-85bc4039ff82` and Dify run
`6a3bf4e9-62a1-4212-9cbe-aee055405198` across the staging application restart.
The manager retained one reservation and deadline `1791454800686`; it completed
with a saved result and verified publication after Booklet's post-restart
observation. Dify elapsed time was 43.809128 seconds. Pause stayed saved and
payable counters stayed zero. Container StartedAt changed from
`2026-10-08T09:49:43.2658313Z` to `2026-10-08T10:10:10.172831962Z`.
The operator reported PASS without controller POST replay. This establishes
same-operation application-restart recovery; it does not complete persona
acceptance or prove campaign callback latency. Normal-binding restoration was
completed separately as [rotation 37761873704](https://github.com/karpishe-experiments/agentic-poc/actions/runs/37761873704),
with verified backup `staging-20261008T101219Z-35bbabd4a2f107f6` and unchanged
application image. Runtime normal-binding readback and persona acceptance remain
pending at that checkpoint. Subsequent operator readback confirmed the idle host,
eighteen normal bindings, manager app `46572ccb-d954-45e5-b73d-90fd0995cdb6`
and publication `7425dbd8-efc5-48a7-8fe6-687b574d740f`. Chrome control then
read the staging runner successfully after the operator reopened it. The earlier
client-side block's cause was not established; no protection was bypassed.
Linked Simulated Kid successor `88a58434-be3f-4936-8f09-dd02efa29c9a`
reached approved J12 work, then blocked at manager J13 acknowledgement, with
predecessor `0748fbca-7fec-4265-80f6-94ec0813620e`. Retain this failed run.
Early trace samples show manager authorization/save at 0.833/0.417 seconds,
and first image authorization/download/upload at 0.843/0.558/3.234 seconds.
These samples do not establish full-run callback p95 or completed acceptance.

The J13 manager workflow `68d411a1-fed7-49de-bd59-ed6590db6f95` authorized
in 2.599 seconds and received HTTP 400 from save in 3.137 seconds. This was
not a timeout. Repository materialization emits `delegatedTaskId: "J13"`, but
the HTTP response summary accepted only J01–J12. The candidate correction uses
the existing thirteen-task schema for that response field; page-only admission,
source verification and text-specialist scope are unchanged. Twelve focused HTTP
unit tests pass, including saved J13 acknowledgement, duplicate completion and
response-field filtering. Live correction and linked-successor acceptance remain
pending. No credential inventory change is required: names, storage and consumers
are unchanged.

The J13 acknowledgement correction was merged through PR #160 and carried to
staging through PR #161. Deploy `37772643670` and authenticated Check
`37773541053` passed for `1a5027ba0f009712d79112828173d6f59a4a730a`;
backup `staging-20261008T115423Z-86b08aab0eeaf392` was retained. The linked Kid
successor `12cce8da-9787-4293-8149-f51a73bfcd66` was created once but did not
dispatch. Operator host evidence on 2026-10-10 confirmed revision 0, zero
counters and no operation. The failed predecessor's latest manager operation
`fa9d1c9a-51a4-4083-97d1-34e21474f479` retains saved output but no verified
publication. The dispatcher therefore holds the single-experiment lane.
Operator evidence on 2026-10-10 confirms exact-record reconciliation completed
with verified backup `staging-manager-reconciliation-20261010T081641Z-1843019`
(SHA-256 `5768a6e3b7709df6b8ae5e51ce7cdc2ea472ebba64bd57d484b1ec6a71f88690`).
Saved data was preserved, the original release is healthy, admission is open,
and final drain counts are zero. No replay or deployment occurred.

The same successor was resumed once. It reached approved J12 work, then blocked
at revision 222 before a page-image operation was submitted. Its latest manager
operation `f6b7401c-eaa8-466b-93bd-bffee8e46bd5` has saved output. Dify run
`72ea31ee-fd02-492c-a2dc-f88837a3a14f` succeeded in 6.835408 seconds with zero
tokens. Authorization took 2.669448 seconds and save took 2.956669 seconds;
both returned HTTP 200, including `delegatedTaskId: "J13"`. This verifies the
acknowledgement correction, not full acceptance or callback p95. Counters are
38 logical text requests, five logical image requests and zero payable requests.
Preserve this failure. Diagnose the page-image admission/progress boundary before
another successor; do not replay the manager or repair this run into acceptance.

The operator's read-only boundary check confirms the manager publication is
verified and `noProgressCount` is 1. Source verification rejects the already
blocked run with `Style assembly requires idle simulated work`; this does not
prove corrupt bytes. A focused regression reproduced a stale dispatcher snapshot:
publication recovery updates the database, but dependent page admission receives
the earlier unverified manager object. Reloading that operation after recovery
passes the regression, preserves the original manager identity and submits one
page-image request. The test failed before the correction and passed afterward
(one selected test, 93 skipped). This correction passed review and CI, merged
through PR #162 with staging carrier PR #163, and deployed at
`2cde9ba3688f7a42cb102914bcf59d0f2d5d8139`. Deploy `38044777414` and
authenticated Check `38045336624` passed.

Linked Kid successor `0b8807b6-7b3d-4c81-8639-f8d4b950211e` reached J13
but blocked with zero payable requests. Preserve it as failed acceptance.
Operator phase evidence for image operation
`28c35def-50c1-486f-a165-225a9a0837b4` reports 60,708 ms upload callback:
preflight 5,692 ms, claim 14,547 ms, storage 1,318 ms, decoding 37 ms and
finalization 38,607 ms. Finalization accumulated 32 instrumented queries and
20 reference-storage calls, consistent with four verification attempts. These
counters do not identify every database query or prove the precise retry cause.
Five-second observation writes target the same operation record as finalization.
The candidate suppresses those writes during an active upload lease, retains
expired-lease recovery, acquires the claim write before source verification in
the same rollback-protected transaction, and removes redundant output HEAD/readback calls while
preserving exclusive writes and digest verification. Thirty-three focused
integration tests pass, together with focused typecheck and lint. Two independent
reviews and required CI passed; PR #164 merged the correction into master, and
PR #165 carried the identical runtime changes to staging. Deployment passed;
authenticated Check passed; live callback performance proof remains pending. This is
not evidence that the timeout correction or M3 acceptance is complete.

Operator evidence confirms backup-protected reconciliation of this exact image
operation on 2026-10-10. Verified backup
`staging-image-reconciliation-20261010T143636Z-2920077` has SHA-256
`2f13f8506793dc8ba4a846fbaae12d9cc43095f1db61796922d316a849976b34`.
Saved output, materialization and assets were retained; the conflicting operation
was marked failed without replay. Final idle checks passed, the original release
was healthy and admission reopened. Deploy `38060654175` targets staging commit
`64e90003b8a2d33caf306ae312b1683fed40f98b` and passed. Its retained backup is
`staging-20261010T144805Z-671d0c7943cdf222`. Authenticated Check `38061648620`
passed. Linked Kid successor `1314c664-3e2b-492d-8e9a-18aa54f0add3` was
submitted once with booklet `8c5e1ed3-c66f-4554-8721-7380938c8a72`. The live UI
reached completed revision 311, with generation and evaluation complete, saved
tester feedback and independent judge assessment, 47/120 logical text requests,
9/12 logical image requests and zero payable requests. No repair or restart was
performed during this run. Detailed current-artifact acceptance remains to be
audited; callback performance does not pass the correction's target.

Read-only Dify trace for this run's image operation
`dafcc406-1bbb-403d-9e2e-461752b2dba5`, workflow
`038241d8-44a7-4edb-abd9-c5f7ba8d87e0`, reports successful execution in
49.538707 seconds with zero tokens. Authorization took 13.681328 seconds,
fixture retrieval 7.995719 seconds and upload 26.231024 seconds. These node
durations do not isolate database, transaction-retry or proxy time. Collect the
existing allowlisted server phase records before assigning the remaining delay
to a specific cause. Parent and Creator have not started.

The next local correction removes upload preflight's duplicate metadata-source
walk. Preflight retains identity, recoverability and competing-lease checks;
claim still verifies current sources before storage, and finalization still
verifies source bytes. Finalization rejects an invalid lease or path before its
source walk. Eight focused page-image storage tests pass, including bounded
preflight, invalid finalization lease, stale sources and changes during storage.
This candidate is not deployed and does not establish callback performance.

The operator's retained server output contains 288 phase records for this Kid.
Authorization p95 is 12,785 ms (maximum 28,167); image callback p95/maximum is
28,288 ms; result finalization p95 is 14,637 ms (maximum 28,800). Image storage
p95 is 1,833 ms and decode maximum is 182 ms. For image operation `dafcc406…`,
preflight took 7,867 ms, claim 7,950 ms, finalization 9,157 ms and storage 943 ms.
Fixture authorization took 7,897 ms with zero reference-storage calls. The
remaining delay therefore occurs in server verification, including metadata-only
paths, not primarily in image decoding or output storage. Instrumented query
counts are partial; do not treat them as total MongoDB commands. Evaluation
context reached 27,415 ms with 32 instrumented queries and nine storage calls.

The next candidate also batches pagination's six fixed book-source reads into
three serial queries and batches its reference artifact/version/approval reads.
Style sample assets use one batch query; sheet source artifacts and versions use
one query each. The local candidate now shares seven serial metadata reads across
page, style, sheet and completion verification within one transaction attempt.
Each retry creates a fresh attempt. Per-consumer identity, ambiguity, approval,
dependency and byte checks remain unchanged. Dispatch preparation shares that
attempt across the selected page and its siblings. Its focused regression passes;
source typecheck and focused lint pass. The three focused persona-completion
cases pass (3 tests, 91 unrelated cases skipped; 69.56 seconds). Their old
query-shape assertion now checks the single run-artifact batch; current approval,
lineage, original-byte and no-HEAD assertions remain. Independent review and deployed timing
proof remain pending. This is not evidence that the performance target passes.

The dispatcher compares its current configuration snapshot with the saved run
before observation. Therefore application-restart proof requires a controlled
temporary probe-manager binding, not an isolated process with mismatched bindings.
Drain and reconcile before changing bindings, retain the normal configuration,
stop new probe dispatch after its single operation, recover that same operation
without POST replay, then drain and restore/read back normal bindings before Kid
acceptance. Do not count a paused authorization or standalone Dify execution as
successful runner recovery. Application-restart recovery passed as recorded above;
full-campaign callback performance, campaign-time
collaboration health and uninterrupted Kid → Parent → Creator remain unproven.

### Automated diagnostic candidate

Kid `390e8f0b-440a-4ebe-8a57-d23a80d5c8bb` is blocked at J07. Its Dify
identity code node failed after 15.014 seconds with `timeout` and `signal: killed`,
before authorization/reservation. This does not prove an OOM cause. The retained
14-event phase groups show authorization p95/max 3906 ms, claim 2753 ms,
context 3471 ms and result finalization 4442 ms. Later image callbacks and full
completion remain unverified.

The next candidate adds authenticated staging phase diagnostics and restricted
host/run diagnostics through Dify operations. It raises only the Python sandbox
target from 256 to 1024 MiB, with live capacity and idle-work guards. See the
[operating procedure](https://github.com/karpishe-experiments/agentic-poc/blob/master/docs/deployment/dify-community…20509 tokens truncated…lity above; a later graph test
still expected twelve modules and was corrected. A main-checkout typecheck hit
the already known stale generated types and nested worktrees; it is not counted
as a pass. Links and whitespace passed. Independent reviews and publication
remain pending; no Dify import, binding expansion, deployment or provider call
occurred in this preparation slice.

S1's first parser increment accepts `schemaVersion: "2"`, title and narrative
lists. J03 rows have `entryKey`, `nameOrRole`, `narrativeFunction`, `role`,
`knownRelationship`, `knownFacts` and `openQuestions`; package notes are
`castNotes`, `representationAndSafety`, `manuscriptQuestions` and
`approvalQuestions`. J04 rows have `entryKey`, title, `storyPurpose`,
`knownFacts`, `likelyScenes` and `openQuestions`; package notes are
`worldAndSafetyNotes`, `manuscriptQuestions` and `approvalQuestions`.
Keys `character_1`/`character_2` and `location_1`/`location_2` identify stable
proposal entries, not durable application IDs. The later materializer assigns
durable IDs once and retains the same keys/IDs across renames. Validate two
character entries and one/one/two location entries for the fixed cases, unique
keys, required content and the bounds below. Strip unknown visual-design fields.
Preference-length deviations remain warnings. Example J03 entry: `character_1`,
`Young inventor`, `Invents a safe kite retrieval plan`, `main`, `Friend and maker
of the tiny robot`, known facts from the approved outline, and any unresolved
narrative questions. No storage transition or Dify execution occurs in this
parser increment.

The local `simulateDraftListResult` input contains mode, persona, exact brief,
approved Concept/Outline content, and optional current content, saved answers,
revision instruction and material question. It returns a typed draft proposal
with warnings or one unanswered clarification. The owning runtime must prove
approval/source identity before using these contents; this fixture does not
perform database authorization. Revision instructions become scoped package
notes in simulation, not evidence of real-model interpretation. The S1 increment
kept the J01/J02 role-result whitelist. S2 extends local role contracts through
J07; live execution remains restricted to M1 until S3.
Notes-only revisions retain complete existing entries, including their narrative
functions, relationships and story purposes. S2 refreshes content from current
approved sources after invalidation and retains saved IDs by their entry/unit keys.

S1 verification on 2026-10-04: clean checkout at `b84227a` with the exact modified
contracts/fixtures/tests passed typecheck, full lint, 27 focused tests across
draft-list contracts, narrative contracts and fixtures (`--bail=1 --retry=0`),
and all twelve deterministic agent fixtures. The first focused-test attempt was
blocked by sandbox process launch; the same command passed outside the sandbox.
This is local output proof only. Next, S2 integrates these contracts through
normal persistence, dependency gates and role context; S3 verifies actual Dify
bindings before live narrative dispatch. No provider calls or Dify mutations
occurred in S1.

## Schema and dependency work

### S3 binding and publication package

Accept exactly the existing six-slot M1 bundle or the eleven-slot narrative
bundle: one manager, J01–J07 specialists and three persona testers, all with
distinct app IDs. Reject partial or duplicate profiles in both the application
reader and protected host validator. Keep the existing six app names/identities;
name the five additions `issue65_m2_J03` through `issue65_m2_J07`. Generate each
as a separate model-free workflow, with the same authorization/save/ack gates.
Retain the M1 Python fixture and add a self-contained M2 fixture with TypeScript
parity tests. A preparation profile selects the fixture; it does not enable
Balanced or Real mode.

The runtime POST invokes the app's latest publication; it does not select the
recorded publication ID. Do not claim immutable execution of an older version.
Before changing shared manager/tester publications, close dispatch admission and
reconcile in-flight operations. Preserve completed M1 boundary evidence without
reclassifying it after a settings change. An unfinished run whose saved bindings
differ from the current profile remains blocked and requires a linked successor.
Never rewrite its configuration snapshot or replay uncertain execution.

Edit configuration and its focused tests, graph/module preparation and graph
tests, Python/parity tests, the protected validator and shell contracts, then
boundary-preservation dispatch tests. Run typecheck, lint, all runner tests,
agent fixtures, isolated deployment contracts, `bash -n`, ShellCheck and both
deployment shell suites. After two clean reviews and publication, prepare the
five new Dify apps and private bindings through verified interfaces. Read back
the published graph/IDs before staging activation. New credential entry remains
a private handoff only if a verified private mechanism cannot complete it.

Infrastructure preview `37246255334` at reviewed master
`b1375a0ca29f277d305312891de66d0b1d38bce1` passed on 2026-10-05 with no Terraform
changes. It did not synchronize host files. Applying the reviewed host-dispatcher
and Compose artifact synchronization remains an explicit authorization checkpoint
before eleven-slot private settings rotation; private module keys remain separate.

S2 merged through [PR #104](https://github.com/karpishe-experiments/agentic-poc/pull/104)
after Validate `37236356412` passed. Reviewed source `d9668e256bff358b36b9694126355e4c42ecc75a`,
merge `b2c106d4aefd081985e8cc087252d313bec7adba`; two consecutive independent
reviews passed. No S2 staging release or live M2 binding is claimed.

S3 local verification on 2026-10-05: the isolated candidate passed typecheck,
full lint, 161 runner tests across 23 files without retries, twelve agent fixtures,
46 isolated deployment contracts and nine final UI tests. The Python parity suite
includes canonical saved-JSON key order and reversed location rows. ShellCheck
0.10.0 passed at the CI warning threshold after Linux line-ending normalization
in the disposable checkout. Both full shell suites remain Linux CI gates: local
Windows execution failed on Python alias, symlink and directory-permission behavior.
The focused six-/eleven-slot protected-settings scenario passed locally. Mongo
test teardown required forced termination after its grace period; tests exited
successfully. No live M2 publication, provider execution or staging release is
proved by these checks.

### S2 persistent narrative contract

Current staging release: [PR #109](https://github.com/karpishe-experiments/agentic-poc/pull/109)
merged as `6be02df6fadab2e7e9875eeb79f92227cbcbdbfc`; Validate `37244151819`,
Deploy `37244436632` and Check `37244784612` succeeded. Immutable image digest:
`sha256:da3c08b8eb2a0398346dda08af70bb8a930e22ca03d9b6a35278d8999e8d9e92`.
Chrome reload showed eight saved runs and fourteen approved J01/J02 artifacts,
with zero payable calls. The active six bindings still select the M1 boundary;
this is release/read-back evidence, not live J03–J07 or booklet completion.
This selective release includes the S4 storage foundation from
[PR #106](https://github.com/karpishe-experiments/agentic-poc/pull/106) and image
callbacks from [PR #108](https://github.com/karpishe-experiments/agentic-poc/pull/108).
Both master and staging candidates passed two independent reviews and required CI.
The staging candidate also passed typecheck, lint, 55 focused tests, 33 existing
Cloud/probe regression tests and the standard build. Chrome verified persona
selection and saved trace expansion, including manager/specialist parent links.
No new run or live image transfer was performed in that browser check.

Extend the existing contracts, narrative materializer, repository, context,
dispatcher types and local fixtures through J07. Keep the protected configuration
reader restricted to the six M1 slots until S3. A saved run exposes J03–J07 only
when its immutable configuration contains all five distinct specialist slots;
partial or legacy snapshots keep the J02 boundary. Local integration fixtures
use eleven dummy bindings, not live credentials or a second runner.

Booklet adds `characterId`/`locationId` to accepted draft-entry content. It assigns
each ID once, matches later versions by `entryKey`, and ignores proposal-supplied
IDs. J05 proposes ordered `unitKey` entries with complete prose, action, narration,
dialogue/speaker IDs, characters present and location ID. Booklet similarly adds
`unitId`; units are not physical pages. Final lists reference these saved subject
and unit IDs. They must cover exactly the approved manuscript's subjects and
occurrences; unknown IDs or contradictory recurrence/sheet flags fail technical
validation. Required character facts include background, life stage, physical
description, acting/personality, attire, accessories and expressions. Locations
include description, stable anchors, required features and continuity. All final
locations require sheets; recurring characters require sheets. Artistic style
and physical-page layout remain later responsibilities.

Use the shared ordered source map at preparation, context, completion and
approval. Save immutable source edges, validate sources again before mutation,
and invalidate current descendants through those edges after a revision. Preserve
unrelated siblings and previous versions/approvals. Grouped approvals use task
dependency order. Context may prepare both eligible siblings before asking the
tester for grouped review. Delegation remains an explicit tester decision, not
an automatic consequence of persona defaults. Fixed cast/location counts and
request/revision ceilings are unchanged.

Add `tests/unit/experiment-runner-manuscript.test.ts` and
`tests/integration/experiment-runner-m2-narrative.test.ts`; extend the existing
fixture, contract, context and dispatch suites where needed. Prove all three local
cases through current approved J06/J07, both sibling arrival orders, stable IDs
after rename/retry, rejected unknown references, stale/duplicate completion,
grouped/delegated acceptance, scoped invalidation and restart reads. Run focused
tests without retries, typecheck, lint and agent fixtures. Two clean reviews
precede publication. S2 local proof does not establish live Dify execution;
S3 must prepare/publish modules and verify actual bindings before staging runs.

S2's first increment introduced one shared source resolver in
`lib/experiment-runner/narrative-tasks.ts`. It defines J01–J07's ordered direct
dependencies and accepts only current approved versions. Preparation, completion,
approval and specialist context reuse it. In that first increment, runtime task
admission remained J01/J02; declaring the later graph did not enable dispatch.
J03/J04 capture both approved Concept and Outline versions, including the Concept
source required by Ali's guidelines. J05 captures all four narrative sources;
J06 captures J02/J03/J05 and J07 captures J02/J04/J05, preserving the Outline
input required by Ali's final-list guidelines. Sibling source order in database
results does not change the canonical dependency order.

Verify this increment with `tests/unit/experiment-runner-narrative-tasks.test.ts`
and the existing narrative/context integration tests, plus typecheck and lint.
Missing, draft, stale-review or ambiguous duplicate sources return no eligible
source set. Two clean reviews precede publication. Later S2 work adds durable
subject IDs, manuscript/final-list contracts and their normal persistence paths;
those are now implemented locally as described above. Live bindings remain pending. No settings, Dify publication,
provider call or staging release is needed for this resolver increment.

Resolver verification on 2026-10-04: the exact five source/test inputs in a clean
checkout at `9353940` passed typecheck, full lint, 33 focused tests across the new
source-map unit suite and existing narrative/context integration suites
(`--bail=1 --retry=0`), and twelve agent fixtures. An earlier attempt failed before
test collection when the local Mongo test process exceeded its startup timeout;
an independent startup check succeeded before the final run. Local checks do not
prove J03–J07 persistence or live dispatch. The latest browser run
`4442cb62-1871-46cc-8ff0-e0d3edab941c` still proves only the deployed J01/J02
slice: saved Pause/Resume, unchanged Concept version, exact Outline source,
reload persistence, five logical text calls and zero payable calls/images.

The complete S2 local candidate at baseline `3e79f01` passed typecheck, full
lint, all twelve agent fixtures and 148 runner tests across 22 files without
retries. The local Mongo test process required forced termination after its
shutdown grace period; the test command exited successfully. The final rerun
includes the stable-ID assertions and corrected professional-scene location
routing, including reordered draft locations and final-list occurrences. Normal
dispatch also proves a manager's J04-before-J03 and J07-before-J06 choices,
preserving parent trace IDs rather than forcing the display's task order.
No live M2 bindings or provider execution are claimed by these checks.

Chrome verification on 2026-10-05 created Parent run
`a04d6f31-0b84-4df5-8c71-8cafa5dd27b1`. Pause persisted across reload and
Resume reached the deployed M1 `slice_complete` boundary with J01/J02 approved,
five logical text calls and zero payable text/image calls. Booklet
`1f3b2af0-ec90-4adf-8f73-1781aaf02fdd` retains the results. This verifies M1
controls, not full booklet completion or live M2.

The next Chrome check created Professional Creator run
`e6c595bb-17e4-40e8-83c0-bf5ee2ce6108` through Start selected. It reached the
same deployed J01/J02 boundary with two explicit approvals, six logical text
operations and zero payable text/image calls. Balanced and Real controls remain
unavailable. This is additional M1 UI evidence, not full simulation acceptance.

Extend the M1 task-schema map and ArtifactService, not the old Visual Bible gate.
Read Ali's pinned task guidelines 03–10 in full before writing prompts/fixtures.
Keep the source commit and explicit PRD adaptations in each prompt's provenance.

| Task | Required canonical content | Exact approved sources |
| --- | --- | --- |
| J03 | Character IDs/names, narrative role, known facts, open questions | J01, J02 |
| J04 | Location IDs/names, narrative purpose, likely scenes, known facts/open questions | J01, J02 |
| J05 | Ordered narrative units with prose, action, narration/dialogue and character/location IDs; expansion notes | J01, J02, both J03/J04 |
| J06 | Final character IDs, stable physical facts, recurrence, attire/accessories, expressions, sheet requirement | J02, J03, J05 |
| J07 | Final location IDs, anchors/features, continuity and sheet requirement | J02, J04, J05 |
| J08 | Style definition, typography/bubbles, exact shared module plus hash, two sample build/asset records | J01/J02/J05 and both J06/J07 |
| J09 | One artifact per recurring character; view/expression requirements, assembled prompt, source IDs, build and asset record | That J06 subject and accepted J08 |
| J10 | One artifact per final location; anchors/view requirements, prompt/source/build/asset record | That J07 subject and accepted J08 |

Lists remain narrative memory until J06/J07; do not let draft lists force visual
design. Stable IDs come from Booklet and survive renaming. New entities proposed
by a specialist are materialized once under the operation's idempotency key.
The fixed cases do not expand past two recurring characters and one/two locations.
Ask the tester if a proposal changes that brief; do not silently expand image count.

Separate the J08 textual style proposal from its validation sample operations.
Samples need accepted narrative/final-list dependencies and the exact proposed
style-module version, not a circular requirement that sample-bearing J08 already
be approved. After both samples are stored, explicitly/delegated accept J08.
Only then start sheets. Save a new style version if its module changes.

Hard limits for new content: nonempty required strings, title 1,000 characters,
other individual text fields 16,000, serialized artifact 512 KiB, JSON depth 20.
Parse known canonical fields, strip extras and report preference deviations as
warnings. Bound array lengths by the fixed case and required structure, not
arbitrary quality targets. Missing narrative units/required subject IDs still fail.

## Image operation and storage path

S4's first local increment adds `lib/experiment-runner/image-validation.ts`
and `tests/unit/experiment-runner-image-validation.test.ts`. It copies and hashes
original bytes, derives format and dimensions, and decodes pixels with Sharp.
The existing Sharp dependency is reused. On 2026-10-05, a clean isolated checkout
at `dc8b50e` with these two files passed typecheck, full lint and eight focused
tests without retries. The tests include readable metadata with corrupt pixel
data. The main checkout's typecheck encountered stale generated route types and
nested delivery worktrees; the isolated check excludes those local artifacts.
The validator increment is not yet published. The subsequent local foundation
below adds storage claims and asset materialization. Upload routes and live Dify
file transfer remain S4 work.

The local S4 storage package extends the same operation records with a saved image
request and a completion lease, not a separate job registry. Its request contains
`kind` (`style_preview`, `reference` or `page_source`), exact `prompt`, ordered
unique `sourceVersionIds` and nullable `styleVersionId`. The style version must
also be a source. Booklet computes the request fingerprint and captures those
sources at preparation. Callback identity includes run, operation, workflow,
parent workflow and that fingerprint; the callback cannot select a storage URI.
For example, an authorized fixture operation can retain its approved J01 source
and a fixed synthetic prompt without claiming a finished J08 style package.

Source versions must belong to the run's booklet and remain current and approved.
Only a `style_preview` operation may use its exact current draft J08 style version;
this preserves sample-before-style-acceptance ordering. The 60-second completion
lease fixes the original-byte digest. An expired lease or failed storage can be
recovered with the same bytes, not a second image request. Failed-operation
recovery requires its own unresolved failure and no newer operation in that run.
Persist the asset and completed operation atomically only after storage read-back
and renewed identity/source checks. Preserve counters and prior failure history.
Tests use the normal Mongo collections and an injected AssetStore. HTTP routes,
live fixture transfer and automatic image dispatch remain later parts of S4.

Storage-foundation verification on 2026-10-05: the isolated checkout at `dc8b50e`
with the final source/test candidate passed typecheck, full lint and 22 tests in
three files without retries. Ten Mongo integration cases cover original-byte
storage, duplicate/conflicting completion, concurrent claims, lease expiry,
storage failure, stale/foreign/rejected sources, missing/corrupt saved bytes,
Pause and unknown/definite-failure recovery. Sources require an exact `approve`
record, not merely an artifact state or a rejection record. No provider, Dify
workflow or staging execution occurred in these checks. Independent review and
publication remain pending; this is not live image-transfer proof.

Independent source review found two recovery defects in that candidate: finalization
could lose an earlier failure, and direct filesystem writes could leave an unusable
partial file at the final URI. The correction records each image failure transition
in the existing failure paths and publishes filesystem assets from complete
temporary bytes through an atomic no-clobber hard link. Added regressions cover
unknown-to-definite failure history and interrupted/concurrent filesystem writes.
The corrected candidate passed typecheck, full lint and 56 focused tests across
seven files without retries. This includes eleven Mongo image-storage cases,
existing repository/dispatch regressions, recovery-storage contracts, and atomic
filesystem tests. An earlier broad attempt was stopped after the candidate
changed; it is not a passing result. The corrected broader runner scope then
passed 186 tests across 27 files without retries. Mongo teardown required forced
termination after its grace period; the command exited successfully. Review B
subsequently reproduced a two-frame APNG that Sharp treated as a default
single-frame PNG. A bounded PNG chunk check and the exact APNG regression now
address that gap. Post-correction typecheck, full lint and all twenty affected
validator/storage tests passed without retries. Both independent reviews must
pass again before publication.

Use M1's operation ledger and the existing AssetStore. Implement the callback
image route and operation-bound reference download. Original decoded PNG/JPEG/WebP
bytes are accepted up to 20 MiB, 64 megapixels, positive dimensions and one frame.
Actually decode pixels with Sharp; metadata/signature alone is insufficient.
Derive MIME/extension from decoded content. Do not resize, convert, or overlay text.

The next bounded route slice adds `image-fixture` GET and `image` POST under
`/api/experiments/booklet-tools`, through the existing HTTP factory and two thin
Node route handlers. Both require the existing callback key before database/body
work and remain closed in production or disabled configurations. Query identity
contains `runId`, `operationId`, `workflowRunId`, nullable `parentWorkflowRunId`
and the saved `inputFingerprint`; reject unknown or duplicate fields. The fixture
GET checks a reserved Simulated image operation, exact identity and current
sources without another claim or debit, then returns a small deterministic PNG.
Already admitted paused work may retrieve its fixture; unclaimed or foreign work
cannot. Maintenance closes the route through the existing admission check.
POST streams at most 20 MiB, derives format from bytes rather than the supplied
Content-Type, and calls the storage service inside `runTrackedMutation`. Its
response contains only asset ID, digest, completion state and reuse status.
Neither endpoint accepts an arbitrary URI or URL. Extend only these two exact
proxy exceptions, HTTP auth/body/query tests and Mongo HTTP integration tests.
Local route tests are not live transfer proof; the next synthetic Dify probe must
verify HTTP file output to binary POST and authentication headers without a model.
The ordinary `authorize` callback supplies the saved image request context after
one reservation. Test that callback, fixture download and exact-byte completion
together. Set proxy transport headroom to 32 MiB so the handler can enforce its
20 MiB bound; test the installed Next.js body clone for allowed and oversized
chunked requests. This does not establish live Tunnel or Dify transfer limits.
Local route candidate verification on 2026-10-05 passed clean-checkout typecheck,
full lint and 40 tests across eight files without retries. The standard Next.js
build passed after a lockfile install replaced the temporary dependency junction;
the first build failed because Turbopack rejects a junction outside its root.
The main checkout's typecheck remains contaminated by old generated Cloud-route
validators and ignored nested worktrees; it is not counted as a pass. No live
image transfer or provider call occurred during these checks.

Store under an application-derived booklet/operation/attempt path. Hash original
bytes for completion identity. Claim completion atomically for 60 seconds before
storage, then publish only if that claim and current input fingerprint still match.
Storage failure releases the claim where possible; expired claim can be recovered.
Identical completion returns saved success; different bytes conflict. Failed or
unknown operations can recover their existing image without a new request.

Successful recovery clears current failure fields but retains history and counters.
Late/superseded uploads cannot replace current assets. Maintenance and same-origin
checks remain. Record actual dimensions/format and warnings without making the
result ineligible for acceptance. Never warn by triggering regeneration.

For simulation, Dify follows the same authorization/result/upload branches using
small deterministic generated fixtures. The fixture service may supply image
bytes, but must not bypass workflow callbacks or fabricate live-provider evidence.
Code nodes do not emit Dify `file` outputs; use HTTP file outputs/file variables.
Prove the actual binary upload binding with a fixture before publishing.
The pinned [HTTP editor contract](https://github.com/langgenius/dify/blob/1.17.1/web/app/components/workflow/nodes/http/types.ts)
defines binary and form-data file payloads. This is preparation evidence only;
it does not verify server forwarding, transfer limits or the deployed callback.

The next S4 candidate is `issue65_m2_image_probe`, generated by the existing
module-preparation CLI with `--profile m2`. It is separate from the eleven
narrative bindings and is not dispatched automatically. Its model-free path is
authorization → fixture HTTP download → List Operator `first_record` → binary
HTTP upload → saved-completion acknowledgement. The pinned Dify 1.17.1 lockfile
selects `graphon` 0.7.0: its HTTP node returns `ArrayFileSegment`, while its
binary executor requires `FileSegment`. The selector preserves the original file
without a Code-node byte/base64 transformation. The official
[List Operator defaults](https://github.com/langgenius/dify/blob/1.17.1/web/app/components/workflow/nodes/list-operator/default.ts)
define the extraction settings. Source inspection is not live transfer proof.
No runtime binding, provider configuration or request limit changes in this slice.
Live operation preparation, private callback binding and the synthetic transfer
remain pending; do not label this candidate a complete simulated booklet.
The corrected candidate passed isolated typecheck, full lint and 36 tests across
six graph/Python-fixture/callback suites without retries. The preparation command
emitted eleven nodes. MCP validation returned zero errors and one warning:
the bridge does not recognize `list-operator` and skipped that node's per-type
checks. The official source supports it; successful Studio import/execution
remains required before this warning can be treated as a verified bridge-only gap.

The preparation merged through [PR #110](https://github.com/karpishe-experiments/agentic-poc/pull/110)
after two clean independent reviews and Validate `37245678840` passed. Reviewed
source: `c277e66305e22c07f73a57e3869fbd7977f2a53a`; merge:
`b1375a0ca29f277d305312891de66d0b1d38bce1`. Community import and draft read-back
passed for app `923566e9-c6fd-4936-836f-b21704d39628`, retaining eleven nodes and
the single-file binary binding; draft hash:
`e77a528135fb5fffbdf5ce1a5cab588e8c390334b6a64814bc16925477939743`.
The app has not been published or executed. Private callback binding and saved
image-operation preparation remain pending; import alone does not verify transfer.

For later Real mode, keep the requested model/settings from M0. Prefer a tested
single-request plugin; otherwise Dify HTTP generation/edit nodes with retries off.
Reference-based requests must pass the approved image bytes, not just descriptions.
Test the exact transport against a non-billable fixture endpoint; provider access
itself is proved only inside the authorized Real campaign. For base64 output,
use `POST /image-json` with the unmodified provider JSON response as the HTTP body
and operation identifiers in query fields. Stream-limit JSON to 28 MiB; require
exactly one `data` entry with valid `b64_json`, decode to at most 20 MiB, then use
the same validator and original-byte digest. Persist only allowlisted usage and
asset metadata, never the raw response. Test Community forwarding limits first. Do not pass a 20 MiB
image through an unverified Code-node size limit or pretend base64 is a file.

## Implementation order

The local sheet-assembly contract in
`lib/experiment-runner/reference-assembly.ts` combines a J09/J10 proposal with
saved operation/asset identifiers and an exact image request fingerprint. It
rejects a changed subject, prompt, ordered sources or fingerprint and preserves
the shared style bytes. It creates no operation, asset, approval or database
version. The persistence caller must still verify successful operation state,
current sources, asset lineage and original stored bytes before committing an
assembled version. This helper is not evidence of live sheet production.

Focused assembly/request tests passed (8 tests, no retries), as did isolated
typecheck and lint of the two new source/test files.

The next local persistence candidate is `db/experiment-sheets.ts`, with
`tests/integration/experiment-runner-sheet-assembly.test.ts`. Input is
`{runId, draftSheetVersionId, imageOperationId}`. It combines an existing current
subject draft and one saved successful image after checking exact approved
final-list/style sources, request/asset lineage and original bytes. The transaction
creates one application-owned version with edges to the draft, final list and
style. Concurrent calls and restart reuse the same result; pause and warnings
remain saved. It does not approve, dispatch, create subject artifacts or advance
stages. Its focused tests seed subject drafts. The current runtime candidate adds
specialist admission, per-subject acceptance and scheduling through the existing
repository and dispatcher; deployed execution remains pending.

For that wiring, `lib/experiment-runner/reference-targets.ts` derives stable
J09 character and J10 location targets from final lists and an assembled style.
Each target retains its exact final-list/style version pair. The pure work selector
distinguishes missing/invalidated proposals, textual drafts needing images,
assembled drafts needing review and approved packages. Duplicate current targets,
stale source/subject identities and malformed image builds require recovery, not
automatic image replay. One accepted subject does not complete the other sheets.
The current runtime candidate connects this helper to runner dispatch. Database
approval and stored-file verification remain repository responsibilities.
Focused routing/assembly tests passed (11 tests, no
retries), with isolated typecheck and scoped lint.

The candidate passed isolated typecheck, full lint and 21 sheet/style assembly
and pure assembly tests without retries. The checked source/test hashes match
the issue branch. This proves local transaction/recovery behavior with seeded
subject drafts, not specialist dispatch, approval or actual Dify sheet production.

1. Add schemas/materializers and graph edges; test both sibling orders.
2. Add Dify J03–J10 named prompts, simulation fixtures and per-node result parsing.
3. Implement sample/sheet operation scheduling and one-image package materialization.
   Character sheet is one montage with front/back/side, neutral face and three
   expressions; location sheet is one montage with overview/surrounding views.
4. Store the shared module verbatim and verify its hash in every assembled image
   request. Store ordered attachment roles for later page requests.
5. Implement scoped invalidation: stable-fact change goes through final-list owner;
   invalidate affected sheet/page descendants, not unrelated subjects. Keep prior
   assets/history. A style-module change affects all style-dependent visuals.
6. Extend existing artifact/image views to render these subject packages and
   warnings. Keep grouped reviews and exact per-subject approvals.
7. Publish reviewed app/Dify versions, synchronize tools, then run all three
   Simulated cases to accepted reference packages on staging.

## Tests and exit

### Current runtime-integration change surface

Connect sheet routing to the existing operation repository, context, dispatcher
and exact-version approval path. Extend specialist contracts and configuration
only for a complete J01–J10 plus image bundle; retained M1/narrative/style
snapshots keep their existing boundaries. Reuse the saved sheet assembler and
AssetStore, not a second orchestrator. Add subject-specific clarification and
revision context, source checks, one-image scheduling and per-subject acceptance.
Update Dify deterministic fixtures, protected-setting contracts and architecture
with the same boundary. Verify all three local persona journeys, stale sources,
duplicate callbacks, Pause/Resume and saved-result recovery before review.
Live bindings, binary transfer and old-index maintenance remain separate gates.
The candidate includes the saved-binding guard and local sheet dispatch. This does
not activate live bindings or establish actual Dify sheet production. Approval
verification permits retained unknown-outcome tester recovery, while ordinary
assembly still requires idle work. Saved manager choices may select either ready
sheet sibling; repository admission rechecks its subject and source versions.

Current local evidence: 32 dispatch tests, 165 runner unit tests, 46 deployment
contracts, deterministic agent fixtures, typecheck and lint passed without test
retries. The dispatch tests start all three personas from empty saved runs and
reach accepted reference packages; they also cover unknown tester recovery and
location-first delegation. These use a local workflow-runtime harness, not live
Dify. Linux shell/permission checks remain required in CI; Windows cannot prove
their POSIX permission and symlink behavior.

Focused contract/integration tests: each J03–J10 clarification/draft/revision
contract; sibling gates; unknown/missing IDs; sample
dependency cycle avoidance; two samples; all sheets; stable-fact revision;
unchanged module hash; wrong-role completion; stale/duplicate/concurrent upload;
storage failure/claim expiry; late result; MIME mismatch; rectangular/1254-square
PNG, JPEG/WebP; corrupt/multiframe/oversized image; warnings retained after recovery.

Run typecheck/lint/focused Vitest without retries; browser-inspect one saved sheet
and warnings after reload. Required current reference packages at exit: two samples
+ two character sheets + one/one/two location sheets = 5/5/6 images per case,
all simulated. These are baseline/current package counts, not a ceiling on stored
assets: retain earlier versions and replacement images from revisions/recovery.
Every generated replacement still consumes its logical request allowance.
Verify trace shows no provider nodes. Complete two clean reviews and release
procedure. Update M3 with current artifact/asset and Dify contracts.
