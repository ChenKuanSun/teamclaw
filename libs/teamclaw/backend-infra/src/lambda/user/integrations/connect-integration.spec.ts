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

const mockDdbSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({ send: mockDdbSend })),
  GetItemCommand: jest.fn((input: any) => ({ input })),
}));

const mockGetCatalogEntry = jest.fn();
const mockCheckUserOverrideAllowed = jest.fn();
const mockSetUserCredential = jest.fn();

jest.mock('../../admin/integrations/catalog-seed', () => ({
  getCatalogEntry: (...args: any[]) => mockGetCatalogEntry(...args),
}));

jest.mock('../../admin/integrations/integrations-core', () => ({
  checkUserOverrideAllowed: (...args: any[]) =>
    mockCheckUserOverrideAllowed(...args),
  setUserCredential: (...args: any[]) => mockSetUserCredential(...args),
}));

process.env['INTEGRATIONS_TABLE_NAME'] = 'IntegrationsTable';
process.env['DEPLOY_ENV'] = 'prod';
process.env['USERS_TABLE_NAME'] = 'UsersTable';

import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  Context,
} from 'aws-lambda';
import { handler } from './connect-integration';

const makeEvent = (
  overrides: Partial<APIGatewayProxyEventV2WithJWTAuthorizer> = {},
): APIGatewayProxyEventV2WithJWTAuthorizer =>
  ({
    version: '2.0',
    routeKey: 'POST /user/integrations/{integrationId}/connect',
    rawPath: '/user/integrations/github/connect',
    rawQueryString: '',
    headers: {},
    requestContext: {
      http: {
        method: 'POST',
        path: '/user/integrations/github/connect',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test',
      },
      accountId: '123456789012',
      apiId: 'test',
      domainName: 'test',
      domainPrefix: 'test',
      requestId: 'test',
      routeKey: 'POST /user/integrations/{integrationId}/connect',
      stage: '$default',
      time: '01/Jan/2026:00:00:00 +0000',
      timeEpoch: 0,
      authorizer: { jwt: { claims: { sub: 'user-1' }, scopes: [] } },
    },
    pathParameters: { integrationId: 'github' },
    queryStringParameters: null,
    body: JSON.stringify({ credentials: { token: 'ghp_user123' } }),
    isBase64Encoded: false,
    ...overrides,
  }) as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;

const invoke = async (event = makeEvent()) =>
  (await (handler as any)(event, {} as Context)) as {
    statusCode: number;
    headers: any;
    body: string;
  };

describe('connect-integration handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCatalogEntry.mockReturnValue({
      integrationId: 'github',
      displayName: 'GitHub',
    });
    mockCheckUserOverrideAllowed.mockResolvedValue({ allowed: true });
    mockSetUserCredential.mockResolvedValue(undefined);
    mockDdbSend.mockResolvedValue({
      Item: { userId: { S: 'user-1' }, teamId: { S: 'team-1' } },
    });
  });

  it('should return 400 when sub is missing', async () => {
    const res = await invoke(
      makeEvent({
        requestContext: {
          http: {
            method: 'POST',
            path: '/user/integrations/github/connect',
            protocol: 'HTTP/1.1',
            sourceIp: '127.0.0.1',
            userAgent: 'test',
          },
          accountId: '123456789012',
          apiId: 'test',
          domainName: 'test',
          domainPrefix: 'test',
          requestId: 'test',
          routeKey: 'POST /user/integrations/{integrationId}/connect',
          stage: '$default',
          time: '01/Jan/2026:00:00:00 +0000',
          timeEpoch: 0,
          authorizer: { jwt: { claims: {}, scopes: [] } },
        } as any,
      }),
    );
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain('Missing sub');
  });

  it('should return 400 when integrationId is missing', async () => {
    const res = await invoke(makeEvent({ pathParameters: undefined }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain(
      'integrationId path parameter is required',
    );
  });

  it('should return 400 for unknown integration', async () => {
    mockGetCatalogEntry.mockReturnValue(undefined);

    const res = await invoke(
      makeEvent({ pathParameters: { integrationId: 'unknown' } }),
    );
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain('Unknown integration');
  });

  it('should return 400 when credentials is missing', async () => {
    const res = await invoke(makeEvent({ body: JSON.stringify({}) }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain(
      'credentials object is required',
    );
  });

  it('should return 400 when body is null', async () => {
    const res = await invoke(makeEvent({ body: undefined as any }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain(
      'credentials object is required',
    );
  });

  it('should return 403 when user override is not allowed', async () => {
    mockCheckUserOverrideAllowed.mockResolvedValueOnce({
      allowed: false,
      reason: 'User override is not allowed for this integration',
    });

    const res = await invoke();
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).message).toContain('not allowed');
  });

  it('should return 200 on successful connection', async () => {
    const res = await invoke();
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.message).toContain('Integration connected');
    expect(body.integrationId).toBe('github');
    expect(mockSetUserCredential).toHaveBeenCalledWith('github', 'user-1', {
      token: 'ghp_user123',
    });
  });

  it('should resolve teamId from users table', async () => {
    mockDdbSend.mockResolvedValueOnce({
      Item: { userId: { S: 'user-1' }, teamId: { S: 'team-42' } },
    });

    await invoke();
    expect(mockCheckUserOverrideAllowed).toHaveBeenCalledWith(
      'github',
      'team-42',
    );
  });

  it('should pass undefined teamId when user has no team', async () => {
    mockDdbSend.mockResolvedValueOnce({ Item: { userId: { S: 'user-1' } } });

    await invoke();
    expect(mockCheckUserOverrideAllowed).toHaveBeenCalledWith(
      'github',
      undefined,
    );
  });

  it('should return 500 when setUserCredential throws', async () => {
    mockSetUserCredential.mockRejectedValueOnce(new Error('SM error'));

    const res = await invoke();
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).message).toBe('SM error');
  });
});
