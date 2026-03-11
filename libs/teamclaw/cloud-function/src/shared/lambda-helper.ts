export enum HandlerMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  DELETE = 'DELETE',
}

export enum HttpStatusCode {
  OK = 200,
  CREATED = 201,
  ACCEPTED = 202,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  INTERNAL_SERVER_ERROR = 500,
}

export function validateRequiredEnvVars(vars: string[]): void {
  const missing = vars.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

export function sanitizeErrorMessage(message: string): string {
  return message
    .replace(/arn:aws:[^\s"']+/gi, '[AWS_ARN]')
    .replace(/\d{12}/g, '[ACCOUNT_ID]')
    .replace(/AKIA[A-Z0-9]{16}/g, '[AWS_KEY]')
    .replace(/[A-Za-z0-9/+=]{40}/g, '[SECRET]');
}
