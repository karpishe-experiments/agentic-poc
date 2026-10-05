# M3 — Pages, runner UI and advisory evaluation

**State:** Planned. **Coverage:** J11–J13; AC01–AC02, AC05–AC07, AC10–AC12.
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
preparation now passed; staging activation remains pending. These local tests are not full-booklet or
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
publication and live J11 execution remain unverified. The five new drafts passed
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
passed model-free node inspection. Runtime-key validity and J11 staging acceptance
remain unverified. Infrastructure `37345579673` installed reviewed master
`32befad909ffd8be207fb41e2b771ee5985757f9` with no Terraform resource changes;
it did not activate the sixteen bindings. The J11 staging candidate in
[PR #140](https://github.com/karpishe-experiments/agentic-poc/pull/140) passed
207 focused tests across 23 suites, typecheck, lint, twelve legacy fixtures and
two independent reviews. Validate `37345410931` passed and PR #140 merged as
staging commit `afe92b6509776058341cf2c4830bfe2633f83f80`. Deploy
`37346290235` passed for that commit. Readiness check `37347710571`, private
settings upload and drained activation remain pending.

`scripts/upload-dify-booklet-m3-settings.ps1` accepts a sanitized publication
manifest through `-PublicationsPath`. Preview validates sixteen distinct app and
publication identifiers, configuration hashes and model-free node types without
reading private bindings. `-Apply` joins those identifiers to the encrypted M3
bindings, validates the exact slots, saves separate encrypted settings and uploads
`DIFY_BOOKLET_RUNNER_SETTINGS_JSON` through GitHub CLI standard input. It does not
activate staging or execute Dify. After an interrupted upload, rerunning is allowed
only when the existing encrypted settings exactly match the computed payload;
different settings are not overwritten. Re-read publications before activation.

Local host preparation passed Bash syntax checks and the focused
`tests/shell/vps-host.test.sh booklet-runner-staging` scenario. The complete
host suite stopped at a Windows directory-permission check; the deployment suite
stopped at a Windows sandbox-configuration symlink check. Neither is a full-suite
pass. Require Linux CI, including ShellCheck and both shell suites, before merge
or dispatcher installation. The private helper passed PowerShell syntax/preview
checks and two independent reviews, including synthetic collection tests.

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
