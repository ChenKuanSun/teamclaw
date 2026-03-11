import { TC_ADMIN_APP_DOMAIN_NAME, ENVIRONMENT } from './app';

/**
 * Get allowed CORS origins for Admin API Gateway.
 * Centralized to ensure consistency across API Gateway and Lambda handlers.
 */
export const getTCAdminApiCorsOrigins = (
  deployEnv: ENVIRONMENT,
): string[] => {
  if (deployEnv === ENVIRONMENT.PROD) {
    return [
      `https://${TC_ADMIN_APP_DOMAIN_NAME[ENVIRONMENT.PROD]}`,
    ];
  }
  return [
    `https://${TC_ADMIN_APP_DOMAIN_NAME[ENVIRONMENT.DEV]}`,
    'http://localhost:4900',
  ];
};
