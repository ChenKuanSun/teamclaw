/**
 * Production environment configuration for TeamClaw Admin Panel
 *
 * Admin Panel uses a separate Cognito User Pool from TeamClaw App.
 * Direct username/password auth via Cognito SRP (no OAuth redirect).
 */
export const environment = {
  isProduction: true,
  auth: {
    userPoolId: 'YOUR_ADMIN_COGNITO_USER_POOL_ID',
    clientId: 'YOUR_ADMIN_COGNITO_CLIENT_ID',
  },
  adminApiUrl: 'https://YOUR_API_GATEWAY_URL',
};
