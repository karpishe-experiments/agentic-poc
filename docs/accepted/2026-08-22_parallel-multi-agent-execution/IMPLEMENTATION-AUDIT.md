# Parallel Multi-Agent Execution Audit

## Result

Verified on 2026-08-22 against the accepted PRD and PLAN. The implementation adds code-registered execution profiles, persisted candidate pools and durable batches, one evolving Agent Run card, selected-only text/image materialization, and target-centric agent management. No automated real-provider calls were made.

## Verification evidence

- Database: `npm run db:setup`, `npm run db:init`, and a repeated `npm run db:verify` passed against `kids_booklet`.
- Static/build: `npm run typecheck`, `npm run lint`, and `npm run build` passed.
- Tests: configured serial `npm test` passed 62 suites / 121 tests; `npm run test:agent` passed all 12 fixtures.
- Browser: `npm run test:e2e` passed 9/9 scenarios. It covers the five admin scenarios, artifact versioning, typed-card restore, PDF golden path, and multi-agent search, concurrent run, explicit result selection, and resulting question card.
- PDF: the fresh `output/playwright/golden-path-booklet.pdf` rendered through Poppler at 144 DPI to seven pages. Visual checks of the first and final pages confirm the expected deterministic fake-provider layout without clipping; all seven rendered pages share the same expected dimensions and successful render output.
- Retained evaluation: `output/playwright/atlas-acceptance` files remain dated 2026-08-16; no retained booklet was overwritten.

## Requirement-level coverage

| Requirement | Scope-matched evidence |
| --- | --- |
| MA-001 | `parallel-agent-execution.test.ts`, card projection repositories, and reload/browser fixtures prove one persisted ready/running/results/completed card. |
| MA-002 | `chat-service.ts`, manager/quality integrations, and golden path prove deterministic routing and direct quality ownership. |
| MA-003 | Candidate-pool and browser multi-selection tests prove first-use searchable non-empty selection and notice text. |
| MA-004 | Execution/card integration fixtures cover saved preferences and Change agents recovery. |
| MA-005 | Execution repository/service stale-preference and no-write tests cover replacement and invalid saved candidates. |
| MA-006 | Text/image Agent Run services and golden path prove sole-candidate automatic start, implicit selection, and normal follow-up. |
| MA-007 | Execution lifecycle tests prove durable batch/item status, attempts, and same-card running projection. |
| MA-008 | Deferred-barrier execution tests prove selected candidate overlap and terminal-only results. |
| MA-009 | Card registry and image/text integration fixtures cover safe summaries, errors, and preview/result affordances. |
| MA-010 | Text/image selected-only materialization, mixed-failure, retry, and no-mutation fixtures prove explicit result authority. |
| MA-011 | Restart/change/history/currentness integration fixtures prove recoverable completed runs. |
| MA-012 | Reference/page generation integrations prove one image Agent Run per item. |
| MA-013 | Sequential generation and item-preference fixtures prove parallel candidates stay within the current item. |
| MA-014 | Candidate asset and composition fixtures prove only the selected source/composed asset becomes active. |
| MA-015 | Card/admin browser tests cover labeled controls, keyboard-operable buttons, status text, focus, and non-forced scrolling. |
| MA-015a | Persisted card projection, typed-card reload, and browser result-selection regression coverage prove state restoration. |
| MA-016 | Agent-management integrations prove unique manager, compatible active pools, and active-version constraints. |
| MA-017 | `tests/unit/execution/execution-profiles.test.ts` and profile contracts prove closed, versioned profile/catalog ownership. |
| MA-018 | Image contract and provider adapter tests prove canonical/native validation and normalized controls. |
| MA-019 | Profile/adapter tests prove code-owned geometry/settings mapping and manager canonical routing. |
| MA-020 | Snapshot, stale-pool/workflow, recovery, and evidence integrations prove frozen execution identity and future-only activation. |
| MA-021 | MongoDB foundation and execution repository tests prove preferences, batches, items, result/provenance persistence. |
| MA-022 | Agent-evidence, diagnostics, pricing, and provider fixtures prove normalized IDs, timing, usage/cost, and safe failures. |
| MA-023 | Admin Playwright tests prove persistent target, agent, and detail selection on one page. |
| MA-023a | Admin browser/integration tests prove search, inactive drafts, activation, and coverage display. |
| MA-023b | Agent-management integrations prove additive activation, last-candidate guards, and atomic manager behavior. |
| MA-023c | Admin tests prove typed settings validation and read-only technical configuration. |
| MA-023d | Draft/lifecycle integrations prove confirmed-version immutability and successor drafting. |
| MA-023e | Narrow-viewport Playwright scenario proves accessible stacked Targets → Agents → Details navigation without overflow. |
| MA-024 | Closed profile/model schemas, admin validation, credential/configuration tests prove code-owned capability limits. |
| MA-025 | Seed, setup, and MongoDB verification prove original text identities plus sole reference/page image coverage. |

## Findings and scope controls

No open implementation defects remain after final review. Real FLUX requests with reference/edit inputs remain intentionally ineligible while assets are filesystem-local; fake adapter fixtures retain full normalization and recovery coverage. This is the approved local-POC boundary, not a fallback.
