/** Live Gmail helpers (Google OAuth access token). */

import { apiErrorMessage, desktopRequest } from '@/lib/httpDesktop';

export type GoogleUser = {
  email: string;
  name?: string;
  picture?: string;
};

async function googleGet<T>(token: string, url: string) {
  const res = await desktopRequest(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token.trim()}` },
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Gmail error'));
  return res.data as T;
}

export async function verifyGmailToken(token: string): Promise<{ label: string }> {
  const trimmed = token.trim();
  if (!trimmed) throw new Error('Paste a Google OAuth access token');
  const me = await googleGet<GoogleUser>(
    trimmed,
    'https://www.googleapis.com/oauth2/v2/userinfo',
  );
  if (!me.email) throw new Error('Token verified but no email returned');
  return { label: me.email };
}

type GmailList = {
  messages?: { id: string; threadId: string }[];
  resultSizeEstimate?: number;
};

type GmailMessage = {
  id: string;
  snippet?: string;
  payload?: {
    headers?: { name: string; value: string }[];
  };
};

function header(msg: GmailMessage, name: string) {
  const h = msg.payload?.headers?.find(x => x.name.toLowerCase() === name.toLowerCase());
  return h?.value ?? '';
}

export async function listUnread(token: string, limit = 5) {
  const list = await googleGet<GmailList>(
    token,
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent('is:unread')}&maxResults=${limit}`,
  );
  const ids = list.messages ?? [];
  const messages: GmailMessage[] = [];
  for (const item of ids.slice(0, limit)) {
    const full = await googleGet<GmailMessage>(
      token,
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
    );
    messages.push(full);
  }
  return { estimate: list.resultSizeEstimate ?? messages.length, messages };
}

export async function runGmailLive(token: string, userText: string): Promise<string> {
  const lower = userText.toLowerCase();
  const account = await verifyGmailToken(token);
  const { estimate, messages } = await listUnread(token);

  if (/(draft|reply)/.test(lower)) {
    const top = messages[0];
    const subject = top ? header(top, 'Subject') || '(no subject)' : '(no unread mail)';
    const from = top ? header(top, 'From') : '';
    return [
      `Gmail · draft reply (@${account.label})`,
      '',
      `Re: ${subject}`,
      from ? `To: ${from}` : '',
      '',
      'Hi,',
      '',
      'Thanks for your note — I saw this in my inbox and wanted to follow up. Happy to continue the conversation whenever works for you.',
      '',
      'Best,',
      'You',
      '',
      'Draft only. Send permission is not used yet.',
      'Live metadata from Gmail.',
    ].filter(Boolean).join('\n');
  }

  if (messages.length === 0) {
    return [
      `Gmail · inbox (@${account.label})`,
      '',
      'No unread messages right now.',
    ].join('\n');
  }

  return [
    `Gmail · unread (@${account.label})`,
    '',
    `About ${estimate} unread`,
    '',
    ...messages.map((msg, i) => {
      const from = header(msg, 'From') || 'Unknown';
      const subject = header(msg, 'Subject') || '(no subject)';
      const snip = msg.snippet ? ` · ${msg.snippet.slice(0, 80)}` : '';
      return `${i + 1}. ${from} — “${subject}”${snip}`;
    }),
    '',
    'Ask me to draft a reply. Live data from Gmail.',
  ].join('\n');
}
