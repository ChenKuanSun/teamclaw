import {
  SecretsManagerClient,
  GetSecretValueCommand,
  PutSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { APIGatewayProxyHandler } from 'aws-lambda';

const smClient = new SecretsManagerClient({});
const API_KEYS_SECRET_ARN = process.env['API_KEYS_SECRET_ARN']!;

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const { provider, key } = body;

    if (!provider || !key) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'provider and key are required' }),
      };
    }

    // Read current secret
    const result = await smClient.send(new GetSecretValueCommand({
      SecretId: API_KEYS_SECRET_ARN,
    }));

    const keys: Record<string, string[]> = JSON.parse(result.SecretString || '{}');

    // Append key to provider
    if (!keys[provider]) {
      keys[provider] = [];
    }
    keys[provider].push(key);

    // Write back
    await smClient.send(new PutSecretValueCommand({
      SecretId: API_KEYS_SECRET_ARN,
      SecretString: JSON.stringify(keys),
    }));

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        message: 'API key added',
        provider,
        totalKeys: keys[provider].length,
      }),
    };
  } catch (error) {
    console.error('Failed to add API key:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
