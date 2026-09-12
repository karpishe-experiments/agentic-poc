variable "project" { default = "kids-booklet" }
variable "aws_region" {
  default = "eu-west-1"
  validation {
    condition     = var.aws_region == "eu-west-1"
    error_message = "Regional deployment resources must stay in eu-west-1."
  }
}
variable "aws_account_id" {
  type = string
  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "Supply the explicit 12-digit AWS account ID."
  }
}
provider "aws" {
  region              = var.aws_region
  allowed_account_ids = [var.aws_account_id]
  default_tags { tags = { Project = var.project, ManagedBy = "terraform" } }
}

