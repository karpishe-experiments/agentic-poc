# Experiment brief: End-to-end kids booklet POC

This brief summarizes the experiment. The canonical, detailed requirements are in [`accepted/2026-08-01_end-to-end-poc/kids-comic-poc-prd.md`](accepted/2026-08-01_end-to-end-poc/kids-comic-poc-prd.md). That source takes precedence if this summary is incomplete or ambiguous.

## Experiment

**Name:** Agentic kids booklet generation with typed generative UI

**Hypothesis:** A creator can turn a short idea into a coherent illustrated picture storybook when an LLM manager invokes bounded, stage-valid skills; typed generative UI captures every material decision; canonical visual references and approved structured comic copy guide image generation; and deterministic application services persist, recover, normalize, and export the result.

## User experience

A creator starts or resumes a locally persisted booklet from Home. In the workspace, an agent adaptively gathers missing information one question at a time and guides the creator through eight visible artifacts: Audience Profile, Story Plan, Visual Style, Visual Bible, Booklet Specification, Page Plan, Final Pages, and PDF Export. Typed cards handle material questions, recommendations, reviews, progress, issues, and recovery. The system generates canonical references and professionally lettered pages, preserves completed work across failures and restarts, normalizes geometry without post-generation text overlays, and exports a readable PDF.

## Success criteria

- Three diverse retained booklets cover all supported age bands, geometries, and short-to-long supported page counts, and each reaches a readable PDF without unresolved critical defects.
- The complete golden path works with only an OpenAI API key and without manually creating or repairing intermediate artifacts.
- Every material decision is completed through validated generative-UI cards.
- Traces demonstrate that the manager invokes registered, stage-valid skills and never invokes more than one skill per manager run.
- Approved artifacts, conversation state, completed pages, and generation progress survive ordinary restarts and recoverable failures.
- Build, type checks, focused tests, the agent fixture set, and one browser-driven golden-path test pass.

## Scope

**In scope**

- A local-first Next.js/TypeScript application with multiple resumable booklets.
- A manager agent, seven bounded runtime skills, and deterministic workflow control.
- Typed generative UI for the complete decision and recovery flow.
- Eight versioned artifact stages with approvals and dependency invalidation.
- OpenAI-first text and image generation behind configurable contracts.
- Canonical visual references, approved structured comic lettering, persisted sequential page generation, selected-image regeneration, geometry-only composition, and PDF export.
- MongoDB persistence, trace and cost evidence, focused automated verification, and three retained evaluation runs.

**Out of scope**

- Authentication, publishing, sharing, collaboration, payments, and production hardening.
- Voice, animation, video, translation, multi-panel comics, or general-purpose image editing.
- User-managed global asset libraries or user-uploaded reference images.
- Redis, distributed workers, workflow engines, separate services, or production operations.
- ChatKit, Agent Builder, MCP in the application runtime, LangSmith, or a Python runtime.
- Provider/model controls in the creator UI or mandatory Gemini/BFL implementations.
- Mobile-specific and cross-browser acceptance work.

## Technical constraints

Use the stack and exact boundaries specified by the canonical PRD: a strict TypeScript monolith using Next.js App Router, React, Tailwind CSS, shadcn/ui, OpenAI Agents SDK, Vercel AI SDK UI, Zod, the official MongoDB Node.js driver with MongoDB Atlas, filesystem assets, Sharp, and `pdf-lib`. Use Vitest with an isolated in-memory MongoDB replica set for focused tests and Playwright-bundled desktop Chromium for the golden path. Keep OpenAI sufficient for the core flow and preserve only lightweight provider and hosting seams required by the PRD.

## Risks and open decisions

- Translate the PRD into small vertical slices without weakening the agentic-skill or generative-UI proof.
- Choose concrete package versions, directory boundaries, database tables, server/UI contracts, and worker execution details during planning.
- Keep provider inconsistency, model failures, interrupted generation, lettering-rendering defects, and PDF defects visible and recoverable without adding production infrastructure.
- Treat the existing prototype and `prototype/docs/ui-design-plan.md` as research only. Their fixed six-page, voice-input, inventory-character, multi-panel, and mobile-specific assumptions are not requirements.

## Verification

- Run the build, type checks, lint, focused unit/integration tests, agent fixtures, and one Playwright golden path defined by the PRD.
- Verify restart/resume, interrupted generation, completed-page retention, selected-page retry, downstream invalidation, one-repair quality behavior, and deterministic PDF order.
- Generate and visually inspect the three retained evaluation booklets and reconcile their skill traces, model/image calls, latency, retries, cost, and quality findings.
