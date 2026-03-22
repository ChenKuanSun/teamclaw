import { App, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { ENVIRONMENT } from '@TeamClaw/core/cloud-config';

export interface TestContext {
  app: App;
  props: {
    env: { account: string; region: string };
    deployEnv: ENVIRONMENT;
  };
}

export const createTestContext = (
  deployEnv: ENVIRONMENT = ENVIRONMENT.DEV,
): TestContext => {
  const app = new App();
  const env = {
    account: '123456789012',
    region: 'us-east-1',
  };

  return {
    app,
    props: { env, deployEnv },
  };
};

export const getTemplate = (stack: Stack): Template => {
  return Template.fromStack(stack);
};

export const createTestStackId = (stackName: string): string => {
  return `Test${stackName}`;
};

export const createTestAppId = (appName: string): string => {
  return `Test${appName}App`;
};
