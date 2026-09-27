# M4 — Simulation hardening and Balanced acceptance

**State:** Planned. **Coverage:** AC01–AC03, AC05–AC08, AC10–AC13.
**Predecessor:** [M3](M3-completion.md). Apply [EXECUTION](EXECUTION.md).

## Entry gate and spending handoff

Reconcile M3's complete simulated runs and measured request/context counts.
Require verified model IDs, token parameters/ceilings, zero automatic provider
retries, actual Dify publication/tool binding, and per-node reservation evidence.
Inspect source/configuration for hidden provider retries, not just node toggles.
An opaque unbounded node is not acceptable for paid readiness.

Before the unattended milestone starts, bundle model/binding confirmation, any
private credential handoff, staging release access and paid campaign authorization.
Propose one Balanced run per persona, plus a separately stated finite successor
allowance if the operator wants repair-and-rerun without another handoff. Show
worst-case total request allowance including successors, not just per-run figures.
No image spending is authorized in Balanced mode. Without paid approval, complete
the simulated portion but do not claim the milestone exit.

## Required simulated campaign

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

## Balanced configuration and runs

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
   clean reviews, publish/synchronize/deploy if needed, then start a linked successor
   only within the approved campaign allowance. No silent paid trial loops.
5. Record real usage/latency and reported cost; distinguish estimates or unavailable
   fields. Save tester/judge reports but label visual judgments as based on
   simulated images, not evidence of provider image quality.

## Publication and exit

Use EXECUTION C/D for every relevant correction; do not waive CI because a prompt
change is small. Dify-only updates require graph/prompt checks and two reviews,
publication/tool sync/read-back, but not an unchanged application deployment.
App changes require the normal PR/CI/staging cycle.

Exit: all named simulated scenarios and all three Balanced cases pass, no real
image calls, complete artifacts/reports, request enforcement verified, and no known
technical blocker. Record failed predecessors and successful successors. Update
M5 with exact bindings, measured consumption, confirmed staging/reset state and
the bounded Real campaign authorization request.
