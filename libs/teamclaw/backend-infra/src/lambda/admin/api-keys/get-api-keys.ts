import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { APIGatewayProxyHandler } from 'aws-lambda';

const smClient = new SecretsManagerClient({});
const API_KEYS_SECRET_ARN = process.env['API_KEYS_SECRET_ARN']!;

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': process.env['ADMIN_ORIGIN'] || '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

function maskKey(key: string): string {
  if (key.length <= 4) return '****';
  return '*'.repeat(key.length - 4) + key.slice(-4);
}

export const handler: APIGatewayProxyHandler = async () => {
  try {
    const result = await smClient.send(new GetSecretValueCommand({
      SecretId: API_KEYS_SECRET_ARN,
    }));

    const keys: Record<string, string[]> = JSON.parse(result.SecretString || '{}');

    const masked: Record<string, { index: number; masked: string }[]> = {};
    for (const [provider, providerKeys] of Object.entries(keys)) {
      masked[provider] = providerKeys.map((key, index) => ({
        index,
        masked: maskKey(key),
      }));
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ providers: masked }),
    };
  } catch (error) {
    console.error('Failed to get API keys:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
