import { Environment } from 'aws-cdk-lib';

export enum ENVIRONMENT {
  DEV = 'dev',
  PROD = 'prod',
}

export const TC_AWS_CLOUD = {
  [ENVIRONMENT.PROD]: {
    account: '023371593417',
    region: 'ap-southeast-1',
  } as Environment,
  [ENVIRONMENT.DEV]: {
    account: '023371593417',
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

// Temporary: Amplify preview URL until custom domain is configured
export const TC_ADMIN_APP_AMPLIFY_DOMAIN = 'main.d2m2o9gjll7vqx.amplifyapp.com';

export const TC_ADMIN_APP_DOMAIN_NAME = {
  [ENVIRONMENT.PROD]: TC_ADMIN_APP_AMPLIFY_DOMAIN, // TODO: `${TC_ADMIN_APP_SUB_DOMAIN[ENVIRONMENT.PROD]}.${TC_DOMAIN_NAME}`
  [ENVIRONMENT.DEV]: TC_ADMIN_APP_AMPLIFY_DOMAIN,
};

export const TC_ADMIN_USER_POOL_DOMAIN_PREFIX = {
  [ENVIRONMENT.PROD]: 'teamclaw-admin',
  [ENVIRONMENT.DEV]: 'teamclaw-admin-dev',
};
