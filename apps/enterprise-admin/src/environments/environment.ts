/**
 * Production environment configuration for TeamClaw Admin Panel
 *
 * Admin Panel uses a separate Cognito User Pool from TeamClaw App.
 * Direct username/password auth via Cognito SRP (no OAuth redirect).
 */
export const environment = {
  isProduction: true,
  auth: {
    userPoolId: 'TODO_AFTER_DEPLOY',
    clientId: 'TODO_AFTER_DEPLOY',
  },
  adminApiUrl: 'TODO_AFTER_DEPLOY',
};
