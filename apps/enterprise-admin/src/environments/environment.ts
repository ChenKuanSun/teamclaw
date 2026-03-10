/**
 * Production environment configuration for TeamClaw Admin Panel
 *
 * Admin Panel uses a separate Cognito User Pool from TeamClaw App
 * to prevent password conflicts with OAuth flow.
 */
export const environment = {
  isProduction: true,
  auth: {
    clientId: 'TODO_AFTER_DEPLOY',
    domain: 'teamclaw-admin.auth.ap-southeast-1.amazoncognito.com',
  },
  adminApiUrl: 'TODO_AFTER_DEPLOY',
};
