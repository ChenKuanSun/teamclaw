/**
 * Production environment configuration for TeamClaw Admin Panel
 *
 * Admin Panel uses a separate Cognito User Pool from TeamClaw Chat App
 * to prevent password conflicts with OAuth flow.
 */
export const environment = {
  isProduction: true,
  auth: {
    // TODO: Update clientId after deploying AdminCognitoStack
    // Get from SSM: /tc/prod/admin-cognito/userPoolClientId
    clientId: '',
    domain: '',
  },
  adminApiUrl: '',
};
