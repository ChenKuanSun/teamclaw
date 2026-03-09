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

export const TC_SECRET_MANAGER_ARN = {
  [ENVIRONMENT.PROD]: {
    GITHUB_OAUTH_TOKEN:
      'arn:aws:secretsmanager:ap-southeast-1:023371593417:secret:prod/CHD/github/oauth-Tf3qVq',
  },
  [ENVIRONMENT.DEV]: {
    GITHUB_OAUTH_TOKEN:
      'arn:aws:secretsmanager:ap-southeast-1:023371593417:secret:prod/CHD/github/oauth-Tf3qVq',
  },
};

export const TC_ADMIN_USER_POOL_DOMAIN_PREFIX = {
  [ENVIRONMENT.PROD]: 'teamclaw-admin',
  [ENVIRONMENT.DEV]: 'teamclaw-admin-dev',
};

export const TC_ADMIN_AUTH_CALLBACK_URL = {
  [ENVIRONMENT.PROD]: 'https://admin.teamclaw.com/auth/callback', // placeholder
  [ENVIRONMENT.DEV]: 'https://admin-dev.teamclaw.com/auth/callback', // placeholder
};

export const TC_ADMIN_AUTH_LOGOUT_URL = {
  [ENVIRONMENT.PROD]: 'https://admin.teamclaw.com/auth/login', // placeholder
  [ENVIRONMENT.DEV]: 'https://admin-dev.teamclaw.com/auth/login', // placeholder
};

export const TC_ADMIN_APP_DOMAIN_NAME = {
  [ENVIRONMENT.PROD]: 'admin.teamclaw.com', // placeholder
  [ENVIRONMENT.DEV]: 'admin-dev.teamclaw.com', // placeholder
};
