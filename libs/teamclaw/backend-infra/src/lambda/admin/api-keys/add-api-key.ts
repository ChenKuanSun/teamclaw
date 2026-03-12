import {
  SecretsManagerClient,
  GetSecretValueCommand,
  PutSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { adminLambdaHandlerDecorator, HandlerMethod, HttpStatusCode, validateRequiredEnvVars } from '@TeamClaw/teamclaw/cloud-function';
import type { POSTAndPUTCloudFunctionInput } from '@TeamClaw/teamclaw/cloud-function';

validateRequiredEnvVars({ API_KEYS_SECRET_ARN: process.env['API_KEYS_SECRET_ARN'] });

const smClient = new SecretsManagerClient({});
const API_KEYS_SECRET_ARN = process.env['API_KEYS_SECRET_ARN']!;

const handlerFn = async (
  request: POSTAndPUTCloudFunctionInput<Record<string, unknown>>,
): Promise<{ status: number; body: unknown }> => {
  const { body } = request;
  const { provider, key } = body;

  if (!provider || !key || typeof key !== 'string' || (key as string).length > 256) {
    return {
      status: HttpStatusCode.BAD_REQUEST,
      body: { message: 'provider and key are required (key must be a non-empty string, max 256 chars)' },
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

  const keys: Record<string, string[]> = JSON.parse(result.SecretString || '{}');

  // Append key to provider
  if (!keys[provider as string]) {
    keys[provider as string] = [];
  }
  keys[provider as string].push(key as string);

  // Write back
  await smClient.send(new PutSecretValueCommand({
    SecretId: API_KEYS_SECRET_ARN,
    SecretString: JSON.stringify(keys),
  }));

  return {
    status: HttpStatusCode.SUCCESS,
    body: {
      message: 'API key added',
      provider,
      totalKeys: keys[provider as string].length,
    },
  };
};

export const handler = adminLambdaHandlerDecorator(
  HandlerMethod.POST,
  handlerFn,
);
