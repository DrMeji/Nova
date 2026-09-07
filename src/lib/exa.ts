/** Live Exa search API (developer token). */

import { apiErrorMessage, desktopRequest } from '@/lib/httpDesktop';

export async function verifyExaToken(token: string): Promise<{ label: string }> {
  const trimmed = token.trim();
  if (!trimmed) throw new Error('Paste an Exa API key');
  const res = await desktopRequest('https://api.exa.ai/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': trimmed,
    },
    body: JSON.stringify({
      query: 'NOVA connectivity test',
      numResults: 1,
      type: 'auto',
    }),
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Exa key rejected'));
  return { label: 'Exa' };
}

type ExaResult = {
  title?: string;
  url?: string;
  text?: string;
  publishedDate?: string;
};

export async function runExaLive(token: string, userText: string): Promise<string> {
  const query = userText
    .replace(/\b(?:using\s+)?exa\b/gi, '')
    .replace(/\b(?:search|find|look up)\b/gi, '')
    .trim() || userText.trim();

  const res = await desktopRequest('https://api.exa.ai/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': token.trim(),
    },
    body: JSON.stringify({
      query,
      numResults: 6,
      type: 'auto',
      contents: { text: { maxCharacters: 800 } },
    }),
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Exa search failed'));

  const data = res.data as { results?: ExaResult[] };
  const rows = (data.results || []).map((r, i) => {
    const title = r.title || r.url || `Result ${i + 1}`;
    const snippet = String(r.text || '').trim().slice(0, 400);
    return `- **${title}**${r.url ? ` · ${r.url}` : ''}${snippet ? `\n  ${snippet}` : ''}`;
  });

  return [
    'Exa · search results',
    '',
    rows.length ? rows.join('\n') : 'No results.',
  ].join('\n');
}
