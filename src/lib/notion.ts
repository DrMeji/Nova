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

type NotionRichText = { plain_text?: string };
type NotionBlock = {
  id: string;
  type: string;
  has_children?: boolean;
  paragraph?: { rich_text?: NotionRichText[] };
  heading_1?: { rich_text?: NotionRichText[] };
  heading_2?: { rich_text?: NotionRichText[] };
  heading_3?: { rich_text?: NotionRichText[] };
  bulleted_list_item?: { rich_text?: NotionRichText[] };
  numbered_list_item?: { rich_text?: NotionRichText[] };
  to_do?: { rich_text?: NotionRichText[]; checked?: boolean };
  quote?: { rich_text?: NotionRichText[] };
  code?: { rich_text?: NotionRichText[] };
  callout?: { rich_text?: NotionRichText[] };
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

function richTextToPlain(parts?: NotionRichText[]) {
  if (!Array.isArray(parts)) return '';
  return parts.map(p => p.plain_text || '').join('');
}

function blockToLine(block: NotionBlock): string | null {
  const type = block.type;
  const rich =
    block.paragraph?.rich_text
    || block.heading_1?.rich_text
    || block.heading_2?.rich_text
    || block.heading_3?.rich_text
    || block.bulleted_list_item?.rich_text
    || block.numbered_list_item?.rich_text
    || block.to_do?.rich_text
    || block.quote?.rich_text
    || block.code?.rich_text
    || block.callout?.rich_text;
  const text = richTextToPlain(rich).trim();
  if (!text) return null;
  if (type === 'heading_1') return `# ${text}`;
  if (type === 'heading_2') return `## ${text}`;
  if (type === 'heading_3') return `### ${text}`;
  if (type === 'bulleted_list_item') return `• ${text}`;
  if (type === 'numbered_list_item') return `- ${text}`;
  if (type === 'to_do') return `${block.to_do?.checked ? '☑' : '☐'} ${text}`;
  if (type === 'quote') return `> ${text}`;
  if (type === 'code') return `\`\`\`\n${text}\n\`\`\``;
  return text;
}

/** Create a simple page under a parent page (or as a workspace child of first search hit). */
export async function createNotionPage(
  token: string,
  title: string,
  body?: string,
  parentPageId?: string,
) {
  let parentId = parentPageId;
  if (!parentId) {
    const hits = await searchNotion(token, 'ARK');
    const page = hits.find(h => h.object === 'page');
    if (!page) throw new Error('Share at least one page with the integration, then try again');
    parentId = page.id;
  }
  const children = body
    ? [{
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: body.slice(0, 1900) } }],
        },
      }]
    : [];
  const created = await notionRequest<{ id: string; url?: string }>(token, '/pages', {
    method: 'POST',
    body: {
      parent: { page_id: parentId },
      properties: {
        title: {
          title: [{ type: 'text', text: { content: title.slice(0, 200) } }],
        },
      },
      children,
    },
  });
  return created;
}

/** Pull plain text from a Notion page for briefs/specs. */
export async function fetchNotionPageText(token: string, pageId: string, maxChars = 3500) {
  const result = await notionRequest<{ results: NotionBlock[] }>(
    token,
    `/blocks/${pageId}/children?page_size=50`,
  );
  const lines: string[] = [];
  for (const block of result.results || []) {
    const line = blockToLine(block);
    if (line) lines.push(line);
  }
  const joined = lines.join('\n').trim();
  if (!joined) return '';
  return joined.length > maxChars ? `${joined.slice(0, maxChars)}…` : joined;
}

export async function runNotionLive(
  token: string,
  userText: string,
  opts?: { permissions?: string[] },
): Promise<string> {
  const lower = userText.toLowerCase();
  const perms = opts?.permissions || [];

  if (/\b(create|update|write|add)\b/.test(lower) && /page|note|doc/.test(lower)) {
    if (perms.length > 0 && !perms.includes('write')) {
      return [
        'Notion · permission needed',
        '',
        'Creating or updating pages needs Write. Enable it under Plugins → Notion → Permissions.',
      ].join('\n');
    }
    const titleMatch = userText.match(
      /(?:create|add|new|write)\s+(?:a\s+)?(?:page|note|doc)\s*[:\-]?\s*(.+)$/i,
    );
    const title = (titleMatch?.[1] || 'Note from ARK').replace(/[?.!]+$/, '').trim().slice(0, 120);
    const account = await verifyNotionToken(token);
    const page = await createNotionPage(token, title, `Created from ARK chat:\n${userText.slice(0, 500)}`);
    return [
      `Notion · created (@${account.label})`,
      '',
      title,
      page.url || page.id,
      '',
      'Live write via Notion pages API.',
    ].join('\n');
  }

  if (/\b(create|update|write|add)\b/.test(lower) && perms.length > 0 && !perms.includes('write')) {
    return [
      'Notion · permission needed',
      '',
      'Creating or updating pages needs Write. Enable it under Plugins → Notion → Permissions.',
    ].join('\n');
  }

  const queryMatch = lower.match(/(?:search|find|look up|open|read)\s+(.+)$/);
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

  const wantBody = /(brief|spec|read|open|content|summar)/.test(lower);
  const top = results.find(r => r.object === 'page') || results[0];

  if (wantBody && top?.object === 'page') {
    try {
      const body = await fetchNotionPageText(token, top.id);
      return [
        `Notion · ${/(brief|spec)/.test(lower) ? 'brief' : 'page'} (@${account.label})`,
        '',
        `Page: ${titleFromResult(top)}`,
        top.url ? top.url : '',
        '',
        body || '(Page has no readable text blocks yet — check sharing permissions.)',
        '',
        'Related:',
        ...lines,
      ].filter(Boolean).join('\n');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not read page';
      return [
        `Notion · page (@${account.label})`,
        '',
        `Found “${titleFromResult(top)}” but could not read blocks: ${msg}`,
        '',
        'Related:',
        ...lines,
      ].join('\n');
    }
  }

  return [
    `Notion · search (@${account.label})`,
    '',
    ...lines,
    '',
    'Ask to “read” or “open” a page for full text, or “create page Meeting notes”. Live data from your Notion workspace.',
  ].join('\n');
}
