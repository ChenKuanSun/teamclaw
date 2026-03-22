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
import { handler } from './list-approved-skills';

const makeEvent = (
  overrides: Partial<APIGatewayProxyEventV2WithJWTAuthorizer> = {},
): APIGatewayProxyEventV2WithJWTAuthorizer =>
  ({
    version: '2.0',
    routeKey: 'GET /admin/skills/approved',
    rawPath: '/admin/skills/approved',
    rawQueryString: '',
    headers: {},
    requestContext: {
      http: {
        method: 'GET',
        path: '/admin/skills/approved',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test',
      },
      accountId: '123456789012',
      apiId: 'test',
      domainName: 'test',
      domainPrefix: 'test',
      requestId: 'test',
      routeKey: 'GET /admin/skills/approved',
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

describe('list-approved-skills handler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return empty list when no approved skills', async () => {
    mockDdbSend.mockResolvedValueOnce({ Items: [] });

    const res = await invoke();
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.skills).toEqual([]);
  });

  it('should return approved skills with mapped fields', async () => {
    mockDdbSend.mockResolvedValueOnce({
      Items: [
        {
          skillId: { S: 'skill-1' },
          skillName: { S: 'Web Search' },
          source: { S: 'hub' },
          scope: { S: 'global' },
          reviewedAt: { S: '2026-03-01T12:00:00.000Z' },
        },
        {
          skillId: { S: 'skill-2' },
          skillName: { S: 'Code Review' },
          source: { S: 'npm' },
          scope: { S: 'team' },
          reviewedAt: { S: '2026-03-02T12:00:00.000Z' },
        },
      ],
    });

    const res = await invoke();
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.skills).toHaveLength(2);
    expect(body.skills[0]).toEqual({
      skillId: 'skill-1',
      skillName: 'Web Search',
      source: 'hub',
      scope: 'global',
      approvedAt: '2026-03-01T12:00:00.000Z',
    });
    expect(body.skills[1].scope).toBe('team');
  });

  it('should query the by-status GSI with approved filter', async () => {
    mockDdbSend.mockResolvedValueOnce({ Items: [] });

    await invoke();

    const queryInput = mockDdbSend.mock.calls[0][0].input;
    expect(queryInput.TableName).toBe('SkillsTable');
    expect(queryInput.IndexName).toBe('by-status');
    expect(queryInput.ExpressionAttributeValues[':approved'].S).toBe(
      'approved',
    );
  });

  it('should handle undefined Items from DynamoDB', async () => {
    mockDdbSend.mockResolvedValueOnce({ Items: undefined });

    const res = await invoke();
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.skills).toEqual([]);
  });

  it('should return 500 on DynamoDB error', async () => {
    mockDdbSend.mockRejectedValueOnce(new Error('DDB error'));
    const res = await invoke();
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).message).toBe('DDB error');
  });
});
