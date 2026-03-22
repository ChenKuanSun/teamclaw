jest.mock('@TeamClaw/teamclaw/cloud-function', () => {
  const actual = jest.requireActual('@TeamClaw/teamclaw/cloud-function');
  return {
    ...actual,
    adminLambdaHandlerDecorator: (_method: string, fn: any) => {
      return async (event: any) => {
        try {
          const input = {
            raw: event,
            queryStringParameters: event.queryStringParameters,
            pathParameters: event.pathParameters,
            body: event.body ? JSON.parse(event.body) : undefined,
          };
          const result = await fn(input);
          return {
            statusCode: result.status,
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify(result.body),
          };
        } catch (error: any) {
          return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify({
              message: error.message || 'Internal server error',
            }),
          };
        }
      };
    },
    validateRequiredEnvVars: jest.fn(),
  };
});

const mockSetTeamOverride = jest.fn();

jest.mock('./integrations-core', () => ({
  setTeamOverride: (...args: any[]) => mockSetTeamOverride(...args),
}));

process.env['INTEGRATIONS_TABLE_NAME'] = 'IntegrationsTable';
process.env['DEPLOY_ENV'] = 'prod';

import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  Context,
} from 'aws-lambda';
import { handler } from './update-team-override';

const makeEvent = (
  overrides: Partial<APIGatewayProxyEventV2WithJWTAuthorizer> = {},
): APIGatewayProxyEventV2WithJWTAuthorizer =>
  ({
    version: '2.0',
    routeKey: 'PUT /admin/integrations/{integrationId}/teams/{teamId}',
    rawPath: '/admin/integrations/slack/teams/team-1',
    rawQueryString: '',
    headers: {},
    requestContext: {
      http: {
        method: 'PUT',
        path: '/admin/integrations/slack/teams/team-1',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test',
      },
      accountId: '123456789012',
      apiId: 'test',
      domainName: 'test',
      domainPrefix: 'test',
      requestId: 'test',
      routeKey: 'PUT /admin/integrations/{integrationId}/teams/{teamId}',
      stage: '$default',
      time: '01/Jan/2026:00:00:00 +0000',
      timeEpoch: 0,
      authorizer: { jwt: { claims: { sub: 'admin-user' }, scopes: [] } },
    },
    pathParameters: { integrationId: 'slack', teamId: 'team-1' },
    queryStringParameters: null,
    body: JSON.stringify({
      enabled: true,
      credentials: { botToken: 'xoxb-test' },
      allowUserOverride: false,
    }),
    isBase64Encoded: false,
    ...overrides,
  }) as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;

const invoke = async (event = makeEvent()) =>
  (await (handler as any)(event, {} as Context)) as {
    statusCode: number;
    headers: any;
    body: string;
  };

describe('update-team-override handler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return 400 when admin identity is missing', async () => {
    const res = await invoke(
      makeEvent({
        requestContext: {
          http: {
            method: 'PUT',
            path: '/admin/integrations/slack/teams/team-1',
            protocol: 'HTTP/1.1',
            sourceIp: '127.0.0.1',
            userAgent: 'test',
          },
          accountId: '123456789012',
          apiId: 'test',
          domainName: 'test',
          domainPrefix: 'test',
          requestId: 'test',
          routeKey: 'PUT /admin/integrations/{integrationId}/teams/{teamId}',
          stage: '$default',
          time: '01/Jan/2026:00:00:00 +0000',
          timeEpoch: 0,
          authorizer: { jwt: { claims: {}, scopes: [] } },
        } as any,
      }),
    );
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain('Missing admin identity');
  });

  it('should return 400 when integrationId is missing', async () => {
    const res = await invoke(
      makeEvent({ pathParameters: { teamId: 'team-1' } as any }),
    );
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain(
      'integrationId and teamId path parameters are required',
    );
  });

  it('should return 400 when teamId is missing', async () => {
    const res = await invoke(
      makeEvent({ pathParameters: { integrationId: 'slack' } as any }),
    );
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain(
      'integrationId and teamId path parameters are required',
    );
  });

  it('should return 400 when both path params are missing', async () => {
    const res = await invoke(makeEvent({ pathParameters: undefined }));
    expect(res.statusCode).toBe(400);
  });

  it('should return 200 on success', async () => {
    mockSetTeamOverride.mockResolvedValueOnce(undefined);

    const res = await invoke();
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.message).toContain('Team override updated');
    expect(body.integrationId).toBe('slack');
    expect(body.teamId).toBe('team-1');
    expect(mockSetTeamOverride).toHaveBeenCalledWith(
      'slack',
      'team-1',
      {
        enabled: true,
        credentials: { botToken: 'xoxb-test' },
        allowUserOverride: false,
      },
      'admin-user',
    );
  });

  it('should pass undefined fields when body has partial data', async () => {
    mockSetTeamOverride.mockResolvedValueOnce(undefined);

    const res = await invoke(
      makeEvent({ body: JSON.stringify({ enabled: true }) }),
    );
    expect(res.statusCode).toBe(200);
    expect(mockSetTeamOverride).toHaveBeenCalledWith(
      'slack',
      'team-1',
      { enabled: true, credentials: undefined, allowUserOverride: undefined },
      'admin-user',
    );
  });

  it('should return 500 when setTeamOverride throws', async () => {
    mockSetTeamOverride.mockRejectedValueOnce(new Error('Invalid teamId'));

    const res = await invoke();
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).message).toBe('Invalid teamId');
  });
});
