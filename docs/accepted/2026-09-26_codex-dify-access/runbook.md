# Codex access to Dify — issue #66

Canonical operating guide and evidence register for
[#66](https://github.com/karpishe-experiments/agentic-poc/issues/66), prerequisite to
[#65](https://github.com/karpishe-experiments/agentic-poc/issues/65).

**Incomplete:** authenticated control, fresh-session MCP discovery, and live probe
repair/publication/recovery remain unverified. Installation is not completion.

## Scope

Use the existing Dify Cloud workspace. Preserve the Booklet manager, Story Writer,
illustration workflow and completed two-attempt experiment. Use uniquely named
`issue66-probe-` resources within available capacity. Do not delete existing apps
to make space. No deployment, infrastructure, self-hosting, plan upgrade, or image
generation is included. MCP is primary, official CLI descriptors are the first
fallback, and Codex browser automation covers verified gaps. Repeated operator
clicks during ordinary runs are not an unattended fallback.

## Verified local baseline — 2026-09-26

| Component | Evidence |
| --- | --- |
| Bridge | `alexjiaguo/dify-mcp` 0.3.0, clean source at `f2e6c7590a44e5b5dbeab358bf8f14b5b9cfef2a` |
| Runtime | Node `v24.21.0`; `bin/difywf.js` delegates to `src/cli.ts` |
| Lock SHA-256 | `62fbd9c0cc890a055a815a66065d8fa7bd577b4c61f6df91697a1f6ce7b88803` |
| Checks | Typecheck and 114/114 tests passed; stdio smoke discovered 172 tools, called guide/validation, and rejected unconfirmed deletion |
| Isolation | Tests used a new temporary `DIFYWF_HOME`, not operational credentials |
| State ACL | `%LOCALAPPDATA%\DifyWf-Codex`: current account, SYSTEM, Administrators only, FullControl; no credential file existed at inspection |
| Official CLI | `difyctl` 1.17.1, commit `8387590ace4a094de812b7847fc6a4c3a27cd52b`, Windows x64 |
| Binary SHA-256 | `13d38e0a0061eec6e25cfdf3aa287743d468d186a09621fa92de3550a1dc96e0`, matched release checksum manifest before execution |
| Compatibility | Declared server range `>=1.16.0, <=1.17.1`; Cloud version unknown. Version command reported unreadable hosts file, not a compatibility pass |
| CLI skill | Inspected `skills install --stdout`, installed only in `.agents/skills/difyctl`; next-turn skill catalog discovery observed |
| Skill validation | Both skills passed the system skill-creator validator with PyYAML 6.0.3 in an isolated temporary environment |
| Browser inventory | `Uniwares's Workspace`, Sandbox; Studio lists Story Writer and illustrator. Billing meter shows 2/5 Build Apps. This does not establish a separate New Agent quota. |

The official generated skill is unchanged; its upstream license is retained.
`skills-lock.json` records source, version/ref, and entrypoint SHA-256.
`dify-operations` is project-owned. Do not install self-hosted Community operating
skills or Dify source-development skills for this Cloud task.

## Security assessment

With `DIFYWF_HOME`, the bridge stores credentials as plaintext JSON in `hosts.json`.
Windows ACLs, not Unix mode flags, protect these files. Check each new credential
file's ACL. Keep exports/backups outside Git in private storage. Do not print the
store or pass secrets in MCP arguments. Audit logs mask sensitive argument keys
and record outcome codes; complete tool responses/error details are not uniformly
redacted. Retrieve credential metadata only and sanitize retained evidence.

The HTTP client uses Node fetch against a configured host. Restrict it to
`https://cloud.dify.ai`; inspect artifact destinations before use. Cookie refresh
can retry once after 401. Inspect uncertain mutation state before repeating it.
Keep operational transport stdio; no HTTP listener.

`npm audit` reports five affected packages, two high and three moderate (multiple
advisories per package). No automatic dependency fix was applied:

| Dependency | Installed | Applicability / containment |
| --- | --- | --- |
| `fast-uri` | 3.1.4 | High URI interpretation findings through SDK/Ajv; stdio does not remove schema exposure. Use inspected local schemas and fixed HTTPS host; do not trust URI normalization as an authorization boundary. |
| `ip-address` | 10.2.0 | High classification findings through express-rate-limit; inbound HTTP is not enabled. Do not use address classification to authorize destinations. |
| `@hono/node-server` | 1.19.14 | Moderate Windows static-path traversal; no static HTTP server is used. |
| `hono` | 4.12.31 | Moderate middleware/SSR/parser findings; no server, SSR, or static generation is used. |
| `qs` | 6.15.3 | Moderate parsing/DoS findings through Express; no HTTP parser is exposed. |

This bounded assessment is not a claim that dependencies are safe. Reassess before
adding HTTP transport, untrusted schemas, or destinations. Consult the pinned tree
and current `npm audit` records; do not upgrade silently.

## Connection and recovery checkpoints

1. Inspect the registered `mcp_servers.dify` command, wrapper and allowlisted
   environment fields without dumping the full Codex config. Confirm the pin and
   dedicated `DIFYWF_HOME`; no secret belongs in repository configuration.
2. Operator handoff: save an auth-cookie export privately at
   `%LOCALAPPDATA%\DifyWf-Codex\cookies.json`. Check its ACL without displaying it.
   Inspect the pinned wrapper's auth command, then use `auth import-cookies` with
   `--base-url https://cloud.dify.ai` and `--file` pointing to that file. No cookies
   in chat or argument values. Remove the input export only with appropriate authority.
3. Verify account, exact workspace ID, permissions and capacity read-only before
   mutations. Browser login does not establish MCP authentication.
4. Restart Codex in the interface for #65. Verify both skills and callable Dify MCP
   tools, then authenticated inventory. Record evidence here. A subprocess stdio
   handshake does not satisfy fresh-session discovery.
5. For CLI fallback, read `difyctl help -o json --compact` and the selected
   `difyctl help <path> -o json`. Use the documented browser device login with an
   operator handoff. Prove Cloud compatibility read-only before mutations; do not
   bypass TLS checks. The CLI binary is at `%LOCALAPPDATA%\difyctl\bin\difyctl.exe`
   on this workstation; use a resolved executable rather than assuming PATH.

On expiry, stop writes, reauthenticate privately, then recheck workspace and targets.
Revoke sessions through the service's session controls; inspect CLI
`auth devices revoke` before using it. Local logout or deleting a file does not
prove server-side revocation. Cookie-session and CLI-device revocation remain live
verification checkpoints. For uncertain operations, inspect current state/run IDs
before retrying. Never infer that a lost response means no paid call occurred.

## Capability matrix

Pending means no successful issue #66 live probe. Source/tests establish candidate
interfaces only. Cloud server version is unknown.

| Operation / target | Interface / version | Outcome and evidence | Fallback / next check |
| --- | --- | --- | --- |
| Local schema validation | MCP stdio 0.3.0 | Passed guide/validation/confirmation gate; 172 tools | Fresh-session tools absent so far |
| CLI discovery / skill | difyctl 1.17.1 | Passed sitemap, descriptors and installation | Cloud auth/compatibility pending |
| Existing illustration workflow | Codex Chrome | Read-only `booklet_illustrator` page showed published state and existing provider binding | Exact workspace/permissions/capacity inventory pending |
| Workspace / apps / integrations | MCP workspace/app/plugin/provider operations | Pending authentication | Browser inventory; metadata only |
| Deterministic draft / defaults / validate / run | MCP workflow operations | Pending | Browser graph and test controls |
| Publish / Workflow as Tool | MCP publish / refresh | Pending; source tests cover creation and refresh, not Cloud proof | Browser Publish plus Workflow as Tool Save |
| Trace / output / files | MCP runs / workflow results | Pending | Browser Logs/tracing/download |
| New Agent configuration/publication | Browser | Pending; bridge agent operations do not prove full support | CLI descriptors lack full New Agent administration |
| OpenAPI / environment bindings | Browser custom tools / MCP workflow variables | Pending | Non-secret probe only |
| Workflow restoration | MCP restore or saved draft sync | Pending | Browser restore/import; check identity |
| New Agent recovery, files/skills | Browser reconstruction if no native restore | Pending | Record changed IDs and rebind dependants |
| Expiry / permissions / capacity / interruption | Interface errors and read-back | Pending live evidence | Do not alter existing permissions to create failures |
| Simulated / balanced / real control | Probe configuration | Pending | #65 budgets remain separate |

## Disposable probe sequence

Record target, version, run IDs, outcomes and usage as each checkpoint succeeds.
Do not mark a capability verified from its advertised name.

1. Inventory existing resources, verify capacity, and create one uniquely named
   deterministic workflow with no model/image nodes. Retain original DSL privately
   with digest and target ID. Fetch defaults, validate, preview and synchronize.
2. Run an `issue66-original` marker and inspect node outputs. Introduce one controlled
   failure, diagnose its node, repair it, and confirm the original result.
3. Publish and read back publication. Create/refresh Workflow as Tool, verify the
   bound version and published output. Verify creation and refresh separately.
4. Change output to `issue66-changed`; republish, synchronize and verify. Restore the
   backup; republish, synchronize and confirm the original result. A new app ID is
   reconstruction, not identity-preserving restoration.
5. Verify a harmless OpenAPI tool and non-secret environment update on probes.
   Reuse provider bindings without retrieving their values.
6. Create a separate New Agent; attach only deterministic probe tools and a harmless
   skill/file. Verify instructions, model binding, publication, traces and recovery.
   Never attach Booklet mutating tools or image providers.
7. Before real calls, obtain selected-model and aggregate monetary-ceiling approval.
   At most three short runs: initial, modified, restored. Bound steps and controllable
   retries. Three runs may involve more than three provider calls. Record actual
   usage or mark cost unknown. This guide does not authorize spending.
8. Verify actionable failures for expired auth, denied permissions, capacity and
   missing capabilities without changing existing permissions/resources. Inspect
   interrupted state before retry. A gap without a reliable fallback keeps #66 open.
9. Preserve evidence and private backups. List exact disposable IDs before requesting
   deletion confirmation; never delete by broad prefix.

## Publication and completion

Keep issue work on `agent/issue-66-dify-codex-access` with its same-named origin
upstream. Publish a reviewed PR to `master`; do not import staging runtime changes.
Validate skills, references, provenance, secrets and the final diff independently.
Required PR CI applies; no extra application build or deployment is required.
Update #66/#65 with reviewed SHA, PR, verified results and remaining gaps. Keep #66
open until every essential operation has a tested unattended path, including
fresh-session discovery and repair/publication/recovery.

## Sources

- [Pinned bridge](https://github.com/alexjiaguo/dify-mcp/tree/f2e6c7590a44e5b5dbeab358bf8f14b5b9cfef2a)
- [Official CLI installation](https://docs.dify.ai/en/cli/install)
- [Official skill installation](https://docs.dify.ai/en/cli/reference/skills)
- [Pinned CLI release](https://github.com/langgenius/dify/releases/tag/1.17.1)
- [Codex MCP configuration](https://developers.openai.com/codex/mcp)
