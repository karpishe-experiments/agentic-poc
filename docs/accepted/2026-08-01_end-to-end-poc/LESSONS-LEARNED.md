# Lessons learned

Keep only verified, reusable lessons. Merge or revise existing entries instead of recording duplicates.

## Candidates

### Break the first-image cycle with a zero-task service and registration template

- **Context:** Terraform must create an ECS service and ECR repository before GitHub can publish the first application image.
- **Observation:** A zero-count service can reference an unpublished bootstrap tag safely while Terraform exports a complete task-definition template. The release workflow can then publish by commit, resolve the digest, and register the first runnable revision without starting a placeholder application.
- **Guidance:** Keep desired count zero during infrastructure bootstrap, prohibit starting the bootstrap revision, and split ownership so Terraform manages the task template while the release workflow supplies only the immutable image digest and service revision.
- **Evidence:** `infra/terraform/modules/environment/ecs.tf`, `scripts/deploy/github-release.sh`, and `infra/terraform/environment/deployment.tftest.hcl`; the mocked Terraform tests passed on 2026-09-12.
- **Promotion target:** Documentation.
- **Status:** Candidate.

### Prefer an installed Chrome channel when Playwright's bundled Chromium is unavailable

- **Context:** Running the isolated deterministic Playwright suite on the Windows development host.
- **Observation:** The suite could not launch because Playwright's pinned Chromium binary was absent and its download timed out, while the installed Google Chrome channel completed all browser assertions.
- **Guidance:** Keep Playwright configurable through `PLAYWRIGHT_BROWSER_CHANNEL`; on this Windows host, default to `chrome` so `npm run test:e2e` remains reproducible without a separate browser download. Revalidate that Chrome is present when moving to another environment.
- **Evidence:** `playwright.config.ts` selects the Windows Chrome channel; `npm run test:e2e` completed all three existing specs and `agent-management.spec.ts` on 2026-08-15.
- **Promotion target:** Agent instruction.
- **Status:** Candidate.

### Use the CMD npm shim when PowerShell execution policy blocks npm.ps1

- **Context:** Running project npm commands from this Windows PowerShell environment.
- **Observation:** `npm.ps1` was blocked by execution policy; the same commands succeeded via `npm.cmd`.
- **Guidance:** Keep package scripts portable as `npm` scripts, and use the `npm.cmd` shim in this environment when direct `npm` is blocked.
- **Evidence:** The initial registry check failed with `PSSecurityException`; `npm.cmd ls --depth=0` and `npm.cmd run typecheck` completed successfully on 2026-08-01.
- **Promotion target:** Documentation.
- **Status:** Candidate.

### Validate the complete lint stack, not just its top-level package pins

- **Context:** Pinning a new Next.js/TypeScript/ESLint foundation from package versions that install successfully.
- **Observation:** `typescript@7.0.2` and `eslint@10.8.0` both installed, but the version-matched `typescript-eslint` and React lint plugins bundled by `eslint-config-next@16.2.12` rejected those versions at runtime.
- **Guidance:** Run typecheck and lint immediately after bootstrap; reconcile top-level compiler/linter pins with the transitive plugins’ declared peer ranges before treating the toolchain as locked.
- **Evidence:** Slice 0 failures and passing corrections documented in `PLAN.md` under “Bootstrap correction (2026-08-01)”; `npm.cmd run typecheck` and `npm.cmd run lint` then passed.
- **Promotion target:** Documentation.
- **Status:** Candidate.

### Persist card lifecycle changes in both authoritative and display records

- **Context:** An AI SDK UI chat persists complete display messages alongside authoritative card rows.
- **Observation:** Updating only a `cards` row left the saved `data-card` part active after a page reload, even though the decision had been submitted.
- **Guidance:** Update the validated card row and its originating UI-message projection in the same transaction for submit and supersede transitions; validate the restored message history before rendering it.
- **Evidence:** `db/repositories.ts` updates both records; `tests/integration/booklets.test.ts` verifies the submitted status after reload, and `tests/e2e/typed-card-flow.spec.ts` passed on 2026-08-01.
- **Promotion target:** Agent instruction.
- **Status:** Candidate.

