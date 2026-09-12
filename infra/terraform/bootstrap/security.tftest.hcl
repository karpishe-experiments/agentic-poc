mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"sts:AssumeRole\",\"Principal\":{\"Service\":\"ecs-tasks.amazonaws.com\"}}]}" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::123456789012:role/mock" }
  }
  mock_resource "aws_iam_policy" {
    defaults = { arn = "arn:aws:iam::123456789012:policy/mock" }
  }
  mock_resource "aws_iam_openid_connect_provider" {
    defaults = { arn = "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com" }
  }
}
variables {
  oidc_provider_arn   = "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
  aws_account_id      = "123456789012"
  repository_id       = "1304721239"
  repository_owner_id = "245238212"
}
run "bootstrap_security" {
  command = plan
  assert {
    condition     = alltrue([for policy in aws_iam_policy.permissions : length(policy.policy) <= 6144])
    error_message = "Every managed policy must fit the AWS size limit."
  }
  assert {
    condition     = alltrue([for role in keys(local.roles) : length([for chunk in local.policy_chunks : chunk if chunk.role == role]) <= 10])
    error_message = "Every role must fit the default AWS managed policy attachment quota."
  }
  assert {
    condition     = length(aws_iam_role.github) == 10
    error_message = "Expected separate plan/apply roles and separate release/maintenance roles."
  }
  assert {
    condition     = contains(jsondecode(aws_iam_role.github["staging-release"].assume_role_policy).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:sub"], "repository_id:1304721239:repository_owner_id:245238212:ref:refs/heads/_staging:environment:_staging:job_workflow_ref:karpishe-experiments/agentic-poc/.github/workflows/aws-release.yml@refs/heads/_staging")
    error_message = "Staging release trust must bind immutable identity, branch, environment and reusable workflow."
  }
  assert {
    condition     = alltrue([for statement in local.policy_statements["staging-plan"] : !contains(statement.Action, "secretsmanager:GetSecretValue") && !contains(statement.Action, "s3:PutObject") || try(endswith(statement.Resource, ".tflock"), false)])
    error_message = "The planning role must not write state payloads or read secret values."
  }
  assert {
    condition     = alltrue([for statement in local.release_statements["staging"] : !strcontains(jsonencode(statement.Resource), "kids-booklet-prod")])
    error_message = "Staging release permissions must not target production resources."
  }
}
