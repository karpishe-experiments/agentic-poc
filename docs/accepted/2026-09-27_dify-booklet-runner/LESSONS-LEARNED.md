# Lessons learned

Keep only verified, reusable lessons. This file does not mark M0 complete.

## Candidates

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
