# M2 — Narrative completion and reference packages

**State:** S1 local contracts and fixtures implemented. Live M2 remains pending. **Coverage:** J03–J10; AC01–AC02, AC05–AC06.
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
notes in simulation, not evidence of real-model interpretation. The existing
J01/J02 role-result whitelist and live execution remain unchanged.
Notes-only revisions retain complete existing entries, including their narrative
functions, relationships and story purposes. Refresh after an upstream source
change is separate S2 work; do not infer that behavior from this local fixture.

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

Extend the M1 task-schema map and ArtifactService, not the old Visual Bible gate.
Read Ali's pinned task guidelines 03–10 in full before writing prompts/fixtures.
Keep the source commit and explicit PRD adaptations in each prompt's provenance.

| Task | Required canonical content | Exact approved sources |
| --- | --- | --- |
| J03 | Character IDs/names, narrative role, known facts, open questions | J02 |
| J04 | Location IDs/names, narrative purpose, likely scenes, known facts/open questions | J02 |
| J05 | Ordered narrative units with prose, action, narration/dialogue and character/location IDs; expansion notes | J01, J02, both J03/J04 |
| J06 | Final character IDs, stable physical facts, recurrence, attire/accessories, expressions, sheet requirement | J05 and J03 |
| J07 | Final location IDs, anchors/features, continuity and sheet requirement | J05 and J04 |
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

Use M1's operation ledger and the existing AssetStore. Implement the callback
image route and operation-bound reference download. Original decoded PNG/JPEG/WebP
bytes are accepted up to 20 MiB, 64 megapixels, positive dimensions and one frame.
Actually decode pixels with Sharp; metadata/signature alone is insufficient.
Derive MIME/extension from decoded content. Do not resize, convert, or overlay text.

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
