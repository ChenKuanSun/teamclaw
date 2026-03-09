import { App } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { ENVIRONMENT } from '@TeamClaw/core/cloud-config';
import { AdminApiGatewayRouteStack } from '../admin/admin-api-gateway-route.stack';

describe('AdminApiGatewayRouteStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new App();
    const stack = new AdminApiGatewayRouteStack(app, 'TestAdminRoutes', {
      deployEnv: ENVIRONMENT.DEV,
    });
    template = Template.fromStack(stack);
  });

  test('creates Cognito authorizer', () => {
    template.hasResourceProperties('AWS::ApiGateway::Authorizer', {
      Type: 'COGNITO_USER_POOLS',
      Name: 'admin-route-authorizer-dev',
      IdentitySource: 'method.request.header.Authorization',
    });
  });

  test('creates 28 API route methods (excluding OPTIONS)', () => {
    // 1 dashboard + 4 users + 5 teams + 5 containers + 6 config + 4 api-keys + 3 analytics = 28
    const methods = template.findResources('AWS::ApiGateway::Method');
    const nonOptionsMethods = Object.entries(methods).filter(
      ([, method]) => (method as any).Properties.HttpMethod !== 'OPTIONS',
    );
    expect(nonOptionsMethods).toHaveLength(28);
  });

  test('all non-OPTIONS routes use Cognito authorization', () => {
    const methods = template.findResources('AWS::ApiGateway::Method');
    const nonOptionsMethods = Object.entries(methods).filter(
      ([, method]) => (method as any).Properties.HttpMethod !== 'OPTIONS',
    );

    for (const [, method] of nonOptionsMethods) {
      expect((method as any).Properties.AuthorizationType).toBe(
        'COGNITO_USER_POOLS',
      );
    }
  });

  test('all routes have CORS OPTIONS method', () => {
    const methods = template.findResources('AWS::ApiGateway::Method');
    const optionsMethods = Object.entries(methods).filter(
      ([, method]) => (method as any).Properties.HttpMethod === 'OPTIONS',
    );
    // Each resource with addCorsPreflight gets an OPTIONS method
    // Resources: admin, dashboard, stats, users, {userId}, teams, {teamId},
    // containers, {userId}, start, stop, provision,
    // config, global, teams, {teamId}, users, {userId},
    // api-keys, {keyId}, usage-stats,
    // analytics, system, users-usage, usage-by-provider
    expect(optionsMethods.length).toBeGreaterThanOrEqual(20);
  });

  test('routes use correct HTTP methods', () => {
    const methods = template.findResources('AWS::ApiGateway::Method');
    const httpMethods = Object.values(methods).map(
      (m: any) => m.Properties.HttpMethod,
    );

    // Verify we have GET, POST, PUT, DELETE methods
    expect(httpMethods).toContain('GET');
    expect(httpMethods).toContain('POST');
    expect(httpMethods).toContain('PUT');
    expect(httpMethods).toContain('DELETE');
    expect(httpMethods).toContain('OPTIONS');
  });

  test('creates API resources for all route paths', () => {
    const resources = template.findResources('AWS::ApiGateway::Resource');
    const pathParts = Object.values(resources).map(
      (r: any) => r.Properties.PathPart,
    );

    // Verify key path parts exist
    expect(pathParts).toContain('admin');
    expect(pathParts).toContain('dashboard');
    expect(pathParts).toContain('stats');
    expect(pathParts).toContain('users');
    expect(pathParts).toContain('teams');
    expect(pathParts).toContain('containers');
    expect(pathParts).toContain('config');
    expect(pathParts).toContain('api-keys');
    expect(pathParts).toContain('analytics');
    expect(pathParts).toContain('global');
    expect(pathParts).toContain('start');
    expect(pathParts).toContain('stop');
    expect(pathParts).toContain('provision');
    expect(pathParts).toContain('usage-stats');
    expect(pathParts).toContain('system');
    expect(pathParts).toContain('users-usage');
    expect(pathParts).toContain('usage-by-provider');
  });

  test('OPTIONS methods have NONE authorization', () => {
    const methods = template.findResources('AWS::ApiGateway::Method');
    const optionsMethods = Object.entries(methods).filter(
      ([, method]) => (method as any).Properties.HttpMethod === 'OPTIONS',
    );

    for (const [, method] of optionsMethods) {
      expect((method as any).Properties.AuthorizationType).toBe('NONE');
    }
  });
});
