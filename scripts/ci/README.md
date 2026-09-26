# Validation selection

`selection.mjs` owns path classification. Rules are additive; unknown files select
all non-build checks. `validate.mjs` handles Git comparison, fixed Actions outputs,
test execution, and summaries. It requires no dependencies to calculate scope.

PRs compare the base SHA to the checked-out merge SHA. Manual `full` runs all
non-build checks. Manual `affected` requires `base_ref` and compares its merge base
to the selected commit. Invalid refs fail. Renames classify both paths.

| Area | Checks |
| --- | --- |
| Markdown, agent guidance, documentation images | Summary only |
| Dify OpenAPI/illustration DSL | Pure document contracts |
| Dify runtime and other experiment artifacts | Static checks and Dify tests |
| Isolated mockup | Static checks and mockup tests |
| Changed tests | Static checks and named tests; deleted tests select their suite |
| Browser tests | Static checks and discovery only |
| Agent fixtures | Agent fixture runner |
| Deployment/Compose/shell | Deployment contracts and shell suites |
| Workflow/action | Actionlint and deployment contracts |
| Terraform | Affected root format, validation, and tests |
| Shared application | Static checks, full application suite, agent fixtures |
| Dependencies, CI selector/configuration, unknown paths | All non-build checks |

Full application tests subsume Dify and deployment tests. Mockup tests use their
separate configuration. Pure contract selection does not start MongoDB. Expected
missing tests fail. Tests use `--bail=1 --retry=0` and run sequentially.

Validation never runs a production or container build. Deploy builds or reuses the
immutable release image before contacting the VPS. Build-only errors are therefore
detected after merge. Browser discovery does not establish browser runtime success.

Run selector checks with `node --test scripts/ci/selection.test.mjs`.
The workflow stores selection and reasons in runner temporary storage and prints
them before running checks. Superseded PR validation is cancelled; host operations
retain their non-cancelling concurrency group.
