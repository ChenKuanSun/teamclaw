const fs = require('fs');

const {
  PROXY_PROVIDERS,
  OAUTH_PROVIDERS,
  FAKE_OAUTH_KEY,
  FAKE_API_KEY,
  SIDECAR_URL,
  buildProviders,
  buildBaseConfig,
  layerBootstrapFile,
  deepMerge,
  loadIntegrationCredentials,
  main,
} = require('./generate-config');

describe('buildProviders', () => {
  const providers = buildProviders();

  it('returns a provider entry for each PROXY_PROVIDERS id', () => {
    expect(Object.keys(providers).sort()).toEqual([...PROXY_PROVIDERS].sort());
    expect(PROXY_PROVIDERS.length).toBe(12);
  });

  it('wires every provider baseUrl through the sidecar at http://localhost:3000/<id>', () => {
    for (const id of PROXY_PROVIDERS) {
      expect(providers[id].baseUrl).toBe(`${SIDECAR_URL}/${id}`);
    }
  });

  it('sets request.allowPrivateNetwork: true on every provider', () => {
    for (const id of PROXY_PROVIDERS) {
      expect(providers[id].request.allowPrivateNetwork).toBe(true);
    }
  });

  it('gives anthropic-token the OAuth fake key (contains sk-ant-oat)', () => {
    expect(OAUTH_PROVIDERS.has('anthropic-token')).toBe(true);
    expect(providers['anthropic-token'].apiKey).toBe(FAKE_OAUTH_KEY);
    expect(providers['anthropic-token'].apiKey).toContain('sk-ant-oat');
  });

  it('gives anthropic a plain fake API key (must NOT contain sk-ant-oat, required for 1M context)', () => {
    expect(providers.anthropic.apiKey).toBe(FAKE_API_KEY);
    expect(providers.anthropic.apiKey).not.toContain('sk-ant-oat');
  });

  it('gives all non-OAuth providers the plain fake API key', () => {
    for (const id of PROXY_PROVIDERS) {
      if (OAUTH_PROVIDERS.has(id)) continue;
      expect(providers[id].apiKey).toBe(FAKE_API_KEY);
      expect(providers[id].apiKey).not.toContain('sk-ant-oat');
    }
  });

  it('returns models as an empty array on every provider (upstream fetches at runtime)', () => {
    for (const id of PROXY_PROVIDERS) {
      expect(providers[id].models).toEqual([]);
    }
  });
});

describe('buildBaseConfig', () => {
  const providers = buildProviders();

  it('sets the HSTS security header', () => {
    const cfg = buildBaseConfig({ providers, allowedOrigins: '', allowHostHeaderFallback: false, teamId: '', userId: 'u1' });
    expect(cfg.gateway.http.securityHeaders.strictTransportSecurity).toBe(
      'max-age=31536000; includeSubDomains'
    );
  });

  it('runs the gateway in trusted-proxy auth mode', () => {
    const cfg = buildBaseConfig({ providers, allowedOrigins: '', allowHostHeaderFallback: false, teamId: '', userId: 'u1' });
    expect(cfg.gateway.auth.mode).toBe('trusted-proxy');
    expect(cfg.gateway.auth.trustedProxy.userHeader).toBe('x-forwarded-for');
  });

  it('scopes DMs per channel-peer so each pair gets an isolated thread', () => {
    const cfg = buildBaseConfig({ providers, allowedOrigins: '', allowHostHeaderFallback: false, teamId: '', userId: 'u1' });
    expect(cfg.session.dmScope).toBe('per-channel-peer');
  });

  it('includes the user skills path when userId is provided', () => {
    const cfg = buildBaseConfig({ providers, allowedOrigins: '', allowHostHeaderFallback: false, teamId: '', userId: 'alice' });
    expect(cfg.skills.load.extraDirs).toContain('/efs/users/alice/user-skills');
    expect(cfg.skills.load.extraDirs).toContain('/efs/system/approved-skills');
  });

  it('includes the team skills path ONLY when teamId is provided', () => {
    const withTeam = buildBaseConfig({ providers, allowedOrigins: '', allowHostHeaderFallback: false, teamId: 'eng', userId: 'alice' });
    expect(withTeam.skills.load.extraDirs).toContain('/efs/teams/eng/team-skills');

    const withoutTeam = buildBaseConfig({ providers, allowedOrigins: '', allowHostHeaderFallback: false, teamId: '', userId: 'alice' });
    expect(withoutTeam.skills.load.extraDirs.some(d => d.startsWith('/efs/teams/'))).toBe(false);
  });

  it('splits allowedOrigins on comma into the allowlist, or empty array if unset', () => {
    const withOrigins = buildBaseConfig({ providers, allowedOrigins: 'https://a.com,https://b.com', allowHostHeaderFallback: false, teamId: '', userId: 'u1' });
    expect(withOrigins.gateway.controlUi.allowedOrigins).toEqual(['https://a.com', 'https://b.com']);

    const noOrigins = buildBaseConfig({ providers, allowedOrigins: '', allowHostHeaderFallback: false, teamId: '', userId: 'u1' });
    expect(noOrigins.gateway.controlUi.allowedOrigins).toEqual([]);
  });

  it('passes the host-header fallback flag through without coercing truthiness', () => {
    const on = buildBaseConfig({ providers, allowedOrigins: '', allowHostHeaderFallback: true, teamId: '', userId: 'u1' });
    expect(on.gateway.controlUi.dangerouslyAllowHostHeaderOriginFallback).toBe(true);

    const off = buildBaseConfig({ providers, allowedOrigins: '', allowHostHeaderFallback: false, teamId: '', userId: 'u1' });
    expect(off.gateway.controlUi.dangerouslyAllowHostHeaderOriginFallback).toBe(false);
  });

  it('defaults the agent to anthropic/claude-sonnet-4-6', () => {
    const cfg = buildBaseConfig({ providers, allowedOrigins: '', allowHostHeaderFallback: false, teamId: '', userId: 'u1' });
    expect(cfg.agents.defaults.model).toBe('anthropic/claude-sonnet-4-6');
  });
});

