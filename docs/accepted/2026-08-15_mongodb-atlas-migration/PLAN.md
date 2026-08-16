# MongoDB Atlas Persistence Migration — Implementation Plan

**Status:** Implemented and Atlas cutover verified 2026-08-16 — awaiting user-authorized issue closure

**Issue:** #14 — Migrate local SQLite database to MongoDB Atlas

**Authoritative addendum:** [`mongodb-atlas-migration-prd.md`](mongodb-atlas-migration-prd.md)

**Surrounding product authority:** [`../2026-08-01_end-to-end-poc/kids-comic-poc-prd.md`](../2026-08-01_end-to-end-poc/kids-comic-poc-prd.md)

**Date:** 2026-08-15

## 1. Outcome and execution gate

This plan replaces the application runtime's Drizzle/libSQL persistence with the official MongoDB Node.js driver, preserves the existing repository and application-service contracts, provisions MongoDB Atlas through a documented operator flow, and imports the current SQLite database through a verified one-time migration.

The PRD is approved, but application implementation must not begin until this plan is explicitly approved. Approval authorizes only the slices below. Atlas account actions, credentials, the final import, cutover, commit/push operations, and issue closure still require the relevant user access or direction at execution time.

Implementation is complete only when automated MongoDB evidence passes, the real local SQLite database has a verified backup and successful Atlas reconciliation report, the application completes its existing golden path against Atlas, and the user records human acceptance on issue #14.

## 2. Locked decisions

### 2.1 Dependencies and runtime

| Concern | Decision |
| --- | --- |
| MongoDB driver | Pin `mongodb@7.5.0`; it includes TypeScript types and supports the repository's Node.js `>=22` constraint. Do not add `@types/mongodb`. |
| Test server | Pin `mongodb-memory-server@11.2.0` as a dev dependency and use `MongoMemoryReplSet`, not standalone `MongoMemoryServer`, because repository operations require transactions. |
| Runtime database | MongoDB is the sole application runtime database after Slice 3. There is no feature flag, adapter selector, or SQLite fallback. |
| Legacy reader | Retain `@libsql/client` and `drizzle-orm` only for the versioned SQLite backup/working-copy importer. Remove `drizzle-kit`; no new SQLite migrations are generated. Legacy packages may be removed only with a separately approved retirement of the importer. |
| Data shape | Keep one MongoDB collection per current table. Use current snake-case collection names and camel-case document fields. Preserve serialized JSON as strings and timestamps as integer milliseconds. |
| Identity | Map every SQLite string `id` directly to MongoDB string `_id`. Repository mappers expose it as domain `id`; documents never store a second `id` or generated `ObjectId`. |
| Validation | Zod/domain schemas and explicit repository checks remain authoritative. Do not duplicate all contracts as MongoDB `$jsonSchema` validators. Use indexes for database-enforceable uniqueness. |
| Transactions | Use `ClientSession.withTransaction` with primary reads, snapshot read concern, and majority write concern for every existing multi-record atomic operation. |
| Assets | Keep binary assets under `DATA_ROOT`; migrate only asset/style/export metadata and verify referenced local paths. |
| Atlas | Manual setup with the smallest cluster that supports transactions, one least-privilege `readWrite` application user scoped to the selected database, and IP-specific network access. Do not use `0.0.0.0/0` in the documented default. |

Package versions were checked against the npm registry on 2026-08-15. Relevant implementation references are the MongoDB Node.js driver transaction guide, partial-index guide, and `MongoMemoryReplSet` documentation.

### 2.2 Environment and commands

The final runtime environment is:

```dotenv
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>/?retryWrites=true&w=majority
MONGODB_DATABASE=kids_booklet
DATA_ROOT=./data/assets
```

`MONGODB_URI` is secret. Logs and reports may contain only a redacted host label and database name. `DATABASE_URL` is removed from runtime parsing and `.env.example`; the importer accepts the SQLite source only through a CLI argument.

All database entry points validate `MONGODB_DATABASE` against `^[A-Za-z0-9][A-Za-z0-9_-]{0,62}$` and reject the reserved names `admin`, `config`, and `local`. The URI scheme must be `mongodb://` or `mongodb+srv://`. Test/e2e/evaluation helpers additionally require their exact guarded prefix before they can drop a database.

Final scripts:

| Script | Behavior |
| --- | --- |
| `db:setup` | Connect to `MONGODB_URI`/`MONGODB_DATABASE`, create collections and exact indexes, and verify them without inserting application records. |
| `db:init` | Run structure setup, then idempotently insert and verify default runtime-agent definitions/versions/events for a fresh non-migration database. |
| `seed` | Keep copying bundled styles/fonts into `DATA_ROOT`; write and verify style/font metadata through MongoDB repositories. |
| `db:import:sqlite` | Require `--source <path>`, `--target-database <name>`, and `--confirm-writes-stopped`; back up, upgrade a working copy, preflight, import, and write a reconciliation report. The target flag must exactly match `MONGODB_DATABASE`. |
| `db:verify` | Default to full connectivity/index/active-agent/reference verification and optionally reconcile a supplied import report. `--structure-only` verifies connectivity and indexes for an intentionally empty migration target. Never mutate data. |
| `preflight` | Verify ignored `.env.local`, MongoDB connectivity/indexes/active models, and existing provider access checks without creating collections or seeds. |

Remove `db:generate`, `db:migrate`, and standalone `db:backup` from the public command table after the importer absorbs their remaining legacy behavior. Keep the existing SQLite SQL migrations frozen under a clearly named legacy directory for working-copy upgrades.

Operational scripts load `.env.local` without overriding already supplied process variables. This lets e2e/evaluation runners pass their owned replica-set URI and guarded database name, while normal `dev`, setup, seed, verification, and import commands use the operator's local configuration. `preflight` shares the validated server-environment and repository checks instead of maintaining a second model/database contract in an untyped script.

