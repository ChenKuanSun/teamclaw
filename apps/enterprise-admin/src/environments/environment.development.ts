/**
 * Development environment configuration for TeamClaw Admin Panel
 *
 * Admin Panel uses a separate Cognito User Pool from TeamClaw App
 * to prevent password conflicts with OAuth flow.
 */
export const environment = {
  isProduction: false,
  auth: {
    clientId: '44k5e77m24b00mkah09j435jb6',
    domain: 'teamclaw-admin-dev.auth.us-west-1.amazoncognito.com',
  },
  adminApiUrl: 'https://8g98kdb0eb.execute-api.us-west-1.amazonaws.com/v1',
};
