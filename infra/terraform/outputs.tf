output "tunnel_id" { value = cloudflare_zero_trust_tunnel_cloudflared.vps.id }
output "tunnel_token" {
  value     = data.cloudflare_zero_trust_tunnel_cloudflared_token.vps.token
  sensitive = true
}
output "r2_buckets" { value = { for name, bucket in cloudflare_r2_bucket.bucket : name => bucket.name } }
output "deployment_client_id" { value = cloudflare_zero_trust_access_service_token.deployment.client_id }
output "deployment_client_secret" {
  value     = cloudflare_zero_trust_access_service_token.deployment.client_secret
  sensitive = true
}
output "access_application_id" { value = cloudflare_zero_trust_access_application.deployment.id }
output "hostnames" { value = { staging = var.staging_hostname, prod = var.prod_hostname, deploy = var.deploy_hostname } }
