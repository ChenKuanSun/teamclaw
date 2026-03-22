const mockSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({ send: mockSend })),
  ScanCommand: jest.fn((input: any) => ({ input })),
}));

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

process.env['USAGE_TABLE_NAME'] = 'UsageTable';

import { handler } from './get-system-analytics';
import type { APIGatewayProxyEventV2WithJWTAuthorizer, Context } from 'aws-lambda';

const makeEvent = (overrides: Partial<APIGatewayProxyEventV2WithJWTAuthorizer> = {}): APIGatewayProxyEventV2WithJWTAuthorizer =>
  ({
    version: '2.0',
    routeKey: 'GET /admin/analytics/system',
    rawPath: '/admin/analytics/system',
    rawQueryString: '',
    headers: {},
    requestContext: {
      http: { method: 'GET', path: '/admin/analytics/system', protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'test' },
      accountId: '123456789012',
      apiId: 'test',
      domainName: 'test',
      domainPrefix: 'test',
      requestId: 'test',
      routeKey: 'GET /admin/analytics/system',
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

describe('get-system-analytics handler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return 400 when from parameter is missing', async () => {
    const res = await invoke();
    expect(res.statusCode).toBe(400);
  });

  it('should return analytics with date range filtering', async () => {
    mockSend.mockResolvedValueOnce({
      Items: [
        { userId: { S: 'u1' }, provider: { S: 'openai' } },
        { userId: { S: 'u1' }, provider: { S: 'anthropic' } },
        { userId: { S: 'u2' }, provider: { S: 'openai' } },
      ],
      LastEvaluatedKey: undefined,
    });

    const res = await invoke(makeEvent({ queryStringParameters: { from: '2026-01-01T00:00:00Z' } }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.totalRequests).toBe(3);
    expect(body.uniqueUsers).toBe(2);
    expect(body.byProvider.openai).toBe(2);
    expect(body.byProvider.anthropic).toBe(1);
  });

  it('should accept custom to parameter', async () => {
    mockSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined });
    await invoke(makeEvent({
      queryStringParameters: { from: '2026-01-01T00:00:00Z', to: '2026-01-31T23:59:59Z' },
    }));
    expect(mockSend.mock.calls[0][0].input.ExpressionAttributeValues[':to']).toEqual({ S: '2026-01-31T23:59:59Z' });
  });

  it('should handle empty results', async () => {
    mockSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined });
    const body = JSON.parse((await invoke(makeEvent({ queryStringParameters: { from: '2026-01-01T00:00:00Z' } }))).body);
    expect(body.totalRequests).toBe(0);
    expect(body.uniqueUsers).toBe(0);
  });

  it('should paginate through all results', async () => {
    mockSend
      .mockResolvedValueOnce({ Items: [{ userId: { S: 'u1' }, provider: { S: 'openai' } }], LastEvaluatedKey: { pk: { S: 'p1' } } })
      .mockResolvedValueOnce({ Items: [{ userId: { S: 'u2' }, provider: { S: 'openai' } }], LastEvaluatedKey: undefined });

    const body = JSON.parse((await invoke(makeEvent({ queryStringParameters: { from: '2026-01-01T00:00:00Z' } }))).body);
    expect(body.totalRequests).toBe(2);
    expect(body.uniqueUsers).toBe(2);
  });

  it('should return 500 on error', async () => {
    mockSend.mockRejectedValueOnce(new Error('DDB error'));
    const res = await invoke(makeEvent({ queryStringParameters: { from: '2026-01-01T00:00:00Z' } }));
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).message).toBe('DDB error');
  });
});
