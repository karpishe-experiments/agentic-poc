mock_provider "cloudflare" {}
run "unibase_staging_route" {
  command = plan
  variables { unibase_staging_hostname = "unibase-staging.example.com" }
  assert {
    condition = (
      length(cloudflare_zero_trust_tunnel_cloudflared_config.vps.config.ingress) == 6 &&
      cloudflare_zero_trust_tunnel_cloudflared_config.vps.config.ingress[4].hostname == "unibase-staging.example.com" &&
      cloudflare_zero_trust_tunnel_cloudflared_config.vps.config.ingress[4].service == "http://localhost:35101" &&
      cloudflare_zero_trust_tunnel_cloudflared_config.vps.config.ingress[5].service == "http_status:404" &&
      cloudflare_dns_record.unibase_staging[0].proxied
    )
    error_message = "Unibase must use its private listener before the existing fallback and receive a proxied DNS record."
  }
}
variables {
  cloudflare_account_id = "0123456789abcdef0123456789abcdef"
  cloudflare_zone_id    = "0123456789abcdef0123456789abcdef"
  staging_hostname      = "staging.example.com"
  prod_hostname         = "booklet.example.com"
  deploy_hostname       = "deploy.example.com"
  dify_hostname         = "dify.example.com"
  dify_backup_bucket    = "kids-booklet-dify-backups"
}
run "deployment_contract" {
  command = plan
  assert {
    condition     = length(cloudflare_r2_bucket.bucket) == 6 && !contains(keys(cloudflare_r2_bucket.bucket), "kids-booklet-terraform-state")
    error_message = "Application infrastructure must not own the bootstrap state bucket."
  }
  assert {
    condition     = cloudflare_r2_bucket.dify_backup.name == "kids-booklet-dify-backups" && length(cloudflare_zero_trust_tunnel_cloudflared_config.vps.config.ingress) == 5 && cloudflare_zero_trust_tunnel_cloudflared_config.vps.config.ingress[3].service == "http_status:503" && cloudflare_dns_record.application["dify"].name == "dify.example.com"
    error_message = "Dify must have a separate backup bucket and a maintenance-gated tunnel route."
  }
  assert {
    condition     = cloudflare_ruleset.rate_limit.rules[0].action == "block" && cloudflare_ruleset.rate_limit.rules[0].ratelimit.period == 10 && cloudflare_ruleset.rate_limit.rules[0].ratelimit.requests_per_period == 100 && cloudflare_ruleset.rate_limit.rules[0].ratelimit.mitigation_timeout == 10
    error_message = "Use the approved Free-plan 100-per-10-second blocking rule."
  }
  assert {
    condition     = cloudflare_ruleset.cache.rules[0].action_parameters.cache == false && cloudflare_ruleset.cache.rules[1].action_parameters.cache == true
    error_message = "Bypass application caching before the narrow static-file exception."
  }
  assert {
    condition     = cloudflare_ruleset.cache.rules[2].action_parameters.cache == false && strcontains(cloudflare_ruleset.cache.rules[2].expression, "dify.example.com") && !strcontains(cloudflare_ruleset.rate_limit.rules[0].expression, "dify.example.com")
    error_message = "Bypass Dify caching without applying Booklet's API rate limit."
  }
  assert {
    condition     = cloudflare_zero_trust_access_policy.deployment.decision == "non_identity" && length(cloudflare_zero_trust_access_policy.deployment.include) == 1
    error_message = "SSH Access must allow only the deployment service identity."
  }
  assert {
    condition     = length(cloudflare_r2_bucket_lifecycle.retention["kids-booklet-staging-assets"].rules) == 1 && cloudflare_r2_bucket_lifecycle.retention["kids-booklet-prod-recovery"].rules[1].delete_objects_transition.condition.max_age == 2592000
    error_message = "Preserve current assets and expire recovery archives after 30 days."
  }
}
run "dify_public_route_enabled" {
  command = plan
  variables { dify_public_enabled = true }
  assert {
    condition     = cloudflare_zero_trust_tunnel_cloudflared_config.vps.config.ingress[3].service == "http://localhost:3300"
    error_message = "Enabled Dify routing must target only the loopback listener."
  }
}
