#!/usr/bin/env bash
# Disposable host fixtures only; no live commands, services or providers.
# shellcheck disable=SC2034
set -euo pipefail
if [[ $# == 0 ]]; then
  for scenario in preview apply repeated active-journal interrupted receipt-image receipt-environment wrong-id wrong-phase backup deadline unexpired candidate prior inspect-error unit owner drift expiry; do bash "$0" "$scenario"; done
  printf 'pre-backup retirement contracts passed\n'
  exit 0
fi
export VPS_DEPLOYMENT_LIBRARY_ONLY=true
source scripts/deploy/vps-deployment.sh
TEMP_DIR="$(mktemp -d)"
if command -v cygpath >/dev/null 2>&1; then TEMP_DIR="$(cygpath -m "$TEMP_DIR")"; fi
trap 'rm -rf -- "$TEMP_DIR"' EXIT
ROOT="$TEMP_DIR/root" STATE="$TEMP_DIR/state" SECRETS="$TEMP_DIR/secrets"
REQUEST_ID=m4-retire-prebackup-40359148858-v1 ORIGINAL_REQUEST_ID=40359148858-1
ACTION=expired-deployment-recover ENVIRONMENT=staging RETIRE_PREBACKUP_ONLY=true
VPS_USER=root
COMMIT=ffefe4c87685b7b0a5c0f6499547d1dc3d17506d
IMAGE_DIGEST=ghcr.io/karpishe-experiments/agentic-poc@sha256:644e10d74a2c47e36da8c7550012cdb6481903231f0892c2dd856d8b97d20f00
CURRENT="$STATE/releases/staging/c26887c6d8b2186b42d0108168751f91d69126d6"
JOURNAL="$STATE/operation.json" ARCHIVE="$STATE/operations/$ORIGINAL_REQUEST_ID.json"
RECEIPT="$STATE/recoveries/$REQUEST_ID/host.json"
NOW=1793034900 OWNER=0 BAD_UNIT=false DRIFT=false EXPIRE=false INTERRUPT=false INSPECT_ERROR=false
APPLY=false PREVIEW_DIGEST='' CONFIRMATION=kids_booklet
mkdir -p "$ROOT" "$CURRENT" "$STATE/operations"
cp scripts/deploy/vps-deployment.sh "$ROOT/vps-deployment.sh"
printf '%s\n' "$CURRENT" > "$STATE/releases/staging/current"
printf '{}' > "$STATE/backup-helper-staging.json"
jq -n --arg prior "$CURRENT" --arg commit "$COMMIT" --arg image "$IMAGE_DIGEST" '{requestId:"40359148858-1",action:"deploy",environment:"staging",step:"draining",backupId:"",priorRelease:$prior,commit:$commit,image:$image,budgetDeadlineAtSeconds:1793034829,stopRequestedAt:null}' > "$JOURNAL"
cp "$JOURNAL" "$TEMP_DIR/original.json"
: > "$TEMP_DIR/calls"
date() { if [[ "$1" == +%s ]]; then printf '%s\n' "$NOW"; else command date "$@"; fi; }
stat() { if [[ "$1" == -c && "$2" == %u ]]; then printf '0\n'; else command stat "$@"; fi; }
private_temp() { :; }
control_timeout() { shift; "$@"; }
systemctl() {
  if [[ "$2" == list-units || "$1" == list-units ]]; then return 0; fi
  if [[ "$BAD_UNIT" == true ]]; then printf 'ActiveState=active\nMainPID=1\nControlPID=0\nJob=\n'
  else printf 'ActiveState=failed\nMainPID=0\nControlPID=0\nJob=\n'; fi
}
recovery_no_containers() { return 0; }
docker() {
  if [[ "$1" == ps ]]; then printf 'prior-container\n'
  elif [[ "$1" == inspect ]]; then printf 'ghcr.io/karpishe-experiments/agentic-poc@sha256:21737fcf0168b9b04ffead4b252124ed998213aab61e08e683cf33a896a33ffb\n'; [[ "$INSPECT_ERROR" == false ]]
  else return 1; fi
}
backup_helper_for_deploy() { printf 'helper-proof\n' >> "$TEMP_DIR/calls"; BACKUP_HELPER_RELEASE="$CURRENT"; }
recovery_host_fingerprint() { printf '%064d\n' 1; }
recovery_oneoff() {
  if [[ "$DRIFT" == true ]]; then printf '\n' >> "$JOURNAL"; fi
  if [[ "$EXPIRE" == true ]]; then NOW=$(( (NOW / 600 + 1) * 600 )); fi
  jq -nc --argjson owners "$OWNER" '{outcome:"clear",inspectionError:null,blockers:[],admission:{maintenance:false,draining:false,activeMutations:0,interruptedMutations:0,mutationOwnerCount:$owners}}'
}
eval "$(declare -f recovery_phase | sed '1s/recovery_phase/fixture_recovery_phase/')"
recovery_phase() { if [[ "$INTERRUPT" == true && "$2" == complete ]]; then exit 77; fi; fixture_recovery_phase "$@"; }
run_retirement() { validate_arguments; retire_prebackup_host; }
preview() {
  APPLY=false; run_retirement > "$TEMP_DIR/preview"
  PREVIEW_DIGEST="$(sed -n 's/.*digest=\([a-f0-9]*\) expiresAtSeconds=.*/\1/p' "$TEMP_DIR/preview")"
  [[ "$PREVIEW_DIGEST" =~ ^[a-f0-9]{64}$ ]]
  APPLY=true
}
reject() {
  if (trap - EXIT; run_retirement) > "$TEMP_DIR/rejected" 2>&1; then printf 'Unexpected acceptance: %s\n' "$1" >&2; exit 1; fi
  [[ ! -e "$ARCHIVE" && ! -e "$RECEIPT" ]]
}
case "$1" in
  preview)
    preview; cmp "$JOURNAL" "$TEMP_DIR/original.json"
    [[ ! -e "$ARCHIVE" && ! -e "$STATE/recoveries" ]];;
  apply|repeated|active-journal|interrupted|receipt-image|receipt-environment)
    preview
    if [[ "$1" == interrupted ]]; then
      INTERRUPT=true
      if (trap - EXIT; run_retirement) > /dev/null 2>&1; then exit 1; fi
      jq -e '.phase=="prepared"' "$RECEIPT" >/dev/null
      INTERRUPT=false
    else run_retirement > /dev/null; fi
    cmp "$ARCHIVE" "$TEMP_DIR/original.json"
    [[ ! -e "$JOURNAL" ]]
    if [[ "$1" == receipt-* ]]; then
      if [[ "$1" == receipt-image ]]; then filter='.image="different"'; else filter='.environment="prod"'; fi
      jq "$filter" "$RECEIPT" > "$TEMP_DIR/changed"; mv "$TEMP_DIR/changed" "$RECEIPT"
      if (trap - EXIT; run_retirement) > /dev/null 2>&1; then exit 1; fi
      cmp "$ARCHIVE" "$TEMP_DIR/original.json"
      printf 'passed pre-backup retirement %s\n' "$1"; exit 0
    fi
    if [[ "$1" == active-journal ]]; then printf '{"requestId":"new-deployment","step":"running"}' > "$JOURNAL"; cp "$JOURNAL" "$TEMP_DIR/new.json"; fi
    if [[ "$1" != apply ]]; then
      calls="$(wc -l < "$TEMP_DIR/calls")"
      run_retirement > /dev/null
      [[ "$(wc -l < "$TEMP_DIR/calls")" == "$calls" ]]
    fi
    jq -e --arg digest "$PREVIEW_DIGEST" '.phase=="complete" and .purpose=="prebackup-retirement-v1" and .previewDigest==$digest' "$RECEIPT" >/dev/null
    if [[ "$1" == active-journal ]]; then cmp "$JOURNAL" "$TEMP_DIR/new.json"; fi;;
  wrong-id) ORIGINAL_REQUEST_ID=wrong; reject "$1";;
  unexpired) NOW=1793034829; reject "$1";;
  candidate) COMMIT=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; reject "$1";;
  prior) printf 'different-release\n' > "$STATE/releases/staging/current"; reject "$1";;
  inspect-error) INSPECT_ERROR=true; reject "$1";;
  unit) BAD_UNIT=true; reject "$1";;
  owner) OWNER=1; reject "$1";;
  wrong-phase|backup|deadline)
    case "$1" in wrong-phase) filter='.step="backup"';; backup) filter='.backupId="selected"';; deadline) filter='.budgetDeadlineAtSeconds=1793034828';; esac
    jq "$filter" "$JOURNAL" > "$TEMP_DIR/changed"; mv "$TEMP_DIR/changed" "$JOURNAL"
    reject "$1";;
  drift|expiry)
    preview
    if [[ "$1" == drift ]]; then DRIFT=true; else EXPIRE=true; fi
    reject "$1";;
  *) exit 1;;
esac
printf 'passed pre-backup retirement %s\n' "$1"
