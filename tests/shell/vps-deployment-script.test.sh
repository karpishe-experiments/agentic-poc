#!/usr/bin/env bash
set -euo pipefail
script=scripts/deploy/vps-deployment.sh
bash "$script" --help >/dev/null
grep -q 'organizations/\$owner/settings/billing/budgets' "$script"
grep -q 'will_alert:false' "$script"
grep -q '"\$variables_complete" == true' "$script"
reject() { if bash "$script" "$@" > /dev/null 2>&1; then printf 'unexpected success: %s\n' "$*" >&2; exit 1; fi; }
reject unexpected
reject --action unknown
reject --action deploy --environment prod
reject --action check --environment staging --apply
reject --action reset-staging --environment prod --confirmation kids_booklet
reject --action restore --environment staging --backup-id 'bad;id' --confirmation kids_booklet
reject --action restore --environment staging --backup-id valid --confirmation kids_booklet_prod
reject --action deploy --environment staging --environment prod
reject --action status --vps-host 'host;id'
root="$(mktemp -d)"; trap 'rm -rf "$root"' EXIT
mkdir -p "$root/bin"
cat > "$root/bin/ssh" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$SSH_LOG"
exit "${SSH_EXIT:-0}"
STUB
cat > "$root/bin/cloudflared" <<'STUB'
#!/usr/bin/env bash
exit 0
STUB
chmod 700 "$root/bin/ssh" "$root/bin/cloudflared"
export PATH="$root/bin:$PATH" SSH_LOG="$root/ssh.log" CF_ACCESS_CLIENT_ID=test CF_ACCESS_CLIENT_SECRET=never-print-me
digest=ghcr.io/example/kids@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
commit=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
bash "$script" --action deploy --environment staging --image-digest "$digest" --commit "$commit" --config "$root/not-required-for-client.json" --vps-user alternate --vps-host vps.example > "$root/output"
test ! -s "$SSH_LOG"
grep -q 'would update: deploy staging' "$root/output"
export SSH_EXIT=42
set +e
bash "$script" --action deploy --environment staging --image-digest "$digest" --commit "$commit" --vps-host vps.example --apply > "$root/output" 2>&1
result=$?
set -e
test "$result" = 42
grep -q 'ProxyCommand=cloudflared access ssh' "$SSH_LOG"
if grep -q 'never-print-me' "$SSH_LOG" "$root/output"; then echo 'Access credential leaked' >&2; exit 1; fi
export SSH_EXIT=0
bash "$script" --action check --environment staging --vps-host vps.example >/dev/null
printf 'deployment argument, preview, error propagation and SSH transport contracts passed\n'
