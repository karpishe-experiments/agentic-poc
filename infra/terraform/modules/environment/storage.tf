module "buckets" {
  for_each       = toset(["assets", "diagnostics", "recovery"])
  source         = "../private-bucket"
  name           = "${local.bucket_prefix}-${each.key}"
  expire_current = each.key != "assets"
  tags           = local.tags
}
resource "aws_secretsmanager_secret" "application" {
  for_each                = toset(["OPENAI_API_KEY", "MONGODB_URI", "ACCESS_GATE_PASSWORD"])
  name                    = "${var.project}/${var.environment}/${each.key}"
  recovery_window_in_days = 30
  tags                    = local.tags
  lifecycle { prevent_destroy = true }
}
resource "aws_ecr_repository" "application" {
  name                 = local.name
  image_tag_mutability = "IMMUTABLE"
  force_delete         = false
  image_scanning_configuration { scan_on_push = true }
  encryption_configuration { encryption_type = "AES256" }
  tags = local.tags
  lifecycle { prevent_destroy = true }
}
# Retain tagged release images for explicit rollback. Only untagged layers expire.
resource "aws_ecr_lifecycle_policy" "application" {
  repository = aws_ecr_repository.application.name
  policy = jsonencode({ rules = [{
    rulePriority = 1,
    description  = "Expire untagged images after 30 days",
    selection    = { tagStatus = "untagged", countType = "sinceImagePushed", countUnit = "days", countNumber = 30 },
    action       = { type = "expire" }
  }] })
}
resource "aws_cloudwatch_log_group" "application" {
  name              = "/${var.project}/${var.environment}"
  retention_in_days = 30
  tags              = local.tags
}
