# Contributing legal documentation

This workflow is for non-technical collaborators who use VS Code and Codex to edit legal documentation.

It does not change the standard repository workflow for technical collaborators on non-`personal/*` branches.

The current explicitly identified non-technical collaborator is `@Mehdi-varm`. Agents must not infer this status for another collaborator.

`@Mehdi-varm` already has Write access, but GitHub does not currently enforce these rules. Until an administrator completes [`docs/repository-setup-guide.md`](docs/repository-setup-guide.md), use only a personal or task branch, approve the exact commit scope, do not push directly to `master`, and require an administrator to review the pull request before merge.

## Before you start

- Enable two-factor authentication on your GitHub account.
- Keep Write access only. Do not request or grant Maintain or Admin access.
- Do not request or use the application's API keys, MongoDB credentials, `.env.local`, or shared data.
- Keep confidential, privileged, personal, and regulated source material in approved access-controlled storage.

## Make a change

1. Open the repository in VS Code and fetch the latest changes.
2. Check the current branch. If it matches the case-sensitive pattern `personal/*`, stay on that branch. Otherwise, Codex must explain the proposed `agent/legal-<short-description>` branch and get approval before creating or switching to it. An explicit branch request in the current conversation counts as approval. Do not work on `master`.
3. Edit only the intended files under `docs/legal/`. If you keep an uploaded legal file without another destination, use `docs/legal/archive/`.
4. In VS Code Source Control, review the complete file list and every changed line.
5. Ask Codex to explain unexpected files, generated folders, binary files, or merge conflicts. Stop and ask a repository administrator if any remain.
6. Ask Codex to run the documentation checks and independent review.
7. Before Codex creates or amends a commit, review the exact proposed file list and commit summary. Approve them again if the file set or commit scope changes.
8. Codex may stage and push within the approved workflow without another prompt unless another safeguard is triggered. Push the task branch and open a pull request. Complete every applicable checklist item.
9. Wait for one repository administrator to approve the pull request. Do not merge your own pull request.

## Pull-request checklist

- [ ] I reviewed the complete changed-file list and every changed line.
- [ ] The pull request contains only intended files.
- [ ] I did not include credentials, `.env.local`, application data, or private correspondence.
- [ ] I did not include confidential, privileged, personal, or regulated source material.
- [ ] Sensitive source material remains in approved access-controlled storage, and any committed summary or URL is sanitized.
- [ ] Retained uploads are in the nearest relevant `archive/` directory, and online media is represented by a safe Markdown link when possible.
- [ ] The pull request does not contain unexpected generated output or pasted folders.
- [ ] If the change includes more than five images, any video, a PDF larger than 2 MiB, or ten or more likely accidental non-code files, I obtained explicit approval and recorded the reason in the pull request.
- [ ] I stopped and asked a repository administrator about unresolved conflicts or unexpected binary files.
- [ ] I understand that one repository administrator must approve this pull request and that I must not merge it myself.

Do not run `npm run db:reset`, `npm run eval:real`, paid model or image calls, or destructive recovery commands. Documentation work does not require the application to run.

If you push sensitive material or a secret, stop work and notify a repository administrator immediately. Do not try to fix the incident only by deleting the file in a later commit.
