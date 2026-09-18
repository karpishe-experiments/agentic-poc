# Agent platform decision: validate Dify before Mastra

**Status:** Accepted for validation; implementation and live verification in progress
**Decision date:** 2026-09-16  
**Applies to:** The next internal experiment for configuring, running, and evaluating Booklet agents

**Current experiment (2026-09-18):** Follow [plan.md](plan.md) and [runbook.md](runbook.md). The trial covers a small staging lifecycle: load context, write three panels, save/revise, request review, approve, generate panel one, and resume. The application code and fake-provider checks exist locally; Dify Cloud integration, staging deployment, and live-provider results are not yet verified. The broader checks below are deferred product questions, not additional requirements for this trial.

## Decision

Use Dify as the first platform to validate for the next Booklet agent experiment. Do not integrate Mastra at this stage.

This is a reversible platform-selection decision, not approval to replace the current runtime. The existing Kids Booklet application, the database-backed agent administration, and the Agent Studio mockup remain unchanged. A separate implementation task must prove the Dify integration before Dify becomes part of the product runtime.

The intended operating model is:

- A manager agent examines the current Booklet context and selects the next useful action.
- The manager can call a specialist agent, ask the creator for missing information, or call an allowed Booklet tool.
- Booklet tools authenticate the caller and enforce permissions, schemas, revision checks, approvals, cost limits, and idempotency.
- Booklet remains the system of record for users, books, artifacts, revisions, approvals, assets, jobs, and payments.
- Dify owns agent configuration and execution for the validation trial. It does not own customer-facing product state or the Booklet interface.

In short, the agent decides what action to request. Booklet decides whether the action is valid and how to commit it.

## Product context

The product is not an Agent Studio. It is an AI-assisted system that helps people create illustrated booklets.

The adoption sequence is:

1. The internal team develops and evaluates prompts, models, tools, skills, and orchestration. The team needs visibility into output quality, cost, errors, retries, and inefficient behavior.
2. Professional creators use the product to turn ideas and creative work into finished, revenue-generating booklets.
3. Public users create at different levels of control:
   - personalize an existing booklet;
   - bring a story and use existing characters or artifacts;
   - create a new booklet from the beginning.

The internal authoring environment is enabling infrastructure. It is not the customer product and must not define the customer experience.

## Why Dify is the first choice

### It matches the preferred authoring model

The internal team prefers agent-first authoring. A team member should describe and refine an agent through conversation. Direct configuration must remain available for the model, instructions, skills, files, tools, and permissions.

Dify's New Agent provides a conversational Build mode and a direct Configure mode. Proposed configuration changes are staged for review before they are applied. An agent can run independently or be reused inside a larger workflow. This matches the desired workflow better than requiring the team to construct a graph first.

The visual workflow canvas remains available when the team later needs an explicit schedule, fixed preconditions, human-review steps, or deterministic failure routes. It is optional for the initial manager-agent design.

References:

