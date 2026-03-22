export interface CredentialField {
  key: string;
  label: string;
  type: 'secret' | 'text';
  required: boolean;
  placeholder?: string;
}

export interface IntegrationDefinition {
  integrationId: string;
  displayName: string;
  description: string;
  category:
    | 'productivity'
    | 'messaging'
    | 'developer-tools'
    | 'project-management';
  icon: string; // Material icon name
  credentialSchema: CredentialField[];
  envVarPrefix: string;
}

/** Lookup an integration definition by ID. Returns undefined if not found. */
export function getCatalogEntry(
  integrationId: string,
): IntegrationDefinition | undefined {
  return INTEGRATION_CATALOG.find(d => d.integrationId === integrationId);
}

/**
 * Get the envVarPrefix for a given integration ID.
 * Falls back to uppercased integrationId if not found.
 */
export function getEnvVarPrefix(integrationId: string): string {
  return (
    getCatalogEntry(integrationId)?.envVarPrefix ?? integrationId.toUpperCase()
  );
}

export const INTEGRATION_CATALOG: readonly IntegrationDefinition[] = [
  {
    integrationId: 'notion',
    displayName: 'Notion',
    description: 'Read and write Notion pages and databases',
    category: 'productivity',
    icon: 'description',
    credentialSchema: [
      {
        key: 'token',
        label: 'Integration Token',
        type: 'secret',
        required: true,
        placeholder: 'secret_...',
      },
    ],
    envVarPrefix: 'NOTION',
  },
  {
    integrationId: 'slack',
    displayName: 'Slack',
    description: 'Send messages and interact with Slack workspaces',
    category: 'messaging',
    icon: 'chat',
    credentialSchema: [
      {
        key: 'botToken',
        label: 'Bot Token',
        type: 'secret',
        required: true,
        placeholder: 'xoxb-...',
      },
    ],
    envVarPrefix: 'SLACK',
  },
  {
    integrationId: 'github',
    displayName: 'GitHub',
    description: 'Access repositories, issues, and pull requests',
    category: 'developer-tools',
    icon: 'code',
    credentialSchema: [
      {
        key: 'token',
        label: 'Personal Access Token',
        type: 'secret',
        required: true,
        placeholder: 'ghp_...',
      },
    ],
    envVarPrefix: 'GITHUB',
  },
  {
    integrationId: 'jira',
    displayName: 'Jira',
    description: 'Create and manage Jira issues',
    category: 'project-management',
    icon: 'bug_report',
    credentialSchema: [
      { key: 'email', label: 'Email', type: 'text', required: true },
      { key: 'token', label: 'API Token', type: 'secret', required: true },
      {
        key: 'baseUrl',
        label: 'Jira URL',
        type: 'text',
        required: true,
        placeholder: 'https://your-org.atlassian.net',
      },
    ],
    envVarPrefix: 'JIRA',
  },
  {
    integrationId: 'confluence',
    displayName: 'Confluence',
    description: 'Search and read Confluence pages',
    category: 'productivity',
    icon: 'article',
    credentialSchema: [
      { key: 'email', label: 'Email', type: 'text', required: true },
      { key: 'token', label: 'API Token', type: 'secret', required: true },
      {
        key: 'baseUrl',
        label: 'Confluence URL',
        type: 'text',
        required: true,
        placeholder: 'https://your-org.atlassian.net/wiki',
      },
    ],
    envVarPrefix: 'CONFLUENCE',
  },
  {
    integrationId: 'linear',
    displayName: 'Linear',
    description: 'Create and track Linear issues',
    category: 'project-management',
    icon: 'track_changes',
    credentialSchema: [
      {
        key: 'token',
        label: 'API Key',
        type: 'secret',
        required: true,
        placeholder: 'lin_api_...',
      },
    ],
    envVarPrefix: 'LINEAR',
  },
];
