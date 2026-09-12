variable "repository" { default = "karpishe-experiments/agentic-poc" }
variable "repository_id" {
  type = string
  validation {
    condition     = can(regex("^[0-9]+$", var.repository_id))
    error_message = "Supply the immutable GitHub repository ID."
  }
}
variable "repository_owner_id" {
  type = string
  validation {
    condition     = can(regex("^[0-9]+$", var.repository_owner_id))
    error_message = "Supply the immutable GitHub owner ID."
  }
}
variable "oidc_provider_arn" {
  type        = string
  default     = null
  description = "Existing GitHub OIDC provider ARN. Setup detects it and preserves its configuration."
}
variable "create_service_linked_roles" {
  type        = set(string)
  default     = ["ecs.amazonaws.com", "elasticloadbalancing.amazonaws.com", "vpcorigin.cloudfront.amazonaws.com"]
  description = "Setup supplies only service-linked roles not already present in this account."
}
locals {
  prefix       = "${var.project}-${var.aws_account_id}"
  environments = toset(["staging", "prod"])
  state_arn    = "arn:aws:s3:::${local.prefix}-state"
  ops_arn      = "arn:aws:s3:::${local.prefix}-operations"
  oidc_arn     = var.oidc_provider_arn != null ? var.oidc_provider_arn : aws_iam_openid_connect_provider.github[0].arn
  scopes = {
    shared  = { branch = "master", environment = "_shared" }
    staging = { branch = "_staging", environment = "_staging" }
    prod    = { branch = "_prod", environment = "_prod" }
  }
  workflow_files = {
    plan        = ["aws-infrastructure.yml"]
    apply       = ["aws-infrastructure.yml"]
    release     = ["aws-release.yml"]
    maintenance = ["aws-maintenance.yml"]
  }
  roles = merge(
    { for scope, cfg in local.scopes : "${scope}-plan" => merge(cfg, { scope = scope, kind = "plan" }) },
    { for scope, cfg in local.scopes : "${scope}-apply" => merge(cfg, { scope = scope, kind = "apply" }) },
    { for scope, cfg in local.scopes : "${scope}-release" => merge(cfg, { scope = scope, kind = "release" }) if scope != "shared" },
    { for scope, cfg in local.scopes : "${scope}-maintenance" => merge(cfg, { scope = scope, kind = "maintenance" }) if scope != "shared" }
  )
}
module "state" {
  source = "../modules/private-bucket"
  name   = "${local.prefix}-state"
}
module "operations" {
  source = "../modules/private-bucket"
  name   = "${local.prefix}-operations"
}
resource "aws_iam_openid_connect_provider" "github" {
  count          = var.oidc_provider_arn == null ? 1 : 0
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  lifecycle { prevent_destroy = true }
}
resource "aws_iam_service_linked_role" "service" {
  for_each         = var.create_service_linked_roles
  aws_service_name = each.value
  lifecycle { prevent_destroy = true }
}
data "aws_iam_policy_document" "ecs_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [var.aws_account_id]
    }
    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values   = ["arn:aws:ecs:${var.aws_region}:${var.aws_account_id}:*"]
    }
  }
}
resource "aws_iam_role" "execution" {
  for_each           = local.environments
  name               = "${var.project}-${each.key}-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_trust.json
}
resource "aws_iam_role_policy" "execution" {
  for_each = local.environments
  role     = aws_iam_role.execution[each.key].id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["ecr:GetAuthorizationToken"], Resource = "*" },
    { Effect = "Allow", Action = ["ecr:BatchCheckLayerAvailability", "ecr:GetDownloadUrlForLayer", "ecr:BatchGetImage"], Resource = "arn:aws:ecr:${var.aws_region}:${var.aws_account_id}:repository/${var.project}-${each.key}" },
    { Effect = "Allow", Action = ["logs:CreateLogStream", "logs:PutLogEvents"], Resource = "arn:aws:logs:${var.aws_region}:${var.aws_account_id}:log-group:/${var.project}/${each.key}:*" },
    { Effect = "Allow", Action = ["secretsmanager:GetSecretValue"], Resource = "arn:aws:secretsmanager:${var.aws_region}:${var.aws_account_id}:secret:${var.project}/${each.key}/*" }
  ] })
}
resource "aws_iam_role" "task" {
  for_each           = local.environments
  name               = "${var.project}-${each.key}-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_trust.json
}
resource "aws_iam_role_policy" "task" {
  for_each = local.environments
  role     = aws_iam_role.task[each.key].id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["s3:ListBucket", "s3:GetBucketLocation"], Resource = ["arn:aws:s3:::${local.prefix}-${each.key}-assets", "arn:aws:s3:::${local.prefix}-${each.key}-diagnostics"] },
    { Effect = "Allow", Action = ["s3:GetObject", "s3:PutObject"], Resource = ["arn:aws:s3:::${local.prefix}-${each.key}-assets/*", "arn:aws:s3:::${local.prefix}-${each.key}-diagnostics/*"] },
    { Effect = "Allow", Action = ["s3:GetObject"], Resource = "arn:aws:s3:::${local.prefix}-${each.key}-recovery/migration/*" }
  ] })
}
resource "aws_iam_role" "maintenance" {
  for_each           = local.environments
  name               = "${var.project}-${each.key}-maintenance-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_trust.json
}
resource "aws_iam_role_policy" "maintenance" {
  for_each = local.environments
  role     = aws_iam_role.maintenance[each.key].id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["s3:ListBucket", "s3:ListBucketVersions", "s3:GetBucketLocation"], Resource = [for kind in ["assets", "diagnostics", "recovery"] : "arn:aws:s3:::${local.prefix}-${each.key}-${kind}"] },
    { Effect = "Allow", Action = ["s3:GetObject", "s3:GetObjectVersion", "s3:PutObject", "s3:AbortMultipartUpload", "s3:ListMultipartUploadParts"], Resource = [for kind in ["assets", "diagnostics", "recovery"] : "arn:aws:s3:::${local.prefix}-${each.key}-${kind}/*"] },
    { Effect = "Allow", Action = ["s3:DeleteObject"], Resource = ["arn:aws:s3:::${local.prefix}-${each.key}-assets/*", "arn:aws:s3:::${local.prefix}-${each.key}-diagnostics/probes/*"] }
  ] })
}
data "aws_iam_policy_document" "migration_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${var.aws_account_id}:root"]
    }
  }
}
resource "aws_iam_role" "staging_migration" {
  name                 = "${var.project}-staging-asset-migration"
  assume_role_policy   = data.aws_iam_policy_document.migration_trust.json
  max_session_duration = 3600
}
resource "aws_iam_role_policy" "staging_migration" {
  role = aws_iam_role.staging_migration.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["s3:ListBucket", "s3:GetBucketLocation"], Resource = ["arn:aws:s3:::${local.prefix}-staging-assets", "arn:aws:s3:::${local.prefix}-staging-recovery"] },
    { Effect = "Allow", Action = ["s3:GetObject", "s3:PutObject"], Resource = ["arn:aws:s3:::${local.prefix}-staging-assets/*", "arn:aws:s3:::${local.prefix}-staging-recovery/migration/*"] }
  ] })
}
output "state_bucket" { value = module.state.name }
output "operations_bucket" { value = module.operations.name }
output "oidc_provider_arn" { value = local.oidc_arn }
output "roles" { value = { for name, role in aws_iam_role.github : name => role.arn } }
output "execution_role_arns" { value = { for name, role in aws_iam_role.execution : name => role.arn } }
output "task_role_arns" { value = { for name, role in aws_iam_role.task : name => role.arn } }
output "maintenance_role_arns" { value = { for name, role in aws_iam_role.maintenance : name => role.arn } }
output "staging_migration_role_arn" { value = aws_iam_role.staging_migration.arn }
output "oidc_include_claim_keys" { value = ["repository_id", "repository_owner_id", "ref", "context", "job_workflow_ref"] }