### Treat AI SDK `messageId` as a replacement target, not a client-generated ID

- **Context:** Sending a new message through AI SDK 7 `useChat` with `DefaultChatTransport`.
- **Observation:** Passing a new `messageId` to `sendMessage` attempted to replace a message that did not exist; sending the text and metadata without it created the new turn correctly.
- **Guidance:** Use `prepareSendMessagesRequest` to send only the latest user message to the authoritative server, and omit `messageId` when adding a new message.
- **Evidence:** `components/workspace/workspace-conversation.tsx` uses the last-message transport request and no new-message ID; the persisted-card browser flow passed on 2026-08-01.
- **Promotion target:** Agent instruction.
- **Status:** Candidate.

### Let the persistent runner own normal local generation execution

- **Context:** A request handler can create and immediately run a generation job while the in-process restart runner is polling the same MongoDB database.
- **Observation:** A request handler and the restart runner could claim different pending items from one job, then race while finalizing its dependent artifact version.
- **Guidance:** Persist normal jobs from the request path and let the guarded in-process runner execute them. Retain a per-job promise map as a same-process guard; allow direct execution only in isolated tests that intentionally do not bootstrap the runner.
- **Evidence:** `CardService` and `RevisionService` directly start jobs only under `VITEST`; `GenerationService` retains the global per-job promise map; all three specs in `npm.cmd run test:e2e -- --workers=1 --reporter=line` passed on 2026-08-02, including the reference/page async path.
- **Promotion target:** Agent instruction.
- **Status:** Candidate.

### Normalize Agents SDK usage and provider-safe trace IDs at the boundary

- **Context:** An OpenAI Agents SDK manager, specialist, or review run must reconcile to a local model-call ledger.
- **Observation:** An agent run exposes aggregate token usage through `result.state.usage` and the final Responses ID through `result.lastResponseId`; discarding them leaves text-model calls without usage, request identity, or cost evidence. Passing an arbitrary application UUID as an OpenAI provider trace ID caused a tracing export 400.
- **Guidance:** Extract usage and request ID at the real-provider adapter boundary, persist them with the SDK-generated trace, and calculate a separately labelled estimate from the checked-in pricing version. Use the booklet ID as the trace group and put the application correlation ID in trace metadata; do not substitute it for the provider trace ID. Fake runs should record explicit zero usage and cost so the same reconciliation check covers every operation.
- **Evidence:** `lib/agents/run-metadata.ts`, `lib/application/model-call-cost.ts`, and the manager/review adapters record this data. The final 2026-08-02 real probe emitted no tracing 400; `tests/integration/booklets.test.ts` and fake golden-path evidence showed no calls missing usage or cost.
- **Promotion target:** Documentation.
- **Status:** Candidate.

### Keep approved comic copy structured through the image-provider boundary

- **Context:** Generating a single-scene comic page whose title, narration, dialogue, thoughts, and sound effects must participate naturally in the illustration.
- **Observation:** Post-generation text panels obscured the composition and could not express speaker tails, narration hierarchy, thoughts, or action-integrated sound effects. A structured lettering contract allows prompt snapshots, speaker validation, accessible reading order, and selective recovery while leaving Sharp responsible only for geometry.
- **Guidance:** Approve ordered lettering elements before generation; quote each exact string with its kind, speaker, delivery, placement, and reading order in the provider prompt; prohibit unapproved text; expose quality as an explicit engineering choice; and use full-size review plus selective regeneration for provider-rendering defects. Do not draw reader-facing text or panels during image normalization.
- **Evidence:** `lib/contracts/artifacts.ts`, `lib/images/prompt-serializer.ts`, `lib/composition/compose-page.ts`, and their focused tests; the full 86-test suite and production build passed on 2026-08-08.
- **Promotion target:** Documentation.
- **Status:** Candidate.

### Own the Playwright server lifecycle on Windows

