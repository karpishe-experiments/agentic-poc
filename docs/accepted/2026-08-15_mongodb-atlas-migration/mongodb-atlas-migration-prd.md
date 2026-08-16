# Product Requirements Document: MongoDB Atlas persistence migration

**Status:** Approved 2026-08-15

**Issue:** #14 — Migrate local SQLite database to MongoDB Atlas

**Date:** 2026-08-15

**Authority:** This approved document is the persistence addendum to the accepted Kids Booklet PRD and supersedes its libSQL/SQLite runtime requirements only where they conflict with MDB-001 through MDB-008. The accepted Kids Booklet PRD, experiment brief, and root repository guidance reference this addendum; all unrelated product requirements retain their existing precedence.

## 1. Product summary

The Kids Booklet POC currently stores application and runtime-agent state in a local libSQL/SQLite file. This change replaces SQLite runtime persistence with MongoDB, configures a MongoDB Atlas database for the deployed data store, and provides one controlled migration of the current local database into Atlas.

The migration must preserve existing application behavior and repository boundaries. It is a persistence-platform change, not a redesign of the booklet workflow, agent-management experience, document model, asset storage, or hosting architecture.

## 2. Goal and completion criteria

The goal is to run the existing application against MongoDB and safely transfer the current local SQLite data to Atlas.

The work is complete when:

- the application has one MongoDB runtime persistence implementation and no SQLite runtime fallback;
- an operator can configure the required Atlas resources and application secrets from documented steps;
- the current SQLite database has a verified backup and has been imported into Atlas without changing its schema or logical records;
- imported data and key relationships have been reconciled successfully;
- existing booklet, job, evidence, export, and runtime-agent flows pass against MongoDB; and
- rollback to the preserved SQLite application version and source database is documented until human acceptance is complete.

## 3. Scope

### 3.1 In scope

- The official MongoDB Node.js driver behind the existing repository and application-service boundaries.
- MongoDB collections that closely mirror the current SQLite tables and preserve existing string IDs, numeric millisecond timestamps, serialized JSON values, and asset URIs.
- MongoDB indexes, transactions, and conditional atomic updates needed to retain current integrity and concurrency behavior.
- A repeatable database-initialization command for collections, indexes, and required runtime-agent defaults.
- Manual MongoDB Atlas setup instructions for the cluster, database user, network access, secrets, and connectivity verification.
- A versioned, one-time SQLite-to-MongoDB migration utility with backup, validation, safe rerun, and reconciliation reporting.
- MongoDB-backed automated tests using an isolated in-memory replica set.
- Documentation and environment-contract updates required by the migration.

### 3.2 Out of scope

- Running SQLite and MongoDB as interchangeable runtime backends.
- Continuous, incremental, or bidirectional synchronization between SQLite and MongoDB.
- Moving generated images, fonts, intermediate files, or PDFs from the filesystem to object storage.
- Provisioning or deploying the application itself.
- Atlas infrastructure-as-code, multi-region architecture, production-grade disaster recovery, or broad operational hardening.
- Product, workflow, agent, UI, or schema redesign unrelated to persistence compatibility.

## 4. Users and primary flows

### 4.1 Operator setup

The operator follows repository documentation to create the smallest suitable Atlas cluster, create a least-privilege application database user, configure network access, store the connection values as secrets, initialize the database, and verify connectivity. Credentials must never be written to logs, migration reports, or tracked files.

### 4.2 Local and automated development

Normal development uses a configured MongoDB replica set, including Atlas or another compatible MongoDB deployment. Automated tests use `mongodb-memory-server` in replica-set mode so tests remain isolated from shared Atlas data and can exercise transactions.

### 4.3 Data migration and cutover

The operator stops writes to the SQLite-backed application, creates and verifies a backup, prepares an empty Atlas database with collections and indexes only, and runs the importer against an explicitly supplied SQLite source path. Migration setup must not insert defaults before import. The importer validates the source, writes its runtime-agent records and all other stable-ID records, and emits a machine-readable reconciliation report.

The application configuration is switched to Atlas only after the report succeeds. Until then, the existing SQLite-backed application version and untouched source database remain the rollback path. Destructive cleanup of either database is never automatic.

