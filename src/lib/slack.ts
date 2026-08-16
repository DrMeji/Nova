/** Live Slack helpers (bot token). */

import { apiErrorMessage, desktopRequest } from '@/lib/httpDesktop';

export async function verifySlackToken(token: string): Promise<{ label: string }> {
  const trimmed = token.trim();
  if (!trimmed) throw new Error('Paste a Slack bot token (xoxb-…)');
  const res = await desktopRequest('https://api.slack.com/api/auth.test', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${trimmed}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });
  const data = res.data as { ok?: boolean; error?: string; team?: string; user?: string };
  if (!res.ok || !data.ok) throw new Error(data.error || apiErrorMessage(res, 'Slack error'));
  return { label: data.team || data.user || 'Slack' };
}

type SlackChannel = { id: string; name?: string; is_member?: boolean; num_members?: number };
type SlackMessage = { text?: string; user?: string; ts?: string };

export async function searchSlack(token: string, query: string, limit = 8) {
  const q = encodeURIComponent(query || 'ARK');
  const res = await desktopRequest(
    `https://api.slack.com/api/search.messages?query=${q}&count=${limit}`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${token.trim()}` },
    },
  );
  const data = res.data as {
    ok?: boolean;
    error?: string;
    messages?: { matches?: { text?: string; username?: string; permalink?: string; channel?: { name?: string } }[] };
  };
  if (!res.ok || !data.ok) throw new Error(data.error || 'Slack search failed (needs search:read scope)');
  return data.messages?.matches ?? [];
}

export async function runSlackLive(
  token: string,
  userText: string,
  opts?: { permissions?: string[] },
): Promise<string> {
  const account = await verifySlackToken(token);
  const lower = userText.toLowerCase();
  const perms = opts?.permissions || [];

  if (/\b(search|find|look up)\b/.test(lower)) {
    if (perms.length > 0 && !perms.includes('search') && !perms.includes('read')) {
      return [
        'Slack · permission needed',
        '',
        'Search needs the Search permission. Enable it under Plugins → Slack → Permissions.',
      ].join('\n');
    }
    const qMatch = userText.match(/(?:search|find|look up)\s+(.+)$/i);
    const query = (qMatch?.[1] || 'ARK').replace(/[?.!]+$/, '').trim();
    try {
      const matches = await searchSlack(token, query);
      if (matches.length === 0) {
        return [
          `Slack · search (@${account.label})`,
          '',
          `No messages found for “${query}”.`,
        ].join('\n');
      }
      return [
        `Slack · search “${query}” (@${account.label})`,
        '',
        ...matches.slice(0, 8).map((m, i) => {
          const ch = m.channel?.name ? `#${m.channel.name}` : 'channel';
          const who = m.username || 'someone';
          const text = (m.text || '').replace(/\s+/g, ' ').slice(0, 140);
          return `${i + 1}. ${ch} · ${who}: ${text}${m.permalink ? `\n   ${m.permalink}` : ''}`;
        }),
        '',
        'Live Slack search.',
      ].join('\n');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Search failed';
      return [
        `Slack · search (@${account.label})`,
        '',
        msg,
        '',
        'Bot tokens need the search:read scope (or use a user token with search). Listing channels instead…',
      ].join('\n');
    }
  }

  const res = await desktopRequest('https://api.slack.com/api/conversations.list?limit=12&exclude_archived=true&types=public_channel,private_channel', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token.trim()}` },
  });
  const data = res.data as { ok?: boolean; error?: string; channels?: SlackChannel[] };
  if (!res.ok || !data.ok) throw new Error(data.error || 'Could not list Slack channels');
  const channels = data.channels ?? [];
  if (channels.length === 0) {
    return [
      `Slack · channels (@${account.label})`,
      '',
      'No channels visible for this bot. Invite the bot into channels, then try again.',
    ].join('\n');
  }
  return [
    `Slack · channels (@${account.label})`,
    '',
    ...channels.slice(0, 10).map((c, i) => `${i + 1}. #${c.name ?? c.id}${c.is_member ? ' · member' : ''}`),
    '',
    'Live data from Slack. Try “search project launch” when Search is enabled.',
  ].join('\n');
}
