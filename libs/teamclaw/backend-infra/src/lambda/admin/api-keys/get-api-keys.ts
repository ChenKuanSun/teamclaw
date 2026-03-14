import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { adminLambdaHandlerDecorator, HandlerMethod, HttpStatusCode, validateRequiredEnvVars } from '@TeamClaw/teamclaw/cloud-function';
import type { GETAndDELETECloudFunctionInput } from '@TeamClaw/teamclaw/cloud-function';
import { parseSecrets } from './secrets-format';

validateRequiredEnvVars({ API_KEYS_SECRET_ARN: process.env['API_KEYS_SECRET_ARN'] });

const smClient = new SecretsManagerClient({});
const API_KEYS_SECRET_ARN = process.env['API_KEYS_SECRET_ARN']!;

function maskKey(key: string): string {
  if (key.length <= 4) return '****';
  return '*'.repeat(key.length - 4) + key.slice(-4);
}

const handlerFn = async (
  request: GETAndDELETECloudFunctionInput,
): Promise<{ status: number; body: unknown }> => {
  const result = await smClient.send(new GetSecretValueCommand({
    SecretId: API_KEYS_SECRET_ARN,
  }));

  const secret = parseSecrets(result.SecretString);

  const masked: Record<string, unknown> = {};
  for (const [provider, entry] of Object.entries(secret.providers)) {
    if (entry.authType === 'oauthToken') {
      masked[provider] = {
        authType: 'oauthToken',
        hasToken: !!entry.token,
        hasAccessToken: !!entry.accessToken,
        hasRefreshToken: !!entry.refreshToken,
        ...(entry.expiresAt ? { expiresAt: entry.expiresAt } : {}),
      };
    } else {
      masked[provider] = {
        authType: 'apiKey',
        keys: (entry.keys || []).map((key, index) => ({
          index,
          masked: maskKey(key),
        })),
      };
    }
  }

  return {
    status: HttpStatusCode.SUCCESS,
    body: { providers: masked },
  };
};

export const handler = adminLambdaHandlerDecorator(
  HandlerMethod.GET,
  handlerFn,
);
