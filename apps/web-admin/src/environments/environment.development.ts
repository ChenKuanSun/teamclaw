/**
 * Development environment configuration for TeamClaw Admin Panel
 *
 * Admin Panel uses a separate Cognito User Pool from TeamClaw App.
 * SRP auth via Cognito (matching prod behavior).
 *
 * Values sourced from SSM at `/tc/dev/admin-*` (chddev account, us-west-1).
 */
export const environment = {
  isProduction: false,
  auth: {
    userPoolId: 'us-west-1_t8qDzd1mU',
    clientId: '535jegk3vn11ss5fr3i53s49lg',
    domain: 'teamclaw-admin-dev.auth.us-west-1.amazoncognito.com',
  },
  adminApiUrl: 'https://adojhfztx1.execute-api.us-west-1.amazonaws.com',
};
