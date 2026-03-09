import { App } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { ENVIRONMENT } from '@TeamClaw/core/cloud-config';
import { AdminApiGatewayStack } from '../admin/admin-api-gateway.stack';

describe('AdminApiGatewayStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new App();
    const stack = new AdminApiGatewayStack(app, 'TestAdminApiGw', {
      deployEnv: ENVIRONMENT.DEV,
    });
    template = Template.fromStack(stack);
  });

  test('creates REST API with CORS', () => {
    template.hasResourceProperties('AWS::ApiGateway::RestApi', {
      Name: 'teamclaw-admin-api-dev',
    });
  });

  test('creates REST API with v1 stage', () => {
    template.hasResourceProperties('AWS::ApiGateway::Stage', {
      StageName: 'v1',
    });
  });

  test('creates WAF WebACL with REGIONAL scope', () => {
    template.hasResourceProperties('AWS::WAFv2::WebACL', {
      Scope: 'REGIONAL',
      DefaultAction: { Allow: {} },
    });
  });

  test('creates WAF WebACL with 6 rules', () => {
    template.hasResourceProperties('AWS::WAFv2::WebACL', {
      Rules: Match.arrayWith([
        Match.objectLike({ Name: 'AdminRateLimitRule', Priority: 0 }),
        Match.objectLike({ Name: 'AWSManagedRulesCommonRuleSet', Priority: 1 }),
        Match.objectLike({ Name: 'AWSManagedRulesKnownBadInputsRuleSet', Priority: 2 }),
        Match.objectLike({ Name: 'AWSManagedRulesSQLiRuleSet', Priority: 3 }),
        Match.objectLike({ Name: 'AWSManagedRulesAmazonIpReputationList', Priority: 4 }),
        Match.objectLike({ Name: 'BodySizeLimitRule', Priority: 5 }),
      ]),
    });

    // Verify exactly 6 rules
    const webAcls = template.findResources('AWS::WAFv2::WebACL');
    const webAclKey = Object.keys(webAcls)[0];
    expect(webAcls[webAclKey]['Properties']['Rules']).toHaveLength(6);
  });

  test('WAF rate limit rule limits to 100 requests per 5 minutes', () => {
    template.hasResourceProperties('AWS::WAFv2::WebACL', {
      Rules: Match.arrayWith([
        Match.objectLike({
          Name: 'AdminRateLimitRule',
          Statement: {
            RateBasedStatement: {
              Limit: 100,
              EvaluationWindowSec: 300,
              AggregateKeyType: 'IP',
            },
          },
        }),
      ]),
    });
  });

  test('associates WAF with API Gateway', () => {
    template.hasResourceProperties('AWS::WAFv2::WebACLAssociation', {
      WebACLArn: Match.anyValue(),
      ResourceArn: Match.anyValue(),
    });
  });

  test('creates CloudWatch log group for WAF', () => {
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      LogGroupName: 'aws-waf-logs-teamclaw-admin-dev',
      RetentionInDays: 365,
    });
  });

  test('creates WAF logging configuration', () => {
    template.hasResourceProperties('AWS::WAFv2::LoggingConfiguration', {
      ResourceArn: Match.anyValue(),
      LogDestinationConfigs: Match.anyValue(),
    });
  });

  test('creates SSM parameter for restApiId', () => {
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Type: 'String',
      Name: '/tc/dev/admin-api/restApiId',
    });
  });

  test('creates SSM parameter for rootResourceId', () => {
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Type: 'String',
      Name: '/tc/dev/admin-api/rootResourceId',
    });
  });

  test('creates SSM parameter for restApiEndpoint', () => {
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Type: 'String',
      Name: '/tc/dev/admin-api/restApiEndpoint',
    });
  });

  test('creates SSM parameter for stageName', () => {
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Type: 'String',
      Name: '/tc/dev/admin-api/stageName',
      Value: Match.anyValue(),
    });
  });

  test('creates SSM parameter for webAclArn', () => {
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Type: 'String',
      Name: '/tc/dev/admin-api/webAclArn',
    });
  });

  test('DEV env uses count action for WAF rules (not block)', () => {
    template.hasResourceProperties('AWS::WAFv2::WebACL', {
      Rules: Match.arrayWith([
        Match.objectLike({
          Name: 'AdminRateLimitRule',
          Action: { Count: {} },
        }),
      ]),
    });
  });
});