## 3. MongoDB contracts

### 3.1 Client and ownership

Create a server-only database context with:

```ts
type MongoDatabaseContext = {
  client: MongoClient;
  database: Db;
  collections: MongoCollections;
  close(): Promise<void>;
};
```

- `createMongoDatabase({ uri, databaseName })` always creates an independently closable context for tests and scripts.
- `getDatabase()` reads validated server environment values and returns one `globalThis`-cached context for Next.js routes, Server Actions, services, and the job runner. This prevents a new pool on every service construction or development hot reload.
- Environment parsing and client construction are lazy: importing a database, service, route, or page module performs no connection or ping. The first runtime database operation connects. Consequently `next build` does not require MongoDB credentials or a reachable server; `preflight`, setup, seed, verification, and runtime requests perform connectivity checks explicitly.
- Application call sites replace `createDatabase()` defaults with `getDatabase()` but retain explicit repository injection for tests.
- Every service constructor resolves dependencies without touching runtime configuration when repositories are injected: use the supplied repositories first, otherwise use a supplied database context, otherwise call `getDatabase()`. Nested services receive the same supplied context/repositories. This keeps unit tests and `next build` from opening an accidental connection.
- The app context uses `serverSelectionTimeoutMS: 5_000` and `maxPoolSize: 10`; tests use the replica-set URI defaults.
- Tests and scripts must close owned clients. App request handlers never close the shared client.
- `withMongoTransaction(context, callback)` passes a session to every operation, uses snapshot/majority settings, and contains database work only. File/network/provider effects and caller-supplied IDs/timestamps stay outside retryable callbacks. Attempt-local audit/carried-approval UUIDs may be generated inside because aborted attempts remain invisible and only the committed attempt's IDs escape.

Vitest uses one `MongoMemoryReplSet` started by global setup. The setup passes its URI to workers with Vitest's typed `provide`/`inject` facility and stops it in global teardown; tests do not discover a database from `.env.local`. Each integration test creates a unique `kids_booklet_test_<uuid>` database, runs structure setup plus the seed mode required by that test, and drops only that exact database in teardown. Tests may run in parallel because database names are isolated; they never share collections or use Atlas. The first-run MongoDB binary download uses the version pinned by `mongodb-memory-server` and may use its normal user cache; no downloaded binary is committed.

### 3.2 Document conventions

Define typed document interfaces and collection handles in `db/` without exposing driver documents to application services:

- `_id: string` is mandatory for every persisted domain record.
- Reference fields keep existing string IDs, `null`, and required/optional semantics.
- Existing `*Json` fields remain serialized strings; repository mappers continue parsing them through current Zod schemas.
- Existing boolean `isActive` becomes a MongoDB boolean.
- Existing enum/check constraints are enforced by the repository's Zod/domain validation before writes and again when rows are read for runtime use.
- Admin inspection preserves its current tolerant malformed-row behavior; runtime resolution stays strict.
- No document receives opaque driver metadata, schema-generated timestamps, or automatic `ObjectId` values.

### 3.3 Collections and indexes

Structure setup creates these 18 collections. `_id` uniqueness is implicit; all named indexes are checked for exact keys, uniqueness, partial filters, and sort direction. A same-name or same-key incompatible index is a setup failure, not an automatic replacement.

| Collection | Required indexes beyond `_id` | Key reference checks |
| --- | --- | --- |
| `booklets` | `booklets_updated_at_idx { updatedAtMs: -1 }` | `coverAssetId`, when present, identifies an asset. |
| `artifacts` | unique `artifacts_booklet_type_unique { bookletId: 1, artifactType: 1 }` | Booklet exists; `currentVersionId` belongs to this artifact. |
| `artifact_versions` | unique `artifact_versions_artifact_number_unique { artifactId: 1, versionNumber: 1 }` | Artifact exists; optional source version exists. |
| `artifact_dependencies` | unique `artifact_dependencies_pair_unique { downstreamVersionId: 1, upstreamVersionId: 1 }`; `artifact_dependencies_upstream_idx { upstreamVersionId: 1 }` | Both versions exist and are distinct. |
| `messages` | unique `messages_booklet_sequence_unique { bookletId: 1, sequence: 1 }` | Booklet exists. |
| `cards` | `cards_booklet_status_updated_idx { bookletId: 1, status: 1, updatedAtMs: -1 }`; sparse `cards_message_idx { messageId: 1 }` | Booklet exists; optional message/artifact belongs to it. |
| `card_responses` | `card_responses_card_created_idx { cardId: 1, createdAtMs: -1 }`; `card_responses_followup_created_idx { followupStatus: 1, createdAtMs: -1, cardId: 1 }` | Card and optional follow-up message exist. |
| `assets` | unique `assets_uri_unique { uri: 1 }`; `assets_booklet_kind_created_idx { bookletId: 1, kind: 1, createdAtMs: -1 }` | Optional booklet/source asset exists. |
| `style_catalog` | `style_catalog_sort_order_idx { sortOrder: 1 }` | Preview asset exists. |
| `generation_jobs` | unique `generation_jobs_idempotency_unique { idempotencyKey: 1 }`; `generation_jobs_booklet_status_created_idx { bookletId: 1, status: 1, createdAtMs: 1 }`; `generation_jobs_runnable_idx { status: 1, createdAtMs: 1 }` | Booklet exists. |
| `generation_items` | unique `generation_items_job_key_unique { jobId: 1, itemKey: 1 }`; unique `generation_items_job_position_unique { jobId: 1, position: 1 }`; `generation_items_claim_idx { jobId: 1, status: 1, position: 1 }` | Job and optional asset exist. |
| `model_calls` | `model_calls_booklet_started_idx { bookletId: 1, startedAtMs: 1 }`; sparse `model_calls_job_idx { jobId: 1 }`; sparse `model_calls_agent_version_idx { agentVersionId: 1 }` | Booklet and optional artifact/job/agent references exist. Legacy null attribution remains valid. |
| `agent_definitions` | none | — |
| `agent_versions` | unique `agent_versions_agent_number_unique { agentId: 1, versionNumber: 1 }`; partial unique `agent_versions_active_manager_unique { role: 1 }`; partial unique `agent_versions_active_specialist_unique { skillId: 1 }`; partial unique `agent_versions_active_agent_unique { agentId: 1 }`; `agent_versions_agent_created_idx { agentId: 1, createdAtMs: 1 }`; `agent_versions_skill_active_idx { skillId: 1, isActive: 1 }`; `agent_versions_parent_idx { parentVersionId: 1 }` | Definition and optional parent version exist; all current role/status/provider/effort/max-turn/revision rules pass. |
| `agent_version_events` | `agent_version_events_version_created_idx { agentVersionId: 1, createdAtMs: 1 }` | Definition/version IDs are retained even for the existing eligible draft-delete audit event. Metadata remains at most 4096 characters serialized. |
| `quality_reviews` | `quality_reviews_booklet_gate_status_idx { bookletId: 1, gate: 1, status: 1, createdAtMs: -1 }`; `quality_reviews_booklet_status_created_idx { bookletId: 1, status: 1, createdAtMs: -1 }` | Booklet and listed artifact versions exist. |
| `approvals` | `approvals_version_scope_subject_idx { artifactVersionId: 1, scope: 1, subjectKey: 1 }` | Booklet/version and optional response/review/source approval exist. |
| `exports` | `exports_booklet_updated_idx { bookletId: 1, updatedAtMs: -1 }` | Booklet/version and optional asset/page assets exist. |

