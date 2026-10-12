# Validation selection

`selection.mjs` owns path classification. Rules are additive; unknown files select
application checks, not unrelated infrastructure. `validate.mjs` handles Git comparison, fixed Actions outputs,
test execution, and summaries. It requires no dependencies to calculate scope.

PRs compare the base SHA to the checked-out merge SHA. Manual `full` runs all
non-build checks. Manual `affected` requires `base_ref` and compares its merge base
to the selected commit. Invalid refs fail. Renames classify both paths.

| Area | Checks |
| --- | --- |
| Markdown, agent guidance, documentation images | Summary only |
| Dify OpenAPI/illustration DSL | Pure document contracts |
| Dify runtime and other experiment artifacts | Static checks and selected unit contracts |
| Isolated mockup | Static checks and mockup tests |
| Changed tests | Static checks and named unit tests; integration tests are deferred from PR CI |
| Browser tests | Static checks and discovery only |
| Agent fixtures | Agent fixture runner |
| Deployment/Compose/shell | Deployment contracts and shell suites |
| Workflow/action | Actionlint and deployment contracts |
| Terraform | Affected root format, validation, and tests |
| Shared application, dependencies/configuration, unknown paths | Static checks, unit suite, agent fixtures |
| CI selector/Validate workflow | Selector tests and Actionlint |

Routine PR CI never starts MongoDB or runs integration/persona campaigns.
`vitest.unit.config.ts` runs unit tests with fake providers and no database setup.
Pure contracts are not repeated in the unit selection. Mockup tests use their
separate configuration. Expected
missing tests fail. Tests use `--bail=1 --retry=0` and run sequentially.

Before pushing code, run the relevant unit tests locally with `npm run test:unit`
(append named unit files for a focused change). Run focused integration tests only
when changed persistence, authorization, recovery or other behavior needs that
proof. Reuse unchanged passes. CI is not a substitute for this local check.
Manual `affected` runs unit checks and explicitly changed integration files;
it does not infer a full integration campaign from shared source changes.
Manual `full` retains all application/integration and acceptance checks. Use it
only when a release needs broad proof not already supplied by current evidence.

Validation never runs a production or container build. Deploy builds or reuses the
immutable release image before contacting the VPS. Build-only errors are therefore
detected after merge. Browser discovery does not establish browser runtime success.

Run selector checks with `node --test scripts/ci/selection.test.mjs`.
The workflow stores selection and reasons in runner temporary storage and prints
them before running checks. Superseded PR validation is cancelled; host operations
retain their non-cancelling concurrency group.

Full validation skips the optional mockup suite on branches where neither its
configuration nor its test/source directories exist. Existing mockup sources
without their configuration remain a validation error.
Dify document changes use summary-only validation on docs-only branches where
both the runtime and Dify test suite are absent. When the runtime exists,
a missing expected contract test still fails.
