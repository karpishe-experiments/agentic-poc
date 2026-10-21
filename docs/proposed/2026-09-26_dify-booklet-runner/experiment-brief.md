# Dify end-to-end booklet experiment runner

**Status:** Product decisions recorded on 2026-09-26; technical plan required before implementation.

**Tracking:** [Issue #65](https://github.com/karpishe-experiments/agentic-poc/issues/65), following the bounded trial in [issue #50](https://github.com/karpishe-experiments/agentic-poc/issues/50).

## Purpose and baseline

Prove that a Dify agent suite can finish complete illustrated booklets with almost no operator intervention. First achieve completion; then evaluate visual consistency, creator intent, cost, and UX. These evaluations are advisory, not automatic rejection gates.

The [bounded Dify experiment](../../accepted/2026-09-16_agent-platform-decision/DECISION.md) succeeded with three story panels and one image. It used an isolated project, not a normal persisted booklet. Its [verification record](../../accepted/2026-09-16_agent-platform-decision/verification.md) distinguishes recovery success from unverified automatic upload and billing behavior. Preserve that completed project and its attempt cap.

External agent configuration is a major benefit. Delegation needs more testing. Dify's visual workflow and logs are difficult to operate manually, but this does not rule out Dify. Codex must be able to operate the full configuration, test, diagnosis, repair, publication, and verification cycle. The interface that makes this reliable remains to be selected.

## Agreed scope

- Deliver the complete necessary suite of Booklet tools, Dify manager, specialists, workflows, persona testers, and an independent judge. Do not stop at a one-panel demonstration.
- Reuse the current normal Booklet schema and useful application services. Improve them where justified. Persist each created booklet with its own identity, all run details, conversations, artifacts, assets, decisions, and outcomes. Do not replace durable Booklet state with Dify logs.
- Produce the story and all required illustrated pages and cover. PDF generation is deferred.
- Provide a simple runner UI for a selected persona or all personas, mode selection, progress, saved booklets, run evidence, feedback, and Pause/Resume.
- Keep execution unattended. Tester agents drive creator interactions outside the core generation workflow; do not add manual mid-run takeover.
- Pause prevents the next action. In-flight work may finish and save; Resume continues from persisted state without repeating completed paid work.
- Record the configuration used by each run and changes between runs. Retain failures and link repaired reruns. Keep this lightweight rather than introducing a complex version-management gate.

## Ownership

Booklet owns durable records, authorized mutations, revision identity, approvals, limits, assets, and UI state. Dify owns agent and workflow execution. Codex builds and improves the experiment within its agreed boundaries.

Persona testers are Dify agents outside the core manager/specialist team. They drive the experience through application interfaces, preferably APIs rather than browser automation. They can submit intent, answer questions, review, request revisions, and approve through the same application rules. Each starts from a saved brief and preferences, with adaptive dialogue rather than a fixed transcript or an unconstrained changing goal.

The independent Dify judge receives the brief, dialogue, intermediate decisions, and final booklet including images. It provides advisory whole-flow feedback. It cannot reject completion, authorize spending, or automatically regenerate a booklet.

## Personas and initial cases

| Persona | Focus | Initial size to confirm in the technical plan |
| --- | --- | --- |
| Professional Creator | Detailed intent, creative control, precise revisions, consistency | 8 story pages plus cover |
| Enthusiast Parent | A parent creating a booklet; use synthetic interests, not personal child data | 5 story pages plus cover |
| Playful Kid | Ages 9–12; exploratory interaction | 3 story pages plus cover |

The names are agreed. Final briefs, dialogue constraints, page allocations, and scoring rubrics must be explicit before implementation. These initial sizes imply 19 finished images, excluding references and retries; they are not spending authorization.

## Two stages

### Stage 1: Build and verify the runner

Codex plans, assembles, tests, prepares reviewed releases, receives automated feedback, repairs, and repeats until the runner works. Deployment requires explicit operator authorization for the experiment's deployment scope before Codex runs the deployment process. This can support the intended unattended cycle without granting standing deployment authority through this brief. Catch application defects here with simulated and balanced runs before real calls. Reuse existing code where suitable; starting the experiment does not mean rebuilding or deleting the application.

The intended acceptance checkpoint is one completed Real-mode booklet per persona, without manual repair during each acceptance run. Preserve earlier failed runs and their evidence. Numeric limits and the detailed release checkpoints must be agreed before implementation; this brief authorizes no provider spending or deployment.

### Stage 2: Run and improve the agent suite

Codex observes experiment runs, identifies errors, and primarily adjusts agents, prompts, tools, and workflows. Fix demonstrated application defects when needed, but record code repairs separately from agent improvements. The first objective remains reliable completion; then inspect quality, cost, and UX.

## Execution configurations

| Mode | LLM calls, including testers and judge | Image calls | Limits |
| --- | --- | --- | --- |
| Simulated | Simulated | Simulated | Repeat freely without real provider calls; bound each run to stop loops or lack of progress |
| Balanced | Real | Simulated | Explicit LLM-call limit |
| Real | Real | Real | Explicit LLM and image-call limits |

Simulation must exercise the actual Dify workflow paths rather than establish confidence only in a separate local orchestrator. Feasibility and the simulation mechanism require investigation. No real provider calls does not imply unlimited or free Dify platform usage.

Choose numeric budgets late in planning, before implementation, as requested. Do not invent them now. Include tester and judge usage in the accounting. Record actual usage, estimates, and unavailable cost separately. Do not equate application attempts with exact provider billing.

## Feedback and evidence

For each run retain its mode, persona, brief, configuration identity, booklet ID, execution identifiers, state transitions, tool activity, errors, timing, provider usage/cost when available, and final artifacts. The schema and retention detail remain planning work.

Collect both tester feedback on intent and UX and independent judge feedback on the whole flow. Assess visual consistency, adherence to creator intent, cost, and UX after completion. Neither report is a completion gate. Simulated feedback must be distinguishable from real assessment.

## Planning work before implementation

1. Inspect current architecture, canonical PRD, persistence, generation lifecycle, and existing Dify contracts. Map incremental vertical slices to requirements and acceptance criteria.
2. Verify a practical Codex-to-Dify control path for create/update, test, trace inspection, publish, Workflow Tool synchronization, and recovery. Decide when a browser fallback is necessary. Do not assume a supported API exists for every operation.
3. Define the complete agent/workflow/tool inventory, contracts, application routes, schema changes, migrations if needed, and asset handling. Preserve production and existing experiment isolation.
4. Prove simulation through actual Dify execution. Define balanced and real configurations, per-run limits, pause/resume, interruption behavior, and prevention of unintended paid reruns.
5. Finalize persona briefs, page counts, models, judge rubric, exact numeric budgets, and configuration snapshots. Keep controls proportional to an experiment.
6. Define focused tests, failure/recovery cases, automated feedback, browser golden path, rollout checkpoints, and three retained Real-mode acceptance booklets. PDF inspection is excluded while PDF output is deferred.

## Acceptance and boundaries

- Simulated runs exercise intended orchestration and expose code defects without real AI calls.
- Balanced runs test real agent dialogue and delegation without paid images, within LLM limits.
- Each persona completes a Real-mode booklet within agreed limits, with saved records and images and no manual repair during the acceptance run.
- Pause/Resume, failed-run inspection, configuration traceability, and advisory tester/judge reports work.
- Approval, identity, spending limits, and durable completion remain application-controlled. Quality preferences must not become unnecessary blockers; choose the exact policy in planning.
- No new production adoption, sensitive child data, reset of the previous experiment, or automatic budget increase is authorized. Infrastructure changes require a demonstrated need. Do not build a competing custom Agent Studio.

This is a product-decision record and planning handoff, not an implementation-ready plan or evidence that the next experiment already works.
