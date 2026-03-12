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
    adminLambdaHandlerDecorator: (method: string, fn: any) => {
      return async (event: any, context: any) => {
        try {
          const input = {
            raw: event,
            queryStringParameters: event.queryStringParameters,
            pathParameters: event.pathParameters,
            body: event.body ? JSON.parse(event.body) : undefined,
          };
          const result = await fn(input);
          return {
            statusCode: result.status,
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify(result.body),
          };
        } catch (error: any) {
          return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
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
import type { APIGatewayProxyEventV2WithJWTAuthorizer, Context } from 'aws-lambda';

const makeEvent = (overrides: Partial<APIGatewayProxyEventV2WithJWTAuthorizer> = {}): APIGatewayProxyEventV2WithJWTAuthorizer =>
  ({
    version: '2.0',
    routeKey: 'POST /admin/teams',
    rawPath: '/admin/teams',
    rawQueryString: '',
    headers: {},
    requestContext: {
      http: { method: 'POST', path: '/admin/teams', protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'test' },
      accountId: '123456789012',
      apiId: 'test',
      domainName: 'test',
      domainPrefix: 'test',
      requestId: 'test',
      routeKey: 'POST /admin/teams',
      stage: '$default',
      time: '01/Jan/2026:00:00:00 +0000',
      timeEpoch: 0,
      authorizer: { jwt: { claims: { sub: 'admin-user' }, scopes: [] } },
    },
    pathParameters: null,
    queryStringParameters: null,
    body: null,
    isBase64Encoded: false,
    ...overrides,
  }) as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;

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
    expect(res.statusCode).toBe(200);
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
