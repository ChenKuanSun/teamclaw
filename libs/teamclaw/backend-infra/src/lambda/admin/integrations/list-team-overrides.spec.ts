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

const mockListTeamOverrides = jest.fn();

jest.mock('./integrations-core', () => ({
  listTeamOverrides: (...args: any[]) => mockListTeamOverrides(...args),
}));

process.env['INTEGRATIONS_TABLE_NAME'] = 'IntegrationsTable';
process.env['DEPLOY_ENV'] = 'prod';

import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  Context,
} from 'aws-lambda';
import { handler } from './list-team-overrides';

const makeEvent = (
  overrides: Partial<APIGatewayProxyEventV2WithJWTAuthorizer> = {},
): APIGatewayProxyEventV2WithJWTAuthorizer =>
  ({
    version: '2.0',
    routeKey: 'GET /admin/integrations/{integrationId}/teams',
    rawPath: '/admin/integrations/slack/teams',
    rawQueryString: '',
    headers: {},
    requestContext: {
      http: {
        method: 'GET',
        path: '/admin/integrations/slack/teams',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test',
      },
      accountId: '123456789012',
      apiId: 'test',
      domainName: 'test',
      domainPrefix: 'test',
      requestId: 'test',
      routeKey: 'GET /admin/integrations/{integrationId}/teams',
      stage: '$default',
      time: '01/Jan/2026:00:00:00 +0000',
      timeEpoch: 0,
      authorizer: { jwt: { claims: { sub: 'admin-user' }, scopes: [] } },
    },
    pathParameters: { integrationId: 'slack' },
    queryStringParameters: null,
    body: null,
    isBase64Encoded: false,
    ...overrides,
  }) as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;

const invoke = async (event = makeEvent()) =>
  (await (handler as any)(event, {} as Context)) as {
    statusCode: number;
    headers: any;
    body: string;
  };

describe('list-team-overrides handler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return 400 when integrationId is missing', async () => {
    const res = await invoke(makeEvent({ pathParameters: undefined }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain(
      'integrationId path parameter is required',
    );
  });

  it('should return 200 with team overrides', async () => {
    const mockData = [
      { teamId: 'team-1', enabled: true, hasCredentials: true },
      { teamId: 'team-2', enabled: false, hasCredentials: false },
    ];
    mockListTeamOverrides.mockResolvedValueOnce(mockData);

    const res = await invoke();
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.overrides).toEqual(mockData);
    expect(mockListTeamOverrides).toHaveBeenCalledWith('slack');
  });

  it('should return 500 when listTeamOverrides throws', async () => {
    mockListTeamOverrides.mockRejectedValueOnce(new Error('DDB failure'));

    const res = await invoke();
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).message).toBe('DDB failure');
  });
});
