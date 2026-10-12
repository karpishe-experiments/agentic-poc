# Agent instructions

## Purpose

This repository is a non-production playground for small agentic application and generative UI experiments. Optimize for learning, clarity, and speed rather than production readiness.

## Skill environment

Project-local skills are copied under `.agents/skills` and pinned in `skills-lock.json` so collaborators use the same guidance:

- `ai-sdk` for Vercel AI SDK UI and typed message-stream contracts.
- `next-best-practices` for Next.js App Router conventions and server/client boundaries.
- `vercel-react-best-practices` for React implementation guidance.
- `web-design-guidelines` for UI, interaction, accessibility, and UX review.
- `playwright` for Chromium browser verification.
- `pdf` for rendered PDF inspection and layout verification.
- `capture-project-learnings` for promoting verified experiment knowledge.
- `work-on-task` for proportional implementation and reviewed PR publication.
- `review-change` for pinned, read-only defect-first review.
- `sync-docs-issues` for final documentation and issue-evidence reconciliation.
- `compile-feature-spec` for turning rough experimental ideas into bounded specifications.
- `asd-ste100` for unambiguous agent-authored technical prose without changing facts,
  uncertainty, conditions, or scope.
- `difyctl` for the official Dify CLI's command discovery and inspected command
  descriptors. Use it for Dify CLI operations, not Booklet runtime development.
- `dify-operations` for Dify Cloud or Community configuration, testing,
  publication, traces and recovery. Read the host-specific runbook and
  capability matrix first; prefer local-stdio MCP, then the
  official CLI where supported, then verified Codex browser automation. These
  skills do not grant spending, deletion, deployment or broader access authority.

Codex also provides maintained system skills that must not be copied into this repository:

- `openai-docs` for current OpenAI API, model, Agents SDK, and Image API guidance.
- `imagegen` for image generation or editing when the host exposes the required image tool.
- `skill-installer` for discovering and installing additional skills when explicitly requested.

If OpenAI documentation tools are unavailable, run `codex mcp add openaiDeveloperDocs --url https://developers.openai.com/mcp` and restart Codex before relying on the `openai-docs` workflow.

For the kids booklet POC, use this precedence when sources conflict:

1. The canonical PRD.
2. The completed experiment brief.
3. Prototype and other research material.
4. Generic skill guidance.

The canonical PRD is `docs/accepted/2026-08-01_end-to-end-poc/kids-comic-poc-prd.md`. The prototype and `prototype/docs/ui-design-plan.md` are research inputs only; do not carry conflicting prototype assumptions such as voice input, a fixed six-page book, inventory-based characters, multi-panel layouts, or mobile-specific scope into the implementation plan.

Apply a skill only where it supports the requested POC scope. Do not add production hardening, infrastructure, abstractions, or polish solely because a skill recommends them.

## Workflow

1. Read the experiment brief and inspect the relevant repository code.
   Before changing runtime agents, skills, contracts, stage transitions, jobs, or persistence, also read `docs/architecture.md`. Keep that current-state guide aligned when a verified change materially alters those boundaries; it does not override the canonical PRD.
2. Resolve discoverable questions from the repository before asking the user.
3. Use `work-on-task` and plan in proportion to the change. A localized fix needs a concise task contract; features and risky work require an issue or accepted feature specification and a decision-complete plan.
4. Implement within the confirmed contract. Ask only when a consequential ambiguity, risky action, or scope change requires user input.
5. Run verification proportional to the changed surface, then use `review-change` for an independent read-only review.
6. After Review passes, use `sync-docs-issues`; compose it with `capture-project-learnings` when verified work reveals durable knowledge.
7. The core workflow may publish a reviewed branch and pull request. Merging, deployment, issue closure, and GitHub Project mutations remain outside that authority.

### Repeated blocking reviews

If more than three consecutive reviews each find a new defect or blocking issue,
stop individual corrections and review the whole package. Identify why earlier
reviews missed the blockers or why the corrections did not resolve them. Inspect
shared assumptions, related paths and failure boundaries before correcting the
package. Record the cause, correction and focused verification.

After this package review, use the next two reviews to check whether the pattern
continues. If both reviews again find a new defect or blocking issue, stop fixing
and publishing. Report the findings, attempted corrections, remaining risks and
a recommended next step to the user, then wait for instructions. A clean review
breaks the consecutive-blocker sequence; required clean publication reviews still
apply. This rule takes precedence over generic skill correction-cycle defaults.

