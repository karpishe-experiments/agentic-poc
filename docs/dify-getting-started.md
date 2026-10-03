# Set up Codex access to Dify

This guide is for developers who operate the project's Dify Cloud workspace.
It is separate from running Booklet locally: no MongoDB credentials, VPS access,
Cloudflare tools, or provider API key is needed for these read-only access checks.
Use your own invited Dify account, not another developer's session or cookies.

The verified baseline is Windows x64, Node 24.21.0, official `difyctl` 1.17.1,
and third-party `dify-mcp` 0.3.0 at the commit below. Other platforms require their
matching binaries and permission checks; the Windows commands are not portable.
See the [operating runbook](accepted/2026-09-26_codex-dify-access/runbook.md)
for security findings, capabilities, and the remaining live verification work.

## 1. Prepare accounts and tools

- Install Git, Node 24, npm, and Codex with local MCP support. Open this repository
  in Codex so it discovers the checked-in `difyctl` and `dify-operations` skills.
  Do not reinstall or regenerate these pinned skills during onboarding.
- Ask the workspace administrator to invite your account and grant the permissions
  required for your assigned work. Owner access is not an onboarding requirement.
- Obtain the expected workspace ID from the administrator. The current project
  workspace is `98c18fae-e555-47f7-9869-5d602a3dca04` (Uniwares's Workspace).
- Use a private local terminal for authentication. Never paste tokens, cookies,
  device codes, credential files, or credential-bearing exports into Codex/chat/Git.

There are **two independent logins**. Official CLI device login does not authenticate
the MCP bridge. Neither login is a Booklet callback key, Dify app API key, or OpenAI key.

## 2. Install and authenticate the official CLI

Check PATH and `%LOCALAPPDATA%\difyctl\bin\difyctl.exe` before installing. Preserve
an existing installation; inspect its version instead of overwriting it.

For a fresh Windows x64 installation, download `difyctl-v1.17.1-windows-x64.exe`
and `difyctl-v1.17.1-checksums.txt` from the
[official 1.17.1 release](https://github.com/langgenius/dify/releases/tag/1.17.1).
Compare `Get-FileHash <downloaded-binary> -Algorithm SHA256` with the exact manifest
entry before executing it. Our verified binary hash is
`13d38e0a0061eec6e25cfdf3aa287743d468d186a09621fa92de3550a1dc96e0`.
Stop on a mismatch. Place the verified binary at
`%LOCALAPPDATA%\difyctl\bin\difyctl.exe`; create that directory if absent.
Do not run an unpinned remote installation script. This follows Dify's
[manual installation procedure](https://docs.dify.ai/en/cli/install).

In PowerShell, inspect the command descriptors, then log in yourself:

```powershell
$difyCli = "$env:LOCALAPPDATA\difyctl\bin\difyctl.exe"
& $difyCli version
& $difyCli help -o json --compact
& $difyCli help auth login -o json
& $difyCli auth login --host https://cloud.dify.ai
```

Open the displayed device-login URL and approve the code in your own browser.
Keep the code private. A pre-login server-version error is not proof of an invalid
binary; check the client version separately. Cloud server-version detection is
not yet verified in this project. Do not use `--insecure`.

Verify identity and workspace without running an app:

```powershell
& $difyCli help auth whoami -o json
& $difyCli help get workspace -o json
& $difyCli help get app -o json
& $difyCli auth whoami --json
& $difyCli get workspace --http-retry 0 -o json
& $difyCli get app --workspace 98c18fae-e555-47f7-9869-5d602a3dca04 --http-retry 0 -o json
```

Expected: your account, the intended workspace and role, and accessible Studio apps.
Our verified inventory included `story_writer` and `booklet_illustrator`. An empty
list can mean wrong workspace or insufficient permissions. This Studio list does
not establish whether a New Agent exists. Stop before mutations if the identity or
workspace differs. These commands make no model/image calls.

## 3. Prepare the pinned local MCP bridge

The bridge is third-party software. Read the runbook's security assessment before
installing it or giving it a session. Its dependency advisories remain unresolved;
do not run `npm audit fix` or silently upgrade it.

Use a dedicated checkout outside this repository. On a fresh machine:

```powershell
$difyPin = 'f2e6c7590a44e5b5dbeab358bf8f14b5b9cfef2a'
$difyBridge = Join-Path $env:LOCALAPPDATA "CodexTools\dify-mcp\v0.3.0-$difyPin"
if (Test-Path $difyBridge) { throw 'Bridge directory exists; inspect it instead of reinstalling.' }
New-Item -ItemType Directory -Force (Split-Path -Parent $difyBridge) | Out-Null
git clone https://github.com/alexjiaguo/dify-mcp.git $difyBridge
if ($LASTEXITCODE -ne 0) { throw 'Bridge clone failed; inspect existing installation.' }
git -C $difyBridge checkout --detach $difyPin
if ($LASTEXITCODE -ne 0) { throw 'Pinned checkout failed.' }
git -C $difyBridge rev-parse HEAD
Get-FileHash "$difyBridge\package-lock.json" -Algorithm SHA256
```

Require the full commit above and lockfile SHA-256
`62fbd9c0cc890a055a815a66065d8fa7bd577b4c61f6df91697a1f6ce7b88803`.
Stop on mismatch. If the checkout already exists, inspect its commit and dirty
state instead of cloning over it or discarding changes. Then install its locked
dependencies and run credential-free checks:

```powershell
npm.cmd --prefix $difyBridge ci
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
npm.cmd --prefix $difyBridge run typecheck
if ($LASTEXITCODE -ne 0) { throw 'Bridge typecheck failed.' }
npm.cmd --prefix $difyBridge test
if ($LASTEXITCODE -ne 0) { throw 'Bridge tests failed.' }
```

The prior baseline passed 114 tests. Use a temporary, empty `DIFYWF_HOME` for any
additional smoke tests; do not test against another person's credential store.

## 4. Register MCP with Codex

Create a dedicated `%LOCALAPPDATA%\DifyWf-Codex` directory. Before storing credentials,
use Windows Security properties to disable broad inherited access and allow only
your account, SYSTEM and Administrators. Check it with `icacls`; Unix chmod flags
do not establish Windows protection. Do not remove your own access.

Inspect `codex mcp list` first. If `dify` already exists, inspect that registration
locally and preserve unrelated servers. For a new registration:

```powershell
$difyState = Join-Path $env:LOCALAPPDATA 'DifyWf-Codex'
$difyNode = (Get-Command node.exe).Source
codex mcp add dify --env "DIFYWF_HOME=$difyState" -- $difyNode "$difyBridge\bin\difywf.js" mcp serve
```

This uses local stdio, not an HTTP listener. Only the private state-directory path
belongs in registration, not cookie/token values. Codex's
[MCP documentation](https://developers.openai.com/codex/mcp) describes registration.
Restart Codex in the interface you will actually use, open this repository, and ask:

> Check Dify MCP tool discovery only. Do not authenticate, mutate resources, use
> browser control, or run paid probes. Report whether the Dify tools and project
> Dify skills are available.

Our fresh-session check exposed 172 bridge tools. Tool discovery proves connection,
not authentication or compatibility of every operation.

## 5. Authenticate MCP separately — verified cookie path

On 2026-09-27, cookie import passed live MCP `app.list`, `workspace.list` and
`snippet.list` checks. The pinned bridge's device login returned `unsupported_client`
on Cloud; do not confuse it with the working official CLI device login.
Check current MCP access first. Do not repeat login when it already works.

Log in to `https://cloud.dify.ai` yourself. Open browser Developer Tools, then
Application → Storage → Cookies → `https://cloud.dify.ai`. Keep values private.
The observed names are `__Host-access_token`, `__Host-csrf_token` and
`__Host-refresh_token`; preserve the names. No cookie-export extension is needed.

Run this in your private PowerShell terminal. At each prompt, copy that cookie's
**Value** in DevTools, return to the terminal and press Enter. Do not paste it
into the prompt, chat, shell command text or repository. Avoid clipboard-history
or cross-device clipboard retention while handling credentials.

```powershell
$env:DIFYWF_HOME = Join-Path $env:LOCALAPPDATA 'DifyWf-Codex'
$difyBridge = Join-Path $env:LOCALAPPDATA 'CodexTools\dify-mcp\v0.3.0-f2e6c7590a44e5b5dbeab358bf8f14b5b9cfef2a'
$difyCookies = @{}
try {
    foreach ($cookieName in @('__Host-access_token', '__Host-csrf_token', '__Host-refresh_token')) {
        Read-Host "Copy the VALUE of $cookieName in DevTools, then press Enter here" | Out-Null
        $cookieValue = (Get-Clipboard -Raw).Trim()
        if ($cookieValue.Length -lt 16 -or $cookieValue -match '[^\x21-\x7E]' -or
            $cookieValue.StartsWith('__Host-')) {
            throw "Invalid clipboard value for $cookieName. Import stopped."
        }
        $difyCookies[$cookieName] = $cookieValue
        Set-Clipboard -Value ' '
    }
    $difyCookies | ConvertTo-Json -Compress |
        node "$difyBridge\bin\difywf.js" auth import-cookies --base-url https://cloud.dify.ai
    if ($LASTEXITCODE -ne 0) { throw 'Cookie import failed.' }
}
finally {
    $difyCookies.Clear()
    Remove-Variable difyCookies, cookieValue -ErrorAction SilentlyContinue
    Set-Clipboard -Value ' '
}
```

Expected import output is `stored: true` and cookie names only. The bridge stores
plaintext credentials in protected `hosts.json`; verify its Windows ACL as well
as the directory ACL. Never dump that file or copy CLI tokens into it. This import
needs no temporary cookie export. Clipboard replacement does not erase clipboard
history or revoke the session.

Ask Codex to inspect the schemas and call `workspace.list` and `app.list` read-only.
The current session picked up imported credentials without a restart. User-level
registration and saved credentials support later sessions, subject to expiry or
revocation; check access in each new session. Verify permissions through the CLI
where the MCP response omits them. `workspace.get` returned HTTP 404 while listing
worked; this is not a reason to reauthenticate. Do not generate to test login.

The earlier hidden-prompt paste stored one non-ASCII character per cookie and
produced `fetch failed`. The clipboard procedure above passed. If import succeeds
but access fails, inspect safe format metadata/network errors without displaying
values. An import success alone does not prove authentication or write capability.

## 6. Troubleshooting and handoff

| Result | Next action |
| --- | --- |
| CLI executable not found | Use its full verified path; restart Codex after PATH changes. |
| PowerShell blocks npm.ps1 | Use `npm.cmd`; do not weaken machine execution policy. |
| CLI works, MCP returns AUTH_REQUIRED | Complete the separate private bridge login; do not rotate Booklet/provider keys. |
| Bridge device login returns unsupported_client | Use the verified private cookie path; do not repeat CLI login. |
| MCP workspace.get returns 404 but app/workspace listing works | Use workspace.list; record the endpoint gap, not an authentication failure. |
| No Dify MCP tools after restart | Check registration command, wrapper path, Node version and the Codex interface's MCP configuration. A standalone handshake is insufficient. |
| Wrong workspace or permission denied | Stop writes; ask the administrator to confirm membership and intended role. |
| Session expired | Reauthenticate that interface privately, then repeat read-only identity/workspace checks. |
| Missing administration capability | Use inspected CLI descriptors, then an explicitly authorized Codex-browser path; report unsupported operations. |

Before browser-control plugins are used, authorize that topic explicitly in the
current chat session. Login remains a user handoff. Configuration, publication,
deletion, deployment and paid probes require their own task scope/approval.

Report only sanitized results: CLI version, bridge commit, workspace ID/role,
tool discovery, and each interface's authentication outcome. For revocation, inspect
`difyctl help auth devices revoke -o json` and the Dify session controls, then revoke
only the intended session with authorization. Local logout/file deletion alone is
not proof of server-side revocation. Continue with the runbook's disposable probes
only after access succeeds; onboarding alone does not satisfy all of issue #66.

## Community instance (issue #69)

The steps above target Dify Cloud. The candidate Community instance has a
different host, workspace, and credentials; it is **not live-verified yet**.
Follow the [Community deployment runbook](deployment/dify-community.md) after
its private administrator-setup checkpoint. Keep a separate `difyctl` profile
and separate `DIFYWF_HOME` state directory for `https://dify.uniwares.co.uk`.
Verify the intended Community workspace with read-only CLI and MCP inventory
after a fresh Codex restart. Do not copy Cloud cookies, CLI tokens, Booklet
callback keys, or provider credentials into the Community profile. The CLI
device login and MCP bridge login are independent. A successful login to one
host does not prove access to the other or authorize a provider call.
