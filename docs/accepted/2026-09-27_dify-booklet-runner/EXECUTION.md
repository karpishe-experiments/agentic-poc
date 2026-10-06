# Shared milestone execution procedure

Applies to M0–M6. [PRD.md](PRD.md) is the product contract; [PLAN.md](PLAN.md)
is the roadmap. Read this file and the selected milestone, not a second competing
implementation plan. Target staging only; no production promotion.

## Status and change surface

This package prepares implementation. It does not mark any runtime milestone
complete. Expected changes are the new Dify suite, normal Booklet contracts and
services, a small runner UI, focused tests and operating evidence. Keep the
existing MongoDB, asset store, deployment system and access gate. No PDF, new
queue service, custom agent editor, account system or infrastructure platform.

Inspected baseline on 2026-09-27:

- Issue branch: `agent/issue-65-dify-booklet-runner`, tracking its exact origin
  counterpart; draft PR #68 targets `master`.
- Remote master: `3e16b41f9f7ceb47b0df6fc67ee7c814e57a17f8`.
- Remote staging: `612297bcbb695b7189ad2824d98493a8c4bcf333`; it contains trial
  changes absent from master. Do not assume staging equals master.
- CLI inventory confirms owner access to workspace
  `98c18fae-e555-47f7-9869-5d602a3dca04`. After private cookie import, MCP
  `app.list` succeeded and returned `booklet_illustrator` and `story_writer`.
  MCP `workspace.list` also verified the intended Sandbox workspace; `snippet.list`
  succeeded with no existing snippets. `workspace.get` returned HTTP 404; use the
  working list operation. This was the planning baseline; subsequent deterministic
  write/publication/restoration results are recorded in [M0](M0-readiness.md).
  Authentication does not prove capacity, runtime recovery or provider access.
- Current code has eight artifact types, local runtime-agent seeds, and a
  sequential in-process job runner. These are transition work, not new-suite proof.
- The staging reset script deletes the entire configured staging asset bucket,
  not just experiment objects. Its exact target must be approved before use.

Recheck these facts at entry. Never copy credential values into this file.

Current target after issue #69: Community at `https://dify.uniwares.co.uk`,
workspace `ffac910f-2786-490e-90d8-07243d49741b`, with separate MCP/CLI sessions.
The Cloud facts above remain historical. Use [M0](M0-readiness.md) for current
probe identifiers and the [Community runbook](../../deployment/dify-community.md)
for access limitations and platform readiness. Community adoption does not grant
paid execution, staging deployment, resets or deletion of Cloud resources.

## A. Entry gate — revise before implementing

Track three readiness states separately:

- **Local implementation:** sufficient contracts and fixtures for the slice.
- **Unattended staging verification:** required access, bindings, release authority
  and setup are verified.
- **Paid acceptance:** models, accounting, limits and finite campaign authority
  are verified in addition to the staging prerequisites.

A later readiness state is not a prerequisite for independent earlier work.

1. Read current PRD, selected milestone, predecessor exit evidence and actual
   code. Fetch remote refs; inspect branch/upstream, worktree and open PRs.
   Preserve unrelated work. Keep all issue corrections on the same issue branch.
2. Compare planned interfaces and Dify bindings with the completed predecessor.
   Revise this milestone's file now: record reused code, changed assumptions,
   tests and release scope. Do not silently change product requirements.
3. Identify every dependency needed for this milestone's exit. Verify each before
   its dependent operation, not before unrelated local implementation. Record
   `verified`, `not needed`, or `handoff required`, with dated evidence.
4. Resolve discoverable IDs/settings through repository, MCP or inspected CLI
   descriptors. Record manual actions only in the readiness register in B; milestone
   files retain technical evidence and link to that register. Send one consolidated handoff listing
   exact target, reason, private-entry location, requested authorization and
   how Codex will verify success. Never ask for secrets in chat.
5. If an essential handoff remains, pause the dependent operation. Independent
   implementation and simulated tests within existing authority may continue.
   Do not claim the milestone ready for unattended completion or promise an unattended
   milestone with an unresolved login, provider, reset or release gate.
6. Record the ready contract: code baseline, Dify publication IDs, target database
   and storage, test cases, authorized operations and bounds. Then execute through
   the exit without routine operator clicks. Reopen the gate only for changed
   scope, revoked/expired access or a newly discovered external blocker.

## Sol Low execution packages