The partial active-agent filters are exact:

```ts
{ isActive: true, role: "manager" }
{ isActive: true, role: "specialist", skillId: { $type: "string" } }
{ isActive: true }
```

Their unique keys are `role`, `skillId`, and `agentId`, respectively. Setup tests must prove inactive and retired records do not collide.

### 3.4 Repository behavior and transaction mapping

Keep the existing `Repositories`, `AgentRepository`, method inputs, domain outputs, and application error messages. Move shared repository type declarations away from Drizzle row types, and map typed Mongo documents at the database boundary.

| Operation group | MongoDB implementation decision |
| --- | --- |
| Create booklet | One transaction inserts the booklet, eight artifacts, and initial message. Validate IDs and absence first; duplicate `_id` or booklet/type maps to the existing conflict behavior. |
| Artifact version | In one transaction read the artifact, allocate `max(versionNumber)+1`, insert version/dependencies/carried approvals, update current version, and invalidate affected downstream artifacts. Retry the complete transaction up to three times only when the compound version index reports an allocation race. |
| Artifact approval | One transaction validates the current version, inserts approval, and updates artifact state when its approval coverage is complete. |
| Message append/card persistence | Allocate `max(sequence)+1` and insert/update message/card documents in one transaction. Retry sequence-index races up to three times. |
| Card response | One transaction detects duplicate/conflict state, updates the card and saved message projection, and inserts the response. Follow-up claims use `findOneAndUpdate` with an exact status predicate. Recovery changes only `running` responses back to `pending`. |
| Job create | One transaction returns an existing idempotency-key match or inserts the job and all items. A duplicate-key race rereads and returns the winner. |
| Item claim | In one transaction use sorted `findOneAndUpdate({ jobId, status: "pending" }, ..., { sort: { position: 1 } })`, increment attempts, and update the job state. |
| Item completion/failure/retry | One transaction inserts assets, conditionally updates the item, counts remaining items, and derives job status. Stale item state is a no-op/conflict according to the current method contract. |
| Interrupted work | Conditional `updateMany` operations recover running responses/items/jobs; list-runnable ordering remains deterministic. |
| Evidence/reviews/exports/assets | Preserve current serialization and ordering. Replace the SQLite JSON `LIKE` quality check with a candidate query by booklet/gate/status followed by parsed exact array membership; do not use substring or regex membership. Job completion inserts asset metadata and updates item/job state transactionally. Export status, PDF filesystem writes, export-asset metadata, PDF artifact revision/approval, and evidence retain their current ordered, recoverable steps; do not claim atomicity across filesystem effects. Standalone evidence inserts remain single-document writes after reference validation. |
| Agent snapshot | Resolve one manager and all seven specialists in one snapshot transaction so activation affects only later calls. Validate exact registered-skill coverage before returning. |
| Agent lifecycle | Keep optimistic `revision` predicates. Create/edit/fork/confirm/activate/retire/delete and audit events execute in one transaction. Fork version-number races get the same bounded duplicate-index retry. Activation compares both observed active IDs, deactivates replaced versions, activates the target, and records events atomically. |

MongoDB error translation is centralized: duplicate key on a known index becomes the corresponding existing domain conflict; transient transaction labels are handled by the driver; unknown driver errors are logged safely and become the current generic interruption/admin error. Never render raw database messages or connection strings.

### 3.5 Implementation layout and public interfaces

