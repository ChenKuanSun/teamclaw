import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';

const smClient = new SecretsManagerClient({});
const ddbClient = new DynamoDBClient({});

let cachedKeys: Record<string, string[]> | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface ApiKeysSecret {
  anthropic?: string[];
  openai?: string[];
  google?: string[];
}

async function getApiKeys(): Promise<ApiKeysSecret> {
  if (cachedKeys && Date.now() - cachedAt < CACHE_TTL_MS) return cachedKeys;
  const result = await smClient.send(new GetSecretValueCommand({
    SecretId: process.env['API_KEYS_SECRET_ARN']!,
  }));
  cachedKeys = JSON.parse(result.SecretString!);
  cachedAt = Date.now();
  return cachedKeys!;
}

// Round-robin index per provider
const roundRobinIndex: Record<string, number> = {};

function pickKey(keys: string[], provider: string): string {
  if (roundRobinIndex[provider] === undefined) roundRobinIndex[provider] = 0;
  const idx = roundRobinIndex[provider] % keys.length;
  roundRobinIndex[provider] = idx + 1;
  return keys[idx];
}

export const handler = async (event: any) => {
  const keys = await getApiKeys();
  const path = event.path || '';
  const method = event.httpMethod || 'POST';
  const body = event.body ? JSON.parse(event.body) : {};
  const headers = event.headers || {};

  // Determine provider from path or header
  let provider = 'anthropic';
  if (path.includes('/openai/') || headers['x-provider'] === 'openai') provider = 'openai';
  if (path.includes('/google/') || headers['x-provider'] === 'google') provider = 'google';

  const providerKeys = (keys as any)[provider];
  if (!providerKeys?.length) {
    return { statusCode: 503, body: JSON.stringify({ error: `No ${provider} keys configured` }) };
  }

  const apiKey = pickKey(providerKeys, provider);
  const userId = headers['x-user-id'] || 'unknown';

  // Track usage
  await ddbClient.send(new PutItemCommand({
    TableName: process.env['USAGE_TABLE_NAME']!,
    Item: {
      userId: { S: userId },
      timestamp: { S: new Date().toISOString() },
      provider: { S: provider },
      model: { S: body.model || 'unknown' },
      ttl: { N: String(Math.floor(Date.now() / 1000) + 90 * 86400) }, // 90 days
    },
  }));

  // Forward request to real provider
  const providerUrls: Record<string, string> = {
    anthropic: 'https://api.anthropic.com',
    openai: 'https://api.openai.com',
    google: 'https://generativelanguage.googleapis.com',
  };

  const targetUrl = providerUrls[provider] + path.replace(`/${provider}`, '');
  const providerHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (provider === 'anthropic') {
    providerHeaders['x-api-key'] = apiKey;
    providerHeaders['anthropic-version'] = headers['anthropic-version'] || '2023-06-01';
  } else if (provider === 'openai') {
    providerHeaders['Authorization'] = `Bearer ${apiKey}`;
  } else if (provider === 'google') {
    providerHeaders['x-goog-api-key'] = apiKey;
  }

  const response = await fetch(targetUrl, {
    method,
    headers: providerHeaders,
    body: JSON.stringify(body),
  });

  const responseBody = await response.text();

  return {
    statusCode: response.status,
    headers: { 'Content-Type': 'application/json' },
    body: responseBody,
  };
};
