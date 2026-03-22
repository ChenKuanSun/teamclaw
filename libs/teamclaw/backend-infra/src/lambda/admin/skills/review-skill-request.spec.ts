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
import { handler } from './review-skill-request';

const makeEvent = (
  overrides: Partial<APIGatewayProxyEventV2WithJWTAuthorizer> = {},
): APIGatewayProxyEventV2WithJWTAuthorizer =>
  ({
    version: '2.0',
    routeKey: 'POST /admin/skills/review',
    rawPath: '/admin/skills/review',
    rawQueryString: '',
    headers: {},
    requestContext: {
      http: {
        method: 'POST',
        path: '/admin/skills/review',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test',
      },
      accountId: '123456789012',
      apiId: 'test',
      domainName: 'test',
      domainPrefix: 'test',
      requestId: 'test',
      routeKey: 'POST /admin/skills/review',
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

const validBody = {
  skillId: 'skill-123',
  requestedBy: 'user1',
  decision: 'approved',
  reviewedBy: 'admin1',
  scope: 'global',
};

describe('review-skill-request handler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return 400 when skillId is missing', async () => {
    const { skillId, ...rest } = validBody;
    const res = await invoke(makeEvent({ body: JSON.stringify(rest) }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain('Missing required fields');
  });

  it('should return 400 when requestedBy is missing', async () => {
    const { requestedBy, ...rest } = validBody;
    const res = await invoke(makeEvent({ body: JSON.stringify(rest) }));
    expect(res.statusCode).toBe(400);
  });

  it('should return 400 when decision is missing', async () => {
    const { decision, ...rest } = validBody;
    const res = await invoke(makeEvent({ body: JSON.stringify(rest) }));
    expect(res.statusCode).toBe(400);
  });

  it('should return 400 when reviewedBy is missing', async () => {
    const { reviewedBy, ...rest } = validBody;
    const res = await invoke(makeEvent({ body: JSON.stringify(rest) }));
    expect(res.statusCode).toBe(400);
  });

  it('should return 400 when scope is missing', async () => {
    const { scope, ...rest } = validBody;
    const res = await invoke(makeEvent({ body: JSON.stringify(rest) }));
    expect(res.statusCode).toBe(400);
  });

  it('should return 400 when body is empty', async () => {
    const res = await invoke(makeEvent());
    expect(res.statusCode).toBe(400);
  });

  it('should return 400 for invalid decision value', async () => {
    const res = await invoke(
      makeEvent({
        body: JSON.stringify({ ...validBody, decision: 'maybe' }),
      }),
    );
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain('decision must be');
  });

  it('should return 400 for invalid scope value', async () => {
    const res = await invoke(
      makeEvent({
        body: JSON.stringify({ ...validBody, scope: 'organization' }),
      }),
    );
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain('scope must be');
  });

  it('should approve a skill request', async () => {
    mockDdbSend.mockResolvedValueOnce({});

    const res = await invoke(
      makeEvent({
        body: JSON.stringify(validBody),
      }),
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('approved');
    expect(body.skillId).toBe('skill-123');
    expect(mockDdbSend).toHaveBeenCalledTimes(1);

    const updateInput = mockDdbSend.mock.calls[0][0].input;
    expect(updateInput.TableName).toBe('SkillsTable');
    expect(updateInput.Key.skillId.S).toBe('skill-123');
    expect(updateInput.Key.requestedBy.S).toBe('user1');
    expect(updateInput.ExpressionAttributeValues[':status'].S).toBe('approved');
    expect(updateInput.ExpressionAttributeValues[':scope'].S).toBe('global');
  });

  it('should reject a skill request', async () => {
    mockDdbSend.mockResolvedValueOnce({});

    const res = await invoke(
      makeEvent({
        body: JSON.stringify({
          ...validBody,
          decision: 'rejected',
          scope: 'team',
        }),
      }),
    );

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('rejected');

    const updateInput = mockDdbSend.mock.calls[0][0].input;
    expect(updateInput.ExpressionAttributeValues[':status'].S).toBe('rejected');
    expect(updateInput.ExpressionAttributeValues[':scope'].S).toBe('team');
  });

  it('should accept user scope', async () => {
    mockDdbSend.mockResolvedValueOnce({});

    const res = await invoke(
      makeEvent({
        body: JSON.stringify({ ...validBody, scope: 'user' }),
      }),
    );

    expect(res.statusCode).toBe(200);
  });

  it('should return 500 on DynamoDB error', async () => {
    mockDdbSend.mockRejectedValueOnce(new Error('DDB error'));
    const res = await invoke(
      makeEvent({
        body: JSON.stringify(validBody),
      }),
    );
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).message).toBe('DDB error');
  });
});
