#!/usr/bin/env bash
# Fully mocked host/backup recovery scenarios; no Docker, database or provider access.
# shellcheck disable=SC2034
set -euo pipefail
if [[ $# == 0 ]]; then
  for scenario in preview apply reentry completed helper-mismatch active-containers changed-journal deadline tree-mismatch preflight-budget changed-parent changed-marker near-expired-preflight expired-maintenance-cleanup admission-states; do bash "$0" "$scenario"; done
  printf 'backup helper recovery contracts passed\n'
  exit 0
fi
export VPS_DEPLOYMENT_LIBRARY_ONLY=true
# shellcheck source=../../scripts/deploy/vps-deployment.sh
source scripts/deploy/vps-deployment.sh
REAL_MAINTENANCE="$(declare -f maintenance)"
TEMP_DIR="$(mktemp -d)"
# Native jq on Git Bash otherwise rewrites only JSON path arguments.
if command -v cygpath >/dev/null 2>&1; then TEMP_DIR="$(cygpath -m "$TEMP_DIR")"; fi
trap 'rm -rf -- "$TEMP_DIR"' EXIT
ROOT="$TEMP_DIR/root" STATE="$TEMP_DIR/state" SECRETS="$TEMP_DIR/secrets"
COMMIT=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
IMAGE_DIGEST="ghcr.io/example/kids@sha256:$(printf 'a%.0s' {1..64})"
BACKUP_HELPER_COMMIT=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
BACKUP_HELPER_IMAGE="ghcr.io/example/kids@sha256:$(printf 'b%.0s' {1..64})"
TREE=cccccccccccccccccccccccccccccccccccccccc
CONTROL_DEADLINE_SECONDS=$((SECONDS + 2520))
REQUEST_ID=recovery-fixture ORIGINAL_REQUEST_ID=failed-deploy ACTION=expired-deployment-recover ENVIRONMENT=staging APPLY=false PREVIEW_DIGEST=''
CURRENT="$STATE/releases/staging/$COMMIT" EVIDENCE="$STATE/recoveries/$REQUEST_ID" JOURNAL="$EVIDENCE/host.json"
CONFIG_FILE="$TEMP_DIR/config.json" CALLS="$TEMP_DIR/calls" VERIFY_FAIL=false COMPLETE=false ACTIVE=false BAD_COMMIT=false BAD_TREE=false PREFLIGHT_DELAY=false
mkdir -p "$CURRENT" "$STATE/operations" "$STATE/recoveries/decision-recovery" "$SECRETS/staging"
printf '{}' > "$SECRETS/staging/secrets.json"
printf '{"image":"ghcr.io/example/kids"}' > "$CONFIG_FILE"
printf '%s\n' "$CURRENT" > "$STATE/releases/staging/current"
for file in compose.yml environment.yml runtime.env manifest.sha256; do printf 'fixture\n' > "$CURRENT/$file"; done
jq -n --arg image "$IMAGE_DIGEST" '{services:{app:{image:$image}}}' > "$CURRENT/image.json"
jq -n --arg prior "$CURRENT" --arg image "$IMAGE_DIGEST" '{image:$image,requestId:"failed-deploy",action:"deploy",environment:"staging",priorRelease:$prior,step:"backup",budgetDeadlineAtSeconds:1,backupId:"original-backup"}' > "$STATE/operation.json"
jq -n --arg prior "$CURRENT" --arg tree "$TREE" '{action:"candidate-reconcile",environment:"staging",priorRelease:$prior,sourceTree:$tree,requestId:"decision-recovery",runId:"retained-run",operationId:"retained-op",expectedRevision:"657",appPreviewDigest:"digest"}' > "$STATE/recovery-handoff-staging.json"
jq '.phase="complete"' "$STATE/recovery-handoff-staging.json" > "$STATE/recoveries/decision-recovery/host.json"
cp "$STATE/operation.json" "$TEMP_DIR/original.json"
cp "$STATE/recovery-handoff-staging.json" "$TEMP_DIR/handoff.json"
: > "$CALLS"
timeout() { while [[ "$1" == --* ]]; do shift; done; printf 'timeout %s\n' "$1" >> "$CALLS"; shift; "$@"; }
systemctl() { printf 'failed\n'; }
recovery_expired_compatibility() { printf '{"kind":"data-contract"}\n'; }
docker() {
  case "$1 $2" in
    'pull '*) printf 'pull\n' >> "$CALLS"; if [[ "$PREFLIGHT_DELAY" == true ]]; then SECONDS=$((SECONDS + 120)); fi;;
    'image inspect')
      if [[ "$*" == *org.opencontainers.image.revision* ]]; then
        if [[ "$BAD_COMMIT" == true ]]; then printf 'wrong\n'; else printf '%s\n' "$BACKUP_HELPER_COMMIT"; fi
      else
        if [[ "$BAD_TREE" == true && "$*" == *"$IMAGE_DIGEST"* ]]; then printf 'dddddddddddddddddddddddddddddddddddddddd\n'; else printf '%s\n' "$TREE"; fi
      fi;;
    'run '*) printf '{"contract":"booklet-backup-helper-v1","manifestVersion":"1","dataContractVersion":"booklet-data-v1","initializationRequired":false,"migrationRequired":false}\n';;
    'ps '*) [[ "$ACTIVE" != true ]] || printf 'active-container\n';;
    *) printf 'unexpected docker call\n' >&2; return 1;;
  esac
}
recovery_app_json() { printf 'target-read\n' >> "$CALLS"; printf '{"verified":true}\n' > "$4"; }
maintenance() {
  printf '%s subject=%s request=%s backup=%s detached=%s\n' "$*" "${BACKUP_SUBJECT_IMAGE:-unset}" "$REQUEST_ID" "${BACKUP_ID:-unset}" "${MAINTENANCE_DETACHED:-false}" >> "$CALLS"
  case "$2 $3" in
    'recovery inspect')
      if [[ "$COMPLETE" == true ]]; then jq -nc --arg id "$BACKUP_ID" '{verified:true,backupId:$id}'; else jq -nc --arg id "$BACKUP_ID" '{complete:false,backupId:$id}'; fi;;
    'recovery backup') printf '{"backupId":"fresh"}\n';;
    'recovery verify')
      [[ "$VERIFY_FAIL" != true ]] || return 1
      jq -nc --arg backup "$BACKUP_ID" --arg image "$BACKUP_SUBJECT_IMAGE" '{verified:true,backupId:$backup,environment:"_staging",database:"kids_booklet",imageDigest:$image}';;
    'deployment-control enable') printf '{"maintenance":true,"draining":false,"activeMutations":0}\n';;
    *) printf 'unexpected maintenance call\n' >&2; return 1;;
  esac
}
compose() { printf 'compose %s\n' "$*" >> "$CALLS"; }
verify_application() { printf 'readiness\n' >> "$CALLS"; }
run_recovery() { backup_deployment_recovery "$CURRENT" "$IMAGE_DIGEST" "$EVIDENCE" "$JOURNAL"; }
preview() {
  APPLY=false
  run_recovery > "$TEMP_DIR/preview"
  PREVIEW_DIGEST="$(sed -n 's/.*digest=\([a-f0-9]*\)$/\1/p' "$TEMP_DIR/preview")"
  [[ "$PREVIEW_DIGEST" =~ ^[a-f0-9]{64}$ ]]
  APPLY=true
}
assert_preserved() {
  cmp "$TEMP_DIR/original.json" "$STATE/operations/$ORIGINAL_REQUEST_ID.json"
  cmp "$TEMP_DIR/handoff.json" "$STATE/operations/recovery-handoff-$ORIGINAL_REQUEST_ID.json"
  jq -e '.phase=="complete" and .purpose=="maintenance-backup-v1"' "$JOURNAL" >/dev/null
  [[ ! -e "$STATE/operation.json" && ! -e "$STATE/recovery-handoff-staging.json" ]]
}
case "$1" in
  admission-states)
    drain_application() { printf 'normal-drain\n' >> "$CALLS"; }
    maintenance() { printf '%s\n' "$ADMISSION"; }
    ADMISSION='{"maintenance":true,"draining":false,"activeMutations":0,"interruptedMutations":0,"mutationOwners":[]}'
    backup_handoff_admission "$CURRENT" > /dev/null
    ! grep -q normal-drain "$CALLS"
    ADMISSION='{"maintenance":false,"draining":false}'
    backup_handoff_admission "$CURRENT"
    [[ "$(grep -c normal-drain "$CALLS")" == 1 ]]
    for ADMISSION in '{"maintenance":true,"draining":true,"activeMutations":0}' '{"maintenance":true,"draining":false,"activeMutations":1}' '{"maintenance":true,"draining":false,"activeMutations":0,"interruptedMutations":1}' '{"maintenance":true,"draining":false,"activeMutations":0,"mutationOwners":[{}]}' '{}' 'not-json'; do
      if (trap - EXIT; backup_handoff_admission "$CURRENT") > /dev/null 2>&1; then exit 1; fi
    done
    [[ "$(grep -c normal-drain "$CALLS")" == 1 ]];;
  expired-maintenance-cleanup)
    eval "$REAL_MAINTENANCE"
    MAINTENANCE_DETACHED=true
    CONTROL_DEADLINE_SECONDS=$((SECONDS + 1))
    compose() { SECONDS=$((SECONDS + 2)); return 124; }
    docker() {
      printf 'cleanup %s\n' "$1" >> "$CALLS"
      if [[ "$1" == inspect ]]; then
        jq -nc --arg id "$REQUEST_ID" '[{Config:{Labels:{"uk.co.uniwares.booklet.request":$id,"uk.co.uniwares.booklet.environment":"staging","com.docker.compose.project":"kids-booklet-staging","com.docker.compose.oneoff":"True"}}}]'
      fi
    }
    if maintenance "$CURRENT" recovery backup > "$TEMP_DIR/maintenance.out" 2>&1; then exit 1; fi
    grep -q 'cleanup inspect' "$CALLS"
    grep -q 'cleanup stop' "$CALLS"
    grep -q 'cleanup rm' "$CALLS"
    [[ "$CONTROL_DEADLINE_SECONDS" -le "$SECONDS" ]];;
  preview)
    preview
    cmp "$TEMP_DIR/original.json" "$STATE/operation.json"
    cmp "$TEMP_DIR/handoff.json" "$STATE/recovery-handoff-staging.json"
    [[ ! -e "$JOURNAL" && ! -e "$STATE/backup-helper-staging.json" ]]
    ! grep -Eq 'recovery backup|compose|deployment-control|readiness' "$CALLS";;
  apply)
    preview; run_recovery > /dev/null; assert_preserved
    [[ "$(grep -c 'recovery backup' "$CALLS")" == 1 ]]
    grep -F "subject=$IMAGE_DIGEST request=$REQUEST_ID backup=staging-storage-$REQUEST_ID detached=true" "$CALLS" >/dev/null || { cat "$CALLS"; exit 1; }
    backup_helper_for_deploy "$CURRENT"
    [[ "$(jq -r .services.app.image "$BACKUP_HELPER_RELEASE/image.json")" == "$BACKUP_HELPER_IMAGE" ]];;
  reentry|changed-journal|deadline)
    preview; VERIFY_FAIL=true
    if (trap - EXIT; run_recovery) > /dev/null 2>&1; then exit 1; fi
    jq -e '.phase=="backing-up"' "$JOURNAL" >/dev/null
    VERIFY_FAIL=false
    if [[ "$1" == changed-journal ]]; then
      jq '.changed=true' "$STATE/operation.json" > "$TEMP_DIR/change"; mv "$TEMP_DIR/change" "$STATE/operation.json"
    elif [[ "$1" == deadline ]]; then
      jq '.deadlineAtSeconds=1' "$JOURNAL" > "$TEMP_DIR/change"; mv "$TEMP_DIR/change" "$JOURNAL"
    fi
    if [[ "$1" == reentry ]]; then run_recovery > /dev/null; assert_preserved
    elif (trap - EXIT; run_recovery) > /dev/null 2>&1; then exit 1; fi
    [[ "$(grep -c 'recovery backup' "$CALLS")" == 1 ]]
    if [[ "$1" == deadline ]]; then [[ "$(grep -c 'pull' "$CALLS")" == 2 ]]; fi;;
  completed)
    COMPLETE=true; preview; run_recovery > /dev/null; assert_preserved
    ! grep -q 'recovery backup' "$CALLS"
    before="$(wc -l < "$CALLS")"; run_recovery > /dev/null
    ! tail -n "+$((before+1))" "$CALLS" | grep -Eq 'recovery backup|recovery verify|compose|deployment-control|readiness';;
  near-expired-preflight)
    CONTROL_DEADLINE_SECONDS=$((SECONDS + 7))
    prepare_backup_helper "$CURRENT" "$BACKUP_HELPER_IMAGE" "$BACKUP_HELPER_COMMIT"
    awk '/^timeout / { value=$2; sub(/s$/, "", value); if (value > 7 || value <= 0) exit 1; count++ } END { if (count < 2) exit 1 }' "$CALLS";;
  preflight-budget)
    preview
    PREFLIGHT_DELAY=true
    deadline_before=$(( $(date +%s) + CONTROL_DEADLINE_SECONDS - SECONDS ))
    run_recovery > /dev/null; assert_preserved
    [[ "$(jq -r .deadlineAtSeconds "$JOURNAL")" -le "$((deadline_before - 110))" ]];;
  changed-parent|changed-marker)
    preview
    if [[ "$1" == changed-parent ]]; then
      jq '.appPreviewDigest="changed"' "$STATE/recoveries/decision-recovery/host.json" > "$TEMP_DIR/change"
      mv "$TEMP_DIR/change" "$STATE/recoveries/decision-recovery/host.json"
    else
      jq '.appPreviewDigest="changed"' "$STATE/recovery-handoff-staging.json" > "$TEMP_DIR/change"
      mv "$TEMP_DIR/change" "$STATE/recovery-handoff-staging.json"
    fi
    if (trap - EXIT; run_recovery) > /dev/null 2>&1; then exit 1; fi
    [[ ! -e "$JOURNAL" ]]
    ! grep -q 'recovery backup' "$CALLS";;
  helper-mismatch|active-containers)
    [[ "$1" != helper-mismatch ]] || BAD_COMMIT=true
    [[ "$1" != active-containers ]] || ACTIVE=true
    if (trap - EXIT; run_recovery) > /dev/null 2>&1; then exit 1; fi
    [[ ! -e "$JOURNAL" ]]
    ! grep -Eq 'recovery backup|compose|deployment-control|readiness' "$CALLS";;
  tree-mismatch)
    preview; run_recovery > /dev/null; assert_preserved
    BAD_TREE=true
    if (trap - EXIT; backup_helper_for_deploy "$CURRENT") > /dev/null 2>&1; then exit 1; fi;;
  *) exit 1;;
esac
printf 'passed backup helper %s\n' "$1"
