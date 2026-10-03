# Lessons learned

Keep only verified, reusable lessons. This file does not mark M0 complete.

## Candidates

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
