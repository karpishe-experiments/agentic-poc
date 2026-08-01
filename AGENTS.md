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
2. Resolve discoverable questions from the repository before asking the user.
3. Present an explicit implementation plan before changing code.
4. Wait for plan approval.
5. After approval, implement the plan end-to-end without unnecessary pauses. Ask only when a consequential ambiguity, risky action, or scope change requires user input.
6. Run verification proportional to the change and summarize the result.
7. After verified work reveals durable knowledge, use the `capture-project-learnings` skill to update canonical docs and record reusable lessons.

## Implementation planning

Before implementation begins, create a root `PLAN.md` and obtain user approval. The plan must be decision-complete enough to implement without rediscovering the architecture, while staying proportional to this disposable POC.

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
