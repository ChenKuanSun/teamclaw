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
  'Access-Control-Allow-Origin': process.env['ADMIN_ORIGIN'] || '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const provider = body.provider || event.pathParameters?.['provider'];
    const keyIndex = body.keyIndex ?? parseInt(event.pathParameters?.['keyIndex'] || '', 10);

    if (!provider || isNaN(keyIndex)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'provider and keyIndex are required' }),
      };
    }

    // Read current secret
    const result = await smClient.send(new GetSecretValueCommand({
      SecretId: API_KEYS_SECRET_ARN,
    }));

    const keys: Record<string, string[]> = JSON.parse(result.SecretString || '{}');

    if (!keys[provider] || keyIndex < 0 || keyIndex >= keys[provider].length) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Key not found at specified index' }),
      };
    }

    // Remove the key at the given index
    keys[provider].splice(keyIndex, 1);

    // Write back
    await smClient.send(new PutSecretValueCommand({
      SecretId: API_KEYS_SECRET_ARN,
      SecretString: JSON.stringify(keys),
    }));

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        message: 'API key removed',
        provider,
        remainingKeys: keys[provider].length,
      }),
    };
  } catch (error) {
    console.error('Failed to remove API key:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
