/**
 * TeamClaw Admin Panel CDK Application
 *
 * This CDK app deploys the admin-specific infrastructure:
 * - Admin Cognito User Pool (separate from TeamClaw App to prevent OAuth password conflicts)
 * - Admin API Gateway (separate from main API)
 * - Admin Lambda functions
 * - Admin API routes
 *
 * Authentication: Uses separate Admin Cognito User Pool with email whitelist
 */
import {
  AdminAmplifyStack,
  AdminApiGatewayStack,
  AdminApiGatewayRouteStack,
  AdminCognitoStack,
  AdminLambdaStack,
} from '@TeamClaw/teamclaw/backend-infra';
import {
  ENVIRONMENT,
  TC_AWS_CLOUD,
  TC_STACK_PREFIX,
} from '@TeamClaw/core/cloud-config';
import { App } from 'aws-cdk-lib';

export const createApp = (): App => {
  // Read environment variable dynamically for better testability
  const deployEnv =
    process.env['DEPLOY_ENV'] === ENVIRONMENT.PROD
      ? ENVIRONMENT.PROD
      : ENVIRONMENT.DEV;

  const app = new App();
  // Use 'Admin' suffix to distinguish from main stacks
  const stackPrefix = TC_STACK_PREFIX[deployEnv] + 'Admin';
  const env = TC_AWS_CLOUD[deployEnv];

  // ==========================================================
  // Admin Cognito User Pool (separate from TeamClaw App)
  // Prevents password conflicts with TeamClaw App's OAuth flow
  // which resets passwords on each Google/Microsoft login.
  // ==========================================================
  const adminCognitoStack = new AdminCognitoStack(
    app,
    stackPrefix + 'CognitoStack',
    { env, deployEnv },
  );

  // ==========================================================
  // Admin API Gateway (separate from main API)
  // ==========================================================
  const adminApiGatewayStack = new AdminApiGatewayStack(
    app,
    stackPrefix + 'APIGatewayStack',
    { env, deployEnv },
  );

  // ==========================================================
  // Admin Lambda Functions
  // ==========================================================
  const adminLambdaStack = new AdminLambdaStack(
    app,
    stackPrefix + 'LambdaStack',
    { env, deployEnv },
  );

  // ==========================================================
  // Admin API Gateway Routes
  // ==========================================================
  const adminApiGatewayRouteStack = new AdminApiGatewayRouteStack(
    app,
    stackPrefix + 'APIGatewayRouteStack',
    { env, deployEnv },
  );
  adminApiGatewayRouteStack.addDependency(adminCognitoStack);
  adminApiGatewayRouteStack.addDependency(adminApiGatewayStack);
  adminApiGatewayRouteStack.addDependency(adminLambdaStack);

  // ==========================================================
  // Admin Amplify (always deploys to PROD region)
  // ==========================================================
  new AdminAmplifyStack(app, stackPrefix + 'AmplifyStack', {
    env: TC_AWS_CLOUD[ENVIRONMENT.PROD],
    deployEnv,
  });

  return app;
};