- **Context:** Running an isolated Next.js development server for desktop Playwright checks through PowerShell on Windows.
- **Observation:** Playwright completed its assertions but did not reliably terminate nested Next.js descendants, causing the normal test command to time out. Parallel browser workers also shared one isolated database and server process.
- **Guidance:** Start the prepared fake-provider server in a project-owned runner, invoke Playwright with `PLAYWRIGHT_REUSE_SERVER=1`, terminate that exact child process tree in `finally`, and allow a configurable isolated port when a developer already uses the default. Keep `workers: 1` unless the test harness gives every worker an independent database.
- **Evidence:** `scripts/run-e2e.ts` and `playwright.config.ts` own the isolated server, MongoDB replica set, and serial browser run without touching a pre-existing developer server.
- **Promotion target:** Agent instruction.
- **Status:** Candidate.

### Make discriminated agent output stage-specific when a skill spans workflow stages

- **Context:** A single structured visual-direction skill supports both `visual_style` and `visual_bible` stages.
- **Observation:** During real evaluation, the specialist could return another `visual_style` result after the user had already selected a style, leaving a valid but incorrect active card for the current stage.
- **Guidance:** Include the current stage in the specialist's output instructions and explicitly require the matching discriminated variant; application routing should never treat a structurally valid variant as interchangeable across workflow stages.
- **Evidence:** `lib/agents/specialist.ts` now constrains `visual_direction_reference_planning@1` by `context.stage`; the accepted `developing-reader-corrected` and `older-reader-corrected-v2` runs completed the style-to-Visual-Bible transition with 26 and 28 traced calls respectively.
- **Promotion target:** Agent instruction.
- **Status:** Candidate.

### Encode excluded image layouts in the provider-neutral prompt and verify rendered output

- **Context:** A picture-storybook POC forbids multi-panel comic layouts while using a generative image provider for one illustration per Page Package.
- **Observation:** A successful provider run still produced a sequential multi-panel image for one older-reader page because the prompt described the scene but did not explicitly prohibit panels.
- **Guidance:** State the single-full-page, no-panel constraint in the shared prompt serializer, then render and visually inspect every final PDF page; a successful image response is not sufficient acceptance evidence.
- **Evidence:** `lib/images/prompt-serializer.ts` and `tests/unit/images/contracts.test.ts`; `evaluations/2026-08-02/older-reader-corrected/findings.md` records the rejected run, while the rendered `older-reader-corrected-v2` PDF passed the no-panel rubric.
- **Promotion target:** Documentation.
- **Status:** Candidate.

### Treat model entity descriptions as drafts, never durable identifiers

- **Context:** A structured story-planning skill must describe characters and locations that later connect to visual references and page packages.
- **Observation:** Validating UUID-shaped model output does not establish application ownership; it lets a model silently replace the persistent identity that downstream artifacts depend on.
- **Guidance:** Use a discriminated `existing`/`new` entity-change contract. Accept existing IDs only from the supplied current artifact, require a nonpersistent client key for new drafts, and materialize durable IDs in application code before persistence. Apply the same boundary to generated page IDs.
- **Evidence:** `lib/contracts/drafts.ts`, `lib/application/entity-materialization.ts`, and `tests/unit/application/entity-materialization.test.ts` added on 2026-08-02; the single-worker Vitest run passed 59 tests.
- **Promotion target:** Agent instruction.
- **Status:** Candidate.

### Let the application own Visual Bible membership and identity

- **Context:** A Visual Bible specialist turns an approved Story Plan and visual style into canonical-reference definitions.
- **Observation:** A real specialist result can contain valid-looking but mismatched character/location subjects; accepting its membership directly blocks the workflow or lets the model alter downstream identity.
- **Guidance:** Derive the Visual Bible’s eligible character/location set, stable IDs, reference requirement, reference-asset lineage, and style references in application code from the approved Story Plan and selected style. Use model output only to enrich visual details matched by ID or normalized name.
- **Evidence:** `lib/application/entity-materialization.ts`, `lib/application/chat-service.ts`, and `tests/unit/application/entity-materialization.test.ts`; the focused identity test and full 62-test suite passed on 2026-08-03.
- **Promotion target:** Agent instruction.
- **Status:** Candidate.

