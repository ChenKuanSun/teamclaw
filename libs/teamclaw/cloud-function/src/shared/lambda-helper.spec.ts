import { validateRequiredEnvVars, sanitizeErrorMessage } from './lambda-helper';

describe('validateRequiredEnvVars', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should pass when all required vars are present', () => {
    process.env['FOO'] = 'bar';
    process.env['BAZ'] = 'qux';

    expect(() => validateRequiredEnvVars(['FOO', 'BAZ'])).not.toThrow();
  });

  it('should throw with missing var names when vars are missing', () => {
    process.env['FOO'] = 'bar';
    delete process.env['MISSING_ONE'];
    delete process.env['MISSING_TWO'];

    expect(() => validateRequiredEnvVars(['FOO', 'MISSING_ONE', 'MISSING_TWO'])).toThrow(
      'Missing required environment variables: MISSING_ONE, MISSING_TWO',
    );
  });
});

describe('sanitizeErrorMessage', () => {
  it('should replace AWS ARN patterns', () => {
    const msg = 'Error with arn:aws:lambda:us-east-1:123456789012:function:myFunc';
    const result = sanitizeErrorMessage(msg);

    expect(result).not.toContain('arn:aws:');
    expect(result).toContain('[AWS_ARN]');
  });

  it('should replace 12-digit account IDs', () => {
    const msg = 'Account 123456789012 not found';
    const result = sanitizeErrorMessage(msg);

    expect(result).not.toContain('123456789012');
    expect(result).toContain('[ACCOUNT_ID]');
  });

  it('should replace AWS access keys (AKIA...)', () => {
    const msg = 'Key AKIAIOSFODNN7EXAMPLE is invalid';
    const result = sanitizeErrorMessage(msg);

    expect(result).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(result).toContain('[AWS_KEY]');
  });

  it('should preserve normal error messages', () => {
    const msg = 'Something went wrong with the request';
    const result = sanitizeErrorMessage(msg);

    expect(result).toBe('Something went wrong with the request');
  });
});
