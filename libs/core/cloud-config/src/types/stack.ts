import { StackProps } from 'aws-cdk-lib';
import { ENVIRONMENT } from '../common/app';

export interface StackPropsWithEnv extends StackProps {
  deployEnv: ENVIRONMENT;
}
