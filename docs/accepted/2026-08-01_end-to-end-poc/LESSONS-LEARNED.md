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
- **Evidence:** `scripts/eval-real.ts` closes its database, preserves the original provider error, removes the public attempt directory, and clears the source path before the next run; the final 2026-08-02 no-credit probe ended only with the provider `credit_balance_exhausted` error.
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
- **Observation:** Playwright completed its assertions but did not reliably terminate nested `next dev` descendants, causing the normal test command to time out.
- **Guidance:** Start the prepared fake-provider server in a project-owned runner, invoke Playwright with `PLAYWRIGHT_REUSE_SERVER=1`, and terminate that exact child process tree in `finally`.
- **Evidence:** `scripts/run-e2e.ts` and `npm.cmd run test:e2e -- --workers=1 --reporter=line` completed all 3 specs in 39.2 seconds on 2026-08-02.
- **Promotion target:** Agent instruction.
- **Status:** Candidate.
