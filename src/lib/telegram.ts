import { desktopRequest } from '@/lib/httpDesktop';

export async function verifyTelegramToken(token: string) {
  const res = await desktopRequest(`https://api.telegram.org/bot${token}/getMe`, { method: 'GET' });
  const data = res.data as { ok?: boolean; result?: { username?: string; first_name?: string } };
  if (!res.ok || !data.ok) throw new Error('Telegram bot token was rejected');
  const name = data.result?.username || data.result?.first_name || 'bot';
  return { label: `@${name}` };
}

export async function runTelegramLive(token: string, userText: string): Promise<string> {
  const me = await verifyTelegramToken(token);
  const lower = userText.toLowerCase();
  if (/send|post|message/.test(lower)) {
    const chat = userText.match(/-?\d{5,}/)?.[0];
    const text = userText.replace(/.*(?:say|send|post)\s+/i, '').trim() || userText;
    if (!chat) {
      return [
        'Telegram · connected',
        '',
        `Bot ${me.label} is ready. Include a chat id (numbers) to send.`,
        'Example: using Telegram, send hello to -1001234567890',
      ].join('\n');
    }
    const res = await desktopRequest(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: text.slice(0, 3500) }),
    });
    if (!res.ok) throw new Error('Could not send Telegram message');
    return `Telegram · sent to ${chat} as ${me.label}`;
  }
  return [
    'Telegram · connected',
    '',
    `Bot ${me.label} is live.`,
    'Ask: using Telegram, send hello to CHAT_ID',
  ].join('\n');
}
