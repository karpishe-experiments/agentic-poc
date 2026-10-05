# Lessons learned

Keep only verified, reusable lessons. This file does not mark M0 complete.

## Candidates

### Publish complete asset bytes before recording completion

- **Context:** An image operation stores original bytes at an immutable attempt URI.
- **Observation:** A direct exclusive filesystem write can leave a partial final
  file on interruption. Atomic publication from a complete sibling temporary file
  prevents that failure; competing writes retain one winner without overwriting it.
- **Guidance:** Publish complete bytes without clobbering an existing asset, then
  verify their digest before recording database completion. Recovery reuses the
  original operation and bytes without another provider request. Record each
  failure when it occurs, not from mutable run timestamps during recovery.
- **Evidence:** [Atomic filesystem tests](../../../tests/unit/filesystem-asset-store-atomic.test.ts)
  and [image-storage tests](../../../tests/integration/experiment-runner-image-storage.test.ts).
- **Promotion target:** Asset and recovery documentation. These are local tests,
  not live Dify binary-transfer evidence.

### Preserve subject identity independently of names and array order

- **Context:** Draft cast/location lists become manuscript sources and final lists.
- **Observation:** A cast rename and reordered proposal retain Booklet-owned IDs
  when versions match entries by stable `entryKey`. Rebuilding the manuscript
  retains unit IDs by `unitKey`; dependency edges invalidate the final lists
  without changing the unrelated location draft.
- **Guidance:** Assign IDs during transactional materialization, not in model
  proposals. Match stable keys, validate references against current approved
  sources, and preserve earlier versions instead of replacing evidence.
- **Evidence:** [M2 narrative tests](../../../tests/integration/experiment-runner-m2-narrative.test.ts).
- **Promotion target:** Persistence and artifact-contract documentation. This is
  local fixture proof; live M2 execution remains a separate checkpoint.

### Validate HTTP body fields against a live callback

- **Context:** Generated HTTP nodes in Dify Community 1.17.1.
- **Observation:** A raw-text body item with `text` passed graph preparation but
  sent an empty HTTP body. The first live tester callback returned HTTP 400.
- **Guidance:** Use the supported `value` field and check both authorization and
  result selectors. A successful HTTP node can still contain an error response;
  inspect the HTTP status and saved callback outcome.
- **Evidence:** Dify run `54f72080-9a7d-4316-b7a0-068f195dbc93` and
  [graph regression](../../../tests/unit/experiment-runner-workflow-graph.test.ts).
- **Promotion target:** Integration documentation; verified on this pinned release.

### Preserve answered questions and interrupted revisions in saved context

- **Context:** Local J01/J02 specialists run as separate operations, with an
  external tester answering clarification questions.
- **Observation:** Saving an answer is insufficient if the next specialist sees
  only the original brief. A revision also needs its target and instruction
  retained while clarification waits for an answer.
- **Guidance:** Reconstruct relevant question/answer pairs from saved operations
  and decisions. Suspend and restore the same revision after the exact answer;
  do not debit the revision allowance again.
- **Evidence:** Restarted specialist context and revision/clarification tests in
  [context tests](../../../tests/integration/experiment-runner-context.test.ts)
  and [narrative tests](../../../tests/integration/experiment-runner-narrative.test.ts).
- **Promotion target:** Integration documentation. Live Dify behavior remains
  unverified for this slice.

### Carry explicit lineage when inspected tool traces omit child run IDs

- **Context:** Community 1.17.1 workflow-tool calls.
- **Observation:** Inspected native manager nodes report provider IDs, not child
  run IDs. A deterministic caller can pass its system run ID and correlation into
  the child; the child can return its own system run ID. Independent saved-run
  reads confirm the exact relationship without timestamp matching.
- **Guidance:** Retain and validate that explicit envelope with the application
  operation. Use distinct operation IDs for revisions and retries. Do not claim
  native trace linkage or application persistence from a transport probe.
