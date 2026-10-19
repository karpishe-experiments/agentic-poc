# Kids Booklet POC architecture

This document describes the current implementation for contributors and coding agents. The [canonical PRD](accepted/2026-08-01_end-to-end-poc/kids-comic-poc-prd.md) remains authoritative for product requirements and scope. The [accepted plan](accepted/2026-08-01_end-to-end-poc/PLAN.md) records implementation decisions and evidence; when source code changes, keep this current-state guide aligned with the verified behavior.

## System boundaries

Balanced completion separates the durable transaction from progress observation.
A failed acknowledgement uses bounded, read-only verification of the exact saved
result, materialization marker and accounting before classification. Progress
failure cannot invalidate a committed result. Only explicit invalid-result/input
rejection can create a definite completion blocker; transient database failures
remain uncertain. Failure writes recheck the target identity and active ownership
transactionally. Existing progress verification still precedes new dispatch.
Transient scheduling reads without an admitted operation retain uncertainty.
Expired preparation is inspectable and idempotent for both current and former
owners. Terminal states and definite blockers take precedence over expiry;
completed preparation bookkeeping can clear only after exact ownership and
terminal, claim-free operation evidence are established.
Authorization, text and image ownership cleanup use the independent five-second
cleanup budget and exact claim identity, including lost claim acknowledgements.
Image cleanup covers every post-claim exit and preserves original bytes/digest.
Sanitized failure diagnostics retain the original stage, error kind, repository
code, timing, remaining budget and cleanup outcome. Interactive Inspect/Stop keep
their existing 20/30-second budgets. Exact granted maintenance J11 recovery reuses
its same-invocation authenticated GET after full post-observation preservation
proof and fresh eligibility/admission checks. Its internal dispatcher entry checks
the bounded context, grant, revision, operation and response identity before using
shared reconciliation under the existing 150-second maintenance budget. Normal
accounting, sources, approvals, the 60-second claim, materialization and progress
checks remain. Responses are not cached across requests or put in preview receipts.
Provider deadlines and claim leases are unchanged.

The supported issue #65 recovery candidate adds a maintenance-only
`booklet-recovery-v1` command. It inspects sanitized blockers and can reconcile
an exact granted J11 completion through the existing dispatcher with provider
starts, uploads and stops disabled. Preview fingerprints retained business data
and authority. Apply rechecks that fingerprint with admission closed. The
preservation snapshot reads all retained rows in bounded 256-row keyset pages,
with at most four collections read concurrently. A failed read stops new scheduling
and settles every started read. Fresh apply owns one preview and awaits the durable
checkpoint before rechecking eligibility/admission and calling normal reconciliation.
This requires three complete snapshots rather than five. The maintenance command
has a 150-second budget within the host's 180-second bound; persisted provider
deadlines and claims are unchanged. A failed
inspection reports its sanitized phase and error kind; it does not classify a
database timeout as unrelated work. Operation-budget expiry is reported explicitly.
No preservation evidence is omitted.
Read-only blocker inspection includes paginated operation identities, allowlisted
state/role, claim presence and expiry, and saved-result/materialization/recovery
presence. MongoDB projects content fields to type markers before returning them;
no prompts, outputs or claim identities enter the diagnostic result. Expired claims
remain blockers. These observations do not grant permission to clear ownership.
An explicit linked claim-release request can restore only an expired finalization
claim that is the sole difference from an interrupted recovery's full checkpoint.
The original request/checkpoint remain unchanged. A separate child checkpoint
precedes the exact compare-and-set; lost responses use verification only. The host
keeps the serving app stopped and admission closed. An explicit child abort can
close an interrupted pre-write request only when the original preview still proves
the same complete state and exact claim. A committed release rejects that abort.
Original-request abort and any
later reconciliation remain separate actions. Failed ordinary completion cleanup
uses a separate five-second budget and still matches only its own claim identity.
A durable host checkpoint precedes reconciliation; a repeated request verifies saved
completion rather than replaying it. Original deadlines, charges and failure
history remain unchanged, and the recovered run remains paused.
Successful operation Inspect/Stop responses retain their run view and add a
sanitized `recovery` diagnostic. Its code describes saved completion, an existing
execution to inspect, a required reviewed recovery, or unresolved/conflicting
evidence. It never grants provider replay or continuation authority.

The staging host can execute this command from an immutable reviewed candidate
image before normal deployment. The candidate must use the current schema and
must not require initialization. Host recovery owns admission, backup, process
quiescence and its journal; application services retain ownership of result
validation, source/approval checks, materialization and accounting. Read errors
are distinct from nonzero work counts. Unknown or unsupported state remains
blocked. This candidate is not evidence of live recovery or production readiness.
Recovery journals retain immutable host fingerprints and preview backup identities.
Mutating reentry verifies those pins; legacy journals must reproduce their original
preview digest. Expired recovery supports interruption at `prepared`. Terminal
child receipts are historical results after exact identity validation, independent
of later parent progress; they do not assert current database state.

J11 manuscript routing covers the complete booklet, including cover-only units;
unknown units and exact approved sheet tuples remain independent gates. A protected
M4 `completionRecoveries` grant permits only a named active pre-generation J11
operation to recover its retained authenticated result from a definite blocker.
Normal source/byte/usage checks and materialization remain required. Completion,
provenance and stopped-campaign reopening are atomic, without another provider
request or changed charges/deadline. Other definite blockers stay blocked; late
recovery preserves attempt history and pauses before new work.

A protected M4 grant can name an exact inspected terminal manager failure for
one same-run continuation. Pre-generation specialists use the same proof as managers. Resume verifies its original provider evidence,
settlement and retained count liability, excludes unresolved work, and atomically
records provenance before reopening the existing campaign and run. The next
operation links once to that failed operation and reserves normally. Failed output,
charges, counters and approved artifacts remain saved. Accounting exit includes
these explicitly continued failed requests and revalidates their proof. Ordinary
blocked runs remain blocked; no automatic provider retry or budget reset is added.
Optional continuation metadata is backward compatible and requires no migration. A protected
request-definition amendment can bind the frozen policy's original bundle hash to
one reviewed replacement. New preparation/claim requires that exact amendment and
retains it with the effective request/definition digests. Historical requests and
monetary policy bytes remain unchanged; absent or revoked amendments block new
work. J11 provider schemas pin page counts and Kid single panels; explicit top-left
coordinate instructions support the independent owning-service geometry checks.
J11 also requests concise, complete compact JSON to mitigate observed whitespace
exhaustion. Incomplete provider output remains rejected and charged; no parser
repair, automatic retry or increased token ceiling is introduced.


