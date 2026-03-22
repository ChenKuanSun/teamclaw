import {
  ENVIRONMENT,
  TC_AWS_CLOUD,
  TC_STACK_PREFIX,
} from '@TeamClaw/core/cloud-config';
import { FoundationStack } from '@TeamClaw/teamclaw/backend-infra';
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

  new FoundationStack(app, stackPrefix + 'FoundationStack', {
    env,
    deployEnv,
  });

  return app;
};
