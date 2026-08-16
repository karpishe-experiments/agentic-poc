# MongoDB Atlas setup and SQLite migration

This operator-run procedure provisions the issue #14 database, imports the current SQLite database once, verifies it, and keeps rollback recoverable. Keep the application stopped or on the old release until the import report is verified. The migration command never modifies its source file and never deletes Atlas data.

## Provision Atlas

1. Create or select an Atlas project and create the smallest suitable cluster that supports replica-set transactions.
2. Under **Database Access**, add a dedicated application user with `readWrite` only on the application database. Generate a unique password.
3. Under **Network Access**, allow only application/operator egress IPs. Avoid `0.0.0.0/0`; remove any temporary broad rule after discovering the exact IP.
4. Use **Connect → Drivers → Node.js** to copy the SRV URI. Store the completed value as the `MONGODB_URI` deployment secret; never put it in Git or reports.
5. Store a simple, non-reserved database name such as `kids_booklet` as `MONGODB_DATABASE`.

## Initialize a new database with no SQLite import

With both environment variables configured, run:

```text
npm run db:setup
npm run db:init
npm run seed
npm run db:verify
```

Setup is repeatable and rejects incompatible indexes. Initialization creates exact deterministic runtime-agent defaults and visual catalog entries; a different record with the same ID is a conflict.

## Import SQLite

Stop SQLite writers, identify the exact source path, and run:

```text
npm run db:setup
npm run db:verify -- --structure-only
```

Then, only after confirming all SQLite application and job writers are stopped, run:

```text
npm run db:import:sqlite -- --source ./data/booklets.db --target-database kids_booklet --confirm-writes-stopped --data-root ./data/assets
```

Use a clean target database and do not run `db:init` before this import. The importer creates required structure and imports the source's existing seeded records itself.

The command writes `output/backups/mongodb-atlas/<timestamp>/source.db`, `working.db`, an immutable SHA-256 `manifest.json`, and `migration-report.json`. It migrates only the working copy through frozen SQLite migrations, maps each string `id` directly to MongoDB `_id`, preflights target identities, performs safely rerunnable inserts, verifies references and active-agent coverage, compares per-collection counts, and proves the source logical state is unchanged. Credentials are redacted.

Review the report before cutover. `status` must be `passed`, source/target counts must match, and unresolved asset URIs must be understood. A rerun succeeds only for exact matches. Any different target document with the same `_id` aborts without overwriting it.

## Cut over and accept

1. Preserve the SQLite source, backup, manifest, and reconciliation report.
2. Configure the application with the verified Atlas variables and restart it.
3. Run `npm run db:verify -- --report <migration-report.json>`, then `npm run preflight` when real OpenAI access is needed.
4. Inspect the booklet list, a representative booklet, jobs, evidence, exports, asset-backed pages, and `/admin/agents`; all eight runtime slots must be healthy.
5. Complete the fake-provider booklet golden path and inspect its downloaded PDF before accepting cutover.

## Roll back

Stop the MongoDB-configured application, restore the prior application version and SQLite configuration, and restart it against the preserved source. Do not write to both databases or attempt synchronization. Atlas cleanup is a separate manual action after retained evidence is no longer needed.

## Troubleshooting

- Authentication: verify the database user, password escaping, scoped grant, and complete SRV secret.
- Server selection: verify the Atlas IP list, DNS/SRV resolution, cluster availability, and firewall.
- Transactions: confirm the target is a replica set and the Atlas tier supports transactions.
- Index conflicts: inspect the named index; do not drop it until its ownership and resident data are understood.
- Import conflicts: compare the reported collection and `_id`; use the intended clean target or reconcile manually. There is intentionally no overwrite flag.
- Missing assets: restore the preserved filesystem `DATA_ROOT`; importing metadata does not upload binary assets.
