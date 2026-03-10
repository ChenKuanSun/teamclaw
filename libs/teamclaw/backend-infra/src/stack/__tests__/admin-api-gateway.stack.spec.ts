import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
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

  test('creates HttpApi (V2) with correct name', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      Name: 'teamclaw-admin-api-dev',
      ProtocolType: 'HTTP',
    });
  });

  test('creates HttpApi with CORS configuration', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      CorsConfiguration: {
        AllowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key'],
        AllowMethods: ['OPTIONS', 'GET', 'POST', 'PUT', 'DELETE'],
        AllowCredentials: false,
      },
    });
  });

  test('creates CloudWatch role for API Gateway', () => {
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [
          {
            Effect: 'Allow',
            Principal: { Service: 'apigateway.amazonaws.com' },
            Action: 'sts:AssumeRole',
          },
        ],
      },
    });
  });

  test('creates SSM parameter for httpApiId', () => {
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Type: 'String',
      Name: '/tc/dev/admin-api/httpApiId',
    });
  });

  test('creates SSM parameter for httpApiEndpoint', () => {
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Type: 'String',
      Name: '/tc/dev/admin-api/httpApiEndpoint',
    });
  });

  test('does NOT create WAF resources', () => {
    const webAcls = template.findResources('AWS::WAFv2::WebACL');
    expect(Object.keys(webAcls)).toHaveLength(0);
  });

  test('does NOT create REST API resources', () => {
    const restApis = template.findResources('AWS::ApiGateway::RestApi');
    expect(Object.keys(restApis)).toHaveLength(0);
  });
});
