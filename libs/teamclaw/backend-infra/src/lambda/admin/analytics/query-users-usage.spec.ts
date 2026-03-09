const mockSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({ send: mockSend })),
  ScanCommand: jest.fn((input: any) => ({ input })),
}));

process.env['USAGE_TABLE_NAME'] = 'UsageTable';

import { handler } from './query-users-usage';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

const makeEvent = (overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent =>
  ({
    httpMethod: 'GET', path: '/admin/analytics/users-usage', pathParameters: null,
    queryStringParameters: null, body: null, headers: {}, multiValueHeaders: {},
    isBase64Encoded: false, requestContext: {} as any, resource: '',
    stageVariables: null, multiValueQueryStringParameters: null,
    ...overrides,
  }) as APIGatewayProxyEvent;

const invoke = async (event = makeEvent()) =>
  (await handler(event, {} as Context, undefined as unknown as Callback)) as {
    statusCode: number; headers: any; body: string;
  };

describe('query-users-usage handler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return per-user usage sorted by request count', async () => {
    mockSend.mockResolvedValueOnce({
      Items: [
        { userId: { S: 'u1' }, provider: { S: 'openai' } },
        { userId: { S: 'u1' }, provider: { S: 'openai' } },
        { userId: { S: 'u2' }, provider: { S: 'anthropic' } },
        { userId: { S: 'u2' }, provider: { S: 'openai' } },
        { userId: { S: 'u2' }, provider: { S: 'openai' } },
      ],
      LastEvaluatedKey: undefined,
    });

    const res = await invoke();
    expect(res.statusCode).toBe(200);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
    const body = JSON.parse(res.body);
    expect(body.totalUsers).toBe(2);
    expect(body.users[0].userId).toBe('u2');
    expect(body.users[0].requestCount).toBe(3);
    expect(body.users[1].userId).toBe('u1');
    expect(body.users[1].requestCount).toBe(2);
  });

  it('should filter by date range when from is provided', async () => {
    mockSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined });
    await invoke(makeEvent({
      queryStringParameters: { from: '2026-01-01T00:00:00Z', to: '2026-01-31T23:59:59Z' },
    }));
    expect(mockSend.mock.calls[0][0].input.FilterExpression).toContain('BETWEEN');
  });

  it('should not filter when from is not provided', async () => {
    mockSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined });
    await invoke();
    expect(mockSend.mock.calls[0][0].input.FilterExpression).toBeUndefined();
  });

  it('should respect limit parameter', async () => {
    const items = Array.from({ length: 5 }, (_, i) => ({
      userId: { S: `u${i}` }, provider: { S: 'openai' },
    }));
    mockSend.mockResolvedValueOnce({ Items: items, LastEvaluatedKey: undefined });

    const body = JSON.parse((await invoke(makeEvent({ queryStringParameters: { limit: '2' } }))).body);
    expect(body.users).toHaveLength(2);
    expect(body.totalUsers).toBe(5);
    expect(body.nextToken).toBeDefined();
  });

  it('should return no nextToken when results fit in limit', async () => {
    mockSend.mockResolvedValueOnce({
      Items: [{ userId: { S: 'u1' }, provider: { S: 'openai' } }],
      LastEvaluatedKey: undefined,
    });
    const body = JSON.parse((await invoke()).body);
    expect(body.nextToken).toBeUndefined();
  });

  it('should return 400 for invalid nextToken', async () => {
    const res = await invoke(makeEvent({ queryStringParameters: { nextToken: 'invalid!!!' } }));
    expect(res.statusCode).toBe(400);
  });

  it('should handle empty results', async () => {
    mockSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined });
    const body = JSON.parse((await invoke()).body);
    expect(body.users).toEqual([]);
    expect(body.totalUsers).toBe(0);
  });

  it('should return 500 on error', async () => {
    mockSend.mockRejectedValueOnce(new Error('DDB error'));
    const res = await invoke();
    expect(res.statusCode).toBe(500);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
  });
});