### Advance a guided card only when no persisted job owns the next step

- **Context:** A card response in an AI SDK conversation can either require server-side follow-up, create a persisted generation job, or safely begin the next deterministic stage.
- **Observation:** Treating every successful response as a passive refresh left the creator at an empty stage with a disabled composer. Reusing a submitted response ID for a non-follow-up stage returned `card_response_not_found`.
- **Guidance:** Send the server-declared response continuation only when `followupRequired` is true. For safe non-job transitions, send a fresh staged turn without the old response ID; for reference/page generation and final-page approval, refresh and let the persisted job or later export stage own the next action.
- **Evidence:** `components/workspace/workspace-conversation.tsx` and `tests/e2e/golden-path.spec.ts`; the fake-provider browser journey automatically advanced Audience → Story, Story → Style, and references → Booklet Specification, then passed through Final Pages on 2026-08-03.
- **Promotion target:** Agent instruction.
- **Status:** Candidate.

### Stream safe cross-document retries as typed workflow cards

- **Context:** A deterministic artifact guard rejects a Visual Bible or Page Plan that no longer agrees with approved upstream artifacts.
- **Observation:** Returning its expected 400 envelope through the chat transport leaves the conversation unavailable even though saved state can safely continue.
- **Guidance:** Convert only errors known to safely replace the current decision into a persisted recovery card with a stage-specific explanation, named retry, and no-generation guarantee. Leave card-state conflicts on the normal envelope so the original active card remains available.
- **Evidence:** `ChatService.isTypedWorkflowRecovery`, `app/api/chat/[bookletId]/route.ts`, and the Page Plan recovery integration test; focused and full checks passed on 2026-08-03.
- **Promotion target:** Agent instruction.
- **Status:** Candidate.

### Start the persistent job runner when Next omits `NEXT_RUNTIME`

- **Context:** Production startup of the local Next.js workspace, where reference and page jobs are persisted for background execution.
- **Observation:** A production bootstrap can omit `NEXT_RUNTIME`; treating only the literal `"nodejs"` value as executable left queued image jobs at zero progress despite a healthy request server.
- **Guidance:** Exclude the Edge runtime explicitly and treat an unset runtime as Node when starting this local persistent runner. Keep job recovery at runner startup so an interrupted item can be claimed again after a known server restart.
- **Evidence:** `instrumentation.ts` now starts the runner unless the runtime is Edge. During the 2026-08-03 real booklet evaluation, the previously queued three-reference job resumed after restart and completed all items; `npm.cmd run build` and the three browser specs passed.
- **Promotion target:** Agent instruction.
- **Status:** Candidate.

### Link persisted progress cards to the authoritative job status

- **Context:** A saved chat transcript displays progress for a local generation job that continues after the message is written.
- **Observation:** A persisted progress-card snapshot remained at `Preparing: 0` while the separate job panel completed its items. After linking the card to the live endpoint, an initial `pending` response still left it at `Generating: 0` because the client scheduled another poll only for `running`; the runner changed state after that first request.
- **Guidance:** Put the authoritative job ID in the validated progress-card payload and have an active card poll the existing job-status endpoint. Continue polling every nonterminal local status (`pending`, `running`, and `partial`), and stop only at a terminal status. Retain the persisted count as the fallback when that endpoint is unavailable; do not create a second progress source.
- **Evidence:** `lib/contracts/cards.ts`, `lib/application/card-factories.ts`, `lib/application/card-service.ts`, and `components/cards/card-registry.tsx`; `tests/unit/cards/card-registry.test.tsx` verifies terminal rendering and the `pending`-to-completed polling transition. The serial full suite passed 72 tests on 2026-08-08.
- **Promotion target:** Agent instruction.
- **Status:** Candidate.

### Keep batch gallery approval ergonomic while recording precise scope

