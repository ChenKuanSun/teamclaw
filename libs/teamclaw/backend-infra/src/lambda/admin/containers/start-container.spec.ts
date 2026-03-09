const mockSend = jest.fn();

jest.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: jest.fn(() => ({ send: mockSend })),
  InvokeCommand: jest.fn((input: any) => ({ input })),
}));

process.env['LIFECYCLE_LAMBDA_NAME'] = 'lifecycle-fn';

import { handler } from './start-container';

const makeEvent = (overrides: any = {}) => ({
  queryStringParameters: null,
  pathParameters: null,
  body: null,
  headers: {},
  requestContext: {} as any,
  ...overrides,
});

describe('start-container handler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return 400 when userId is missing', async () => {
    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(400);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
  });

  it('should invoke lifecycle Lambda with start action', async () => {
    const lifecycleResponse = {
      statusCode: 200,
      body: JSON.stringify({ message: 'Container started' }),
    };
    mockSend.mockResolvedValueOnce({
      Payload: Buffer.from(JSON.stringify(lifecycleResponse)),
    });

    const res = await handler(makeEvent({ pathParameters: { userId: 'u1' } }));
    expect(res.statusCode).toBe(200);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
    const cmd = mockSend.mock.calls[0][0];
    const payload = JSON.parse(Buffer.from(cmd.input.Payload).toString());
    expect(payload.action).toBe('start');
    expect(payload.userId).toBe('u1');
  });

  it('should forward lifecycle Lambda status code', async () => {
    mockSend.mockResolvedValueOnce({
      Payload: Buffer.from(JSON.stringify({ statusCode: 409, body: '{}' })),
    });
    const res = await handler(makeEvent({ pathParameters: { userId: 'u1' } }));
    expect(res.statusCode).toBe(409);
  });

  it('should handle empty Payload', async () => {
    mockSend.mockResolvedValueOnce({ Payload: undefined });
    const res = await handler(makeEvent({ pathParameters: { userId: 'u1' } }));
    expect(res.statusCode).toBe(200);
  });

  it('should return 500 on Lambda invocation error', async () => {
    mockSend.mockRejectedValueOnce(new Error('Lambda error'));
    const res = await handler(makeEvent({ pathParameters: { userId: 'u1' } }));
    expect(res.statusCode).toBe(500);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
  });
});
