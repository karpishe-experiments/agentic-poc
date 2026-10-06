# M4 — Simulation hardening and Balanced acceptance

**State:** Planned. **Coverage:** AC01–AC03, AC05–AC08, AC10–AC13.
**Predecessor:** [M3](M3-completion.md). Apply [EXECUTION](EXECUTION.md).

M4 remains planned, pending M3's deployed completion. This document update does
not start runs, change configuration or grant spending/deployment authority.

## Three execution checkpoints

| Checkpoint | Work | Exit |
| --- | --- | --- |
| 1. Close readiness gaps | Reuse valid M3 simulation, recovery and browser evidence. Test uncovered scenarios and changed paths. Verify real-text routing, simulated-image routing, model/token settings, disabled automatic provider retries and reservations covering all internal calls. Consolidate missing credentials and campaign authorization into one handoff. | Required simulated scenarios have evidence; published configuration and accounting are verified; campaign authorization is recorded. |
| 2. Execute one Balanced campaign | Run Kid → Parent → Creator sequentially. Use real text and simulated images. Retain artifacts, per-page approvals, reports, usage and timing. Quality findings remain warnings. | All three cases complete within 120/160/220 LLM requests respectively, with zero real image calls. |
| 3. Record results and prepare M5 | Keep one concise exit record linking configuration, runs, failures, successors and remaining limitations. Pass measured usage and exact bindings to M5. | No known technical completion blocker; evidence supports the next Real-readiness checkpoint, not Real execution authorization. |

The requirements below support these three checkpoints, not another execution
sequence. Reuse existing UI and short tester/judge reports; do not add a scoring
framework or new report hierarchy.

## Checkpoint 1 — Readiness and spending handoff

Reconcile M3's complete simulated runs and measured request/context counts.
Require verified model IDs, token parameters/ceilings, zero automatic provider
retries, actual Dify publication/tool binding, and per-node reservation evidence.
Inspect source/configuration for hidden provider retries, not just node toggles.
An opaque unbounded node is not acceptable for paid readiness.

Before paid execution starts, bundle model/binding confirmation, any
private credential handoff, staging release access and paid campaign authorization.
Default proposal: three initial runs, one per persona, zero successors and at most
500 LLM requests in total (120 + 160 + 220). This is not spending authorization.
If successors are requested, obtain a finite allowance and show its additional
worst-case request total before execution. No image spending is permitted in
Balanced mode. Without paid approval, finish non-billable readiness work and stop
at the paid checkpoint; do not claim the milestone exit.

### Required simulation evidence

Reuse M3 results only while their relevant code, graphs, bindings and environment
assumptions remain valid. Do not repeat unchanged M3 campaigns. Use one
representative recovery test per shared mechanism and focused persona contracts;
add a case for a materially different path. Every required scenario below still
needs evidence, including the three deployed persona completions.

Use the same deployed Dify entrypoint and callback routes as Balanced/Real. Keep
small deterministic fault fixtures in a test-only mode that staging operators
explicitly select; production rejects the entire runner. Do not expose fault
injection as a normal agent capability.

| Scenario | Observable assertion |
| --- | --- |
| Three complete persona cases | Saved cover/pages/reference counts, all J01–J13 and reports; zero real-provider nodes/payable counters; logical reservations recorded |
| Low interaction/group review | Kid/parent do not individually review all internal artifacts; exact approval provenance retained |
| Detailed creator control | Creator can inspect/revise an artifact and narrow delegation; only current grant applies |
| Scope/brief conflict | Tester is asked; manager cannot grant itself authority or change limits |
| Duplicate/lost authorization | One claim, at most one simulated provider action; inspection, not re-execution |
| Restart/pause | In-flight result can save; no new claims while paused; resume does not repeat completed work |
| Missing/corrupt asset, storage failure | Technical blocked state; existing-result recovery retains counter and prior pages |
| Concurrent/superseded completion | One winner; old result cannot overwrite replacement |
| Exhausted calls/revisions | No extra provider call; usable quality result accepted with warning; required missing output remains blocked |
| Judge failure | Generation remains complete; evaluation retry/recovery is separately recorded within allowance |

A fault fixture is complete only when the final state and persisted ledger are
asserted, not merely when a request returned 200. Run focused Vitest, typecheck,
lint, agent routing fixtures and actual fake-provider Playwright execution. CI's
browser discovery is not a substitute.

## Checkpoint 2 — Balanced campaign

1. Read back suite configuration and statically inspect every reachable branch.
   Balanced must route manager/specialists/testers/judge to real text calls and
   images to fixture transport before any image provider node.
2. Set per-run real LLM ceilings 120/160/220; real image allowance zero. Token
   ceilings and models must match the approved readiness manifest. All retries,
   output repairs and judge subcalls count. Counters are never reset for a retry.
3. Run Kid, Parent, Creator sequentially through the normal runner. Observe by
   persisted run ID and Dify execution ID. Do not change a running case's suite.
4. For a technical failure, retain the run. Diagnose with traces, prefer a bounded
   prompt/schema/config correction, rerun affected simulation and tests, obtain two
   consecutive clean independent reviews, publish/synchronize/deploy if needed, then start a linked successor
   only within the approved campaign allowance. No silent paid trial loops.
5. Record real usage/latency and reported cost; distinguish estimates or unavailable
   fields. Save tester/judge reports but label visual judgments as based on
   simulated images, not evidence of provider image quality.

Aim for one reviewed configuration/release candidate. Before changing configuration,
stop new dispatch and reconcile active or uncertain work; Pause alone is not a
drain. Recover unknown outcomes through inspection, without automatic replay.

## Checkpoint 3 — Evidence and M5 handoff

Use EXECUTION C/D for every relevant correction; do not waive CI because a prompt
change is small. Dify-only updates require graph/prompt checks and two reviews,
publication/tool sync/read-back, but not an unchanged application deployment.
App changes require the normal PR/CI/staging cycle.

Keep one concise exit record here with evidence links, published bindings, usage,
failures/successors and remaining limitations. A successful run alone does not
require another deployment.

Exit: all named simulated scenarios and all three Balanced cases pass, no real
image calls, complete artifacts/reports, request enforcement verified, and no known
technical blocker. Record failed predecessors and successful successors. Update
M5 with exact bindings, measured consumption, confirmed staging/reset state and
the bounded Real campaign authorization request.

For changes to this plan, check consistency with the PRD and roadmap, local links,
whitespace and documentation-only CI selection; obtain an independent read-only
review. This revision changes no runtime APIs, schemas, request ceilings,
deployment authority or production scope.
