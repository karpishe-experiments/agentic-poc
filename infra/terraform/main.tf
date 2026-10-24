terraform {
  required_version = "= 1.11.4"
  required_providers {
    cloudflare = { source = "cloudflare/cloudflare", version = "= 5.10.0" }
  }
  backend "s3" {}
}
provider "cloudflare" { api_token = var.cloudflare_api_token }

locals {
  environments      = toset(["staging", "prod"])
  buckets           = toset(flatten([for environment in local.environments : [for kind in ["assets", "diagnostics", "recovery"] : "${var.project}-${environment}-${kind}"]]))
  application_hosts = "http.host in {\"${var.staging_hostname}\" \"${var.prod_hostname}\"}"
}
resource "cloudflare_r2_bucket" "bucket" {
  for_each   = local.buckets
  account_id = var.cloudflare_account_id
  name       = each.value
  location   = "WNAM"
  lifecycle { prevent_destroy = true }
}
resource "cloudflare_r2_bucket" "dify_backup" {
  account_id = var.cloudflare_account_id
  name       = var.dify_backup_bucket
  location   = "WNAM"
  lifecycle { prevent_destroy = true }
}
resource "cloudflare_zero_trust_tunnel_cloudflared" "vps" {
  account_id = var.cloudflare_account_id
  name       = "${var.project}-vps"
  config_src = "cloudflare"
  lifecycle { prevent_destroy = true }
}
resource "cloudflare_zero_trust_tunnel_cloudflared_config" "vps" {
  account_id = var.cloudflare_account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.vps.id
  config = {
    ingress = concat([
      { hostname = var.staging_hostname, service = "http://localhost:3100" },
      { hostname = var.prod_hostname, service = "http://localhost:3200" },
      { hostname = var.deploy_hostname, service = "ssh://localhost:22" },
      { hostname = var.dify_hostname, service = var.dify_public_enabled ? "http://localhost:3300" : "http_status:503" },
      ], var.unibase_staging_hostname == null ? [] : [
      { hostname = var.unibase_staging_hostname, service = "http://localhost:35101" }
    ], [{ service = "http_status:404" }])
  }
}
resource "cloudflare_dns_record" "unibase_staging" {
  count   = var.unibase_staging_hostname == null ? 0 : 1
  zone_id = var.cloudflare_zone_id
  name    = var.unibase_staging_hostname
  type    = "CNAME"
  content = "${cloudflare_zero_trust_tunnel_cloudflared.vps.id}.cfargotunnel.com"
  ttl     = 1
  proxied = true
}
resource "cloudflare_dns_record" "application" {
  for_each = { staging = var.staging_hostname, prod = var.prod_hostname, deploy = var.deploy_hostname, dify = var.dify_hostname }
  zone_id  = var.cloudflare_zone_id
  name     = each.value
  type     = "CNAME"
  content  = "${cloudflare_zero_trust_tunnel_cloudflared.vps.id}.cfargotunnel.com"
  ttl      = 1
  proxied  = true
}
resource "cloudflare_ruleset" "cache" {
  zone_id = var.cloudflare_zone_id
  name    = "${var.project}-cache"
  kind    = "zone"
  phase   = "http_request_cache_settings"
  rules = [
    {
      ref               = "application_bypass"
      action            = "set_cache_settings"
      expression        = local.application_hosts
      description       = "Never cache application, API, admin or asset responses"
      enabled           = true
      action_parameters = { cache = false }
    },
    {
      ref               = "next_static"
      action            = "set_cache_settings"
      expression        = "(${local.application_hosts}) and starts_with(http.request.uri.path, \"/_next/static/\")"
      description       = "Cache only content-addressed Next.js build assets"
      enabled           = true
      action_parameters = { cache = true }
    },
    {
      ref               = "dify_bypass"
      action            = "set_cache_settings"
      expression        = "http.host eq \"${var.dify_hostname}\""
      description       = "Never cache Dify console, API, streaming or file responses"
      enabled           = true
      action_parameters = { cache = false }
    }
  ]
}
resource "cloudflare_ruleset" "rate_limit" {
  zone_id = var.cloudflare_zone_id
  name    = "${var.project}-api-rate"
  kind    = "zone"
  phase   = "http_ratelimit"
  rules = [{
    ref         = "application_api_rate"
    action      = "block"
    expression  = "(${local.application_hosts}) and starts_with(http.request.uri.path, \"/api/\")"
    description = "Free plan API rate limit"
    enabled     = true
    ratelimit = {
      characteristics     = ["cf.colo.id", "ip.src"]
      period              = 10
      requests_per_period = 100
      mitigation_timeout  = 10
    }
  }]
}