describe('layerBootstrapFile', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('concatenates system -> team -> user in order', () => {
    const perPath = {
      '/efs/system/SOUL.md': 'SYSTEM',
      '/efs/teams/eng/SOUL.md': 'TEAM',
      '/efs/users/alice/SOUL.md': 'USER',
    };
    jest.spyOn(fs, 'readFileSync').mockImplementation(p => {
      if (perPath[p] !== undefined) return perPath[p];
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    const result = layerBootstrapFile('SOUL.md', { efsRoot: '/efs', teamId: 'eng', userId: 'alice' });
    expect(result).toContain('SYSTEM');
    expect(result).toContain('TEAM');
    expect(result).toContain('USER');
    expect(result.indexOf('SYSTEM')).toBeLessThan(result.indexOf('TEAM'));
    expect(result.indexOf('TEAM')).toBeLessThan(result.indexOf('USER'));
  });

  it('silently skips a missing layer without throwing', () => {
    jest.spyOn(fs, 'readFileSync').mockImplementation(p => {
      if (p === '/efs/system/SOUL.md') return 'SYSTEM';
      if (p === '/efs/users/alice/SOUL.md') return 'USER';
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    const result = layerBootstrapFile('SOUL.md', { efsRoot: '/efs', teamId: 'eng', userId: 'alice' });
    expect(result).toContain('SYSTEM');
    expect(result).toContain('USER');
    expect(result).not.toContain('TEAM');
  });

  it('returns null when every layer is missing', () => {
    jest.spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    const result = layerBootstrapFile('SOUL.md', { efsRoot: '/efs', teamId: 'eng', userId: 'alice' });
    expect(result).toBeNull();
  });

  it('returns null when content is only whitespace', () => {
    jest.spyOn(fs, 'readFileSync').mockImplementation(() => '   \n');
    const result = layerBootstrapFile('SOUL.md', { efsRoot: '/efs', teamId: 'eng', userId: 'alice' });
    expect(result).toBeNull();
  });

  it('omits the team source when teamId is empty', () => {
    const reads = [];
    jest.spyOn(fs, 'readFileSync').mockImplementation(p => {
      reads.push(p);
      return 'x';
    });
    layerBootstrapFile('SOUL.md', { efsRoot: '/efs', teamId: '', userId: 'alice' });
    expect(reads).toEqual(['/efs/system/SOUL.md', '/efs/users/alice/SOUL.md']);
  });
});

describe('deepMerge', () => {
  it('overrides primitives on the target', () => {
    const result = deepMerge({ a: 1, b: 2 }, { b: 99 });
    expect(result).toEqual({ a: 1, b: 99 });
  });

  it('recursively merges nested objects', () => {
    const result = deepMerge({ gateway: { port: 1, auth: { mode: 'x' } } }, { gateway: { auth: { mode: 'y' } } });
    expect(result).toEqual({ gateway: { port: 1, auth: { mode: 'y' } } });
  });

  it('replaces arrays wholesale rather than merging element-wise', () => {
    const result = deepMerge({ list: [1, 2, 3] }, { list: [9] });
    expect(result).toEqual({ list: [9] });
  });
});

describe('loadIntegrationCredentials', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    // Clean env so assertions about set env vars are deterministic.
    for (const k of Object.keys(process.env)) {
      if (k.startsWith('SLACK_') || k.startsWith('GITHUB_') || k.startsWith('JIRA_') || k.startsWith('BAD_')) {
        delete process.env[k];
      }
    }
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...ORIGINAL_ENV };
  });

  function mkClient(sendImpl) {
    return { send: jest.fn(sendImpl) };
  }

  function b64(obj) {
    return Buffer.from(JSON.stringify(obj)).toString('base64');
  }

  it('returns early with no SDK call when env var is absent', async () => {
    const client = mkClient(async () => ({ SecretString: '{}' }));
    await loadIntegrationCredentials(undefined, client);
    expect(client.send).not.toHaveBeenCalled();
  });

  it('catches invalid base64/JSON without throwing', async () => {
    const client = mkClient(async () => ({ SecretString: '{}' }));
    await expect(
      loadIntegrationCredentials('not-valid-base64-json!!!', client)
    ).resolves.toBeUndefined();
  });

  it('falls back to next ARN on ResourceNotFoundException', async () => {
    const calls = [];
    const client = mkClient(async cmd => {
      calls.push(cmd.input.SecretId);
      if (cmd.input.SecretId === 'arn-missing') {
        throw Object.assign(new Error('not found'), { name: 'ResourceNotFoundException' });
      }
      return { SecretString: JSON.stringify({ token: 'xoxb-123' }) };
    });

    await loadIntegrationCredentials(
      b64({ slack: { secretArn: 'arn-missing,arn-present', envVarPrefix: 'SLACK' } }),
      client
    );

    expect(calls).toEqual(['arn-missing', 'arn-present']);
    expect(process.env.SLACK_TOKEN).toBe('xoxb-123');
  });

  it('warns when NO candidate ARN resolves', async () => {
    const client = mkClient(async () => {
      throw Object.assign(new Error('not found'), { name: 'ResourceNotFoundException' });
    });
    await loadIntegrationCredentials(
      b64({ slack: { secretArn: 'arn-a,arn-b', envVarPrefix: 'SLACK' } }),
      client
    );
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('No secret found for integration slack')
    );
  });

  it('sets process.env[PREFIX_FIELD] for each field on success', async () => {
    const client = mkClient(async () => ({
      SecretString: JSON.stringify({ token: 'xoxb-abc', signing_secret: 'shh' }),
    }));
    await loadIntegrationCredentials(
      b64({ slack: { secretArn: 'arn1', envVarPrefix: 'SLACK' } }),
      client
    );
    expect(process.env.SLACK_TOKEN).toBe('xoxb-abc');
    expect(process.env.SLACK_SIGNING_SECRET).toBe('shh');
  });

  it('defaults envVarPrefix to integrationId.toUpperCase() when omitted', async () => {
    const client = mkClient(async () => ({
      SecretString: JSON.stringify({ token: 'gh-abc' }),
    }));
    await loadIntegrationCredentials(
      b64({ github: { secretArn: 'arn1' } }),
      client
    );
    expect(process.env.GITHUB_TOKEN).toBe('gh-abc');
  });

  it('skips env var names that do not match ^[A-Z][A-Z0-9_]*$', async () => {
    const client = mkClient(async () => ({
      // "9bad" produces BAD_9BAD after prefix+upper; leading digit in key makes a
      // key like "bad-key" produce BAD_BAD-KEY (invalid because of -).
      SecretString: JSON.stringify({ 'bad-key': 'nope', good: 'yes' }),
    }));
    await loadIntegrationCredentials(
      b64({ bad: { secretArn: 'arn1', envVarPrefix: 'BAD' } }),
      client
    );
    expect(process.env.BAD_GOOD).toBe('yes');
    expect(process.env['BAD_BAD-KEY']).toBeUndefined();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Skipping invalid env var name')
    );
  });
});

