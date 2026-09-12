variable "environment" {
  type = string
  validation {
    condition     = contains(["staging", "prod"], var.environment)
    error_message = "Environment must be staging or prod."
  }
}
variable "state_bucket" { type = string }
variable "cpu" { default = 1024 }
variable "memory" { default = 2048 }
provider "aws" {
  alias               = "global"
  region              = "us-east-1"
  allowed_account_ids = [var.aws_account_id]
  default_tags { tags = { Project = var.project, ManagedBy = "terraform", Environment = var.environment } }
}
data "terraform_remote_state" "bootstrap" {
  backend = "s3"
  config  = { bucket = var.state_bucket, key = "${var.project}/bootstrap.tfstate", region = var.aws_region }
}
data "terraform_remote_state" "shared" {
  backend = "s3"
  config  = { bucket = var.state_bucket, key = "${var.project}/shared.tfstate", region = var.aws_region }
}
module "environment" {
  source               = "../modules/environment"
  providers            = { aws = aws, aws.global = aws.global }
  project              = var.project
  environment          = var.environment
  aws_region           = var.aws_region
  aws_account_id       = var.aws_account_id
  cpu                  = var.cpu
  memory               = var.memory
  vpc_id               = data.terraform_remote_state.shared.outputs.vpc_id
  subnet_ids           = data.terraform_remote_state.shared.outputs.private_subnet_ids[var.environment]
  execution_role_arn   = data.terraform_remote_state.bootstrap.outputs.execution_role_arns[var.environment]
  task_role_arn        = data.terraform_remote_state.bootstrap.outputs.task_role_arns[var.environment]
  maintenance_role_arn = data.terraform_remote_state.bootstrap.outputs.maintenance_role_arns[var.environment]
}
output "deployment" { value = module.environment.deployment }
