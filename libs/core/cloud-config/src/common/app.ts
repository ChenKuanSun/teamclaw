import { Environment } from 'aws-cdk-lib';

export enum ENVIRONMENT {
  DEV = 'dev',
  PROD = 'prod',
}

// Region is fixed per environment — do NOT read CDK_DEFAULT_REGION, which would
// let the active AWS profile's region override the intended deployment target
// (e.g. cross-region stacks like Amplify deploying to prod region from a dev profile).
// Account is still env-driven because it varies per-account but never needs to cross.
export const TC_AWS_CLOUD = {
  [ENVIRONMENT.PROD]: {
    account:
      process.env['CDK_DEFAULT_ACCOUNT'] || process.env['AWS_ACCOUNT_ID'] || '',
    region: 'ap-southeast-1',
  } as Environment,
  [ENVIRONMENT.DEV]: {
    account:
      process.env['CDK_DEFAULT_ACCOUNT'] || process.env['AWS_ACCOUNT_ID'] || '',
    region: 'us-west-1',
  } as Environment,
};

export const TC_STACK_PREFIX = {
  [ENVIRONMENT.PROD]: 'ProdTc',
  [ENVIRONMENT.DEV]: 'DevTc',
};

export const TC_SERVICE_NAME_PREFIX = {
  [ENVIRONMENT.PROD]: 'Prod_Tc_',
  [ENVIRONMENT.DEV]: 'Dev_Tc_',
};

export const TC_DOMAIN_NAME = 'teamclaw.com';

export const TC_ADMIN_APP_SUB_DOMAIN = {
  [ENVIRONMENT.PROD]: 'admin',
  [ENVIRONMENT.DEV]: 'admin-dev',
};

// Amplify domains per environment
export const TC_ADMIN_APP_AMPLIFY_DOMAIN = {
  [ENVIRONMENT.PROD]: 'YOUR_ADMIN_AMPLIFY_DOMAIN',
  [ENVIRONMENT.DEV]: 'YOUR_ADMIN_AMPLIFY_DOMAIN', // dev cleaned up, use prod
};
export const TC_CHAT_APP_AMPLIFY_DOMAIN = {
  [ENVIRONMENT.PROD]: 'YOUR_CHAT_AMPLIFY_DOMAIN',
  [ENVIRONMENT.DEV]: 'YOUR_CHAT_AMPLIFY_DOMAIN', // dev cleaned up, use prod
};

export const TC_ADMIN_APP_DOMAIN_NAME = {
  [ENVIRONMENT.PROD]: TC_ADMIN_APP_AMPLIFY_DOMAIN[ENVIRONMENT.PROD], // TODO: `${TC_ADMIN_APP_SUB_DOMAIN[ENVIRONMENT.PROD]}.${TC_DOMAIN_NAME}`
  [ENVIRONMENT.DEV]: TC_ADMIN_APP_AMPLIFY_DOMAIN[ENVIRONMENT.DEV],
};
