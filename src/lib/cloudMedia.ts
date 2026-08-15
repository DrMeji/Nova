/** Cloud image generation using keys stored in local prefs. */

import { getProviderApiKeys } from '@/lib/localPrefs';
import { apiErrorMessage, desktopRequest } from '@/lib/httpDesktop';

export async function cloudGenerateImage(prompt: string): Promise<{
  dataUrl?: string;
  url?: string;
  provider: string;
  reply: string;
} | null> {
  const keys = getProviderApiKeys();

  if (keys.openai) {
    const res = await desktopRequest('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${keys.openai}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: prompt.slice(0, 3500),
        size: '1024x1024',
        response_format: 'b64_json',
        n: 1,
      }),
    });
    if (!res.ok) throw new Error(apiErrorMessage(res, 'OpenAI image error'));
    const data = res.data as { data?: { b64_json?: string; url?: string }[] };
    const b64 = data.data?.[0]?.b64_json;
    const url = data.data?.[0]?.url;
    const dataUrl = b64 ? `data:image/png;base64,${b64}` : undefined;
    const embed = dataUrl || url;
    return {
      dataUrl,
      url,
      provider: 'OpenAI · DALL·E 3',
      reply: [
        'Cloud image · OpenAI DALL·E 3',
        '',
        `Prompt: “${prompt.slice(0, 160)}”`,
        '',
        embed ? `![${prompt.slice(0, 80)}](${embed})` : 'No image payload returned.',
      ].join('\n'),
    };
  }

  if (keys.openrouter) {
    // OpenRouter image models vary; try a free/open route style chat with image if unavailable skip
    return null;
  }

  return null;
}
