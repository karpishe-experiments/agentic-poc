#!/usr/bin/env bash
set -euo pipefail
: "${DEPLOYMENT_JSON:?Set DEPLOYMENT_JSON to the Terraform deployment output file.}"
command_json="$(jq -cn --args '$ARGS.positional' -- "$@")"
cluster="$(jq -r .cluster "$DEPLOYMENT_JSON")"
task="$(jq -r .maintenance_task_definition "$DEPLOYMENT_JSON")"
subnets="$(jq -r '.subnet_ids|join(",")' "$DEPLOYMENT_JSON")"
groups="$(jq -r '.security_group_ids|join(",")' "$DEPLOYMENT_JSON")"
container="$(jq -r .container_name "$DEPLOYMENT_JSON")"
environment_json="$(jq -cn --arg backup "${BACKUP_ID:-}" --arg confirm "${CONFIRM_DATABASE:-}" --arg url "$(jq -r .url "$DEPLOYMENT_JSON")" '[{name:"BACKUP_ID",value:$backup},{name:"CONFIRM_DATABASE",value:$confirm},{name:"DEPLOYMENT_URL",value:$url}]')"
overrides="$(jq -cn --arg name "$container" --argjson command "$command_json" --argjson environment "$environment_json" '{containerOverrides:[{name:$name,command:$command,environment:$environment}]}')"
task_arn="$(aws ecs run-task --cluster "$cluster" --task-definition "$task" --launch-type FARGATE --network-configuration "awsvpcConfiguration={subnets=[$subnets],securityGroups=[$groups],assignPublicIp=DISABLED}" --overrides "$overrides" --query 'tasks[0].taskArn' --output text)"
[[ "$task_arn" != "None" ]] || { echo "ECS did not start the maintenance task." >&2; exit 1; }
aws ecs wait tasks-stopped --cluster "$cluster" --tasks "$task_arn"
exit_code="$(aws ecs describe-tasks --cluster "$cluster" --tasks "$task_arn" --query 'tasks[0].containers[0].exitCode' --output text)"
[[ "$exit_code" == "0" ]] || { aws ecs describe-tasks --cluster "$cluster" --tasks "$task_arn"; exit 1; }
