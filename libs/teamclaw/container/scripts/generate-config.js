const fs = require('fs');
const path = require('path');

const userId = process.env.USER_ID || 'default';
const teamId = process.env.TEAM_ID || '';
const keyPoolProxyUrl = process.env.KEY_POOL_PROXY_URL || '';

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
    host: '0.0.0.0',
  },
  models: {
    providers: {
      anthropic: { baseUrl: `${keyPoolProxyUrl}anthropic` },
      openai: { baseUrl: `${keyPoolProxyUrl}openai` },
      google: { baseUrl: `${keyPoolProxyUrl}google` },
    },
  },
  session: {
    dmScope: 'per-channel-peer',
  },
};

// Merge: base → global → team → user
const merged = deepMerge(deepMerge(deepMerge(baseConfig, globalConfig), teamConfig), userConfig);

// Write final config
fs.writeFileSync('/workspace/openclaw.json', JSON.stringify(merged, null, 2));

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

console.log(`[generate-config] Config generated for user=${userId} team=${teamId}`);
