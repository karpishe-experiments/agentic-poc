variable "project" {
  type    = string
  default = "kids-booklet"
}
variable "cloudflare_api_token" {
  type        = string
  sensitive   = true
  default     = null
  description = "Prefer CLOUDFLARE_API_TOKEN in the process environment. Never commit tokens."
}
variable "cloudflare_account_id" { type = string }
variable "cloudflare_zone_id" { type = string }
variable "staging_hostname" { type = string }
variable "prod_hostname" { type = string }
variable "dify_hostname" {
  type = string
  validation {
    condition     = can(regex("^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$", var.dify_hostname)) && !contains([var.staging_hostname, var.prod_hostname, var.deploy_hostname], var.dify_hostname)
    error_message = "Supply a distinct lowercase Dify hostname."
  }
}
variable "dify_backup_bucket" {
  type = string
  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{2,62}$", var.dify_backup_bucket))
    error_message = "Supply a valid Dify backup bucket name."
  }
}
variable "dify_public_enabled" {
  type        = bool
  default     = false
  description = "Route the Dify hostname to localhost:3300 when the reviewed configuration enables public access."
}
variable "deploy_hostname" {
  type = string
  validation {
    condition = length(distinct([var.staging_hostname, var.prod_hostname, var.deploy_hostname])) == 3 && alltrue([
      for hostname in [var.staging_hostname, var.prod_hostname, var.deploy_hostname] :
      can(regex("^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$", hostname))
    ])
    error_message = "Supply three distinct lowercase DNS hostnames without schemes, paths or wildcard characters."
  }
}
