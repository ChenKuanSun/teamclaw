const mockSend = jest.fn();

jest.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: jest.fn(() => ({ send: mockSend })),
  InvokeCommand: jest.fn((input: any) => ({ input })),
}));

jest.mock('@TeamClaw/teamclaw/cloud-function', () => {
  const actual = jest.requireActual('@TeamClaw/teamclaw/cloud-function');
  return {
    ...actual,
    adminLambdaHandlerDecorator: (_method: string, fn: any) => {
      return async (event: any, _context: any) => {
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

process.env['LIFECYCLE_LAMBDA_NAME'] = 'lifecycle-fn';
process.env['DEPLOY_ENV'] = 'dev';

import { handler } from './provision-container';

const makeEvent = (overrides: any = {}) => ({
  queryStringParameters: null,
  pathParameters: null,
  body: null,
  headers: {},
  requestContext: {} as any,
  ...overrides,
});

const invoke = async (event = makeEvent()) =>
  handler(event, {} as any) as Promise<{ statusCode: number; headers: any; body: string }>;

describe('provision-container handler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return 400 when userId is missing', async () => {
    const res = await invoke();
    expect(res.statusCode).toBe(400);
  });

  it('should invoke lifecycle Lambda with provision action', async () => {
    mockSend.mockResolvedValueOnce({
      Payload: Buffer.from(JSON.stringify({ statusCode: 200, body: '{}' })),
    });

    const res = await invoke(makeEvent({ pathParameters: { userId: 'u1' } }));
    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(Buffer.from(mockSend.mock.calls[0][0].input.Payload).toString());
    expect(payload.action).toBe('provision');
    expect(payload.userId).toBe('u1');
  });

  it('should include teamId when provided in body', async () => {
    mockSend.mockResolvedValueOnce({
      Payload: Buffer.from(JSON.stringify({ statusCode: 200, body: '{}' })),
    });

    await invoke(
      makeEvent({ pathParameters: { userId: 'u1' }, body: JSON.stringify({ teamId: 't1' }) }),
    );

    const payload = JSON.parse(Buffer.from(mockSend.mock.calls[0][0].input.Payload).toString());
    expect(payload.teamId).toBe('t1');
  });

  it('should not include teamId when not provided', async () => {
    mockSend.mockResolvedValueOnce({
      Payload: Buffer.from(JSON.stringify({ statusCode: 200, body: '{}' })),
    });

    await invoke(makeEvent({ pathParameters: { userId: 'u1' } }));
    const payload = JSON.parse(Buffer.from(mockSend.mock.calls[0][0].input.Payload).toString());
    expect(payload.teamId).toBeUndefined();
  });

  it('should return 500 on Lambda error', async () => {
    mockSend.mockRejectedValueOnce(new Error('Lambda error'));
    const res = await invoke(makeEvent({ pathParameters: { userId: 'u1' } }));
    expect(res.statusCode).toBe(500);
  });
});
