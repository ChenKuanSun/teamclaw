const mockSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({ send: mockSend })),
  DeleteItemCommand: jest.fn((input: any) => ({ input })),
  GetItemCommand: jest.fn((input: any) => ({ input })),
  UpdateItemCommand: jest.fn((input: any) => ({ input })),
}));

process.env['TEAMS_TABLE_NAME'] = 'TeamsTable';
process.env['USERS_TABLE_NAME'] = 'UsersTable';

import { handler } from './delete-team';

const makeEvent = (overrides: any = {}) => ({
  queryStringParameters: null,
  pathParameters: null,
  body: null,
  headers: {},
  requestContext: {} as any,
  ...overrides,
});

describe('delete-team handler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return 400 when teamId is missing', async () => {
    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(400);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
  });

  it('should return 404 when team not found', async () => {
    mockSend.mockResolvedValueOnce({ Item: undefined });
    const res = await handler(makeEvent({ pathParameters: { teamId: 't1' } }));
    expect(res.statusCode).toBe(404);
  });

  it('should delete team and update members', async () => {
    mockSend
      .mockResolvedValueOnce({ Item: { teamId: { S: 't1' }, memberIds: { SS: ['u1', 'u2'] } } })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const res = await handler(makeEvent({ pathParameters: { teamId: 't1' } }));
    expect(res.statusCode).toBe(200);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
    const body = JSON.parse(res.body);
    expect(body.deleted).toBe(true);
    expect(body.membersUpdated).toBe(2);
    expect(mockSend).toHaveBeenCalledTimes(4);
  });

  it('should delete team with no members', async () => {
    mockSend
      .mockResolvedValueOnce({ Item: { teamId: { S: 't1' } } })
      .mockResolvedValueOnce({});

    const res = await handler(makeEvent({ pathParameters: { teamId: 't1' } }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).membersUpdated).toBe(0);
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('should return 500 on error', async () => {
    mockSend.mockRejectedValueOnce(new Error('DDB error'));
    const res = await handler(makeEvent({ pathParameters: { teamId: 't1' } }));
    expect(res.statusCode).toBe(500);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
  });
});
