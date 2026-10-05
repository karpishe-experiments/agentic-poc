# M3 — Pages, runner UI and advisory evaluation

**State:** In progress; full-booklet acceptance remains pending. **Coverage:** J11–J13; AC01–AC02, AC05–AC07, AC10–AC12.
**Predecessor:** [M2](M2-references.md). Apply [EXECUTION](EXECUTION.md).

## Current entry readiness

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

Focused tests cover each J11–J13 clarification/draft/revision contract and prove
multi-panel layouts remain one image, cover completion,
exact lettering/style propagation, reference attachment membership, selected-batch
order, duplicate completion, stale dependency rejection and scoped revision.
Test pause/restart around a completed page, unavailable assets, corrupt output,
storage failure, unknown provider outcome, cap exhaustion, warning-bearing success
and failed judge without loss of generation success.

Browser test through the runner: launch, inspect progress, pause/resume, reload,
open saved booklet/pages, inspect warnings and reports. Do not claim a Playwright
test-list discovery as browser execution. Use the existing e2e runner with a focused
new spec, fixtures and no providers; record a separate authorized staging browser
smoke through the live Dify simulated branch.

The current `scripts/run-e2e.ts` starts `next start` and seeds local agents.
Adapt its explicit experiment test profile to start a development server and
initialize v2 fixture data without agent seeds. Keep the existing profile for
unaffected tests. This permits focused browser execution without inserting a
production build into validation. Test cleanup still stops the isolated server
and MongoDB. Do not run the current wrapper unchanged and assume it tests v2.

Exit: all cases have the required current simulated packages corresponding to
9/11/15 baseline images, all thirteen responsibilities,
page-specific approvals, reports and no PDF requirement. Typecheck/lint/focused
tests, two clean reviews, CI/deployment/check and staging evidence pass. Revise M4
with measured steps/context sizes and verified result/usage schemas.
Retain superseded and replacement assets as history; total stored image count may
exceed the baseline after revisions. All simulated generation attempts still count
against logical request limits. Do not reject completion for retained history.
