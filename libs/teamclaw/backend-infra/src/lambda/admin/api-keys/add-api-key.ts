import {
  SecretsManagerClient,
  GetSecretValueCommand,
  PutSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { adminLambdaHandlerDecorator, HandlerMethod, HttpStatusCode, validateRequiredEnvVars } from '@TeamClaw/teamclaw/cloud-function';
import type { POSTAndPUTCloudFunctionInput } from '@TeamClaw/teamclaw/cloud-function';
import { parseSecrets, serializeSecrets } from './secrets-format';

validateRequiredEnvVars({ API_KEYS_SECRET_ARN: process.env['API_KEYS_SECRET_ARN'] });

const smClient = new SecretsManagerClient({});
const API_KEYS_SECRET_ARN = process.env['API_KEYS_SECRET_ARN']!;

const handlerFn = async (
  request: POSTAndPUTCloudFunctionInput<Record<string, unknown>>,
): Promise<{ status: number; body: unknown }> => {
  const { body } = request;
  const { provider, key, authType, token, accessToken, refreshToken, expiresAt } = body;

  const effectiveAuthType = (authType as string) || 'apiKey';

  if (!provider) {
    return {
      status: HttpStatusCode.BAD_REQUEST,
      body: { message: 'provider is required' },
    };
  }

  if (effectiveAuthType === 'apiKey') {
    if (!key || typeof key !== 'string' || (key as string).length > 256) {
      return {
        status: HttpStatusCode.BAD_REQUEST,
        body: { message: 'provider and key are required (key must be a non-empty string, max 256 chars)' },
      };
    }
  } else if (effectiveAuthType === 'oauthToken') {
    if (!token && !accessToken) {
      return {
        status: HttpStatusCode.BAD_REQUEST,
        body: { message: 'oauthToken authType requires token or accessToken' },
      };
    }
  } else {
    return {
      status: HttpStatusCode.BAD_REQUEST,
      body: { message: `Invalid authType: ${effectiveAuthType}` },
    };
  }

  // TODO: Read-modify-write on Secrets Manager has no concurrency control.
  // SM does not support optimistic locking (CAS) on PutSecretValue.
  // Admin API key operations should be serialized (one admin at a time).
  // Future fix: use DynamoDB-based advisory lock or a queue for mutations.

  // Read current secret
  const result = await smClient.send(new GetSecretValueCommand({
    SecretId: API_KEYS_SECRET_ARN,
  }));

  const secret = parseSecrets(result.SecretString);

  if (effectiveAuthType === 'apiKey') {
    if (!secret.providers[provider as string]) {
      secret.providers[provider as string] = { authType: 'apiKey', keys: [] };
    }
    const entry = secret.providers[provider as string];
    if (!entry.keys) entry.keys = [];
    entry.keys.push(key as string);

    // Write back
    await smClient.send(new PutSecretValueCommand({
      SecretId: API_KEYS_SECRET_ARN,
      SecretString: serializeSecrets(secret),
    }));

    return {
      status: HttpStatusCode.SUCCESS,
      body: {
        message: 'API key added',
        provider,
        totalKeys: entry.keys.length,
      },
    };
  } else {
    // oauthToken
    secret.providers[provider as string] = {
      authType: 'oauthToken',
      ...(token ? { token: token as string } : {}),
      ...(accessToken ? { accessToken: accessToken as string } : {}),
      ...(refreshToken ? { refreshToken: refreshToken as string } : {}),
      ...(expiresAt ? { expiresAt: expiresAt as number } : {}),
    };

    // Write back
    await smClient.send(new PutSecretValueCommand({
      SecretId: API_KEYS_SECRET_ARN,
      SecretString: serializeSecrets(secret),
    }));

    return {
      status: HttpStatusCode.SUCCESS,
      body: {
        message: 'OAuth token saved',
        provider,
      },
    };
  }
};

export const handler = adminLambdaHandlerDecorator(
  HandlerMethod.POST,
  handlerFn,
);
