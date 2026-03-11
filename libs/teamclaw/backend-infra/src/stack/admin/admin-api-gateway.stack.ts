/**
 * Admin API Gateway Stack
 *
 * Creates an HttpApi (V2) for admin panel — matching Affiora pattern.
 * Simple CORS, no WAF.
 */

import {
  ENVIRONMENT,
  StackPropsWithEnv,
  TC_ADMIN_APP_DOMAIN_NAME,
  TC_SSM_PARAMETER,
} from '@TeamClaw/core/cloud-config';
import {
  Duration,
  Stack,
  aws_apigatewayv2,
  aws_iam,
  aws_apigateway,
  aws_ssm,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class AdminApiGatewayStack extends Stack {
  public readonly adminHttpApi: aws_apigatewayv2.HttpApi;

  constructor(scope: Construct, id: string, props: StackPropsWithEnv) {
    super(scope, id, props);
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

    // CORS origins for admin panel
    const corsOrigins =
      deployEnv === ENVIRONMENT.PROD
        ? [`https://${TC_ADMIN_APP_DOMAIN_NAME[deployEnv]}`]
        : [
            `https://${TC_ADMIN_APP_DOMAIN_NAME[deployEnv]}`,
            'http://localhost:4900',
          ];

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
          allowOrigins: corsOrigins,
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
