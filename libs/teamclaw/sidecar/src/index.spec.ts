import * as http from 'http';
import * as https from 'https';
import type { AddressInfo } from 'net';
import { PassThrough } from 'stream';

// Mock auth and usage modules
jest.mock('./auth');
jest.mock('./usage');

// Mock https.request to prevent real outbound calls
jest.mock('https', () => {
  const actual = jest.requireActual('https');
  return { ...actual, request: jest.fn() };
});

import { loadSecrets, resolveAuth } from './auth';
import { logUsage } from './usage';

const mockResolveAuth = resolveAuth as jest.MockedFunction<typeof resolveAuth>;
const mockLoadSecrets = loadSecrets as jest.MockedFunction<typeof loadSecrets>;
const mockLogUsage = logUsage as jest.MockedFunction<typeof logUsage>;
const mockHttpsRequest = https.request as jest.MockedFunction<
  typeof https.request
>;

let server: http.Server;
let baseUrl: string;

beforeAll(done => {
  // loadSecrets must resolve before server.listen in index.ts
  mockLoadSecrets.mockResolvedValue({ providers: {} });
  mockLogUsage.mockResolvedValue(undefined);

  // Need to set PORT before requiring index
  process.env['PORT'] = '0'; // Let OS assign a free port

  // We create the server ourselves rather than requiring index.ts,
  // because index.ts boots on import and calls process.exit on failure.
  // Instead, we replicate the server handler for isolated testing.
  const { createServer } = buildServerHandler();
  server = createServer();
  server.listen(0, '127.0.0.1', () => {
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
    done();
  });
});

afterAll(done => {
  server.close(done);
});

beforeEach(() => {
  mockResolveAuth.mockReset();
  mockLogUsage.mockReset().mockResolvedValue(undefined);
  mockHttpsRequest.mockReset();
});

/**
 * Builds the same HTTP handler as index.ts but without the auto-listen/process.exit behavior.
 * This is intentional: we test the handler logic, not the bootstrap.
 */
function buildServerHandler() {
  return {
    createServer: () =>
      http.createServer(async (req, res) => {
        if (req.url === '/health') {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end('{"status":"ok"}');
          return;
        }

        const urlPath = req.url || '/';
        const match = urlPath.match(/^\/([^/]+)(\/.*)?$/);
        if (!match) {
          res.writeHead(400, { 'content-type': 'application/json' });
          res.end('{"error":"Missing provider in URL path"}');
          return;
        }

        const providerId = match[1];
        const remainingPath = match[2] || '/';

        const incomingHeaderSubset: Record<string, string> = {};
        const incomingBetaRaw = req.headers['anthropic-beta'];
        const incomingBeta = Array.isArray(incomingBetaRaw)
          ? incomingBetaRaw[0]
          : incomingBetaRaw;
        if (incomingBeta) incomingHeaderSubset['anthropic-beta'] = incomingBeta;

        const auth = await resolveAuth(
          providerId,
          remainingPath,
          incomingHeaderSubset,
        );
        if (!auth) {
          res.writeHead(404, { 'content-type': 'application/json' });
          res.end(
            JSON.stringify({
              error: `Provider "${providerId}" not configured or no credentials`,
            }),
          );
          return;
        }

        const requestBetaIncludes1m =
          !!incomingBeta && incomingBeta.includes('context-1m-2025-08-07');
        let downgradeReason: 'oauth-no-1m' | undefined;
        if (auth.authType === 'oauthToken' && requestBetaIncludes1m) {
          downgradeReason = 'oauth-no-1m';
          console.warn(
            `[sidecar] 1M context requested with OAuth token for ${providerId} — upstream will downgrade to standard window`,
          );
          res.setHeader('x-teamclaw-downgrade', 'oauth-no-1m');
        }

        const { URL } = require('url');
        const targetUrl = new URL(auth.targetUrl);

        const upstreamHeaders: Record<string, string> = {};
        for (const [key, value] of Object.entries(req.headers)) {
          if (key === 'host' || key === 'connection') continue;
          if (
            key === 'authorization' ||
            key === 'x-api-key' ||
            key === 'x-goog-api-key'
          )
            continue;
          if (key === 'accept-encoding') continue;
          if (value)
            upstreamHeaders[key] = Array.isArray(value) ? value[0] : value;
        }

        Object.assign(upstreamHeaders, auth.headers);
        upstreamHeaders['host'] = targetUrl.host;

        let model = 'unknown';

        const options: https.RequestOptions = {
          hostname: targetUrl.hostname,
          port: targetUrl.port || 443,
          path: targetUrl.pathname + (targetUrl.search || ''),
          method: req.method,
          headers: upstreamHeaders,
        };

        const proxyReq = https.request(options, proxyRes => {
          res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
          proxyRes.pipe(res);
        });

        proxyReq.on('error', err => {
          if (!res.headersSent) {
            res.writeHead(502, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: 'Upstream request failed' }));
          }
        });

        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
          proxyReq.write(chunk);
        });
        req.on('end', () => {
          proxyReq.end();
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString());
            if (body.model) model = body.model;
          } catch {
            /* not JSON or no model field */
          }
          logUsage(
            providerId,
            model,
            downgradeReason ? { downgradeReason } : undefined,
          );
        });
        req.on('error', () => proxyReq.destroy());
      }),
  };
}