- **Context:** A creator must review several paid reference or final-page images before the workflow can advance.
- **Observation:** Requiring a checkbox beside every image made the review checkpoint feel like data entry, even though the server still needs durable evidence of which individual assets were approved.
- **Guidance:** Present every image with a single, clearly named approval action after review. On that action, record the individual asset/page approval scopes server-side in the same authoritative transition instead of weakening approval traceability.
- **Evidence:** `components/cards/card-registry.tsx` presents one gallery action; `lib/application/card-service.ts` persists the individual scopes; `tests/integration/artifact-workflow.test.ts` and `tests/e2e/golden-path.spec.ts` cover the grouped approval path.
- **Promotion target:** Documentation.
- **Status:** Candidate.

### Record a safe provider boundary before awaiting background generation

- **Context:** A local persisted job runner awaits external image-provider requests one item at a time.
- **Observation:** A terminal model-call record is written only after a provider request returns. If that request throws or remains unresolved, the saved item can stay `running` without enough evidence to distinguish a provider wait from an application failure.
- **Guidance:** Before calling the provider, record a safe job/item event with runtime, model, operation, and reference count; write periodic waiting heartbeats and a terminal success/failure event. Persist the trail under the local data root and convert a thrown item into a saved failure that stops the sequential batch for user-directed recovery. Never record prompts, image bytes, credentials, or arbitrary provider response bodies.
- **Evidence:** `lib/jobs/generation-diagnostics.ts`, `lib/application/generation-service.ts`, `lib/jobs/runner-bootstrap.ts`, and `tests/integration/generation-diagnostics.test.ts`; the test verifies the provider exception and waiting heartbeat, the saved failed item, and preservation of the following pending item. The full 80-test suite passed on 2026-08-08.
- **Promotion target:** Agent instruction.
- **Status:** Candidate.

### Make the manager's actual tool list match workflow eligibility

- **Context:** A manager routes among structured specialists whose input schemas differ, including stages that can expose more than one specialist.
- **Observation:** Supplying a filtered skill list only in the manager prompt was insufficient when the real manager agent still registered every stage-level tool. It selected a Story Plan quality specialist at Final Pages, whose required `storyPlan` input was unavailable, and the schema failure escaped before a specialist ledger record existed.
- **Guidance:** Determine eligibility in application code from both stage and operation, build the manager agent with exactly that eligible tool set, and reject any returned route outside it before input parsing. Record input/output schema failures as failed model calls and surface them as typed recoveries rather than terminal chat errors.
- **Evidence:** `lib/application/manager-service.ts`, `lib/agents/openai-manager-runtime.ts`, and `lib/agents/manager.ts`; `tests/integration/manager-contracts.test.ts` covers Final Pages and Story Plan eligibility, while the full 70-test suite and 12 agent fixtures passed on 2026-08-08.
- **Promotion target:** Agent instruction.
- **Status:** Candidate.

### Route recovery to the component that owns the incomplete workflow state

- **Context:** A typed recovery card appears after an artifact transition, where the next state may be owned by a persisted job rather than a manager-routed specialist.
- **Observation:** An approved Page Plan with no persisted page-generation job reached the Final Pages stage. The generic retry sent the stage through the Final Pages specialist, which correctly rejected its missing `finalPages` input and produced an endless retry loop.
- **Guidance:** Determine recovery from persisted artifact and job state. When the Page Plan is approved but Final Pages are absent, create or reuse the idempotent page job and show its authoritative progress instead of invoking the manager. If creating the job fails, retain a named generation-start recovery card that preserves the approved plan.
- **Evidence:** `lib/application/card-service.ts` routes this state to `GenerationService.createPageJob`; `tests/integration/booklets.test.ts` recreates the approved-Page-Plan/no-job state and verifies that retry creates a page job without manager or specialist calls. The full suite passed 71 tests on 2026-08-08.
- **Promotion target:** Agent instruction.
- **Status:** Candidate.

### Keep provider selection separate from explicit image quality controls

