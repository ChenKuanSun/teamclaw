/**
 * Production environment configuration for TeamClaw Admin Panel
 *
 * Admin Panel uses a separate Cognito User Pool from TeamClaw App.
 * Direct username/password auth via Cognito SRP (no OAuth redirect).
 */
export const environment = {
  isProduction: true,
  auth: {
    userPoolId: 'us-west-1_psi7pd3v5',
    clientId: '44k5e77m24b00mkah09j435jb6',
  },
  adminApiUrl: 'https://9qt1dgv5d5.execute-api.us-west-1.amazonaws.com',
};
