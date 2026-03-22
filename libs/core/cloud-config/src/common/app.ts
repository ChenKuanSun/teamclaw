import { Environment } from 'aws-cdk-lib';

export enum ENVIRONMENT {
  DEV = 'dev',
  PROD = 'prod',
}

export const TC_AWS_CLOUD = {
  [ENVIRONMENT.PROD]: {
    account:
      process.env['CDK_DEFAULT_ACCOUNT'] || process.env['AWS_ACCOUNT_ID'] || '',
    region: process.env['CDK_DEFAULT_REGION'] || 'ap-southeast-1',
  } as Environment,
  [ENVIRONMENT.DEV]: {
    account:
      process.env['CDK_DEFAULT_ACCOUNT'] || process.env['AWS_ACCOUNT_ID'] || '',
    region: process.env['CDK_DEFAULT_REGION'] || 'us-west-1',
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
  [ENVIRONMENT.PROD]: 'main.d2vihiromwsqa2.amplifyapp.com',
  [ENVIRONMENT.DEV]: 'main.d2vihiromwsqa2.amplifyapp.com', // dev cleaned up, use prod
};
export const TC_CHAT_APP_AMPLIFY_DOMAIN = {
  [ENVIRONMENT.PROD]: 'main.d1qn1f00108uy9.amplifyapp.com',
  [ENVIRONMENT.DEV]: 'main.d1qn1f00108uy9.amplifyapp.com', // dev cleaned up, use prod
};

export const TC_ADMIN_APP_DOMAIN_NAME = {
  [ENVIRONMENT.PROD]: TC_ADMIN_APP_AMPLIFY_DOMAIN[ENVIRONMENT.PROD], // TODO: `${TC_ADMIN_APP_SUB_DOMAIN[ENVIRONMENT.PROD]}.${TC_DOMAIN_NAME}`
  [ENVIRONMENT.DEV]: TC_ADMIN_APP_AMPLIFY_DOMAIN[ENVIRONMENT.DEV],
};
