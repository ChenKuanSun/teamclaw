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
process.env['DEPLOY_ENV'] = 'dev';

import { handler } from './query-users';
import type { APIGatewayProxyEventV2WithJWTAuthorizer, Context } from 'aws-lambda';

const makeEvent = (overrides: Partial<APIGatewayProxyEventV2WithJWTAuthorizer> = {}): APIGatewayProxyEventV2WithJWTAuthorizer =>
  ({
    version: '2.0',
    routeKey: 'GET /admin/users',
    rawPath: '/admin/users',
    rawQueryString: '',
    headers: {},
    requestContext: {
      http: { method: 'GET', path: '/admin/users', protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'test' },
      accountId: '123456789012',
      apiId: 'test',
      domainName: 'test',
      domainPrefix: 'test',
      requestId: 'test',
      routeKey: 'GET /admin/users',
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
  (await handler(event, {} as Context)) as {
    statusCode: number;
    headers: any;
    body: string;
  };

describe('query-users handler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return users with default pagination', async () => {
    mockSend.mockResolvedValueOnce({
      Items: [
        {
          userId: { S: 'u1' }, teamId: { S: 't1' }, email: { S: 'a@b.com' },
          displayName: { S: 'Alice' }, status: { S: 'running' },
          efsAccessPointId: { S: 'ap1' }, taskArn: { S: 'arn:task' },
          createdAt: { S: '2026-01-01' }, updatedAt: { S: '2026-01-02' },
        },
      ],
      LastEvaluatedKey: undefined,
    });

    const res = await invoke();
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.users).toHaveLength(1);
    expect(body.users[0].userId).toBe('u1');
    expect(body.nextToken).toBeUndefined();
  });

  it('should apply email filter', async () => {
    mockSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined });

    await invoke(makeEvent({ queryStringParameters: { email: 'test@' } }));

    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.FilterExpression).toContain('contains(#email, :email)');
    expect(cmd.input.ExpressionAttributeValues[':email']).toEqual({ S: 'test@' });
  });

  it('should apply status filter', async () => {
    mockSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined });
    await invoke(makeEvent({ queryStringParameters: { status: 'running' } }));
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.FilterExpression).toContain('#status = :status');
  });

  it('should combine email and status filters', async () => {
    mockSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined });
    await invoke(makeEvent({ queryStringParameters: { email: 'test', status: 'stopped' } }));
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.FilterExpression).toContain(' AND ');
  });

  it('should handle pagination with nextToken', async () => {
    const key = { userId: { S: 'u1' } };
    const nextToken = Buffer.from(JSON.stringify(key)).toString('base64');
    mockSend.mockResolvedValueOnce({
      Items: [],
      LastEvaluatedKey: { userId: { S: 'u2' } },
    });

    const res = await invoke(makeEvent({ queryStringParameters: { nextToken } }));
    expect(JSON.parse(res.body).nextToken).toBeDefined();
  });

  it('should cap limit at 100', async () => {
    mockSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined });
    await invoke(makeEvent({ queryStringParameters: { limit: '500' } }));
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.Limit).toBe(100);
  });

  it('should return 500 on error', async () => {
    mockSend.mockRejectedValueOnce(new Error('fail'));
    const res = await invoke();
    expect(res.statusCode).toBe(500);
  });
});
