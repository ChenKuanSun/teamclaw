import { Environment } from 'aws-cdk-lib';
import { ENVIRONMENT } from '@OpenClaw/core/constants';

export const OC_AWS_CLOUD = {
  [ENVIRONMENT.PROD]: {
    account: process.env['CDK_DEFAULT_ACCOUNT'] ?? '',
    region: 'ap-southeast-1',
  } as Environment,
  [ENVIRONMENT.DEV]: {
    account: process.env['CDK_DEFAULT_ACCOUNT'] ?? '',
    region: 'ap-southeast-1',
  } as Environment,
};

export const OC_STACK_PREFIX = {
  [ENVIRONMENT.PROD]: 'ProdOc',
  [ENVIRONMENT.DEV]: 'DevOc',
};

export const OC_SERVICE_NAME_PREFIX = {
  [ENVIRONMENT.PROD]: 'Prod_Oc_',
  [ENVIRONMENT.DEV]: 'Dev_Oc_',
};
