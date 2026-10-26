#!/usr/bin/env bash
# Exercise the real systemd API only on a disposable Linux CI runner.
set -euo pipefail
umask 077
if [[ "${1:-}" != --root ]]; then
  [[ "${GITHUB_ACTIONS:-}" == true ]] || exit 0
  exec sudo -n bash "$0" --root
fi
export VPS_DEPLOYMENT_LIBRARY_ONLY=true
source scripts/deploy/vps-deployment.sh
TEMP_DIR="$(mktemp -d)"
STATE="$TEMP_DIR/state"; mkdir -p "$STATE/operations"
REQUEST_ID="resume-contract-${GITHUB_RUN_ID:-local}-$$"
unit="kids-booklet-operation-$REQUEST_ID.service"
cleanup_test() {
  systemctl stop "$unit" >/dev/null 2>&1 || true
  systemctl reset-failed "$unit" >/dev/null 2>&1 || true
  rm -rf -- "$TEMP_DIR"
}
trap cleanup_test EXIT
printf '{"requestId":"%s"}\n' "$REQUEST_ID" > "$STATE/operation.json"
systemd-run --unit="${unit%.service}" --property=Type=exec --property=RuntimeMaxSec=30 /bin/sh -c 'exit 7'
end=$((SECONDS+10))
until [[ "$(systemctl show "$unit" --property=ActiveState --value)" == failed ]]; do
  [[ "$SECONDS" -lt "$end" ]]; sleep 0.1
done
retire_stopped_operation_unit
systemd-run --unit="${unit%.service}" --property=Type=exec --property=RuntimeMaxSec=5 /bin/sleep 2
[[ "$(systemctl show "$unit" --property=Transient --value)" == yes ]]
[[ "$(systemctl show "$unit" --property=RuntimeMaxUSec --value)" == 5s ]]
printf 'real systemd transient retirement and recreation passed\n'
