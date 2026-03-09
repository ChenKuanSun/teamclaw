/**
 * Admin API Gateway Route Stack
 *
 * Defines all admin routes for the admin REST API.
 * All routes are authorized (require admin access).
 */

import {
  ENVIRONMENT,
  StackPropsWithEnv,
  TC_ADMIN_APP_DOMAIN_NAME,
  TC_SSM_PARAMETER,
} from '@TeamClaw/core/cloud-config';
import {
  Stack,
  aws_apigateway,
  aws_cognito,
  aws_lambda,
  aws_ssm,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class AdminApiGatewayRouteStack extends Stack {
  constructor(scope: Construct, id: string, props: StackPropsWithEnv) {
    super(scope, id, props);
    const { deployEnv } = props;

    const SSM = TC_SSM_PARAMETER[deployEnv];
    const ADMIN_LAMBDA_SSM = SSM.ADMIN_API.LAMBDA;

    // Get Admin Cognito User Pool for authorizer
    const adminUserPool = aws_cognito.UserPool.fromUserPoolId(
      this,
      id + 'AdminUserPool',
      aws_ssm.StringParameter.valueForStringParameter(
        this,
        SSM.ADMIN_COGNITO.USER_POOL_ID,
      ),
    );

    // Create Cognito Authorizer for REST API using Admin User Pool
    const adminAuthorizer = new aws_apigateway.CognitoUserPoolsAuthorizer(
      this,
      id + 'AdminCognitoAuthorizer',
      {
        cognitoUserPools: [adminUserPool],
        authorizerName: `admin-route-authorizer-${deployEnv}`,
        identitySource: 'method.request.header.Authorization',
      },
    );

    // Get Admin REST API from SSM
    const adminRestApi = aws_apigateway.RestApi.fromRestApiAttributes(
      this,
      id + 'AdminRestApi',
      {
        restApiId: aws_ssm.StringParameter.valueForStringParameter(
          this,
          SSM.ADMIN_API.REST_API_ID,
        ),
        rootResourceId: aws_ssm.StringParameter.valueForStringParameter(
          this,
          SSM.ADMIN_API.ROOT_RESOURCE_ID,
        ),
      },
    );

    // CORS configuration - must be added explicitly when using fromRestApiAttributes
    const corsOrigins =
      deployEnv === ENVIRONMENT.PROD
        ? [`https://${TC_ADMIN_APP_DOMAIN_NAME[deployEnv]}`]
        : [
            `https://${TC_ADMIN_APP_DOMAIN_NAME[deployEnv]}`,
            'http://localhost:4900',
          ];

    const corsOptions: aws_apigateway.CorsOptions = {
      allowHeaders: [
        'Content-Type',
        'X-Amz-Date',
        'Authorization',
        'X-Api-Key',
      ],
      allowMethods: aws_apigateway.Cors.ALL_METHODS,
      allowCredentials: false,
      allowOrigins: corsOrigins,
    };

    // Create /admin resource under root
    const adminResource = adminRestApi.root.addResource('admin');
    // Add CORS preflight to /admin and all child resources
    adminResource.addCorsPreflight(corsOptions);

    // Helper to get Lambda from SSM
    const getLambda = (name: string, ssmPath: string) =>
      aws_lambda.Function.fromFunctionName(
        this,
        id + name,
        aws_ssm.StringParameter.valueForStringParameter(this, ssmPath),
      );

    // Common method options with authorization
    const authMethodOptions: aws_apigateway.MethodOptions = {
      authorizer: adminAuthorizer,
      authorizationType: aws_apigateway.AuthorizationType.COGNITO,
    };

    // Helper to add resource with CORS preflight
    const addResourceWithCors = (
      parent: aws_apigateway.IResource,
      pathPart: string,
    ): aws_apigateway.Resource => {
      const resource = parent.addResource(pathPart);
      resource.addCorsPreflight(corsOptions);
      return resource;
    };

    // ==========================================================
    // DASHBOARD ROUTES: /admin/dashboard/stats
    // ==========================================================
    const dashboardResource = addResourceWithCors(adminResource, 'dashboard');
    const dashboardStatsResource = addResourceWithCors(
      dashboardResource,
      'stats',
    );

    const getDashboardStatsLambda = getLambda(
      'GetDashboardStatsLambda',
      ADMIN_LAMBDA_SSM.GET_DASHBOARD_STATS_LAMBDA_NAME,
    );
    dashboardStatsResource.addMethod(
      'GET',
      new aws_apigateway.LambdaIntegration(getDashboardStatsLambda),
      authMethodOptions,
    );

    // ==========================================================
    // USER ROUTES: /admin/users, /admin/users/{userId}
    // ==========================================================
    const usersResource = addResourceWithCors(adminResource, 'users');
    const userIdResource = addResourceWithCors(usersResource, '{userId}');

    const queryUsersLambda = getLambda(
      'QueryUsersLambda',
      ADMIN_LAMBDA_SSM.QUERY_USERS_LAMBDA_NAME,
    );
    usersResource.addMethod(
      'GET',
      new aws_apigateway.LambdaIntegration(queryUsersLambda),
      authMethodOptions,
    );

    const getUserLambda = getLambda(
      'GetUserLambda',
      ADMIN_LAMBDA_SSM.GET_USER_LAMBDA_NAME,
    );
    userIdResource.addMethod(
      'GET',
      new aws_apigateway.LambdaIntegration(getUserLambda),
      authMethodOptions,
    );

    const updateUserLambda = getLambda(
      'UpdateUserLambda',
      ADMIN_LAMBDA_SSM.UPDATE_USER_LAMBDA_NAME,
    );
    userIdResource.addMethod(
      'PUT',
      new aws_apigateway.LambdaIntegration(updateUserLambda),
      authMethodOptions,
    );

    const deleteUserLambda = getLambda(
      'DeleteUserLambda',
      ADMIN_LAMBDA_SSM.DELETE_USER_LAMBDA_NAME,
    );
    userIdResource.addMethod(
      'DELETE',
      new aws_apigateway.LambdaIntegration(deleteUserLambda),
      authMethodOptions,
    );

    // ==========================================================
    // TEAM ROUTES: /admin/teams, /admin/teams/{teamId}
    // ==========================================================
    const teamsResource = addResourceWithCors(adminResource, 'teams');
    const teamIdResource = addResourceWithCors(teamsResource, '{teamId}');

    const queryTeamsLambda = getLambda(
      'QueryTeamsLambda',
      ADMIN_LAMBDA_SSM.QUERY_TEAMS_LAMBDA_NAME,
    );
    teamsResource.addMethod(
      'GET',
      new aws_apigateway.LambdaIntegration(queryTeamsLambda),
      authMethodOptions,
    );

    const createTeamLambda = getLambda(
      'CreateTeamLambda',
      ADMIN_LAMBDA_SSM.CREATE_TEAM_LAMBDA_NAME,
    );
    teamsResource.addMethod(
      'POST',
      new aws_apigateway.LambdaIntegration(createTeamLambda),
      authMethodOptions,
    );

    const getTeamLambda = getLambda(
      'GetTeamLambda',
      ADMIN_LAMBDA_SSM.GET_TEAM_LAMBDA_NAME,
    );
    teamIdResource.addMethod(
      'GET',
      new aws_apigateway.LambdaIntegration(getTeamLambda),
      authMethodOptions,
    );

    const updateTeamLambda = getLambda(
      'UpdateTeamLambda',
      ADMIN_LAMBDA_SSM.UPDATE_TEAM_LAMBDA_NAME,
    );
    teamIdResource.addMethod(
      'PUT',
      new aws_apigateway.LambdaIntegration(updateTeamLambda),
      authMethodOptions,
    );

    const deleteTeamLambda = getLambda(
      'DeleteTeamLambda',
      ADMIN_LAMBDA_SSM.DELETE_TEAM_LAMBDA_NAME,
    );
    teamIdResource.addMethod(
      'DELETE',
      new aws_apigateway.LambdaIntegration(deleteTeamLambda),
      authMethodOptions,
    );

    // ==========================================================
    // CONTAINER ROUTES: /admin/containers, /admin/containers/{userId}
    // ==========================================================
    const containersResource = addResourceWithCors(adminResource, 'containers');
    const containerUserIdResource = addResourceWithCors(
      containersResource,
      '{userId}',
    );

    const queryContainersLambda = getLambda(
      'QueryContainersLambda',
      ADMIN_LAMBDA_SSM.QUERY_CONTAINERS_LAMBDA_NAME,
    );
    containersResource.addMethod(
      'GET',
      new aws_apigateway.LambdaIntegration(queryContainersLambda),
      authMethodOptions,
    );

    const getContainerLambda = getLambda(
      'GetContainerLambda',
      ADMIN_LAMBDA_SSM.GET_CONTAINER_LAMBDA_NAME,
    );
    containerUserIdResource.addMethod(
      'GET',
      new aws_apigateway.LambdaIntegration(getContainerLambda),
      authMethodOptions,
    );

    // Container actions: start, stop, provision
    const containerStartResource = addResourceWithCors(
      containerUserIdResource,
      'start',
    );
    const startContainerLambda = getLambda(
      'StartContainerLambda',
      ADMIN_LAMBDA_SSM.START_CONTAINER_LAMBDA_NAME,
    );
    containerStartResource.addMethod(
      'POST',
      new aws_apigateway.LambdaIntegration(startContainerLambda),
      authMethodOptions,
    );

    const containerStopResource = addResourceWithCors(
      containerUserIdResource,
      'stop',
    );
    const stopContainerLambda = getLambda(
      'StopContainerLambda',
      ADMIN_LAMBDA_SSM.STOP_CONTAINER_LAMBDA_NAME,
    );
    containerStopResource.addMethod(
      'POST',
      new aws_apigateway.LambdaIntegration(stopContainerLambda),
      authMethodOptions,
    );

    const containerProvisionResource = addResourceWithCors(
      containerUserIdResource,
      'provision',
    );
    const provisionContainerLambda = getLambda(
      'ProvisionContainerLambda',
      ADMIN_LAMBDA_SSM.PROVISION_CONTAINER_LAMBDA_NAME,
    );
    containerProvisionResource.addMethod(
      'POST',
      new aws_apigateway.LambdaIntegration(provisionContainerLambda),
      authMethodOptions,
    );

    // ==========================================================
    // CONFIG ROUTES: /admin/config/global, /admin/config/teams/{teamId},
    //                /admin/config/users/{userId}
    // ==========================================================
    const configResource = addResourceWithCors(adminResource, 'config');

    // Global config
    const configGlobalResource = addResourceWithCors(configResource, 'global');

    const getGlobalConfigLambda = getLambda(
      'GetGlobalConfigLambda',
      ADMIN_LAMBDA_SSM.GET_GLOBAL_CONFIG_LAMBDA_NAME,
    );
    configGlobalResource.addMethod(
      'GET',
      new aws_apigateway.LambdaIntegration(getGlobalConfigLambda),
      authMethodOptions,
    );

    const updateGlobalConfigLambda = getLambda(
      'UpdateGlobalConfigLambda',
      ADMIN_LAMBDA_SSM.UPDATE_GLOBAL_CONFIG_LAMBDA_NAME,
    );
    configGlobalResource.addMethod(
      'PUT',
      new aws_apigateway.LambdaIntegration(updateGlobalConfigLambda),
      authMethodOptions,
    );

    // Team config
    const configTeamsResource = addResourceWithCors(configResource, 'teams');
    const configTeamIdResource = addResourceWithCors(
      configTeamsResource,
      '{teamId}',
    );

    const getTeamConfigLambda = getLambda(
      'GetTeamConfigLambda',
      ADMIN_LAMBDA_SSM.GET_TEAM_CONFIG_LAMBDA_NAME,
    );
    configTeamIdResource.addMethod(
      'GET',
      new aws_apigateway.LambdaIntegration(getTeamConfigLambda),
      authMethodOptions,
    );

    const updateTeamConfigLambda = getLambda(
      'UpdateTeamConfigLambda',
      ADMIN_LAMBDA_SSM.UPDATE_TEAM_CONFIG_LAMBDA_NAME,
    );
    configTeamIdResource.addMethod(
      'PUT',
      new aws_apigateway.LambdaIntegration(updateTeamConfigLambda),
      authMethodOptions,
    );

    // User config
    const configUsersResource = addResourceWithCors(configResource, 'users');
    const configUserIdResource = addResourceWithCors(
      configUsersResource,
      '{userId}',
    );

    const getUserConfigLambda = getLambda(
      'GetUserConfigLambda',
      ADMIN_LAMBDA_SSM.GET_USER_CONFIG_LAMBDA_NAME,
    );
    configUserIdResource.addMethod(
      'GET',
      new aws_apigateway.LambdaIntegration(getUserConfigLambda),
      authMethodOptions,
    );

    const updateUserConfigLambda = getLambda(
      'UpdateUserConfigLambda',
      ADMIN_LAMBDA_SSM.UPDATE_USER_CONFIG_LAMBDA_NAME,
    );
    configUserIdResource.addMethod(
      'PUT',
      new aws_apigateway.LambdaIntegration(updateUserConfigLambda),
      authMethodOptions,
    );

    // ==========================================================
    // API KEY ROUTES: /admin/api-keys, /admin/api-keys/{keyId},
    //                 /admin/api-keys/usage-stats
    // ==========================================================
    const apiKeysResource = addResourceWithCors(adminResource, 'api-keys');
    const apiKeyIdResource = addResourceWithCors(apiKeysResource, '{keyId}');

    const getApiKeysLambda = getLambda(
      'GetApiKeysLambda',
      ADMIN_LAMBDA_SSM.GET_API_KEYS_LAMBDA_NAME,
    );
    apiKeysResource.addMethod(
      'GET',
      new aws_apigateway.LambdaIntegration(getApiKeysLambda),
      authMethodOptions,
    );

    const addApiKeyLambda = getLambda(
      'AddApiKeyLambda',
      ADMIN_LAMBDA_SSM.ADD_API_KEY_LAMBDA_NAME,
    );
    apiKeysResource.addMethod(
      'POST',
      new aws_apigateway.LambdaIntegration(addApiKeyLambda),
      authMethodOptions,
    );

    const removeApiKeyLambda = getLambda(
      'RemoveApiKeyLambda',
      ADMIN_LAMBDA_SSM.REMOVE_API_KEY_LAMBDA_NAME,
    );
    apiKeyIdResource.addMethod(
      'DELETE',
      new aws_apigateway.LambdaIntegration(removeApiKeyLambda),
      authMethodOptions,
    );

    const apiKeyUsageStatsResource = addResourceWithCors(
      apiKeysResource,
      'usage-stats',
    );
    const getKeyUsageStatsLambda = getLambda(
      'GetKeyUsageStatsLambda',
      ADMIN_LAMBDA_SSM.GET_KEY_USAGE_STATS_LAMBDA_NAME,
    );
    apiKeyUsageStatsResource.addMethod(
      'GET',
      new aws_apigateway.LambdaIntegration(getKeyUsageStatsLambda),
      authMethodOptions,
    );

    // ==========================================================
    // ANALYTICS ROUTES: /admin/analytics/system,
    //                    /admin/analytics/users-usage,
    //                    /admin/analytics/usage-by-provider
    // ==========================================================
    const analyticsResource = addResourceWithCors(adminResource, 'analytics');

    const systemAnalyticsResource = addResourceWithCors(
      analyticsResource,
      'system',
    );
    const getSystemAnalyticsLambda = getLambda(
      'GetSystemAnalyticsLambda',
      ADMIN_LAMBDA_SSM.GET_SYSTEM_ANALYTICS_LAMBDA_NAME,
    );
    systemAnalyticsResource.addMethod(
      'GET',
      new aws_apigateway.LambdaIntegration(getSystemAnalyticsLambda),
      authMethodOptions,
    );

    const usersUsageResource = addResourceWithCors(
      analyticsResource,
      'users-usage',
    );
    const queryUsersUsageLambda = getLambda(
      'QueryUsersUsageLambda',
      ADMIN_LAMBDA_SSM.QUERY_USERS_USAGE_LAMBDA_NAME,
    );
    usersUsageResource.addMethod(
      'GET',
      new aws_apigateway.LambdaIntegration(queryUsersUsageLambda),
      authMethodOptions,
    );

    const usageByProviderResource = addResourceWithCors(
      analyticsResource,
      'usage-by-provider',
    );
    const getUsageByProviderLambda = getLambda(
      'GetUsageByProviderLambda',
      ADMIN_LAMBDA_SSM.GET_USAGE_BY_PROVIDER_LAMBDA_NAME,
    );
    usageByProviderResource.addMethod(
      'GET',
      new aws_apigateway.LambdaIntegration(getUsageByProviderLambda),
      authMethodOptions,
    );
  }
}
