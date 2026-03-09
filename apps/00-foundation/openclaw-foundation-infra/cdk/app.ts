import { FoundationStack } from '@OpenClaw/openclaw/backend-infra';
import { OC_AWS_CLOUD, OC_STACK_PREFIX } from '@OpenClaw/core/cloud-config';
import { ENVIRONMENT } from '@OpenClaw/core/constants';
import { App } from 'aws-cdk-lib';

export const createApp = (): App => {
  const deployEnv =
    process.env['DEPLOY_ENV'] === ENVIRONMENT.PROD
      ? ENVIRONMENT.PROD
      : ENVIRONMENT.DEV;

  const app = new App();
  const stackPrefix = OC_STACK_PREFIX[deployEnv];
  const env = OC_AWS_CLOUD[deployEnv];

  new FoundationStack(app, stackPrefix + 'FoundationStack', {
    env,
    deployEnv,
  });

  return app;
};
