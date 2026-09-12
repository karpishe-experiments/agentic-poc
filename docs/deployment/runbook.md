# AWS deployment runbook

This runbook provisions and operates the Kids Booklet application in one AWS account. Regional resources use `eu-west-1`. It creates `_staging` and `_prod`; both use real providers. The scripts do not administer MongoDB Atlas.

## Ownership and safety boundary

`master` owns bootstrap and shared infrastructure. `_staging` and `_prod` own their environment infrastructure and application release. GitHub uses OIDC. Application secret values exist only in AWS Secrets Manager.

The normal workflows cannot delete Terraform state, recovery object versions, the retained NAT EIP, or bootstrap security controls. A failed operation keeps the S3 operation lock. Do not delete the lock by hand. Use **Maintenance → Resume** after you inspect and stop the failed workflow and maintenance tasks.

Terraform creates services at desired count zero and a task revision that references an unpublished bootstrap tag. Never start that revision. The first release workflow registers a runnable revision by image digest.

## Prerequisites

- An existing AWS account and permission to create the documented IAM, networking, ECS, CloudFront, WAF, S3, and Secrets Manager resources.
- Repository administrator access.
- MongoDB Atlas administration access.
- CloudShell opened in `eu-west-1`.
- The reviewed deployment-kit commit checked out in CloudShell.

The setup script downloads Terraform 1.11.4 and GitHub CLI 2.78.0 and verifies their published SHA-256 checksums. It uses interactive `gh auth login`; it does not save a GitHub token in AWS or repository secrets.

## One-time setup

Copy the configuration template and set the account and repository identifiers:

```bash
cp infra/config/deployment.env.example infra/config/deployment.env
vi infra/config/deployment.env
scripts/deploy/deploy.sh status
scripts/deploy/deploy.sh setup
```

`status` must print the expected AWS account and authenticated GitHub identity. The first `setup` creates `.deploy/plans/bootstrap.tfplan`; it does not apply it. Review its text and JSON representation, then apply that exact plan:

```bash
scripts/deploy/deploy.sh apply bootstrap
terraform -chdir=infra/terraform/bootstrap output
```

Copy `state_bucket` and `operations_bucket` from the output into `infra/config/deployment.env`. Run setup again:

```bash
scripts/deploy/deploy.sh setup
```

This configures the repository OIDC subject template, deployment environments, AWS role variables, and branch protection. It preserves an existing compatible OIDC template and stops on an incompatible template. It also opens or updates a PR containing only non-secret deployment configuration.

Create and apply each saved plan in order:

```bash
scripts/deploy/deploy.sh plan shared
scripts/deploy/deploy.sh apply shared
scripts/deploy/deploy.sh plan staging
scripts/deploy/deploy.sh apply staging
scripts/deploy/deploy.sh plan prod
scripts/deploy/deploy.sh apply prod
```

Inspect each plan before apply. The apply command consumes the saved plan. Planning rejects protected-resource deletions. Infrastructure creates both services with desired count zero.

Store the six values. Input is silent and sent directly to Secrets Manager:

```bash
scripts/deploy/deploy.sh secrets staging
scripts/deploy/deploy.sh secrets prod
```

For each environment, enter the OpenAI key, MongoDB URI, and Basic-auth password. Use distinct database users and passwords. Staging must address `kids_booklet`; production must address `kids_booklet_prod`.

Print the shared NAT EIP and allow it in Atlas:

```bash
terraform -chdir=infra/terraform/shared output nat_eip
```

Run the maintenance readiness task after an image is available to prove database-scoped access, transaction support, and S3 write access. Atlas configuration remains an administrator operation.

Merge the generated configuration PR after review. Then create missing deployment branches and record the setup checkpoint:

```bash
scripts/deploy/deploy.sh finalize
scripts/deploy/deploy.sh status
```

`finalize` creates `_staging` and `_prod` from the configured `master` commit only when absent. It never resets an existing branch. The expected checkpoint is `s3://$OPERATIONS_BUCKET/setup/status.json` with `status` equal to `verified`.

## Staging asset cutover

Stop the local application that uses `kids_booklet`. On the computer that holds the local assets, assume the `staging_migration_role_arn` bootstrap output for a one-hour session. Export the returned `AccessKeyId`, `SecretAccessKey`, and `SessionToken`, then run:

```bash
export DEPLOYMENT_ENV=_staging ASSET_STORAGE=s3
export ASSETS_BUCKET=<staging-assets-bucket>
export RECOVERY_BUCKET=<staging-recovery-bucket>
export MONGODB_DATABASE=kids_booklet AWS_REGION=eu-west-1
read -rsp "Staging MongoDB URI: " MONGODB_URI && echo
export MONGODB_URI
npm run deploy:migrate-assets -- inventory
npm run deploy:migrate-assets -- copy
npm run deploy:migrate-assets -- verify
```

The migration keeps relative keys, verifies SHA-256 checksums, skips matches, and stops on missing or conflicting content. Retain the verified manifest. Do not activate staging until final verification succeeds. After cutover, local development must use a separate database; do not reconnect a local application to the staging database.

## Routine GitHub use

- **Deploy** runs on a merge to `_staging` or `_prod`, or by manual dispatch. It validates, publishes an immutable commit image, applies environment infrastructure, initializes, releases, and verifies.
- **Infrastructure** plans or applies branch-owned shared infrastructure from `master`.
- **Check deployment** runs liveness and authenticated internal readiness without model calls.
- **Maintenance** performs backup, resume, rollback, or an exact-ID restore.
- **Reset staging** backs up, resets, initializes, and verifies staging. The command rejects production.

All mutating workflows use the `kids-booklet-aws-operation` concurrency group and an S3 conditional lock. Cancellation does not remove the lock.

## Release behavior

A release publishes the image using the commit tag and deploys its digest. It enables persisted maintenance, waits up to 15 minutes for active requests and provider operations, and aborts without force-stopping paid work if draining fails. It stops the old task, creates a verified backup for an existing installation, applies the saved infrastructure plan, initializes idempotently, and starts one task with maintenance still enabled.

Verification covers HTTPS liveness, the authentication gate, MongoDB, runner state, and an isolated S3 create/read/delete probe. It performs no model calls. Maintenance clears only after verification. A failed verification restores the previous task revision while maintenance remains enabled; it does not restore the database automatically.

## Backup, restore, reset, and rollback

Use **Maintenance → Backup** before risky data work. Backups use the pinned MongoDB tools and include the archive checksum, collection inventory, environment, image digest, and asset manifest in the private recovery bucket. This kit guarantees recovery from the latest successful backup; it does not provide continuous point-in-time recovery.

Restore requires the exact backup ID and typed target database. The workflow stops writers, verifies the environment and database metadata, restores, initializes, verifies referenced assets, and only then reopens access.

Reset requires `_staging` and the exact confirmation `kids_booklet`. It preserves recovery records and retained S3 versions. Production reset exits before mutation.

Rollback requires an exact earlier application task-definition ARN. Database state is not changed.

## Interrupted operation recovery

1. Run `scripts/deploy/deploy.sh status` and inspect `operations/current.json`.
2. Confirm the recorded GitHub run is no longer active.
3. Confirm no maintenance task for that environment is running.
4. Resolve the failed step. Do not rerun a provider call whose outcome is uncertain.
5. Select **Maintenance → Resume**. Resume verifies stopped tasks and service stability before it releases the recorded lock.
6. Start the intended workflow again. It reloads persisted application state; it does not replay a lost mutation automatically.

If a release stopped after maintenance was enabled, leave maintenance enabled until the current or previous application revision passes readiness.

## Acceptance checklist

Before first staging activation, verify:

- Terraform created a zero-task service and the bootstrap task revision was never started.
- Secrets do not appear in Terraform state, plans, workflow inputs, logs, or GitHub secrets.
- Atlas accepts only the retained NAT EIP and the environment user has database-scoped access and transaction support.
- The asset migration manifest is complete and checksums match.
- CloudFront HTTPS, Basic authentication, NDJSON/UI streaming heartbeats, and disabled caching behave as expected.
- A staging backup and restore rehearsal succeeds with representative database data and assets.
- A failed readiness check keeps maintenance enabled and restores the prior application revision.
- Concurrent, stale-commit, wrong-branch, stale-plan, and protected-deletion attempts are rejected.

Repeat readiness for production before clearing maintenance. Record the workflow run, commit, image digest, task revision, backup ID, and verification result. Local validation of this repository does not prove AWS or Atlas success; those results exist only after the operator runs setup and the acceptance checks.