- **Context:** A local generative-image workflow supports deterministic fake images and configured-quality real images across models with different edit capabilities.
- **Observation:** Combining provider choice, transport optimization, output quality, and input fidelity in one `fast` mode obscured the actual request and introduced hidden page-quality overrides. Output `quality` is valid for generation and editing, while `input_fidelity` is edit-only and model-dependent; `gpt-image-2` rejects it because high input fidelity is already the default.
- **Guidance:** Keep provider mode limited to fake/real and expose `disabled|low|high` quality independently. Persist that explicit setting without content-specific overrides. Omit both API controls when disabled; otherwise send `quality` for all requests and matching `input_fidelity` only for edits on a documented supporting-model allowlist. Unknown or unsupported models should omit input fidelity safely.
- **Evidence:** `lib/config/env.ts`, `lib/application/generation-service.ts`, and `lib/images/openai-image-provider.ts`; focused tests verify provider-mode rejection, disabled omission, low/high output quality, supported edit fidelity, and `gpt-image-2` fidelity omission. A live `gpt-image-2` edit previously rejected `input_fidelity` with HTTP 400; the full 86-test suite and production build passed on 2026-08-08.
- **Promotion target:** Agent instruction.
- **Status:** Candidate.

### Separate provider-native request sizes from final composition canvases

- **Context:** A booklet supports square, 5:4 landscape, and 4:5 portrait output while configured GPT Image models may accept only fixed native request sizes.
- **Observation:** Requesting final canvas dimensions such as `1536x1536` directly caused a provider HTTP 400 on a fixed-size model, even though those dimensions are valid for the application’s composed asset. The supported native sizes do not exactly match every final booklet ratio.
- **Guidance:** Declare and test a provider-specific geometry map independently from final canvas dimensions. Request `1024x1024`, `1536x1024`, or `1024x1536`, then normalize to the approved final canvas with crop/pad/resize that preserves aspect ratio and never stretches. Keep both contracts explicit so changing a provider does not silently change PDF geometry.
- **Evidence:** `lib/images/openai-image-provider.ts`, `lib/composition/compose-page.ts`, and their focused tests verify all three request mappings and all three final canvases; the full 86-test suite and production build passed on 2026-08-08.
- **Promotion target:** Agent instruction.
- **Status:** Candidate.

### Make every sequential batch failure a user-controlled pause

- **Context:** A persisted sequential batch generates paid images and must preserve completed work when any provider or application error occurs.
- **Observation:** Automatic retries and loop continuation let one deterministic provider error consume several attempts and then fail later pages. Restart recovery could also reclaim a later pending item unless saved failures were checked before the next claim.
- **Guidance:** Stop the batch after every failed item, keep later items pending, and never auto-retry. Retry must generate only the selected failed item and leave the job `paused`; when no failed or running items remain, require an explicit Continue action before claiming pending work. Recovery after restart must preserve `paused` jobs and make a formerly `running` job halt when it discovers an existing failed item. Completed assets must remain untouched throughout.
- **Evidence:** `lib/application/generation-service.ts`, `db/repositories.ts`, `components/cards/card-registry.tsx`, `components/workspace/job-progress-panel.tsx`, and `app/api/jobs/[jobId]/continue/route.ts`; `tests/integration/generation-diagnostics.test.ts` verifies stop, single-item retry, pause, and explicit continuation, `tests/integration/restart-resume.test.ts` verifies restart semantics, and `tests/unit/cards/card-registry.test.tsx` verifies Retry and Continue states. The full suite passed 80 tests on 2026-08-08.
- **Promotion target:** Agent instruction.
- **Status:** Candidate.

### Share one poller when multiple views observe the same job

- **Context:** A workspace renders the same persisted job in both a global progress panel and a conversation progress card.
- **Observation:** Giving each view its own timer produced two simultaneous requests to the same status endpoint every two seconds.
- **Guidance:** Coordinate polling by resource identity outside individual views so subscribers share one in-flight request, cached status, and timer. Poll running work frequently enough for useful feedback, back off for non-running states, and publish action responses through the same coordinator so every subscriber updates immediately.
- **Evidence:** `components/workspace/job-status-poller.ts`, `components/workspace/job-progress-panel.tsx`, and `components/cards/card-registry.tsx` share one poller per job with 5-second running and 15-second idle intervals; `tests/unit/workspace/job-status-poller.test.ts` verifies subscriber deduplication and cadence, and the full 81-test suite passed on 2026-08-08.
- **Promotion target:** Agent instruction.
- **Status:** Candidate.

