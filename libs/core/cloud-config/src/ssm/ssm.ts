import { ENVIRONMENT } from '../common/app';

export const TC_SSM_PARAMETER = {
  [ENVIRONMENT.PROD]: {
    VPC: {
      VPC_ID: `/tc/${ENVIRONMENT.PROD}/vpc/vpcId`,
      PRIVATE_SUBNET_IDS: `/tc/${ENVIRONMENT.PROD}/vpc/privateSubnetIds`,
      PUBLIC_SUBNET_IDS: `/tc/${ENVIRONMENT.PROD}/vpc/publicSubnetIds`,
    },
    EFS: {
      FILE_SYSTEM_ID: `/tc/${ENVIRONMENT.PROD}/efs/fileSystemId`,
      FILE_SYSTEM_ARN: `/tc/${ENVIRONMENT.PROD}/efs/fileSystemArn`,
      SECURITY_GROUP_ID: `/tc/${ENVIRONMENT.PROD}/efs/securityGroupId`,
    },
    ECR: {
      TEAMCLAW_REPO_URI: `/tc/${ENVIRONMENT.PROD}/ecr/teamclawRepoUri`,
    },
    ECS: {
      CLUSTER_ARN: `/tc/${ENVIRONMENT.PROD}/ecs/clusterArn`,
      CLUSTER_NAME: `/tc/${ENVIRONMENT.PROD}/ecs/clusterName`,
      ALB_LISTENER_ARN: `/tc/${ENVIRONMENT.PROD}/ecs/albListenerArn`,
      ALB_SECURITY_GROUP_ID: `/tc/${ENVIRONMENT.PROD}/ecs/albSecurityGroupId`,
    },
    COGNITO: {
      USER_POOL_ID: `/tc/${ENVIRONMENT.PROD}/cognito/userPoolId`,
      USER_POOL_ARN: `/tc/${ENVIRONMENT.PROD}/cognito/userPoolArn`,
      USER_POOL_CLIENT_ID: `/tc/${ENVIRONMENT.PROD}/cognito/userPoolClientId`,
    },
    API_GATEWAY: {
      KEY_POOL_PROXY_URL: `/tc/${ENVIRONMENT.PROD}/apiGateway/keyPoolProxyUrl`,
    },
    SECRETS: {
      API_KEYS_SECRET_ARN: `/tc/${ENVIRONMENT.PROD}/secrets/apiKeysSecretArn`,
    },
  },
  [ENVIRONMENT.DEV]: {
    VPC: {
      VPC_ID: `/tc/${ENVIRONMENT.DEV}/vpc/vpcId`,
      PRIVATE_SUBNET_IDS: `/tc/${ENVIRONMENT.DEV}/vpc/privateSubnetIds`,
      PUBLIC_SUBNET_IDS: `/tc/${ENVIRONMENT.DEV}/vpc/publicSubnetIds`,
    },
    EFS: {
      FILE_SYSTEM_ID: `/tc/${ENVIRONMENT.DEV}/efs/fileSystemId`,
      FILE_SYSTEM_ARN: `/tc/${ENVIRONMENT.DEV}/efs/fileSystemArn`,
      SECURITY_GROUP_ID: `/tc/${ENVIRONMENT.DEV}/efs/securityGroupId`,
    },
    ECR: {
      TEAMCLAW_REPO_URI: `/tc/${ENVIRONMENT.DEV}/ecr/teamclawRepoUri`,
    },
    ECS: {
      CLUSTER_ARN: `/tc/${ENVIRONMENT.DEV}/ecs/clusterArn`,
      CLUSTER_NAME: `/tc/${ENVIRONMENT.DEV}/ecs/clusterName`,
      ALB_LISTENER_ARN: `/tc/${ENVIRONMENT.DEV}/ecs/albListenerArn`,
      ALB_SECURITY_GROUP_ID: `/tc/${ENVIRONMENT.DEV}/ecs/albSecurityGroupId`,
    },
    COGNITO: {
      USER_POOL_ID: `/tc/${ENVIRONMENT.DEV}/cognito/userPoolId`,
      USER_POOL_ARN: `/tc/${ENVIRONMENT.DEV}/cognito/userPoolArn`,
      USER_POOL_CLIENT_ID: `/tc/${ENVIRONMENT.DEV}/cognito/userPoolClientId`,
    },
    API_GATEWAY: {
      KEY_POOL_PROXY_URL: `/tc/${ENVIRONMENT.DEV}/apiGateway/keyPoolProxyUrl`,
    },
    SECRETS: {
      API_KEYS_SECRET_ARN: `/tc/${ENVIRONMENT.DEV}/secrets/apiKeysSecretArn`,
    },
  },
};
