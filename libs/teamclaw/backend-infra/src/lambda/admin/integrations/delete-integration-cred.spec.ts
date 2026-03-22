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

const mockDeleteGlobalCredential = jest.fn();

jest.mock('./integrations-core', () => ({
  deleteGlobalCredential: (...args: any[]) =>
    mockDeleteGlobalCredential(...args),
}));

process.env['INTEGRATIONS_TABLE_NAME'] = 'IntegrationsTable';
process.env['DEPLOY_ENV'] = 'prod';

import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  Context,
} from 'aws-lambda';
import { handler } from './delete-integration-cred';

const makeEvent = (
  overrides: Partial<APIGatewayProxyEventV2WithJWTAuthorizer> = {},
): APIGatewayProxyEventV2WithJWTAuthorizer =>
  ({
    version: '2.0',
    routeKey: 'DELETE /admin/integrations/{integrationId}',
    rawPath: '/admin/integrations/github',
    rawQueryString: '',
    headers: {},
    requestContext: {
      http: {
        method: 'DELETE',
        path: '/admin/integrations/github',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test',
      },
      accountId: '123456789012',
      apiId: 'test',
      domainName: 'test',
      domainPrefix: 'test',
      requestId: 'test',
      routeKey: 'DELETE /admin/integrations/{integrationId}',
      stage: '$default',
      time: '01/Jan/2026:00:00:00 +0000',
      timeEpoch: 0,
      authorizer: { jwt: { claims: { sub: 'admin-user' }, scopes: [] } },
    },
    pathParameters: { integrationId: 'github' },
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

describe('delete-integration-cred handler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return 400 when integrationId is missing', async () => {
    const res = await invoke(makeEvent({ pathParameters: undefined }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toContain(
      'integrationId path parameter is required',
    );
  });

  it('should return 200 on successful deletion', async () => {
    mockDeleteGlobalCredential.mockResolvedValueOnce(undefined);

    const res = await invoke();
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.message).toContain('credentials deleted');
    expect(body.integrationId).toBe('github');
    expect(mockDeleteGlobalCredential).toHaveBeenCalledWith('github');
  });

  it('should return 500 when deleteGlobalCredential throws', async () => {
    mockDeleteGlobalCredential.mockRejectedValueOnce(new Error('SM error'));

    const res = await invoke();
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).message).toBe('SM error');
  });
});