The delivered issue #65 efficiency cleanup separates current-version execution projections
from full historical inspection/report context. Scheduling reads exact operation
heads/parents, reuses a projection within an unchanged run revision, and records
completion progress once. Existing grants approve assembled image artifacts through
the normal transactional approval service; they do not create extra tester decisions.
Reference preparation reuses original bytes only within that invocation, with fresh
source/admission metadata per upload and independent byte checks at operation claim
and final completion. Completed page materialization is reused by its unique source
operation. The [efficiency record](accepted/2026-09-27_dify-booklet-runner/M4-balanced.md#execution-efficiency-follow-up--2026-10-13)
records local proof, release identities and the live comparison; no persisted schema changes.


Issue #65 M3 follows the [experiment-only scope](accepted/2026-09-27_dify-booklet-runner/EXECUTION.md#m3-experiment-only-scope).
Infrastructure is assumed working; its fault-injection tests are not persona
acceptance gates. Authenticated stopped-task readback can close a requested stop
after the original operation deadline when no callback claim or saved completion
remains. Closure atomically fails the owned bookkeeping, retains stop/attempt
history and reservations, and releases the active-operation pointer without replay.
Ordinary claimed workflow failures remain uncertain to preserve late completion.

The issue #65 recovery candidate adds retained mutation ownership to the existing
deployment-control document. A mutation has an ID, process identity and optional
run/operation identities. Startup retains dead-process owners for evidence-based
reconciliation; unidentifiable legacy counts remain explicit drain blockers.
Counter cleanup cannot release another mutation. The run list uses a paginated
metadata API; selected-run detail retains artifact and byte-verification paths.
Active list rows poll every five seconds. Terminal pages stop automatic polling
and retain manual Refresh. These candidate changes are not yet verified live.

Drain permits publication readback for a callback-completed operation even after
the callback clears its active-operation pointer. New preparation and dispatch
remain gated. Pause remains set during this reconciliation; saved output does
not require a replacement workflow submission.

Bounded transactional find/aggregate cursors inherit a collection-level timeout
default. This avoids the installed MongoDB 7.5 driver's invalid `getMore` timeout
option while retaining operation cancellation and the transaction deadline.
Writes retain the transaction timeout; no command-level override is added.

Kids Booklet is a strict-TypeScript Next.js App Router monolith. The browser renders a persisted workspace and uses Vercel AI SDK UI for chat transport. Route handlers call deterministic application services, which are the only owners of workflow state, durable IDs, artifact versions, approvals, jobs, assets, and exports. OpenAI Agents SDK agents may route or author validated proposals, but they cannot persist data or advance the workflow directly.

The isolated staging Dify experiment keeps this boundary. Dify owns its manager, Story Writer, and illustration Workflow execution. Booklet owns the synthetic project's revisions, approval, active turn, paid-attempt reservation, completion identity, stored asset, and recovery UI. The illustration Workflow receives identifiers from the manager, obtains the approved saved prompt only through an authenticated authorization callback, and uploads one image through an idempotent completion callback. Booklet fully decodes single-frame PNG/JPEG/WebP within 20 MiB and 64 megapixels and retains original bytes. Dimensions, aspect ratio, supported format, and story-length preferences produce warnings rather than failed completion. Required content and panel structure, hard storage limits, authentication, approval, attempt limits, and conditional writes remain strict. Optional image metadata preserves compatibility with old documents. Dify never writes MongoDB or R2 directly. These experiment-only callbacks do not alter normal Booklet validation or lifecycle.

### Isolated specialty-management mockup

`/mockups/specialty-management` is the separate Phase 0 Agent Studio design surface. It uses bundled synthetic JSON and browser `localStorage`. It does not import the runtime agent repositories, skill registry, contracts, services, model adapters, or MongoDB setup. `npm run mockup:dev` starts Next.js with `SPECIALTY_MOCKUP_ONLY=1`; the instrumentation bootstrap then skips the job runner. Mockup development, browser tests, and builds use separate Next output directories so they do not share a development lock or generated type metadata with the ordinary application process.

The Assistant uses the installed AI SDK `useChat` hook, typed `UIMessage` data parts, and a local `ChatTransport`. The transport emits deterministic browser-local stream chunks and does not call a route handler, model provider, database, or external service. Local JSON stores the durable conversation, captured section bases, proposals, composer text, clarification state, and recovery diagnostics. The mockup has no agent-testing or evaluation workspace; future booklet-studio testing remains out of scope. This mockup does not change the runtime architecture or define production persistence and permission contracts.

The bundled seed is generated from 15 task-guideline files pinned to PR #26 commit `631f547ec3f7ce375f740dd6f2b1b9aaebbde940`. The checked-in manifest records each source path and SHA-256 digest; application startup reads only local fixtures. The task catalog remains provenance for the guideline sources and does not create browser test data. A saved mockup document must match the current exact schema version. The mockup replaces incompatible or unreadable data with the current seed and does not provide storage migration.

```mermaid
flowchart TB
  UI[Next.js workspace and typed cards] --> API[Route handlers]
  API --> CHAT[Chat and card services]
  CHAT --> MGR[Manager agent]
  MGR --> SPEC[One bounded specialist]
  SPEC --> CHAT
  CHAT --> ART[Artifact and approval services]
  ART --> DB[(MongoDB through official-driver repositories)]
  CHAT --> JOB[Persisted sequential jobs]
  JOB --> IMG[ImageProvider and prompt serializer]
  IMG --> FS[Filesystem AssetStore]
  JOB --> PDF[pdf-lib export]
  CHAT --> EVID[Traces, model calls, quality and cost evidence]
  EVID --> DB
```

The root responsibilities are:

| Area | Owner | Responsibility |
| --- | --- | --- |
| Browser UI | `app/`, `components/` | Workspace, AI SDK UI transport, typed cards, artifact views, progress and recovery controls. |
| Contracts | `lib/contracts/` | Versioned Zod schemas for every persisted or transported domain value. |
| Agent definitions | `db/agent-repository.ts`, `lib/application/agent-resolver.ts`, `lib/agents/` | Versioned persisted configuration, fresh immutable resolution, OpenAI runtime adapters, and run metadata normalization. |
| Runtime skills | `lib/skills/` | Versioned skill definitions, schemas, deterministic fake behavior, and the stage-filtered registry. |
| Workflow | `lib/application/` | Context building, routing orchestration, validation, persistence, approvals, quality gates, generation and export. |
| Jobs | `lib/jobs/` | Startup recovery, sequential execution bootstrap, and safe diagnostics. |
| Image pipeline | `lib/images/`, `lib/composition/` | Provider seam, prompt serialization, image calls, and geometry-only normalization. |
| Persistence | `db/` | Official MongoDB driver, typed repositories, indexes, initialization, and verification. |

The Community OpenAI provider has the reviewed opt-in M4 correction installed as
`1.0.7-dev2`; signature verification is restored. The eighteen Booklet graphs
are published with the bounded opt-in branch; other workflows retain their
existing provider route. The local M4 policy/campaign foundation adds
`experiment_campaigns`, optional separate run policy snapshots and operation
monetary reservations. Protected repository injection is required for new Balanced
runs. The ledger owns persona slots, request/judge counts and integer microdollar
reservation/settlement in caller-owned transactions. It has no public grant/budget
API and no automatic uncertain-reservation release. The checked-in non-secret
campaign manifest records the eighteen verified publications and the user's
2026-10-16 bounded campaign grant. Only a reviewed staging manifest with an
explicit grant enables Balanced creation and dispatch; Real remains blocked.
Campaign admission compares complete publication entries independently of binding
array order, retaining duplicate/missing/changed identity rejection. This validation
does not reorder or rewrite saved configuration serialization and hashes.
A protected text preparation path
now saves the exact role request before dispatch, rechecks source/approval and
publication identities, and reserves operation/run/campaign allowances atomically
at claim. Preparation grants no execution permission. Duplicate claims admit one
action. Trusted output assembly supplies approved identity/hash/fact fields rather
than asking a model to reproduce them. The request bundle has canonical Python/Node
byte parity; the local provider pins the global endpoint. Assumed token-count
charges remain reserved after model usage settlement and are not reported as
verified invoice charges. Authenticated original Dify GET results retain provider
content and usage before parsing or materialization. Result/failure callbacks only
request observation for Balanced text. Terminal exit checks reconcile run counters
and campaign totals with every attributable reservation. Report cost snapshots
include their own request and remain fixed after later work. Balanced images use
the existing simulated bytes, approval, source, upload and assembly boundaries.
The UI and CLI retain Simulated defaults and expose grant-gated Balanced controls.
The candidate provider transports the exact prepared request in a plain text
carrier, then unwraps it before OpenAI; static role/model limits and original
deadlines remain enforced. The provider and graphs are installed/published;
Booklet staging delivery, eighteen-binding activation and read-only preflight
are verified. The grant manifest requires reviewed staging delivery before paid execution.
Historical run configuration hashes remain unchanged. See the
[M4 provider record](accepted/2026-09-27_dify-booklet-runner/M4-balanced.md#local-bounded-provider-correction-candidate---2026-10-14).

## Artifact and decision flow

### Issue #65 local foundation

The [Dify booklet experiment](accepted/2026-09-27_dify-booklet-runner/PRD.md)
has a separate `dify_booklet_v1` booklet profile. Its current local foundation
uses `lib/contracts/experiment-runner.ts` and `db/experiment-repository.ts`.
Experiment runs, single-operation claims and delegation grants use additive
Mongo collections. Normal artifacts, immutable versions, dependencies, approvals
and messages retain the created content and decision provenance.

The narrative implementation covers J01–J07, through the final character
and location lists, plus J08–J10 persistence described below. Staging has
sixteen model-free bindings through J11. All three live Simulated M2 cases reached
the approved reference boundary; final pages and booklet completion remain pending.
Configuration accepts only
complete six-slot M1, eleven-slot J01–J07, thirteen-slot J08/image or fifteen-slot
J09/J10 sheet bundles, or the local sixteen-slot J11 pagination bundle,
not partial profiles. The thirteen-slot profile adds a J08 specialist and one
generic image binding. The M2 module
preparation profile includes fourteen independent text modules through J10 and the
separate model-free image workflow. Local Python/TypeScript parity covers J08
style proposals, revisions and assembled-style tester decisions. J09/J10 preparation
uses a supplied final-list subject ID and exact assembled-style source; these
proposals use stable subject IDs. The fifteen-slot runtime path admits sheet
specialists only after subject-aware index readiness and current source approval
checks. A valid
J07 list can have no additional required features; J10 preserves that empty list
and the nonempty approved anchors instead of inventing a feature.
The app API executes the latest publication; saved publication evidence is not
an execution-version selector. Verified completed slice boundaries remain saved
after a binding change. Unfinished changed configurations are blocked and need
linked successors. Completion atomically saves the
proposal and operation result. Explicit tester review or a current scoped grant
accepts an exact version; manager and judge results cannot approve it. Revisions
retain history and mark dependent current work for review. Preferred-length
warnings do not reject valid content.

Narrative source checks share `lib/experiment-runner/narrative-tasks.ts` across
preparation, completion, approval and specialist context. Its ordered J01–J07
graph requires both draft lists before manuscript work. Only current approved,
unambiguous source versions are eligible. Saved configurations enable J03–J07
only with all seven distinct specialist bindings; old snapshots retain J01/J02.
Booklet adds stable character/location IDs by draft `entryKey` and manuscript
unit IDs by `unitKey`. Final lists validate exact subject/occurrence references.
Revisions invalidate current descendants through saved dependency edges, retain
unrelated siblings, and preserve versions and approvals. Grouped approval uses
dependency order; invalidated content needs a new proposal before acceptance.
The content materializer uses the same completion transaction and collections,
not a second subject registry or workflow service. Local M2 fixtures exercise
all three cases through J07. Live staging cases now reach approved J01–J10 artifacts;
see the current M2 evidence below.

The local image-storage foundation saves an exact prompt, ordered source versions
and request fingerprint on the existing operation. Source checks require current
approved versions and exact approval records; style samples may use their current
draft J08 style version. Completion decodes PNG/JPEG/WebP pixels, hashes the
original bytes, and claims a 60-second completion lease before using AssetStore.
It reads stored bytes back before atomically saving the normal asset and operation
result. Same-byte recovery preserves request counters; conflicting bytes or stale
sources cannot replace a saved result. Missing or corrupt stored bytes remain a
technical blocker even after database completion. The local image callback routes
use the normal authorization claim and return the saved image request context.
The authenticated fixture GET does not reserve again; binary POST validates and
saves original bytes. The proxy transport limit has headroom above the handler's
20 MiB limit. Sixteen live model-free Dify image operations passed binary transfer,
storage and reference acceptance across the three personas. This does not prove
provider execution, the full 20 MiB transport limit or reference-image inputs.
The separate local `reference-transport.ts` adapter prepares runtime-key uploads
of original PNG/JPEG/WebP bytes under the workflow's `booklet-<runId>` user.
It copies and decodes bytes before one bounded multipart request, retains only
the returned file ID and verified original metadata, and does not retry unknown
outcomes. Its initial upload limit is 10 MiB. It is not wired into dispatch;
published file-list consumption, ownership and live capacity remain pending.
The runtime transport can serialize an optional ordered list of uploaded image
IDs into the custom `reference_files` input using the same run user. It rejects
invalid lists before dispatch and preserves the old request when no files are
supplied. No runner caller supplies this input yet; live consumption and file
recovery remain unverified.
Filesystem AssetStore publishes complete temporary-file bytes through an atomic
no-clobber hard link, so an interrupted write cannot occupy the final asset URI.
Image failures retain their original category and timestamp when recorded;
successful recovery clears the current failure, not its evidence history.

The local style-assembly service in `db/experiment-style.ts` combines a retained
J08 textual draft with two completed sample operations. It checks their request
fingerprints, saved lineage and original AssetStore bytes, then creates one
application-owned immutable version and dependency edges in a transaction.
Repeated assembly reuses that same version without another image reservation.
It does not approve the package or dispatch work. The local J08 materialization
path accepts a normal specialist proposal only when its saved configuration also
has a distinct J08 binding after all seven narrative bindings. The proposal stays
unapproved even under delegation. Context returns `style_samples` until the two
saved samples form an assembled version. The thirteen-slot dispatcher prepares
one sample at a time, verifies its image publication and saved upload acknowledgement,
then assembles the two saved samples without another manager or image call.
Retained workflow IDs recover through GET; unknown outcomes without an ID never
repeat POST. Image progress counts saved completion IDs; empty image history
preserves the existing six-/eleven-slot progress hash. Only the application-owned assembled version can be accepted by
explicit tester review or a recorded scoped delegation, with sample and source
evidence checked again. Acceptance also reads both sample files from AssetStore
and verifies their saved byte lengths and SHA-256 values. Missing or corrupt
files prevent acceptance without repeating image generation. Textual revisions return to this sample boundary and
retain old images and approvals. The public configuration reader accepts six,
eleven, thirteen, fifteen, sixteen, seventeen or eighteen complete bindings. The host
validator candidate also accepts the exact seventeen-slot J12 and eighteen-slot
final/evaluation profiles. Only their image binding can have
`finalPageIllustration: true`; the eighteen-slot profile requires it. Existing
profiles keep their original shape. Installation and the final host handoff remain
pending. The reviewed host
dispatcher and fifteen-slot staging settings were installed on 2026-10-05.
J08 and all reference modules are published. All-persona reference acceptance and
model-free binary output transfer passed with 5/5/6 saved images. Staging release
`74f73208393a0f9c69ac6023de1e1f10dd43b6ee` passed deployment and readiness.
The manager/tester publications were updated while dispatch was disabled and
read back against the reviewed M2 source before activation. Configuration
installation does not establish a complete simulation; see the
[M2 live reference evidence](accepted/2026-09-27_dify-booklet-runner/M2-references.md#current-live-reference-evidence--2026-10-05)
for retained run IDs, trace evidence and remaining M3 gates. The runner's saved-image
viewer uses explicit J08 sample, J09/J10 build and J13 page/cover asset IDs through
the existing authenticated asset route. It preserves version history and approvals.
Runner booklet links use `/experiments/booklet-runs/<runId>` and the existing
authenticated run-detail API. The legacy workspace still excludes this profile.
Its earlier reference-viewer staging release passed deployment and readiness; browser inspection
loaded both style samples and one character sheet. This is not visual inspection
of all sixteen retained images.

The local sheet assembler in `db/experiment-sheets.ts` combines a retained
J09/J10 subject draft with one completed image operation. It verifies current
approved final-list/style sources, subject identity, exact style bytes, saved
request and asset lineage, and original stored bytes before committing an
application-owned version. It rechecks database evidence after the storage read.
Replay verifies the same image and dependency edges and returns the existing
version without another reservation. Pause is preserved. This service does not
admit sheet specialists, create subject artifacts, approve sheets or schedule images
itself. The existing operation repository and dispatcher own those steps for the
fifteen-slot profile. They save one textual draft and one assembled version per
subject, verify image publication before assembly, and retain the specialist's
workflow as the image's trace parent. Approval reuses transaction-aware assembly
verification and reads saved bytes; textual drafts cannot receive acceptance.
Booklet-scoped delegation applies to every eligible subject, with one approval
record per exact assembled version. Stage J11 requires all derived sheets, not
one artifact per task. Model-free Dify sheet execution and acceptance passed for
all three personas. Final-page reference inputs and completion remain unverified.

The local sixteen-binding profile adds J11 pagination without extending the
narrative graph past its sheet boundary. It requires all current approved book
sources and every sheet derived from the final lists. Read-only assembly checks
verify saved style/sample and sheet lineage and original bytes before admission,
completion and approval; they do not loosen assembly mutation admission. Booklet
assigns page IDs inside normal artifact completion and preserves the mapping by
page index on revision. Story pages must cover all known manuscript units, but
one unit can span multiple panels or pages. Routed references must identify exact
current approved sheets. J11 acceptance reaches a saved J12 slice boundary, not
booklet completion. Old binding profiles retain their original boundaries. This
profile is now published and active in staging after reviewed release, readiness
and backed-up activation. The linked live Kid successor reached approved J11 and
the J12 boundary without paid calls after the recovery correction. The Parent
and Creator runs also reached that boundary with zero payable calls; see the
[M3 evidence](accepted/2026-09-27_dify-booklet-runner/M3-completion.md#current-live-pagination-evidence--2026-10-05).
The retained fifteen-binding M2 runs preserve their saved boundaries.

The local seventeen-binding candidate adds per-page J12 Page Bible work. It
reuses the saved J11 page identities and verifies current approved manuscript,
style and selected reference-sheet versions before completion or approval.
Each page has its own artifact, dependency edges and approval record. All 4/6/9
accepted pages advance to the J13 boundary, not booklet completion. Older
profiles keep their existing boundaries. This candidate is not yet published or
active in staging. Its model-free Dify fixture and graph are prepared locally;
publication and the runtime binding remain pending.

The local J13 configuration prerequisite adds optional
`finalPageIllustration: true` to the image binding of a complete seventeen-slot
profile. New persona snapshots retain that flag as configuration evidence;
omitting it preserves older snapshot bytes and hashes. Saved enabled snapshots
require the complete fifteen-row persona profile. The local candidate uses this
flag to enable J13 dispatch after all Page Bibles are accepted. Existing snapshots
keep their J12 boundary. No live host settings have changed.

The local `page-image-requests.ts` serializer prepares one J13 `page_source`
request from the saved J11 layout, selected J12 content and assembled J08 style.
It retains exact native lettering and the unchanged style module, and returns
only selected sheet identities in deterministic attachment order. This is pure
request preparation, not an approval or byte-integrity check. The separate
`verifyCurrentPageIllustrationSources` database helper checks current J12 approval,
exact dependencies, and selected original sheet hashes, sizes and dimensions.
It returns ordered attachments and advisory MIME-label warnings. Neither helper
claims an operation or uploads files. The candidate dispatcher uses these sources
for manager-selected page-image operations. Live delivery and completion remain pending.

The local J13 saved-package contract retains exact request/source order, output
metadata, selected runtime upload acknowledgements and per-page candidate lineage.
Its pure builder does not prove database approval or runtime file ownership.
The local assembly service consumes completed, publication-verified J13 image
operations and saves immutable per-page versions with exact dependencies. Replay
reuses the same version; eligible replacements retain the earlier version. MIME
labels and preferred canvas deviations produce warnings, not quality blockers.
The candidate dispatcher assembles verified completed outputs; tester approval
rechecks the assembled version and original bytes. Failed assembly blocks the run
and retains the known result instead of permitting an automatic replacement POST.

The local reference-upload service writes an operation journal before each POST,
then retains ordered acknowledgements in `referenceUploadsJson`. It verifies the
saved image binding, manager selection and current original reference bytes.
Interrupted or unknown uploads stop without another POST; completed prefix uploads
remain saved. It does not establish recovery of a missing file identity. Dispatch
uses its ordered saved file identifiers. A reference-free cover can return an
omitted, null or empty `reference_files` output. A page with required references
still needs exact ordered runtime file identities; null does not satisfy it.
Live application-key ownership checks remain pending. Shared
numeric image limits do not load the server-side decoder.

The local page-work projection distinguishes generation, review and all-page
acceptance while preserving older profiles' J12 dispatch boundary. J13 operation
admission requires the saved manager parent, exact current page sources and ordered
upload acknowledgements before dispatch or claim. A draft replacement requires the
exact pending page/version revision. Image fixture access and output materialization
recheck current source bytes; completed historical replay does not rewrite evidence.
Reference upload admission updates the run revision and journal in one transaction
before the external POST, so Pause cannot admit new uploads after it takes effect.
The manager result contract permits J13 page delegation separately from text
specialist tasks. Materialization verifies the selected page's current sources,
original reference bytes and replacement eligibility. It then checks every Page
Bible's current approval, content and exact dependency edges against the same
transaction's verified layout/manuscript/style identities. Sibling checks do not
prepare unrelated image requests. Shared source/version/approval reads are batched
and remain serial on one Mongo session; image claim and context recheck sources
at their own boundaries.
The enabled candidate routes this selection to the existing image binding, not
a new text-specialist binding. Local page revisions retain tester-decision and
publication provenance, preserve prior versions and validate cumulative prompts
before consuming an allowance. The local image-clarification path retains a
page-scoped question and answer without creating an asset; binary completion and
clarification cannot replace each other's terminal result. Each clarification
consumes its logical image reservation, not a creative revision allowance.
For J13, a publication-verified Pause before claim retains a zero-reservation
operation in the item’s `pausedOperationIds` history. Reconciliation returns that
same ordered item to pending. Resume can attach a fresh operation without
discarding earlier pages or resetting the batch. Unknown outcomes, unverified
attempts and actual failures do not receive this exception.
The exact active claimed J13 operation can read its original approved style and
sheet sources while its outcome is unknown. This permits a late authenticated
binary callback before publication readback. Current-source and callback identity
checks still apply. Assembly mutation remains blocked during active unknown work;
saved J13 materialization still requires publication verification through GET.
Completed batches guide review only while their J11/J12 sources are current.
They do not schedule replacements after source revisions. A drained active batch
can be superseded by a linked successor with current source and prior-image
versions. The revision target comes first; remaining selected pages retain their
order. Predecessor inputs, items, operations and assets remain unchanged.
Running, unknown or unreconciled failed items prevent supersession. The refresh
transaction neither reserves nor dispatches an image.
Live full-booklet acceptance is still incomplete; the candidate is not ready for
publication.
The read-only generation verifier derives completion evidence from the current
run revision, exact approved artifact sets, dependency edges and retained image
bytes. It does not change run status. Verification loads current version,
approval and dependency evidence with batched, serial transaction
reads. Each page assembly verifier checks its sources and bytes once in the
completion walk; completion does not repeat that same page-source walk first.
These changes do not cache verification across transactions or relax validity.
The pure advisory report contract checks
run/configuration/version identity, finding targets and explicit missing evidence.
Visual assessment requires every final page and cover; monetary availability
must match actual, estimated or absent cost evidence. Independent judge
execution is routed separately in the full eighteen-binding local profile. The tester-feedback persistence path
uses immutable operation results, rechecks complete generation evidence and
requires publication verification before acceptance. The runner projection
returns retained report and operation/publication identities separately from
whether its version evidence still matches the current artifact versions.
The dispatcher records generation completion only after the thirteen artifact
sets, exact approvals and durable bytes pass verification. It saves the generation
timestamp and exact version IDs, marks the Booklet complete, and then runs tester
feedback followed by the independent judge. Evaluation becomes complete only
after both exact publication-verified reports pass validation. Missing reports
and uncertain evaluation outcomes leave generation success intact. After
generation completion, only advisory evaluation is permitted; revisions require
a successor run. Repository admission and report saving require the persisted
generation marker, one verified tester report before the judge, and no duplicate
reports. Shorter saved profiles retain their original slice boundary.
Pause prevents new evaluation dispatch. Unknown report results use GET recovery,
not execution replay. Repeated completion rechecks retained evidence without
changing counters or the run revision.
The runner inspector shows generation/evaluation status separately and links to
the existing saved-booklet view. Advisory reports retain operation, workflow and
publication identities and show whether their version evidence is current.
The local context endpoint supplies claimed tester/judge operations with verified
generation evidence, current artifacts, dialogue, warnings, usage counters and
durable image identities. Initial execution can read this evidence before runtime
publication readback; saving the report still requires its exact verified binding.
Publication-verified unknown judge operations can read saved source evidence for
recovery. The full eighteen-binding profile and its persona-filtered snapshot keep
J11/J12/J13 eligibility. Deterministic reports mark creative assessment as
`not_assessed` and do not claim visual inspection.

The candidate ordered page-batch contract preserves selected page order and
source versions, with separate operation, asset and version identities per item.
The selection repository retains jobs and ordered items in existing generation
collections under `dify_pages`, with current-source checks and atomic run-revision
admission. New batch selection stops once generation is saved. Duplicate selection can
still return its retained job without changing generation or evaluation evidence.
The authenticated `POST /api/experiments/booklet-runs/[runId]/pages` endpoint
records this intent through the same repository and maintenance gate. A drained
paused run can record selection without resuming or starting an operation;
Resume remains separate. Active operations and pending decisions prevent selection.
Item binding records the owning prepared operation before dispatch;
reconciliation retains its uncertain outcome or verified assembled result without
executing another call. Pause can retain an in-flight result without admitting the
next item. The dispatcher binds each J13 operation before external work and
reconciles its saved result after assembly. A published, materialized tester answer
permits clarification rebinding while the item retains the earlier operation ID.
Known post-callback images are assembled before new work is planned. Active-job
projection uses the saved run identity. The local runner selector appears after
current Page Bible readiness when the run is drained and paused. It retains click
order for a single page or subset, submits exact source identities, and displays
the saved batch. The repository rechecks those identities transactionally.
Selection does not resume dispatch and an uncertain response is not replayed
automatically. Deployed selector verification remains incomplete.
The legacy worker's restart recovery and
active/runnable projections select only `references`, `pages` and `export`.
Dify recovery must reconcile the retained operation ledger, not reset uncertain
items to pending. Batch generation does not replace per-page approval.
The recovery candidate reconciles interrupted legacy follow-ups, jobs and
execution batches before launching either service's recovered work. Both services
reuse that one batch-ID set; a second sweep must not revoke newly acquired
materialization ownership. Selection claims the current card and batch atomically,
and stale terminal projections cannot replace a newer selection. Finalization
commits the completed card, saved message projection and owned batch in one
transaction. Recovery of an older partial commit requires the exact selected
candidate and retained materialized output. It resumes only deterministic
bookkeeping, not provider execution. Image completion also saves a pending
continuation marker. Startup discovers that marker after a crash; finalization
clears it only after the current artifact and review card are saved. Repeated
finalization reuses matching outputs and cannot replace a newer job result.
An older completed text card without exact materialization proof becomes an
inspectable unresolved result. Recovery retains its selected candidate and
response identity, blocks automatic replay, and offers only an explicit team change.
The local blocked-run correction fails running `dify_pages` item/job bookkeeping
only for a definitely blocked owning run and an exact retained terminal J13
operation. It preserves provider results, assets and operation state. Unknown,
missing or nonterminal evidence remains unresolved; deployment drain must not
ignore it. The candidate also invokes this helper in the dispatch-outcome and
failure-callback transactions, including idempotent terminal-failure readback.
An unclaimed definite failure must not leave its page item counted as running;
unknown claimed work remains unresolved. This extension is not yet deployed.

J11 completion reuses source verification within one transaction attempt only;
retries and later approvals verify current approvals, lineage and bytes again.
Failed/stopped runtime observations are classified against the persisted claim.
Claimed uncertain work retains its active operation for late completion and
GET-only recovery; terminal runtime status alone does not permit replacement.

Specialist context includes saved task-and-subject-specific answers and global manager
answers. During a revision, clarification preserves the original target and
instruction. The matching tester answer restores that revision without another
revision debit. Restart reads reconstruct this context from saved operations and
tester messages.

Legacy booklet projections exclude this profile because their eight-stage
parsers cannot read J01/J02. Subject-aware artifact uniqueness uses booklet,
artifact type, subject kind and subject ID. Missing legacy subject fields share
the same null identity, preserving legacy type uniqueness. Setup adds this index
and retains an exact existing artifact-type index; it never removes or recreates
that older restriction. Existing databases therefore still need a controlled
index transition before multiple same-type sheets can be stored. Deploy the
compatibility release first so later index removal has a viable rollback image;
the host's automatic image rollback does not restore the database. No reset or
sheet-dispatch enablement is part of this compatibility step.

The explicit staging index-retirement command is separate from startup and runner
admission. It uses the existing host lock, journal, maintenance control and backup
storage. It rejects unresolved experiment work before closing admission and checks
again before and after stop. Catalog checks preserve compound-key order; backup
verification reads the completion marker, archive and original asset bytes. The
host checks reviewed rollback image identities and retains the pre-change backup
across interrupted removal. Finalization can resume after admission reopens without
stopping the app. The command removes one named index, not records or assets.
Authorized live staging retirement passed on 2026-10-05 with verified backup
`staging-20261005T120906Z-4bf0d3b2d7950104`. It removed only the legacy index,
preserved data/assets and release pointers, and passed readiness. This establishes
the index prerequisite, not live sheet-production acceptance.
`verifyExperimentData` checks experiment references without legacy agent seeds.
The enabled, non-production runner profile initializes experiment structure
without local-agent seeds or a host OpenAI key. It retains seed assets for health
checks and leaves existing legacy seeds unchanged. Disabled settings retain
legacy initialization and execution.

`lib/experiment-runner/` supplies complete six-, eleven-, thirteen-, fifteen-, sixteen- or seventeen-module configuration, browser
run APIs, six exact machine callback routes, a sequential dispatcher and bounded
application-key transport. The bounded-operation candidate starts a persisted
five-minute deadline before active preparation; queued time is excluded. Normal
work uses at most 270 seconds and reserves 30 seconds for reconciliation. A
transactional dispatch marker precedes each single streaming POST. The transport validates
`workflow_started`, validates publication and awaits durable run-ID persistence, then returns
accepted/running while retaining the stream reader until completion or deadline.
Connection/start acknowledgement is bounded to 30 seconds. Callback authorization
reserves once without extending the original deadline. A persisted five-second
observation slot bounds application-key GET recovery to one attempt per cycle,
including after restart; there is no nested transport retry loop. Observation
timestamp writes wait while an image completion lease is active, so polling does
not invalidate its source-verification transaction. Text and clarification saves
also acquire a persisted 60-second `resultFinalizationClaim` before starting the
materialization transaction. Both observation-slot and wake writes skip that
lease. Completion checks the exact lease and its elapsed lifetime, clears it in
the same commit, and releases it on a handled failure. A process interruption
leaves an expiring lease; it does not permit another workflow POST. Expired leases
remain observable without extending the operation deadline. Each materialization
transaction attempt emits a sanitized `result_transaction` diagnostic event;
attempt outcomes are not proof of commit or authorization.

The candidate records the Dify task ID separately from its workflow run ID.
Authenticated Inspect/reconcile and Stop operation actions use the same bounded
coordinator as deadline handling. It checks saved output and remote status before
stopping the exact task. A stop acknowledgement is not proof of termination.
Stop intent is durable before delivery; uncertain delivery is not automatically
repeated. Failed attempts retain unresolved identities and prevent replay. Late
verified output retains attempt history and pauses the recovered run.
MongoDB transaction retries share the remaining budget; collection operations,
storage requests and body reads have shorter bounds. Process heartbeat and
operation progress are separate observations. These changes require staging
probe verification before the remaining Parent attempt; they are not a live claim.
Authorization source checks use a separate persisted 60-second
`authorizationClaim` before the reservation transaction. Observation-slot and wake
writes skip its live lease. The transaction checks ownership and elapsed expiry
before saving the single reservation; Pause, validation failure and expiry retain
the existing admission and no-replay rules. Handled exits clear only their own
lease; process interruption allows expiry-based observation. Each transaction
attempt emits `authorization_transaction`, not proof of request admission.
The local upload-preflight correction checks saved identity, recoverability and
lease availability without repeating the source walk. Claim verifies current
sources before storage; finalization validates its lease and derived path before
the full source-and-byte verification. Evidence is not reused across these
transactions. This correction is not yet deployed.
The local metadata correction loads run-scoped artifacts, retained versions,
approvals, dependencies, operations and asset metadata through seven serial
queries per verification attempt. Page, style, sheet and generation verification
reuse those records within that attempt only. Each consumer still checks exact
current identities, ownership and lineage; original-byte verification is unchanged.
Retries and later callbacks create a new attempt. Assembly mutation phases keep
fresh reads. This candidate has not established live callback latency.
Unknown work
with a completed callback remains observable until terminal evidence. A matching
terminal success clears only its latest operation's unknown blocker and preserves
Pause. A matching terminal failure creates an inspection blocker without changing
the callback result or permitting replay.
Unknown work without an ID and expired uncertain work retain the single-experiment lane instead
of permitting another POST or persona. No external queue or service is added.
Published workflow identities and the saved configuration snapshot must match.
After callback-first publication recovery, the dispatcher reloads the saved
operation before dependent admission; an earlier in-memory record is not proof
of the current publication state.
Stage projection batches current sheet-source versions/approvals and Page Bible
sibling versions/approvals. Each consumer still checks exact ownership, approved
state and current source identities. Reads remain serial on the Mongo session;
no verification cache survives a transaction attempt.
The dispatcher candidate reads latest-operation heads for all saved runs in one
batch instead of retrieving each complete history during the lane scan. It keeps
the timestamp/ID ordering, separately reads an active operation, and refreshes
the head after reconciliation. Completed runs with unverified latest execution
still retain the lane. This read optimization does not change stored evidence,
authorization, deadlines or callback verification; live latency remains unproven.
Three unchanged progress observations block the run. Pause prevents admission
but does not cancel in-flight work; an authorized result can still be stored.

Callback authorization returns its fresh verified image request to context
construction without repeating the same source walk. Synthetic fixture access and
pre-upload checks verify active identity, fingerprint and current source/approval
lineage without reference downloads; image admission and final acceptance retain
complete original-byte verification. Evaluation batches independent artifact
metadata reads. Shared source and byte evidence lasts only within the current
read-only transaction attempt and is recreated on retry; consumers still check
their own expected metadata and dependency relationship. Callback storage uses
one client and checked GETs instead of redundant HEAD/GET pairs where equivalent.
Sanitized phase diagnostics report IDs, timing, instrumented query/storage counts
and outcome, never credentials or creative content. These local changes do not
establish deployed callback latency; live proof is required by
[M3](accepted/2026-09-27_dify-booklet-runner/M3-completion.md#latency-and-asynchronous-completion-correction).
The staging-only `/api/diagnostics/logs` endpoint uses the existing Basic gate
and returns bounded structured phase events, including failed outcomes, not raw
logs or exception bodies. Its process-local 5000-event buffer is shared across
Next.js bundles and clears on restart. The restricted Dify operations diagnostics
action provides host/container state, exit codes, allowlisted sandbox/scheduler
memory and error-category counters, and bounded retained callback summaries;
see [the operating runbook](https://github.com/karpishe-experiments/agentic-poc/blob/master/docs/deployment/dify-community.md#automated-diagnostics-and-sandbox-memory).

With the runner enabled, `/experiments/booklet-runs` shows saved work through the configured slice,
warnings, exact version approvals, limits and Pause/Resume. Only Simulated runs
can be created. An approved configured slice boundary remains a queued partial booklet,
not completion. The legacy home and agent navigation remain when disabled.
The six M1 Community bindings and all three live Simulated J01/J02 cases are
verified; [M1 evidence](accepted/2026-09-27_dify-booklet-runner/M1-runner.md)
records their release and run identifiers. Reload and idle Pause/Resume preserve
saved results without duplicate execution. The deployed UI recovers a definite
control revision conflict with a current-state read and at most one control retry;
it does not retry an uncertain write. Live active-operation Pause persisted after
reload and Resume did not duplicate work. Rapid progression can exhaust the
single retry and require another Pause click. Production, Cloud and the diagnostic
probe are unchanged.

The local `scripts/experiment-runner.ts` driver uses these same application APIs
for create, observe and exact-revision Pause/Resume. It defaults mutations to
preview, accepts only staging/loopback targets and Simulated creation, retains
request identity, and sends no automatic retries. It reports allowlisted saved
state, not credentials or full creative content. It is not a separate dispatcher
or a full acceptance verifier; image-byte, page and report verification remain
outside its current scope.

Every legacy-profile booklet has eight ordered artifact records:

```text
Audience Profile → Story Plan → Visual Style → Visual Bible
→ Booklet Specification → Page Plan → Final Pages → PDF Export
```

`BOOKLET_ARTIFACT_TYPES` in `lib/contracts/domain.ts` defines this order. `ArtifactService` records explicit upstream-version dependencies and derives the current stage as the first artifact that is not approved. Revising an upstream artifact creates a new immutable version and can mark dependent work for review.

Three actors have deliberately separate authority:

- **Agents** select a bounded skill or propose structured content.
- **Application services** validate cross-document invariants, assign persistent IDs, create versions, start jobs, and calculate transitions.
- **The creator** makes material decisions through validated cards and explicitly approves current artifact versions.

The four card families are `question`, `artifact_review`, `progress`, and `issue`. Cards and their responses are persisted with the conversation. Submitting a card updates both its authoritative row and its saved UI-message projection, so reload and restart restore the same decision state. Expected workflow failures become typed recovery cards only when replacing the current decision is safe.

The chat route returns an AI SDK UI message stream with a transient working status followed by one atomic, already-persisted narration and `data-card` result. Token-by-token model narration and a second agent-session store are intentionally absent.

## Agents, skills, and handoffs

### Manager

For a material conversational turn, `ChatService` builds a `SkillContext` from the saved stage, requested operation, user intent, known facts, recent messages, approved artifact-version IDs, and a trace ID. `ManagerService` filters the registry by stage and, for Story Plan work, by operation.

The manager agent receives only those eligible skills as function tools. Its persisted active version supplies its display name, complete instruction text, OpenAI model, reasoning effort, and one-to-two turn bound; code still requires a tool call, disables parallel tool calls, stops after the first tool, and rejects a route outside the supplied allowlist before parsing specialist input.

### Specialist

Before a material call, `AgentResolver` reads one complete active MongoDB transaction snapshot: one manager plus one specialist for each registered skill. It freezes the resolved manager/specialists for that invocation, so an activation affects only later calls. After routing, the application selects the frozen specialist for the selected skill, validates its input, and invokes it with the persisted version's configuration. The generic specialist receives the skill ID, stage, operation, intent, validated skill input, known facts, recent messages, and approved artifact-version IDs. It returns the code-owned structured output envelope.

Specialists cannot write workflow state, issue approvals, access arbitrary tools, or create durable entity/page IDs. Their result is transient until an application service validates, materializes, and persists it. This is an application-controlled handoff, not a free-form SDK handoff:

```text
manager selection → route validation → specialist execution
→ output validation → application persistence → creator decision
```

`MODEL_RUNTIME=fake` uses deterministic routing and each registered skill's `run` function for tests and local no-cost work while still resolving persisted versions. `MODEL_RUNTIME=real` uses the OpenAI manager and generic specialist adapters. Manager and specialist calls are recorded separately with provider/model, status, latency, usage, request/trace IDs, cost, resolved definition/version IDs, and immutable effective-configuration snapshots. `ChatService` passes its single preflighted active set to both the manager turn and automatic Story Plan quality review, so an in-flight activation applies only to a later turn. Direct quality review resolves a fresh persisted quality specialist immediately before its call.

Story readiness may invoke the review specialist through `QualityService`; generation-readiness and final-page quality are deterministic application gates. In every case, application services retain transition authority.

### Parallel candidate execution

`CandidatePoolService` resolves all valid active specialist or image candidates for a closed execution target. `AgentRunService` and `ImageAgentRunService` persist a ready/running/results/completed card projection with server-only ready input, frozen agent/profile snapshots, per-candidate attempts, retry/change/restart history, and selected-only materialization. The manager remains the single route selector; candidates never advance workflow state directly. In normal runtime, a sole compatible candidate starts server-side without a remembered-team write; text fixtures retain their ready card only so tests can control the batch explicitly. Starting a batch atomically claims the persisted ready card, creates its batch/items, and updates the saved message projection; a losing concurrent request leaves the winning run intact. Interrupted materialization resets to a recoverable result state and is redispatched only by its matching text or image service. The runner supplies recovered image materialization with the owning generation continuation, so the persisted sequential reference/page job advances after the selected image is finalized. The workspace reconciles persisted message projections on refresh even when an Agent Run retains the same message ID, so ready, results, and completed actions stay current without a full reload.

### Runtime skill contract

`SkillDefinition` contains a versioned ID, routing description, eligible stages, input schema, output schema, and deterministic `run` implementation. `lib/contracts/skills.ts` owns the closed skill-ID and shared context contracts; `lib/skills/default-registry.ts` is the active registry.

The registered skills are:

| Skill | Eligible stage |
| --- | --- |
| `intake_readiness@1` | Audience Profile |
| `story_planning_revision@1` | Story Plan |
| `quality_review_targeted_repair@1` | Story Plan quality operation |
| `visual_direction_reference_planning@1` | Visual Style and Visual Bible |
| `booklet_specification@1` | Booklet Specification |
| `page_planning_writing@1` | Page Plan |
| `image_prompt_compilation@1` | Final Pages review |

Runtime skills in `lib/skills/` are unrelated to `.agents/skills/`. The latter are repository-local instructions used by coding agents while developing this project and are not loaded by the booklet application.

## Prompt ownership

Runtime prompts are versioned MongoDB documents, not environment variables or standalone prompt files. Idempotent initialization seeds the current manager and seven specialist defaults; runtime never falls back to those TypeScript seed values. `/admin/agents` is the trusted-local-only lifecycle surface. Its Server Component performs one transaction snapshot read and passes only serializable coverage, definition, version, and skill-choice data to a client controller. Pure view-model helpers derive slot/agent/version selection; focused form, version-workspace, and native-dialog components reuse the existing Server Actions for creation, draft editing, confirmation, replacement activation, retirement, and eligible draft deletion.

- `db/agent-defaults.ts` holds the migration-verification seed manifest only; it is not a runtime fallback.
- `lib/agents/manager.ts` and `lib/agents/specialist.ts` receive persisted names, instructions, models, and reasoning settings, while retaining code-owned tools, output schemas, and turn constraints.
- `lib/agents/openai-specialist-runtime.ts` serializes the validated skill input and bounded `SkillContext` into the runtime request.
- Skill input/output Zod schemas constrain what the model can receive and return.
- `lib/images/prompt-serializer.ts` deterministically serializes the provider-neutral image prompt plan, including exact approved lettering, continuity, no-panel constraints, relevant references, and targeted revision instructions.

Change an agent prompt by forking or editing a draft in `/admin/agents`, then activating it after review. Code changes remain necessary for skill schemas, tool bounds, registry eligibility, or the supported model catalog. Image-provider wording belongs in the shared image serializer. Keep configuration, schemas, application materialization, and focused tests consistent.

If active coverage is missing or malformed, resolution returns a safe recoverable configuration error pointing to `/admin/agents` before a new material message, card, artifact, approval, job, or stage mutation. A previously accepted card response stays pending; the workspace offers exact retry during the session and **Resume saved decision** after reload.

## Persistent generation and recovery

Reference and page work is stored as idempotent jobs with ordered items. The Node instrumentation bootstrap starts one in-process runner, recovers interrupted follow-ups/items, and processes runnable jobs sequentially. A global per-job promise map prevents duplicate same-process execution.

Every generation failure is a user-controlled pause:

1. The failing item is saved as failed and later items remain pending.
2. No provider error is retried automatically.
3. The creator retries only the selected failed item.
4. A successful retry leaves the job paused when pending items remain.
5. The creator explicitly chooses Continue before the runner processes the remaining queue.

Completed items and active assets are never discarded because another item fails. Selective regeneration resolves the current page/reference target and asset lineage on the server, creates a one-item job, and publishes a replacement only after it succeeds.

The progress panel and persisted progress cards share one poller per job. Running jobs poll every five seconds; non-running observable states poll every fifteen seconds. Publishing a retry or Continue response updates the same coordinator immediately. Diagnostics record safe job/item boundaries and waiting heartbeats without prompts, image bytes, credentials, or arbitrary provider response bodies.

`IMAGE_PROVIDER_MODE` selects only `fake` or `real`. The selected frozen image-agent profile supplies provider, model, quality, and resolution; no global image model or quality setting exists. Real requests use provider-native square, landscape, or portrait sizes, then Sharp normalizes them to the approved final canvas without stretching or drawing text. PDF export uses approved composed assets in deterministic cover-first order.

## Changing the architecture

### Add or revise a skill

1. Define or version the skill's input and output schemas. Use a new `@N` ID for an incompatible contract.
2. Add the ID to the closed skill-ID schema and implement the deterministic `run` behavior under `lib/skills/`.
3. Register its description, stages, schemas, and implementation in the default registry.
4. For a conversational skill, extend `ChatService` to assemble authoritative input and convert the validated result into an artifact/card outcome. For a non-conversational skill, extend its owning application service with equivalent validated input, persistence, and evidence handling.
5. Add or update the applicable routing fixtures, schema tests, service/manager-contract tests, and artifact-flow integration test.

### Change the artifact flow

1. Update the artifact-type contract and ordered stage list.
2. Update upstream dependency rules, content parsing, persistence initialization, and derived-stage behavior.
3. Update stage-specific agent input/result handling, cards, approvals, quality gates, jobs, workspace rendering, and recovery paths.
4. Add migration/seed changes only when persisted storage requires them, then cover the complete transition and restart path.

Do not encode stage advancement only in a prompt. The application must be able to derive and validate every transition from persisted state.

### Add a distinct agent role

Most new capabilities should be runtime skills wrapped by the existing generic specialist. Add a distinct agent only when it needs different instructions, tools, model-role configuration, execution limits, or evidence semantics. In that case, add an agent factory and runtime adapter, route it explicitly from an application service, validate its inputs/outputs, and record its model calls. Preserve the one-specialist-per-material-turn contract unless the PRD and fixtures are deliberately revised.

## Verification and evidence

- `npm run typecheck`, `npm run lint`, and `npm test` validate contracts and services.
- `npm run test:agent` verifies stage eligibility, expected routing, bounded calls, and structured repair behavior.
- Integration tests cover artifact dependencies, approvals, restart/resume, generation failure, selected retry, explicit Continue, and evidence records.
- Playwright covers the persisted typed-card golden path in desktop Chromium with fake providers.
- Retained real-provider evaluations preserve accepted and rejected PDFs, findings, manifests, traces, usage, latency, and estimated cost.

When behavior or architecture changes, update this guide after verification. Keep reusable failure modes and guidance deduplicated in `LESSONS-LEARNED.md`; do not turn this guide into a chronological work log.
# Deployment runtime

Deployed environments use the same application services and MongoDB job contracts as local development. `DEPLOYMENT_ENV` selects `local`, `_staging`, or `_prod`. `ASSET_STORAGE` selects the local filesystem or the S3 `AssetStore`; application services obtain storage through the central factory and keep existing relative asset URIs.

VPS deployment uses a persisted `deployment_control` record. Mutation entrypoints and the job runner check it before accepting work. The runner records startup, heartbeat, and fatal state. Maintenance containers set `RUNNER_ENABLED=false`, so initialization, readiness, backup, restore, and reset cannot recover or claim queued work.

`/api/health/live` is the only unauthenticated route and reports process liveness. The deployment proxy applies Basic authentication to pages, APIs, assets, admin actions, and Server Actions. Authenticated readiness verifies MongoDB structure, runner state, maintenance state, and required asset access without invoking a provider. Slow mutation routes stream NDJSON heartbeats and a terminal status/body record. Chat keeps the AI SDK UI stream open with transient heartbeat records.

The VPS topology and operational sequence are documented in [the deployment runbook](deployment/runbook.md). Terraform owns Cloudflare R2, Tunnel, Access and DNS rules. The root-owned host dispatcher owns Compose releases and a persistent operation journal; host flock and GitHub concurrency serialize changes. See [deployment contracts](deployment/contracts.md) for scope and acceptance limits.

The diagnostic candidate checks the staging-only diagnostic API from the existing
staging container through its fixed public HTTPS origin. It reuses Basic
authentication in memory, rejects redirects and bounds time/response size. It
returns only authentication status and event count. No new route, authentication
exception, credential store or production access is added. Scheduler observations
remain fixed-category counts rather than arbitrary container logs. Live readback
passed in diagnostics `38138400115` and `38141274006`: authenticated HTTP 200.

The temporary Dify trial adds optional host secrets and selects real mode only in staging. The application branch owns experiment availability, tool authorization, and approval checks. The host support is removed if Dify is rejected after the trial or replaced by the accepted long-term design if Dify is adopted. See the [experiment configuration](accepted/2026-09-16_agent-platform-decision/configuration.md).

The Dify collaboration service uses the API runtime's 1536 MiB memory limit,
a bounded healthcheck, and local Engine.IO readiness verification. Its targeted
repair uses the shared operation lock and journal and recreates only that service
after an idle check; it does not change Booklet release state or Dify data.

The scheduler repair sets `worker_beat` to 1536 MiB after kernel
logs confirmed migration subprocess OOM kills at 256 MiB. It uses the same lock,
journal and idle guard, recreates only that service, and checks beat startup plus
120 seconds without a restart. See the [Community runbook](https://github.com/karpishe-experiments/agentic-poc/blob/master/docs/deployment/dify-community.md#automated-diagnostics-and-sandbox-memory)
for deployment prerequisites and the verified live recovery.

Issue #69 prepares a separate Dify Community stack on the same VPS. The pinned
upstream Compose release and repository override keep its databases, networks,
and data separate from Booklet; nginx binds only localhost port 3300 behind a
maintenance-gated Tunnel route. The candidate staging-only probe has no model
or image node. Booklet starts it with an application API key, receives an
authenticated callback on one exact route, and retrieves the saved Dify result
by workflow run ID with the same runtime key. Probe records are isolated in
`dify_community_probes` and do not mutate booklet/artifact/approval state.
Production and disabled staging deployments reject all probe routes. See the
[Community runbook](https://github.com/karpishe-experiments/agentic-poc/blob/master/docs/deployment/dify-community.md). The operator verified the
public deterministic round trip and runtime lookup on 2026-10-03; interrupted
response and platform backup/restore readiness remain separate checks.
The candidate authenticated staging fault header discards the Dify start response
before reading its identity. Recovery uses the callback's persisted ID and a GET,
never a replacement execution. Production and disabled profiles remain closed.

The protected staging key workflow can provision the Community probe as one
four-setting patch. The master-owned host dispatcher limits it to staging,
validates the exact field set, merges it without replacing unrelated secrets,
and uses the existing serialized secret rotation. Dify's callback variable and
application API key remain private operator bindings; no provider call is needed.

The same protected workflow can stage the issue #65 runner's five settings from
one private JSON bundle. The host validates the fixed staging/Community origins
and complete six-, eleven-, thirteen-, fifteen-, sixteen- or seventeen-slot bindings, including disabled
bundles, then preserves existing
Cloud, probe and application secrets during the normal serialized rotation.
Compose defaults the runner off. Private module keys/publications, exact-target
reset approval and authorized enablement remain separate readiness checkpoints.

The staging reset can select a fully validated, prepared Dify runner bundle for
maintenance initialization while the running service retains disabled settings.
After the reset, it activates that bundle before restarting the app.
Maintenance containers still set `RUNNER_ENABLED=false`. The reset requires the
exact staging bucket and completed backup coverage for every bucket object;
its backup includes unreferenced objects. A reset interrupted during deletion
or verification cannot be replayed through Resume. Inspect the retained backup
and database before explicit recovery.

### Consolidated VPS deployment boundary

VPS deployment is owned by `scripts/deploy/vps-deployment.sh`. Setup discovers Cloudflare and host ownership and configures database-scoped Atlas users and the exact VPS allowlist. Finalize creates absent environment branches from the reviewed commit containing `infra/config/vps.json`. Terraform owns Cloudflare R2, Tunnel, DNS and cache/rate-limit resources. `_staging` and `_prod` are independent reviewed release lines and may diverge from `master`. GitHub Actions verify the current environment-branch commit, build public GHCR environment-tagged images, and deploy only their immutable digests through the restricted VPS command interface. Compose overlays hold non-secret configuration; root-only final overrides hold secrets, including staged rotation files. Preview is the default and mutations require `--apply`. TypeScript owns application initialization, readiness, drain, backup/restore, and staging-reset behavior.
