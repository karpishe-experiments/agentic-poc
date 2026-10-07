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

Complete this correction before the next M3 acceptance campaign. The approved
scope is callbacks, the existing transport and dispatcher, and additive operation
observation fields. Do not add a queue, service, collection or alternate runner.
Public callback contracts, request limits, publication checks and single-persona
sequencing stay unchanged. No paid call, reset or production change is authorized.

| Checkpoint | Decision and verification | Exit evidence |
| --- | --- | --- |
| Optimize measured callbacks | Time authorization, claim, context, source checks, decode, storage and finalization using sanitized run/operation IDs and counts. Batch independent metadata reads; keep MongoDB transaction commands serial. Reuse source evidence and immutable bytes only within one transaction attempt, keyed by identity and digest. Rebuild evidence on retry. Return the verified image request from the claim instead of repeating its source walk. Synthetic fixture access validates current claim, fingerprint, sources and approvals without downloading references. Reject invalid upload identity/lease before decode or storage; retain exclusive writes, original-byte readback and full source bytes at final acceptance. | Focused stale-source, ownership, claim, corrupt-byte and callback regression checks; bounded query/storage counts. Compare Dify node timing with server spans. Inspect transaction retry, storage latency and connection reuse before assigning remaining delay to a cause. |
| Observe asynchronous execution | Submit exactly one streaming POST. Parse bounded SSE, including chunk splits, multiple events, CRLF and comments; reject malformed events. Validate the workflow run/publication identity at `workflow_started` and durably save the run ID, including matching callback-first claims. Return accepted/running, not success. Terminal GET evidence gates publication acceptance. Retain a managed reader until terminal output or the original deadline. Reconcile callbacks and one app-key GET per five-second observation cycle; terminal stream events can request immediate observation. Never repeat POST automatically. | Model-free execution lasting more than 30 seconds; early saved ID; stream-loss and restart recovery of that same operation without another submission. Local mocks do not meet this live gate. |
| Review, release and accept | Freeze one candidate; run final affected validation and two consecutive clean independent reviews, required CI and the authorized staging delivery process. Reconcile active/uncertain work before deployment. Preserve failed runs and saved assets. Check collaboration memory/health, recent OOM/restarts and Engine.IO; reuse the existing 1536 MiB correction if healthy. Start a linked Kid successor, then Parent and Creator only after success. | Kid finishes generation, tester feedback and judge assessment without repair and with zero payable calls. Healthy callback p95 must be below five seconds; none may exceed ten seconds. Record cold-start timing separately. Retain exact release/configuration/run IDs and timing evidence. |

Connection/start acknowledgement remains bounded to 30 seconds. The original
operation deadline is ten minutes for this Simulated implementation; claim,
polling, restart and reconnection must not extend it. Dify callback timeout
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
correction. No new staging release is deployed. Read-only inspection still finds
the previous Kid tester operation unknown. The operator has now authorized its
backup-protected staging reconciliation and future staging reconciliations in this
session, with exact-record verification, retained data and no replay. Execution
remains pending before live acceptance.

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

Exit: all cases have the required current simulated packages corresponding to
9/11/15 baseline images, all thirteen responsibilities,
page-specific approvals, reports and no PDF requirement. Typecheck/lint/focused
tests, two clean reviews, CI/deployment/check and staging evidence pass. Revise M4
with measured steps/context sizes and verified result/usage schemas.
Retain superseded and replacement assets as history; total stored image count may
exceed the baseline after revisions. All simulated generation attempts still count
against logical request limits. Do not reject completion for retained history.
