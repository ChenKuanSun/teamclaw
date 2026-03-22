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

const mockDdbSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({ send: mockDdbSend })),
  GetItemCommand: jest.fn((input: any) => ({ input })),
}));

const mockListUserIntegrations = jest.fn();

jest.mock('../../admin/integrations/integrations-core', () => ({
  listUserIntegrations: (...args: any[]) => mockListUserIntegrations(...args),
}));

process.env['INTEGRATIONS_TABLE_NAME'] = 'IntegrationsTable';
process.env['DEPLOY_ENV'] = 'prod';
process.env['USERS_TABLE_NAME'] = 'UsersTable';

import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  Context,
} from 'aws-lambda';
import { handler } from './list-user-integrations';

const makeEvent = (
  overrides: Partial<APIGatewayProxyEventV2WithJWTAuthorizer> = {},
): APIGatewayProxyEventV2WithJWTAuthorizer =>
  ({
    version: '2.0',
    routeKey: 'GET /user/integrations',
    rawPath: '/user/integrations',
    rawQueryString: '',
    headers: {},
    requestContext: {
      http: {
        method: 'GET',
        path: '/user/integrations',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test',
      },
      accountId: '123456789012',
      apiId: 'test',
      domainName: 'test',
      domainPrefix: 'test',
      requestId: 'test',
      routeKey: 'GET /user/integrations',
      stage: '$default',
      time: '01/Jan/2026:00:00:00 +0000',
      timeEpoch: 0,
      authorizer: { jwt: { claims: { sub: 'user-1' }, scopes: [] } },
    },
    pathParameters: null,
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

describe('list-user-integrations handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDdbSend.mockResolvedValue({
      Item: { userId: { S: 'user-1' }, teamId: { S: 'team-1' } },
    });
  });

  it('should return 400 when sub is missing', async () => {
    const res = await invoke(
      makeEvent({
        requestContext: {
          http: {
            method: 'GET',
            path: '/user/integrations',
            protocol: 'HTTP/1.1',
            sourceIp: '127.0.0.1',
            userAgent: 'test',
          },
          accountId: '123456789012',
          apiId: 'test',
          domainName: 'test',
          domainPrefix: 'test',
          requestId: 'test',
          routeKey: 'GET /user/integrations',
          stage: '$default',
          time: '01/Jan/2026:00:00:00 +0000',
          timeEpoch: 0,
          authorizer: { jwt: { claims: {}, scopes: [] } },
        } as any,
      }),
    );
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain('Missing sub');
  });

  it('should return 200 with integrations list', async () => {
    const mockData = [
      {
        integrationId: 'github',
        globalEnabled: true,
        hasUserCredentials: true,
      },
      {
        integrationId: 'slack',
        globalEnabled: false,
        hasUserCredentials: false,
      },
    ];
    mockListUserIntegrations.mockResolvedValueOnce(mockData);

    const res = await invoke();
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.integrations).toEqual(mockData);
    expect(mockListUserIntegrations).toHaveBeenCalledWith('user-1', 'team-1');
  });

  it('should pass undefined teamId when user has no team', async () => {
    mockDdbSend.mockResolvedValueOnce({ Item: { userId: { S: 'user-1' } } });
    mockListUserIntegrations.mockResolvedValueOnce([]);

    await invoke();
    expect(mockListUserIntegrations).toHaveBeenCalledWith('user-1', undefined);
  });

  it('should return 500 when listUserIntegrations throws', async () => {
    mockListUserIntegrations.mockRejectedValueOnce(new Error('DDB failure'));

    const res = await invoke();
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).message).toBe('DDB failure');
  });
});
