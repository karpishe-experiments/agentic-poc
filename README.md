# Kids Booklet POC

Kids Booklet is a local, single-user experiment that guides a creator from a rough story idea to an illustrated children’s picture-story PDF. It deliberately favors clear, inspectable workflow behavior over production hardening.

## Requirements

- Node.js 24 recommended (Node 22 minimum)
- npm
- An OpenAI account and API key with access to the configured models
- Poppler for the final PDF visual-inspection workflow (introduced with retained evaluations)

## Quick start

1. Copy `.env.example` to `.env.local` and set `OPENAI_API_KEY`.
2. Install dependencies: `npm install`.
3. Validate credentials and model access: `npm run preflight`.
4. Create local tables: `npm run db:migrate`.
5. Register the bundled visual styles and Nunito font: `npm run seed`.
6. Start the app: `npm run dev`, then visit `http://localhost:3000`.

If your PowerShell execution policy blocks `npm.ps1`, invoke the equivalent commands with `npm.cmd`, for example `npm.cmd run typecheck`.

The quick-start commands were verified in Slice 0 on 2026-08-01. In this Windows shell, use `npm.cmd` in place of `npm` when PowerShell execution policy blocks the npm shim.

## Commands

| Command | Purpose |
| --- | --- |
| `preflight` | Safely validate the local credential and configured model aliases. |
| `dev`, `build`, `start` | Run the Next.js application. |
| `typecheck`, `lint`, `test` | Run focused static and automated checks with fake providers. |
| `test:agent`, `test:e2e` | Run deterministic agent fixtures and the desktop Chromium golden path when those slices are available. |
| `db:generate`, `db:migrate`, `seed` | Generate migrations, migrate the local database, and register checked-in seed assets. |
| `eval:real` | Run a named retained real-provider evaluation after the evaluation slice is available. |

Automated commands never make paid model or image calls. Real-provider work is limited to the explicit evaluation workflow.

## Local data and project references

Runtime state lives under `data/` and is intentionally Git-ignored. Removing it is destructive and is never automated by this project. The root app is configured for a later standalone Node/container path, but deployment is not part of the POC.

- [Experiment brief](docs/experiment-brief.md)
- [Canonical PRD](docs/accepted/2026-08-01_end-to-end-poc/kids-comic-poc-prd.md)
- [Accepted implementation plan](docs/accepted/2026-08-01_end-to-end-poc/PLAN.md)
- [User guide](docs/accepted/2026-08-01_end-to-end-poc/USER-GUIDE.md)
- [Verified lessons](docs/accepted/2026-08-01_end-to-end-poc/LESSONS-LEARNED.md)
- [Implementation issue #6](https://github.com/karpishe-experiments/agentic-poc/issues/6)