- [Introducing New Agent](https://dify.ai/blog/introducing-new-dify-agent)
- [Why Dify redesigned Agent](https://dify.ai/blog/why-we-redesigned-dify-agent)
- [Dify Workflow Studio](https://dify.ai/workflows)

### It gives the internal team a complete workbench sooner

Dify combines agent configuration, model selection, tools, skills, testing, publishing, logs, traces, monitoring, APIs, and an optional workflow canvas. This reduces the amount of internal workbench code that Booklet must build before the team can test agent behavior.

The primary success measure is not framework elegance. It is whether a non-developer can change, test, and publish a useful Booklet agent without developer assistance.

### It supports a thin product boundary

Booklet can call a published Dify agent through a server-side adapter. The adapter can translate Dify events and structured results into Booklet's typed chat and generative-UI events. Customer interfaces do not need to use or expose Dify's interface.

Booklet capabilities can be exposed to Dify through narrowly scoped HTTP, OpenAPI, or MCP tools. Dify does not need direct database access. The same boundary makes a later runtime change possible.

### A separate platform is acceptable when it saves total delivery time

The team accepts a separate service if the reduction in product-development time is greater than its provisioning, deployment, upgrade, and maintenance cost. The validation trial must measure this total cost. It must not assume that a ready-made interface is free to operate.

## Why Mastra is not the first choice

Mastra remains a credible fallback. It has a TypeScript-native runtime, MCP integration, dynamic workflows, and close integration with the Vercel AI SDK. Dynamic workflows can be created and changed without redeploying the server.

Mastra does not currently provide a better fit for the selected internal authoring model at the required cost. Its organization-facing Agent Builder is an enterprise feature. Without that product, Booklet would need to assemble more of the conversational configuration, direct-edit, publishing, comparison, and governance experience.

Mastra becomes preferable if one or more of these conditions become important:

- Dify cannot provide sufficiently structured and streamable results for the Booklet interface.
- Dify requires substantial duplication of Booklet state or domain behavior.
- Dify's Cloud limits or self-hosting operations remove its time advantage.
- The product requires in-process TypeScript orchestration.
- The product requires tighter runtime control or model-provider integration than Dify exposes.
- Dify's conversational builder cannot reliably create, apply, publish, and recover agent configurations.

References:

- [Mastra Dynamic Workflows](https://mastra.ai/blog/introducing-dynamic-workflows)
- [Mastra Agent Builder](https://mastra.ai/blog/announcing-agent-builder)

## Why the workflow is not code-owned

The manager agent can own adaptive orchestration. It can inspect context, select a tool or specialist, examine the result, and choose the next action. Developers do not need to encode each conversational transition.

Code still owns trusted capabilities and invariants. This boundary is necessary because model behavior can be retried, interrupted, or changed by a new instruction or model. The following behavior must remain deterministic:

- authentication and authorization;
- schema validation;
- artifact and revision identity;
- approval requirements;
- stale-write detection;
- idempotent mutations;
- cost and rate limits;
- job and asset persistence;
- customer-visible recovery.

For example, the manager can choose `propose_concept`. The tool must still reject an unauthorized user, an incompatible revision, malformed output, a duplicate request, or a request that exceeds the permitted budget.

This design gives the agent freedom to choose useful work without giving it permission to corrupt durable product state.

## Deferred broader evaluation

The original concept-proposal trial was replaced by the smaller lifecycle experiment in plan.md. Keep the following questions for later integration work where they exceed that plan.

The broader platform evaluation can later examine:

- A non-developer can create and improve the manager agent through conversational Build mode.
- The operator can directly correct the model, instructions, skills, files, tools, and permissions.
- Draft changes do not alter the published agent until the operator explicitly publishes them.
- The manager can inspect bounded Booklet context, request missing information, select a specialist or tool, and return a structured proposal.
- Booklet rejects invalid, stale, unauthorized, duplicate, or over-budget mutations.
- A thin server-side adapter can translate progress, text, tool activity, proposals, approval requests, cancellation, usage, and recoverable failures into Booklet-owned events.
- Saved scenarios can compare at least two prompts or models by output quality, latency, token use, estimated cost, tool errors, and human scores.
- Stop, retry, duplicate requests, partial failures, and interrupted runs do not create duplicate Booklet artifacts or Booklet-controlled charges.
- An accepted configuration can be recovered after an unsuccessful change or platform move.

This trial does not implement the complete booklet workflow, replace the current runtime, process real customer data, or deploy Dify for production.

## Hosting and cost decision

Start the validation on Dify Cloud Sandbox with one shared operator. Use synthetic or non-sensitive inputs.

As of the decision date, the free Sandbox plan advertises one member, five apps, 200 included message credits, 30 days of log history, and 5,000 API calls per month. The team can use its own model-provider key after the included credits. The limits are suitable only for the bounded owner-led trial. Current limits and prices must be checked again before implementation because they can change.

If the trial succeeds and the team needs direct multi-user collaboration, compare:

- the current paid Dify Cloud collaboration tier; and
- the complete cost of Community Edition hosting, upgrades, backups, monitoring, and incident response.

Do not choose self-hosting only to avoid a subscription price. Choose it only when its privacy, control, or total-cost benefits justify the operational work.

Reference: [Dify pricing](https://dify.ai/pricing)

## Cloud-to-self-host portability

Configuration portability is sufficient for this decision. Full workspace migration is not required.

At accepted checkpoints and before material Dify upgrades, export supported agent and application definitions. If a future move to self-hosting is necessary:

1. Install a compatible Dify version.
2. Import supported definitions.
3. Install the required plugins.
4. Configure credentials again.
5. Upload retained source documents and rebuild indexes.
6. Start new conversations and operational history.

Booklet must retain its own tool definitions, evaluation cases, source documents, product data, and customer-facing conversation records when those records become product requirements.

The migration does not need to preserve Dify execution logs, Dify conversations, stored credentials, or vector indexes. Dify's CLI supports Studio application export and import, but the implementation trial must confirm that the selected New Agent configuration is included in a usable export before the team relies on this path.

Reference: [Dify CLI command index](https://github.com/langgenius/dify-docs/blob/main/en/cli/reference/command-index.mdx)

## Risks and safeguards

### New Agent maturity

Dify's New Agent was released as a beta. This experiment records setup, publishing and tool-execution behavior. Broader restoration, interrupted-run and upgrade testing remains a later integration task.

### Version restoration

Dify describes version restoration for New Agent, but this repository has not verified it live. Export the working configuration in this experiment; a full recovery drill remains later work. Keep skill sources separately because DSL exports do not include skills and files.

### Privacy and residency

Do not send personal stories, children's photos, or other sensitive customer content to Dify Cloud until the team completes a privacy, residency, retention, subprocessors, and contractual review. Synthetic or non-sensitive data is sufficient for the validation trial.

### Licensing

Before customer production use or substantial interface adaptation, review the license terms for the selected Dify edition and deployment model. The trial does not authorize reselling, removing required attribution, or offering Dify itself as a multi-tenant service.

### Platform dependence

The thin adapter and Booklet-owned tool contracts are required exit boundaries. Product components must not import Dify-specific response types outside the adapter. Durable Booklet records must not use Dify identifiers as their only identity.

## Other options considered

### OpenAI Agents API

The Agents API now provides managed sessions, recovery, context compaction, tool discovery, MCP, subagents, streaming, sandboxes, artifacts, usage, and tracing. It could reduce runtime infrastructure later.

It is not the current choice because it does not remove enough internal authoring and management work at this stage. It can be reconsidered after the team learns which runtime capabilities Dify provides and which Booklet-specific controls remain necessary.

### Continue the custom Agent Studio

The existing mockup produced useful interaction and domain findings. Building the complete runtime platform from the mockup would require configuration management, execution, tracing, evaluations, publishing, access control, portability, and operations. That work does not currently provide enough product differentiation to justify building it before validating Dify.

The mockup remains research evidence. It is not a specification that Dify must reproduce screen for screen.

## Decision review

Review this decision after the bounded lifecycle experiment. Record practical results in Issue #50 and decide whether a deeper Dify integration is worthwhile. There is no numeric score or automatic adoption threshold for this trial.

If the experiment exposes a material blocker, record it and consider Mastra next. Do not run parallel Dify and Mastra implementations before the first trial produces evidence.

