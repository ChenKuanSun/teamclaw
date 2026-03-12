import {
  SecretsManagerClient,
  GetSecretValueCommand,
  PutSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { adminLambdaHandlerDecorator, HandlerMethod, HttpStatusCode, validateRequiredEnvVars } from '@TeamClaw/teamclaw/cloud-function';
import type { GETAndDELETECloudFunctionInput } from '@TeamClaw/teamclaw/cloud-function';

validateRequiredEnvVars({ API_KEYS_SECRET_ARN: process.env['API_KEYS_SECRET_ARN'] });

const smClient = new SecretsManagerClient({});
const API_KEYS_SECRET_ARN = process.env['API_KEYS_SECRET_ARN']!;

const handlerFn = async (
  request: GETAndDELETECloudFunctionInput,
): Promise<{ status: number; body: unknown }> => {
  const { pathParameters, queryStringParameters } = request;
  const provider = pathParameters?.['provider'] || queryStringParameters?.['provider'];
  const keyIdParam = pathParameters?.['keyId'] || queryStringParameters?.['keyIndex'];
  const keyIndex = keyIdParam !== undefined ? parseInt(keyIdParam, 10) : NaN;

  if (!provider || isNaN(keyIndex)) {
    return {
      status: HttpStatusCode.BAD_REQUEST,
      body: { message: 'provider and keyIndex are required' },
    };
  }

  // Read current secret
  const result = await smClient.send(new GetSecretValueCommand({
    SecretId: API_KEYS_SECRET_ARN,
  }));

  const keys: Record<string, string[]> = JSON.parse(result.SecretString || '{}');

  if (!keys[provider] || keyIndex < 0 || keyIndex >= keys[provider].length) {
    return {
      status: HttpStatusCode.NOT_FOUND,
      body: { message: 'Key not found at specified index' },
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
    status: HttpStatusCode.SUCCESS,
    body: {
      message: 'API key removed',
      provider,
      remainingKeys: keys[provider].length,
    },
  };
};

export const handler = adminLambdaHandlerDecorator(
  HandlerMethod.DELETE,
  handlerFn,
);
