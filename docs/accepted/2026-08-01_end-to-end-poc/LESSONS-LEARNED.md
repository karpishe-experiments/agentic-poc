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
