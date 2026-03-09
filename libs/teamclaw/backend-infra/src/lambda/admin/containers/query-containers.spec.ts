const mockSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({ send: mockSend })),
  ScanCommand: jest.fn((input: any) => ({ input })),
}));

process.env['USERS_TABLE_NAME'] = 'UsersTable';

import { handler } from './query-containers';

const makeEvent = (overrides: any = {}) => ({
  queryStringParameters: null,
  pathParameters: null,
  body: null,
  headers: {},
  requestContext: {} as any,
  ...overrides,
});

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

    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(200);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
    const body = JSON.parse(res.body);
    expect(body.containers).toHaveLength(1);
    expect(body.containers[0].status).toBe('running');
  });

  it('should handle items with missing optional fields', async () => {
    mockSend.mockResolvedValueOnce({
      Items: [{ userId: { S: 'u1' } }],
      LastEvaluatedKey: undefined,
    });
    const res = await handler(makeEvent());
    const c = JSON.parse(res.body).containers[0];
    expect(c.email).toBeNull();
    expect(c.status).toBe('unknown');
    expect(c.taskArn).toBeNull();
  });

  it('should handle pagination', async () => {
    mockSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: { userId: { S: 'u1' } } });
    const res = await handler(makeEvent());
    expect(JSON.parse(res.body).nextToken).toBeDefined();
  });

  it('should accept custom limit', async () => {
    mockSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined });
    await handler(makeEvent({ queryStringParameters: { limit: '10' } }));
    expect(mockSend.mock.calls[0][0].input.Limit).toBe(10);
  });

  it('should return 500 on error', async () => {
    mockSend.mockRejectedValueOnce(new Error('fail'));
    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(500);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
  });
});
