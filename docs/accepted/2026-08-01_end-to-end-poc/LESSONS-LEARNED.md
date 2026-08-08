# Lessons learned

Keep only verified, reusable lessons. Merge or revise existing entries instead of recording duplicates.

## Candidates

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

### Keep native libSQL integration databases in OS temporary storage on this Windows host

- **Context:** Vitest integration tests that run checked-in migrations against a native libSQL file database on Windows.
- **Observation:** Closing the libSQL client did not release the temporary database file before Vitest teardown; immediate deletion repeatedly failed with `EBUSY` even after retrying. The integration assertions and client close succeeded.
- **Guidance:** Create these disposable migration fixtures under the operating system temporary directory and close the client after each test. Do not couple test correctness to immediate Windows file deletion; keep project data out of the fixture path.
- **Evidence:** `tests/integration/booklets.test.ts` uses `mkdtemp(os.tmpdir())` and closes `database.$client`; the focused test passed on 2026-08-01 after teardown stopped deleting the host-held file.
- **Promotion target:** Documentation.
- **Status:** Candidate.

### Clear failed evaluation SQLite data from the next process on Windows

- **Context:** A retained-evaluation script creates a real local libSQL database and must clean up a failed attempt without deleting successful retained evidence.
- **Observation:** Closing the client and immediately removing its SQLite file in the same Node process still produced `EBUSY`; the error could mask the provider failure that caused cleanup.
- **Guidance:** Remove only the public failed-run directory in the failing process. Before the next attempt creates its database, clear the ignored source-data directory after the previous Node process has exited and released the Windows handle.
- **Evidence:** `scripts/eval-real.ts` closes its database, preserves the original provider error, removes the public attempt directory, and clears the source path before the next run; the initial 2026-08-02 no-credit probe ended only with the provider `credit_balance_exhausted` error.
- **Promotion target:** Agent instruction.
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

- **Context:** A request handler can create and immediately run a generation job while the in-process restart runner is polling the same local database.
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

### Render reader-facing text with Sharp's explicit font file input

- **Context:** Composing local final-page PNGs from an SVG overlay on this Windows host.
- **Observation:** SVG font-family declarations fell back to a serif font even when the Nunito TTF was embedded; Sharp's text input with `fontfile` rendered the bundled Nunito correctly.
- **Guidance:** Use Sharp text rendering with the checked-in font file for required reader typography, then composite the raster text layer. Visually inspect a rendered PDF instead of trusting the declared CSS font family.
- **Evidence:** `lib/composition/compose-page.ts`, `tests/unit/composition/compose-page.test.ts`, and Poppler-rendered `tmp/font-check.png` verified on 2026-08-02.
- **Promotion target:** Agent skill.
- **Status:** Candidate.

### Own the Playwright server lifecycle on Windows

- **Context:** Running an isolated Next.js development server for desktop Playwright checks through PowerShell on Windows.
- **Observation:** Playwright completed its assertions but did not reliably terminate nested `next dev` descendants, causing the normal test command to time out. Parallel browser workers also contended for the one isolated SQLite database and produced `SQLITE_BUSY`.
- **Guidance:** Start the prepared fake-provider server in a project-owned runner, invoke Playwright with `PLAYWRIGHT_REUSE_SERVER=1`, terminate that exact child process tree in `finally`, and allow a configurable isolated port when a developer already uses the default. Keep `workers: 1` unless the test harness gives every worker an independent database.
- **Evidence:** `scripts/run-e2e.ts`, `scripts/e2e-server.ts`, and `playwright.config.ts`; the three serial specs passed on 2026-08-03 without touching a pre-existing developer server.
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
- **Observation:** A persisted progress-card snapshot remained at `Preparing: 0` while the separate job panel completed its items, which made the otherwise successful real booklet flow look stalled.
- **Guidance:** Put the authoritative job ID in the validated progress-card payload and have an active card poll the existing job-status endpoint. Retain the persisted count as the fallback when that endpoint is unavailable; do not create a second progress source.
- **Evidence:** `lib/contracts/cards.ts`, `lib/application/card-factories.ts`, `lib/application/card-service.ts`, and `components/cards/card-registry.tsx`; `tests/unit/cards/card-registry.test.tsx` verifies live rendering, and the full 66-test suite plus the real remediation booklet passed.
- **Promotion target:** Agent instruction.
- **Status:** Candidate.

### Keep batch gallery approval ergonomic while recording precise scope

- **Context:** A creator must review several paid reference or final-page images before the workflow can advance.
- **Observation:** Requiring a checkbox beside every image made the review checkpoint feel like data entry, even though the server still needs durable evidence of which individual assets were approved.
- **Guidance:** Present every image with a single, clearly named approval action after review. On that action, record the individual asset/page approval scopes server-side in the same authoritative transition instead of weakening approval traceability.
- **Evidence:** `components/cards/card-registry.tsx` presents one gallery action; `lib/application/card-service.ts` persists the individual scopes; `tests/integration/artifact-workflow.test.ts` and `tests/e2e/golden-path.spec.ts` cover the grouped approval path.
- **Promotion target:** Documentation.
- **Status:** Candidate.
