const mockSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({ send: mockSend })),
  PutItemCommand: jest.fn((input: any) => ({ input })),
  ScanCommand: jest.fn((input: any) => ({ input })),
}));

jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomUUID: jest.fn(() => 'test-uuid-1234'),
}));

jest.mock('@TeamClaw/teamclaw/cloud-function', () => {
  const actual = jest.requireActual('@TeamClaw/teamclaw/cloud-function');
  return {
    ...actual,
    adminLambdaHandlerDecorator: (_method: string, fn: any) => {
      return async (event: any, context: any) => {
        try {
          const result = await fn(event);
          return {
            statusCode: result.status,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(result.body),
          };
        } catch (error: any) {
          return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: error.message || 'Internal server error' }),
          };
        }
      };
    },
    validateRequiredEnvVars: jest.fn(),
  };
});

process.env['TEAMS_TABLE_NAME'] = 'TeamsTable';
process.env['DEPLOY_ENV'] = 'dev';

import { handler } from './create-team';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';

const makeEvent = (overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent =>
  ({
    httpMethod: 'POST',
    path: '/admin/teams',
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
  (await handler(event, {} as Context)) as {
    statusCode: number;
    headers: any;
    body: string;
  };

describe('create-team handler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return 400 when name is missing', async () => {
    const res = await invoke(makeEvent({ body: JSON.stringify({}) }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain('Missing required field: name');
  });

  it('should return 400 when body is missing', async () => {
    const res = await invoke();
    expect(res.statusCode).toBe(400);
  });

  it('should return 409 when team name already exists', async () => {
    mockSend.mockResolvedValueOnce({
      Items: [{ teamId: { S: 'existing-id' }, name: { S: 'Duplicate' } }],
    });
    const res = await invoke(makeEvent({ body: JSON.stringify({ name: 'Duplicate' }) }));
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).message).toContain('already exists');
  });

  it('should create team successfully', async () => {
    mockSend.mockResolvedValueOnce({ Items: [] }).mockResolvedValueOnce({});
    const res = await invoke(
      makeEvent({ body: JSON.stringify({ name: 'New Team', description: 'A description' }) }),
    );
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.teamId).toBe('test-uuid-1234');
    expect(body.name).toBe('New Team');
    expect(body.description).toBe('A description');
    expect(body.createdAt).toBeDefined();
  });

  it('should default description to empty string', async () => {
    mockSend.mockResolvedValueOnce({ Items: [] }).mockResolvedValueOnce({});
    const res = await invoke(makeEvent({ body: JSON.stringify({ name: 'No Desc' }) }));
    expect(JSON.parse(res.body).description).toBe('');
  });

  it('should return 500 on DynamoDB error', async () => {
    mockSend.mockResolvedValueOnce({ Items: [] }).mockRejectedValueOnce(new Error('DDB error'));
    const res = await invoke(makeEvent({ body: JSON.stringify({ name: 'Test' }) }));
    expect(res.statusCode).toBe(500);
  });
});