## 5. Persistence design constraints

- MongoDB is the only runtime database after cutover. SQLite support remains only in the migration utility for reading the legacy source.
- The initial collection model mirrors existing tables rather than embedding or redesigning domain records. Existing repository interfaces should remain stable where practical.
- Every existing SQLite string `id` maps directly to the MongoDB document `_id`. Repositories map `_id` back to the existing domain `id` field at their boundary; documents do not store a second `id` field or use generated `ObjectId` values.
- Existing numeric millisecond timestamps and serialized JSON fields retain their current application-facing representations to avoid unrelated contract changes.
- Existing unique constraints become MongoDB unique or partial unique indexes, including booklet artifact types, message sequences, job idempotency keys, version numbers, active manager/specialist coverage, and active versions per logical agent.
- Operations that currently change multiple records atomically continue to use transactions. Compare-and-swap revisions, card-response claims, and generation-item claims use conditional atomic updates and must fail safely when state is stale.
- MongoDB does not provide the current relational foreign keys. Repository writes, initialization, import validation, and reconciliation must reject missing or incompatible referenced records.
- Binary assets remain under `DATA_ROOT`. Asset documents retain their existing URI and metadata, and migration verification reports unresolved asset paths without copying or deleting files.

## 6. Configuration and initialization

Runtime configuration uses:

- `MONGODB_URI`: secret MongoDB connection string;
- `MONGODB_DATABASE`: application database name; and
- the existing `DATA_ROOT`: filesystem root for binary assets.

`DATABASE_URL` is removed from the runtime environment contract. The migration utility accepts the SQLite source as an explicit command argument so the legacy source cannot be mistaken for the active runtime database.

Initialization has two explicit phases that are independently safe to repeat. Structure setup creates missing collections and indexes without application records. Fresh-database seeding runs only for a new non-migration database and inserts deterministic runtime-agent defaults when absent. A migration target runs structure setup, imports the source records, and validates runtime-agent coverage without running fresh-database seeding. Both phases must detect incompatible indexes or conflicting records and stop with an actionable error rather than silently changing them.

## 7. Migration and failure behavior

The migration utility must:

1. require explicit SQLite source and MongoDB target inputs and refuse ambiguous or identical source/backup paths;
2. create a transactionally consistent SQLite backup before connecting to the target by checkpointing the WAL, closing the database client, copying the database, recording its size and cryptographic hash, and reopening the copy to verify the migration journal and representative record counts; reuse or extract the existing verified local-backup behavior rather than copying only the main database file;
3. create a disposable working copy from the verified backup and apply any remaining checked-in SQLite migrations to that working copy through the latest supported journal state; never apply schema migrations to the source or verified backup, and reject unknown or newer journal states;
4. validate the upgraded working copy's migration journal, required tables, record shapes, references, and runtime-agent coverage before importing;
5. preserve stable IDs and import collections in a dependency-safe order from the validated working copy;
6. support a safe rerun by treating identical existing target records as already migrated and rejecting non-identical conflicts;
7. avoid deleting, truncating, or silently overwriting target data;
8. leave the SQLite source schema and logical records unchanged, including on failure; WAL checkpointing may change physical file bytes and metadata but must not change the migration journal or application record counts; and
9. write a machine-readable report containing source and backup identity, original and upgraded working-copy journal states, per-collection inserted/already-present/failed counts, integrity results, unresolved asset paths, and an overall pass/fail result.

Connection strings, credentials, and provider secrets are redacted from console output, errors, and reports. A failed import does not authorize automatic target cleanup or source restoration. The operator retains the report and backup, corrects the cause, and reruns or selects a clean target explicitly.

## 8. Functional requirements