- In the final tree, `db/client.ts` owns `MongoDatabaseContext`, `createMongoDatabase`, `getDatabase`, and the transaction helper; `db/documents.ts`, `db/collections.ts`, and `db/indexes.ts` own document types, exact collection names/handles, and index specifications.
- `db/setup.ts` owns structure verification and default-agent seeding; `db/seed.ts` keeps filesystem seeds and uses a narrow database seed repository for style/font metadata rather than raw driver calls in the script.
- `db/repositories.ts` and `db/agent-repository.ts` keep the existing application-facing repository types and method signatures while replacing their internals and row mappers.
- During Slices 1–2 only, new implementation files live under `db/mongodb/` and tests import them explicitly while the current central SQLite files continue to serve the app. Shared driver-neutral repository contracts/domain mappers move to `db/contracts.ts` and `db/mappers.ts` so both implementations compile during the staging interval. Slice 3 replaces the central files with the verified MongoDB implementation and moves the frozen SQLite implementation/schema/migrations into `db/legacy/` in one cutover; there is never a runtime selector or supported dual-backend mode.
- `db/legacy/sqlite-schema.ts` and `db/legacy/migrations/` freeze the current Drizzle schema/journal for import only. No app, route, service, job, or normal seed module may import from `db/legacy/`.
- `scripts/setup-mongodb.ts`, `scripts/verify-mongodb.ts`, and `scripts/import-sqlite-to-mongodb.ts` implement the public database commands. Migration-only backup, transformation, report, and reconciliation helpers live under `scripts/sqlite-import/`.
- `tests/helpers/mongodb.ts` owns per-test databases; `tests/global-mongodb.ts` owns the shared Vitest replica set. The e2e runner owns a separate replica set that is passed to the Next.js child through environment variables and always stopped in `finally`.
- Raw collection access is limited to database setup, the importer/reconciler, repository implementation, and narrowly scoped corruption/index assertions in tests. Application services, routes, scripts unrelated to migration, and UI code use repositories.

No HTTP route, card/message wire contract, domain schema, agent skill contract, or UI component API changes. The only application-level type replacement is injected `Database` becoming `MongoDatabaseContext`; repository injection remains the preferred test seam.

| Preserved contract | Persistence obligation |
| --- | --- |
| Artifacts and approvals | Keep eight artifact types, immutable numbered versions, current-version pointers, dependencies, carried approvals, invalidation, and review state exactly as defined by the accepted POC plan. |
| Messages and generative-UI cards | Keep `BookletUIMessage`, serialized card JSON, response IDs/actions, saved message projections, active/submitted/reopened states, and follow-up lifecycle unchanged. |
| Runtime manager and skills | Keep registered skill IDs, manager/specialist routing, model configuration, snapshot isolation, and immutable definition/version/config evidence; persistence never makes model decisions. |
| Image providers and composition | Keep provider request/result schemas, fake/real selection, prompt evidence, page composition, and diagnostics unchanged; provider/network/file work remains outside database transactions. |
| Jobs | Keep job/item types, idempotency keys, deterministic item ordering, attempts, stop-on-failure, retry/continue, and restart recovery; MongoDB supplies only the atomic claim/state transitions. |
| Assets and exports | Keep filesystem URIs, source-asset links, metadata JSON, ordered page asset IDs, PDF artifact/approval flow, and download responses; MongoDB stores metadata but never binary bytes. |

### 3.6 Runtime call sites and usable routes

The runtime switch covers every route and composition root below. All retain their existing request, response, redirect, cache, and user-visible error behavior; only database construction and repository internals change.

| User flow | Routes/composition roots that must use MongoDB |
| --- | --- |
| Create and resume | `/`, `/api/booklets`, `/booklets/[bookletId]`, `/api/booklets/[bookletId]`; booklet creation still atomically creates eight artifacts and the initial message. |
| Guided chat and cards | `/api/chat/[bookletId]`, `/api/booklets/[bookletId]/cards/[cardId]/responses`, `/api/booklets/[bookletId]/cards/[cardId]/reopen`; sequence allocation, response idempotency, and follow-up claims retain current semantics. |
| Artifact review and revision | `/api/booklets/[bookletId]/artifacts/[artifactType]`, its `/approve` route, `/page-plan/comic-lettering`, `/pages/[pageId]/text`, and `/images/regenerate`; current-version links, approvals, invalidation, and replacement assets remain transactional. |
| Background generation | `/api/jobs/[jobId]`, its `/continue` route, `/items/[itemId]/retry`, and `lib/jobs/runner-bootstrap.ts`; conditional claims, restart recovery, progress, and retry behavior remain unchanged. |
| Assets, evidence, and export | `/api/assets/[assetId]`, `/api/booklets/[bookletId]/evidence`, `EvidenceService`, and `ExportService`; filesystem streaming is unchanged and only metadata comes from MongoDB. |
| Runtime-agent administration | `/admin/agents`, its Server Actions, `AgentResolver`, and all application-service default constructors; one snapshot still resolves the manager and seven specialists, while lifecycle writes retain optimistic revisions. |
| Operational scripts | setup, seed, verification, preflight, smoke, e2e, and future real-evaluation composition roots; each owns or reuses a context according to Section 3.1 and closes only contexts it creates. |

Next.js pages and route handlers that touch MongoDB remain on the Node.js runtime and opt out of static generation where their current behavior requires request-time data. The shared driver and legacy SQLite importer must never enter client bundles or Edge Runtime modules.

## 4. Initialization, migration, and cutover

### 4.1 Structure and fresh seed

`setupMongoStructure`:

1. validates the target database name and connects;
2. creates each missing collection explicitly;
3. inspects indexes and creates only missing exact definitions;
4. fails on incompatible definitions without dropping anything; and
5. verifies the reserved `_id` `__mongodb_setup_transaction_probe__` is absent, then in one snapshot/majority transaction inserts and deletes that sentinel in `booklets`, commits, verifies it remains absent, and verifies all required definitions before success. This proves transaction commit support without leaving an application record; an unexpected pre-existing sentinel is a hard failure.

`seedDefaultAgents` runs separately after structure setup for a fresh database. It converts `agentSeedDefaults` plus deterministic definition/event IDs into Mongo documents. For every stable `_id`, absence causes insertion, exact equality is accepted, and any mismatch fails. It then resolves one manager plus seven registered specialists. It never runs during SQLite import.

The existing `seed` command continues to own visual style/font files and metadata through a narrow seed repository. For an absent stable record it inserts the current time once. For an existing record it preserves `createdAtMs` and requires all semantic fields (`_id`, URI, kind, MIME/dimensions, source, metadata, style text/prompt/provenance/order, and preview link) to match. This allows deterministic reruns and imported historical timestamps while rejecting real conflicts.

