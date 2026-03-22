const fs = require('fs');
const path = require('path');

const userId = process.env.USER_ID || 'default';
const teamId = process.env.TEAM_ID || '';
const SIDECAR_URL = 'http://localhost:3000';

// ALL providers routed through sidecar proxy (centralized key pool + usage tracking)
const PROXY_PROVIDERS = [
  'anthropic', 'anthropic-token', 'openai', 'openai-codex', 'google',
  'openrouter', 'mistral', 'together', 'groq', 'xai', 'deepseek', 'fireworks',
];

// Providers that use OAuth tokens (setup tokens) need a fake key containing
// 'sk-ant-oat' so OpenClaw's isOAuthToken() detection triggers the correct
// code path (Claude Code identity headers, system prompt prefix, etc.).
// The sidecar strips this fake key and injects real credentials.
const OAUTH_PROVIDERS = new Set(['anthropic', 'anthropic-token']);
const FAKE_OAUTH_KEY = 'sk-ant-oat-proxy-managed-by-teamclaw-sidecar-00000000000000000000000000000000';
const FAKE_API_KEY = 'proxy-managed';

const providers = {};
for (const id of PROXY_PROVIDERS) {
  providers[id] = {
    baseUrl: `${SIDECAR_URL}/${id}`,
    apiKey: OAUTH_PROVIDERS.has(id) ? FAKE_OAUTH_KEY : FAKE_API_KEY,
    models: [],
  };
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

const globalConfig = loadJson('/efs/system/global-config.json');
const teamConfig = teamId ? loadJson(`/efs/teams/${teamId}/team-config.json`) : {};
const userConfig = loadJson(`/efs/users/${userId}/user-config.json`);

const allowedOrigins = process.env.ALLOWED_ORIGINS;
if (!allowedOrigins) {
  console.warn('[generate-config] ALLOWED_ORIGINS not set — using empty allowlist');
}

// Base OpenClaw gateway config (upstream reads this)
const baseConfig = {
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
      dangerouslyAllowHostHeaderOriginFallback: process.env.OPENCLAW_ALLOW_HOST_HEADER_FALLBACK === 'true',
      allowedOrigins: allowedOrigins ? allowedOrigins.split(',') : [],
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

// Merge: base → global → team → user
const merged = deepMerge(deepMerge(deepMerge(baseConfig, globalConfig), teamConfig), userConfig);

// Write final config to OpenClaw's expected location
const configDir = path.join(process.env.HOME || '/home/node', '.openclaw');
fs.mkdirSync(configDir, { recursive: true });
fs.writeFileSync(path.join(configDir, 'openclaw.json'), JSON.stringify(merged, null, 2));

// Copy SOUL.md files if they exist
const soulSources = [
  `/efs/system/SOUL.md`,
  teamId ? `/efs/teams/${teamId}/SOUL.md` : null,
  `/efs/users/${userId}/SOUL.md`,
].filter(Boolean);

let soulContent = '';
for (const src of soulSources) {
  try {
    soulContent += fs.readFileSync(src, 'utf-8') + '\n\n';
  } catch { /* file doesn't exist, skip */ }
}

if (soulContent.trim()) {
  fs.writeFileSync('/workspace/SOUL.md', soulContent);
}

// Copy MEMORY.md if exists
try {
  const memoryPath = `/efs/users/${userId}/MEMORY.md`;
  if (fs.existsSync(memoryPath)) {
    fs.copyFileSync(memoryPath, '/workspace/MEMORY.md');
  }
} catch { /* skip */ }

// Decode integration secret ARNs from env var and fetch actual credentials
// from Secrets Manager at runtime using the task role.
async function loadIntegrationCredentials() {
  const integrationSecretArnsB64 = process.env.INTEGRATION_SECRET_ARNS;
  if (!integrationSecretArnsB64) return;

  const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
  const smClient = new SecretsManagerClient({});

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
          const secret = await smClient.send(new GetSecretValueCommand({ SecretId: arn.trim() }));
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

(async () => {
  try {
    await loadIntegrationCredentials();
    console.log(`[generate-config] Config generated for user=${userId} team=${teamId}`);
  } catch (err) {
    console.error('[generate-config] Failed to load integration credentials:', err.message);
  }
})();
