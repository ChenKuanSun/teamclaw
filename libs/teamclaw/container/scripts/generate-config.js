const fs = require('fs');
const path = require('path');

const SIDECAR_URL = 'http://localhost:3000';

// ALL providers routed through sidecar proxy (centralized key pool + usage tracking)
const PROXY_PROVIDERS = [
  'anthropic', 'anthropic-token', 'openai', 'openai-codex', 'google',
  'openrouter', 'mistral', 'together', 'groq', 'xai', 'deepseek', 'fireworks',
];

// Only 'anthropic-token' is OAuth/setup-token mode (Claude Code identity headers).
// 'anthropic' uses apiKey (x-api-key) — must NOT carry sk-ant-oat prefix, or upstream
// silently falls back from 1M context to standard context window.
const OAUTH_PROVIDERS = new Set(['anthropic-token']);
const FAKE_OAUTH_KEY = 'sk-ant-oat-proxy-managed-by-teamclaw-sidecar-00000000000000000000000000000000';
const FAKE_API_KEY = 'proxy-managed';

const BOOTSTRAP_FILES = [
  'AGENTS.md',
  'SOUL.md',
  'TOOLS.md',
  'BOOTSTRAP.md',
  'IDENTITY.md',
  'USER.md',
];

function buildProviders() {
  const providers = {};
  for (const id of PROXY_PROVIDERS) {
    providers[id] = {
      baseUrl: `${SIDECAR_URL}/${id}`,
      apiKey: OAUTH_PROVIDERS.has(id) ? FAKE_OAUTH_KEY : FAKE_API_KEY,
      models: [],
      request: {
        allowPrivateNetwork: true,
      },
    };
  }
  return providers;
}

// Load and merge configs: Global → Team → User (each level can only be more restrictive)
function loadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    console.error(`[generate-config] Failed to load ${filePath}:`, err.message);
    return {};
  }
}

