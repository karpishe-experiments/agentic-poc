resource "cloudflare_r2_bucket_lifecycle" "retention" {
  for_each    = local.buckets
  account_id  = var.cloudflare_account_id
  bucket_name = cloudflare_r2_bucket.bucket[each.key].name
  rules = concat([
    {
      id                                 = "abort-incomplete-uploads"
      enabled                            = true
      conditions                         = { prefix = "" }
      abort_multipart_uploads_transition = { condition = { type = "Age", max_age = 86400 } }
    }
    ], endswith(each.key, "-assets") ? [] : [
    {
      id                        = "retain-30-days"
      enabled                   = true
      conditions                = { prefix = "" }
      delete_objects_transition = { condition = { type = "Age", max_age = 2592000 } }
    }
  ])
}
resource "cloudflare_r2_bucket_lock" "recovery" {
  for_each    = local.environments
  account_id  = var.cloudflare_account_id
  bucket_name = cloudflare_r2_bucket.bucket["${var.project}-${each.key}-recovery"].name
  rules = [{
    id        = "minimum-30-day-recovery"
    enabled   = true
    prefix    = ""
    condition = { type = "Age", max_age_seconds = 2592000 }
  }]
}
resource "cloudflare_zero_trust_access_service_token" "deployment" {
  account_id = var.cloudflare_account_id
  name       = "${var.project}-github-deployment"
  duration   = "8760h"
}
resource "cloudflare_zero_trust_access_policy" "deployment" {
  account_id = var.cloudflare_account_id
  name       = "${var.project}-deployment-service-only"
  decision   = "non_identity"
  include    = [{ service_token = { token_id = cloudflare_zero_trust_access_service_token.deployment.id } }]
}
resource "cloudflare_zero_trust_access_application" "deployment" {
  account_id           = var.cloudflare_account_id
  name                 = "${var.project}-deployment-ssh"
  domain               = var.deploy_hostname
  type                 = "self_hosted"
  app_launcher_visible = false
  policies             = [{ id = cloudflare_zero_trust_access_policy.deployment.id, precedence = 1 }]
}
data "cloudflare_zero_trust_tunnel_cloudflared_token" "vps" {
  account_id = var.cloudflare_account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.vps.id
}
