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

Codex also provides maintained system skills that must not be copied into this repository:

- `openai-docs` for current OpenAI API, model, Agents SDK, and Image API guidance.
- `imagegen` for image generation or editing when the host exposes the required image tool.
- `review-agent` for read-only, defect-first review of a code change.
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
3. Present an explicit implementation plan before changing code.
4. Wait for plan approval.
5. After approval, implement the plan end-to-end without unnecessary pauses. Ask only when a consequential ambiguity, risky action, or scope change requires user input.
6. Run verification proportional to the change and summarize the result.
7. After verified work reveals durable knowledge, use the `capture-project-learnings` skill to update canonical docs and record reusable lessons.

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

- Use the [Agentic POC GitHub project](https://github.com/orgs/karpishe-experiments/projects/2) as the project-management source for implementation work, status, and sequencing.
- Use the configured GitHub MCP server for GitHub project, issue, pull-request, and other GitHub API operations when it exposes the required capability.
- If the required GitHub capability is unavailable through MCP, fall back to the `gh` CLI.
- Use the `git` CLI for basic local repository operations such as status, diff, branch, add, commit, log, and push; do not route basic Git operations through GitHub MCP.
- Run all Git and GitHub operations outside the sandbox because repository metadata access and remote operations may require permissions or network access. Request the necessary escalation when the execution environment requires approval.

## Implementation planning

Before implementation begins, locate and read the canonical implementation plan identified by the active PRD or project-management issue and obtain user approval. Do not create a second plan when an approved canonical plan already exists. For the Kids Booklet POC, the canonical implementation plan is `docs/accepted/2026-08-01_end-to-end-poc/PLAN.md`.

The plan must:

- Organize work into incremental vertical slices and map each slice to applicable PRD requirements and acceptance criteria.
- Define architecture and ownership boundaries, including deterministic application responsibilities versus manager and skill responsibilities.
- Define the database, artifact, generative-UI card, runtime skill, image-provider, job, and asset contracts needed by the slices.
- Identify the application routes and end-to-end user flows each slice makes usable.
- Cover dependency setup, environment configuration, migrations, seeded assets, and local data handling.
- Specify focused verification, agent fixtures, the browser golden path, the three retained evaluation booklets, tracing, cost evidence, and PDF inspection.
- Record material risks, assumptions, and intentionally deferred production concerns.
- Resolve consequential implementation choices or explicitly return them to the user before implementation begins.

Do not treat `prototype/docs/ui-design-plan.md` as an implementation plan. Do not begin application implementation until the root `PLAN.md` is approved.

## Implementation guidelines

- Keep experiments small, understandable, and disposable.
- Follow the stack and constraints in the experiment brief. When unspecified, choose the simplest suitable approach and minimize dependencies.
- Preserve unrelated user work and avoid broad refactors unless the approved plan requires them.
- Keep explanations of non-obvious behavior close to the implementation. Do not create post-experiment reports unless requested.
- For generative UI, make agent state visible, actions understandable, errors recoverable, and fallback behavior deterministic where practical.

## Verification

- Run the relevant build, type checks, lint checks, and focused tests when they exist.
- Add only the tests needed to demonstrate the experiment's success criteria.
- Report what passed, what failed, and what was not run.
