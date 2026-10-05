# M2 — Narrative completion and reference packages

**State:** Narrative, image callback/storage and automatic J08 sample-dispatch code deployed; active bindings remain J01/J02. Live M2 bindings and Dify image transfer pending. **Coverage:** J03–J10; AC01–AC02, AC05–AC06.
**Predecessor:** [M1](M1-runner.md). Apply [EXECUTION](EXECUTION.md).

## Entry gate

Revise this file against M1's actual schemas, callbacks and Dify node bindings.
Require a staging J01/J02 success, role separation, saved delegation and restart
proof. Confirm the three fixed briefs and subject-ID materializer. Verify file
transfer and storage using synthetic bytes before image-provider work. Bundle
any missing Dify configuration or staging-login handoff before implementation.
This milestone uses simulated images and text; no paid approval is required.

## Compact execution packages from M1

The live M1 cases in [M1 evidence](M1-runner.md#live-browser-acceptance--2026-10-04)
provide current schemas, callbacks, publication identifiers and trace links.
The deployed active-operation Pause/Resume check passed with persisted results
and no repeated work. Rapid revision changes can require another Pause click;
see M1 for that bounded-control limitation. Local schema/fixture work can proceed.
Ali's pinned guidelines 03–10 have been read; retain their responsibilities and
the PRD's delegated-approval, fixed-case and warning-only adaptations.

| Package | Contract, edits and reusable components | Verification and finish |
| --- | --- | --- |
| S1: draft lists | Extend `lib/contracts/experiment-runner.ts` first, then `lib/experiment-runner/fixtures.ts` with J03/J04. Draft entries separate narrative facts, questions and roles from visual facts. Example: inventor + robot; park; no invented clothing or camera settings. Keep J01/J02 schemas, role whitelist and fixtures valid until S2 adds runtime support. | Add `tests/unit/experiment-runner-draft-lists.test.ts` for all personas and extend the existing fixture tests for clarification and revision. Run these files plus `tests/unit/experiment-runner-contracts.test.ts` with `--bail=1 --retry=0`, typecheck and lint. Finish on local typed output only; no live readiness claim. |
| S2: durable narrative | Extend `db/experiment-narrative.ts`, `db/experiment-repository.ts`, context and routing for J03–J07. Reuse existing transactional proposal/approval/decision paths and immutable versions. J03/J04 follow approved J01/J02; both precede J05; J05 precedes both final lists. Assign stable character/location IDs in Booklet once, retain them across renames and retries, and reject unknown manuscript references. Add complete prose/action/dialogue units to J05, not physical-page layouts. | Integration tests cover both sibling orders, stale inputs, duplicate callbacks, grouped/delegated acceptance, grant changes and scoped revisions. Finish with all three cases at current approved final lists in local transport fixtures. Do not dispatch unsupported tasks from retained M1 configurations. |
| S3: live narrative bindings | Extend `config.ts`, `workflow-graph.ts`, module preparation and the existing protected-settings validator for the selected bounded binding set. Prepare independent J03–J07 modules; preserve the six existing app identities. Read back HTTP body `value` fields and published IDs. Keep provider branches disabled. Before configuration changes, stop admission and reconcile active work; retain old-run evidence and use new successor configuration, never rewrite its snapshot. | Verify graph/Python fixtures, configuration and deployment contracts. Two clean reviews and existing staging release procedure precede live all-persona J01–J07 runs. Private app-key setup is a handoff only if no verified existing binding mechanism applies. |
| S4: image storage seam | Reuse the operation ledger and AssetStore; add exact authenticated fixture-download and image-completion routes. Follow the original-byte decoding/claim/digest contract below. A simulated image operation reserves one logical image and zero payable calls. Store one asset per sample/sheet operation with its source versions and prompt record. | Prove synthetic bytes through actual Dify HTTP file/upload nodes before claiming live transfer. Test corrupt, stale, duplicate/concurrent uploads, claim expiry and storage failure. No image provider is invoked. Escalate an unverified binary binding rather than substituting a local-only mock. |
| S5: style and sheets | Add J08–J10 schemas, fixtures, subject context/materialization and independently testable modules. J08 proposes a module, generates two samples, then becomes accepted. Accepted J08 and final-list subject versions precede each sheet. Keep the style module byte-for-byte and retain its hash, views/expressions, prompts, asset IDs and exact approvals. Extend the current inspector for stored images. | Complete all three staged Simulated cases with 5/5/6 current reference images, reload persistence and zero provider-node execution. Retain failed predecessors and replacement assets. Two clean reviews and release checks precede publication. Then update M3 from the verified contracts. |

For each package, fill exact new test filenames and input/output examples before
its editing pass. Do not add a new plan hierarchy. Use the existing repository,
callbacks and dispatcher, not a second orchestrator or editable agent registry.
Escalate a changed ownership/creative contract, unknown execution outcome or
missing capability. Capacity, key entry and binary-transfer gaps block their
dependent live operation only; paid modes remain unavailable.

### S5 persistence prerequisite: subject-aware index compatibility

The existing `artifacts_booklet_type_unique` prevents two J09 character sheets
or two J10 location sheets in one booklet. A reset recreates this restriction;
do not use another reset. Add `artifacts_booklet_type_subject_unique` over
`bookletId`, `artifactType`, `subjectKind`, `subjectId`. Missing legacy subject
fields retain one null identity. Existing artifact IDs, content, versions and
approvals are unchanged.

First ship the compatibility step in `db/indexes.ts` and `db/setup.ts`: create
and verify the replacement, retain an exact old index when present, reject drift,
and never recreate the old index when absent. Fresh databases use only the new
index. Keep sheet admission disabled. Test fresh and populated setup, duplicate
legacy/subject identities, distinct subjects, repeat setup, incompatible indexes,
and readiness after a simulated old-index removal in a disposable test database.
Run `tests/integration/mongodb-foundation.test.ts`, experiment initialization,
M2 narrative and image-storage suites without retries, typecheck and lint.

After that compatibility image is the verified staging baseline, a later slice
can remove only the exact recognized old index during drained maintenance with
the normal backup. Prove both replacement readiness and the compatible rollback
target first: deployment restarts the previous image without restoring its database.
The later slice must reject sheet readiness while the old restriction remains.
No live index removal, reset or migration authority is inferred from local tests.

The compatibility candidate passed isolated typecheck, full lint and 31 tests
across those four integration suites without retries on 2026-10-05. The initial
sandboxed test command could not spawn the Windows test runner; the permitted
unsandboxed run completed against disposable MongoDB. This proves local index
behavior and existing narrative/image regressions, not live sheet readiness.
Two independent reviews passed before [PR #113](https://github.com/karpishe-experiments/agentic-poc/pull/113)
merged as `4991f2e0a02bfdf1efce9a9671c55463d461637f`; Validate `37249133821` passed.
The selective staging candidate passed typecheck, lint, 31 persistence/runner
tests and 65 Cloud/probe regression tests without retries, plus two independent
reviews. [PR #114](https://github.com/karpishe-experiments/agentic-poc/pull/114)
merged as `ae2a2f767a2da8ef9e0bc372bd26199ee0c75e3e`; Validate `37257021647`,
Deploy `37257380550` and Check `37257804610` passed. The immutable image is
`sha256:4a2a97daa4075aad90ad1837b0ed6a1298aa37ec445322f0cac68c236e28119d`.
This establishes the compatible release baseline, not removal of the retained
index or live multi-subject sheet storage. No reset or binding change occurred.

### S5 first increment: local style/reference contracts

Add `lib/contracts/experiment-references.ts` and
`tests/unit/experiment-runner-reference-contracts.test.ts` before extending
runtime admission. Reuse Zod, the existing opaque-ID contract and SHA-256; do
not add another artifact store or agent registry. J08 accepts a textual style
proposal before its two sample operations. An image-backed package records both
sample build identities. J09/J10 retain target subject IDs, exact source versions,
view/expression instructions and one montage build record per subject.

Preserve the shared style module byte-for-byte, including whitespace; compute
and verify its hash rather than trusting a proposed hash. Parser success does
not establish stored asset existence, current source approval or creator acceptance.
Those checks belong to the later persistence/materialization slice. Required
instructions are technical content; imperfect rendered views remain warnings.
J08's required narrative inputs include J01, J02, J05, J06 and J07, following the
pinned guideline. This increment does not expand live bindings or dispatch.

Run the new unit suite without retries, typecheck and lint. Verify complete
proposal/build fixtures, preserved module bytes, malformed/duplicate identities,
missing required instructions and the 512 KiB/depth-20 content bounds. Two clean
independent reviews precede publication. Asset existence, automatic sample/sheet
scheduling and actual Dify transfer remain pending after this parser increment.

Local verification on 2026-10-05 passed isolated typecheck, full lint and 21 tests
across the new reference contract suite and existing manuscript, draft-list and
runner-contract suites, without retries. Source/test hashes matched the checked
copy. Local links and whitespace passed. The main checkout's stale generated
types were not counted as a successful check. This proves parser behavior only;
it does not prove three-persona reference production or any live image transfer.

### S5 second increment: local reference simulation fixtures

Add `lib/experiment-runner/reference-fixtures.ts` and
`tests/unit/experiment-runner-reference-fixtures.test.ts`, using the reference
contracts above. The caller supplies current approved sources; the fixture
parses their contents and UUIDs but does not establish approval or create assets.
J08 receives version/content pairs for J01/J02/J05/J06/J07. J09/J10 receive the
target final-list entry ID, final-list version and assembled J08 style version/content,
including its two sample build records. A textual draft style alone is insufficient.
Each call requires Simulated mode and the persona's exact fixed brief.

For example, Kid J08 proposes two sample plans from the kite narrative; J09
proposes the robot's montage instructions; J10 proposes the park's overview and
supporting views. The shared module contains reusable visual/lettering direction,
not named characters, places or a specific story action. Scene details belong in
the sample plan or subject prompt. No proposal fabricates an image build record.
Missing expressions produce a focused question; saved answers prevent repetition.
Notes-only revisions retain current content; source changes refresh from current
facts without changing the target ID. Required instructions do not claim rendering
quality. The later assembler retains the shared module unchanged.

The corrected local candidate passed isolated typecheck, full lint and 28 tests across five
suites without retries on 2026-10-05. Tests vary all three persona inputs and
cover paid-mode/wrong-brief rejection, source UUIDs/counts, subject targeting,
style hash/whitespace, clarification and revision. This is local proposal proof
only. Two independent reviews passed and [PR #112](https://github.com/karpishe-experiments/agentic-poc/pull/112)
merged as `92b7a1c12ab802481141e325c0e4c6006f119d99`; Validate `37248425372` passed. No Dify fixture parity,
image assembly, persistence or live reference production is established. The final
checks include corrections for full-body wording, duplicate saved-answer expressions,
assembled-style compatibility and story-specific promise text in the shared module.
The reviewed fixture candidate does not establish those later runtime capabilities.

### S5 third increment: reproducible image requests and assembly handoff

`lib/experiment-runner/reference-requests.ts` serializes two J08 sample requests
in `sample_1`/`sample_2` order and one montage request per J09/J10 subject.
It retains the shared style module byte-for-byte. Non-rendered slot identity
distinguishes sample fingerprints even when purposes are identical. J08 sources
are ordered draft style, J01, J02, J05, J06, J07; sheet sources are final list
and assembled style. Current-source approval remains a repository check, not a
serializer claim. No operation, asset, binding or provider call is created here.

Verify `tests/unit/experiment-runner-reference-requests.test.ts` with the existing
reference contract and fixture suites, without retries, plus typecheck and lint.
Require two clean reviews before publication. Tests cover reload determinism,
reordered sample plans, exact module whitespace, subject instructions and source
identity, duplicate IDs, invalid hashes and the existing prompt-size bound.

On 2026-10-05 the exact serializer candidate passed clean-checkout typecheck,
full lint and 17 tests across these three suites without retries. The main
checkout's stale generated types and unrelated nested worktrees failed its
checks; those results are not counted as passes. Independent reviews and
publication of this increment remain pending in that local record. The corrected
candidate subsequently passed both reviews and [PR #115](https://github.com/karpishe-experiments/agentic-poc/pull/115)
merged as `e306de7eddc287167433c0d7d657fa60f7e4e636`; Validate `37258194125` passed.

The style-assembly persistence slice reuses the operation ledger, AssetStore and immutable
artifact versions. Save textual J08 draft D; save its two successful sample
operations; then assemble version A with `createdBy: application`,
`sourceVersionId: D` and no duplicate specialist `sourceOperationId`. Read build
records from saved operations, never from caller-supplied build content. Check
slot fingerprints, exact ordered sources, operation/asset identity and stored
byte hashes before the transaction; recheck current sources at commit. Replace
the current draft using compare-and-set and retain dependency edges to D and its
narrative inputs. Assembly is completion, not a revision: do not invalidate A
through its new D dependency. Only A can receive explicit/delegated acceptance.

Repeated assembly must return the existing matching A without another image
reservation. Concurrent or interrupted assembly must reuse the same saved image
results. Missing/corrupt bytes, stale sources or a different sample pair block
that operation; they do not authorize regeneration. Add
`tests/integration/experiment-runner-style-assembly.test.ts` for these states,
draft-approval rejection and final acceptance. Live binary transfer, image
scheduling and private bindings remain separate prerequisites; this handoff is
not evidence of completed reference production.

The local candidate in `db/experiment-style.ts` accepts `{runId,
draftStyleVersionId, sampleOperationIds}`. The two operation IDs may arrive in
either order; stored fingerprints select the canonical slots. It reads an idle
Simulated run and current draft, verifies both completed image operations and
original stored bytes, then publishes A in one transaction. A remains a draft;
the service does not create an approval, reserve calls, dispatch work or change
the booklet stage. Pause remains set. A fresh service instance can recover an
already assembled matching version after a discarded response. Replay also
checks the saved dependency edges; incomplete lineage remains a blocker.

The focused integration fixtures seed the textual draft and approved sources,
then create and complete both sample operations through the normal repository
and image-storage service. They do not establish normal J08 specialist dispatch
or live Dify execution. Draft-versus-assembled approval, delegated acceptance,
J08 admission/materialization and automatic scheduling remain the next wiring
slice. This increment verifies the assembly seam only; those remaining gates
must be tested before claiming a completed style package.

The assembly candidate passed clean-checkout typecheck, full lint and 24 tests
across the new integration suite, existing image-storage integration suite and
reference-request unit suite on 2026-10-05, without retries. The first run stopped
on a lint error; the next found an extra field in the test's strict claim input.
Both were corrected before the passing run. This proves local saved-image
assembly, not Dify transfer or approved package production. Two independent
reviews passed; [PR #116](https://github.com/karpishe-experiments/agentic-poc/pull/116)
merged as `57737a48dc5b516998d7c9759dd96a88d9e90a0b`; Validate `37259673370` passed.

### S5 J08 persistence and acceptance wiring

The next local candidate reuses normal operation preparation, specialist context,
proposal completion and tester decisions for J08. A saved configuration must have
the seven distinct narrative specialists and a separately identified J08 binding.
Retained six-slot and eleven-slot snapshots keep their existing boundaries. This
fixture snapshot is not a new live settings profile: the public reader and host
validator still reject larger bundles until the image dispatch/publication slice
defines and verifies the complete profile together.

J08 reads current approved J01/J02/J05/J06/J07, stores a textual version with its
five dependency edges, and never auto-approves that text. Context returns
`style_samples`; the dispatcher waits without another manager/tester call. The
existing saved-sample assembly produces A. Tester review or a recorded delegation
then accepts A, checks its internal draft identity, six source edges and completed
sample records, and retains exact explicit/delegated approval provenance. The
approval path reads both original AssetStore files and verifies their saved
byte lengths and digests. Lost or corrupt bytes remain technical blockers;
completed sample operations are retained and no image call is repeated.
The internal textual parent is not itself approved or required to remain current.
A style revision produces a new text draft and requires new samples; old assets,
versions and approvals remain saved. Quality warnings remain advisory.

`tests/integration/experiment-runner-style-journey.test.ts` builds the seven
narrative artifacts through normal repository/context/fixture completion, not
seeded source content. It covers all personas through J08 proposal, locally
stored synthetic samples, assembly and acceptance; it also checks old-profile
exclusion, textual-draft rejection, missing sample evidence and accepted-style
revision. This is local persistence proof, not deployed Dify simulation. Live
image transfer, automatic scheduling, Python/DSL parity, complete settings and
private bindings remain pending before staging activation.

On 2026-10-05 the final source candidate passed clean-checkout typecheck, full
lint, twelve agent fixtures and 95 tests across ten runner suites without retries
(`--bail=1 --retry=0`). The test command exited successfully; disposable Mongo
teardown required forced termination after its grace period. Earlier attempts
encountered sandbox process-launch restrictions and a test-helper idempotency
collision; the helper was corrected before final validation. Main-checkout
generated-type contamination is not counted as a pass. Independent review found
that acceptance did not recheck stored bytes after assembly. The correction
uses the existing AssetStore factory at the repository completion boundary and
adds missing/corrupt-byte regressions for explicit and delegated acceptance.
The corrected candidate passed typecheck, full lint, twelve agent fixtures and
118 tests across thirteen suites without retries. Both independent reviews passed.
PR #117 merged as `e5994e113ace2fab78291690b5d45253590474e1` after the
existing dependency-map test was corrected to cover J08; Validate `37262788715`
passed. This increment has not been deployed.

### S5 automatic style sample dispatch

The next candidate extends the same dispatcher, runtime transport and protected
settings validator. A complete thirteen-slot profile adds J08 and one generic
image workflow (`role: image`, null task/persona) to the eleven narrative slots.
Old profiles and saved boundaries remain unchanged. No paid-mode path is added.
Published image evidence resolves the generic binding while the saved operation
retains its owning task J08.

At `style_samples`, derive the two requests from the current textual style and
five approved sources. Prepare and dispatch only the first missing slot. A saved
failed or uncertain attempt is a reconciliation requirement, not regeneration
permission. The image workflow uses the normal reservation/download/upload
callbacks. Its `image_result` must match the already saved operation and digest;
an acknowledgement alone cannot materialize an asset. Each sample records its
specialist workflow parent and advances the saved progress fingerprint.

After both samples have verified publications, invoke the existing assembly
service. Restart and discarded-response handling reuse saved samples and GET
lookups, never another POST after dispatch admission. Pause stops the next sample,
but an admitted upload can finish. Missing stored files block assembly without
new image reservations. Definite blockers do not enter the unknown-outcome
recovery path.

Verify `tests/integration/experiment-runner-style-dispatch.test.ts`, configuration,
transport, orchestration, style journey/assembly and image callback/storage suites,
typecheck, lint, twelve agent fixtures, deployment contracts, both deployment
shell suites and ShellCheck. Two clean independent reviews precede publication.
Python/DSL parity, private bindings, live binary transfer and staging activation
remain pending; this package does not claim a completed booklet or live J08 run.

Initial validation on 2026-10-05 passed clean-checkout typecheck, full lint,
twelve agent fixtures and 91 tests across ten affected suites without retries.
The tests include all three personas through automatic samples and style approval,
lost-response recovery, concurrent dispatch, Pause/Resume, no-ID outcomes and
missing saved bytes. ShellCheck at warning severity, Bash syntax and the focused
`booklet-runner-staging` host test passed. Full shell suites remain a required
Linux CI check: local Windows permission, symlink and Python-alias restrictions
prevented a complete local pass. One deployment-contract attempt failed on CRLF
fixture text; normalization in the disposable checkout produced the passing run.
No runtime source was changed for that environment-only correction.

Review identified Pause before reservation and incomplete workflow acknowledgement
as missing cases. A verified paused attempt with zero reservations remains saved;
Resume may prepare a new attempt for that never-executed slot. A successful saved
upload is not enough to advance: a matching successful workflow acknowledgement
must precede publication verification. Nonterminal workflows recover through GET
within the saved deadline; missing or inconsistent terminal acknowledgements block
without replay. The first corrected candidate passed clean-checkout typecheck, full
lint and 97 tests across the same ten suites without retries. The command exited
successfully; disposable Mongo teardown required forced termination after its
grace period. Twelve agent fixtures also passed. Two new clean reviews are
required before publication. Review B then identified retained progress hashes
and publication verification before a late upload as missing cases. Empty image
history now preserves the existing hash shape. Image success always requires
the acknowledgement before verification; only a verified unclaimed Pause is exempt.
Retained six-/eleven-slot runs at no-progress count two and an unresolved late
upload have added regressions. The final correction passed clean-checkout
typecheck, full lint and 100 tests across ten suites without retries. The command
exited successfully with the same disposable Mongo teardown limitation. Shell
inputs and agent fixtures are unchanged from their passing checks. Two consecutive
clean reviews subsequently passed. [PR #118](https://github.com/karpishe-experiments/agentic-poc/pull/118)
merged as `6a2d5542cfbc984335ebe94e9d4710b20b327fb4`; Validate `37266685063`
passed, including both full Linux shell suites. This increment is not deployed.

Chrome verification on 2026-10-05 started Professional Creator run
`944b6e59-129e-451f-847e-840524b8b8c2`. Pause saved revision 11; Resume retained
the same Concept version and reached the deployed J01/J02 `slice_complete`
boundary at revision 32. Both artifacts have explicit approvals; six logical
text operations and zero payable text/image calls were recorded. This verifies
the deployed M1 controls, not the unpublished style-dispatch candidate.

### S5 Dify style-fixture preparation

Extend the existing M2 Python fixture through J08 and append its independent
specialist to the module list: twelve text modules plus the existing image
workflow. Preserve existing names, callback contracts and model-free branches.
Reuse the TypeScript/Python equality harness for all three personas, revisions,
source refresh, exact UTF-8 style hashes and assembled-style tester decisions.
The internal textual draft is not approved; only its assembled successor can
receive explicit or scoped delegated acceptance. Kid/Parent retain an applicable
J08 grant; Professional Creator approves the exact assembled version.

Affected files are `dify/m2-simulation.py`, `workflow-graph.ts`, the existing
module/Python tests and this evidence. Run typecheck, lint, graph/image-graph and
Python parity tests without retries, plus the J08 journey/dispatch regressions.
Prepare `issue65_m2_J08 --profile m2` and inspect its graph without secrets.
Two clean reviews precede publication. Missing current sources, sample evidence
or valid delegation must not be hidden with fabricated approvals. This slice
prepares configuration only: actual Dify import, private bindings, binary transfer
and staging activation remain dependent live checkpoints.

On 2026-10-05 the final candidate passed isolated typecheck, full lint and
32 tests across the Python parity, text/image graph, reference fixture and
retained M1 fixture suites without retries. The preceding candidate also passed
31 J08 journey/dispatch integration tests; their relevant inputs are unchanged.
Twelve agent fixtures passed. Preparing `issue65_m2_J08 --profile m2` produced
nine model-free nodes with an empty callback-key binding. These checks establish
local configuration parity, not actual Dify execution. Independent reviews and
live publication remain pending at that validation checkpoint. Both independent
reviews subsequently passed; [PR #119](https://github.com/karpishe-experiments/agentic-poc/pull/119)
merged as `df587035c207825f7a2c6636a04284a9c85b3ad6` after Validate
`37268464312` passed. Community J08 draft
`0fc8f253-1ae6-4103-a105-4f737ce995d6` imported and read back nine nodes;
hash `ad0d286ff3c8f57fdee8fd11df0afd66a544e5a7add38cb56c6696d7dea088bb`.
MCP graph validation returned zero errors/warnings. It is not published or executed.

### Current staging checkpoint

The reviewed J08 implementation and required reference/image dependencies were
selectively delivered through [PR #120](https://github.com/karpishe-experiments/agentic-poc/pull/120).
Reviewed head: `51a6cb208baee0add6145f840942953b74c60e6c`; release:
`fac55e0730e0a7e297a2fbdf28fb888b87baf57a`. Two consecutive clean independent
reviews passed. Typecheck/lint, 87 runner/reference tests, 65 retained Cloud/probe
regressions and twelve agent fixtures passed without retries. Disposable Mongo
teardown required forced termination after its grace period. Validate
`37269997010`, Deploy `37270417692` and Check `37270997041` passed.
Image: `sha256:959dee0035f80890b4851ed27f2652bc5ee9617cb2e692fae2c0069350d7c571`;
request: `37270417692-1`; backup:
`staging-20261005T060654Z-6727f4cf0e4dec21`.

Chrome reload retained all three personas' saved J01/J02 work. Creator run
`944b6e59-129e-451f-847e-840524b8b8c2` paused at revision 35 and resumed at
revision 36, retaining six operations, both approved versions and zero payable
calls. It remains at `slice_complete`, not completed booklet generation.
The temporary HTTP 502 during release cleared after deployment completed.

Live J08 activation still requires authorized host-validator synchronization,
seven additional privately configured app keys, drained manager/tester publication
and published-binding read-back. Preserve the existing six bindings and callback
key. Preview `37268638506` reported no Terraform changes; it did not synchronize
host files or authorize apply. The old subject-restricting index remains, so
J09/J10 sheet admission also requires the separately authorized index transition.
Local sheet implementation can proceed independently of those live checkpoints.

### S5 sheet-fixture preparation

Extend the existing Python fixture and preparation list with independent J09/J10
proposal candidates, not live runtime bindings. Candidate specialist context has
`subjectId`, `approvedSources` containing exactly one J06/J07 final list and one
assembled J08 source, current target, matching revision and saved question answers.
Source entries retain `{taskId,id,content}`. Booklet must verify actual approval,
ownership and saved assets when runtime admission is implemented; the fixture
does not provide that proof. Preserve both recurring character targets and every
final location, exact shared style bytes/hash, montage views and distinct
expressions. A missing expression set asks a question and consumes its saved
answer rather than inventing expressions or looping on an answered question.

Compare each persona's actual J01–J07 fixture outputs and assembled-style shape
with the existing TypeScript reference fixtures. J07 can retain an empty
`requiredFeatures` list. J10 accepts that approved empty list while keeping
nonempty stable anchors and required supporting views; it must not fabricate
new required features to satisfy a stricter downstream parser. Quality remains
warning-based. Text proposals still cannot establish sheet assets or acceptance.

Verify Python/TypeScript parity, all fourteen prepared text modules, existing
reference contracts/requests and image graphs, typecheck and lint without retries.
Prepare both candidate DSLs with empty secret bindings. Two clean reviews precede
publication. Runtime sheet admission/materialization, image scheduling/assembly,
tester gating, scoped revisions, private keys and live execution remain pending.

Final local verification passed isolated typecheck, full lint, 43 tests across
six parity/graph/reference suites without retries, and twelve agent fixtures.
Both J09/J10 preparation commands emitted nine nodes and empty callback bindings.
The seven executable/test inputs matched the verification checkout. The first
parity run exposed the empty-feature incompatibility above; a later graph test
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
stages. Tests seed the subject drafts because specialist admission is still pending.
Runtime sheet admission, per-subject acceptance and scheduling remain next.

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
