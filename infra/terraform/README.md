# Cloudflare infrastructure

Use Terraform 1.11.4 and Cloudflare provider 5.10.0. Lock files contain official
release checksums for Linux and Windows. Supply the Cloudflare token through
`CLOUDFLARE_API_TOKEN` during setup or `TF_VAR_cloudflare_api_token` in the
infrastructure workflow.

`bootstrap/` is a separate root with local state. It owns only the protected
`${project}-terraform-state` R2 bucket and a 30-day lock for its `snapshots/`
prefix. Inputs are `project` (default
`kids-booklet`) and `cloudflare_account_id`; outputs are `state_bucket`,
`account_id`, and `r2_endpoint`. Retain this state in protected administrator
storage, independently of application state. Setup uploads and verifies separately
keyed snapshots before and after applies. Setup may supply `TF_VAR_state_bucket`
to use an exact bucket name instead of the project-derived default.

The main root uses an S3 backend. Setup supplies the R2 endpoint, bucket, key,
region `auto`, and R2 credentials. Set `skip_credentials_validation=true`,
`skip_region_validation=true`, `skip_requesting_account_id=true`, and
`skip_metadata_api_check=true`. Setup owns state creation and verification.

The main inputs are `cloudflare_account_id`, `cloudflare_zone_id`,
`staging_hostname`, `prod_hostname`, and `deploy_hostname`. It creates six
private buckets. Current assets do not expire; diagnostics and recovery objects
expire after 30 days. Recovery buckets also lock every object against deletion
and overwrite for 30 days. Incomplete multipart uploads expire after one day.
R2 has no S3 object versioning: snapshots must use distinct keys.

Tunnel ingress uses localhost ports 3100, 3200, and 22, with a final 404 fallback.
SSH Access allows only the managed deployment service token; rotate it before
its one-year expiry. Application caching is bypassed except `/_next/static/`.
One Free-plan API rule matches `/api/` paths across the entire zone, including
unrelated hostnames, because the Free rate-limit expression cannot filter hosts.
It blocks after 100 requests per source IP and Cloudflare
location in ten seconds, for ten seconds. This is not a global exact counter.

Outputs are `tunnel_id`, sensitive `tunnel_token`, `r2_buckets` (full names),
`deployment_client_id`, sensitive `deployment_client_secret`,
`access_application_id`, and `hostnames` keyed by staging, prod, and deploy.

**State contains the Tunnel token and deployment service-token secret.**
OpenAI, MongoDB, and application access passwords are not Terraform inputs.
Protect state, saved plans, and snapshots. Never publish unfiltered
`terraform output -json`; extract sensitive fields into protected files or
masked secret inputs.

The cache and rate-limit resources own their whole zone entrypoint phases.
Setup and routine plans query those entrypoints and stop if another application
owns either ruleset or uses the Free rate-rule allowance. Import only after
verifying ownership and the complete configuration; import alone does not
preserve unrelated rules.

In both roots run `terraform init -backend=false`, `terraform validate`, and
`terraform test`; run `terraform fmt -check -recursive infra/terraform` from the
repository root. Tests use a mock provider and make no API calls. Live account
permissions, plan entitlement, Tunnel connectivity, and service-token SSH remain
setup acceptance checks.

[Cloudflare provider 5.10.0 schema reference](https://registry.terraform.io/providers/cloudflare/cloudflare/5.10.0/docs).
