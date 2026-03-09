/**
 * Admin API Gateway Stack
 *
 * Creates an independent REST API Gateway for admin panel.
 * Uses Cognito authorizer with WAF protection (SOC 2 CC6.6).
 */

import {
  ENVIRONMENT,
  StackPropsWithEnv,
  TC_ADMIN_APP_DOMAIN_NAME,
  TC_SSM_PARAMETER,
} from '@TeamClaw/core/cloud-config';
import {
  RemovalPolicy,
  Stack,
  aws_apigateway,
  aws_iam,
  aws_logs,
  aws_ssm,
  aws_wafv2,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class AdminApiGatewayStack extends Stack {
  public readonly adminRestApi: aws_apigateway.RestApi;

  constructor(scope: Construct, id: string, props: StackPropsWithEnv) {
    super(scope, id, props);
    const { deployEnv } = props;

    // CloudWatch Role for API Gateway logging
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

    // Create Admin REST API
    this.adminRestApi = new aws_apigateway.RestApi(
      this,
      id + 'AdminRestApi',
      {
        restApiName: `teamclaw-admin-api-${deployEnv}`,
        deployOptions: {
          stageName: 'v1',
          loggingLevel: aws_apigateway.MethodLoggingLevel.INFO,
          dataTraceEnabled: deployEnv !== ENVIRONMENT.PROD,
          metricsEnabled: true,
        },
        defaultCorsPreflightOptions: {
          allowHeaders: [
            'Content-Type',
            'X-Amz-Date',
            'Authorization',
            'X-Api-Key',
          ],
          allowMethods: aws_apigateway.Cors.ALL_METHODS,
          allowCredentials: false,
          allowOrigins: corsOrigins,
        },
      },
    );

    // ==========================================================
    // WAF WebACL for Admin REST API (SOC 2 CC6.6)
    // Stricter rate limiting than main API (100 req/5min vs 2000)
    // ==========================================================
    const ruleAction =
      deployEnv === ENVIRONMENT.PROD ? { block: {} } : { count: {} };
    const overrideAction =
      deployEnv === ENVIRONMENT.PROD ? { none: {} } : { count: {} };

    const adminWebAcl = new aws_wafv2.CfnWebACL(this, id + 'AdminWebACL', {
      scope: 'REGIONAL',
      defaultAction: { allow: {} },
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: `teamclaw-admin-${deployEnv}-waf`,
      },
      rules: [
        // Stricter rate limiting for admin - 100 requests per 5 minutes
        {
          name: 'AdminRateLimitRule',
          priority: 0,
          action: ruleAction,
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: `teamclaw-admin-${deployEnv}-rate-limit`,
          },
          statement: {
            rateBasedStatement: {
              limit: 100,
              evaluationWindowSec: 300,
              aggregateKeyType: 'IP',
            },
          },
        },
        // AWS Managed Rules - Common Rule Set (OWASP Top 10)
        {
          name: 'AWSManagedRulesCommonRuleSet',
          priority: 1,
          overrideAction,
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: `teamclaw-admin-${deployEnv}-common-rules`,
          },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet',
            },
          },
        },
        // AWS Managed Rules - Known Bad Inputs
        {
          name: 'AWSManagedRulesKnownBadInputsRuleSet',
          priority: 2,
          overrideAction,
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: `teamclaw-admin-${deployEnv}-bad-inputs`,
          },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesKnownBadInputsRuleSet',
            },
          },
        },
        // AWS Managed Rules - SQL Injection
        {
          name: 'AWSManagedRulesSQLiRuleSet',
          priority: 3,
          overrideAction,
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: `teamclaw-admin-${deployEnv}-sqli`,
          },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesSQLiRuleSet',
            },
          },
        },
        // AWS Managed Rules - IP Reputation (block known malicious IPs)
        {
          name: 'AWSManagedRulesAmazonIpReputationList',
          priority: 4,
          overrideAction,
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: `teamclaw-admin-${deployEnv}-ip-reputation`,
          },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesAmazonIpReputationList',
            },
          },
        },
        // Body size limit - prevent large payload attacks (8KB limit)
        {
          name: 'BodySizeLimitRule',
          priority: 5,
          action: ruleAction,
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: `teamclaw-admin-${deployEnv}-body-size`,
          },
          statement: {
            sizeConstraintStatement: {
              fieldToMatch: { body: { oversizeHandling: 'MATCH' } },
              comparisonOperator: 'GT',
              size: 8192, // 8KB
              textTransformations: [{ priority: 0, type: 'NONE' }],
            },
          },
        },
      ],
    });

    // ==========================================================
    // WAF Logging for SOC 2 CC7.2 - Security Event Monitoring
    // Log group name MUST start with 'aws-waf-logs-' (AWS requirement)
    // ==========================================================
    const wafLogGroup = new aws_logs.LogGroup(this, id + 'WafLogGroup', {
      logGroupName: `aws-waf-logs-teamclaw-admin-${deployEnv}`,
      retention: aws_logs.RetentionDays.ONE_YEAR, // SOC 2 requires 1 year retention
      removalPolicy:
        deployEnv === ENVIRONMENT.PROD
          ? RemovalPolicy.RETAIN
          : RemovalPolicy.DESTROY,
    });

    new aws_wafv2.CfnLoggingConfiguration(this, id + 'WafLoggingConfig', {
      resourceArn: adminWebAcl.attrArn,
      logDestinationConfigs: [wafLogGroup.logGroupArn],
      loggingFilter: {
        DefaultBehavior: 'KEEP',
        Filters: [
          {
            Behavior: 'KEEP',
            Conditions: [{ ActionCondition: { Action: 'BLOCK' } }],
            Requirement: 'MEETS_ANY',
          },
          {
            Behavior: 'KEEP',
            Conditions: [{ ActionCondition: { Action: 'COUNT' } }],
            Requirement: 'MEETS_ANY',
          },
        ],
      },
    });

    // Associate WebACL with REST API stage
    const webAclAssociation = new aws_wafv2.CfnWebACLAssociation(
      this,
      id + 'WebACLAssociation',
      {
        resourceArn: this.adminRestApi.deploymentStage.stageArn,
        webAclArn: adminWebAcl.attrArn,
      },
    );
    webAclAssociation.node.addDependency(this.adminRestApi);

    // ==========================================================
    // SSM Parameters
    // ==========================================================
    new aws_ssm.StringParameter(this, id + 'AdminRestApiId', {
      parameterName:
        TC_SSM_PARAMETER[deployEnv].ADMIN_API.REST_API_ID,
      stringValue: this.adminRestApi.restApiId,
    });

    new aws_ssm.StringParameter(this, id + 'AdminRootResourceId', {
      parameterName:
        TC_SSM_PARAMETER[deployEnv].ADMIN_API.ROOT_RESOURCE_ID,
      stringValue: this.adminRestApi.restApiRootResourceId,
    });

    new aws_ssm.StringParameter(this, id + 'AdminRestApiEndpoint', {
      parameterName:
        TC_SSM_PARAMETER[deployEnv].ADMIN_API.REST_API_ENDPOINT,
      stringValue: this.adminRestApi.url,
    });

    new aws_ssm.StringParameter(this, id + 'AdminRestApiStageName', {
      parameterName:
        TC_SSM_PARAMETER[deployEnv].ADMIN_API.STAGE_NAME,
      stringValue: this.adminRestApi.deploymentStage.stageName,
    });

    new aws_ssm.StringParameter(this, id + 'AdminWebAclArn', {
      parameterName:
        TC_SSM_PARAMETER[deployEnv].ADMIN_API.WEB_ACL_ARN,
      stringValue: adminWebAcl.attrArn,
    });
  }
}