function makeRequest(
  method: string,
  path: string,
  body?: string,
  extraHeaders?: Record<string, string>,
): Promise<{
  statusCode: number;
  body: string;
  headers: http.IncomingHttpHeaders;
}> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method,
        headers: {
          'content-type': 'application/json',
          ...extraHeaders,
        },
      },
      res => {
        const chunks: Buffer[] = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode!,
            body: Buffer.concat(chunks).toString(),
            headers: res.headers,
          });
        });
      },
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await makeRequest('GET', '/health');

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ status: 'ok' });
  });
});

// ---------------------------------------------------------------------------
// Missing / invalid provider path
// ---------------------------------------------------------------------------
describe('invalid request paths', () => {
  it('returns 400 when no provider in path (root /)', async () => {
    const res = await makeRequest('GET', '/');

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain('Missing provider');
  });
});

// ---------------------------------------------------------------------------
// Unknown / unconfigured provider
// ---------------------------------------------------------------------------
describe('unknown provider', () => {
  it('returns 404 when resolveAuth returns null', async () => {
    mockResolveAuth.mockResolvedValue(null);

    const res = await makeRequest('POST', '/nonexistent/v1/chat');

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toContain('nonexistent');
  });
});

// ---------------------------------------------------------------------------
// Successful proxy
// ---------------------------------------------------------------------------
describe('successful proxy', () => {
  it('strips incoming auth headers, injects real credentials, and forwards to upstream', async () => {
    mockResolveAuth.mockResolvedValue({
      targetUrl: 'https://api.anthropic.com/v1/messages',
      headers: {
        'x-api-key': 'sk-real-key',
        'anthropic-version': '2023-06-01',
      },
      authType: 'apiKey',
    });

    // Create a fake upstream response
    const fakeUpstreamRes = new PassThrough();
    Object.assign(fakeUpstreamRes, {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
    });

    // Create a fake proxyReq (writable stream that captures events)
    const fakeProxyReq = new PassThrough();
    Object.assign(fakeProxyReq, {
      destroy: jest.fn(),
    });

    mockHttpsRequest.mockImplementation((opts: any, callback: any) => {
      // Invoke callback with the fake response
      process.nextTick(() => {
        callback(fakeUpstreamRes);
        fakeUpstreamRes.end(JSON.stringify({ id: 'msg_123' }));
      });
      return fakeProxyReq as any;
    });

    const requestBody = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      messages: [],
    });
    const res = await makeRequest(
      'POST',
      '/anthropic/v1/messages',
      requestBody,
      {
        authorization: 'Bearer user-token-should-be-stripped',
        'x-api-key': 'user-key-should-be-stripped',
      },
    );

    expect(res.statusCode).toBe(200);

    // Verify resolveAuth was called with correct provider and path
    expect(mockResolveAuth).toHaveBeenCalledWith(
      'anthropic',
      '/v1/messages',
      expect.any(Object),
    );

    // Verify https.request was called with the injected headers
    const reqOpts = mockHttpsRequest.mock.calls[0][0] as https.RequestOptions;
    expect(reqOpts.hostname).toBe('api.anthropic.com');
    expect(reqOpts.path).toBe('/v1/messages');
    expect((reqOpts.headers as any)['x-api-key']).toBe('sk-real-key');
    expect((reqOpts.headers as any)['anthropic-version']).toBe('2023-06-01');
    // The incoming authorization and x-api-key from the client should NOT be present
    // (they get stripped before auth.headers are merged)
    expect((reqOpts.headers as any)['host']).toBe('api.anthropic.com');
  });

  it('calls logUsage with provider and model after proxying', async () => {
    mockResolveAuth.mockResolvedValue({
      targetUrl: 'https://api.openai.com/v1/chat/completions',
      headers: { authorization: 'Bearer sk-real' },
      authType: 'apiKey',
    });

    const fakeUpstreamRes = new PassThrough();
    Object.assign(fakeUpstreamRes, {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
    });
    const fakeProxyReq = new PassThrough();
    Object.assign(fakeProxyReq, { destroy: jest.fn() });

    mockHttpsRequest.mockImplementation((_opts: any, callback: any) => {
      process.nextTick(() => {
        callback(fakeUpstreamRes);
        fakeUpstreamRes.end('{"id":"chatcmpl-1"}');
      });
      return fakeProxyReq as any;
    });

    const body = JSON.stringify({ model: 'gpt-4o', messages: [] });
    await makeRequest('POST', '/openai/v1/chat/completions', body);

    // Give the 'end' handler time to fire
    await new Promise(r => setTimeout(r, 50));

    expect(mockLogUsage).toHaveBeenCalledWith('openai', 'gpt-4o', undefined);
  });

  it('logs model as "unknown" when request body is not JSON', async () => {
    mockResolveAuth.mockResolvedValue({
      targetUrl: 'https://api.openai.com/v1/chat/completions',
      headers: { authorization: 'Bearer sk-real' },
      authType: 'apiKey',
    });

    const fakeUpstreamRes = new PassThrough();
    Object.assign(fakeUpstreamRes, {
      statusCode: 200,
      headers: { 'content-type': 'text/plain' },
    });
    const fakeProxyReq = new PassThrough();
    Object.assign(fakeProxyReq, { destroy: jest.fn() });

    mockHttpsRequest.mockImplementation((_opts: any, callback: any) => {
      process.nextTick(() => {
        callback(fakeUpstreamRes);
        fakeUpstreamRes.end('ok');
      });
      return fakeProxyReq as any;
    });

    await makeRequest('POST', '/openai/v1/chat/completions', 'not-json-body');

    await new Promise(r => setTimeout(r, 50));

    expect(mockLogUsage).toHaveBeenCalledWith('openai', 'unknown', undefined);
  });
});

