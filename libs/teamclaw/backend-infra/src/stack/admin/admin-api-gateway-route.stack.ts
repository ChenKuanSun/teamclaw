/**
 * Admin API Gateway Route Stack
 *
 * Defines all admin routes for the HttpApi (V2).
 * Uses JWT authorizer with Admin Cognito User Pool — matching Affiora pattern.
 */

import {
  StackPropsWithEnv,
  TC_SSM_PARAMETER,
} from '@TeamClaw/core/cloud-config';
import {
  Stack,
  aws_apigatewayv2,
  aws_cognito,
  aws_lambda,
  aws_ssm,
} from 'aws-cdk-lib';
import {
  HttpLambdaIntegration,
} from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import {
  HttpUserPoolAuthorizer,
} from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpMethod, HttpRoute, HttpRouteKey } from 'aws-cdk-lib/aws-apigatewayv2';
import { Construct } from 'constructs';

export class AdminApiGatewayRouteStack extends Stack {
  constructor(scope: Construct, id: string, props: StackPropsWithEnv) {
    super(scope, id, props);
    const { deployEnv } = props;

    const SSM = TC_SSM_PARAMETER[deployEnv];
    const ADMIN_LAMBDA_SSM = SSM.ADMIN_API.LAMBDA;

    // Get Admin Cognito User Pool for JWT authorizer
    const adminUserPool = aws_cognito.UserPool.fromUserPoolId(
      this,
      id + 'AdminUserPool',
      aws_ssm.StringParameter.valueForStringParameter(
        this,
        SSM.ADMIN_COGNITO.USER_POOL_ID,
      ),
    );

    const adminUserPoolClientId = aws_ssm.StringParameter.valueForStringParameter(
      this,
      SSM.ADMIN_COGNITO.USER_POOL_CLIENT_ID,
    );

    // Get Chat Cognito User Pool for session endpoint JWT authorizer
    const chatUserPool = aws_cognito.UserPool.fromUserPoolId(
      this,
      id + 'ChatUserPool',
      aws_ssm.StringParameter.valueForStringParameter(
        this,
        SSM.COGNITO.USER_POOL_ID,
      ),
    );

    const chatUserPoolClientId = aws_ssm.StringParameter.valueForStringParameter(
      this,
      SSM.COGNITO.USER_POOL_CLIENT_ID,
    );

    const chatAuthorizer = new HttpUserPoolAuthorizer(
      'ChatJwtAuthorizer',
      chatUserPool,
      {
        userPoolClients: [
          aws_cognito.UserPoolClient.fromUserPoolClientId(
            this,
            id + 'ChatUserPoolClient',
            chatUserPoolClientId,
          ),
        ],
      },
    );

    // JWT Authorizer using Admin Cognito User Pool (Affiora pattern)
    const adminAuthorizer = new HttpUserPoolAuthorizer(
      'AdminJwtAuthorizer',
      adminUserPool,
      {
        userPoolClients: [
          aws_cognito.UserPoolClient.fromUserPoolClientId(
            this,
            id + 'AdminUserPoolClient',
            adminUserPoolClientId,
          ),
        ],
      },
    );

    // Get Admin HttpApi from SSM
    const adminHttpApi = aws_apigatewayv2.HttpApi.fromHttpApiAttributes(
      this,
      id + 'AdminHttpApi',
      {
        httpApiId: aws_ssm.StringParameter.valueForStringParameter(
          this,
          SSM.ADMIN_API.HTTP_API_ID,
        ),
      },
    );

    // Helper to get Lambda from SSM
    const getLambda = (name: string, ssmPath: string) =>
      aws_lambda.Function.fromFunctionName(
        this,
        id + name,
        aws_ssm.StringParameter.valueForStringParameter(this, ssmPath),
      );

    // Helper to add a route with JWT authorization
    const addRoute = (
      routeName: string,
      method: HttpMethod,
      path: string,
      lambda: aws_lambda.IFunction,
    ) => {
      new HttpRoute(this, id + routeName, {
        httpApi: adminHttpApi as aws_apigatewayv2.IHttpApi,
        integration: new HttpLambdaIntegration(id + routeName + 'Integration', lambda),
        routeKey: HttpRouteKey.with(path, method),
        authorizer: adminAuthorizer,
      });
    };

    // ==========================================================
    // DASHBOARD ROUTES: /admin/dashboard/stats
    // ==========================================================
    addRoute(
      'GetDashboardStats',
      HttpMethod.GET,
      '/admin/dashboard/stats',
      getLambda('GetDashboardStatsLambda', ADMIN_LAMBDA_SSM.GET_DASHBOARD_STATS_LAMBDA_NAME),
    );

    // ==========================================================
    // USER ROUTES: /admin/users, /admin/users/{userId}
    // ==========================================================
    addRoute(
      'QueryUsers',
      HttpMethod.GET,
      '/admin/users',
      getLambda('QueryUsersLambda', ADMIN_LAMBDA_SSM.QUERY_USERS_LAMBDA_NAME),
    );

    addRoute(
      'GetUser',
      HttpMethod.GET,
      '/admin/users/{userId}',
      getLambda('GetUserLambda', ADMIN_LAMBDA_SSM.GET_USER_LAMBDA_NAME),
    );

    addRoute(
      'UpdateUser',
      HttpMethod.PUT,
      '/admin/users/{userId}',
      getLambda('UpdateUserLambda', ADMIN_LAMBDA_SSM.UPDATE_USER_LAMBDA_NAME),
    );

    addRoute(
      'DeleteUser',
      HttpMethod.DELETE,
      '/admin/users/{userId}',
      getLambda('DeleteUserLambda', ADMIN_LAMBDA_SSM.DELETE_USER_LAMBDA_NAME),
    );

    // ==========================================================
    // TEAM ROUTES: /admin/teams, /admin/teams/{teamId}
    // ==========================================================
    addRoute(
      'QueryTeams',
      HttpMethod.GET,
      '/admin/teams',
      getLambda('QueryTeamsLambda', ADMIN_LAMBDA_SSM.QUERY_TEAMS_LAMBDA_NAME),
    );

    addRoute(
      'CreateTeam',
      HttpMethod.POST,
      '/admin/teams',
      getLambda('CreateTeamLambda', ADMIN_LAMBDA_SSM.CREATE_TEAM_LAMBDA_NAME),
    );

    addRoute(
      'GetTeam',
      HttpMethod.GET,
      '/admin/teams/{teamId}',
      getLambda('GetTeamLambda', ADMIN_LAMBDA_SSM.GET_TEAM_LAMBDA_NAME),
    );

    addRoute(
      'UpdateTeam',
      HttpMethod.PUT,
      '/admin/teams/{teamId}',
      getLambda('UpdateTeamLambda', ADMIN_LAMBDA_SSM.UPDATE_TEAM_LAMBDA_NAME),
    );

    addRoute(
      'DeleteTeam',
      HttpMethod.DELETE,
      '/admin/teams/{teamId}',
      getLambda('DeleteTeamLambda', ADMIN_LAMBDA_SSM.DELETE_TEAM_LAMBDA_NAME),
    );

    // ==========================================================
    // CONTAINER ROUTES: /admin/containers, /admin/containers/{userId}
    // ==========================================================
    addRoute(
      'QueryContainers',
      HttpMethod.GET,
      '/admin/containers',
      getLambda('QueryContainersLambda', ADMIN_LAMBDA_SSM.QUERY_CONTAINERS_LAMBDA_NAME),
    );

    addRoute(
      'GetContainer',
      HttpMethod.GET,
      '/admin/containers/{userId}',
      getLambda('GetContainerLambda', ADMIN_LAMBDA_SSM.GET_CONTAINER_LAMBDA_NAME),
    );

    addRoute(
      'StartContainer',
      HttpMethod.POST,
      '/admin/containers/{userId}/start',
      getLambda('StartContainerLambda', ADMIN_LAMBDA_SSM.START_CONTAINER_LAMBDA_NAME),
    );

    addRoute(
      'StopContainer',
      HttpMethod.POST,
      '/admin/containers/{userId}/stop',
      getLambda('StopContainerLambda', ADMIN_LAMBDA_SSM.STOP_CONTAINER_LAMBDA_NAME),
    );

    addRoute(
      'ProvisionContainer',
      HttpMethod.POST,
      '/admin/containers/{userId}/provision',
      getLambda('ProvisionContainerLambda', ADMIN_LAMBDA_SSM.PROVISION_CONTAINER_LAMBDA_NAME),
    );

    // ==========================================================
    // CONFIG ROUTES: /admin/config/global, /admin/config/teams/{teamId},
    //                /admin/config/users/{userId}
    // ==========================================================
    addRoute(
      'GetGlobalConfig',
      HttpMethod.GET,
      '/admin/config/global',
      getLambda('GetGlobalConfigLambda', ADMIN_LAMBDA_SSM.GET_GLOBAL_CONFIG_LAMBDA_NAME),
    );

    addRoute(
      'UpdateGlobalConfig',
      HttpMethod.PUT,
      '/admin/config/global',
      getLambda('UpdateGlobalConfigLambda', ADMIN_LAMBDA_SSM.UPDATE_GLOBAL_CONFIG_LAMBDA_NAME),
    );

    addRoute(
      'GetTeamConfig',
      HttpMethod.GET,
      '/admin/config/teams/{teamId}',
      getLambda('GetTeamConfigLambda', ADMIN_LAMBDA_SSM.GET_TEAM_CONFIG_LAMBDA_NAME),
    );

    addRoute(
      'UpdateTeamConfig',
      HttpMethod.PUT,
      '/admin/config/teams/{teamId}',
      getLambda('UpdateTeamConfigLambda', ADMIN_LAMBDA_SSM.UPDATE_TEAM_CONFIG_LAMBDA_NAME),
    );

    addRoute(
      'GetUserConfig',
      HttpMethod.GET,
      '/admin/config/users/{userId}',
      getLambda('GetUserConfigLambda', ADMIN_LAMBDA_SSM.GET_USER_CONFIG_LAMBDA_NAME),
    );

    addRoute(
      'UpdateUserConfig',
      HttpMethod.PUT,
      '/admin/config/users/{userId}',
      getLambda('UpdateUserConfigLambda', ADMIN_LAMBDA_SSM.UPDATE_USER_CONFIG_LAMBDA_NAME),
    );

    // ==========================================================
    // API KEY ROUTES: /admin/api-keys, /admin/api-keys/{keyId},
    //                 /admin/api-keys/usage-stats
    // ==========================================================
    addRoute(
      'GetApiKeys',
      HttpMethod.GET,
      '/admin/api-keys',
      getLambda('GetApiKeysLambda', ADMIN_LAMBDA_SSM.GET_API_KEYS_LAMBDA_NAME),
    );

    addRoute(
      'AddApiKey',
      HttpMethod.POST,
      '/admin/api-keys',
      getLambda('AddApiKeyLambda', ADMIN_LAMBDA_SSM.ADD_API_KEY_LAMBDA_NAME),
    );

    addRoute(
      'RemoveApiKey',
      HttpMethod.DELETE,
      '/admin/api-keys/{keyId}',
      getLambda('RemoveApiKeyLambda', ADMIN_LAMBDA_SSM.REMOVE_API_KEY_LAMBDA_NAME),
    );

    addRoute(
      'GetKeyUsageStats',
      HttpMethod.GET,
      '/admin/api-keys/usage-stats',
      getLambda('GetKeyUsageStatsLambda', ADMIN_LAMBDA_SSM.GET_KEY_USAGE_STATS_LAMBDA_NAME),
    );

    // ==========================================================
    // ANALYTICS ROUTES: /admin/analytics/system,
    //                    /admin/analytics/users-usage,
    //                    /admin/analytics/usage-by-provider
    // ==========================================================
    addRoute(
      'GetSystemAnalytics',
      HttpMethod.GET,
      '/admin/analytics/system',
      getLambda('GetSystemAnalyticsLambda', ADMIN_LAMBDA_SSM.GET_SYSTEM_ANALYTICS_LAMBDA_NAME),
    );

    addRoute(
      'QueryUsersUsage',
      HttpMethod.GET,
      '/admin/analytics/users-usage',
      getLambda('QueryUsersUsageLambda', ADMIN_LAMBDA_SSM.QUERY_USERS_USAGE_LAMBDA_NAME),
    );

    addRoute(
      'GetUsageByProvider',
      HttpMethod.GET,
      '/admin/analytics/usage-by-provider',
      getLambda('GetUsageByProviderLambda', ADMIN_LAMBDA_SSM.GET_USAGE_BY_PROVIDER_LAMBDA_NAME),
    );

    // ==========================================================
    // SESSION ROUTES: /user/session (uses Chat Cognito, not Admin)
    // ==========================================================
    const userSessionLambda = getLambda(
      'UserSessionLambda',
      ADMIN_LAMBDA_SSM.USER_SESSION_LAMBDA_NAME,
    );

    new HttpRoute(this, id + 'UserSession', {
      httpApi: adminHttpApi as aws_apigatewayv2.IHttpApi,
      integration: new HttpLambdaIntegration(
        id + 'UserSessionIntegration',
        userSessionLambda,
      ),
      routeKey: HttpRouteKey.with('/user/session', HttpMethod.POST),
      authorizer: chatAuthorizer,
    });

    // ==========================================================
    // ONBOARDING ROUTES
    // ==========================================================
    addRoute(
      'GetOnboardingStatus',
      HttpMethod.GET,
      '/admin/onboarding/status',
      getLambda('GetOnboardingStatusLambda', ADMIN_LAMBDA_SSM.GET_ONBOARDING_STATUS_LAMBDA_NAME),
    );
  }
}
