import {
  SecretsManagerClient,
  GetSecretValueCommand,
  PutSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { adminLambdaHandlerDecorator, HandlerMethod, HttpStatusCode, validateRequiredEnvVars } from '@TeamClaw/teamclaw/cloud-function';
import type { GETAndDELETECloudFunctionInput } from '@TeamClaw/teamclaw/cloud-function';
import { parseSecrets, serializeSecrets } from './secrets-format';

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

  if (!provider) {
    return {
      status: HttpStatusCode.BAD_REQUEST,
      body: { message: 'provider is required' },
    };
  }

  // Read current secret
  const result = await smClient.send(new GetSecretValueCommand({
    SecretId: API_KEYS_SECRET_ARN,
  }));

  const secret = parseSecrets(result.SecretString);
  const entry = secret.providers[provider];

  if (!entry) {
    return {
      status: HttpStatusCode.NOT_FOUND,
      body: { message: 'Provider not found' },
    };
  }

  if (entry.authType === 'oauthToken') {
    // For OAuth providers: delete entire provider entry
    delete secret.providers[provider];

    await smClient.send(new PutSecretValueCommand({
      SecretId: API_KEYS_SECRET_ARN,
      SecretString: serializeSecrets(secret),
    }));

    return {
      status: HttpStatusCode.SUCCESS,
      body: {
        message: 'OAuth credentials removed',
        provider,
      },
    };
  }

  // For API key providers: remove key by index
  if (isNaN(keyIndex)) {
    return {
      status: HttpStatusCode.BAD_REQUEST,
      body: { message: 'provider and keyIndex are required' },
    };
  }

  const keys = entry.keys || [];
  if (keyIndex < 0 || keyIndex >= keys.length) {
    return {
      status: HttpStatusCode.NOT_FOUND,
      body: { message: 'Key not found at specified index' },
    };
  }

  keys.splice(keyIndex, 1);

  // Delete provider if no keys remain
  if (keys.length === 0) {
    delete secret.providers[provider];
  }

  // Write back
  await smClient.send(new PutSecretValueCommand({
    SecretId: API_KEYS_SECRET_ARN,
    SecretString: serializeSecrets(secret),
  }));

  return {
    status: HttpStatusCode.SUCCESS,
    body: {
      message: 'API key removed',
      provider,
      remainingKeys: keys.length,
    },
  };
};

export const handler = adminLambdaHandlerDecorator(
  HandlerMethod.DELETE,
  handlerFn,
);
