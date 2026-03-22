export type ProviderAuthType = 'apiKey' | 'oauthToken' | 'awsSdk';

export interface ProviderDefinition {
  id: string;
  name: string;
  authType: ProviderAuthType;
  baseUrl: string;
  authHeader?: string;
  rawHeader?: boolean;
  extraHeaders?: Record<string, string>;
}

export const PROVIDER_REGISTRY: ProviderDefinition[] = [
  {
    id: 'anthropic',
    name: 'Anthropic (API Key)',
    authType: 'apiKey',
    baseUrl: 'https://api.anthropic.com',
    authHeader: 'x-api-key',
    rawHeader: true,
    extraHeaders: {
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'fine-grained-tool-streaming-2025-05-14,interleaved-thinking-2025-05-14',
    },
  },
  {
    id: 'anthropic-token',
    name: 'Anthropic (Setup Token)',
    authType: 'oauthToken',
    baseUrl: 'https://api.anthropic.com',
    extraHeaders: {
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'claude-code-20250219,oauth-2025-04-20,fine-grained-tool-streaming-2025-05-14,interleaved-thinking-2025-05-14',
    },
  },
  {
    id: 'openai',
    name: 'OpenAI (API Key)',
    authType: 'apiKey',
    baseUrl: 'https://api.openai.com',
  },
  {
    id: 'openai-codex',
    name: 'OpenAI Codex (Subscription)',
    authType: 'oauthToken',
    baseUrl: 'https://api.openai.com',
  },
  {
    id: 'google',
    name: 'Google Gemini',
    authType: 'apiKey',
    baseUrl: 'https://generativelanguage.googleapis.com',
    authHeader: 'x-goog-api-key',
    rawHeader: true,
  },
  {
    id: 'amazon-bedrock',
    name: 'Amazon Bedrock',
    authType: 'awsSdk',
    baseUrl: '',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    authType: 'apiKey',
    baseUrl: 'https://openrouter.ai/api',
  },
  {
    id: 'mistral',
    name: 'Mistral',
    authType: 'apiKey',
    baseUrl: 'https://api.mistral.ai',
  },
  {
    id: 'together',
    name: 'Together AI',
    authType: 'apiKey',
    baseUrl: 'https://api.together.xyz',
  },
  {
    id: 'groq',
    name: 'Groq',
    authType: 'apiKey',
    baseUrl: 'https://api.groq.com/openai',
  },
  {
    id: 'xai',
    name: 'xAI (Grok)',
    authType: 'apiKey',
    baseUrl: 'https://api.x.ai',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    authType: 'apiKey',
    baseUrl: 'https://api.deepseek.com',
  },
  {
    id: 'fireworks',
    name: 'Fireworks AI',
    authType: 'apiKey',
    baseUrl: 'https://api.fireworks.ai/inference',
  },
];

export const PROXY_PROVIDERS = PROVIDER_REGISTRY.filter(p => p.authType !== 'awsSdk');

export function getProvider(id: string): ProviderDefinition | undefined {
  return PROVIDER_REGISTRY.find(p => p.id === id);
}
