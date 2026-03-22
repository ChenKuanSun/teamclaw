/**
 * Admin API Gateway Stack
 *
 * Creates an HttpApi (V2) for admin panel — matching Affiora pattern.
 * Simple CORS, no WAF.
 */

import {
  StackPropsWithEnv,
  TC_SSM_PARAMETER,
  getTCAdminApiCorsOrigins,
} from '@TeamClaw/core/cloud-config';
import {
  Duration,
  Stack,
  aws_apigateway,
  aws_apigatewayv2,
  aws_iam,
  aws_ssm,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class AdminApiGatewayStack extends Stack {
  public readonly adminHttpApi: aws_apigatewayv2.HttpApi;

  constructor(scope: Construct, id: string, props: StackPropsWithEnv) {
    super(scope, id, {
      ...props,
      description: 'TeamClaw Admin: HTTP API Gateway',
    });
    const { deployEnv } = props;

    // CloudWatch Role for API Gateway logging (Affiora pattern)
    const apiGatewayCloudWatchRole = new aws_iam.Role(
      this,
      id + 'ApiGatewayCloudWatchRole',
      {
        assumedBy: new aws_iam.ServicePrincipal('apigateway.amazonaws.com'),
        managedPolicies: [
          aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
            'service-role/AmazonAPIGatewayPushToCloudWatchLogs',
          ),
        ],
      },
    );

    new aws_apigateway.CfnAccount(this, id + 'ApiGatewayAccount', {
      cloudWatchRoleArn: apiGatewayCloudWatchRole.roleArn,
    });

    // Create Admin HttpApi (V2) — matching Affiora pattern
    this.adminHttpApi = new aws_apigatewayv2.HttpApi(
      this,
      id + 'AdminHttpApi',
      {
        apiName: `teamclaw-admin-api-${deployEnv}`,
        corsPreflight: {
          allowHeaders: [
            'Content-Type',
            'X-Amz-Date',
            'Authorization',
            'X-Api-Key',
          ],
          allowMethods: [
            aws_apigatewayv2.CorsHttpMethod.OPTIONS,
            aws_apigatewayv2.CorsHttpMethod.GET,
            aws_apigatewayv2.CorsHttpMethod.POST,
            aws_apigatewayv2.CorsHttpMethod.PUT,
            aws_apigatewayv2.CorsHttpMethod.DELETE,
          ],
          allowCredentials: false,
          allowOrigins: getTCAdminApiCorsOrigins(deployEnv),
          maxAge: Duration.hours(1),
        },
      },
    );

    // ==========================================================
    // SSM Parameters
    // ==========================================================
    new aws_ssm.StringParameter(this, id + 'AdminHttpApiId', {
      parameterName: TC_SSM_PARAMETER[deployEnv].ADMIN_API.HTTP_API_ID,
      stringValue: this.adminHttpApi.httpApiId,
    });

    new aws_ssm.StringParameter(this, id + 'AdminHttpApiEndpoint', {
      parameterName: TC_SSM_PARAMETER[deployEnv].ADMIN_API.HTTP_API_ENDPOINT,
      stringValue: this.adminHttpApi.apiEndpoint,
    });
  }
}
