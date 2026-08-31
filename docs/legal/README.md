# Legal documentation

Store legal documentation and legal research in this directory.

## Allowed content

- Public-source legal research.
- Sanitized summaries that contain no confidential, privileged, personal, or regulated information.
- Links to approved access-controlled storage when the link text and URL do not reveal sensitive information.

## Retained uploads

If the user asks to keep an uploaded legal file but gives no destination, store it under `docs/legal/archive/`. Track the uploaded file only when it is small, safe, and non-sensitive.

If uploaded media has an existing online source, add a Markdown link record under `docs/legal/archive/` instead of copying the binary. Include a short description and the source URL. Do not download the online resource unless the user explicitly requests it.

## Content that must stay outside GitHub

Do not commit confidential, privileged, personal, or regulated source material. Do not commit credentials, `.env.local`, application data, or private correspondence. Store these items in approved access-controlled storage. Limit access there to the intended reviewers.

Git retains prior versions. If sensitive material or a secret is pushed, stop work and notify a repository administrator immediately. Revoke the affected credential, link, or access grant. Deleting the file in a later commit does not remove it from Git history.

For more than five images, any video, a PDF larger than 2 MiB (2,097,152 bytes), or ten or more likely accidental non-code files, ask for explicit approval before staging, committing, or pushing. Prefer external storage and add only a safe URL. Delete unintended files or add an explicit rule to `.gitignore`.

Follow the documentation workflow in [`CONTRIBUTING.md`](../../CONTRIBUTING.md).