### 4.2 SQLite import CLI

Command:

```powershell
npm run db:import:sqlite -- --source ./data/booklets.db --target-database kids_booklet --confirm-writes-stopped
```

Safety rules:

- Require the literal `--confirm-writes-stopped` acknowledgement; the utility cannot infer that all SQLite application/job processes are stopped and otherwise exits before backup or target access.
- Resolve the source to an absolute local file, reject memory/remote/parameterized URLs, and refuse paths outside the workspace. Importing an external path is outside this approved plan and requires a plan amendment.
- Require the target database flag to equal validated `MONGODB_DATABASE`; never accept a URI argument or print `MONGODB_URI`.
- Write under `output/backups/mongodb-atlas/<UTC timestamp>/`: `source.db`, `manifest.json`, `working.db`, and `migration-report.json`.
- Open the source without migrations, run SQLite `PRAGMA quick_check`, and capture its journal plus counts for every table present in that journal state. Checkpoint the WAL, recapture and require the same journal/counts, close the client, copy the main file, and hash both the closed source and backup with SHA-256. Reopen the backup read-only and require the same journal/counts and `quick_check` result. Physical source bytes may change because of checkpointing; schema, journal, and logical counts may not.
- Accept only the checked-in Drizzle journal chain `0000_left_sleepwalker` then `0001_demonic_secret_warriors`, verifying the stored migration hashes against the frozen SQL files. Reject a missing journal table, gaps, reordering, changed hashes, unknown entries, or a state newer than `0001`. Copy the verified backup to `working.db`; apply only the missing checked-in migration to that working copy, so a valid `0000` source reaches `0001` and a valid `0001` source is not changed.
- On the upgraded working copy require `PRAGMA quick_check`, an empty `PRAGMA foreign_key_check`, and the exact frozen table/column/primary-key inventory. Read all 18 tables, transform snake-case columns to typed camel-case Mongo documents, map `id` to `_id`, and retain nullable fields/JSON strings. Validate every document, serialized JSON payload, cross-table reference, and domain invariant before connecting to Atlas; preserve the intentional `agent_version_events` audit reference to an eligible deleted draft even when that version/definition no longer exists, matching current SQLite behavior.
- Run `db:setup` behavior on the target, but do not seed defaults.
- Preflight both sides before the first import write. For every source `_id`, missing is insertable and canonical field-for-field equality is already present; any difference is a conflict. Every target document in the 18 application collections must also have an equal source document. Extra target records, conflicts, or invalid target references abort with zero new document writes. An empty target or a partial, equal subset of the source is valid.
- Validate the complete transformed source graph in memory, keep the application and job runner stopped, then insert only missing documents in batches of 100 in this exact dependency order: (1) `booklets`, `agent_definitions`; (2) `artifacts`, `agent_versions`; (3) `artifact_versions`, `messages`, `assets`, `generation_jobs`, `quality_reviews`; (4) `artifact_dependencies`, `cards`, `generation_items`, `agent_version_events`, `style_catalog`, `model_calls`; (5) `card_responses`, `approvals`, `exports`. Forward and circular links are permitted only because the full graph was validated before writes and reconciliation checks it again afterward.
- The full import is intentionally not one long transaction; a transport failure is safely rerunnable because preflight equality is deterministic and stable IDs are preserved. No application process may point at the target until reconciliation passes.
- Reconcile source versus target counts for all imported IDs, canonical document equality, references, indexes, one-manager/seven-specialist coverage, representative booklet/current-version links, jobs/items, model-call attribution, exports, and asset URIs.
- Retain the source, verified backup, working copy, manifest, and report through human acceptance. Cleanup is manual and never part of a normal or failed import.
- In a `finally` path after any target attempt, reopen the source read-only and compare its schema, journal, and logical counts with the pre-checkpoint snapshot. A mismatch forces a failed report and blocks cutover even if target reconciliation passed.

Canonical equality sorts object keys recursively but does not reorder arrays, trim strings, coerce null/missing values, or ignore fields. The transformer creates the exact target shape before comparisons.

### 4.3 Report contract

Write and validate a versioned JSON report:

```ts
type SQLiteToMongoReportV1 = {
  schemaVersion: "1";
  startedAt: string;
  finishedAt: string;
  outcome: "passed" | "failed";
  source: { path: string; byteSize: number; sha256: string; journal: JournalEntry[]; counts: Partial<Record<CollectionName, number>> };
  backup: { path: string; byteSize: number; sha256: string; journal: JournalEntry[]; counts: Partial<Record<CollectionName, number>>; verified: boolean };
  workingCopy: { path: string; originalJournal: JournalEntry[]; upgradedJournal: JournalEntry[]; counts: Record<CollectionName, number> };
  target: { databaseName: string; redactedHost: string };
  collections: Record<CollectionName, { source: number; inserted: number; alreadyPresent: number; verified: number; failed: number }>;
  integrity: Array<{ check: string; status: "passed" | "failed"; detail?: string }>;
  unresolvedAssetUris: string[];
  errors: Array<{ phase: string; code: string; message: string }>;
};
```

Error messages are bounded and sanitized. The report never contains credentials, full connection strings, provider secrets, document JSON payloads, prompt text, or arbitrary driver errors.
Once the timestamped output directory exists, every caught success or failure path writes `migration-report.json` atomically through a temporary sibling and rename. Unreached phases use zero counts plus a sanitized phase error. A forced process termination may leave only the temporary file; a later run neither deletes nor trusts that file and remains safe to rerun. Console output reports the final report path and outcome without printing record contents.

Before any target connection, write `manifest.json` atomically with schema version `1`, creation time, source and backup paths/sizes/SHA-256 hashes, pre/post-checkpoint journal/count snapshots, and the verified-backup result. It is immutable for that run and contains no MongoDB or provider configuration. The report references the same identities; reconciliation rejects a supplied report whose manifest identities do not match.

