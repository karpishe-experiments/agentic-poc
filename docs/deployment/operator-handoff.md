# Agent-assisted deployment

Use this handoff with Terra High or another coding agent. The [runbook](runbook.md) owns the commands; [deployment contracts](contracts.md) owns the operational invariants. This document adds execution discipline, not deployment authorization.

## Starting prompt

> Follow docs/deployment/runbook.md from the current reviewed commit. First inspect the checkout, required inputs, available tools and existing deployment state. Identify where each command runs: local workstation, Ubuntu VPS, or GitHub Actions. Start with prerequisites and preview. Follow the authorization already supplied in this session; ask only when the next action needs authority or a required input that is missing. Never request secrets in chat. Use silent terminal prompts or protected host files. Execute one checkpoint at a time and verify its success evidence before continuing. If a command fails, capture its exit status and sanitized error, inspect the current state, and use the documented recovery path. Do not invent flags, endpoints, credentials, IDs, or success results. Keep a concise checkpoint record so another session can resume.

## Checkpoints

| Checkpoint | Where | Evidence required before proceeding |
| --- | --- | --- |
| 1. Identify target | Workstation and VPS | Reviewed commit SHA, repository and VPS identity agree; `discover-config` preview identifies the Cloudflare account/zone and Atlas project/cluster, then its applied non-secret configuration records the three hostnames |
| 2. Prepare prerequisites | VPS and provider consoles | Required commands available, capacity checks pass, administrator recovery access confirmed, required provider enrollment and credential scopes supplied |
| 3. Preview setup | VPS checkout | Preview exits zero; proposed resources and target identities inspected; no unresolved drift or permission error |
| 4. Apply setup | VPS checkout | Setup exits zero; Tunnel active; host configuration installed; GitHub configuration and configuration PR created; application containers remain stopped |
| 5. Configure branches | GitHub and VPS checkout | Configuration PR merged with authorization; Infrastructure run succeeds; finalize preview and apply succeed; environment branches exist |
| 6. Activate staging | GitHub Actions | Deploy on `_staging` succeeds; immutable digest and completed operation recorded; Check deployment succeeds |
| 7. Prove staging recovery | GitHub Actions and VPS | Exact backup ID recorded; explicit staging restore succeeds; readiness, authenticated HTTPS, streaming and host restart recovery verified |
| 8. Activate production | GitHub Actions | Staging acceptance is complete and production activation is authorized; Deploy and Check deployment on `_prod` succeed |

Run one environment operation at a time. The Infrastructure workflow uses `master`; application workflows use the matching environment branch. A new branch, a submitted workflow, an active Tunnel process, or a passing mock test does not prove application readiness.

## Record and resume

At each checkpoint, record: commit SHA, checkpoint number, target environment, command or workflow name, run ID/attempt, exit status, sanitized result, and next action. For releases also record the digest and backup ID. Keep this short record in the conversation or an operator-owned note outside Git. Never include tokens, MongoDB URIs, resolved Compose output, Terraform state or saved plans.

When resuming a session, read the record and recheck current workflow, journal and container state. A lost SSH connection does not mean the detached operation stopped. Use the runbook's recovery table before submitting another mutation.

## Failure procedure

1. Stop dependent steps. Record the failing command, exit status and sanitized error.
2. Inspect only relevant state: the Actions run, sanitized operation journal, target container status, or provider resource metadata. Never print full secret-bearing configuration or Terraform state.
3. Classify the failure as missing input, permission, connectivity, incompatible drift, or interrupted operation. If the evidence does not support a classification, say what is still unknown.
4. Use the documented remedy. Verify the previous operation stopped before resume or lock recovery. Never delete a journal, force-unlock Terraform, replace resources, or restore a database merely to bypass an error.
5. If the documented command itself is defective, report the exact defect and proposed bounded fix. Keep infrastructure changes paused until the fix is reviewed and its affected checks pass. Continue independent read-only diagnosis.

For ambiguous Terraform state, ownership conflicts, or partial restores, hand off the sanitized evidence and the exact decision needed for further review. Changing models does not establish success or authorize a destructive operation.
