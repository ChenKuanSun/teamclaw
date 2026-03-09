const mockSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({ send: mockSend })),
  PutItemCommand: jest.fn((input: any) => ({ input })),
}));

jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomUUID: jest.fn(() => 'test-uuid-1234'),
}));

process.env['TEAMS_TABLE_NAME'] = 'TeamsTable';

import { handler } from './create-team';

const makeEvent = (overrides: any = {}) => ({
  queryStringParameters: null,
  pathParameters: null,
  body: null,
  headers: {},
  requestContext: {} as any,
  ...overrides,
});

describe('create-team handler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return 400 when name is missing', async () => {
    const res = await handler(makeEvent({ body: JSON.stringify({}) }));
    expect(res.statusCode).toBe(400);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
    expect(JSON.parse(res.body).error).toContain('Missing required field: name');
  });

  it('should return 400 when body is missing', async () => {
    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(400);
  });

  it('should create team successfully', async () => {
    mockSend.mockResolvedValueOnce({});
    const res = await handler(
      makeEvent({ body: JSON.stringify({ name: 'New Team', description: 'A description' }) }),
    );
    expect(res.statusCode).toBe(201);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
    const body = JSON.parse(res.body);
    expect(body.teamId).toBe('test-uuid-1234');
    expect(body.name).toBe('New Team');
    expect(body.description).toBe('A description');
    expect(body.createdAt).toBeDefined();
  });

  it('should default description to empty string', async () => {
    mockSend.mockResolvedValueOnce({});
    const res = await handler(makeEvent({ body: JSON.stringify({ name: 'No Desc' }) }));
    expect(JSON.parse(res.body).description).toBe('');
  });

  it('should return 500 on DynamoDB error', async () => {
    mockSend.mockRejectedValueOnce(new Error('DDB error'));
    const res = await handler(makeEvent({ body: JSON.stringify({ name: 'Test' }) }));
    expect(res.statusCode).toBe(500);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
  });
});
