import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { adminLambdaHandlerDecorator, HandlerMethod, HttpStatusCode, validateRequiredEnvVars } from '@TeamClaw/teamclaw/cloud-function';

validateRequiredEnvVars(['API_KEYS_SECRET_ARN']);

const smClient = new SecretsManagerClient({});
const API_KEYS_SECRET_ARN = process.env['API_KEYS_SECRET_ARN']!;

function maskKey(key: string): string {
  if (key.length <= 4) return '****';
  return '*'.repeat(key.length - 4) + key.slice(-4);
}

export const handler = adminLambdaHandlerDecorator(HandlerMethod.GET, async () => {
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
    status: HttpStatusCode.OK,
    body: { providers: masked },
  };
});
