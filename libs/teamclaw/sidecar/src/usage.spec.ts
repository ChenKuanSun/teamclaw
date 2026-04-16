/**
 * Tests for libs/teamclaw/sidecar/src/usage.ts
 *
 * Covers: logUsage — success, DynamoDB error (fire-and-forget), TTL, env var defaults.
 */

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => {
  const actual = jest.requireActual('@aws-sdk/client-dynamodb');
  return {
    ...actual,
    DynamoDBClient: jest.fn().mockImplementation(() => ({ send: mockSend })),
  };
});

function freshImport() {
  return require('./usage') as typeof import('./usage');
}

beforeEach(() => {
  jest.resetModules();
  mockSend.mockReset();
  process.env['USAGE_TABLE_NAME'] = 'test-usage-table';
  process.env['USER_ID'] = 'user-42';
});

afterEach(() => {
  delete process.env['USAGE_TABLE_NAME'];
  delete process.env['USER_ID'];
});

describe('logUsage', () => {
  it('sends a PutItem to DynamoDB with correct fields', async () => {
    mockSend.mockResolvedValue({});
    const { PutItemCommand } = require('@aws-sdk/client-dynamodb');

    const { logUsage } = freshImport();
    await logUsage('anthropic', 'claude-sonnet-4-20250514');

    expect(mockSend).toHaveBeenCalledTimes(1);
    const call = mockSend.mock.calls[0][0];
    expect(call).toBeInstanceOf(PutItemCommand);

    const item = call.input.Item;
    expect(call.input.TableName).toBe('test-usage-table');
    expect(item.userId.S).toBe('user-42');
    expect(item.provider.S).toBe('anthropic');
    expect(item.model.S).toBe('claude-sonnet-4-20250514');
    expect(item.timestamp.S).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(Number(item.ttl.N)).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('computes TTL as ~90 days from now', async () => {
    mockSend.mockResolvedValue({});

    const { logUsage } = freshImport();
    const before = Math.floor(Date.now() / 1000);
    await logUsage('openai', 'gpt-4o');
    const after = Math.floor(Date.now() / 1000);

    const item = mockSend.mock.calls[0][0].input.Item;
    const ttl = Number(item.ttl.N);
    const ninetyDays = 90 * 24 * 60 * 60;

    expect(ttl).toBeGreaterThanOrEqual(before + ninetyDays);
    expect(ttl).toBeLessThanOrEqual(after + ninetyDays);
  });

  it('does not throw when DynamoDB fails (fire-and-forget)', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation();
    mockSend.mockRejectedValue(new Error('DynamoDB is down'));

    const { logUsage } = freshImport();

    await expect(
      logUsage('anthropic', 'claude-sonnet-4-20250514'),
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Usage log failed'),
      expect.any(Error),
    );
  });

  it('skips logging when USAGE_TABLE_NAME is not set', async () => {
    delete process.env['USAGE_TABLE_NAME'];

    const { logUsage } = freshImport();
    await logUsage('anthropic', 'claude-sonnet-4-20250514');

    expect(mockSend).not.toHaveBeenCalled();
  });

  it('defaults USER_ID to "unknown" when env var is absent', async () => {
    delete process.env['USER_ID'];
    mockSend.mockResolvedValue({});

    const { logUsage } = freshImport();
    await logUsage('anthropic', 'claude-sonnet-4-20250514');

    const item = mockSend.mock.calls[0][0].input.Item;
    expect(item.userId.S).toBe('unknown');
  });

  it('appends random suffix to timestamp for uniqueness', async () => {
    mockSend.mockResolvedValue({});

    const { logUsage } = freshImport();
    await logUsage('anthropic', 'model-a');
    await logUsage('anthropic', 'model-b');

    const ts1 = mockSend.mock.calls[0][0].input.Item.timestamp.S;
    const ts2 = mockSend.mock.calls[1][0].input.Item.timestamp.S;

    // Both should have random suffix after ISO timestamp
    expect(ts1).toMatch(/-[a-z0-9]+$/);
    expect(ts2).toMatch(/-[a-z0-9]+$/);
    // Overwhelmingly likely to differ
    expect(ts1).not.toBe(ts2);
  });

  it('omits downgradeReason attribute when no meta is passed (backwards compat)', async () => {
    mockSend.mockResolvedValue({});

    const { logUsage } = freshImport();
    await logUsage('anthropic', 'claude-sonnet-4-20250514');

    const item = mockSend.mock.calls[0][0].input.Item;
    expect(item.downgradeReason).toBeUndefined();
  });

  it('omits downgradeReason attribute when meta is an empty object', async () => {
    mockSend.mockResolvedValue({});

    const { logUsage } = freshImport();
    await logUsage('anthropic', 'claude-sonnet-4-20250514', {});

    expect(mockSend).toHaveBeenCalledTimes(1);
    const item = mockSend.mock.calls[0][0].input.Item;
    expect(item.downgradeReason).toBeUndefined();
  });

  it('records downgradeReason in the DDB item when meta.downgradeReason is set', async () => {
    mockSend.mockResolvedValue({});

    const { logUsage } = freshImport();
    await logUsage('anthropic', 'claude-sonnet-4-20250514', {
      downgradeReason: 'oauth-no-1m',
    });

    expect(mockSend).toHaveBeenCalledTimes(1);
    const item = mockSend.mock.calls[0][0].input.Item;
    expect(item.downgradeReason).toEqual({ S: 'oauth-no-1m' });
    // Existing attributes still present
    expect(item.provider.S).toBe('anthropic');
    expect(item.model.S).toBe('claude-sonnet-4-20250514');
  });
});
