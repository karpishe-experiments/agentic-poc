---
name: dify-operations
description: Configure, test, publish, inspect, or recover this repository's Dify Cloud or Community agents, workflows, and tools. Use for workspace operations, not Dify source development or Booklet runtime implementation.
---

# Dify operations

Read the [issue #66 runbook](../../../docs/accepted/2026-09-26_codex-dify-access/runbook.md)
before operating a workspace. Its capability matrix distinguishes verified paths
from pending probes. Installation or an advertised command is not live evidence.
For the Community host, also read the
[issue #69 operating runbook](../../../docs/deployment/dify-community.md).
Cloud and Community sessions, state directories, workspaces, and credentials
are separate. Select and verify the intended host before each mutation; do not
carry a Cloud capability result over to Community without a live check.

Use the registered local-stdio Dify MCP first. Read current tool schemas before
calling them. When a required operation is unavailable, use the official
`difyctl` skill and installed command descriptors, then Codex browser automation
for remaining gaps. Do not create a second bridge or use guessed Console APIs.
Report a gap if no tested interface can complete the operation unattended.

Verify the host, workspace, target ID, resource type, and current state. New Agents
are distinct from legacy apps: `agent.*` tool names do not prove New Agent editing
or publication support. Keep draft changes, workflow publication, and Workflow as
Tool synchronization as separate checkpoints. Read back the bound version and test
the published behavior after synchronization.

Before changing configuration, retain a private backup outside Git. Include
separately managed files, skills, bindings, and publication identifiers where
available. Do not claim identity-preserving rollback when only reconstruction
was tested. Record new identities and rebind affected dependants after recovery.

Use metadata rather than credential values. Credential entry is a private user
handoff. Never put secrets in tool arguments, chat, exports committed to Git, or
evidence. Inspect uncertain mutations and run state before retrying; a missing
response does not prove that a provider call or publication did not occur.

This skill grants no spending, deletion, deployment, credential rotation, workspace
upgrade, or broader access authority. Follow the task's authorized targets and
budget. Simulated probes must contain no real model/image calls; balanced and real
runs require their explicit limits. Preserve the completed Booklet experiment.

For evidence, record interface/version, target type and ID, exact operation,
observed outcome, trace or run identifier, usage if reported, and remaining gaps.
Do not present local checks as workspace verification. Keep one canonical matrix
in the runbook instead of duplicating the operational status in this skill.
