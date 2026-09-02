/** Where users create API keys for each cloud provider. */
export const PROVIDER_KEY_URLS: Record<string, string> = {
  openai: 'https://platform.openai.com/api-keys',
  anthropic: 'https://console.anthropic.com/settings/keys',
  google: 'https://aistudio.google.com/apikey',
  groq: 'https://console.groq.com/keys',
  openrouter: 'https://openrouter.ai/keys',
  huggingface: 'https://huggingface.co/settings/tokens',
  nvidia: 'https://build.nvidia.com/settings/api-keys',
  together: 'https://api.together.xyz/settings/api-keys',
  fireworks: 'https://fireworks.ai/account/api-keys',
  deepseek: 'https://platform.deepseek.com/api_keys',
  mistral: 'https://console.mistral.ai/api-keys',
  cerebras: 'https://cloud.cerebras.ai',
  sambanova: 'https://cloud.sambanova.ai',
  perplexity: 'https://www.perplexity.ai/settings/api',
  xai: 'https://console.x.ai',
};

export function providerKeyUrl(providerId: string): string | undefined {
  return PROVIDER_KEY_URLS[providerId];
}
