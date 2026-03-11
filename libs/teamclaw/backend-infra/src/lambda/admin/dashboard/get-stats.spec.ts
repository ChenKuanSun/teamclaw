const mockSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({ send: mockSend })),
  ScanCommand: jest.fn((input: any) => ({ input })),
}));

jest.mock('@TeamClaw/teamclaw/cloud-function', () => {
  const actual = jest.requireActual('@TeamClaw/teamclaw/cloud-function');
  return {
    ...actual,
    // Simplified decorator for tests — just calls handler directly
    adminLambdaHandlerDecorator: (method: string, fn: any) => {
      return async (event: any, context: any) => {
        try {
          const result = await fn(event);
          return {
            statusCode: result.status,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(result.body),
          };
        } catch (error: any) {
          return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
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
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

const makeEvent = (): APIGatewayProxyEvent =>
  ({
    httpMethod: 'GET',
    path: '/admin/dashboard/stats',
    pathParameters: null,
    queryStringParameters: null,
    body: null,
    headers: {},
    multiValueHeaders: {},
    isBase64Encoded: false,
    requestContext: {} as any,
    resource: '',
    stageVariables: null,
    multiValueQueryStringParameters: null,
  }) as APIGatewayProxyEvent;

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