### Resolve selective image regeneration from current server-owned lineage

- **Context:** A gallery lets a user regenerate one page or canonical reference, optionally by editing the current image with a correction instruction.
- **Observation:** Sending only an asset ID from a persisted gallery is insufficient because old cards can become stale and a failed replacement must not erase the working image. Resolving a typed page/reference target against the current artifact provides both authorization scope and the correct edit target.
- **Guidance:** Put typed regeneration metadata on new gallery items, reject generic asset targets, and resolve every target server-side against the booklet’s current artifact. Create a one-item persisted job, reserve provider input capacity for the edit target, and publish the new asset into a revised artifact only after generation succeeds; otherwise retain the active asset unchanged.
- **Evidence:** `lib/contracts/regeneration.ts`, `lib/application/revision-service.ts`, `lib/application/generation-service.ts`, and `tests/integration/specification-page-plan.test.ts`; the integration test regenerates one instructed page, and verifies all unrelated pages retain their asset IDs.
- **Promotion target:** Agent instruction.
- **Status:** Candidate.

### Keep Server Action result owners mounted until observers receive the outcome

- **Context:** A React workspace conditionally swaps forms, action controls, and read-only views while a Server Action revalidates the route.
- **Observation:** Hiding a direct action as soon as its state changed, or keying an edit form by a revision that changes on save, unmounted the component before its result effect could publish the success banner and selection reconciliation.
- **Guidance:** Keep the `useActionState` owner mounted through result delivery and use stable record identity for its key. Let the controller change modes only after it receives the action result; then reconcile against refreshed server props. Do not keep stale forms mounted after delivery.
- **Evidence:** `components/admin/agents/agent-action-dialog.tsx`, `components/admin/agents/agent-version-workspace.tsx`, and `components/admin/agents/agent-admin.tsx`; focused Chromium tests prove Save, Confirm, activation, retirement, creation, and fork results reach the workspace banner and preserve deterministic selection. The full 116-test suite and eight browser scenarios passed on 2026-08-15.
- **Promotion target:** React/Next.js implementation guidance.
- **Status:** Candidate.

### Serialize operations that share a MongoDB transaction session

- **Context:** Official MongoDB Node.js driver repositories read or update several collections inside one transaction.
- **Observation:** Running `Promise.all` operations with the same `ClientSession` produced transaction-number conflicts in a single-node replica set; the same reads succeeded when awaited sequentially.
- **Guidance:** Never parallelize driver operations that share one transaction session. Await each operation in order inside `withTransaction`; parallelize only independent work outside that session.
- **Evidence:** `db/agent-repository.ts` performs snapshot and lifecycle reads sequentially. `tests/integration/agent-management.test.ts` verifies concurrent edits, forks, activation, repair, and deletion; the full 127-test suite passed against `MongoMemoryReplSet` on 2026-08-16.
- **Promotion target:** Agent instruction.
- **Status:** Candidate.
### Use one destructive reset for a disposable POC baseline

- **Context:** A local POC intentionally does not preserve database history, operator customizations, generated assets, or schema compatibility between experiments.
- **Observation:** Separate setup, initialization, seed, and migration-report flows made an old database appear usable while leaving obsolete indexes and nullable fields inconsistent with the current runtime. A single reset correctly rebuilt the configured `kids_booklet` database with 10 active agents, 3 styles, 4 seed assets, and no unresolved URIs.
- **Guidance:** Expose one explicit destructive reset command that validates `DATA_ROOT`, drops application data, removes generated files, recreates exact indexes, seeds current agents/assets, and invokes integrity verification. Keep the reset implementation reusable for isolated tests; do not add backfills or old-workspace repairs.
- **Evidence:** `db/reset.ts`, `scripts/reset-mongodb.ts`, and `tests/integration/mongodb-foundation.test.ts` verify reset against populated disposable stores and a second identical reset. `npm run db:reset` and `npm run db:verify` passed against the configured local POC database on 2026-08-23.
- **Promotion target:** Documentation.
- **Status:** Candidate.
