const mockSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({ send: mockSend })),
  GetItemCommand: jest.fn((input: any) => ({ input })),
}));

process.env['USERS_TABLE_NAME'] = 'UsersTable';

import { handler } from './get-container';

const makeEvent = (overrides: any = {}) => ({
  queryStringParameters: null,
  pathParameters: null,
  body: null,
  headers: {},
  requestContext: {} as any,
  ...overrides,
});

describe('get-container handler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return 400 when userId is missing', async () => {
    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(400);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
  });

  it('should return 404 when container not found', async () => {
    mockSend.mockResolvedValueOnce({ Item: undefined });
    const res = await handler(makeEvent({ pathParameters: { userId: 'u1' } }));
    expect(res.statusCode).toBe(404);
  });

  it('should return container details', async () => {
    mockSend.mockResolvedValueOnce({
      Item: {
        userId: { S: 'u1' }, email: { S: 'a@b.com' }, displayName: { S: 'Alice' },
        teamId: { S: 't1' }, efsAccessPointId: { S: 'ap-123' }, status: { S: 'running' },
        taskArn: { S: 'arn:task/1' }, createdAt: { S: '2026-01-01' }, updatedAt: { S: '2026-01-02' },
      },
    });

    const res = await handler(makeEvent({ pathParameters: { userId: 'u1' } }));
    expect(res.statusCode).toBe(200);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
    const body = JSON.parse(res.body);
    expect(body.userId).toBe('u1');
    expect(body.efsAccessPointId).toBe('ap-123');
  });

  it('should handle missing optional fields', async () => {
    mockSend.mockResolvedValueOnce({ Item: { userId: { S: 'u1' } } });
    const res = await handler(makeEvent({ pathParameters: { userId: 'u1' } }));
    const body = JSON.parse(res.body);
    expect(body.email).toBeNull();
    expect(body.status).toBe('unknown');
  });

  it('should return 500 on error', async () => {
    mockSend.mockRejectedValueOnce(new Error('fail'));
    const res = await handler(makeEvent({ pathParameters: { userId: 'u1' } }));
    expect(res.statusCode).toBe(500);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
  });
});
