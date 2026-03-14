import { TC_ADMIN_APP_DOMAIN_NAME, TC_CHAT_APP_AMPLIFY_DOMAIN, ENVIRONMENT } from './app';

/**
 * Get allowed CORS origins for Admin API Gateway.
 * Both admin panel and chat app call the same API.
 */
export const getTCAdminApiCorsOrigins = (
  deployEnv: ENVIRONMENT,
): string[] => {
  if (deployEnv === ENVIRONMENT.PROD) {
    return [
      `https://${TC_ADMIN_APP_DOMAIN_NAME[ENVIRONMENT.PROD]}`,
      `https://${TC_CHAT_APP_AMPLIFY_DOMAIN}`,
    ];
  }
  return [
    `https://${TC_ADMIN_APP_DOMAIN_NAME[ENVIRONMENT.DEV]}`,
    `https://${TC_CHAT_APP_AMPLIFY_DOMAIN}`,
    'http://localhost:4900',
    'http://localhost:4200',
  ];
};