### 4.4 Atlas setup and cutover runbook

Document these operator steps without automating Atlas. The navigation labels below were checked against the official Atlas documentation on 2026-08-15; the Slice 5 operator confirms them against the current console before recording evidence:

1. Select the Atlas organization/project, open **Database → Clusters**, choose **Build a Database**, and create the smallest Free/Flex/Dedicated option available in the nearest suitable region. Do not load sample data. The tier is accepted only when the setup transaction probe succeeds; otherwise choose the next smallest transaction-capable option. See MongoDB's [cluster creation guide](https://www.mongodb.com/docs/atlas/create-connect-deployments/).
2. Open **Security → Database Access** (shown as **Database & Network Access** in some layouts), add a password-authenticated application database user, and grant only the built-in `readWrite` role scoped to exactly `MONGODB_DATABASE`. Do not retain a wizard-created `Atlas Admin` user for the application. Generate a unique password and store it only in `.env.local`/deployment secrets. Atlas users and database users are distinct, as described in the [database-user guide](https://www.mongodb.com/docs/atlas/tutorial/create-mongodb-user-for-cluster/).
3. Open **Security → Network Access**, choose **Add IP Address** and **Add Your Current IP Address** or enter the exact required IP/CIDR, then save the entry. Do not select public-anywhere (`0.0.0.0/0`) by default. The [Atlas connection guide](https://www.mongodb.com/docs/atlas/driver-connection/) documents both the access-list and driver steps.
4. Return to **Database → Clusters**, choose **Connect → Drivers → Node.js**, and copy the SRV URI. Percent-encode reserved characters in the generated password, retain TLS/retry-write/majority options, and do not commit or print the completed URI.
5. Set `MONGODB_URI` and `MONGODB_DATABASE`, then run `npm run db:setup` followed by `npm run db:verify -- --structure-only`. Full verification intentionally waits until source records have been imported.
6. Stop the SQLite-backed application and job runner, record the current commit and `DATABASE_URL`, and run the import command with `--confirm-writes-stopped` against the real local database.
7. Review a `passed` report and keep its timestamp/hash. Do not cut over on unresolved references, missing required assets, index differences, coverage failures, or count mismatches.
8. Start the MongoDB-backed commit, run preflight, open representative imported booklets/admin evidence, and complete the fake-provider booklet/PDF human path.
9. Record acceptance on issue #14. Keep the SQLite source/backup and prior application commit until that acceptance.

Rollback never mutates Atlas. Stop the MongoDB-backed app, restore the recorded prior application commit/release and its `DATABASE_URL`, reopen the preserved SQLite source, and verify its journal/booklet count. Ask before deleting or replacing any failed Atlas database.

## 5. Incremental implementation slices

### Slice 0 — Authority and planning package

**Requirements:** MDB-008; implementation gate.

- Mark the addendum approved and reference it from the canonical PRD, experiment brief, and repository guidance.
- Add this `PLAN.md`; keep `docs/architecture.md` describing current SQLite behavior until the runtime actually changes.
- Review the plan against all existing repository interfaces, migration states, and acceptance requirements.

**Verification:** Markdown links resolve; `git diff --check`; PRD/plan requirement traceability is complete; explicit plan approval is recorded.

### Slice 1 — MongoDB foundation and isolated test harness

**Requirements:** MDB-001, MDB-004, MDB-005.

- Add pinned dependencies, environment parsing, typed documents/collections, app/test database contexts, transaction helper, structure setup, exact index verification, and deterministic agent seeding.
- Add the shared replica-set test harness and focused tests for `_id` mapping, index definitions/partial uniqueness, setup reruns/conflicts, seed reruns/conflicts, transaction retry behavior, and client lifecycle.
- Keep the production runtime on SQLite during this slice; the Mongo code is an implementation staging area, not a supported dual backend.

**Usable outcome:** a fresh isolated Mongo database can be set up, seeded, verified, queried for complete active coverage, and safely torn down.

**Focused verification:** Mongo foundation tests, environment unit tests, `npm run typecheck`, `npm run lint`.

**Suggested commit:** `feat: add mongodb persistence foundation`

### Slice 2 — Repository port and concurrency parity

**Requirements:** MDB-002, MDB-003, MDB-004.

- Extract repository types from Drizzle-specific inference and implement every current repository method with typed Mongo collections.
- Port document/domain mappers, ordering, JSON parsing, reference checks, transaction boundaries, conditional claims, optimistic revisions, index-conflict mapping, and exact active-agent snapshot behavior.
- Convert integration tests to the replica-set harness. Replace raw SQL assertions with repository reads or narrowly scoped typed collection inspection.
- Add concurrency coverage for artifact/message/agent version allocation, job/card claims, activation replacement, idempotent job creation, stale revisions, and interrupted-work recovery.

**Usable outcome:** application services pass their integration contracts through Mongo repositories while route/runtime composition still awaits the next slice.

**Focused verification:** all repository/service integration tests, agent-management matrix, manager contracts, restart/resume, generation diagnostics, `npm run typecheck`, `npm run lint`.

**Suggested commit:** `feat: port repositories to mongodb`

### Slice 3 — Runtime, scripts, seed, and browser switch

**Requirements:** MDB-002, MDB-003, MDB-005, MDB-008.

- Switch services, routes, Server Actions, job bootstrap, preflight, smoke/evaluation scripts, and seed tooling to the shared Mongo context/repositories. The real-evaluation script owns an isolated in-memory replica set for future runs, exports the same retained JSON/artifact evidence before shutdown, and never points automated evaluation setup at Atlas.
- Replace SQLite e2e preparation with one authoritative parent runner. `scripts/run-e2e.ts` starts and owns `MongoMemoryReplSet`, validates a generated `kids_booklet_e2e_<uuid>` database name, runs structure/default-agent/visual-asset seed, starts the Next.js child with that URI/name, waits for readiness, runs Playwright, and always stops the browser child, Next.js process tree, Mongo client, and replica set in `finally`. `scripts/dev-e2e.ts` uses the same preparation helper but keeps the isolated server/replica set alive until SIGINT/SIGTERM. Remove `scripts/e2e-server.ts` and SQLite `scripts/prepare-e2e.ts`; `playwright.config.ts` owns only test/base-URL/browser/output/one-worker settings and no `webServer` block.
- For future `eval:real` runs, the evaluator starts and owns a separate `MongoMemoryReplSet`, generates a guarded unique database name, runs structure/default-agent/visual seed before provider preflight, passes the context explicitly to services, writes the same immutable manifest/PDF/engineering evidence before shutdown, and closes the client/replica set in `finally`. It never uses Atlas and this migration does not rerun the three retained paid evaluations.
- Remove runtime Drizzle schema/client imports, SQLite environment use, and public SQLite commands. Move frozen schema/migrations/backup inspection under `db/legacy/` for the importer only.
- Update current-state architecture and README only after the switched runtime and focused browser paths pass.

**Usable outcome:** fresh local/test MongoDB completes Home, workspace, agent admin, job recovery, evidence, export, and fake-provider PDF flows with no runtime SQLite path.

**Focused verification:** unit/integration suite, `npm run test:agent`, focused admin/browser flows, golden path, rendered PDF inspection, `npm run build`.

**Suggested commit:** `feat: run kids booklet on mongodb`

### Slice 4 — SQLite importer and reconciliation

**Requirements:** MDB-006, MDB-007.

- Implement the backup/manifest, working-copy upgrade, typed transform/reference validation, target preflight, batched import, reconciliation, report schema, and verification CLI exactly as Section 4 specifies.
- Keep legacy dependencies/imports isolated from application runtime modules and bundles.
- Test fresh `0000`, latest `0001`, identical rerun, partial identical target, extra target record, non-identical conflict with zero document writes, broken source reference/JSON, wrong schema inventory, failed `quick_check`/foreign-key check, unsupported/newer/tampered journal, WAL-backed source, target interruption/rerun, source logical equality after a target failure, redaction, and unresolved assets.

**Usable outcome:** a representative existing SQLite database imports safely into an isolated Mongo replica set with a passed report while source and verified backup remain logically unchanged.

**Focused verification:** importer/backup integration tests, report schema tests, full `npm test`, typecheck, lint, build.

**Suggested commit:** `feat: import sqlite data into mongodb`

### Slice 5 — Atlas configuration, real import, and acceptance

**Requirements:** MDB-001, MDB-006, MDB-007, MDB-008.

- Complete the manual Atlas runbook with the user, configure secrets, verify indexes/coverage, stop SQLite writes, and run the real import.
- Review the report before cutover; run the MongoDB-backed application and human acceptance path against Atlas.
- Confirm retained evaluation artifacts and their trace/cost evidence remain unchanged; do not trigger paid model/image reruns for this persistence-only migration.
- Record command results, report path/hash, limitations, rollback location, and human result on issue #14. Use the capture-project-learnings workflow only for verified reusable findings.

**Usable outcome:** the current local database is deployed in Atlas and the accepted application flow runs against it.

**Verification:** `db:verify -- --report <path>`, representative imported records, full fake-provider golden path/PDF inspection, user acceptance.

**Suggested commit:** `docs: finalize mongodb atlas migration`

## 6. Documentation and operational update matrix

Documentation changes follow verified behavior rather than describing future behavior as current:

| Checkpoint | Required updates |
| --- | --- |
| Slice 0 | The addendum and this plan are linked from `AGENTS.md`, the canonical PRD/plan, and `docs/experiment-brief.md`. README remains truthful about the still-current SQLite runtime. |
| Verified Slice 3 switch | Replace SQLite setup/command/runtime text in `README.md`, `.env.example`, `docs/architecture.md`, and `docs/accepted/2026-08-01_end-to-end-poc/USER-GUIDE.md`; document `MONGODB_URI`, `MONGODB_DATABASE`, `DATA_ROOT`, setup/init/seed/preflight commands, lazy build behavior, local replica-set options, and filesystem-asset limitations. Update `.gitignore` only if the new generated backup/report paths are not already ignored. |
| Verified Slice 4 | Add an exact Atlas/import/verification/rollback/troubleshooting runbook under this migration directory. Include source eligibility, stop-the-app requirement, command examples, output artifacts, report interpretation, reruns, conflict resolution without overwrite, credential redaction, and preservation rules. |
| Slice 5 acceptance | Record the accepted report hash/path and command/human results on issue #14; update this plan's completion evidence without embedding credentials, local absolute paths, or retained document payloads. Historical evaluation artifacts and prior accepted docs are not rewritten. |

`docs/architecture.md` must state the final ownership boundary: MongoDB repositories own runtime persistence; deterministic application services own orchestration and transactions through those repositories; manager/skills own bounded model decisions; SQLite/Drizzle exist only inside the one-time importer. The capture-project-learnings skill runs only after verified behavior reveals a durable reusable lesson.

## 7. Test runners and evidence matrix

Vitest, Playwright, and future real-evaluation processes may create/drop only database names matching their respective guarded prefixes and generated suffixes. Cleanup validates the exact name before `dropDatabase`; no test tool accepts an arbitrary Atlas URI by default. `preflight` performs MongoDB ping, exact-index verification, active-agent coverage, and existing provider/model checks. It does not create data. The agent-fixture suite remains database-free.

| Evidence | Required scenarios |
| --- | --- |
| Document/index unit tests | String `_id`; no duplicate `id`; exact index names/options; partial active filters; conflicting-index refusal; Zod/read mapping. |
| Client/setup tests | Cached app context; independently closable test context; unreachable target timeout; setup rerun; fresh seed rerun and conflict. |
| Repository integration | Every existing repository method; ordering; null/JSON compatibility; missing references; transaction rollback; duplicate-key translation. |
| Concurrency | Two simultaneous artifact/message/agent forks allocate monotonic unique numbers; one card/job item claimant wins; stale agent edit/activation loses safely; idempotent job winner is reread. |
| Runtime agents | One snapshot contains exactly manager + seven specialists; malformed/incomplete coverage blocks runtime; activation affects only later calls; immutable evidence snapshot preserved. |
| Legacy import | `0000` upgraded on working copy; `0001` unchanged; journal tamper/newer state rejected; source/backup hash/count verification; stable `_id`; legacy null attribution. |
| Import safety | All conflicts found before writes; identical rerun; partial identical target; batch interruption and rerun; no delete/overwrite; sanitized failed report. |
| Reconciliation | Per-collection imported-ID counts/equality; reference graph; agent coverage; representative booklet/artifact/job/evidence/export; asset URI resolution. |
| Browser | Home/create/resume, typed card flow, artifact versioning, agent-management lifecycle/replacement, restart recovery, job retry/continue, PDF golden path. |
| Visual/PDF | Render `output/playwright/golden-path-booklet.pdf` with Poppler and inspect page count, square geometry, non-empty placeholders, clipping, overlap, and ordering. |
| Retained evaluations | No changes to three retained real-provider booklet artifacts/manifests/evidence; no paid rerun required. |

Final automated checkpoint:

```powershell
npm run typecheck
npm run lint
npm test
npm run test:agent
npm run build
npm run test:e2e
```

Report every pass/failure and anything not run. Atlas setup/import/human acceptance are separate networked/manual evidence and must not be represented as automated proof.

## 8. Requirement traceability

| Requirement | Implemented by | Acceptance evidence |
| --- | --- | --- |
| MDB-001 Atlas configuration | Slices 1, 3, 5 | Setup/preflight checks and recorded manual Atlas runbook. |
| MDB-002 MongoDB runtime | Slices 2–3 | No runtime SQLite imports/config; complete integration/build/e2e pass. |
| MDB-003 behavioral compatibility | Slices 2–3 | Existing service, agent, browser, job, evidence, and PDF suites. |
| MDB-004 integrity/concurrency | Slices 1–3 | Exact indexes, transaction rollback, claim/CAS/allocation concurrency tests. |
| MDB-005 initialization | Slices 1 and 3 | Structure and seed rerun/conflict tests; migration target proves no pre-seed. |
| MDB-006 one-time migration | Slice 4–5 | Legacy-state/import/rerun/redaction tests plus real backup/import report. |
| MDB-007 verification | Slices 4–5 | Automated reconciliation and `db:verify` against the real report/Atlas target. |
| MDB-008 documentation | Slices 0, 3, 5 | Canonical authority links, current architecture, README/env/runbook/rollback. |

## 9. Risks, rollback, and deferred work

| Risk | Plan control |
| --- | --- |
| Repository rewrite changes behavior | Preserve public repository contracts; port method-by-method; run existing integration/browser evidence before deleting SQLite runtime code. |
| Multi-document callbacks replay side effects | Keep retryable callbacks database-only; precompute externally visible IDs/timestamps and all file/network work, while allowing only the attempt-local audit IDs described in Section 3.1. |
| Allocation races replace SQLite serialization | Compound unique indexes plus bounded retry for version/sequence allocation; explicit concurrency tests. |
| Partial import leaves data | Preflight all conflicts before writes, stable IDs, canonical equality, batched inserts, and safe rerun; never delete automatically. |
| Old journal cannot supply current agents | Upgrade only a disposable copy through frozen migrations, then validate/import. |
| Test binary download is slow/unavailable | Pin package versions, share one replica set per test run, document first-run download/cache, and report a genuine network blocker rather than using Atlas tests. |
| Atlas/network credentials block execution | Complete all local slices first; stop at Slice 5 and request the exact access needed without weakening verification. |
| Filesystem assets are not deployable with a remote app | Application deployment/object storage remain out of scope; validate URIs for the current operator environment and report unresolved paths. |

Rollback before human acceptance uses the recorded pre-migration application commit and preserved SQLite source/backup. There is no down-migration, automatic Atlas cleanup, dual-write mode, object-storage migration, authentication/RBAC project, multi-instance worker lease, or production operations expansion.

## 10. Execution controls and completion checklist

Implementation proceeds in slice order. Each slice ends with its focused checks, a defect-first review of that slice's diff, and zero known correctness/security/data-loss findings before the next slice begins. Any discovered requirement conflict, destructive target cleanup, authority expansion, or change to identity/import/rollback semantics returns to the user for approval and updates this canonical plan before code continues. Suggested commits are checkpoints only; commit, push, Atlas mutation, final import, and issue closure occur only with the user authority described in Section 1.

- [x] This plan is explicitly approved before Slice 1.
- [x] MongoDB structure, seed, repositories, runtime composition, and tests contain no application SQLite fallback.
- [x] Every current repository behavior and concurrency invariant has passing MongoDB evidence.
- [x] Frozen SQLite migrations and dependencies are isolated to the importer.
- [x] The importer passes all legacy, conflict, rerun, redaction, and reconciliation cases.
- [x] README, `.env.example`, architecture, commands, Atlas runbook, and rollback guidance match verified behavior.
- [x] Full automated checkpoint and rendered PDF inspection pass.
- [x] The real SQLite source has a verified backup and a passed Atlas import report.
- [x] Human Atlas golden path is recorded on issue #14.
- [x] Verified durable learnings are captured without rewriting historical evidence.
- [x] Issue #14 remains open until explicit human acceptance and user-authorized closure.
