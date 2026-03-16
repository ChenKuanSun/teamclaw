/**
 * Production environment configuration for TeamClaw Admin Panel
 *
 * Admin Panel uses a separate Cognito User Pool from TeamClaw App.
 * Direct username/password auth via Cognito SRP (no OAuth redirect).
 */
export const environment = {
  isProduction: true,
  auth: {
    userPoolId: 'ap-southeast-1_2SB4gnWfW',
    clientId: '4tsui2ffrpsqa2v3k46792l55d',
  },
  adminApiUrl: 'https://sxlapmufkf.execute-api.ap-southeast-1.amazonaws.com',
};
