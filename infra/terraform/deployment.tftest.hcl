mock_provider "cloudflare" {}
variables {
  cloudflare_account_id = "0123456789abcdef0123456789abcdef"
  cloudflare_zone_id    = "0123456789abcdef0123456789abcdef"
  staging_hostname      = "staging.example.com"
  prod_hostname         = "booklet.example.com"
  deploy_hostname       = "deploy.example.com"
}
run "deployment_contract" {
  command = plan
  assert {
    condition     = length(cloudflare_r2_bucket.bucket) == 6 && !contains(keys(cloudflare_r2_bucket.bucket), "kids-booklet-terraform-state")
    error_message = "Application infrastructure must not own the bootstrap state bucket."
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
    condition     = cloudflare_zero_trust_access_policy.deployment.decision == "non_identity" && length(cloudflare_zero_trust_access_policy.deployment.include) == 1
    error_message = "SSH Access must allow only the deployment service identity."
  }
  assert {
    condition     = length(cloudflare_r2_bucket_lifecycle.retention["kids-booklet-staging-assets"].rules) == 1 && cloudflare_r2_bucket_lifecycle.retention["kids-booklet-prod-recovery"].rules[1].delete_objects_transition.condition.max_age == 2592000
    error_message = "Preserve current assets and expire recovery archives after 30 days."
  }
}
