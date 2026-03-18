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
      SIDECAR_REPO_URI: `/tc/${ENVIRONMENT.PROD}/ecr/sidecarRepoUri`,
    },
    ECS: {
      CLUSTER_ARN: `/tc/${ENVIRONMENT.PROD}/ecs/clusterArn`,
      CLUSTER_NAME: `/tc/${ENVIRONMENT.PROD}/ecs/clusterName`,
      ALB_LISTENER_ARN: `/tc/${ENVIRONMENT.PROD}/ecs/albListenerArn`,
      ALB_SECURITY_GROUP_ID: `/tc/${ENVIRONMENT.PROD}/ecs/albSecurityGroupId`,
      ALB_DNS_NAME: `/tc/${ENVIRONMENT.PROD}/ecs/albDnsName`,
      ALB_TARGET_GROUP_ARN: `/tc/${ENVIRONMENT.PROD}/ecs/albTargetGroupArn`,
      TASK_DEFINITION_ARN: `/tc/${ENVIRONMENT.PROD}/ecs/taskDefinitionArn`,
      TASK_ROLE_ARN: `/tc/${ENVIRONMENT.PROD}/ecs/taskRoleArn`,
      EXECUTION_ROLE_ARN: `/tc/${ENVIRONMENT.PROD}/ecs/executionRoleArn`,
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
    DYNAMODB: {
      USERS_TABLE_ARN: `/tc/${ENVIRONMENT.PROD}/dynamodb/usersTableArn`,
      USERS_TABLE_NAME: `/tc/${ENVIRONMENT.PROD}/dynamodb/usersTableName`,
      USAGE_TABLE_ARN: `/tc/${ENVIRONMENT.PROD}/dynamodb/usageTableArn`,
      USAGE_TABLE_NAME: `/tc/${ENVIRONMENT.PROD}/dynamodb/usageTableName`,
      TEAMS_TABLE_ARN: `/tc/${ENVIRONMENT.PROD}/dynamodb/teamsTableArn`,
      TEAMS_TABLE_NAME: `/tc/${ENVIRONMENT.PROD}/dynamodb/teamsTableName`,
      CONFIG_TABLE_ARN: `/tc/${ENVIRONMENT.PROD}/dynamodb/configTableArn`,
      CONFIG_TABLE_NAME: `/tc/${ENVIRONMENT.PROD}/dynamodb/configTableName`,
      SKILLS_TABLE_ARN: `/tc/${ENVIRONMENT.PROD}/dynamodb/skillsTableArn`,
      SKILLS_TABLE_NAME: `/tc/${ENVIRONMENT.PROD}/dynamodb/skillsTableName`,
    },
    ADMIN_COGNITO: {
      USER_POOL_ID: `/tc/${ENVIRONMENT.PROD}/admin-cognito/userPoolId`,
      USER_POOL_CLIENT_ID: `/tc/${ENVIRONMENT.PROD}/admin-cognito/userPoolClientId`,
      USER_POOL_DOMAIN: `/tc/${ENVIRONMENT.PROD}/admin-cognito/userPoolDomain`,
    },
    ADMIN_API: {
      HTTP_API_ID: `/tc/${ENVIRONMENT.PROD}/admin-api/httpApiId`,
      HTTP_API_ENDPOINT: `/tc/${ENVIRONMENT.PROD}/admin-api/httpApiEndpoint`,
      LAMBDA: {
        // Dashboard
        GET_DASHBOARD_STATS_LAMBDA_NAME: `/tc/${ENVIRONMENT.PROD}/admin-api/lambda/getDashboardStatsLambdaName`,
        // Users
        QUERY_USERS_LAMBDA_NAME: `/tc/${ENVIRONMENT.PROD}/admin-api/lambda/queryUsersLambdaName`,
        GET_USER_LAMBDA_NAME: `/tc/${ENVIRONMENT.PROD}/admin-api/lambda/getUserLambdaName`,
        UPDATE_USER_LAMBDA_NAME: `/tc/${ENVIRONMENT.PROD}/admin-api/lambda/updateUserLambdaName`,
        DELETE_USER_LAMBDA_NAME: `/tc/${ENVIRONMENT.PROD}/admin-api/lambda/deleteUserLambdaName`,
        // Teams
        QUERY_TEAMS_LAMBDA_NAME: `/tc/${ENVIRONMENT.PROD}/admin-api/lambda/queryTeamsLambdaName`,
        GET_TEAM_LAMBDA_NAME: `/tc/${ENVIRONMENT.PROD}/admin-api/lambda/getTeamLambdaName`,
        CREATE_TEAM_LAMBDA_NAME: `/tc/${ENVIRONMENT.PROD}/admin-api/lambda/createTeamLambdaName`,
        UPDATE_TEAM_LAMBDA_NAME: `/tc/${ENVIRONMENT.PROD}/admin-api/lambda/updateTeamLambdaName`,
        DELETE_TEAM_LAMBDA_NAME: `/tc/${ENVIRONMENT.PROD}/admin-api/lambda/deleteTeamLambdaName`,
        // Containers
        QUERY_CONTAINERS_LAMBDA_NAME: `/tc/${ENVIRONMENT.PROD}/admin-api/lambda/queryContainersLambdaName`,
        GET_CONTAINER_LAMBDA_NAME: `/tc/${ENVIRONMENT.PROD}/admin-api/lambda/getContainerLambdaName`,
        START_CONTAINER_LAMBDA_NAME: `/tc/${ENVIRONMENT.PROD}/admin-api/lambda/startContainerLambdaName`,
        STOP_CONTAINER_LAMBDA_NAME: `/tc/${ENVIRONMENT.PROD}/admin-api/lambda/stopContainerLambdaName`,
        PROVISION_CONTAINER_LAMBDA_NAME: `/tc/${ENVIRONMENT.PROD}/admin-api/lambda/provisionContainerLambdaName`,
        // Config
        GET_GLOBAL_CONFIG_LAMBDA_NAME: `/tc/${ENVIRONMENT.PROD}/admin-api/lambda/getGlobalConfigLambdaName`,
        UPDATE_GLOBAL_CONFIG_LAMBDA_NAME: `/tc/${ENVIRONMENT.PROD}/admin-api/lambda/updateGlobalConfigLambdaName`,
        GET_TEAM_CONFIG_LAMBDA_NAME: `/tc/${ENVIRONMENT.PROD}/admin-api/lambda/getTeamConfigLambdaName`,
        UPDATE_TEAM_CONFIG_LAMBDA_NAME: `/tc/${ENVIRONMENT.PROD}/admin-api/lambda/updateTeamConfigLambdaName`,
        GET_USER_CONFIG_LAMBDA_NAME: `/tc/${ENVIRONMENT.PROD}/admin-api/lambda/getUserConfigLambdaName`,
        UPDATE_USER_CONFIG_LAMBDA_NAME: `/tc/${ENVIRONMENT.PROD}/admin-api/lambda/updateUserConfigLambdaName`,
        // API Keys
        GET_API_KEYS_LAMBDA_NAME: `/tc/${ENVIRONMENT.PROD}/admin-api/lambda/getApiKeysLambdaName`,
        ADD_API_KEY_LAMBDA_NAME: `/tc/${ENVIRONMENT.PROD}/admin-api/lambda/addApiKeyLambdaName`,
        REMOVE_API_KEY_LAMBDA_NAME: `/tc/${ENVIRONMENT.PROD}/admin-api/lambda/removeApiKeyLambdaName`,
        GET_KEY_USAGE_STATS_LAMBDA_NAME: `/tc/${ENVIRONMENT.PROD}/admin-api/lambda/getKeyUsageStatsLambdaName`,
        // Analytics
        GET_SYSTEM_ANALYTICS_LAMBDA_NAME: `/tc/${ENVIRONMENT.PROD}/admin-api/lambda/getSystemAnalyticsLambdaName`,
        QUERY_USERS_USAGE_LAMBDA_NAME: `/tc/${ENVIRONMENT.PROD}/admin-api/lambda/queryUsersUsageLambdaName`,
        GET_USAGE_BY_PROVIDER_LAMBDA_NAME: `/tc/${ENVIRONMENT.PROD}/admin-api/lambda/getUsageByProviderLambdaName`,
        // Session
        USER_SESSION_LAMBDA_NAME: `/tc/${ENVIRONMENT.PROD}/admin-api/lambda/userSessionLambdaName`,
        // Onboarding
        GET_ONBOARDING_STATUS_LAMBDA_NAME: `/tc/${ENVIRONMENT.PROD}/admin-api/lambda/getOnboardingStatusLambdaName`,
        // Skills Approval
        REQUEST_SKILL_INSTALL_LAMBDA_NAME: `/tc/${ENVIRONMENT.PROD}/admin-api/lambda/requestSkillInstallLambdaName`,
        REVIEW_SKILL_REQUEST_LAMBDA_NAME: `/tc/${ENVIRONMENT.PROD}/admin-api/lambda/reviewSkillRequestLambdaName`,
        LIST_PENDING_SKILLS_LAMBDA_NAME: `/tc/${ENVIRONMENT.PROD}/admin-api/lambda/listPendingSkillsLambdaName`,
        LIST_APPROVED_SKILLS_LAMBDA_NAME: `/tc/${ENVIRONMENT.PROD}/admin-api/lambda/listApprovedSkillsLambdaName`,
      },
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
      SIDECAR_REPO_URI: `/tc/${ENVIRONMENT.DEV}/ecr/sidecarRepoUri`,
    },
    ECS: {
      CLUSTER_ARN: `/tc/${ENVIRONMENT.DEV}/ecs/clusterArn`,
      CLUSTER_NAME: `/tc/${ENVIRONMENT.DEV}/ecs/clusterName`,
      ALB_LISTENER_ARN: `/tc/${ENVIRONMENT.DEV}/ecs/albListenerArn`,
      ALB_SECURITY_GROUP_ID: `/tc/${ENVIRONMENT.DEV}/ecs/albSecurityGroupId`,
      ALB_DNS_NAME: `/tc/${ENVIRONMENT.DEV}/ecs/albDnsName`,
      ALB_TARGET_GROUP_ARN: `/tc/${ENVIRONMENT.DEV}/ecs/albTargetGroupArn`,
      TASK_DEFINITION_ARN: `/tc/${ENVIRONMENT.DEV}/ecs/taskDefinitionArn`,
      TASK_ROLE_ARN: `/tc/${ENVIRONMENT.DEV}/ecs/taskRoleArn`,
      EXECUTION_ROLE_ARN: `/tc/${ENVIRONMENT.DEV}/ecs/executionRoleArn`,
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
    DYNAMODB: {
      USERS_TABLE_ARN: `/tc/${ENVIRONMENT.DEV}/dynamodb/usersTableArn`,
      USERS_TABLE_NAME: `/tc/${ENVIRONMENT.DEV}/dynamodb/usersTableName`,
      USAGE_TABLE_ARN: `/tc/${ENVIRONMENT.DEV}/dynamodb/usageTableArn`,
      USAGE_TABLE_NAME: `/tc/${ENVIRONMENT.DEV}/dynamodb/usageTableName`,
      TEAMS_TABLE_ARN: `/tc/${ENVIRONMENT.DEV}/dynamodb/teamsTableArn`,
      TEAMS_TABLE_NAME: `/tc/${ENVIRONMENT.DEV}/dynamodb/teamsTableName`,
      CONFIG_TABLE_ARN: `/tc/${ENVIRONMENT.DEV}/dynamodb/configTableArn`,
      CONFIG_TABLE_NAME: `/tc/${ENVIRONMENT.DEV}/dynamodb/configTableName`,
      SKILLS_TABLE_ARN: `/tc/${ENVIRONMENT.DEV}/dynamodb/skillsTableArn`,
      SKILLS_TABLE_NAME: `/tc/${ENVIRONMENT.DEV}/dynamodb/skillsTableName`,
    },
    ADMIN_COGNITO: {
      USER_POOL_ID: `/tc/${ENVIRONMENT.DEV}/admin-cognito/userPoolId`,
      USER_POOL_CLIENT_ID: `/tc/${ENVIRONMENT.DEV}/admin-cognito/userPoolClientId`,
      USER_POOL_DOMAIN: `/tc/${ENVIRONMENT.DEV}/admin-cognito/userPoolDomain`,
    },
    ADMIN_API: {
      HTTP_API_ID: `/tc/${ENVIRONMENT.DEV}/admin-api/httpApiId`,
      HTTP_API_ENDPOINT: `/tc/${ENVIRONMENT.DEV}/admin-api/httpApiEndpoint`,
      LAMBDA: {
        // Dashboard
        GET_DASHBOARD_STATS_LAMBDA_NAME: `/tc/${ENVIRONMENT.DEV}/admin-api/lambda/getDashboardStatsLambdaName`,
        // Users
        QUERY_USERS_LAMBDA_NAME: `/tc/${ENVIRONMENT.DEV}/admin-api/lambda/queryUsersLambdaName`,
        GET_USER_LAMBDA_NAME: `/tc/${ENVIRONMENT.DEV}/admin-api/lambda/getUserLambdaName`,
        UPDATE_USER_LAMBDA_NAME: `/tc/${ENVIRONMENT.DEV}/admin-api/lambda/updateUserLambdaName`,
        DELETE_USER_LAMBDA_NAME: `/tc/${ENVIRONMENT.DEV}/admin-api/lambda/deleteUserLambdaName`,
        // Teams
        QUERY_TEAMS_LAMBDA_NAME: `/tc/${ENVIRONMENT.DEV}/admin-api/lambda/queryTeamsLambdaName`,
        GET_TEAM_LAMBDA_NAME: `/tc/${ENVIRONMENT.DEV}/admin-api/lambda/getTeamLambdaName`,
        CREATE_TEAM_LAMBDA_NAME: `/tc/${ENVIRONMENT.DEV}/admin-api/lambda/createTeamLambdaName`,
        UPDATE_TEAM_LAMBDA_NAME: `/tc/${ENVIRONMENT.DEV}/admin-api/lambda/updateTeamLambdaName`,
        DELETE_TEAM_LAMBDA_NAME: `/tc/${ENVIRONMENT.DEV}/admin-api/lambda/deleteTeamLambdaName`,
        // Containers
        QUERY_CONTAINERS_LAMBDA_NAME: `/tc/${ENVIRONMENT.DEV}/admin-api/lambda/queryContainersLambdaName`,
        GET_CONTAINER_LAMBDA_NAME: `/tc/${ENVIRONMENT.DEV}/admin-api/lambda/getContainerLambdaName`,
        START_CONTAINER_LAMBDA_NAME: `/tc/${ENVIRONMENT.DEV}/admin-api/lambda/startContainerLambdaName`,
        STOP_CONTAINER_LAMBDA_NAME: `/tc/${ENVIRONMENT.DEV}/admin-api/lambda/stopContainerLambdaName`,
        PROVISION_CONTAINER_LAMBDA_NAME: `/tc/${ENVIRONMENT.DEV}/admin-api/lambda/provisionContainerLambdaName`,
        // Config
        GET_GLOBAL_CONFIG_LAMBDA_NAME: `/tc/${ENVIRONMENT.DEV}/admin-api/lambda/getGlobalConfigLambdaName`,
        UPDATE_GLOBAL_CONFIG_LAMBDA_NAME: `/tc/${ENVIRONMENT.DEV}/admin-api/lambda/updateGlobalConfigLambdaName`,
        GET_TEAM_CONFIG_LAMBDA_NAME: `/tc/${ENVIRONMENT.DEV}/admin-api/lambda/getTeamConfigLambdaName`,
        UPDATE_TEAM_CONFIG_LAMBDA_NAME: `/tc/${ENVIRONMENT.DEV}/admin-api/lambda/updateTeamConfigLambdaName`,
        GET_USER_CONFIG_LAMBDA_NAME: `/tc/${ENVIRONMENT.DEV}/admin-api/lambda/getUserConfigLambdaName`,
        UPDATE_USER_CONFIG_LAMBDA_NAME: `/tc/${ENVIRONMENT.DEV}/admin-api/lambda/updateUserConfigLambdaName`,
        // API Keys
        GET_API_KEYS_LAMBDA_NAME: `/tc/${ENVIRONMENT.DEV}/admin-api/lambda/getApiKeysLambdaName`,
        ADD_API_KEY_LAMBDA_NAME: `/tc/${ENVIRONMENT.DEV}/admin-api/lambda/addApiKeyLambdaName`,
        REMOVE_API_KEY_LAMBDA_NAME: `/tc/${ENVIRONMENT.DEV}/admin-api/lambda/removeApiKeyLambdaName`,
        GET_KEY_USAGE_STATS_LAMBDA_NAME: `/tc/${ENVIRONMENT.DEV}/admin-api/lambda/getKeyUsageStatsLambdaName`,
        // Analytics
        GET_SYSTEM_ANALYTICS_LAMBDA_NAME: `/tc/${ENVIRONMENT.DEV}/admin-api/lambda/getSystemAnalyticsLambdaName`,
        QUERY_USERS_USAGE_LAMBDA_NAME: `/tc/${ENVIRONMENT.DEV}/admin-api/lambda/queryUsersUsageLambdaName`,
        GET_USAGE_BY_PROVIDER_LAMBDA_NAME: `/tc/${ENVIRONMENT.DEV}/admin-api/lambda/getUsageByProviderLambdaName`,
        // Session
        USER_SESSION_LAMBDA_NAME: `/tc/${ENVIRONMENT.DEV}/admin-api/lambda/userSessionLambdaName`,
        // Onboarding
        GET_ONBOARDING_STATUS_LAMBDA_NAME: `/tc/${ENVIRONMENT.DEV}/admin-api/lambda/getOnboardingStatusLambdaName`,
        // Skills Approval
        REQUEST_SKILL_INSTALL_LAMBDA_NAME: `/tc/${ENVIRONMENT.DEV}/admin-api/lambda/requestSkillInstallLambdaName`,
        REVIEW_SKILL_REQUEST_LAMBDA_NAME: `/tc/${ENVIRONMENT.DEV}/admin-api/lambda/reviewSkillRequestLambdaName`,
        LIST_PENDING_SKILLS_LAMBDA_NAME: `/tc/${ENVIRONMENT.DEV}/admin-api/lambda/listPendingSkillsLambdaName`,
        LIST_APPROVED_SKILLS_LAMBDA_NAME: `/tc/${ENVIRONMENT.DEV}/admin-api/lambda/listApprovedSkillsLambdaName`,
      },
    },
  },
};
