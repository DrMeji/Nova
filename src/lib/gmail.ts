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

function buildMime({ to, subject, body }: { to: string; subject: string; body: string }) {
  const lines = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'MIME-Version: 1.0',
    '',
    body,
  ];
  const raw = lines.join('\r\n');
  // URL-safe base64 without padding
  const b64 = btoa(unescape(encodeURIComponent(raw)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return b64;
}

export async function sendGmail(
  token: string,
  opts: { to: string; subject: string; body: string },
) {
  const res = await desktopRequest('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: buildMime(opts) }),
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Gmail send failed (needs gmail.send)'));
  return res.data as { id?: string };
}

export async function runGmailLive(
  token: string,
  userText: string,
  opts?: { permissions?: string[] },
): Promise<string> {
  const lower = userText.toLowerCase();
  const account = await verifyGmailToken(token);
  const perms = opts?.permissions || [];
  const { estimate, messages } = await listUnread(token);

  // Confirm send: "confirm send to alice@x.com subject Hello body Thanks"
  if (/\bconfirm\s+send\b/.test(lower)) {
    if (perms.length > 0 && !perms.includes('send')) {
      return [
        'Gmail · permission needed',
        '',
        'Sending needs Send. Enable it under Plugins → Gmail → Permissions.',
      ].join('\n');
    }
    const toMatch = userText.match(/\bto\s+([^\s]+@[^\s]+)/i);
    const subMatch = userText.match(/\bsubject\s+(.+?)(?:\s+body\s+|$)/i);
    const bodyMatch = userText.match(/\bbody\s+(.+)$/i);
    const to = toMatch?.[1]?.replace(/[>,]+$/, '') || '';
    const subject = (subMatch?.[1] || 'Hello from ARK').trim();
    const body = (bodyMatch?.[1] || 'Sent from ARK.').trim();
    if (!to) {
      return [
        'Gmail · send',
        '',
        'Try: confirm send to you@example.com subject Hello body Thanks for your note',
      ].join('\n');
    }
    const sent = await sendGmail(token, { to, subject, body });
    return [
      `Gmail · sent (@${account.label})`,
      '',
      `To: ${to}`,
      `Subject: ${subject}`,
      sent.id ? `Message id: ${sent.id}` : '',
      '',
      'Live send via Gmail API.',
    ].filter(Boolean).join('\n');
  }

  if (/(draft|reply)/.test(lower)) {
    const top = messages[0];
    const subject = top ? header(top, 'Subject') || '(no subject)' : '(no unread mail)';
    const from = top ? header(top, 'From') : '';
    const toAddr = from.match(/<([^>]+)>/)?.[1] || from;
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
      toAddr
        ? `To send for real (needs Send permission + gmail.send scope):`
        : 'Draft only until you confirm send.',
      toAddr
        ? `confirm send to ${toAddr} subject Re: ${subject} body Thanks for your note — following up from ARK.`
        : '',
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
    'Ask me to draft a reply, or “confirm send to …” when Send is enabled.',
  ].join('\n');
}
