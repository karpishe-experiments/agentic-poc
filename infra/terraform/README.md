# Terraform integration contract

Use the deployment runbook and `scripts/deploy` entrypoints for account operations.
These roots do not contain secret values. They pin Terraform 1.11.4 and the AWS
provider 6.10.0.

| Root | State key | Owner |
| --- | --- | --- |
| `bootstrap` | `kids-booklet/bootstrap.tfstate` | CloudShell administrator |
| `shared` | `kids-booklet/shared.tfstate` | `master`, GitHub environment `_shared` |
| `environment`, `environment=staging` | `kids-booklet/staging.tfstate` | `_staging` |
| `environment`, `environment=prod` | `kids-booklet/prod.tfstate` | `_prod` |

The key prefix follows the `project` variable. The environment root reads bootstrap
and shared outputs from their state keys. Backend initialization must set
`use_lockfile=true`. Plan roles can write the corresponding lock object but cannot
write state payloads or read application secret values.

Bootstrap starts with a local backend. After its first successful apply, setup
writes the ignored `bootstrap/backend.generated.tf` containing an empty S3 backend
block and runs `terraform init -migrate-state` with the generated bucket, region,
key, and lock settings. Preserve the initial `oidc_provider_arn` and
`create_service_linked_roles` inputs in setup checkpoints. An existing unmanaged
OIDC provider is passed by ARN; one created by this root must remain managed by
this root on reruns. The same ownership rule applies to service-linked roles.

## Outputs consumed by scripts

Bootstrap exports `state_bucket`, `operations_bucket`, `oidc_provider_arn`,
`oidc_include_claim_keys`, `roles`, `execution_role_arns`, `task_role_arns`, and
`maintenance_role_arns`. Runtime role maps use `staging` and `prod` keys. GitHub
role keys are `shared-plan`, `shared-apply`, and
`{staging,prod}-{plan,apply,release,maintenance}`.

Shared exports `vpc_id`, `private_subnet_ids` keyed by environment, `nat_eip`,
and `nat_allocation_id`.

Environment exports one `deployment` object:

- `environment`, `cluster`, `cluster_arn`, `service`, `repository_url`.
- `task_definition_template` and `maintenance_task_definition_template`: complete
  objects accepted by `aws ecs register-task-definition --cli-input-json` after
  replacing their container image with an immutable digest.
- `maintenance_task_definition`: the bootstrap maintenance revision. Its
  unpublished image is deliberate; never run it before registering a real image.
- `subnet_ids`, `security_group_ids`, `buckets` keyed by
  `assets|diagnostics|recovery`, and `secrets` keyed by environment-variable name.
- `url`, `distribution_id`, and `log_group`.

The service starts with zero tasks. Terraform ignores service desired count and
selected revision; release scripts own these values. The application container is
named `application`; the maintenance container is named `maintenance`.
Maintenance commands override the latter container's command. Both templates use
the same image, separate task roles, and the three injected secrets.

## Validation and limits

Run `terraform init -backend=false`, `terraform validate`, and `terraform test`
in each root, plus `terraform fmt -check -recursive infra/terraform`. Tests use
mock AWS providers and do not contact AWS. They check IAM policy quotas, trust,
environment isolation, private-subnet layout, and task-template separation.

Provider lock files contain the platform archive hashes from HashiCorp's
6.10.0 checksum manifest, including Linux for CloudShell and GitHub runners.
Local validation cannot prove live IAM authorization, account quotas, OIDC token
issuance, Atlas connectivity, or CloudFront behavior. Setup acceptance must
exercise those checks in the target account before activation.

CloudFront ingress uses AWS's managed origin-facing prefix list. This is an
explicitly supported VPC-origin configuration and consumes 55 security-group
rule slots. The ALB is internal. [AWS VPC-origin prerequisites](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-vpc-origins.html)

The OIDC `context` key expands directly to `environment:<name>`; the subject
does not include a literal `context:` segment. Trust also binds repository and
owner IDs, branch, and the role-specific reusable workflow.
[GitHub custom OIDC subjects](https://docs.github.com/en/actions/reference/security/oidc#example-requiring-a-reusable-workflow-and-other-claims)

## Consolidated deployment entrypoint

`scripts/deploy/aws-deployment.sh` is the only deployment shell entrypoint. It uses named arguments, previews by default, and requires `--apply` for mutation. GitHub workflows execute the checked-in copy. A CloudShell operator can paste the same file without a checkout; it materializes the canonical Terraform roots into a private temporary workspace and verifies every embedded file before planning.

The Terraform files in this directory remain the reviewable source. Run `node scripts/deploy/generate-embedded-terraform.mjs` after a Terraform change, then `node scripts/deploy/sync-runbook.mjs`. CI checks that the embedded bundle and the runbook copy match. No secret, state, saved plan, application data, or generated account configuration is embedded.
