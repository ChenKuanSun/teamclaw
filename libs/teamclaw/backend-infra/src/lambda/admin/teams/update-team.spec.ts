const mockSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({ send: mockSend })),
  UpdateItemCommand: jest.fn((input: any) => ({ input })),
}));

process.env['TEAMS_TABLE_NAME'] = 'TeamsTable';

import { handler } from './update-team';

const makeEvent = (overrides: any = {}) => ({
  queryStringParameters: null,
  pathParameters: null,
  body: null,
  headers: {},
  requestContext: {} as any,
  ...overrides,
});

describe('update-team handler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return 400 when teamId is missing', async () => {
    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(400);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
  });

  it('should update name and description', async () => {
    mockSend.mockResolvedValueOnce({
      Attributes: {
        teamId: { S: 't1' }, name: { S: 'Updated' }, description: { S: 'New desc' },
        memberIds: { SS: ['u1'] }, createdAt: { S: '2026-01-01' }, updatedAt: { S: '2026-01-02' },
      },
    });

    const res = await handler(
      makeEvent({
        pathParameters: { teamId: 't1' },
        body: JSON.stringify({ name: 'Updated', description: 'New desc' }),
      }),
    );
    expect(res.statusCode).toBe(200);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
    const body = JSON.parse(res.body);
    expect(body.name).toBe('Updated');
    expect(body.memberCount).toBe(1);
  });

  it('should update memberIds', async () => {
    mockSend.mockResolvedValueOnce({
      Attributes: {
        teamId: { S: 't1' }, name: { S: 'Team' },
        memberIds: { SS: ['u1', 'u2'] }, updatedAt: { S: '2026-01-02' },
      },
    });

    const res = await handler(
      makeEvent({
        pathParameters: { teamId: 't1' },
        body: JSON.stringify({ memberIds: ['u1', 'u2'] }),
      }),
    );
    expect(JSON.parse(res.body).memberIds).toEqual(['u1', 'u2']);
  });

  it('should set memberIds to NULL when empty array', async () => {
    mockSend.mockResolvedValueOnce({
      Attributes: { teamId: { S: 't1' }, name: { S: 'Team' }, updatedAt: { S: '2026-01-02' } },
    });

    await handler(
      makeEvent({
        pathParameters: { teamId: 't1' },
        body: JSON.stringify({ memberIds: [] }),
      }),
    );

    const cmd = mockSend.mock.calls[0][0];
    expect(cmd.input.ExpressionAttributeValues[':memberIds']).toEqual({ NULL: true });
  });

  it('should return 404 on ConditionalCheckFailedException', async () => {
    const error: any = new Error('Condition failed');
    error.name = 'ConditionalCheckFailedException';
    mockSend.mockRejectedValueOnce(error);

    const res = await handler(
      makeEvent({ pathParameters: { teamId: 'nonexistent' }, body: JSON.stringify({ name: 'x' }) }),
    );
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toBe('Team not found');
  });

  it('should return 500 on generic error', async () => {
    mockSend.mockRejectedValueOnce(new Error('DDB error'));
    const res = await handler(
      makeEvent({ pathParameters: { teamId: 't1' }, body: JSON.stringify({ name: 'x' }) }),
    );
    expect(res.statusCode).toBe(500);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
  });
});