Use GPT-6 Astra/high to resolve consequential unknowns and prepare the next
bounded slice. Use GPT-6 Sol/low for implementation and straightforward fixes.
Prepare each package inside its existing milestone file after the required
predecessor evidence is available; do not create another plan hierarchy.

Each runnable slice uses this compact format:

| Field | Required content |
| --- | --- |
| Goal and components | One observable result, exact affected components and existing services to reuse |
| Contract and examples | Concrete input/output fixtures, persisted before/after states and relevant error outcomes |
| Ordered edits | Implementation order with a runnable verification point; resolve consequential choices before handoff |
| Verification | Exact focused commands, required setup and expected results |
| Completion and escalation | Evidence needed to finish; unresolved dependencies and conditions requiring design review |

Link shared requirements instead of copying the PRD. Mark an unverified binding
or capability pending; do not invent it to make a package appear complete.
Prepare detailed M1 slices from M0 results. Independent local slices can proceed
with explicit fixtures while their staging bindings remain pending.

Sol/low runs the focused checks and corrects straightforward failures. Escalate
to Sol/medium when diagnosis remains unclear after a focused reproduction and
one evidence-based correction. Use Astra/high when a fix changes a contract or
architecture, or a required Dify capability is unavailable. Record the resolved
decision in the same package before dependent implementation continues.
Use Astra/high for the two independent reviews required by section C. Model
selection does not change operation authority, request limits or acceptance.

## B. Authorization register

This is the canonical **readiness and manual-handoff register** for M0–M6.
Technical access is not authority. Record verification and permission separately;
never infer a grant from a working login. These are the latest recorded results,
not fresh live checks. Recheck the required row before dependent execution.

