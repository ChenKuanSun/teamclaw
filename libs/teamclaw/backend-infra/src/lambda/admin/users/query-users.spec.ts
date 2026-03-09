const mockSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({ send: mockSend })),
  ScanCommand: jest.fn((input: any) => ({ input })),
}));

process.env['USERS_TABLE_NAME'] = 'UsersTable';

import { handler } from './query-users';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

const makeEvent = (overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent =>
  ({
    httpMethod: 'GET',
    path: '/admin/users',
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
    ...overrides,
  }) as APIGatewayProxyEvent;

const invoke = async (event = makeEvent()) =>
  (await handler(event, {} as Context, undefined as unknown as Callback)) as {
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
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
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
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
  });
});
