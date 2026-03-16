#!/bin/bash
# Register ECS task definition with sidecar proxy container
# Usage: ./register-task-definition.sh <env> <account-id> <region> <efs-filesystem-id>

set -euo pipefail

ENV="${1:?Usage: $0 <env> <account-id> <region> <efs-filesystem-id>}"
ACCOUNT_ID="${2:?Usage: $0 <env> <account-id> <region> <efs-filesystem-id>}"
REGION="${3:?Usage: $0 <env> <account-id> <region> <efs-filesystem-id>}"
EFS_FS_ID="${4:?Usage: $0 <env> <account-id> <region> <efs-filesystem-id>}"

TEAMCLAW_REPO="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/teamclaw-enterprise-${ENV}"
SIDECAR_REPO="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/teamclaw-sidecar-${ENV}"

# EFS volume (required)
VOLUMES="[{\"name\": \"efs-data\", \"efsVolumeConfiguration\": {\"fileSystemId\": \"${EFS_FS_ID}\", \"rootDirectory\": \"/\", \"transitEncryption\": \"ENABLED\", \"authorizationConfig\": {\"iam\": \"ENABLED\"}}}]"
TEAMCLAW_MOUNTS="[{\"sourceVolume\": \"efs-data\", \"containerPath\": \"/efs\", \"readOnly\": false}]"

aws ecs register-task-definition \
  --region "${REGION}" \
  --family "teamclaw-user-${ENV}" \
  --requires-compatibilities FARGATE \
  --network-mode awsvpc \
  --cpu 1024 --memory 2048 \
  --task-role-arn "arn:aws:iam::${ACCOUNT_ID}:role/teamclaw-task-role-${ENV}" \
  --execution-role-arn "arn:aws:iam::${ACCOUNT_ID}:role/teamclaw-execution-role-${ENV}" \
  --volumes "${VOLUMES}" \
  --container-definitions "[
    {
      \"name\": \"teamclaw\",
      \"image\": \"${TEAMCLAW_REPO}:latest\",
      \"essential\": true,
      \"portMappings\": [{\"containerPort\": 18789}],
      \"mountPoints\": ${TEAMCLAW_MOUNTS},
      \"dependsOn\": [{\"containerName\": \"proxy-sidecar\", \"condition\": \"HEALTHY\"}],
      \"logConfiguration\": {
        \"logDriver\": \"awslogs\",
        \"options\": {
          \"awslogs-group\": \"/ecs/teamclaw-${ENV}\",
          \"awslogs-region\": \"${REGION}\",
          \"awslogs-stream-prefix\": \"teamclaw\",
          \"awslogs-create-group\": \"true\"
        }
      }
    },
    {
      \"name\": \"proxy-sidecar\",
      \"image\": \"${SIDECAR_REPO}:latest\",
      \"essential\": true,
      \"portMappings\": [{\"containerPort\": 3000}],
      \"healthCheck\": {
        \"command\": [\"CMD-SHELL\", \"wget -qO- http://localhost:3000/health || exit 1\"],
        \"interval\": 10,
        \"timeout\": 3,
        \"retries\": 3
      },
      \"logConfiguration\": {
        \"logDriver\": \"awslogs\",
        \"options\": {
          \"awslogs-group\": \"/ecs/teamclaw-${ENV}\",
          \"awslogs-region\": \"${REGION}\",
          \"awslogs-stream-prefix\": \"sidecar\",
          \"awslogs-create-group\": \"true\"
        }
      }
    }
  ]"

echo "Task definition teamclaw-user-${ENV} registered with sidecar container."
