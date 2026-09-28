# M0 deterministic probe and bridge patch

`m0-control-probe.json` is the sanitized Start → Code → End graph. It has no
provider nodes or credentials. IDs and observed results are in [M0](../M0-readiness.md).

`dify-mcp-issue65.patch` modifies `alexjiaguo/dify-mcp` 0.3.0 at commit
`f2e6c7590a44e5b5dbeab358bf8f14b5b9cfef2a`. Upstream is Apache-2.0 licensed;
retain its license and notices. The patch changes snippet root validation,
omits inherited environment fields during graph-only updates, and updates the
corresponding test expectation. It does not change authentication or dependencies.

Apply only to a separate copy of that pinned source, not to an unknown version.
Copy `issue65-compat.test.ts.txt` to its `test/issue65-compat.test.ts`, then run
`npm run typecheck`, `npm test` and `npm run smoke:mcp` with a temporary
`DIFYWF_HOME`. The `.txt` suffix keeps bridge tests out of Booklet's TypeScript
compilation. The verified candidate passed 118 tests and stdio smoke.

This is a retained compatibility candidate, not an installed system upgrade.
The original registered bridge remains unchanged. Fresh local-stdio MCP loaded
the isolated candidate for the recorded probe. System registration and fresh-session
discovery remain separate work. Do not use the known snippet run envelope/SSE
workaround for provider-bearing execution.