| Dependency / exact target | Technical status and evidence | Private reference / location (no values) | Required action / authority | Blocks / verification |
| --- | --- | --- | --- | --- |
| Community control: `https://dify.uniwares.co.uk`, workspace `ffac910f-2786-490e-90d8-07243d49741b` | MCP/CLI inventory and deterministic control passed; [M0](M0-readiness.md) | Separate Community CLI profile and local `DifyWf-Community-Codex` state; [access guide](../../dify-getting-started.md) | Private login only for an expired/failing interface. New `issue65-` model-free writes/publication/restoration granted in this chat on 2026-09-27; preserve existing Booklet resources, credentials and plan | Dependent Dify control; verify exact workspace with inventory, publication/read-back and applicable tool sync |
| Runner app/callback bindings: issue #65 Community apps and Booklet staging | Sixteen M3 bindings live and prepared; J12 draft `f70bc4bc-7253-4031-8f9d-eb1e3aaf7df1` and judge draft `89f1adcd-1073-460d-98a3-e4df35c4263c` remain unpublished. Final helper/host-validation candidate exists; [M3 preparation](M3-completion.md#final-binding-preparation-candidate) | Reuse `issue65-m3-bindings.dpapi.xml`; final output `issue65-m3-j13-bindings.dpapi.xml` and protected `DIFY_BOOKLET_RUNNER_SETTINGS_JSON`; existing callback secret `BOOKLET_TOOL_KEY` in Dify | After final publication review, use the existing J12 helper with `-Profile m3-j13` to collect only J12/judge keys. If a valid seventeen-binding file exists, reuse it instead. Credential entry remains operator-only | Dependent suite activation; read back all eighteen publication IDs, synchronize applicable tools and prove authenticated runtime/callback round trip |
| Image transport/accounting: selected Community image workflow | Local ordered transport/recovery candidate exists; live runtime ownership, size and provider reference/accounting proof pending; [M3 entry gate](M3-completion.md#entry-gate) | Existing image app binding; provider credentials inside Dify only | Resolve model-free capabilities first; privately configure only missing approved provider binding | Dependent final-page/Real execution; verify order/digests, runtime access, output recovery, retries and pre-call reservations |
| Data/assets: staging `kids_booklet` and `kids-booklet-staging-assets` | Saved M1/M2 artifacts and byte retrieval passed; [M1](M1-runner.md), [M2](M2-references.md) | Existing protected staging DB/storage configuration | Reuse access; private repair only if required checks fail. No production data or credentials | Dependent persistence/storage; verify current readiness and original-byte retrieval without destructive changes |
| GitHub/release: issue branch → `master`, reviewed staging delivery | Prior release/CI/deploy/check evidence in [M1](M1-runner.md), [M2](M2-references.md); candidate checks still required | Existing GitHub CLI/MCP session and protected deployment access | Runner merge/staging deployment granted on 2026-10-04 in this chat after required review/CI. Preserve Cloud/production; exclude resets, paid calls, credential entry and existing Dify-resource changes | Release only; verify exact PR SHA/checks, required human reviews, deploy digest and staging Check |
| Staging delivery exception: `agent/issue-65-community-probe-staging` | Selective delivery used; [M1](M1-runner.md), [M2](M2-references.md) | Same GitHub/deployment access | Granted on 2026-10-04 for selective reviewed runner commits; main implementation/corrections stay on issue branch; no unrelated imports | Staging delivery; inspect complete release diff and required CI/reviews |
| Browser control: read-only Dify capacity/New Agent inspection and runner UI | Prior browser evidence in [M0](M0-readiness.md), [M1](M1-runner.md) | Private browser login; no cookie values in evidence | Runner UI verification granted on 2026-10-04 in this chat. Dify edits/credential entry require their separate authority; authorization does not carry to another chat | Browser verification only; inspect allowed UI flows and retain sanitized evidence |
| Reset: staging `kids_booklet` and entire `kids-booklet-staging-assets` bucket | Granted/executed 2026-10-04; Reset `37216104737`, Check `37216248316`; backup/targets in [M1](M1-runner.md#current-staging-transition-evidence) | Protected staging configuration and retained private backup | No further reset needed merely for a milestone. A new reset needs exact-target authorization, backup and evidence preservation; local/prod/Dify resources excluded | Only a necessary clean-baseline transition; verify inventory, backup, target isolation and post-reset Check |
| Balanced campaign: three persona runs on staging | Model/token/retry/internal-call enforcement pending; [M4](M4-balanced.md) | Text provider credentials inside Dify; approved model/binding references | Not granted. Bundle missing setup and finite campaign approval; default three initial runs, zero successors, ≤500 LLM requests, zero real images | Paid Balanced calls; verify models, branch routing, reservations and approved run/successor allowance |
| Real campaign: ordered 3/5/8-page staging runs, each plus cover | M4 completion and image-provider readiness pending; [M5](M5-real.md) | Text/image provider credentials inside Dify; approved model/binding references | Not granted. Default three initial runs, zero successors, ≤500 LLM and 46 real image requests; any additional allowance explicit | Paid Real calls; verify M4 successes, reference support, accounting, settings and approved finite campaign |
| Probe cleanup: explicitly listed disposable IDs only | Retained probes documented in [M0](M0-readiness.md) | Existing Community control profile | Not granted; retaining probes is acceptable; no prefix-wide deletion | Cleanup only; verify exact IDs and confirmation before removal |

Update a row when evidence or scope changes, including its date and link. Milestone
files keep observed results and detailed setup procedures, not a second manual
action queue. If a required dependency is missing, add its exact target and private
reference here before the consolidated handoff; do not invent a credential name.
Ask again only for new resources, changed scope, expired/revoked access or exhausted
campaign authority. An unresolved row blocks only its dependent operation.

Codex may select and record the simplest verified layout: independent modules
first, small focused groups when necessary, never one all-role workflow. Verify
capacity before creating the full suite. Ask again only for a change to scope,
cost, workspace plan or preservation requirements. Packaging does not expand
the operation grants above.

Ask for all grants required for the selected milestone together at entry. Existing
grants can cover later milestones within the same scope. Browser authorization
does not carry into another chat. Do not create a new key if an applicable one
already exists. A new Dify app normally needs its own app execution credential;
do not assume the old manager key can execute a different app.

Paid campaign approvals must bound the number of runs as well as requests per
run. Default request for M4/M5 is one run per persona; repairs do not silently
grant paid successors. The operator may preauthorize a finite successor allowance
at entry to permit unattended repair-and-rerun. Simulated development runs have
no campaign-count cap, but each run has a bounded loop.

## C. Implementation and two clean reviews

Use one working branch and sequential integration. Delegate bounded read-only
investigation, tests or reviews where useful; do not let reviewers edit the diff.
Use the validation levels below. Do not start paid calls to debug basic schemas.

### Validation levels and result reuse

| Level | When | Required checks |
| --- | --- | --- |
| Implementation loop | After a bounded slice or correction | Smallest relevant test files or named cases, focused lint and independent review of changed behavior. Immediately check persistence, authorization, recovery and provider-accounting regressions when those boundaries change. |
| Local checkpoint | Before a work-in-progress commit | Reuse still-valid focused results/reviews; inspect the entire proposed commit, secrets/unexpected files, whitespace and affected documentation. Obtain review for any newly included behavior; no automatic broad-suite rerun. Label unfinished acceptance explicitly. |
| Publication checkpoint | Frozen candidate before code/configuration publication | Typecheck, lint, plan/CI-selected affected suites, required agent checks and applicable browser/contracts checks; two consecutive clean independent reviews of the exact candidate and evidence. Required CI still runs. |

For M0–M6, these levels govern when milestone verification commands run. Lists of
broad checks in slice packages are publication sets, not instructions to repeat
all checks after every edit or local commit. Historical test results remain evidence,
not a requirement to repeat their commands.

Record commands, test scope, result, source/configuration input identity and test
environment assumptions in the existing milestone evidence. Reuse passing results
only while relevant inputs are unchanged. Corrections invalidate affected results,
not unrelated suites. Use clean validation inputs when stale generated files or
old output copies contaminate a checkout; do not label a scoped substitute as a
passing standard typecheck.

Check test prerequisites before expensive campaigns. Use non-secret test fixtures
and isolated resources, never paid execution or live data to satisfy test setup.
After a failure, inspect the failed step and run a focused reproduction first.
Do not repeat an unchanged deterministic failure or hide it with test retries.
Do not run duplicate broad commands concurrently; keep MongoDB integration files
serial. Run one broad local set per frozen candidate, not per small edit. Repeat
broad checks when shared behavior, suite assumptions or other relevant inputs
change; otherwise rerun affected checks only. CI selectors and required checks are
unchanged. Live acceptance follows deployment; mocks or browser discovery alone
cannot replace it.

Before publishing the candidate configuration/code:

1. Freeze the candidate diff and complete publication-level validation, reusing
   still-valid results. Record commands/results and relevant input identities.
2. Independent read-only review A checks the complete milestone diff and acceptance
   available evidence, including Dify configuration and release compatibility.
   Live acceptance of an unpublished release is not a prerequisite for this review.
3. Fix every actionable blocker; rerun affected checks. Any relevant edit resets
   the clean-review count to zero.
4. Review again until one clean review is obtained, then perform a second separate
   read-only review of the same candidate and evidence. Prefer a fresh reviewer
   context. Two views of the same review are not two reviews.
5. Only two consecutive clean reviews permit publication. Optional quality/polish
   suggestions are not blockers. Do not expand scope to satisfy them.

This requested iterative review rule governs these milestones instead of the
generic skill's two-correction stopping default. Stop for genuine scope or access
changes, not simply because an in-scope correction needed another pass.

After deployment, record live acceptance evidence. A discovered defect requires
affected validation and two clean reviews of the correction before publication.
Recording successful evidence alone does not require another application deployment.

### Suite publication safety

Before changing a published suite, stop new dispatch and inspect active operations.
Pause alone does not establish that in-flight work has stopped. Let it finish or
reconcile uncertain outcomes before publishing to bindings it may still use.
If an outcome cannot be established, block that dependent change; do not repeat
the paid call. Publish, synchronize applicable Workflow Tools and read back their
bindings. Successor runs record the new configuration. Claim version isolation
only when the selected Dify interface has demonstrated it.

Community M0 proved unpublished-child-draft isolation but **not** transitive
version pinning: refreshing a child Workflow Tool changed later executions of
the same pinned published caller. Freeze and record the effective child bindings
as well as the caller configuration; drain before their synchronization. See
[M0 binding evidence](M0-readiness.md#binding-change-and-restoration-evidence).

### Execution readiness dependencies

Section B owns all manual actions, permissions and private credential references.
The table below is a technical evidence index, not another handoff queue.

| Dependency | Required proof/handoff | Blocks |
| --- | --- | --- |
| Modular capacity/invocation | Separate invocation and explicit lineage transport passed. Community app-quota behavior and installed-host preflight checked on 2026-10-04; see M0. Actual suite bindings, workload measurements and Booklet lineage persistence remain pending | Full-workload readiness and dependent M1 integration; not independent local or deterministic slices |
| Publication/sync/restoration | Deterministic cycle and binding restoration passed in M0; verify each later candidate | Publication of later suite configurations |
| Runtime credentials/callbacks | Diagnostic round trip/runtime lookup passed on 2026-10-03; callback-based interrupted-response recovery passed on 2026-10-04; full-runner bindings and no-ID recovery remain unresolved | Dependent runner integration; unknown outcomes without retained IDs |
| Image transport/accounting | Reference inputs, output transfer, retries and reservations | Real image execution; fixture transfer also precedes simulated image work |
| GitHub/staging delivery | Checks/reviews, merge/deploy access and compatible release path | Unattended release |
| Reset | Exact-target inventory, backup/summary and authorization | Clean-baseline transition |
| Paid campaigns | Models/settings and finite run/successor allowances | Balanced and Real execution |

Codex resolves discoverable facts and bundles only remaining private setup and
authorization handoffs. Do not add services, upgrade the workspace, delete existing
Dify resources or increase limits to bypass a blocker.

## D. PR, CI, merge and staging loop

Run only with the corresponding grant in B. Use GitHub MCP where available and
`gh` for missing operations. Use Git for local changes. Do not bypass protection,
force-push, auto-approve as another reviewer, or delete the issue branch.

1. Inspect the final file list for secrets/unexpected artifacts. Commit the reviewed
   files, push the same-named remote, and create/update the issue PR to master.
   Keep #68 draft until its documentation scope is complete and reviewed.
2. Record head SHA. Observe required checks for that exact head/merge result.
   Poll every 15–30 seconds and provide concise progress. A timed-out observation
   is not a failed run: inspect the same Actions run ID before retrying anything.
3. For a failed check, inspect its failed step, fix narrowly on the issue branch,
   rerun affected local checks and the two-review sequence, push, and wait for the
   new exact SHA. Do not rerun a deterministic failure unchanged.
4. When required checks and required human reviews are satisfied, merge using a
   merge commit and the observed head SHA. Do not use an admin override. Verify
   actual merged state and merge SHA. Missing mandatory human review is a handoff.
5. Fetch master and fast-forward the same issue branch to the merge commit where
   possible. For subsequent milestones, open a follow-up PR from that branch.
   Never create a second issue implementation branch. Preserve its origin upstream.
6. Documentation-only milestones need no deployment. For runtime milestones, open
   a release PR from the reviewed issue branch to `_staging`. Inspect its complete
   merge diff against staging, including trial-only code. Test the merge result
   in an isolated local worktree if needed. Do not merge staging into the issue
   branch or import all trial code solely to resolve a release conflict.
7. Resolve any release conflict or compatibility defect on the issue branch;
   repeat validation/reviews and master publication before release. If this cannot
   be done without importing unrelated work or changing branch policy, pause for
   a bounded release decision. Do not silently overwrite staging history.
8. Require release-PR CI, then merge to `_staging`. Capture the resulting commit
   and its automatically triggered `deploy.yml` run ID. Do not dispatch a second
   deploy while it is active. Validate contains no production/container build;
   Deploy builds or reuses the immutable image and verifies it before host mutation.
9. Wait for that Deploy run to finish. Require success and matching commit/digest.
   Dispatch `check-deployment.yml` with ref `_staging`, input `environment=staging`;
   capture and wait for its exact run. Inspect readiness and the milestone smoke
   flow at `https://booklet-staging.uniwares.co.uk` using authorized authenticated
   access. A green CI or liveness endpoint alone is not deployment verification.
10. If deployment fails, inspect summary and retained host-operation state before
    another mutation. Follow [deployment recovery](../../deployment/runbook.md).
    Keep host operations serialized. Do not cancel an active host operation or
    automatically restore a database. Prepare corrective code on the issue branch.
11. Record code SHA/digest, PRs, CI/deploy/check IDs, Dify published/tool bindings,
    smoke run IDs and results in the milestone exit evidence. Update issue #65
    evidence, without closing it unless separately requested.

Minimal CLI observation examples (after resolving the actual numbers/IDs):

```text
gh pr checks <pr-number> --required
gh run view <run-id> --json status,conclusion,headSha,jobs
gh workflow run check-deployment.yml --ref _staging -f environment=staging
```

Inspect existing runs before selecting the run from a dispatch. Match workflow,
branch, SHA and creation time; do not use an unrelated latest run as evidence.

## E. Milestone exit record

Append one compact current record to the milestone file: entry baseline and plan
revision; authorization references; implemented files/contracts; local tests;
review A/B identities and results; PR/CI/release IDs; Dify publication/tool version;
acceptance run/booklet IDs; failures and successor links; next-milestone deltas.
Do not retain secrets, raw auth headers or credential-bearing exports in Git.
Keep traces/assets in their existing private storage and link sanitized evidence.

No milestone is complete on document creation alone. Unverified live capability
must remain labeled unverified, even when local tests pass.