describe('integration env file (/tmp/integration-env.sh)', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    for (const k of Object.keys(process.env)) {
      if (['NOTION_', 'SLACK_', 'GITHUB_', 'JIRA_', 'CONFLUENCE_', 'LINEAR_'].some(p => k.startsWith(p))) {
        delete process.env[k];
      }
    }
    delete process.env.INTEGRATION_SECRET_ARNS;
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...ORIGINAL_ENV };
  });

  function b64(obj) {
    return Buffer.from(JSON.stringify(obj)).toString('base64');
  }

  function mkClient(sendImpl) {
    return { send: jest.fn(sendImpl) };
  }

  it('writes integration env vars to /tmp/integration-env.sh with correct format', async () => {
    const writeCalls = {};
    jest.spyOn(fs, 'writeFileSync').mockImplementation((p, content, opts) => {
      writeCalls[p] = { content, opts };
    });
    jest.spyOn(fs, 'readFileSync').mockImplementation(() => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); });
    jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);

    // Pre-set the env var as if loadIntegrationCredentials already ran
    process.env.NOTION_TOKEN = 'my-notion-token';
    process.env.USER_ID = 'test-user';

    await main();

    expect(writeCalls['/tmp/integration-env.sh']).toBeDefined();
    const content = writeCalls['/tmp/integration-env.sh'].content;
    expect(content).toContain("export NOTION_TOKEN='my-notion-token'");
    expect(writeCalls['/tmp/integration-env.sh'].opts).toEqual({ mode: 0o600 });
  });

  it('writes NOTION_TOKEN → NOTION_API_KEY alias', async () => {
    const writeCalls = {};
    jest.spyOn(fs, 'writeFileSync').mockImplementation((p, content, opts) => {
      writeCalls[p] = { content, opts };
    });
    jest.spyOn(fs, 'readFileSync').mockImplementation(() => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); });
    jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);

    process.env.NOTION_TOKEN = 'notion-tok';
    process.env.USER_ID = 'test-user';

    await main();

    const content = writeCalls['/tmp/integration-env.sh'].content;
    expect(content).toContain("export NOTION_API_KEY='notion-tok'");
  });

  it('writes GITHUB_TOKEN → GH_TOKEN alias', async () => {
    const writeCalls = {};
    jest.spyOn(fs, 'writeFileSync').mockImplementation((p, content, opts) => {
      writeCalls[p] = { content, opts };
    });
    jest.spyOn(fs, 'readFileSync').mockImplementation(() => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); });
    jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);

    process.env.GITHUB_TOKEN = 'gh-tok-123';
    process.env.USER_ID = 'test-user';

    await main();

    const content = writeCalls['/tmp/integration-env.sh'].content;
    expect(content).toContain("export GH_TOKEN='gh-tok-123'");
  });

  it('escapes single quotes in values for shell safety', async () => {
    const writeCalls = {};
    jest.spyOn(fs, 'writeFileSync').mockImplementation((p, content, opts) => {
      writeCalls[p] = { content, opts };
    });
    jest.spyOn(fs, 'readFileSync').mockImplementation(() => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); });
    jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);

    process.env.SLACK_TOKEN = "it's a test";
    process.env.USER_ID = 'test-user';

    await main();

    const content = writeCalls['/tmp/integration-env.sh'].content;
    expect(content).toContain("export SLACK_TOKEN='it'\\''s a test'");
  });
});

