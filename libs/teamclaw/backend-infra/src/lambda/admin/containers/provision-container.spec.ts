const mockSend = jest.fn();

jest.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: jest.fn(() => ({ send: mockSend })),
  InvokeCommand: jest.fn((input: any) => ({ input })),
}));

process.env['LIFECYCLE_LAMBDA_NAME'] = 'lifecycle-fn';

import { handler } from './provision-container';

const makeEvent = (overrides: any = {}) => ({
  queryStringParameters: null,
  pathParameters: null,
  body: null,
  headers: {},
  requestContext: {} as any,
  ...overrides,
});

describe('provision-container handler', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return 400 when userId is missing', async () => {
    const res = await handler(makeEvent());
    expect(res.statusCode).toBe(400);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
  });

  it('should invoke lifecycle Lambda with provision action', async () => {
    mockSend.mockResolvedValueOnce({
      Payload: Buffer.from(JSON.stringify({ statusCode: 200, body: '{}' })),
    });

    const res = await handler(makeEvent({ pathParameters: { userId: 'u1' } }));
    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(Buffer.from(mockSend.mock.calls[0][0].input.Payload).toString());
    expect(payload.action).toBe('provision');
    expect(payload.userId).toBe('u1');
  });

  it('should include teamId when provided in body', async () => {
    mockSend.mockResolvedValueOnce({
      Payload: Buffer.from(JSON.stringify({ statusCode: 200, body: '{}' })),
    });

    await handler(
      makeEvent({ pathParameters: { userId: 'u1' }, body: JSON.stringify({ teamId: 't1' }) }),
    );

    const payload = JSON.parse(Buffer.from(mockSend.mock.calls[0][0].input.Payload).toString());
    expect(payload.teamId).toBe('t1');
  });

  it('should not include teamId when not provided', async () => {
    mockSend.mockResolvedValueOnce({
      Payload: Buffer.from(JSON.stringify({ statusCode: 200, body: '{}' })),
    });

    await handler(makeEvent({ pathParameters: { userId: 'u1' } }));
    const payload = JSON.parse(Buffer.from(mockSend.mock.calls[0][0].input.Payload).toString());
    expect(payload.teamId).toBeUndefined();
  });

  it('should return 500 on Lambda error', async () => {
    mockSend.mockRejectedValueOnce(new Error('Lambda error'));
    const res = await handler(makeEvent({ pathParameters: { userId: 'u1' } }));
    expect(res.statusCode).toBe(500);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
  });
});
