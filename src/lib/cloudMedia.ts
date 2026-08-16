/** Cloud image generation using keys stored in local prefs. */

import { getProviderApiKeys } from '@/lib/localPrefs';
import { apiErrorMessage, desktopRequest } from '@/lib/httpDesktop';

export async function cloudGenerateImage(prompt: string): Promise<{
  dataUrl?: string;
  url?: string;
  provider: string;
  reply: string;
  tier?: 'free-key' | 'paid';
} | null> {
  const keys = getProviderApiKeys();
  const trimmed = String(prompt || '').slice(0, 3500);

  // Free-key first: Hugging Face Inference (FLUX schnell when available)
  if (keys.huggingface) {
    const hosts = [
      'https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell',
      'https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell',
    ];
    for (const url of hosts) {
      try {
        const res = await desktopRequest(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${keys.huggingface}`,
            'Content-Type': 'application/json',
            Accept: 'image/png',
          },
          body: JSON.stringify({ inputs: trimmed }),
        });
        if (!res.ok) continue;
        const dataUrl = binaryPayloadToDataUrl(res.data, 'image/png');
        if (!dataUrl) continue;
        return {
          dataUrl,
          provider: 'Hugging Face · FLUX.1 schnell',
          tier: 'free-key',
          reply: [
            'Cloud image · Hugging Face FLUX',
            '',
            `Prompt: “${trimmed.slice(0, 160)}”`,
            '',
            `![${trimmed.slice(0, 80)}](${dataUrl})`,
          ].join('\n'),
        };
      } catch {
        /* try next host */
      }
    }
  }

  if (keys.openai) {
    const res = await desktopRequest('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${keys.openai}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: trimmed,
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
      tier: 'paid',
      reply: [
        'Cloud image · OpenAI DALL·E 3',
        '',
        `Prompt: “${trimmed.slice(0, 160)}”`,
        '',
        embed ? `![${trimmed.slice(0, 80)}](${embed})` : 'No image payload returned.',
      ].join('\n'),
    };
  }

  return null;
}

function binaryPayloadToDataUrl(data: unknown, fallbackMime: string): string | null {
  if (!data || typeof data !== 'object') return null;
  const payload = data as { __binary?: boolean; mime?: string; base64?: string };
  if (payload.__binary && typeof payload.base64 === 'string' && payload.base64.length > 100) {
    return `data:${payload.mime || fallbackMime};base64,${payload.base64}`;
  }
  return null;
}
