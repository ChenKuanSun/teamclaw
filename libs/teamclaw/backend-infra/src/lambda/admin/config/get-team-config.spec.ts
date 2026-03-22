jest.mock('@TeamClaw/teamclaw/cloud-function', () => {
  const actual = jest.requireActual('@TeamClaw/teamclaw/cloud-function');
  return {
    ...actual,
    adminLambdaHandlerDecorator: (method: string, fn: any) => {
      return async (event: any, context: any) => {
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
            body: JSON.stringify({ message: error.message || 'Internal server error' }),
          };
        }
      };
    },
    validateRequiredEnvVars: jest.fn(),
  };
});

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({ send: mockSend })),
  QueryCommand: jest.fn((input: any) => ({ input })),
}));

process.env['CONFIG_TABLE_NAME'] = 'ConfigTable';

import { handler } from './get-team-config';
import type { APIGatewayProxyEventV2WithJWTAuthorizer, Context } from 'aws-lambda';

const makeEvent = (overrides: Partial<APIGatewayProxyEventV2WithJWTAuthorizer> = {}): APIGatewayProxyEventV2WithJWTAuthorizer =>
  ({
    version: '2.0',
    routeKey: 'GET /admin/config/team/{teamId}',
    rawPath: '/admin/config/team/t1',
    rawQueryString: '',
    headers: {},
    requestContext: {
      http: { method: 'GET', path: '/admin/config/team/t1', protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'test' },
      accountId: '123456789012',
      apiId: 'test',
      domainName: 'test',
      domainPrefix: 'test',
      requestId: 'test',
      routeKey: 'GET /admin/config/team/{teamId}',
      stage: '$default',
      time: '01/Jan/2026:00:00:00 +0000',
      timeEpoch: 0,
      authorizer: { jwt: { claims: { sub: 'admin-user' }, scopes: [] } },
    },
    pathParameters: null,
    queryStringParameters: null,
    body: null,
    isBase64Encoded: false,
    ...overrides,
  }) as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;

const invoke = async (event = makeEvent()) =>
  (await (handler as any)(event, {} as Context)) as {
    statusCode: number; headers: any; body: string;
  };

describe('get-team-config handler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return 400 when teamId is missing', async () => {
    const res = await invoke();
    expect(res.statusCode).toBe(400);
  });

  it('should query with team#teamId scopeKey', async () => {
    mockSend.mockResolvedValueOnce({ Items: [] });
    await invoke(makeEvent({ pathParameters: { teamId: 't1' } }));
    expect(mockSend.mock.calls[0][0].input.ExpressionAttributeValues[':sk']).toEqual({ S: 'team#t1' });
  });

  it('should return team configs', async () => {
    mockSend.mockResolvedValueOnce({
      Items: [{ configKey: { S: 'allowedModels' }, value: { S: '["claude-3","gpt-4"]' }, updatedAt: { S: '2026-01-01' }, updatedBy: { S: 'admin' } }],
    });
    const res = await invoke(makeEvent({ pathParameters: { teamId: 't1' } }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.teamId).toBe('t1');
    expect(body.configs[0].value).toEqual(['claude-3', 'gpt-4']);
  });

  it('should return 500 on error', async () => {
    mockSend.mockRejectedValueOnce(new Error('DDB error'));
    const res = await invoke(makeEvent({ pathParameters: { teamId: 't1' } }));
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).message).toBe('DDB error');
  });
});
