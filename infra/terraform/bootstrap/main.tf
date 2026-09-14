terraform {
  required_version = "= 1.11.4"
  required_providers {
    cloudflare = { source = "cloudflare/cloudflare", version = "= 5.10.0" }
  }
}
provider "cloudflare" { api_token = var.cloudflare_api_token }
variable "project" {
  type    = string
  default = "kids-booklet"
}
variable "cloudflare_api_token" {
  type      = string
  sensitive = true
  default   = null
}
variable "cloudflare_account_id" { type = string }
variable "state_bucket" {
  type        = string
  default     = null
  description = "Exact state bucket name supplied by setup; defaults to <project>-terraform-state."
}
resource "cloudflare_r2_bucket" "state" {
  account_id = var.cloudflare_account_id
  name       = var.state_bucket != null ? var.state_bucket : "${var.project}-terraform-state"
  location   = "WNAM"
  lifecycle { prevent_destroy = true }
}
resource "cloudflare_r2_bucket_lock" "state_snapshots" {
  account_id  = var.cloudflare_account_id
  bucket_name = cloudflare_r2_bucket.state.name
  rules = [{
    id        = "protect-state-snapshots"
    enabled   = true
    prefix    = "snapshots/"
    condition = { type = "Age", max_age_seconds = 2592000 }
  }]
}
output "state_bucket" { value = cloudflare_r2_bucket.state.name }
output "account_id" { value = var.cloudflare_account_id }
output "r2_endpoint" { value = "https://${var.cloudflare_account_id}.r2.cloudflarestorage.com" }
