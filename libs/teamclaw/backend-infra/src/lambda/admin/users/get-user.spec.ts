const mockSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({ send: mockSend })),
  GetItemCommand: jest.fn((input: any) => ({ input })),
}));

process.env['USERS_TABLE_NAME'] = 'UsersTable';

import { handler } from './get-user';
import type { APIGatewayProxyEvent, Context, Callback } from 'aws-lambda';

const makeEvent = (overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent =>
  ({
    httpMethod: 'GET',
    path: '/admin/users/u1',
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

describe('get-user handler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return 400 when userId is missing', async () => {
    const res = await invoke();
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain('Missing userId');
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
  });

  it('should return 404 when user is not found', async () => {
    mockSend.mockResolvedValueOnce({ Item: undefined });
    const res = await invoke(makeEvent({ pathParameters: { userId: 'nonexistent' } }));
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toBe('User not found');
  });

  it('should return user data when found', async () => {
    mockSend.mockResolvedValueOnce({
      Item: {
        userId: { S: 'u1' }, teamId: { S: 't1' }, email: { S: 'user@test.com' },
        displayName: { S: 'Test User' }, status: { S: 'running' },
        efsAccessPointId: { S: 'ap-123' }, taskArn: { S: 'arn:aws:ecs:task/123' },
        createdAt: { S: '2026-01-01T00:00:00Z' }, updatedAt: { S: '2026-01-02T00:00:00Z' },
      },
    });

    const res = await invoke(makeEvent({ pathParameters: { userId: 'u1' } }));
    expect(res.statusCode).toBe(200);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
    const body = JSON.parse(res.body);
    expect(body.userId).toBe('u1');
    expect(body.email).toBe('user@test.com');
    expect(body.status).toBe('running');
  });

  it('should return 500 on DynamoDB error', async () => {
    mockSend.mockRejectedValueOnce(new Error('DDB failure'));
    const res = await invoke(makeEvent({ pathParameters: { userId: 'u1' } }));
    expect(res.statusCode).toBe(500);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
  });
});
