/**
 * Development environment configuration for TeamClaw Admin Panel
 *
 * Admin Panel uses a separate Cognito User Pool from TeamClaw App.
 * OAuth PKCE flow via Cognito Hosted UI (no direct password auth).
 */
export const environment = {
  isProduction: false,
  auth: {
    clientId: '44k5e77m24b00mkah09j435jb6',
    // TODO: Update after deploying Cognito domain — get from SSM or CDK output
    domain: 'teamclaw-admin-dev.auth.us-west-1.amazoncognito.com',
  },
  adminApiUrl: 'https://9qt1dgv5d5.execute-api.us-west-1.amazonaws.com',
};
