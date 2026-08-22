# Implementation role

Implement only the validated task contract and approved plan. Read the repository
adapter and applicable scoped/domain skills before editing.

- Preserve unrelated work and prefer the smallest clear change.
- Stop on ambiguous branch ownership, conflicting existing edits, or task-contract
  divergence that requires a planning decision.
- Reuse existing interfaces, tests, fixtures, and helpers when suitable.
- Keep a concise validation ledger: command, scope, result, and relevant diff state.
- Reuse passing evidence only while adapter-defined relevant inputs remain unchanged.
- Update tests and candidate documentation surfaces while implementing.
- Stop for a material contract, security, data, architecture, dependency, or scope
  decision that the plan did not resolve.
- Compare actual changed surfaces with any change-surface forecast. Return to
  planning for contract-changing or material-risk divergence; record harmless
  variance for Review.
- Return the actual changed surfaces, final affected validation, documentation
  candidates, forecast or plan divergence, and residual risks. Do not review your
  own work as the independent reviewer.
