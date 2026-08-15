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

export async function runSlackLive(token: string, _userText: string): Promise<string> {
  const account = await verifySlackToken(token);
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
    'Live data from Slack.',
  ].join('\n');
}
