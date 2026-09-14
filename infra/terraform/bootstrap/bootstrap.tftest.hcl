mock_provider "cloudflare" {}
variables { cloudflare_account_id = "0123456789abcdef0123456789abcdef" }
run "state_bucket" {
  command = plan
  assert {
    condition     = cloudflare_r2_bucket.state.name == "kids-booklet-terraform-state"
    error_message = "Bootstrap must create the independently managed state bucket."
  }
}

run "state_snapshots_are_locked" {
  command = plan
  assert {
    condition     = cloudflare_r2_bucket_lock.state_snapshots.rules[0].prefix == "snapshots/" && cloudflare_r2_bucket_lock.state_snapshots.rules[0].condition.max_age_seconds == 2592000
    error_message = "Terraform state snapshots must be protected for at least 30 days."
  }
}
