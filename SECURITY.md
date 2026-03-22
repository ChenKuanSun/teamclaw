# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in TeamClaw, please report it
responsibly. **Do not open a public issue.**

**Email:** security@teamclaw.dev

Include the following in your report:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We will acknowledge receipt within 48 hours and aim to provide a resolution
timeline within 5 business days.

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 0.2.x   | Yes       |
| 0.1.x   | Yes       |

## Security Considerations

### Authentication

- User authentication is handled by AWS Cognito with SRP-based password
  verification.
- All sessions are scoped to individual users with JWT tokens.

### Container Isolation

- Each user runs in an isolated ECS Fargate container with its own filesystem
  namespace.
- Containers have no inbound network access from other user containers.

### API Key Management

- Provider API keys are stored in AWS Secrets Manager, never in application code
  or environment variables.
- Keys are accessed at runtime via the key pool proxy Lambda.

### Data at Rest

- EFS volumes are encrypted using AWS-managed keys.
- DynamoDB tables use encryption at rest by default.

### Data in Transit

- All external communication uses TLS.
- Internal service communication uses VPC-internal networking with security
  group restrictions.

### Dependencies

- Dependencies are regularly reviewed for known vulnerabilities.
- Dependabot or equivalent tooling is recommended for automated vulnerability
  scanning.
