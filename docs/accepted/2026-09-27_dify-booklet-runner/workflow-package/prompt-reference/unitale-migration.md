# Unitale migration requirements

These are agreed target requirements for future implementation. They are not implemented by this experiment reference package. Unitale's canonical repository is [Uniwares-LTD/unitale](https://github.com/Uniwares-LTD/unitale). Extend its existing booklet T18–T20 work and reconcile its PRD/contracts rather than creating a competing architecture.

## Seven roles and ownership

| Target workflow | Experiment material | Responsibility |
| --- | --- | --- |
| Manager | Manager decisions and external coordination lessons | Sole application gateway; context, routing, approvals, quality coordination, persistence and continuation |
| Story Planner | J01–J04 | Concept, outline, preliminary cast and locations |
| Manuscript Writer/Editor | J05–J07 | Manuscript, editing and final narrative facts |
| Art Director | J08–J10 | Style, sample/reference specifications |
| Page Composer | J11–J12 | Pagination, panels, composition, exact lettering and page/cover specifications |
| Image Executor | Image serializers/tool, including J13 | Prepare final image requests and execute only approved requests |
| Quality Reviewer | Judge/report lessons; new independent role | Text/specification/request/image/whole-book review and correction verification |

All creative instructions, templates, request assembly and workflow decisions belong in Dify. Each specialist owns its templates. The Manager supplies task/context/constraints/feedback. Unitale is the UI, execution harness and persistence layer; it retains authentication, entitlements, immutable revisions, human decision identity, stage locks, idempotency and execution/spending safeguards.

Unitale invokes only Manager. All specialist data/artifact transfers and application interactions pass through Manager. Specialists receive no private Run context, app credentials or direct application MCP access. Use a hybrid Manager: deterministic control for known transitions, LLM interpretation/planning/clarification where useful. Start with serial children and bounded control flow; no sub-managers, dynamic role registry or new workflow engine.

## Creation, revision and context

Support new productions and returning to existing productions. Use package/brief-defined lengths, cast, locations, panels, style, language and budgets. Replace fixed persona/count assumptions. Persona decision automation is experiment evidence, not a replacement for actual human approvals.

Related artifacts may be proposed together, but retain individual identity, immutable revision, approval, review coverage and targeted correction. Retrieve current approved sources. Revise the requested scope and actual affected dependencies; preserve locked choices and avoid automatic regeneration of all descendants. Ask before materially widening scope or exceeding limits. Preserve required product approvals; Manager may request further input when needed.

## Independent quality review

Run deterministic structural validation before AI review. Review artifacts before acceptance/downstream use, not every scratch draft. One independent Reviewer has modes for narrative/text, visual specifications, final image requests, generated images, whole-book review and targeted correction verification. Specialists create; Reviewer reports; Manager coordinates corrections. Reviewer has no direct application writes or regeneration authority.

Blocking findings identify criterion, precise evidence, expected versus observed behavior, impact scope, smallest useful correction and evidence limitations. Aesthetic preferences are advisory. Do not regenerate from an arbitrary score. An inconclusive review requests evidence or pauses; uncertainty is not a defect to regenerate away. Human approval cannot bypass a required failed review.

Batch related artifacts when useful with per-artifact coverage. Reuse a pass only for unchanged reviewed content, relevant sources, scope, policy and reviewer publication. Recheck the original defect and related regressions. Whole-book review checks actual ordered pages, completeness, narrative consistency and cross-page continuity. Use bounded groups with explicit coverage when necessary; do not claim unseen pages were inspected from summaries.

## Mandatory image preflight

1. Image Executor Prepare assembles final prompt, actual ordered references and generation settings.
2. Deterministic checks reject malformed requests.
3. Independent Reviewer checks completeness, approved-source fidelity, reference relevance/order, contradictions, composition/lettering feasibility and compatible settings.
4. Manager invokes Generate only for the exact passed request.
5. Reviewer checks generated output.

Every image kind uses this gate: samples, references, covers, pages and repairs. Bind approval to prompt content, reference content/order, meaningful settings and review-policy/reviewer identity. Meaningful changes invalidate it; Generate rejects missing/stale approval. Prompt correction spends no image call. A source conflict returns to Manager rather than silently rewriting approved choices. Preflight cannot prove the generated image will be correct.

## Configurable correction policy and efficiency

Manager centrally owns easily configurable Dify settings, passed to specialists: default **three LLM corrections after the initial attempt**, including image-request corrections, and **one generated-image correction after the initial image**. Review calls do not themselves consume correction attempts. Prompt correction and image regeneration have separate counts. Persist counts across continuation and candidate revisions; retries must not reset allowances.

Application-enforced execution, spending and product limits still apply. Platform-funded quality correction does not consume customer-requested revision allowances. Exhaustion pauses with evidence and a resolution path. Keep transport/provider retries distinct; unknown paid outcomes require reconciliation rather than replay.

Review upstream before expensive downstream work. Correct the smallest affected scope. Record actual calls/corrections/timing and available usage/cost evidence; do not claim measured savings, reliability or quality gains without evidence.

## Minimal runtime changes

Use existing Run/MCP, revision, operation, transfer, evidence and measurement facilities. Extend singular specialist proposals to grouped typed proposals where useful. Extend current image-only review records to scoped text/request/image/whole-book reviews, with inconclusive semantics, exact preflight binding, durable correction counts/policy identity, trusted publication/reviewer bindings and measured execution evidence. Wire actual Manager/Human Input continuation. Resolve the existing manifest source/asset transfer limit using bounded transfer rather than a 100-item product cap.

Preserve original generated bytes, idempotency, immutable approvals, locks, entitlements and billing boundaries. No creator UI redesign, commerce/reader/PDF/sharing work, infrastructure change or generic policy framework belongs in this implementation issue. Store the future seven-workflow package in Unitale at `docs/features/booklet-generation/workflow-package/`, with current secret-free exports, README files and provenance manifest. Dify remains the authoring/execution environment.

## Future acceptance and follow-ups

Require creation, approval/pause/resume without duplicate execution/charges, targeted existing-production revision, varying package sizes, grouped artifact identities, malformed-input rejection, failed/stale image preflight, configurable corrections/exhaustion across continuation, advisory/inconclusive handling, cross-page defect detection, lock preservation, byte reuse after persistence failure, unknown-outcome reconciliation and transport beyond the current manifest limit. Check exports, source provenance, hashes, documentation and secrets.

Offline verification must be followed by bounded live Dify/provider acceptance. The user approves the exact environment, provider configuration and spending cap before those future tests. Current documentation work grants no live execution authority.

Defer parallel scheduling, adaptive model routing, reviewer ensembles, regional image repair, cross-book asset libraries, advanced long-book optimization, collaborative editing and in-flight publication migration. Keep typed boundaries simple so these can be added later. No new creator UI is included.
