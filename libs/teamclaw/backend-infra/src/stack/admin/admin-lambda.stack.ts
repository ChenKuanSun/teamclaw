/**
 * Admin Lambda Stack
 *
 * Provides Lambda functions for admin panel endpoints.
 * All functions require admin authentication via Cognito.
 */

import {
  StackPropsWithEnv,
  TC_SSM_PARAMETER,
} from '@TeamClaw/core/cloud-config';
import { TC_LAMBDA_DEFAULT_PROPS } from '@TeamClaw/teamclaw/cloud-config';
import {
  Stack,
  aws_dynamodb,
  aws_iam,
  aws_lambda,
  aws_lambda_nodejs,
  aws_secretsmanager,
  aws_ssm,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import path from 'path';
import { LAMBDA_ENTRY_PATH } from '../../lambda';

export class AdminLambdaStack extends Stack {
  constructor(scope: Construct, id: string, props: StackPropsWithEnv) {
    super(scope, id, {
      ...props,
      description: 'TeamClaw Admin: Lambda Functions for Admin API',
    });
    const { deployEnv } = props;

    const SSM = TC_SSM_PARAMETER[deployEnv];
    const ADMIN_LAMBDA_SSM = SSM.ADMIN_API.LAMBDA;

    // ==========================================================
    // Import shared resources via SSM
    // ==========================================================

    // DynamoDB Tables
    const usersTable = aws_dynamodb.TableV2.fromTableArn(
      this,
      id + 'UsersTable',
      aws_ssm.StringParameter.valueForStringParameter(
        this,
        SSM.DYNAMODB.USERS_TABLE_ARN,
      ),
    );

    const usersTableName = aws_ssm.StringParameter.valueForStringParameter(
      this,
      SSM.DYNAMODB.USERS_TABLE_NAME,
    );

    const usageTable = aws_dynamodb.TableV2.fromTableArn(
      this,
      id + 'UsageTable',
      aws_ssm.StringParameter.valueForStringParameter(
        this,
        SSM.DYNAMODB.USAGE_TABLE_ARN,
      ),
    );

    const usageTableName = aws_ssm.StringParameter.valueForStringParameter(
      this,
      SSM.DYNAMODB.USAGE_TABLE_NAME,
    );

    const teamsTable = aws_dynamodb.TableV2.fromTableArn(
      this,
      id + 'TeamsTable',
      aws_ssm.StringParameter.valueForStringParameter(
        this,
        SSM.DYNAMODB.TEAMS_TABLE_ARN,
      ),
    );

    const teamsTableName = aws_ssm.StringParameter.valueForStringParameter(
      this,
      SSM.DYNAMODB.TEAMS_TABLE_NAME,
    );

    const configTable = aws_dynamodb.TableV2.fromTableArn(
      this,
      id + 'ConfigTable',
      aws_ssm.StringParameter.valueForStringParameter(
        this,
        SSM.DYNAMODB.CONFIG_TABLE_ARN,
      ),
    );

    const configTableName = aws_ssm.StringParameter.valueForStringParameter(
      this,
      SSM.DYNAMODB.CONFIG_TABLE_NAME,
    );

    // Secrets Manager — API Keys
    const apiKeysSecret = aws_secretsmanager.Secret.fromSecretCompleteArn(
      this,
      id + 'ApiKeysSecret',
      aws_ssm.StringParameter.valueForStringParameter(
        this,
        SSM.SECRETS.API_KEYS_SECRET_ARN,
      ),
    );

    // Cognito User Pool ID (for user management operations)
    const cognitoUserPoolId = aws_ssm.StringParameter.valueForStringParameter(
      this,
      SSM.COGNITO.USER_POOL_ID,
    );

    // Lifecycle Lambda function name (imported from SSM, set by control-plane stack)
    // TODO: Hardcoded SSM path — should use TC_SSM_PARAMETER constant (see ssm.ts).
    const lifecycleLambdaName = aws_ssm.StringParameter.valueForStringParameter(
      this,
      `/tc/${deployEnv}/lifecycle-lambda-name`,
    );
    const lifecycleLambda = aws_lambda.Function.fromFunctionName(
      this,
      id + 'LifecycleLambda',
      lifecycleLambdaName,
    );

    // ==========================================================
    // Base environment variables
    // ==========================================================
    const baseEnv = {
      DEPLOY_ENV: deployEnv,
    };

    // ==========================================================
    // Dashboard Lambda (1)
    // ==========================================================
    const getStatsLambda = new aws_lambda_nodejs.NodejsFunction(
      this,
      id + 'GetDashboardStatsLambda',
      {
        ...TC_LAMBDA_DEFAULT_PROPS,
        entry: path.join(
          LAMBDA_ENTRY_PATH,
          'admin',
          'dashboard',
          'get-stats.ts',
        ),
        environment: {
          ...baseEnv,
          USERS_TABLE_NAME: usersTableName,
          USAGE_TABLE_NAME: usageTableName,
        },
      },
    );
    usersTable.grantReadData(getStatsLambda);
    usageTable.grantReadData(getStatsLambda);

    new aws_ssm.StringParameter(this, id + 'GetDashboardStatsLambdaNameParam', {
      parameterName: ADMIN_LAMBDA_SSM.GET_DASHBOARD_STATS_LAMBDA_NAME,
      stringValue: getStatsLambda.functionName,
    });

    // ==========================================================
    // Users Lambdas (4)
    // ==========================================================
    const queryUsersLambda = new aws_lambda_nodejs.NodejsFunction(
      this,
      id + 'QueryUsersLambda',
      {
        ...TC_LAMBDA_DEFAULT_PROPS,
        entry: path.join(LAMBDA_ENTRY_PATH, 'admin', 'users', 'query-users.ts'),
        environment: {
          ...baseEnv,
          USERS_TABLE_NAME: usersTableName,
        },
      },
    );
    usersTable.grantReadData(queryUsersLambda);

    new aws_ssm.StringParameter(this, id + 'QueryUsersLambdaNameParam', {
      parameterName: ADMIN_LAMBDA_SSM.QUERY_USERS_LAMBDA_NAME,
      stringValue: queryUsersLambda.functionName,
    });

    const getUserLambda = new aws_lambda_nodejs.NodejsFunction(
      this,
      id + 'GetUserLambda',
      {
        ...TC_LAMBDA_DEFAULT_PROPS,
        entry: path.join(LAMBDA_ENTRY_PATH, 'admin', 'users', 'get-user.ts'),
        environment: {
          ...baseEnv,
          USERS_TABLE_NAME: usersTableName,
        },
      },
    );
    usersTable.grantReadData(getUserLambda);

    new aws_ssm.StringParameter(this, id + 'GetUserLambdaNameParam', {
      parameterName: ADMIN_LAMBDA_SSM.GET_USER_LAMBDA_NAME,
      stringValue: getUserLambda.functionName,
    });

    const updateUserLambda = new aws_lambda_nodejs.NodejsFunction(
      this,
      id + 'UpdateUserLambda',
      {
        ...TC_LAMBDA_DEFAULT_PROPS,
        entry: path.join(LAMBDA_ENTRY_PATH, 'admin', 'users', 'update-user.ts'),
        environment: {
          ...baseEnv,
          USERS_TABLE_NAME: usersTableName,
          COGNITO_USER_POOL_ID: cognitoUserPoolId,
        },
      },
    );
    usersTable.grantReadWriteData(updateUserLambda);
    updateUserLambda.addToRolePolicy(
      new aws_iam.PolicyStatement({
        effect: aws_iam.Effect.ALLOW,
        actions: [
          'cognito-idp:AdminUpdateUserAttributes',
          'cognito-idp:AdminEnableUser',
          'cognito-idp:AdminDisableUser',
        ],
        resources: [
          `arn:aws:cognito-idp:${this.region}:${this.account}:userpool/${cognitoUserPoolId}`,
        ],
      }),
    );

    new aws_ssm.StringParameter(this, id + 'UpdateUserLambdaNameParam', {
      parameterName: ADMIN_LAMBDA_SSM.UPDATE_USER_LAMBDA_NAME,
      stringValue: updateUserLambda.functionName,
    });

    const deleteUserLambda = new aws_lambda_nodejs.NodejsFunction(
      this,
      id + 'DeleteUserLambda',
      {
        ...TC_LAMBDA_DEFAULT_PROPS,
        entry: path.join(LAMBDA_ENTRY_PATH, 'admin', 'users', 'delete-user.ts'),
        environment: {
          ...baseEnv,
          USERS_TABLE_NAME: usersTableName,
          COGNITO_USER_POOL_ID: cognitoUserPoolId,
          LIFECYCLE_FUNCTION_NAME: lifecycleLambdaName,
        },
      },
    );
    usersTable.grantReadWriteData(deleteUserLambda);
    lifecycleLambda.grantInvoke(deleteUserLambda);
    deleteUserLambda.addToRolePolicy(
      new aws_iam.PolicyStatement({
        effect: aws_iam.Effect.ALLOW,
        actions: ['cognito-idp:AdminDeleteUser'],
        resources: [
          `arn:aws:cognito-idp:${this.region}:${this.account}:userpool/${cognitoUserPoolId}`,
        ],
      }),
    );
    // delete-user handler directly calls EFS DeleteAccessPoint
    deleteUserLambda.addToRolePolicy(
      new aws_iam.PolicyStatement({
        effect: aws_iam.Effect.ALLOW,
        actions: ['elasticfilesystem:DeleteAccessPoint'],
        resources: [
          Stack.of(this).formatArn({
            service: 'elasticfilesystem',
            resource: 'access-point',
            resourceName: '*',
          }),
        ],
      }),
    );

    new aws_ssm.StringParameter(this, id + 'DeleteUserLambdaNameParam', {
      parameterName: ADMIN_LAMBDA_SSM.DELETE_USER_LAMBDA_NAME,
      stringValue: deleteUserLambda.functionName,
    });

    // ==========================================================
    // Teams Lambdas (5)
    // ==========================================================
    const queryTeamsLambda = new aws_lambda_nodejs.NodejsFunction(
      this,
      id + 'QueryTeamsLambda',
      {
        ...TC_LAMBDA_DEFAULT_PROPS,
        entry: path.join(LAMBDA_ENTRY_PATH, 'admin', 'teams', 'query-teams.ts'),
        environment: {
          ...baseEnv,
          TEAMS_TABLE_NAME: teamsTableName,
        },
      },
    );
    teamsTable.grantReadData(queryTeamsLambda);

    new aws_ssm.StringParameter(this, id + 'QueryTeamsLambdaNameParam', {
      parameterName: ADMIN_LAMBDA_SSM.QUERY_TEAMS_LAMBDA_NAME,
      stringValue: queryTeamsLambda.functionName,
    });

    const getTeamLambda = new aws_lambda_nodejs.NodejsFunction(
      this,
      id + 'GetTeamLambda',
      {
        ...TC_LAMBDA_DEFAULT_PROPS,
        entry: path.join(LAMBDA_ENTRY_PATH, 'admin', 'teams', 'get-team.ts'),
        environment: {
          ...baseEnv,
          TEAMS_TABLE_NAME: teamsTableName,
        },
      },
    );
    teamsTable.grantReadData(getTeamLambda);

    new aws_ssm.StringParameter(this, id + 'GetTeamLambdaNameParam', {
      parameterName: ADMIN_LAMBDA_SSM.GET_TEAM_LAMBDA_NAME,
      stringValue: getTeamLambda.functionName,
    });

    const createTeamLambda = new aws_lambda_nodejs.NodejsFunction(
      this,
      id + 'CreateTeamLambda',
      {
        ...TC_LAMBDA_DEFAULT_PROPS,
        entry: path.join(LAMBDA_ENTRY_PATH, 'admin', 'teams', 'create-team.ts'),
        environment: {
          ...baseEnv,
          TEAMS_TABLE_NAME: teamsTableName,
        },
      },
    );
    teamsTable.grantReadWriteData(createTeamLambda);

    new aws_ssm.StringParameter(this, id + 'CreateTeamLambdaNameParam', {
      parameterName: ADMIN_LAMBDA_SSM.CREATE_TEAM_LAMBDA_NAME,
      stringValue: createTeamLambda.functionName,
    });

    const updateTeamLambda = new aws_lambda_nodejs.NodejsFunction(
      this,
      id + 'UpdateTeamLambda',
      {
        ...TC_LAMBDA_DEFAULT_PROPS,
        entry: path.join(LAMBDA_ENTRY_PATH, 'admin', 'teams', 'update-team.ts'),
        environment: {
          ...baseEnv,
          TEAMS_TABLE_NAME: teamsTableName,
        },
      },
    );
    teamsTable.grantReadWriteData(updateTeamLambda);

    new aws_ssm.StringParameter(this, id + 'UpdateTeamLambdaNameParam', {
      parameterName: ADMIN_LAMBDA_SSM.UPDATE_TEAM_LAMBDA_NAME,
      stringValue: updateTeamLambda.functionName,
    });

    const deleteTeamLambda = new aws_lambda_nodejs.NodejsFunction(
      this,
      id + 'DeleteTeamLambda',
      {
        ...TC_LAMBDA_DEFAULT_PROPS,
        entry: path.join(LAMBDA_ENTRY_PATH, 'admin', 'teams', 'delete-team.ts'),
        environment: {
          ...baseEnv,
          TEAMS_TABLE_NAME: teamsTableName,
          USERS_TABLE_NAME: usersTableName,
        },
      },
    );
    teamsTable.grantReadWriteData(deleteTeamLambda);
    usersTable.grantReadWriteData(deleteTeamLambda);

    new aws_ssm.StringParameter(this, id + 'DeleteTeamLambdaNameParam', {
      parameterName: ADMIN_LAMBDA_SSM.DELETE_TEAM_LAMBDA_NAME,
      stringValue: deleteTeamLambda.functionName,
    });

    // ==========================================================
    // Containers Lambdas (5)
    // ==========================================================
    const queryContainersLambda = new aws_lambda_nodejs.NodejsFunction(
      this,
      id + 'QueryContainersLambda',
      {
        ...TC_LAMBDA_DEFAULT_PROPS,
        entry: path.join(
          LAMBDA_ENTRY_PATH,
          'admin',
          'containers',
          'query-containers.ts',
        ),
        environment: {
          ...baseEnv,
          USERS_TABLE_NAME: usersTableName,
        },
      },
    );
    usersTable.grantReadData(queryContainersLambda);

    new aws_ssm.StringParameter(this, id + 'QueryContainersLambdaNameParam', {
      parameterName: ADMIN_LAMBDA_SSM.QUERY_CONTAINERS_LAMBDA_NAME,
      stringValue: queryContainersLambda.functionName,
    });

    const getContainerLambda = new aws_lambda_nodejs.NodejsFunction(
      this,
      id + 'GetContainerLambda',
      {
        ...TC_LAMBDA_DEFAULT_PROPS,
        entry: path.join(
          LAMBDA_ENTRY_PATH,
          'admin',
          'containers',
          'get-container.ts',
        ),
        environment: {
          ...baseEnv,
          USERS_TABLE_NAME: usersTableName,
        },
      },
    );
    usersTable.grantReadData(getContainerLambda);

    new aws_ssm.StringParameter(this, id + 'GetContainerLambdaNameParam', {
      parameterName: ADMIN_LAMBDA_SSM.GET_CONTAINER_LAMBDA_NAME,
      stringValue: getContainerLambda.functionName,
    });

    const startContainerLambda = new aws_lambda_nodejs.NodejsFunction(
      this,
      id + 'StartContainerLambda',
      {
        ...TC_LAMBDA_DEFAULT_PROPS,
        entry: path.join(
          LAMBDA_ENTRY_PATH,
          'admin',
          'containers',
          'start-container.ts',
        ),
        environment: {
          ...baseEnv,
          LIFECYCLE_LAMBDA_NAME: lifecycleLambdaName,
        },
      },
    );
    lifecycleLambda.grantInvoke(startContainerLambda);

    new aws_ssm.StringParameter(this, id + 'StartContainerLambdaNameParam', {
      parameterName: ADMIN_LAMBDA_SSM.START_CONTAINER_LAMBDA_NAME,
      stringValue: startContainerLambda.functionName,
    });

    const stopContainerLambda = new aws_lambda_nodejs.NodejsFunction(
      this,
      id + 'StopContainerLambda',
      {
        ...TC_LAMBDA_DEFAULT_PROPS,
        entry: path.join(
          LAMBDA_ENTRY_PATH,
          'admin',
          'containers',
          'stop-container.ts',
        ),
        environment: {
          ...baseEnv,
          LIFECYCLE_LAMBDA_NAME: lifecycleLambdaName,
        },
      },
    );
    lifecycleLambda.grantInvoke(stopContainerLambda);

    new aws_ssm.StringParameter(this, id + 'StopContainerLambdaNameParam', {
      parameterName: ADMIN_LAMBDA_SSM.STOP_CONTAINER_LAMBDA_NAME,
      stringValue: stopContainerLambda.functionName,
    });

    const provisionContainerLambda = new aws_lambda_nodejs.NodejsFunction(
      this,
      id + 'ProvisionContainerLambda',
      {
        ...TC_LAMBDA_DEFAULT_PROPS,
        entry: path.join(
          LAMBDA_ENTRY_PATH,
          'admin',
          'containers',
          'provision-container.ts',
        ),
        environment: {
          ...baseEnv,
          LIFECYCLE_LAMBDA_NAME: lifecycleLambdaName,
        },
      },
    );
    lifecycleLambda.grantInvoke(provisionContainerLambda);

    new aws_ssm.StringParameter(
      this,
      id + 'ProvisionContainerLambdaNameParam',
      {
        parameterName: ADMIN_LAMBDA_SSM.PROVISION_CONTAINER_LAMBDA_NAME,
        stringValue: provisionContainerLambda.functionName,
      },
    );

    // ==========================================================
    // Config Lambdas (6)
    // ==========================================================
    const getGlobalConfigLambda = new aws_lambda_nodejs.NodejsFunction(
      this,
      id + 'GetGlobalConfigLambda',
      {
        ...TC_LAMBDA_DEFAULT_PROPS,
        entry: path.join(
          LAMBDA_ENTRY_PATH,
          'admin',
          'config',
          'get-global-config.ts',
        ),
        environment: {
          ...baseEnv,
          CONFIG_TABLE_NAME: configTableName,
        },
      },
    );
    configTable.grantReadData(getGlobalConfigLambda);

    new aws_ssm.StringParameter(this, id + 'GetGlobalConfigLambdaNameParam', {
      parameterName: ADMIN_LAMBDA_SSM.GET_GLOBAL_CONFIG_LAMBDA_NAME,
      stringValue: getGlobalConfigLambda.functionName,
    });

    const updateGlobalConfigLambda = new aws_lambda_nodejs.NodejsFunction(
      this,
      id + 'UpdateGlobalConfigLambda',
      {
        ...TC_LAMBDA_DEFAULT_PROPS,
        entry: path.join(
          LAMBDA_ENTRY_PATH,
          'admin',
          'config',
          'update-global-config.ts',
        ),
        environment: {
          ...baseEnv,
          CONFIG_TABLE_NAME: configTableName,
        },
      },
    );
    configTable.grantReadWriteData(updateGlobalConfigLambda);

    new aws_ssm.StringParameter(
      this,
      id + 'UpdateGlobalConfigLambdaNameParam',
      {
        parameterName: ADMIN_LAMBDA_SSM.UPDATE_GLOBAL_CONFIG_LAMBDA_NAME,
        stringValue: updateGlobalConfigLambda.functionName,
      },
    );

    const getTeamConfigLambda = new aws_lambda_nodejs.NodejsFunction(
      this,
      id + 'GetTeamConfigLambda',
      {
        ...TC_LAMBDA_DEFAULT_PROPS,
        entry: path.join(
          LAMBDA_ENTRY_PATH,
          'admin',
          'config',
          'get-team-config.ts',
        ),
        environment: {
          ...baseEnv,
          CONFIG_TABLE_NAME: configTableName,
        },
      },
    );
    configTable.grantReadData(getTeamConfigLambda);

    new aws_ssm.StringParameter(this, id + 'GetTeamConfigLambdaNameParam', {
      parameterName: ADMIN_LAMBDA_SSM.GET_TEAM_CONFIG_LAMBDA_NAME,
      stringValue: getTeamConfigLambda.functionName,
    });

    const updateTeamConfigLambda = new aws_lambda_nodejs.NodejsFunction(
      this,
      id + 'UpdateTeamConfigLambda',
      {
        ...TC_LAMBDA_DEFAULT_PROPS,
        entry: path.join(
          LAMBDA_ENTRY_PATH,
          'admin',
          'config',
          'update-team-config.ts',
        ),
        environment: {
          ...baseEnv,
          CONFIG_TABLE_NAME: configTableName,
        },
      },
    );
    configTable.grantReadWriteData(updateTeamConfigLambda);

    new aws_ssm.StringParameter(this, id + 'UpdateTeamConfigLambdaNameParam', {
      parameterName: ADMIN_LAMBDA_SSM.UPDATE_TEAM_CONFIG_LAMBDA_NAME,
      stringValue: updateTeamConfigLambda.functionName,
    });

    const getUserConfigLambda = new aws_lambda_nodejs.NodejsFunction(
      this,
      id + 'GetUserConfigLambda',
      {
        ...TC_LAMBDA_DEFAULT_PROPS,
        entry: path.join(
          LAMBDA_ENTRY_PATH,
          'admin',
          'config',
          'get-user-config.ts',
        ),
        environment: {
          ...baseEnv,
          CONFIG_TABLE_NAME: configTableName,
        },
      },
    );
    configTable.grantReadData(getUserConfigLambda);

    new aws_ssm.StringParameter(this, id + 'GetUserConfigLambdaNameParam', {
      parameterName: ADMIN_LAMBDA_SSM.GET_USER_CONFIG_LAMBDA_NAME,
      stringValue: getUserConfigLambda.functionName,
    });

    const updateUserConfigLambda = new aws_lambda_nodejs.NodejsFunction(
      this,
      id + 'UpdateUserConfigLambda',
      {
        ...TC_LAMBDA_DEFAULT_PROPS,
        entry: path.join(
          LAMBDA_ENTRY_PATH,
          'admin',
          'config',
          'update-user-config.ts',
        ),
        environment: {
          ...baseEnv,
          CONFIG_TABLE_NAME: configTableName,
        },
      },
    );
    configTable.grantReadWriteData(updateUserConfigLambda);

    new aws_ssm.StringParameter(this, id + 'UpdateUserConfigLambdaNameParam', {
      parameterName: ADMIN_LAMBDA_SSM.UPDATE_USER_CONFIG_LAMBDA_NAME,
      stringValue: updateUserConfigLambda.functionName,
    });

    // ==========================================================
    // API Keys Lambdas (4)
    // ==========================================================
    const getApiKeysLambda = new aws_lambda_nodejs.NodejsFunction(
      this,
      id + 'GetApiKeysLambda',
      {
        ...TC_LAMBDA_DEFAULT_PROPS,
        entry: path.join(
          LAMBDA_ENTRY_PATH,
          'admin',
          'api-keys',
          'get-api-keys.ts',
        ),
        environment: {
          ...baseEnv,
          API_KEYS_SECRET_ARN: apiKeysSecret.secretArn,
        },
      },
    );
    apiKeysSecret.grantRead(getApiKeysLambda);

    new aws_ssm.StringParameter(this, id + 'GetApiKeysLambdaNameParam', {
      parameterName: ADMIN_LAMBDA_SSM.GET_API_KEYS_LAMBDA_NAME,
      stringValue: getApiKeysLambda.functionName,
    });

    const addApiKeyLambda = new aws_lambda_nodejs.NodejsFunction(
      this,
      id + 'AddApiKeyLambda',
      {
        ...TC_LAMBDA_DEFAULT_PROPS,
        entry: path.join(
          LAMBDA_ENTRY_PATH,
          'admin',
          'api-keys',
          'add-api-key.ts',
        ),
        environment: {
          ...baseEnv,
          API_KEYS_SECRET_ARN: apiKeysSecret.secretArn,
        },
      },
    );
    apiKeysSecret.grantRead(addApiKeyLambda);
    apiKeysSecret.grantWrite(addApiKeyLambda);

    new aws_ssm.StringParameter(this, id + 'AddApiKeyLambdaNameParam', {
      parameterName: ADMIN_LAMBDA_SSM.ADD_API_KEY_LAMBDA_NAME,
      stringValue: addApiKeyLambda.functionName,
    });

    const removeApiKeyLambda = new aws_lambda_nodejs.NodejsFunction(
      this,
      id + 'RemoveApiKeyLambda',
      {
        ...TC_LAMBDA_DEFAULT_PROPS,
        entry: path.join(
          LAMBDA_ENTRY_PATH,
          'admin',
          'api-keys',
          'remove-api-key.ts',
        ),
        environment: {
          ...baseEnv,
          API_KEYS_SECRET_ARN: apiKeysSecret.secretArn,
        },
      },
    );
    apiKeysSecret.grantRead(removeApiKeyLambda);
    apiKeysSecret.grantWrite(removeApiKeyLambda);

    new aws_ssm.StringParameter(this, id + 'RemoveApiKeyLambdaNameParam', {
      parameterName: ADMIN_LAMBDA_SSM.REMOVE_API_KEY_LAMBDA_NAME,
      stringValue: removeApiKeyLambda.functionName,
    });

    const getKeyUsageStatsLambda = new aws_lambda_nodejs.NodejsFunction(
      this,
      id + 'GetKeyUsageStatsLambda',
      {
        ...TC_LAMBDA_DEFAULT_PROPS,
        entry: path.join(
          LAMBDA_ENTRY_PATH,
          'admin',
          'api-keys',
          'get-key-usage-stats.ts',
        ),
        environment: {
          ...baseEnv,
          USAGE_TABLE_NAME: usageTableName,
        },
      },
    );
    usageTable.grantReadData(getKeyUsageStatsLambda);

    new aws_ssm.StringParameter(this, id + 'GetKeyUsageStatsLambdaNameParam', {
      parameterName: ADMIN_LAMBDA_SSM.GET_KEY_USAGE_STATS_LAMBDA_NAME,
      stringValue: getKeyUsageStatsLambda.functionName,
    });

    // ==========================================================
    // Analytics Lambdas (3)
    // ==========================================================
    const getSystemAnalyticsLambda = new aws_lambda_nodejs.NodejsFunction(
      this,
      id + 'GetSystemAnalyticsLambda',
      {
        ...TC_LAMBDA_DEFAULT_PROPS,
        entry: path.join(
          LAMBDA_ENTRY_PATH,
          'admin',
          'analytics',
          'get-system-analytics.ts',
        ),
        environment: {
          ...baseEnv,
          USAGE_TABLE_NAME: usageTableName,
        },
      },
    );
    usageTable.grantReadData(getSystemAnalyticsLambda);

    new aws_ssm.StringParameter(
      this,
      id + 'GetSystemAnalyticsLambdaNameParam',
      {
        parameterName: ADMIN_LAMBDA_SSM.GET_SYSTEM_ANALYTICS_LAMBDA_NAME,
        stringValue: getSystemAnalyticsLambda.functionName,
      },
    );

    const queryUsersUsageLambda = new aws_lambda_nodejs.NodejsFunction(
      this,
      id + 'QueryUsersUsageLambda',
      {
        ...TC_LAMBDA_DEFAULT_PROPS,
        entry: path.join(
          LAMBDA_ENTRY_PATH,
          'admin',
          'analytics',
          'query-users-usage.ts',
        ),
        environment: {
          ...baseEnv,
          USAGE_TABLE_NAME: usageTableName,
        },
      },
    );
    usageTable.grantReadData(queryUsersUsageLambda);

    new aws_ssm.StringParameter(this, id + 'QueryUsersUsageLambdaNameParam', {
      parameterName: ADMIN_LAMBDA_SSM.QUERY_USERS_USAGE_LAMBDA_NAME,
      stringValue: queryUsersUsageLambda.functionName,
    });

    const getUsageByProviderLambda = new aws_lambda_nodejs.NodejsFunction(
      this,
      id + 'GetUsageByProviderLambda',
      {
        ...TC_LAMBDA_DEFAULT_PROPS,
        entry: path.join(
          LAMBDA_ENTRY_PATH,
          'admin',
          'analytics',
          'get-usage-by-provider.ts',
        ),
        environment: {
          ...baseEnv,
          USAGE_TABLE_NAME: usageTableName,
        },
      },
    );
    usageTable.grantReadData(getUsageByProviderLambda);

    new aws_ssm.StringParameter(
      this,
      id + 'GetUsageByProviderLambdaNameParam',
      {
        parameterName: ADMIN_LAMBDA_SSM.GET_USAGE_BY_PROVIDER_LAMBDA_NAME,
        stringValue: getUsageByProviderLambda.functionName,
      },
    );

    // ==========================================================
    // Session Lambda (1) — user-facing, not admin
    // ==========================================================
    const userSessionLambda = new aws_lambda_nodejs.NodejsFunction(
      this,
      id + 'UserSessionLambda',
      {
        ...TC_LAMBDA_DEFAULT_PROPS,
        entry: path.join(LAMBDA_ENTRY_PATH, 'session', 'user-session.ts'),
        environment: {
          ...baseEnv,
          USERS_TABLE_NAME: usersTableName,
          CONFIG_TABLE_NAME: configTableName,
          LIFECYCLE_LAMBDA_NAME: lifecycleLambdaName,
          ALB_DNS_NAME: aws_ssm.StringParameter.valueForStringParameter(
            this,
            SSM.ECS.ALB_DNS_NAME,
          ),
        },
      },
    );
    usersTable.grantReadWriteData(userSessionLambda);
    configTable.grantReadData(userSessionLambda);
    lifecycleLambda.grantInvoke(userSessionLambda);

    new aws_ssm.StringParameter(this, id + 'UserSessionLambdaNameParam', {
      parameterName: ADMIN_LAMBDA_SSM.USER_SESSION_LAMBDA_NAME,
      stringValue: userSessionLambda.functionName,
    });

    // ==========================================================
    // Onboarding Lambda (1)
    // ==========================================================
    const getOnboardingStatusLambda = new aws_lambda_nodejs.NodejsFunction(
      this,
      id + 'GetOnboardingStatusLambda',
      {
        ...TC_LAMBDA_DEFAULT_PROPS,
        entry: path.join(
          LAMBDA_ENTRY_PATH,
          'admin',
          'onboarding',
          'get-onboarding-status.ts',
        ),
        environment: {
          ...baseEnv,
          TEAMS_TABLE_NAME: teamsTableName,
          CONFIG_TABLE_NAME: configTableName,
          API_KEYS_SECRET_ARN: apiKeysSecret.secretArn,
        },
      },
    );
    teamsTable.grantReadData(getOnboardingStatusLambda);
    configTable.grantReadData(getOnboardingStatusLambda);
    apiKeysSecret.grantRead(getOnboardingStatusLambda);

    new aws_ssm.StringParameter(
      this,
      id + 'GetOnboardingStatusLambdaNameParam',
      {
        parameterName: ADMIN_LAMBDA_SSM.GET_ONBOARDING_STATUS_LAMBDA_NAME,
        stringValue: getOnboardingStatusLambda.functionName,
      },
    );

    // ==========================================================
    // Skills Approval Lambdas (4)
    // ==========================================================

    // Import skills table
    const skillsTable = aws_dynamodb.TableV2.fromTableArn(
      this,
      id + 'SkillsTable',
      aws_ssm.StringParameter.valueForStringParameter(
        this,
        SSM.DYNAMODB.SKILLS_TABLE_ARN,
      ),
    );

    const skillsTableName = aws_ssm.StringParameter.valueForStringParameter(
      this,
      SSM.DYNAMODB.SKILLS_TABLE_NAME,
    );

    const requestSkillInstallLambda = new aws_lambda_nodejs.NodejsFunction(
      this,
      id + 'RequestSkillInstallLambda',
      {
        ...TC_LAMBDA_DEFAULT_PROPS,
        entry: path.join(
          LAMBDA_ENTRY_PATH,
          'admin',
          'skills',
          'request-skill-install.ts',
        ),
        environment: {
          ...baseEnv,
          SKILLS_TABLE_NAME: skillsTableName,
        },
      },
    );
    skillsTable.grantReadWriteData(requestSkillInstallLambda);

    new aws_ssm.StringParameter(
      this,
      id + 'RequestSkillInstallLambdaNameParam',
      {
        parameterName: ADMIN_LAMBDA_SSM.REQUEST_SKILL_INSTALL_LAMBDA_NAME,
        stringValue: requestSkillInstallLambda.functionName,
      },
    );

    const reviewSkillRequestLambda = new aws_lambda_nodejs.NodejsFunction(
      this,
      id + 'ReviewSkillRequestLambda',
      {
        ...TC_LAMBDA_DEFAULT_PROPS,
        entry: path.join(
          LAMBDA_ENTRY_PATH,
          'admin',
          'skills',
          'review-skill-request.ts',
        ),
        environment: {
          ...baseEnv,
          SKILLS_TABLE_NAME: skillsTableName,
        },
      },
    );
    skillsTable.grantReadWriteData(reviewSkillRequestLambda);

    new aws_ssm.StringParameter(
      this,
      id + 'ReviewSkillRequestLambdaNameParam',
      {
        parameterName: ADMIN_LAMBDA_SSM.REVIEW_SKILL_REQUEST_LAMBDA_NAME,
        stringValue: reviewSkillRequestLambda.functionName,
      },
    );

    const listPendingSkillsLambda = new aws_lambda_nodejs.NodejsFunction(
      this,
      id + 'ListPendingSkillsLambda',
      {
        ...TC_LAMBDA_DEFAULT_PROPS,
        entry: path.join(
          LAMBDA_ENTRY_PATH,
          'admin',
          'skills',
          'list-pending-skills.ts',
        ),
        environment: {
          ...baseEnv,
          SKILLS_TABLE_NAME: skillsTableName,
        },
      },
    );
    skillsTable.grantReadData(listPendingSkillsLambda);

    new aws_ssm.StringParameter(this, id + 'ListPendingSkillsLambdaNameParam', {
      parameterName: ADMIN_LAMBDA_SSM.LIST_PENDING_SKILLS_LAMBDA_NAME,
      stringValue: listPendingSkillsLambda.functionName,
    });

    const listApprovedSkillsLambda = new aws_lambda_nodejs.NodejsFunction(
      this,
      id + 'ListApprovedSkillsLambda',
      {
        ...TC_LAMBDA_DEFAULT_PROPS,
        entry: path.join(
          LAMBDA_ENTRY_PATH,
          'admin',
          'skills',
          'list-approved-skills.ts',
        ),
        environment: {
          ...baseEnv,
          SKILLS_TABLE_NAME: skillsTableName,
        },
      },
    );
    skillsTable.grantReadData(listApprovedSkillsLambda);

    new aws_ssm.StringParameter(
      this,
      id + 'ListApprovedSkillsLambdaNameParam',
      {
        parameterName: ADMIN_LAMBDA_SSM.LIST_APPROVED_SKILLS_LAMBDA_NAME,
        stringValue: listApprovedSkillsLambda.functionName,
      },
    );

    // ==========================================================
    // Integrations Lambdas (7 admin + 3 user)
    // ==========================================================

    // Import integrations table
    const integrationsTableArn =
      aws_ssm.StringParameter.valueForStringParameter(
        this,
        SSM.DYNAMODB.INTEGRATIONS_TABLE_ARN,
      );
    const integrationsTable = aws_dynamodb.TableV2.fromTableArn(
      this,
      id + 'IntegrationsTable',
      integrationsTableArn,
    );

    // GSI permission: fromTableArn doesn't know about GSIs, so grant explicitly
    const integrationsGsiPolicy = new aws_iam.PolicyStatement({
      actions: ['dynamodb:Query'],
      resources: [`${integrationsTableArn}/index/*`],
    });

    const integrationsTableName =
      aws_ssm.StringParameter.valueForStringParameter(
        this,
        SSM.DYNAMODB.INTEGRATIONS_TABLE_NAME,
      );

    const integrationsEnv = {
      ...baseEnv,
      INTEGRATIONS_TABLE_NAME: integrationsTableName,
    };

    // SecretsManager policy factory for integration credentials
    // Each Lambda needs its own PolicyStatement instance (CDK L2 constructs
    // mutate the statement when attaching it to a role).
    const makeIntegrationsSecretsPolicy = () =>
      new aws_iam.PolicyStatement({
        effect: aws_iam.Effect.ALLOW,
        actions: [
          'secretsmanager:CreateSecret',
          'secretsmanager:PutSecretValue',
          'secretsmanager:GetSecretValue',
          'secretsmanager:DeleteSecret',
        ],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:tc/integrations/${deployEnv}/*`,
        ],
      });

    // --- Admin: List Integrations ---
    const listIntegrationsLambda = new aws_lambda_nodejs.NodejsFunction(
      this,
      id + 'ListIntegrationsLambda',
      {
        ...TC_LAMBDA_DEFAULT_PROPS,
        entry: path.join(
          LAMBDA_ENTRY_PATH,
          'admin',
          'integrations',
          'list-integrations.ts',
        ),
        environment: integrationsEnv,
      },
    );
    integrationsTable.grantReadData(listIntegrationsLambda);
    listIntegrationsLambda.addToRolePolicy(integrationsGsiPolicy);

    new aws_ssm.StringParameter(this, id + 'ListIntegrationsLambdaNameParam', {
      parameterName: ADMIN_LAMBDA_SSM.LIST_INTEGRATIONS_LAMBDA_NAME,
      stringValue: listIntegrationsLambda.functionName,
    });

    // --- Admin: Get Integration ---
    const getIntegrationLambda = new aws_lambda_nodejs.NodejsFunction(
      this,
      id + 'GetIntegrationLambda',
      {
        ...TC_LAMBDA_DEFAULT_PROPS,
        entry: path.join(
          LAMBDA_ENTRY_PATH,
          'admin',
          'integrations',
          'get-integration.ts',
        ),
        environment: integrationsEnv,
      },
    );
    integrationsTable.grantReadData(getIntegrationLambda);
    getIntegrationLambda.addToRolePolicy(integrationsGsiPolicy);

    new aws_ssm.StringParameter(this, id + 'GetIntegrationLambdaNameParam', {
      parameterName: ADMIN_LAMBDA_SSM.GET_INTEGRATION_LAMBDA_NAME,
      stringValue: getIntegrationLambda.functionName,
    });

    // --- Admin: Update Integration (set global cred) ---
    const updateIntegrationLambda = new aws_lambda_nodejs.NodejsFunction(
      this,
      id + 'UpdateIntegrationLambda',
      {
        ...TC_LAMBDA_DEFAULT_PROPS,
        entry: path.join(
          LAMBDA_ENTRY_PATH,
          'admin',
          'integrations',
          'update-integration.ts',
        ),
        environment: integrationsEnv,
      },
    );
    integrationsTable.grantReadWriteData(updateIntegrationLambda);
    updateIntegrationLambda.addToRolePolicy(makeIntegrationsSecretsPolicy());

    new aws_ssm.StringParameter(this, id + 'UpdateIntegrationLambdaNameParam', {
      parameterName: ADMIN_LAMBDA_SSM.UPDATE_INTEGRATION_LAMBDA_NAME,
      stringValue: updateIntegrationLambda.functionName,
    });

    // --- Admin: Delete Integration Credential ---
    const deleteIntegrationCredLambda = new aws_lambda_nodejs.NodejsFunction(
      this,
      id + 'DeleteIntegrationCredLambda',
      {
        ...TC_LAMBDA_DEFAULT_PROPS,
        entry: path.join(
          LAMBDA_ENTRY_PATH,
          'admin',
          'integrations',
          'delete-integration-cred.ts',
        ),
        environment: integrationsEnv,
      },
    );
    integrationsTable.grantReadWriteData(deleteIntegrationCredLambda);
    deleteIntegrationCredLambda.addToRolePolicy(
      makeIntegrationsSecretsPolicy(),
    );

    new aws_ssm.StringParameter(
      this,
      id + 'DeleteIntegrationCredLambdaNameParam',
      {
        parameterName: ADMIN_LAMBDA_SSM.DELETE_INTEGRATION_CRED_LAMBDA_NAME,
        stringValue: deleteIntegrationCredLambda.functionName,
      },
    );

    // --- Admin: List Team Overrides ---
    const listTeamOverridesLambda = new aws_lambda_nodejs.NodejsFunction(
      this,
      id + 'ListTeamOverridesLambda',
      {
        ...TC_LAMBDA_DEFAULT_PROPS,
        entry: path.join(
          LAMBDA_ENTRY_PATH,
          'admin',
          'integrations',
          'list-team-overrides.ts',
        ),
        environment: integrationsEnv,
      },
    );
    integrationsTable.grantReadData(listTeamOverridesLambda);

    new aws_ssm.StringParameter(this, id + 'ListTeamOverridesLambdaNameParam', {
      parameterName: ADMIN_LAMBDA_SSM.LIST_TEAM_OVERRIDES_LAMBDA_NAME,
      stringValue: listTeamOverridesLambda.functionName,
    });

    // --- Admin: Update Team Override ---
    const updateTeamOverrideLambda = new aws_lambda_nodejs.NodejsFunction(
      this,
      id + 'UpdateTeamOverrideLambda',
      {
        ...TC_LAMBDA_DEFAULT_PROPS,
        entry: path.join(
          LAMBDA_ENTRY_PATH,
          'admin',
          'integrations',
          'update-team-override.ts',
        ),
        environment: integrationsEnv,
      },
    );
    integrationsTable.grantReadWriteData(updateTeamOverrideLambda);
    updateTeamOverrideLambda.addToRolePolicy(makeIntegrationsSecretsPolicy());

    new aws_ssm.StringParameter(
      this,
      id + 'UpdateTeamOverrideLambdaNameParam',
      {
        parameterName: ADMIN_LAMBDA_SSM.UPDATE_TEAM_OVERRIDE_LAMBDA_NAME,
        stringValue: updateTeamOverrideLambda.functionName,
      },
    );

    // --- Admin: Delete Team Credential ---
    const deleteTeamCredLambda = new aws_lambda_nodejs.NodejsFunction(
      this,
      id + 'DeleteTeamCredLambda',
      {
        ...TC_LAMBDA_DEFAULT_PROPS,
        entry: path.join(
          LAMBDA_ENTRY_PATH,
          'admin',
          'integrations',
          'delete-team-cred.ts',
        ),
        environment: integrationsEnv,
      },
    );
    integrationsTable.grantReadWriteData(deleteTeamCredLambda);
    deleteTeamCredLambda.addToRolePolicy(makeIntegrationsSecretsPolicy());

    new aws_ssm.StringParameter(this, id + 'DeleteTeamCredLambdaNameParam', {
      parameterName: ADMIN_LAMBDA_SSM.DELETE_TEAM_CRED_LAMBDA_NAME,
      stringValue: deleteTeamCredLambda.functionName,
    });

    // --- User: List User Integrations ---
    const listUserIntegrationsLambda = new aws_lambda_nodejs.NodejsFunction(
      this,
      id + 'ListUserIntegrationsLambda',
      {
        ...TC_LAMBDA_DEFAULT_PROPS,
        entry: path.join(
          LAMBDA_ENTRY_PATH,
          'user',
          'integrations',
          'list-user-integrations.ts',
        ),
        environment: {
          ...integrationsEnv,
          USERS_TABLE_NAME: usersTableName,
        },
      },
    );
    integrationsTable.grantReadData(listUserIntegrationsLambda);
    listUserIntegrationsLambda.addToRolePolicy(integrationsGsiPolicy);
    usersTable.grantReadData(listUserIntegrationsLambda);

    new aws_ssm.StringParameter(
      this,
      id + 'ListUserIntegrationsLambdaNameParam',
      {
        parameterName: ADMIN_LAMBDA_SSM.LIST_USER_INTEGRATIONS_LAMBDA_NAME,
        stringValue: listUserIntegrationsLambda.functionName,
      },
    );

    // --- User: Connect Integration ---
    const connectIntegrationLambda = new aws_lambda_nodejs.NodejsFunction(
      this,
      id + 'ConnectIntegrationLambda',
      {
        ...TC_LAMBDA_DEFAULT_PROPS,
        entry: path.join(
          LAMBDA_ENTRY_PATH,
          'user',
          'integrations',
          'connect-integration.ts',
        ),
        environment: {
          ...integrationsEnv,
          USERS_TABLE_NAME: usersTableName,
        },
      },
    );
    integrationsTable.grantReadWriteData(connectIntegrationLambda);
    connectIntegrationLambda.addToRolePolicy(integrationsGsiPolicy);
    usersTable.grantReadData(connectIntegrationLambda);
    connectIntegrationLambda.addToRolePolicy(makeIntegrationsSecretsPolicy());

    new aws_ssm.StringParameter(
      this,
      id + 'ConnectIntegrationLambdaNameParam',
      {
        parameterName: ADMIN_LAMBDA_SSM.CONNECT_INTEGRATION_LAMBDA_NAME,
        stringValue: connectIntegrationLambda.functionName,
      },
    );

    // --- User: Disconnect Integration ---
    const disconnectIntegrationLambda = new aws_lambda_nodejs.NodejsFunction(
      this,
      id + 'DisconnectIntegrationLambda',
      {
        ...TC_LAMBDA_DEFAULT_PROPS,
        entry: path.join(
          LAMBDA_ENTRY_PATH,
          'user',
          'integrations',
          'disconnect-integration.ts',
        ),
        environment: integrationsEnv,
      },
    );
    integrationsTable.grantReadWriteData(disconnectIntegrationLambda);
    disconnectIntegrationLambda.addToRolePolicy(
      makeIntegrationsSecretsPolicy(),
    );

    new aws_ssm.StringParameter(
      this,
      id + 'DisconnectIntegrationLambdaNameParam',
      {
        parameterName: ADMIN_LAMBDA_SSM.DISCONNECT_INTEGRATION_LAMBDA_NAME,
        stringValue: disconnectIntegrationLambda.functionName,
      },
    );
  }
}