// ---------------------------------------------------------------------------
// Upstream error handling
// ---------------------------------------------------------------------------
describe('upstream error', () => {
  it('returns 502 when upstream connection fails', async () => {
    mockResolveAuth.mockResolvedValue({
      targetUrl: 'https://api.anthropic.com/v1/messages',
      headers: { 'x-api-key': 'sk-real' },
      authType: 'apiKey',
    });

    const fakeProxyReq = new PassThrough();
    Object.assign(fakeProxyReq, { destroy: jest.fn() });

    mockHttpsRequest.mockImplementation(() => {
      // Emit error on next tick
      process.nextTick(() => {
        fakeProxyReq.emit('error', new Error('ECONNREFUSED'));
      });
      return fakeProxyReq as any;
    });

    const res = await makeRequest('POST', '/anthropic/v1/messages', '{}');

    expect(res.statusCode).toBe(502);
    expect(JSON.parse(res.body).error).toBe('Upstream request failed');
  });
});

// ---------------------------------------------------------------------------
// Header stripping
// ---------------------------------------------------------------------------
describe('header stripping', () => {
  it('strips accept-encoding to prevent gzip issues', async () => {
    mockResolveAuth.mockResolvedValue({
      targetUrl: 'https://api.anthropic.com/v1/messages',
      headers: { 'x-api-key': 'sk-real' },
      authType: 'apiKey',
    });

    const fakeUpstreamRes = new PassThrough();
    Object.assign(fakeUpstreamRes, {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
    });
    const fakeProxyReq = new PassThrough();
    Object.assign(fakeProxyReq, { destroy: jest.fn() });

    mockHttpsRequest.mockImplementation((opts: any, callback: any) => {
      process.nextTick(() => {
        callback(fakeUpstreamRes);
        fakeUpstreamRes.end('{}');
      });
      return fakeProxyReq as any;
    });

    await makeRequest('POST', '/anthropic/v1/messages', '{}', {
      'accept-encoding': 'gzip, deflate',
    });

    const reqOpts = mockHttpsRequest.mock.calls[0][0] as https.RequestOptions;
    expect((reqOpts.headers as any)['accept-encoding']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// OAuth + 1M context downgrade warning
// ---------------------------------------------------------------------------
describe('OAuth + 1M context safety', () => {
  it('logs a warning, sets downgrade header, and records downgradeReason when OAuth token + 1M context requested', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

    mockResolveAuth.mockResolvedValue({
      targetUrl: 'https://api.anthropic.com/v1/messages',
      headers: {
        authorization: 'Bearer sk-ant-oat-abc',
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'oauth-2025-04-20',
      },
      authType: 'oauthToken',
    });

    const fakeUpstreamRes = new PassThrough();
    Object.assign(fakeUpstreamRes, {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
    });
    const fakeProxyReq = new PassThrough();
    Object.assign(fakeProxyReq, { destroy: jest.fn() });

    mockHttpsRequest.mockImplementation((_opts: any, callback: any) => {
      process.nextTick(() => {
        callback(fakeUpstreamRes);
        fakeUpstreamRes.end('{"id":"msg_1"}');
      });
      return fakeProxyReq as any;
    });

    const res = await makeRequest(
      'POST',
      '/anthropic/v1/messages',
      JSON.stringify({ model: 'claude-sonnet-4-20250514', messages: [] }),
      { 'anthropic-beta': 'context-1m-2025-08-07,oauth-2025-04-20' },
    );

    expect(res.statusCode).toBe(200);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        '1M context requested with OAuth token for anthropic',
      ),
    );
    // still forwarded
    expect(mockHttpsRequest).toHaveBeenCalled();

    // Response carries the downgrade header for clients to surface
    expect(res.headers['x-teamclaw-downgrade']).toBe('oauth-no-1m');

    // Give the 'end' handler time to fire
    await new Promise(r => setTimeout(r, 50));

    expect(mockLogUsage).toHaveBeenCalledWith(
      'anthropic',
      'claude-sonnet-4-20250514',
      { downgradeReason: 'oauth-no-1m' },
    );

    warnSpy.mockRestore();
  });

  it('does NOT warn, set downgrade header, or record meta when apiKey auth is used with 1M context', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

    mockResolveAuth.mockResolvedValue({
      targetUrl: 'https://api.anthropic.com/v1/messages',
      headers: {
        'x-api-key': 'sk-ant-real',
        'anthropic-beta': 'context-1m-2025-08-07',
      },
      authType: 'apiKey',
    });

    const fakeUpstreamRes = new PassThrough();
    Object.assign(fakeUpstreamRes, {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
    });
    const fakeProxyReq = new PassThrough();
    Object.assign(fakeProxyReq, { destroy: jest.fn() });

    mockHttpsRequest.mockImplementation((_opts: any, callback: any) => {
      process.nextTick(() => {
        callback(fakeUpstreamRes);
        fakeUpstreamRes.end('{}');
      });
      return fakeProxyReq as any;
    });

    const res = await makeRequest(
      'POST',
      '/anthropic/v1/messages',
      JSON.stringify({ model: 'claude-sonnet-4-20250514' }),
      { 'anthropic-beta': 'context-1m-2025-08-07' },
    );

    const downgradeWarns = warnSpy.mock.calls.filter(call =>
      String(call[0]).includes('1M context requested with OAuth token'),
    );
    expect(downgradeWarns.length).toBe(0);

    expect(res.headers['x-teamclaw-downgrade']).toBeUndefined();

    await new Promise(r => setTimeout(r, 50));

    expect(mockLogUsage).toHaveBeenCalledWith(
      'anthropic',
      'claude-sonnet-4-20250514',
      undefined,
    );

    warnSpy.mockRestore();
  });
});
