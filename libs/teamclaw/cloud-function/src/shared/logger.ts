import { pino } from 'pino';
import { lambdaRequestTracker, pinoLambdaDestination } from 'pino-lambda';

const LOG_LEVEL = process.env['LOG_LEVEL'] || 'info';

const destination = pinoLambdaDestination();

export const logger = pino(
  {
    level: LOG_LEVEL,
  },
  destination,
);
export const withRequest = lambdaRequestTracker();
