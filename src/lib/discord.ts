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
type DiscordChannel = { id: string; name?: string; type?: number };

async function discordGet(token: string, path: string) {
  const trimmed = token.trim();
  const url = path.startsWith('http') ? path : `https://discord.com/api/v10${path}`;
  let res = await desktopRequest(url, { method: 'GET', headers: authHeaders(trimmed, true) });
  if (!res.ok) {
    res = await desktopRequest(url, { method: 'GET', headers: authHeaders(trimmed, false) });
  }
  return res;
}

async function listDiscordGuilds(token: string): Promise<DiscordGuild[]> {
  const res = await discordGet(token, '/users/@me/guilds');
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Could not list Discord servers'));
  return (Array.isArray(res.data) ? res.data : []) as DiscordGuild[];
}

async function listGuildChannels(token: string, guildId: string): Promise<DiscordChannel[]> {
  const res = await discordGet(token, `/guilds/${guildId}/channels`);
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Could not list Discord channels'));
  return (Array.isArray(res.data) ? res.data : []) as DiscordChannel[];
}

/** Resolve a snowflake id or #channel-name (searches first guild, then others). */
export async function resolveDiscordChannel(
  token: string,
  ref: string,
): Promise<{ id: string; name?: string }> {
  const trimmed = ref.trim().replace(/^#/, '');
  if (/^\d{17,20}$/.test(trimmed)) return { id: trimmed };

  const want = trimmed.toLowerCase();
  const guilds = await listDiscordGuilds(token);
  if (guilds.length === 0) throw new Error('No Discord servers visible to resolve channel name');

  for (const guild of guilds) {
    const channels = await listGuildChannels(token, guild.id);
    const match = channels.find(c => (c.name || '').toLowerCase() === want);
    if (match) return { id: match.id, name: match.name || trimmed };
  }
  throw new Error(`No channel named #${trimmed} found in your Discord servers`);
}

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
    const snowflakeMatch = userText.match(
      /(?:post|send|message|write)\s+(?:to\s+)?(?:channel\s+)?(\d{17,20})\s*[:\-]?\s*(.+)$/i,
    );
    const nameMatch = userText.match(
      /(?:post|send|message|write)\s+(?:to\s+)?#([\w-]+)\s*[:\-]?\s*(.+)$/i,
    );
    const channelRef = snowflakeMatch?.[1] || nameMatch?.[1];
    const body = (snowflakeMatch?.[2] || nameMatch?.[2] || '').trim();
    if (!channelRef || !body) {
      return [
        'Discord · post',
        '',
        'Try: post to #general Hello from NOVA',
        'Or: post to channel 123456789012345678 Hello from NOVA',
      ].join('\n');
    }
    const channel = await resolveDiscordChannel(trimmed, channelRef);
    const posted = await postDiscordMessage(trimmed, channel.id, body);
    const label = channel.name ? `#${channel.name}` : `Channel ${channel.id}`;
    return [
      `Discord · posted (@${account.label})`,
      '',
      label,
      body.slice(0, 200),
      posted.id ? `Message id: ${posted.id}` : '',
      '',
      'Live write via Discord API.',
    ].filter(Boolean).join('\n');
  }

  const guilds = await listDiscordGuilds(trimmed);
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
    'Live data from Discord. Post with: post to #general Hello',
  ].join('\n');
}
