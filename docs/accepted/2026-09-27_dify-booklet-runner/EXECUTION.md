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
   descriptors. For a required user action, send one consolidated handoff listing
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

Technical access is not authority. The current request asks for advance approvals;
it does not itself approve all of the following. Record the user's actual answer
and scope before marking a row granted.

| Grant | Exact bounded scope | Current state |
| --- | --- | --- |
| Repository/release | Same issue branch; reviewed PRs to master and staging; wait for required CI; merge without admin bypass; staging Deploy and Check deployment; fix in-scope failures | Requested; no answer recorded |
| Browser control | Dify administration and Booklet staging verification in the current chat only | Only read-only Dify capacity/New Agent inspection granted in this chat; edits and Booklet browser verification remain ungranted |
| Dify writes | Create, edit, test without provider calls, publish and restore new `issue65-` probe/suite resources; existing Booklet Dify resources, credentials and workspace plan unchanged | Granted by the operator in this chat on 2026-09-27 |
| Private setup | Login for the interface that fails; provision required suite execution keys and callback bindings privately; any direct-provider secret stays inside Dify | CLI and MCP inventory authenticated; new-suite bindings remain unverified |
| Reset | Exact local database and resolved asset directory; exact staging database `kids_booklet` and full asset bucket after inventory/backup | Not granted for concrete targets |
| Balanced spending | Identified model, token/retry bounds and total campaign run allowance, including failed successors | Not granted |
| Real spending | Identified image/text bindings and total campaign allowance, including failed successors | Not granted |
| Probe cleanup | Explicit list of disposable resource IDs; no prefix-wide deletion | Not granted; retaining probes is acceptable |

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
Run focused tests after each slice. Do not start paid calls to debug basic schemas.

Before publishing the candidate configuration/code:

1. Freeze the candidate diff and run affected validation. Record commands/results.
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

### Outstanding execution dependencies

| Dependency | Required proof/handoff | Blocks |
| --- | --- | --- |
| Modular capacity/invocation | Non-billable module/caller probe, quota and publication behavior | Full-suite packaging |
| Publication/sync/restoration | Deterministic failure, repair, publish and restore cycle | Unattended Dify operation |
| Runtime credentials/callbacks | Private bindings, authenticated fixture round trip and runtime result recovery | Deployed end-to-end simulation |
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
