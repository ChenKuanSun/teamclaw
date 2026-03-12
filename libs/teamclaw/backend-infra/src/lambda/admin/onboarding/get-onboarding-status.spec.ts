const mockDdbSend = jest.fn();
const mockSmSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({ send: mockDdbSend })),
  ScanCommand: jest.fn((input: any) => ({ input })),
  QueryCommand: jest.fn((input: any) => ({ input })),
}));

jest.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: jest.fn(() => ({ send: mockSmSend })),
  GetSecretValueCommand: jest.fn((input: any) => ({ input })),
}));

jest.mock('@TeamClaw/teamclaw/cloud-function', () => {
  const actual = jest.requireActual('@TeamClaw/teamclaw/cloud-function');
  return {
    ...actual,
    adminLambdaHandlerDecorator: (method: string, fn: any) => {
      return async (event: any, context: any) => {
        const input = {
          raw: event,
          queryStringParameters: event.queryStringParameters,
          pathParameters: event.pathParameters,
        };
        const result = await fn(input);
        return {
          statusCode: result.status,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: JSON.stringify(result.body),
        };
      };
    },
    validateRequiredEnvVars: jest.fn(),
  };
});

process.env['TEAMS_TABLE_NAME'] = 'TeamsTable';
process.env['CONFIG_TABLE_NAME'] = 'ConfigTable';
process.env['API_KEYS_SECRET_ARN'] = 'arn:aws:secretsmanager:us-west-1:123:secret:test';

import { handler } from './get-onboarding-status';
import type { Context } from 'aws-lambda';

const makeEvent = () => ({
  version: '2.0',
  routeKey: 'GET /admin/onboarding/status',
  rawPath: '/admin/onboarding/status',
  rawQueryString: '',
  headers: {},
  requestContext: {
    http: { method: 'GET', path: '/admin/onboarding/status', protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'test' },
    accountId: '123', apiId: 'test', domainName: 'test', domainPrefix: 'test',
    requestId: 'test', routeKey: 'GET /admin/onboarding/status', stage: '$default',
    time: '01/Jan/2026:00:00:00 +0000', timeEpoch: 0,
    authorizer: { jwt: { claims: { sub: 'admin-1' }, scopes: [] } },
  },
  isBase64Encoded: false,
});

const invoke = async () =>
  (await (handler as any)(makeEvent(), {} as Context)) as { statusCode: number; body: string };

describe('get-onboarding-status', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return complete: true when all steps are done', async () => {
    mockSmSend.mockResolvedValueOnce({
      SecretString: JSON.stringify({ anthropic: ['sk-test'] }),
    });
    mockDdbSend.mockResolvedValueOnce({ Count: 1 });
    mockDdbSend.mockResolvedValueOnce({
      Items: [
        { configKey: { S: 'allowedDomains' }, value: { S: '["company.com"]' } },
        { configKey: { S: 'defaultTeamId' }, value: { S: '"team-1"' } },
      ],
    });

    const res = await invoke();
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.complete).toBe(true);
    expect(body.steps.apiKey).toBe(true);
    expect(body.steps.team).toBe(true);
    expect(body.steps.allowedDomains).toBe(true);
    expect(body.steps.defaultTeamId).toBe(true);
  });

  it('should return complete: false when no API keys', async () => {
    mockSmSend.mockResolvedValueOnce({ SecretString: '{}' });
    mockDdbSend.mockResolvedValueOnce({ Count: 0 });
    mockDdbSend.mockResolvedValueOnce({ Items: [] });

    const res = await invoke();
    const body = JSON.parse(res.body);
    expect(body.complete).toBe(false);
    expect(body.steps.apiKey).toBe(false);
  });

  it('should handle Secrets Manager error gracefully', async () => {
    mockSmSend.mockRejectedValueOnce(new Error('Access denied'));
    mockDdbSend.mockResolvedValueOnce({ Count: 0 });
    mockDdbSend.mockResolvedValueOnce({ Items: [] });

    const res = await invoke();
    const body = JSON.parse(res.body);
    expect(body.steps.apiKey).toBe(false);
  });
});
