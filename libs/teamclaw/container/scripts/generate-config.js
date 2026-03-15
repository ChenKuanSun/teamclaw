const fs = require('fs');
const path = require('path');

const userId = process.env.USER_ID || 'default';
const teamId = process.env.TEAM_ID || '';
const SIDECAR_URL = 'http://localhost:3000';

// Load provider tokens from Secrets Manager (shared with sidecar)
async function loadProviderTokens() {
  const secretArn = process.env.API_KEYS_SECRET_ARN;
  if (!secretArn) return {};
  try {
    const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
    const client = new SecretsManagerClient({});
    const result = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
    const secret = JSON.parse(result.SecretString || '{}');
    return secret.providers || {};
  } catch (err) {
    console.warn('[generate-config] Could not load secrets:', err.message);
    return {};
  }
}

// Providers routed through sidecar proxy (for key pool management)
// anthropic/anthropic-token are handled natively via ANTHROPIC_OAUTH_TOKEN env var
const PROXY_PROVIDERS = [
  'openai', 'openai-codex', 'google',
  'openrouter', 'mistral', 'together', 'groq', 'xai', 'deepseek', 'fireworks',
];

const providers = {};
for (const id of PROXY_PROVIDERS) {
  providers[id] = { baseUrl: `${SIDECAR_URL}/${id}`, apiKey: 'proxy-managed', models: [] };
}

// Load and merge configs: Global → Team → User (each level can only be more restrictive)
function loadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
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
      dangerouslyAllowHostHeaderOriginFallback: true,
      allowedOrigins: ['https://main.d1gf9ksewdyeuo.amplifyapp.com', 'https://dev.d1gf9ksewdyeuo.amplifyapp.com'],
    },
  },
  models: {
    providers,
  },
  session: {
    dmScope: 'per-channel-peer',
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

// Load provider tokens and write env file for OpenClaw native provider support
loadProviderTokens().then((providerTokens) => {
  const envLines = [];
  // Anthropic OAuth token → OpenClaw reads ANTHROPIC_OAUTH_TOKEN natively
  const anthropicEntry = providerTokens['anthropic-token'] || providerTokens['anthropic'];
  if (anthropicEntry) {
    const token = anthropicEntry.token || anthropicEntry.accessToken;
    if (token) envLines.push(`export ANTHROPIC_OAUTH_TOKEN="${token}"`);
  }
  if (envLines.length > 0) {
    fs.writeFileSync('/tmp/provider-env.sh', envLines.join('\n') + '\n');
    console.log(`[generate-config] Wrote ${envLines.length} provider token(s) to env`);
  }
  console.log(`[generate-config] Config generated for user=${userId} team=${teamId}`);
}).catch((err) => {
  console.warn('[generate-config] Token load failed:', err.message);
  console.log(`[generate-config] Config generated for user=${userId} team=${teamId}`);
});
