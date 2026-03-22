import {
  ENVIRONMENT,
  TC_AWS_CLOUD,
  TC_STACK_PREFIX,
} from '@TeamClaw/core/cloud-config';
import {
  AmplifyStack,
  ControlPlaneStack,
} from '@TeamClaw/teamclaw/backend-infra';
import { App, Tags } from 'aws-cdk-lib';

export const createApp = (): App => {
  const deployEnv =
    process.env['DEPLOY_ENV'] === ENVIRONMENT.PROD
      ? ENVIRONMENT.PROD
      : ENVIRONMENT.DEV;

  const app = new App();
  Tags.of(app).add('Project', 'TeamClaw');
  Tags.of(app).add('Environment', deployEnv);
  Tags.of(app).add('ManagedBy', 'CDK');
  const stackPrefix = TC_STACK_PREFIX[deployEnv];
  const env = TC_AWS_CLOUD[deployEnv];

  new ControlPlaneStack(app, stackPrefix + 'ControlPlaneStack', {
    env,
    deployEnv,
  });

  // Amplify always deploys to PROD region (ap-southeast-1), matching Affiora pattern
  new AmplifyStack(app, stackPrefix + 'AmplifyStack', {
    env: TC_AWS_CLOUD[ENVIRONMENT.PROD],
    deployEnv,
  });

  return app;
};