describe('config injection for integrations', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    for (const k of Object.keys(process.env)) {
      if (['NOTION_', 'SLACK_', 'GITHUB_'].some(p => k.startsWith(p))) {
        delete process.env[k];
      }
    }
    delete process.env.INTEGRATION_SECRET_ARNS;
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...ORIGINAL_ENV };
  });

  function b64(obj) {
    return Buffer.from(JSON.stringify(obj)).toString('base64');
  }

  function mkClient(sendImpl) {
    return { send: jest.fn(sendImpl) };
  }

  it('injects skills.entries.notion.apiKey when NOTION_TOKEN is set', async () => {
    let writtenConfig = null;
    jest.spyOn(fs, 'writeFileSync').mockImplementation((p, content) => {
      if (p.endsWith('openclaw.json')) {
        writtenConfig = JSON.parse(content);
      }
    });
    jest.spyOn(fs, 'readFileSync').mockImplementation(() => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); });
    jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);

    process.env.NOTION_TOKEN = 'ntn_secret_123';
    process.env.USER_ID = 'test-user';

    await main();

    expect(writtenConfig.skills.entries.notion.apiKey).toBe('ntn_secret_123');
  });

  it('injects channels.slack.botToken when SLACK_BOTTOKEN is set', async () => {
    let writtenConfig = null;
    jest.spyOn(fs, 'writeFileSync').mockImplementation((p, content) => {
      if (p.endsWith('openclaw.json')) {
        writtenConfig = JSON.parse(content);
      }
    });
    jest.spyOn(fs, 'readFileSync').mockImplementation(() => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); });
    jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);

    process.env.SLACK_BOTTOKEN = 'xoxb-slack-token';
    process.env.USER_ID = 'test-user';

    await main();

    expect(writtenConfig.channels.slack.botToken).toBe('xoxb-slack-token');
  });
});

describe('bundled skills path', () => {
  it('includes /skills as the first entry in skills.load.extraDirs', () => {
    const providers = buildProviders();
    const cfg = buildBaseConfig({ providers, allowedOrigins: '', allowHostHeaderFallback: false, teamId: '', userId: 'u1' });
    expect(cfg.skills.load.extraDirs[0]).toBe('/skills');
  });

  it('keeps /skills first even when teamId is provided', () => {
    const providers = buildProviders();
    const cfg = buildBaseConfig({ providers, allowedOrigins: '', allowHostHeaderFallback: false, teamId: 'eng', userId: 'u1' });
    expect(cfg.skills.load.extraDirs[0]).toBe('/skills');
    expect(cfg.skills.load.extraDirs).toContain('/efs/teams/eng/team-skills');
  });
});