- **MDB-001 — Atlas configuration:** The operator shall be able to create the Atlas cluster, least-privilege database user, network access, secret configuration, and verified connection by following repository documentation.
- **MDB-002 — MongoDB runtime:** All repository-backed application flows shall use MongoDB after cutover, with no SQLite runtime fallback.
- **MDB-003 — Behavioral compatibility:** Booklets, artifacts, messages and cards, jobs and items, assets, model-call evidence, quality reviews, approvals, exports, and runtime-agent management shall retain their current externally observable behavior.
- **MDB-004 — Integrity and concurrency:** MongoDB persistence shall retain current uniqueness, lifecycle, active-agent coverage, optimistic revision, idempotency, conditional-claim, and multi-record atomicity guarantees.
- **MDB-005 — Initialization:** Repeatable structure setup shall create required MongoDB collections and indexes without records; a separate fresh-database seed phase shall register deterministic runtime-agent defaults without duplicates or silent conflicts and shall not run before a SQLite import.
- **MDB-006 — One-time migration:** A versioned utility shall back up an explicitly selected SQLite database, upgrade a disposable copy through the latest supported checked-in migration, import that copy with stable IDs, support safe reruns, preserve the source and verified backup, and emit a reconciliation report.
- **MDB-007 — Verification:** Migration verification shall compare per-entity counts and validate references, active runtime-agent coverage, representative booklet state, jobs, evidence, exports, and asset URIs before cutover.
- **MDB-008 — Documentation:** The README, environment example, architecture guide, Atlas setup, migration, rollback, and troubleshooting instructions shall describe verified MongoDB behavior and remove obsolete SQLite runtime guidance.

## 9. Acceptance and verification

### 9.1 Automated evidence

- Fresh MongoDB initialization and a repeated initialization complete without duplicate seeds or indexes.
- Repository integration tests run against an isolated in-memory replica set and cover unique indexes, transactions, conditional claims, optimistic agent-version updates, and complete active-agent resolution.
- Migration tests cover representative SQLite databases from each checked-in migration state, unchanged source schema/journal/logical records, safe reruns, conflicting target records, broken references, and count reconciliation.
- Existing type checking, linting, unit/integration tests, deterministic agent fixtures, and production build pass.
- The fake-provider browser golden path completes with MongoDB persistence, and the resulting booklet PDF is rendered and inspected.

### 9.2 Human acceptance

An operator records:

1. the Atlas project/cluster and database name without exposing credentials;
2. successful least-privilege connection and initialization checks;
3. the verified SQLite backup path and hash;
4. the successful migration report and reconciled record counts;
5. access to representative existing booklet, job, evidence, export, and runtime-agent records through the MongoDB-backed application;
6. a completed existing booklet flow against Atlas; and
7. confirmation that the preserved SQLite source and rollback instructions remain available.

The PRD is not accepted until this human verification is recorded on issue #14. Atlas data or SQLite backups are not automatically deleted after acceptance.

## 10. Risks and minimal mitigations

| Risk | Required mitigation |
| --- | --- |
| MongoDB lacks relational foreign keys | Validate references at repository boundaries and during import/reconciliation. |
| A partial or repeated import creates conflicting data | Preserve stable IDs, accept identical records, reject mismatches, and never silently overwrite. |
| Concurrency behavior changes during the driver migration | Use transactions and conditional atomic updates; retain focused concurrency tests. |
| Tests accidentally modify shared Atlas data | Use an isolated in-memory replica set for automated tests. |
| Atlas secrets appear in evidence | Redact connection details and keep credentials only in ignored or deployment-managed secrets. |
| Filesystem asset references do not resolve in the target environment | Report unresolved paths and keep asset relocation outside this migration. |

## 11. Assumptions and final decisions

- The current data volume is POC-sized and suitable for one controlled import.
- The selected Atlas cluster supports replica-set transactions required by current application behavior.
- The official MongoDB driver is used without an ODM.
- MongoDB replaces SQLite for development and deployed runtime use; dual-backend support is not required.
- Atlas provisioning is manual and documented rather than automated.
- Automated tests use `mongodb-memory-server` in replica-set mode.
- “Deployed database” means MongoDB Atlas; application hosting is not part of this work.
- A separate decision-complete `PLAN.md` must be approved before application implementation begins.

## 12. Implementation tracking

This approved PRD governs issue #14 subject to the authority rule above. Canonical sources now reference this persistence addendum, and [`PLAN.md`](PLAN.md) maps every implementation slice and acceptance check to MDB-001 through MDB-008. No runtime migration work begins before that plan is explicitly approved.
