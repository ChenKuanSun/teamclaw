import { ENVIRONMENT } from '@OpenClaw/core/constants';

export const OC_SSM_PARAMETER = {
  [ENVIRONMENT.PROD]: {
    VPC: {
      VPC_ID: `/oc/${ENVIRONMENT.PROD}/vpc/vpcId`,
      PRIVATE_SUBNET_IDS: `/oc/${ENVIRONMENT.PROD}/vpc/privateSubnetIds`,
      PUBLIC_SUBNET_IDS: `/oc/${ENVIRONMENT.PROD}/vpc/publicSubnetIds`,
    },
    EFS: {
      FILE_SYSTEM_ID: `/oc/${ENVIRONMENT.PROD}/efs/fileSystemId`,
      FILE_SYSTEM_ARN: `/oc/${ENVIRONMENT.PROD}/efs/fileSystemArn`,
      SECURITY_GROUP_ID: `/oc/${ENVIRONMENT.PROD}/efs/securityGroupId`,
    },
    ECR: {
      OPENCLAW_REPO_URI: `/oc/${ENVIRONMENT.PROD}/ecr/openclawRepoUri`,
    },
    ECS: {
      CLUSTER_ARN: `/oc/${ENVIRONMENT.PROD}/ecs/clusterArn`,
      CLUSTER_NAME: `/oc/${ENVIRONMENT.PROD}/ecs/clusterName`,
      ALB_LISTENER_ARN: `/oc/${ENVIRONMENT.PROD}/ecs/albListenerArn`,
      ALB_SECURITY_GROUP_ID: `/oc/${ENVIRONMENT.PROD}/ecs/albSecurityGroupId`,
    },
    COGNITO: {
      USER_POOL_ID: `/oc/${ENVIRONMENT.PROD}/cognito/userPoolId`,
      USER_POOL_ARN: `/oc/${ENVIRONMENT.PROD}/cognito/userPoolArn`,
      USER_POOL_CLIENT_ID: `/oc/${ENVIRONMENT.PROD}/cognito/userPoolClientId`,
    },
    API_GATEWAY: {
      KEY_POOL_PROXY_URL: `/oc/${ENVIRONMENT.PROD}/apiGateway/keyPoolProxyUrl`,
    },
    SECRETS: {
      API_KEYS_SECRET_ARN: `/oc/${ENVIRONMENT.PROD}/secrets/apiKeysSecretArn`,
    },
  },
  [ENVIRONMENT.DEV]: {
    VPC: {
      VPC_ID: `/oc/${ENVIRONMENT.DEV}/vpc/vpcId`,
      PRIVATE_SUBNET_IDS: `/oc/${ENVIRONMENT.DEV}/vpc/privateSubnetIds`,
      PUBLIC_SUBNET_IDS: `/oc/${ENVIRONMENT.DEV}/vpc/publicSubnetIds`,
    },
    EFS: {
      FILE_SYSTEM_ID: `/oc/${ENVIRONMENT.DEV}/efs/fileSystemId`,
      FILE_SYSTEM_ARN: `/oc/${ENVIRONMENT.DEV}/efs/fileSystemArn`,
      SECURITY_GROUP_ID: `/oc/${ENVIRONMENT.DEV}/efs/securityGroupId`,
    },
    ECR: {
      OPENCLAW_REPO_URI: `/oc/${ENVIRONMENT.DEV}/ecr/openclawRepoUri`,
    },
    ECS: {
      CLUSTER_ARN: `/oc/${ENVIRONMENT.DEV}/ecs/clusterArn`,
      CLUSTER_NAME: `/oc/${ENVIRONMENT.DEV}/ecs/clusterName`,
      ALB_LISTENER_ARN: `/oc/${ENVIRONMENT.DEV}/ecs/albListenerArn`,
      ALB_SECURITY_GROUP_ID: `/oc/${ENVIRONMENT.DEV}/ecs/albSecurityGroupId`,
    },
    COGNITO: {
      USER_POOL_ID: `/oc/${ENVIRONMENT.DEV}/cognito/userPoolId`,
      USER_POOL_ARN: `/oc/${ENVIRONMENT.DEV}/cognito/userPoolArn`,
      USER_POOL_CLIENT_ID: `/oc/${ENVIRONMENT.DEV}/cognito/userPoolClientId`,
    },
    API_GATEWAY: {
      KEY_POOL_PROXY_URL: `/oc/${ENVIRONMENT.DEV}/apiGateway/keyPoolProxyUrl`,
    },
    SECRETS: {
      API_KEYS_SECRET_ARN: `/oc/${ENVIRONMENT.DEV}/secrets/apiKeysSecretArn`,
    },
  },
};
