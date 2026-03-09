import { StackProps } from 'aws-cdk-lib';
import { ENVIRONMENT } from '@OpenClaw/core/constants';

export interface StackPropsWithEnv extends StackProps {
  deployEnv: ENVIRONMENT;
}
