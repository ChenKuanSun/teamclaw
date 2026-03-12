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

process.env['USERS_TABLE_NAME'] = 'UsersTable';
process.env['DEPLOY_ENV'] = 'dev';

import { handler } from './query-containers';
import type { APIGatewayProxyEventV2WithJWTAuthorizer, Context } from 'aws-lambda';

const makeEvent = (overrides: Partial<APIGatewayProxyEventV2WithJWTAuthorizer> = {}): APIGatewayProxyEventV2WithJWTAuthorizer =>
  ({
    version: '2.0',
    routeKey: 'GET /admin/containers',
    rawPath: '/admin/containers',
    rawQueryString: '',
    headers: {},
    requestContext: {
      http: { method: 'GET', path: '/admin/containers', protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'test' },
      accountId: '123456789012',
      apiId: 'test',
      domainName: 'test',
      domainPrefix: 'test',
      requestId: 'test',
      routeKey: 'GET /admin/containers',
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

describe('query-containers handler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return containers with default limit', async () => {
    mockSend.mockResolvedValueOnce({
      Items: [{
        userId: { S: 'u1' }, email: { S: 'a@b.com' }, displayName: { S: 'Alice' },
        teamId: { S: 't1' }, status: { S: 'running' }, taskArn: { S: 'arn:task/1' },
      }],
      LastEvaluatedKey: undefined,
    });

    const res = await invoke();
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.containers).toHaveLength(1);
    expect(body.containers[0].status).toBe('running');
  });

  it('should handle items with missing optional fields', async () => {
    mockSend.mockResolvedValueOnce({
      Items: [{ userId: { S: 'u1' } }],
      LastEvaluatedKey: undefined,
    });
    const res = await invoke();
    const c = JSON.parse(res.body).containers[0];
    expect(c.email).toBeNull();
    expect(c.status).toBe('unknown');
    expect(c.taskArn).toBeNull();
  });

  it('should handle pagination', async () => {
    mockSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: { userId: { S: 'u1' } } });
    const res = await invoke();
    expect(JSON.parse(res.body).nextToken).toBeDefined();
  });

  it('should accept custom limit', async () => {
    mockSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined });
    await invoke(makeEvent({ queryStringParameters: { limit: '10' } }));
    expect(mockSend.mock.calls[0][0].input.Limit).toBe(10);
  });

  it('should return 500 on error', async () => {
    mockSend.mockRejectedValueOnce(new Error('fail'));
    const res = await invoke();
    expect(res.statusCode).toBe(500);
  });
});
