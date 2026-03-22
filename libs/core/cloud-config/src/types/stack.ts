import { StackProps } from 'aws-cdk-lib';
import { ENVIRONMENT } from '../common';

export interface StackPropsWithEnv extends StackProps {
  deployEnv: ENVIRONMENT;
}
