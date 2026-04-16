import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import { resolveAuth, loadSecrets } from './auth';
import { logUsage, UsageMeta } from './usage';

const PORT = parseInt(process.env['PORT'] || '3000', 10);

const server = http.createServer(async (req, res) => {
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
  const incomingBeta = Array.isArray(incomingBetaRaw) ? incomingBetaRaw[0] : incomingBetaRaw;
  if (incomingBeta) incomingHeaderSubset['anthropic-beta'] = incomingBeta;

  const auth = await resolveAuth(providerId, remainingPath, incomingHeaderSubset);
  if (!auth) {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: `Provider "${providerId}" not configured or no credentials` }));
    return;
  }

  const requestBetaIncludes1m = !!incomingBeta && incomingBeta.includes('context-1m-2025-08-07');
  let downgradeReason: UsageMeta['downgradeReason'] | undefined;
  if (auth.authType === 'oauthToken' && requestBetaIncludes1m) {
    downgradeReason = 'oauth-no-1m';
    console.warn(`[sidecar] 1M context requested with OAuth token for ${providerId} — upstream will downgrade to standard window`);
    res.setHeader('x-teamclaw-downgrade', 'oauth-no-1m');
  }

  const targetUrl = new URL(auth.targetUrl);

  const upstreamHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (key === 'host' || key === 'connection') continue;
    if (key === 'authorization' || key === 'x-api-key' || key === 'x-goog-api-key') continue;
    if (key === 'accept-encoding') continue; // Prevent gzip — sidecar doesn't decompress
    if (value) upstreamHeaders[key] = Array.isArray(value) ? value[0] : value;
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

  const proxyReq = https.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error(`[sidecar] Upstream error for ${providerId}:`, err.message);
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
    } catch { /* not JSON or no model field */ }
    logUsage(providerId, model, downgradeReason ? { downgradeReason } : undefined);
  });
  req.on('error', () => proxyReq.destroy());
});

loadSecrets()
  .then(() => {
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`[sidecar] Proxy listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[sidecar] Failed to load secrets:', err);
    process.exit(1);
  });
