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
  const { pathParameters } = request;

  // Route: DELETE /admin/api-keys/{keyId}
  // keyId format: "provider" (for OAuth) or "provider:keySuffix" (for API keys)
  const rawKeyId = pathParameters?.['keyId'];

  if (!rawKeyId) {
    return {
      status: HttpStatusCode.BAD_REQUEST,
      body: { message: 'keyId path parameter is required' },
    };
  }

  const decoded = decodeURIComponent(rawKeyId);
  const colonIdx = decoded.indexOf(':');
  const provider = colonIdx >= 0 ? decoded.substring(0, colonIdx) : decoded;
  const keySuffix = colonIdx >= 0 ? decoded.substring(colonIdx + 1) : undefined;

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

  // For API key providers: remove key by matching suffix
  if (!keySuffix) {
    return {
      status: HttpStatusCode.BAD_REQUEST,
      body: { message: 'keySuffix is required for API key providers (format: provider:keySuffix)' },
    };
  }

  const keys = entry.keys || [];
  const matchIdx = keys.findIndex(k => k.endsWith(keySuffix));

  if (matchIdx < 0) {
    return {
      status: HttpStatusCode.NOT_FOUND,
      body: { message: 'Key not found matching the given suffix' },
    };
  }

  keys.splice(matchIdx, 1);

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
