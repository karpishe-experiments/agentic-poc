# Lessons learned

Keep only verified, reusable lessons. This file does not mark M0 complete.

## Candidates

### Verify runtime access separately from administrative access

- **Context:** A Booklet runtime calls a Dify workflow with an application API key.
- **Observation:** The deployed diagnostic probe completed through an authenticated
  callback and a separate Booklet result lookup using runtime credentials.
  Administrative MCP discovery alone did not establish that path.
- **Guidance:** Verify application execution, persisted callback identity and
  runtime-key lookup together. Retain correlation and run IDs. Test lost-response
  recovery separately; a successful ordinary lookup does not prove interruption
  handling, and an unknown outcome is not permission to replay.
- **Evidence:** [M0 runtime integration handoff](M0-readiness.md#runtime-integration-handoff),
  operator result dated 2026-10-03, run `18381193-b811-4809-a673-4784bf2d572f`.
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