For issue-backed work, select one issue branch and keep all implementation,
review corrections, deployment fixes, and follow-up changes for that issue on
that branch. Do not create or switch to another working branch while the issue
remains active unless the user explicitly requests the branch change. If the
issue branch was already merged, update that same branch from `master` and open
a follow-up pull request from it when more issue work is required.

Every local branch must track its same-named counterpart on `origin`. The base
branch is not the upstream tracking branch: a branch created from `origin/master`
must not retain `origin/master` as its upstream. Create branches with `--no-track`,
then use `git push --set-upstream origin <branch-name>` when publishing. If the
counterpart already exists, set the upstream to `origin/<branch-name>`. Verify
the branch and upstream after creation or correction. Until first publication,
leave the upstream unset rather than tracking a differently named branch.

## Computer and browser control authorization

For developer Dify onboarding, follow `docs/dify-getting-started.md` and the linked
capability runbook. Keep CLI and MCP authentication separate. Credential entry is
a private user handoff; verify each interface with read-only workspace checks.
Do not infer authenticated MCP access from CLI login or tool discovery.

Before using any computer-use or Chrome/browser-control plugin, obtain explicit
user authorization at least once per usage topic per chat session. This includes read-only inspection,
tab discovery, screenshots, and interactive control. An explicit request to use
the tool counts as authorization; a general task request does not.

Authorization applies only to the approved topic and scope in that chat session.
Obtain new authorization before using these plugins for a different topic. Do not
carry authorization into another chat session. Do not ask again for the same topic and scope unless
the user revokes authorization or an action-specific policy requires confirmation.
Session authorization does not replace required confirmations or user handoffs
for sensitive actions.

## Delegation and multi-agent work

- The primary agent owns the implementation sequence, shared architecture, integration, verification, commits, and project-management updates.
- Delegate only concrete, bounded work that can proceed independently and materially improves speed, context hygiene, or review quality.
- Good delegation candidates include repository exploration, focused tests, log analysis, requirement traceability, UI review, and generated-artifact inspection.
- Avoid concurrent edits to shared files, migrations, central contracts, or adjacent implementation slices.
- Give every subagent explicit scope, expected output, relevant constraints, and whether it may edit files.
- The primary agent must inspect and validate subagent results before relying on or integrating them.
- Subagents do not commit, push, change project status, or make cross-cutting product or architecture decisions unless explicitly authorized.
- Follow model, reasoning, concurrency, and escalation defaults from the trusted project configuration and the approved implementation plan.
- Prefer a stronger review model only for unresolved complex failures, consequential architecture conflicts, or final compliance review.

## Project management and GitHub

