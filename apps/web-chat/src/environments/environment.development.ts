/**
 * Development environment configuration for TeamClaw Chat UI.
 *
 * Values sourced from SSM (chddev account, us-west-1):
 *   /tc/dev/cognito/userPoolId
 *   /tc/dev/cognito/userPoolClientId
 *   /tc/dev/ecs/albDnsName (CloudFront fronting the WSS gateway)
 *   /tc/dev/admin-api/httpApiEndpoint
 */
export const environment = {
  isProduction: false,
  cognito: {
    userPoolId: 'us-west-1_PbHPnPt0f',
    clientId: 'vinegf2qdebl35sgl5aqp4bq5',
  },
  teamclawGatewayUrl: 'wss://d3a58r4v4m80ef.cloudfront.net',
  adminApiUrl: 'https://adojhfztx1.execute-api.us-west-1.amazonaws.com',
};
