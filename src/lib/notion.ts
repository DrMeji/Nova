/** Live Notion API helpers for the ARK Notion plugin. */

import { apiErrorMessage, desktopRequest } from '@/lib/httpDesktop';

export type NotionUser = {
  id: string;
  name: string | null;
  avatar_url: string | null;
  type: string;
};

export type NotionSearchResult = {
  id: string;
  object: string;
  url?: string;
  properties?: Record<string, unknown>;
};

async function notionRequest<T>(token: string, path: string, init?: { method?: string; body?: unknown }) {
  const url = path.startsWith('http') ? path : `https://api.notion.com/v1${path}`;
  const res = await desktopRequest(url, {
    method: init?.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Notion error'));
  return res.data as T;
}

export async function verifyNotionToken(token: string): Promise<{ label: string }> {
  const trimmed = token.trim();
  if (!trimmed) throw new Error('Paste a Notion integration secret');
  const me = await notionRequest<NotionUser>(trimmed, '/users/me');
  return { label: me.name || 'Notion integration' };
}

export async function searchNotion(token: string, query: string, limit = 8) {
  const result = await notionRequest<{ results: NotionSearchResult[] }>(token, '/search', {
    method: 'POST',
    body: {
      query: query || undefined,
      page_size: limit,
      sort: { direction: 'descending', timestamp: 'last_edited_time' },
    },
  });
  return result.results ?? [];
}

function titleFromResult(item: NotionSearchResult) {
  const props = item.properties;
  if (!props) return item.object === 'database' ? 'Database' : 'Untitled page';
  for (const value of Object.values(props)) {
    if (!value || typeof value !== 'object') continue;
    const v = value as { type?: string; title?: { plain_text?: string }[] };
    if (v.type === 'title' && Array.isArray(v.title) && v.title[0]?.plain_text) {
      return v.title[0].plain_text;
    }
  }
  return 'Untitled';
}

export async function runNotionLive(token: string, userText: string): Promise<string> {
  const lower = userText.toLowerCase();
  const queryMatch = lower.match(/(?:search|find|look up)\s+(.+)$/);
  const query = queryMatch?.[1]?.replace(/[?.!]+$/, '').trim()
    || (/(brief|spec)/.test(lower) ? 'brief' : 'ARK');

  const [account, results] = await Promise.all([
    verifyNotionToken(token),
    searchNotion(token, query),
  ]);

  if (results.length === 0) {
    return [
      `Notion · search (@${account.label})`,
      '',
      `No pages found for “${query}”. Share the integration with pages in Notion, then try again.`,
    ].join('\n');
  }

  const lines = results.slice(0, 8).map((item, i) => {
    const title = titleFromResult(item);
    const kind = item.object === 'database' ? 'database' : 'page';
    return `${i + 1}. ${title} · ${kind}`;
  });

  if (/(brief|spec)/.test(lower) && results[0]) {
    return [
      `Notion · brief (@${account.label})`,
      '',
      `Top match: ${titleFromResult(results[0])}`,
      '',
      'Related:',
      ...lines,
      '',
      'Live data from your Notion workspace.',
    ].join('\n');
  }

  return [
    `Notion · search (@${account.label})`,
    '',
    ...lines,
    '',
    'Live data from your Notion workspace.',
  ].join('\n');
}
