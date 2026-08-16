/** Live Discord API helpers (bot token). */

import { apiErrorMessage, desktopRequest } from '@/lib/httpDesktop';

export type DiscordUser = {
  id: string;
  username?: string;
  global_name?: string | null;
  bot?: boolean;
};

function authHeaders(token: string, asBot = true) {
  return { Authorization: asBot ? `Bot ${token.trim()}` : token.trim() };
}

export async function verifyDiscordToken(token: string): Promise<{ label: string }> {
  const trimmed = token.trim();
  if (!trimmed) throw new Error('Paste a Discord bot token');
  const res = await desktopRequest('https://discord.com/api/v10/users/@me', {
    method: 'GET',
    headers: authHeaders(trimmed, true),
  });
  if (!res.ok) {
    const userRes = await desktopRequest('https://discord.com/api/v10/users/@me', {
      method: 'GET',
      headers: authHeaders(trimmed, false),
    });
    if (!userRes.ok) throw new Error(apiErrorMessage(res, 'Discord error'));
    const u = userRes.data as DiscordUser;
    return { label: u.global_name || u.username || 'Discord' };
  }
  const u = res.data as DiscordUser;
  return { label: u.global_name || u.username || 'Discord bot' };
}

type DiscordGuild = { id: string; name?: string; approximate_member_count?: number };

export async function postDiscordMessage(token: string, channelId: string, content: string) {
  const trimmed = token.trim();
  let res = await desktopRequest(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      ...authHeaders(trimmed, true),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content: content.slice(0, 1900) }),
  });
  if (!res.ok) {
    res = await desktopRequest(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        ...authHeaders(trimmed, false),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content: content.slice(0, 1900) }),
    });
  }
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Discord post failed'));
  return res.data as { id?: string };
}

export async function runDiscordLive(
  token: string,
  userText: string,
  opts?: { permissions?: string[] },
): Promise<string> {
  const trimmed = token.trim();
  const account = await verifyDiscordToken(trimmed);
  const lower = userText.toLowerCase();
  const perms = opts?.permissions || [];

  if (/\b(post|send|message|write)\b/.test(lower)) {
    if (perms.length > 0 && !perms.includes('write') && !perms.includes('send')) {
      return [
        'Discord · permission needed',
        '',
        'Posting needs Write. Enable it under Plugins → Discord → Permissions.',
      ].join('\n');
    }
    const idMatch = userText.match(/\b(\d{17,20})\b/);
    const channelId = idMatch?.[1];
    const bodyMatch = userText.match(
      /(?:post|send|message|write)\s+(?:to\s+)?(?:channel\s+)?\d{17,20}\s*[:\-]?\s*(.+)$/i,
    );
    const body = (bodyMatch?.[1] || '').trim();
    if (!channelId || !body) {
      return [
        'Discord · post',
        '',
        'Try: post to channel 123456789012345678 Hello from ARK',
        '(Use a channel snowflake id the bot can see.)',
      ].join('\n');
    }
    const posted = await postDiscordMessage(trimmed, channelId, body);
    return [
      `Discord · posted (@${account.label})`,
      '',
      `Channel ${channelId}`,
      body.slice(0, 200),
      posted.id ? `Message id: ${posted.id}` : '',
      '',
      'Live write via Discord API.',
    ].filter(Boolean).join('\n');
  }

  let res = await desktopRequest('https://discord.com/api/v10/users/@me/guilds', {
    method: 'GET',
    headers: authHeaders(trimmed, true),
  });
  if (!res.ok) {
    res = await desktopRequest('https://discord.com/api/v10/users/@me/guilds', {
      method: 'GET',
      headers: authHeaders(trimmed, false),
    });
  }
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Could not list Discord servers'));

  const guilds = (Array.isArray(res.data) ? res.data : []) as DiscordGuild[];
  if (guilds.length === 0) {
    return [
      `Discord · servers (@${account.label})`,
      '',
      'No servers visible. Invite the bot to a server, then try again.',
    ].join('\n');
  }

  return [
    `Discord · servers (@${account.label})`,
    '',
    ...guilds.slice(0, 12).map((g, i) => {
      const members = g.approximate_member_count != null ? ` · ~${g.approximate_member_count} members` : '';
      return `${i + 1}. ${g.name || g.id}${members}`;
    }),
    '',
    'Live data from Discord. Post with: post to channel <id> Hello',
  ].join('\n');
}
