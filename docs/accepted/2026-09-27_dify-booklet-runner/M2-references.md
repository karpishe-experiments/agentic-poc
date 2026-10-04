# M2 — Narrative completion and reference packages

**State:** S1–S3 narrative code and S4 image callback/storage routes deployed; live M2 bindings and Dify image transfer pending. **Coverage:** J03–J10; AC01–AC02, AC05–AC06.
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
| J08 | Style definition, typography/bubbles, exact shared module plus hash, two sample build/asset records | J01/J05 and both J06/J07 |
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
