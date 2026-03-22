const mockDdbSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({ send: mockDdbSend })),
  PutItemCommand: jest.fn((input: any) => ({ input })),
  QueryCommand: jest.fn((input: any) => ({ input })),
  UpdateItemCommand: jest.fn((input: any) => ({ input })),
}));

jest.mock('@TeamClaw/teamclaw/cloud-function', () => {
  const actual = jest.requireActual('@TeamClaw/teamclaw/cloud-function');
  return {
    ...actual,
    adminLambdaHandlerDecorator: (_method: string, fn: any) => {
      return async (event: any) => {
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
            body: JSON.stringify({
              message: error.message || 'Internal server error',
            }),
          };
        }
      };
    },
    validateRequiredEnvVars: jest.fn(),
  };
});

process.env['SKILLS_TABLE_NAME'] = 'SkillsTable';

import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  Context,
} from 'aws-lambda';
import { handler } from './request-skill-install';

const makeEvent = (
  overrides: Partial<APIGatewayProxyEventV2WithJWTAuthorizer> = {},
): APIGatewayProxyEventV2WithJWTAuthorizer =>
  ({
    version: '2.0',
    routeKey: 'POST /admin/skills/request',
    rawPath: '/admin/skills/request',
    rawQueryString: '',
    headers: {},
    requestContext: {
      http: {
        method: 'POST',
        path: '/admin/skills/request',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test',
      },
      accountId: '123456789012',
      apiId: 'test',
      domainName: 'test',
      domainPrefix: 'test',
      requestId: 'test',
      routeKey: 'POST /admin/skills/request',
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
  (await (handler as any)(event, {} as Context)) as {
    statusCode: number;
    headers: any;
    body: string;
  };

describe('request-skill-install handler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return 400 when skillId is missing', async () => {
    const res = await invoke(
      makeEvent({
        body: JSON.stringify({
          skillName: 'test',
          source: 'hub',
          requestedBy: 'user1',
        }),
      }),
    );
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain('Missing required fields');
  });

  it('should return 400 when skillName is missing', async () => {
    const res = await invoke(
      makeEvent({
        body: JSON.stringify({
          skillId: 's1',
          source: 'hub',
          requestedBy: 'user1',
        }),
      }),
    );
    expect(res.statusCode).toBe(400);
  });

  it('should return 400 when source is missing', async () => {
    const res = await invoke(
      makeEvent({
        body: JSON.stringify({
          skillId: 's1',
          skillName: 'test',
          requestedBy: 'user1',
        }),
      }),
    );
    expect(res.statusCode).toBe(400);
  });

  it('should return 400 when requestedBy is missing', async () => {
    const res = await invoke(
      makeEvent({
        body: JSON.stringify({
          skillId: 's1',
          skillName: 'test',
          source: 'hub',
        }),
      }),
    );
    expect(res.statusCode).toBe(400);
  });

  it('should return 400 when body is empty', async () => {
    const res = await invoke(makeEvent());
    expect(res.statusCode).toBe(400);
  });

  it('should successfully request a skill install', async () => {
    mockDdbSend.mockResolvedValueOnce({});

    const res = await invoke(
      makeEvent({
        body: JSON.stringify({
          skillId: 'skill-123',
          skillName: 'Web Search',
          source: 'hub',
          requestedBy: 'user1',
        }),
      }),
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('pending');
    expect(body.skillId).toBe('skill-123');
    expect(mockDdbSend).toHaveBeenCalledTimes(1);

    const putInput = mockDdbSend.mock.calls[0][0].input;
    expect(putInput.TableName).toBe('SkillsTable');
    expect(putInput.Item.skillId.S).toBe('skill-123');
    expect(putInput.Item.skillName.S).toBe('Web Search');
    expect(putInput.Item.source.S).toBe('hub');
    expect(putInput.Item.requestedBy.S).toBe('user1');
    expect(putInput.Item.status.S).toBe('pending');
  });

  it('should include teamId when provided', async () => {
    mockDdbSend.mockResolvedValueOnce({});

    await invoke(
      makeEvent({
        body: JSON.stringify({
          skillId: 'skill-456',
          skillName: 'Code Review',
          source: 'npm',
          requestedBy: 'user2',
          teamId: 'team-abc',
        }),
      }),
    );

    const putInput = mockDdbSend.mock.calls[0][0].input;
    expect(putInput.Item.teamId.S).toBe('team-abc');
  });

  it('should set teamId to empty string when not provided', async () => {
    mockDdbSend.mockResolvedValueOnce({});

    await invoke(
      makeEvent({
        body: JSON.stringify({
          skillId: 'skill-789',
          skillName: 'Test Skill',
          source: 'custom',
          requestedBy: 'user3',
        }),
      }),
    );

    const putInput = mockDdbSend.mock.calls[0][0].input;
    expect(putInput.Item.teamId.S).toBe('');
  });

  it('should return 500 on DynamoDB error', async () => {
    mockDdbSend.mockRejectedValueOnce(new Error('DDB error'));
    const res = await invoke(
      makeEvent({
        body: JSON.stringify({
          skillId: 's1',
          skillName: 'test',
          source: 'hub',
          requestedBy: 'user1',
        }),
      }),
    );
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).message).toBe('DDB error');
  });
});
