const mockSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({ send: mockSend })),
  ScanCommand: jest.fn((input: any) => ({ input })),
}));

process.env['TEAMS_TABLE_NAME'] = 'TeamsTable';

import { handler } from './query-teams';

const makeEvent = (overrides: any = {}) => ({
  queryStringParameters: null,
  pathParameters: null,
  body: null,
  headers: {},
  requestContext: {} as any,
  ...overrides,
});

describe('query-teams handler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return teams with default limit', async () => {
    mockSend.mockResolvedValueOnce({
      Items: [
        {
          teamId: { S: 't1' }, name: { S: 'Alpha' }, description: { S: 'First team' },
          memberIds: { SS: ['u1', 'u2'] }, createdAt: { S: '2026-01-01' }, updatedAt: { S: '2026-01-02' },
        },
      ],
      LastEvaluatedKey: undefined,
    });

    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(200);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
    const body = JSON.parse(res.body);
    expect(body.teams).toHaveLength(1);
    expect(body.teams[0].teamId).toBe('t1');
    expect(body.teams[0].memberCount).toBe(2);
    expect(body.nextToken).toBeUndefined();
  });

  it('should filter by name', async () => {
    mockSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined });
    await handler(makeEvent({ queryStringParameters: { name: 'Alpha' } }));
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.FilterExpression).toBe('contains(#n, :name)');
    expect(cmd.input.ExpressionAttributeValues[':name']).toEqual({ S: 'Alpha' });
  });

  it('should handle pagination', async () => {
    const lastKey = { teamId: { S: 't1' } };
    mockSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: lastKey });
    const res = await handler(makeEvent());
    const body = JSON.parse(res.body);
    expect(body.nextToken).toBeDefined();
    expect(JSON.parse(Buffer.from(body.nextToken, 'base64').toString())).toEqual(lastKey);
  });

  it('should accept nextToken for continued scanning', async () => {
    const key = { teamId: { S: 't1' } };
    const nextToken = Buffer.from(JSON.stringify(key)).toString('base64');
    mockSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined });
    await handler(makeEvent({ queryStringParameters: { nextToken } }));
    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.ExclusiveStartKey).toEqual(key);
  });

  it('should handle teams with no members', async () => {
    mockSend.mockResolvedValueOnce({
      Items: [{ teamId: { S: 't1' }, name: { S: 'Empty' } }],
      LastEvaluatedKey: undefined,
    });
    const res = await handler(makeEvent());
    expect(JSON.parse(res.body).teams[0].memberCount).toBe(0);
  });

  it('should return 500 on error', async () => {
    mockSend.mockRejectedValueOnce(new Error('fail'));
    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(500);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
  });
});
