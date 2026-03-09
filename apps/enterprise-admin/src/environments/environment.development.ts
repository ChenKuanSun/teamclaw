/**
 * Development environment configuration for TeamClaw Admin Panel
 */
export const environment = {
  isProduction: false,
  auth: {
    // TODO: Update clientId after deploying AdminCognitoStack
    // Get from SSM: /tc/dev/admin-cognito/userPoolClientId
    clientId: '',
    domain: '',
  },
  adminApiUrl: 'http://localhost:3000/v1',
};
