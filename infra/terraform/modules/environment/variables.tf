terraform {
  required_providers {
    aws = {
      source                = "hashicorp/aws"
      configuration_aliases = [aws.global]
    }
  }
}
variable "project" { type = string }
variable "environment" { type = string }
variable "aws_region" { type = string }
variable "aws_account_id" { type = string }
variable "cpu" { type = number }
variable "memory" { type = number }
variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "execution_role_arn" { type = string }
variable "task_role_arn" { type = string }
variable "maintenance_role_arn" { type = string }
locals {
  name          = "${var.project}-${var.environment}"
  bucket_prefix = "${var.project}-${var.aws_account_id}-${var.environment}"
  tags          = { Project = var.project, Environment = var.environment }
}
