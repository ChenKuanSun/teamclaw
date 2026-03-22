import { ENVIRONMENT } from '@TeamClaw/core/cloud-config';
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
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

  test('creates 44 HttpApi routes', () => {
    // 1 dashboard + 4 users + 5 teams + 5 containers + 6 config + 4 api-keys + 3 analytics + 1 session + 1 onboarding + 4 skills + 10 integrations = 44
    const routes = template.findResources('AWS::ApiGatewayV2::Route');
    expect(Object.keys(routes)).toHaveLength(44);
  });

  test('all routes have JWT authorization', () => {
    const routes = template.findResources('AWS::ApiGatewayV2::Route');
    for (const [, route] of Object.entries(routes)) {
      expect((route as any).Properties.AuthorizationType).toBe('JWT');
    }
  });

  test('creates JWT authorizer', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Authorizer', {
      AuthorizerType: 'JWT',
    });
  });

  test('routes cover all HTTP methods', () => {
    const routes = template.findResources('AWS::ApiGatewayV2::Route');
    const routeKeys = Object.values(routes).map(
      (r: any) => r.Properties.RouteKey,
    );

    expect(routeKeys.some((k: string) => k.startsWith('GET '))).toBe(true);
    expect(routeKeys.some((k: string) => k.startsWith('POST '))).toBe(true);
    expect(routeKeys.some((k: string) => k.startsWith('PUT '))).toBe(true);
    expect(routeKeys.some((k: string) => k.startsWith('DELETE '))).toBe(true);
  });

  test('routes cover all admin paths', () => {
    const routes = template.findResources('AWS::ApiGatewayV2::Route');
    const routeKeys = Object.values(routes).map(
      (r: any) => r.Properties.RouteKey as string,
    );

    const expectedPaths = [
      '/admin/dashboard/stats',
      '/admin/users',
      '/admin/users/{userId}',
      '/admin/teams',
      '/admin/teams/{teamId}',
      '/admin/containers',
      '/admin/containers/{userId}',
      '/admin/config/global',
      '/admin/config/teams/{teamId}',
      '/admin/config/users/{userId}',
      '/admin/api-keys',
      '/admin/api-keys/{keyId}',
      '/admin/api-keys/usage-stats',
      '/admin/analytics/system',
      '/admin/analytics/users-usage',
      '/admin/analytics/usage-by-provider',
      '/user/session',
      '/admin/onboarding/status',
      '/admin/skills/request',
      '/admin/skills/review',
      '/admin/skills/pending',
      '/admin/skills/approved',
      // Integrations (Admin)
      '/admin/integrations',
      '/admin/integrations/{integrationId}',
      '/admin/integrations/{integrationId}/teams',
      '/admin/integrations/{integrationId}/teams/{teamId}',
      // Integrations (User)
      '/user/integrations',
      '/user/integrations/{integrationId}/connect',
      '/user/integrations/{integrationId}/disconnect',
    ];

    for (const path of expectedPaths) {
      expect(routeKeys.some((k: string) => k.includes(path))).toBe(true);
    }
  });

  test('each route has a Lambda integration', () => {
    const integrations = template.findResources(
      'AWS::ApiGatewayV2::Integration',
    );
    // Each of the 44 routes gets its own integration
    expect(Object.keys(integrations).length).toBe(44);
  });
});