- **Evidence:** [M0 lineage proof](M0-readiness.md#explicit-parentchild-lineage-proof--2026-10-03),
  parent `fbff27e2-634f-45fa-8558-e8ea981e99a5` and its independently read children.
- **Promotion target:** Integration documentation; runner contract guidance.

### Verify runtime access separately from administrative access

- **Context:** A Booklet runtime calls a Dify workflow with an application API key.
- **Observation:** The deployed diagnostic probe completed through an authenticated
  callback and a separate Booklet result lookup using runtime credentials.
  Administrative MCP discovery alone did not establish that path. A separate
  staging fault discarded the successful start response before parsing its IDs;
  the callback retained the ID and GET recovered the saved result without a
  replacement POST. This does not establish recovery without a retained ID.
- **Guidance:** Verify application execution, persisted callback identity and
  runtime-key lookup together. Retain correlation and run IDs. Test lost-response
  recovery separately; a successful ordinary lookup does not prove interruption
  handling, and an unknown outcome is not permission to replay.
- **Evidence:** [M0 runtime integration handoff](M0-readiness.md#runtime-integration-handoff),
  ordinary run `18381193-b811-4809-a673-4784bf2d572f` (2026-10-03) and fault
  recovery run `eb586ddf-243d-40a5-8a45-27935cf9d653` (2026-10-04), independently
  retrieved with matching identifiers and zero tokens.
- **Promotion target:** Integration documentation.

### VPS releases snapshot master-owned Compose files

- **Context:** Independent `master` and `_staging` release lines on the shared VPS.
- **Observation:** Infrastructure sync transfers master's Compose files. The host's
  `prepare_release` copies those installed files into immutable per-commit releases;
  it does not obtain configuration from the application branch. A selective app port
  can therefore preserve its source defaults but still inherit different host defaults.
- **Guidance:** Compare both configuration sources before release. Correct and
  synchronize reviewed host defaults first, then create a new release snapshot.
  Do not expect redeploying an existing commit to replace its saved configuration.
- **Evidence:** `sync_host_configuration` and `prepare_release` in
  [the dispatcher](../../../scripts/deploy/vps-deployment.sh);
  `preserves Cloud staging defaults in master-owned host configuration` in
  [deployment contracts](../../../tests/unit/deployment-contracts.test.ts).
- **Promotion target:** Deployment documentation; reflected in the canonical runbook.

### Published callers do not pin child Workflow Tool bindings

- **Context:** Dify Community 1.17.1; a published caller invokes separate workflows
  through Workflow Tools.
- **Observation:** Editing the child draft did not change the published caller.
  Publishing the child without tool synchronization also kept the old result.
  Refreshing the child tool changed the same pinned caller's result. Restoring,
  republishing and refreshing the child recovered the original result without
  rebuilding the caller or changing the provider ID.
- **Guidance:** Do not claim transitive version isolation from the caller version
  alone. Stop dispatch, reconcile active work, synchronize child tools, and retain
  effective child publication evidence for successor runs. Inspect a failed or
  uncertain refresh before retrying; publication alone is not synchronization.
- **Evidence:** [M0 binding-change and restoration results](M0-readiness.md#binding-change-and-restoration-evidence),
  including changed caller run `a383fb0b-160a-4f9c-b94d-31b8a5f54787` and restored
  caller run `1ffa1a98-2674-4c79-96db-2bb693c7b62f`; zero reported tokens.
- **Promotion target:** Documentation and the Dify operations skill.
- **Status:** Candidate; behavior was verified on this pinned release only.

### Unit checks do not prove server package initialization

- **Context:** Next.js 16.2.12, Zod 4.4.3 and the runner configuration imported
  by the root layout.
- **Observation:** Typecheck, lint and runtime tests passed, but the release build
  failed at `/_not-found` when Zod's bundled ISO/schema cycle accessed
  `ZodISODateTime` before initialization. A clean debug build reproduced the
  failure at `lib/contracts/common.ts:7`; native Node imports passed. The same
  checkout completed the ordinary build with only Zod added to
  `serverExternalPackages`. No dependency or validation rule changed.
- **Guidance:** Diagnose generated server initialization with a clean checkout
  and source-mapped failure. For this verified package cycle, retain native
  server loading rather than weakening schemas or changing the whole bundler.
  PR validation stays non-build; the deployment build remains a separate gate.
- **Evidence:** [server configuration](../../../next.config.ts),
  [configuration regression](../../../tests/unit/next-config.test.ts), and
  [Next.js external-package contract](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages).
- **Promotion target:** Documentation; reverify before removing the workaround
  or changing Next.js/Zod versions. Linux container deployment remains the live
  release checkpoint.

### Studio validates output names across branches

- **Context:** Dify Community 1.17.1 workflows with separate completion and pause End nodes.
- **Observation:** Bridge validation and backend publication accepted duplicate
  End output names. Studio blocked publication until those names were unique
  across the graph. All six M1 checklists passed after each branch exposed only
  its consumed output.
- **Guidance:** Check global End output-name uniqueness in graph fixtures and
  verify the Studio checklist. Backend publication alone does not prove editor
  acceptance. Preserve the saved-completion acknowledgement gate when repairing
  branch outputs.
- **Evidence:** [graph regression](../../../tests/unit/experiment-runner-workflow-graph.test.ts)
  and [M1 draft repair](M1-runner.md#entry-and-manual-setup).
- **Promotion target:** Documentation; reverify for other Dify releases.

### Handler upload limits need proxy transport headroom

- **Context:** Image callbacks behind Next.js 16.2.12 proxy body cloning.
- **Observation:** The installed clone defaults to 10 MiB and truncates larger
  bodies before the handler's 20 MiB validator. A 32 MiB transport setting
  preserves an allowed 20 MiB upload and lets the handler reject a chunked
  20 MiB-plus-one-byte body with HTTP 413.
- **Guidance:** Test the framework transport as well as the route factory.
  Keep a bounded transport allowance above the application's content limit.
- **Evidence:** [transport regression](../../../tests/unit/experiment-image-proxy-body.test.ts)
  and [Next.js proxy limit](https://nextjs.org/docs/app/api-reference/config/next-config-js/proxyClientMaxBodySize).
- **Promotion target:** Documentation; reverify when Next.js or limits change.

### Maintenance must preserve callback recovery and finalization

- **Context:** A staging schema transition whose maintenance gate also rejects
  external workflow callbacks.
- **Observation:** A tracked-mutation count of zero does not prove the external
  operation ledger is idle. Closing admission can prevent unresolved work from
  completing. An interruption after admission reopens can also leave a journal
  whose ordinary resume path would incorrectly stop the running app.
- **Guidance:** Check external work before closing admission and again after drain,
  before stop. On a pre-change race, reopen admission while the app is still
  running. Record a finalization checkpoint before reopening admission; its resume
  must not replay stop, backup or mutation. Preserve the pre-change backup after
  the mutation checkpoint.
- **Evidence:** [Mongo ledger tests](../../../tests/integration/experiment-maintenance.test.ts)
  and [host interruption/race scenarios](../../../tests/shell/vps-host.test.sh).
  Focused local scenarios passed; complete Linux suites and live retirement remain
  separate verification gates.
- **Promotion target:** Documentation; reverify the admission and callback behavior
  before using this pattern for another runtime.

### A workflow failure does not prove that its callback did not save

- **Context:** An external workflow times out while an authorized callback is
  still running.
- **Observation:** Dify can report a failed run after its save-node read timeout.
  That status alone does not establish the callback's outcome. Clearing a claimed
  operation can prevent its late result from saving.
- **Guidance:** Classify the observation against the current persisted claim in
  the outcome transaction. Retain uncertain claimed operations and their identities;
  inspect the saved result before any replacement execution. Reuse expensive source
  verification only within one transaction attempt, never across requests or retries.
- **Evidence:** [outcome transaction](../../../db/experiment-repository.ts),
  [pagination completion](../../../db/experiment-narrative.ts), and
  [retained live failure](M3-completion.md#j11-dify-preparation-package).
- **Promotion target:** Documentation; verify the callback and runtime recovery
  interfaces before applying this pattern to another integration.
