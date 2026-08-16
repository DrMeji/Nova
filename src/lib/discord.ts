/** Live Discord API helpers (bot token). */

import { apiErrorMessage, desktopRequest } from '@/lib/httpDesktop';

export type DiscordUser = {
  id: string;
  username?: string;
  global_name?: string | null;
  bot?: boolean;
};

export async function verifyDiscordToken(token: string): Promise<{ label: string }> {
  const trimmed = token.trim();
  if (!trimmed) throw new Error('Paste a Discord bot token');
  const res = await desktopRequest('https://discord.com/api/v10/users/@me', {
    method: 'GET',
    headers: { Authorization: `Bot ${trimmed}` },
  });
  if (!res.ok) {
    // Also try bearer (user token) as fallback for advanced users
    const userRes = await desktopRequest('https://discord.com/api/v10/users/@me', {
      method: 'GET',
      headers: { Authorization: trimmed },
    });
    if (!userRes.ok) throw new Error(apiErrorMessage(res, 'Discord error'));
    const u = userRes.data as DiscordUser;
    return { label: u.global_name || u.username || 'Discord' };
  }
  const u = res.data as DiscordUser;
  return { label: u.global_name || u.username || 'Discord bot' };
}

type DiscordGuild = { id: string; name?: string; approximate_member_count?: number };

export async function runDiscordLive(token: string, _userText: string): Promise<string> {
  const trimmed = token.trim();
  const account = await verifyDiscordToken(trimmed);

  // Prefer bot auth header
  let res = await desktopRequest('https://discord.com/api/v10/users/@me/guilds', {
    method: 'GET',
    headers: { Authorization: `Bot ${trimmed}` },
  });
  if (!res.ok) {
    res = await desktopRequest('https://discord.com/api/v10/users/@me/guilds', {
      method: 'GET',
      headers: { Authorization: trimmed },
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
    'Live data from Discord.',
  ].join('\n');
}
