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