function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      target[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

function buildBaseConfig({ providers, allowedOrigins, allowHostHeaderFallback, teamId, userId }) {
  return {
    gateway: {
      port: 18789,
      trustedProxies: ['0.0.0.0/0'],
      auth: {
        mode: 'trusted-proxy',
        trustedProxy: {
          userHeader: 'x-forwarded-for',
        },
      },
      controlUi: {
        dangerouslyAllowHostHeaderOriginFallback: allowHostHeaderFallback === true,
        allowedOrigins: allowedOrigins ? allowedOrigins.split(',') : [],
      },
      http: {
        securityHeaders: {
          strictTransportSecurity: 'max-age=31536000; includeSubDomains',
        },
      },
    },
    models: {
      providers,
    },
    agents: {
      defaults: {
        model: 'anthropic/claude-sonnet-4-6',
      },
    },
    session: {
      dmScope: 'per-channel-peer',
    },
    skills: {
      load: {
        extraDirs: [
          '/efs/system/approved-skills',
          ...(teamId ? [`/efs/teams/${teamId}/team-skills`] : []),
          `/efs/users/${userId}/user-skills`,
        ],
      },
    },
  };
}

function layerBootstrapFile(fileName, { efsRoot, teamId, userId }) {
  const sources = [
    `${efsRoot}/system/${fileName}`,
    teamId ? `${efsRoot}/teams/${teamId}/${fileName}` : null,
    `${efsRoot}/users/${userId}/${fileName}`,
  ].filter(Boolean);

  let content = '';
  for (const src of sources) {
    try {
      content += fs.readFileSync(src, 'utf-8') + '\n\n';
    } catch { /* missing file, skip */ }
  }

  return content.trim() ? content : null;
}

// Decode integration secret ARNs and fetch actual credentials from Secrets Manager
// at runtime using the task role.
async function loadIntegrationCredentials(integrationSecretArnsB64, smClient) {
  if (!integrationSecretArnsB64) return;

  // Lazy-resolve SDK client so unit tests can pass a mock without pulling the SDK.
  let client = smClient;
  let GetSecretValueCommand;
  try {
    // eslint-disable-next-line global-require
    const sdk = require('@aws-sdk/client-secrets-manager');
    GetSecretValueCommand = sdk.GetSecretValueCommand;
    if (!client) {
      client = new sdk.SecretsManagerClient({});
    }
  } catch (err) {
    // If SDK is unavailable and caller didn't inject a client, surface a clear warning.
    if (!client) {
      console.warn('[generate-config] @aws-sdk/client-secrets-manager unavailable:', err.message);
      return;
    }
    // If a mock client was injected, fall back to a plain command wrapper.
    GetSecretValueCommand = class {
      constructor(input) { this.input = input; }
    };
  }

  try {
    // Format: { integrationId: { secretArn: "arn1,arn2,...", envVarPrefix: "PREFIX" } }
    const arnsMap = JSON.parse(Buffer.from(integrationSecretArnsB64, 'base64').toString());
    let loaded = 0;

    for (const [integrationId, entry] of Object.entries(arnsMap)) {
      const { secretArn, envVarPrefix } = entry;
      const prefix = envVarPrefix || integrationId.toUpperCase();
      const candidateArns = secretArn.split(',');

      let fetched = false;
      for (const arn of candidateArns) {
        try {
          const secret = await client.send(new GetSecretValueCommand({ SecretId: arn.trim() }));
          if (secret.SecretString) {
            const fields = JSON.parse(secret.SecretString);
            for (const [key, value] of Object.entries(fields)) {
              const envVarName = `${prefix}_${key.toUpperCase()}`;
              if (!/^[A-Z][A-Z0-9_]*$/.test(envVarName)) {
                console.warn(`[generate-config] Skipping invalid env var name: ${prefix}_${key}`);
                continue;
              }
              process.env[envVarName] = value;
            }
            fetched = true;
            loaded++;
            break;
          }
        } catch (fetchErr) {
          if (fetchErr.name === 'ResourceNotFoundException') {
            // Secret doesn't exist at this level, try next
          } else {
            console.warn(`[generate-config] Failed to fetch secret for ${integrationId}:`, fetchErr.message);
          }
        }
      }

      if (!fetched) {
        console.warn(`[generate-config] No secret found for integration ${integrationId}`);
      }
    }
    console.log(`[generate-config] Integration credentials loaded for ${loaded} integration(s)`);
  } catch (err) {
    console.warn('[generate-config] Failed to fetch integration credentials:', err.message);
  }
}

async function main() {
  const userId = process.env.USER_ID || 'default';
  const teamId = process.env.TEAM_ID || '';

  const providers = buildProviders();

  const globalConfig = loadJson('/efs/system/global-config.json');
  const teamConfig = teamId ? loadJson(`/efs/teams/${teamId}/team-config.json`) : {};
  const userConfig = loadJson(`/efs/users/${userId}/user-config.json`);

  const allowedOrigins = process.env.ALLOWED_ORIGINS;
  if (!allowedOrigins) {
    console.warn('[generate-config] ALLOWED_ORIGINS not set — using empty allowlist');
  }

  const baseConfig = buildBaseConfig({
    providers,
    allowedOrigins,
    allowHostHeaderFallback: process.env.OPENCLAW_ALLOW_HOST_HEADER_FALLBACK === 'true',
    teamId,
    userId,
  });

  // Merge: base → global → team → user
  const merged = deepMerge(deepMerge(deepMerge(baseConfig, globalConfig), teamConfig), userConfig);

  // Write final config to OpenClaw's expected location
  const configDir = path.join(process.env.HOME || '/home/node', '.openclaw');
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(path.join(configDir, 'openclaw.json'), JSON.stringify(merged, null, 2));

  // Layer bootstrap files: system → team → user (concatenated per file)
  for (const fileName of BOOTSTRAP_FILES) {
    const content = layerBootstrapFile(fileName, { efsRoot: '/efs', teamId, userId });
    if (content) {
      fs.writeFileSync(`/workspace/${fileName}`, content);
    }
  }

  // Copy MEMORY.md if exists
  try {
    const memoryPath = `/efs/users/${userId}/MEMORY.md`;
    if (fs.existsSync(memoryPath)) {
      fs.copyFileSync(memoryPath, '/workspace/MEMORY.md');
    }
  } catch { /* skip */ }

  try {
    await loadIntegrationCredentials(process.env.INTEGRATION_SECRET_ARNS);
    console.log(`[generate-config] Config generated for user=${userId} team=${teamId}`);
  } catch (err) {
    console.error('[generate-config] Failed to load integration credentials:', err.message);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  PROXY_PROVIDERS,
  OAUTH_PROVIDERS,
  BOOTSTRAP_FILES,
  FAKE_OAUTH_KEY,
  FAKE_API_KEY,
  SIDECAR_URL,
  buildProviders,
  buildBaseConfig,
  layerBootstrapFile,
  loadJson,
  deepMerge,
  loadIntegrationCredentials,
  main,
};
