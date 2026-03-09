const mockSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({ send: mockSend })),
  GetItemCommand: jest.fn((input: any) => ({ input })),
}));

process.env['TEAMS_TABLE_NAME'] = 'TeamsTable';

import { handler } from './get-team';

const makeEvent = (overrides: any = {}) => ({
  queryStringParameters: null,
  pathParameters: null,
  body: null,
  headers: {},
  requestContext: {} as any,
  ...overrides,
});

describe('get-team handler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return 400 when teamId is missing', async () => {
    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(400);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
    expect(JSON.parse(res.body).error).toContain('Missing teamId');
  });

  it('should return 404 when team not found', async () => {
    mockSend.mockResolvedValueOnce({ Item: undefined });
    const res = await handler(makeEvent({ pathParameters: { teamId: 't1' } }));
    expect(res.statusCode).toBe(404);
  });

  it('should return team details', async () => {
    mockSend.mockResolvedValueOnce({
      Item: {
        teamId: { S: 't1' }, name: { S: 'Alpha' }, description: { S: 'Desc' },
        memberIds: { SS: ['u1', 'u2', 'u3'] },
        createdAt: { S: '2026-01-01' }, updatedAt: { S: '2026-01-02' },
      },
    });
    const res = await handler(makeEvent({ pathParameters: { teamId: 't1' } }));
    expect(res.statusCode).toBe(200);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
    const body = JSON.parse(res.body);
    expect(body.teamId).toBe('t1');
    expect(body.memberIds).toEqual(['u1', 'u2', 'u3']);
    expect(body.memberCount).toBe(3);
  });

  it('should handle team with no members', async () => {
    mockSend.mockResolvedValueOnce({ Item: { teamId: { S: 't1' }, name: { S: 'Empty' } } });
    const res = await handler(makeEvent({ pathParameters: { teamId: 't1' } }));
    const body = JSON.parse(res.body);
    expect(body.memberIds).toEqual([]);
    expect(body.memberCount).toBe(0);
  });

  it('should return 500 on error', async () => {
    mockSend.mockRejectedValueOnce(new Error('fail'));
    const res = await handler(makeEvent({ pathParameters: { teamId: 't1' } }));
    expect(res.statusCode).toBe(500);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
  });
});
