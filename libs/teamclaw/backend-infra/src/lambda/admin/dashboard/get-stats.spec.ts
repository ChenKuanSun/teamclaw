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
          // Create structured input matching Affiora pattern
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

process.env['USERS_TABLE_NAME'] = 'UsersTable';
process.env['USAGE_TABLE_NAME'] = 'UsageTable';
process.env['DEPLOY_ENV'] = 'dev';

import { handler } from './get-stats';
import type { APIGatewayProxyEventV2WithJWTAuthorizer, Context } from 'aws-lambda';

const makeEvent = (): APIGatewayProxyEventV2WithJWTAuthorizer =>
  ({
    version: '2.0',
    routeKey: 'GET /admin/dashboard/stats',
    rawPath: '/admin/dashboard/stats',
    rawQueryString: '',
    headers: {},
    requestContext: {
      http: { method: 'GET', path: '/admin/dashboard/stats', protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'test' },
      accountId: '123456789012',
      apiId: 'test',
      domainName: 'test',
      domainPrefix: 'test',
      requestId: 'test',
      routeKey: 'GET /admin/dashboard/stats',
      stage: '$default',
      time: '01/Jan/2026:00:00:00 +0000',
      timeEpoch: 0,
      authorizer: { jwt: { claims: { sub: 'admin-user' }, scopes: [] } },
    },
    pathParameters: null,
    queryStringParameters: null,
    body: null,
    isBase64Encoded: false,
  }) as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;

const invoke = async (event = makeEvent()) =>
  (await (handler as any)(event, {} as Context)) as {
    statusCode: number;
    headers: any;
    body: string;
  };

describe('get-stats handler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return aggregated stats with multiple user statuses', async () => {
    mockSend
      .mockResolvedValueOnce({
        Items: [
          { userId: { S: 'u1' }, status: { S: 'running' } },
          { userId: { S: 'u2' }, status: { S: 'stopped' } },
          { userId: { S: 'u3' }, status: { S: 'running' } },
          { userId: { S: 'u4' }, status: { S: 'provisioned' } },
        ],
      })
      .mockResolvedValueOnce({ Count: 15, LastEvaluatedKey: undefined });

    const res = await invoke();
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.totalUsers).toBe(4);
    expect(body.containers.running).toBe(2);
    expect(body.containers.stopped).toBe(1);
    expect(body.containers.provisioned).toBe(1);
    expect(body.totalRequests24h).toBe(15);
  });

  it('should handle empty tables', async () => {
    mockSend
      .mockResolvedValueOnce({ Items: [] })
      .mockResolvedValueOnce({ Count: 0 });

    const res = await invoke();
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.totalUsers).toBe(0);
    expect(body.containers.running).toBe(0);
    expect(body.totalRequests24h).toBe(0);
  });

  it('should paginate through usage table', async () => {
    mockSend
      .mockResolvedValueOnce({ Items: [] })
      .mockResolvedValueOnce({ Count: 10, LastEvaluatedKey: { pk: { S: 'page1' } } })
      .mockResolvedValueOnce({ Count: 5, LastEvaluatedKey: undefined });

    const res = await invoke();
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).totalRequests24h).toBe(15);
  });

  it('should return 500 on DynamoDB error', async () => {
    mockSend.mockRejectedValueOnce(new Error('DDB failure'));
    const res = await invoke();
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).message).toBe('DDB failure');
  });
});
