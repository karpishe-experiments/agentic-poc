# Agent instructions

## Purpose

This repository is a non-production playground for small agentic application and generative UI experiments. Optimize for learning, clarity, and speed rather than production readiness.

## Workflow

1. Read the experiment brief and inspect the relevant repository code.
2. Resolve discoverable questions from the repository before asking the user.
3. Present an explicit implementation plan before changing code.
4. Wait for plan approval.
5. After approval, implement the plan end-to-end without unnecessary pauses. Ask only when a consequential ambiguity, risky action, or scope change requires user input.
6. Run verification proportional to the change and summarize the result.
7. After verified work reveals durable knowledge, use the `capture-project-learnings` skill to update canonical docs and record reusable lessons.

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