- The [Agentic POC GitHub project](https://github.com/orgs/karpishe-experiments/projects/2) is advisory context for sequencing; ordinary engineering does not require Project status maintenance.
- Use the configured GitHub MCP server for GitHub project, issue, pull-request, and other GitHub API operations when it exposes the required capability.
- If the required GitHub capability is unavailable through MCP, fall back to the `gh` CLI.
- Use the `git` CLI for basic local repository operations such as status, diff, branch, add, commit, log, and push; do not route basic Git operations through GitHub MCP.
- Run all Git and GitHub operations outside the sandbox because repository metadata access and remote operations may require permissions or network access. Request the necessary escalation when the execution environment requires approval.
- If the current branch matches the case-sensitive pattern `personal/*`, keep all work on that branch. Do not ask to create or switch branches, and do not create or switch branches unless the user explicitly requests it.
- The canonical list of explicitly identified non-technical GitHub collaborators is `@Mehdi-varm`. Do not infer that another collaborator is non-technical from writing, behavior, or task content. Update this list when collaborator responsibilities change.
- Activate cautious Git confirmation immediately when the current branch matches `personal/*`; identity resolution is not required for this trigger.
- On a non-`personal/*` branch, activate cautious Git confirmation when explicit conversation, task, or repository context identifies the current user in the canonical non-technical collaborator list.
- During legal-document work, use identity lookup only when explicit conversation, task, or repository context indicates that the current user may be in the canonical non-technical collaborator list but does not provide an exact identity. Resolve identity from the current-viewer identity in the configured GitHub MCP capability and then the authenticated identity from `gh api user`. If these sources are unavailable or conflict, ask once for the user's GitHub handle before a branch or commit action. Do not infer the identity.
- For every other collaborator on a non-`personal/*` branch, use the standard repository workflow without identity lookup or extra branch or commit confirmation. The general safety, sensitive-material, and large-file rules still apply.
- When cautious Git confirmation is active:
  - On `personal/*`, the user must explicitly request any branch create, switch, rename, or delete action. That request is approval for the specified action; do not ask twice.
  - For a listed collaborator on another branch, explain a proposed branch create, switch, rename, or delete action and get explicit approval before performing it. An explicit request for that action in the current conversation is approval; do not ask twice.
  - Before creating or amending a commit, show the complete proposed file list and a concise explanation of the commit. Get approval for that exact file set. If the file set or commit scope changes, get approval again.
  - Ordinary staging and pushing may continue within the approved workflow without another prompt. Stop if another safeguard detects unexpected files, conflicts, generated output, binaries, or a large-file threshold.
- Before staging, committing, or pushing, inspect the files in the proposed commit. Do not stage, commit, or push until the user gives explicit approval if it includes any of the following:
  - More than five photo or image files.
  - Any video file.
  - A PDF larger than 2 MiB (2,097,152 bytes).
  - Ten or more non-code files that appear to come from a pasted folder or unintended file generation.
- For these files, warn the user. Recommend that they upload the files to external storage and provide the URL in this chat. If the files are unintended, recommend that they delete them or explicitly add them to `.gitignore` instead of committing them.

### Retained uploads and archives

- If the user explicitly asks to keep an uploaded file but does not specify a destination, store it in the nearest relevant `archive/` directory. For example, use `docs/legal/archive/` for legal material. Use the repository-root `archive/` only when no relevant project area exists.
- Track only small, safe, non-sensitive files in an archive. Confidential, privileged, personal, regulated, or credential-bearing files must remain outside Git.
- If uploaded media has an existing online source, prefer a Markdown link record in the contextual archive instead of another binary copy. Include a short description and the source URL. Do not download the online resource unless the user explicitly requests it.
- If media has no online source and does not trigger an existing large-file approval threshold, it may be retained in the contextual archive.

### Documentation-only collaborators

- This section does not change the standard workflow for technical collaborators on non-`personal/*` branches.
- For `@Mehdi-varm`, limit changes to `docs/legal/` unless the user explicitly requests a different scope.
- Do not request, disclose, create, or modify `.env.local`, API keys, MongoDB credentials, or shared application data for documentation work.
- Do not run `npm run db:reset`, `npm run eval:real`, paid model or image calls, or destructive recovery commands for documentation work.
- Stop and ask a repository administrator for help if the change includes a merge conflict, an unexpected file, generated output, or a binary file.
- On `personal/*`, follow the user-owned branch rule. Otherwise, use a task branch and a pull request. Do not push directly to `master`, and do not merge the collaborator's own pull request.
- Keep confidential, privileged, personal, and regulated source material outside GitHub. Store it in approved access-controlled storage and commit only a sanitized summary or safe link.
- Follow these rules even when GitHub does not enforce them. Repository administrators can use `docs/repository-setup-guide.md` to configure enforcement later.

## Implementation planning

Scale planning to the risk and scope. Localized fixes, tests, and documentation changes may proceed from a concise task contract. Features, migrations, architecture or persistence changes, public contracts, security-sensitive work, and cross-subsystem work require an existing issue or accepted feature specification. When an accepted plan already governs the requested work, follow it instead of creating a competing plan.

For a new experiment or material change, the plan must:

- Organize work into incremental vertical slices and map each slice to applicable PRD requirements and acceptance criteria.
- Define architecture and ownership boundaries, including deterministic application responsibilities versus manager and skill responsibilities.
- Define the database, artifact, generative-UI card, runtime skill, image-provider, job, and asset contracts needed by the slices.
- Identify the application routes and end-to-end user flows each slice makes usable.
- Cover dependency setup, environment configuration, migrations, seeded assets, and local data handling.
- Specify focused verification, agent fixtures, the browser golden path, the three retained evaluation booklets, tracing, cost evidence, and PDF inspection.
- Record material risks, assumptions, and intentionally deferred production concerns.
- Resolve consequential implementation choices or explicitly return them to the user before implementation begins.

For the Kids Booklet POC, `docs/accepted/2026-08-01_end-to-end-poc/PLAN.md` remains the accepted plan for its covered scope. Do not treat `prototype/docs/ui-design-plan.md` as an implementation plan.

## Implementation guidelines

- Keep experiments small, understandable, and disposable.
- Follow the stack and constraints in the experiment brief. When unspecified, choose the simplest suitable approach and minimize dependencies.
- Preserve unrelated user work and avoid broad refactors unless the approved plan requires them.
- Keep explanations of non-obvious behavior close to the implementation. Do not create post-experiment reports unless requested.
- For generative UI, make agent state visible, actions understandable, errors recoverable, and fallback behavior deterministic where practical.
- Store legal and legal-research documentation in `docs/legal/`.

### Credential documentation

- Maintain the canonical inventory in
  [docs/deployment/contracts.md](docs/deployment/contracts.md#variables-and-secrets).
  In each implementation change that adds, renames, removes, rotates or changes
  credential storage or use, update its names/aliases, owner, environment/profile,
  protected storage and transfer copies, consumers, purpose and required,
  conditional, legacy/inert or deferred status.
- Follow its [maintenance procedure](docs/deployment/contracts.md#maintaining-the-inventory)
  before review/publication. Keep runtime schemas, Dify bindings, preparation
  helpers, workflow inputs and operating guidance aligned. Report the inventory
  impact in task/PR evidence, including a reason when no inventory update is needed.
- Document metadata only. Never commit secret values or private credential files.
  Distinguish implemented storage from verified live provision/use. These rules
  do not authorize credential access, rotation, deployment, spending or deletion.

## Verification

- Run the relevant build, type checks, lint checks, and focused tests when they exist.
- Add only the tests needed to demonstrate the experiment's success criteria.
- Report what passed, what failed, and what was not run.

<!-- core-agent-skills:start -->
## Core engineering workflows

Repository-specific architecture, validation, issue thresholds, and publication
rules are canonical in `.agents/repository-adapter.md`.

- Use `.agents/skills/work-on-task/SKILL.md` for implementation, fixes, and refactors.
- Use `.agents/skills/review-change/SKILL.md` for a separate read-only review.
- Use `.agents/skills/sync-docs-issues/SKILL.md` for reconciling verified changes with docs and issue evidence.
- Use `.agents/skills/compile-feature-spec/SKILL.md` for turning rough feature ideas into bounded specifications.
- Use `.agents/skills/asd-ste100/SKILL.md` for unambiguous agent-authored technical prose.


Use STE-flavored language for agent-authored prose. Preserve code, commands, identifiers, quotations, logs, and user-owned wording exactly unless the user asks to rewrite them.

These workflows may publish a reviewed branch and PR but never merge, deploy,
release the consumer application, close issues, or mutate GitHub Project fields.
<!-- core-agent-skills:end -->

## VPS and Cloudflare deployment

When you author or change deployment automation:

- Use `#!/usr/bin/env bash`, `set -euo pipefail`, and `umask 077`. Organize logic into small, clearly named functions.
- Parse explicit named arguments, provide `--help`, reject unknown arguments, and reject missing required inputs.
- Default to preview. Permit mutations only with `--apply`.
- Before mutation, validate required commands, the target VPS identity and host key, Cloudflare account and zone write-permission policies, Atlas temporary Project Owner access when used, and all required configuration.
- Discover current state first. Make changes additive and idempotent. Report `exists`, `would create`, `would update`, `created`, or `updated`. Stop on incompatible or destructive drift.
- Setup must not delete resources, copy production data, or perform rollback. Explicit workflow recovery remains governed by the deployment runbook.
- Never enable shell tracing, embed credentials, print secret values, or retrieve secret contents without need.
- Validate application secret schemas before storing or staging them. In particular, reject an `ACCESS_GATE_PASSWORD` shorter than 16 characters before any host lifecycle mutation.
- Validate each interactively entered secret immediately. Re-prompt only the invalid field and retain earlier valid values for the rest of the command. Secret repair must support changing one named field without reading, displaying, or re-entering unrelated stored secrets.
- Password generation must be explicit and interactive. Display a generated access password once on the operator terminal, never through workflow output, and reject generation in GitHub Actions or noninteractive execution.
- Interactive deployment actions must silently prompt for each required provider token or key when it is absent, validate it, and export it only inside the script process for its required child commands. A child script cannot modify its caller's shell. The canonical script may provide clearly named source-only credential-session and clear-credential-session actions. The session action must keep credentials only in the current SSH shell's memory until explicit clearing or SSH logout, disable `errexit` until clearing so a failed child command cannot terminate that SSH login, and temporarily disable shell tracing while it reads or assigns credentials. Clear must restore a previously enabled `errexit` setting. Noninteractive workflow and host-dispatch actions must read the same values from protected runtime variables and fail clearly when they are absent. Do not require an operator to run `read` or `export` commands before invoking a deployment script.
- Quote expansions and use arrays for command arguments. Use `mktemp`, mode `600`, and cleanup traps for sensitive temporary files.
- Return nonzero with a concise actionable error. After apply, perform read-only verification and report sanitized results.
- Every GitHub workflow must publish a concise `$GITHUB_STEP_SUMMARY`, including its target or validation scope, outcome, and the identifiers needed for the next operator action. Reusable workflows may own the summary for thin callers. Capture only sanitized, allowlisted status lines and explicit non-secret result fields; never copy arbitrary logs, credentials, rendered Compose configuration, or secret-bearing command output into a summary.
- A deployment workflow must prove that the selected environment matches the target branch and that the remote target branch still points to the workflow commit before it builds and again before it contacts the VPS. `_staging` and `_prod` are independent reviewed release lines and may diverge from `master`; Deploy does not require `master` ancestry or a successful Infrastructure run. Infrastructure failure summaries must identify the request ID and retained-lock recovery checkpoint.
- Keep scripts compatible with `bash -n` and ShellCheck. Target Ubuntu Bash; verify prerequisites and use `jq` for structured JSON operations.
- When presenting a generated script in documentation or chat, output exactly: a short Required inputs list; one complete script in one code block; preview and apply examples; and brief expected-result and recovery notes.

The canonical shell entrypoint is `scripts/deploy/vps-deployment.sh`. Do not add a second deployment shell entrypoint or source helper shell files.

Treat every deployment environment, including the VPS, as a read-only Git consumer. It may fetch and fast-forward the already selected reviewed branch. Deployment scripts and operators must never create or amend commits, rewrite history, switch or create branches, or push from that environment. Terraform must not rewrite tracked files, including the checked-in provider lock file. Run Terraform initialization, plans, and provider downloads from a private workspace outside the checkout. Keep durable runtime files under `/opt/kids-booklet`, `/etc/kids-booklet`, or `/var/lib/kids-booklet`.

Use its `discover-config` action to collect non-secret VPS, Cloudflare, and Atlas configuration before setup. Its preview may call provider read APIs but must not write a file or mutate provider resources; only its `--apply` writes `infra/config/vps.json`.

For live execution, follow `docs/deployment/runbook.md`: identify the execution host, complete one checkpoint at a time, and recheck workflow, journal, and container state after interruption. Keep only the latest accepted baseline and durable operating guidance in deployment documentation; do not maintain a chronological incident ledger. Honor existing session authorization; do not infer live success from local validation or invent a recovery command.

Terraform owns Cloudflare R2, Tunnel, DNS and rules. Before Terraform use, an administrator must complete Cloudflare Zero Trust enrollment and Free-plan billing consent in the selected account; scripts must verify its organization and Access application API before provider mutation or auxiliary tool installation. `credential-session` loads credentials only. Run the read-only `access-check` action after each credential session to verify the configured Cloudflare, R2, Atlas, and GitHub scopes before setup. Setup owns provider discovery, scoped Atlas users, the exact VPS allowlist, and host credentials. Atlas application users require exactly `readWrite` and `dbAdmin` on their environment database and one selected cluster: this permits explicit restore without granting database-user administration or access to another environment. `atlas-reconcile` may only upgrade existing `readWrite` users after it verifies the existing allowlist and scope; it must not create resources. Finalize owns absent environment-branch creation and supported branch protection. Compose owns non-secret runtime configuration; use the same variable names in both environments and no `STAGING_*` or `PROD_*` application variables. The root-owned final Compose override owns secrets and must never be rendered in logs or artifacts; rotation must stage them over pinned SSH before the serialized Maintenance workflow. GitHub publishes target-environment image tags but the host deploys only immutable digests. Every deployment change must update the compact runbook and relevant architecture guidance, and must keep maintenance, drain, backup, rollback, and environment-isolation contracts intact.

For host-lifecycle changes run both `tests/shell/vps-deployment-script.test.sh` and `tests/shell/vps-host.test.sh`, plus ShellCheck. Recovery changes require `tests/unit/recovery-storage.test.ts`. Validate and test both Terraform roots after infrastructure changes. Use `vitest.deployment.config.ts` for isolated contracts when MongoDB is unavailable; do not report that as a full-suite pass. See `docs/deployment/contracts.md` for current contracts and the accepted live baseline.
