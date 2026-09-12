mock_provider "aws" {}
mock_provider "aws" { alias = "global" }
override_data {
  target = data.terraform_remote_state.bootstrap
  values = {
    outputs = {
      execution_role_arns   = { staging = "arn:aws:iam::123456789012:role/kids-booklet-staging-execution" }
      task_role_arns        = { staging = "arn:aws:iam::123456789012:role/kids-booklet-staging-task" }
      maintenance_role_arns = { staging = "arn:aws:iam::123456789012:role/kids-booklet-staging-maintenance-task" }
    }
  }
}
override_data {
  target = data.terraform_remote_state.shared
  values = {
    outputs = {
      vpc_id             = "vpc-12345678"
      private_subnet_ids = { staging = ["subnet-12345678", "subnet-23456789"] }
    }
  }
}
variables {
  aws_account_id = "123456789012"
  environment    = "staging"
  state_bucket   = "kids-booklet-123456789012-state"
}
run "templates" {
  command = plan
  assert {
    condition     = output.deployment.task_definition_template.family == "kids-booklet-staging"
    error_message = "Release must register the environment's application family."
  }
  assert {
    condition     = output.deployment.maintenance_task_definition_template.family == "kids-booklet-staging-maintenance"
    error_message = "Maintenance must use a distinct task family."
  }
  assert {
    condition     = output.deployment.task_definition_template.taskRoleArn != output.deployment.maintenance_task_definition_template.taskRoleArn
    error_message = "Application tasks must not receive recovery permissions."
  }
  assert {
    condition     = one([for item in output.deployment.task_definition_template.containerDefinitions[0].environment : item.value if item.name == "RUNNER_ENABLED"]) == "true"
    error_message = "Application runner state must be explicit."
  }
  assert {
    condition     = one([for item in output.deployment.maintenance_task_definition_template.containerDefinitions[0].environment : item.value if item.name == "RUNNER_ENABLED"]) == "false"
    error_message = "Maintenance must never start the application runner."
  }
}
