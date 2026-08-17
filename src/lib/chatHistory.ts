/**
 * ARK-owned chat memory for Router hops.
 * The thread lives in ARK; each provider gets a compact recent window
 * so failover continues mid-task instead of greeting like a new chat.
 */

export type RouterChatTurn = {
  role: 'user' | 'assistant';
  content: string;
};

const MAX_TURNS = 16;
const MAX_CHARS = 12_000;
const MAX_TURN_CHARS = 2_400;

const BASE_SYSTEM =
  'You are ARK, a professional AI creation studio assistant for building software, coding, and creation. '
  + 'Be concise and useful. Never echo the user’s greeting back (do not reply “Hello” then another hello). '
  + 'If the user only says hi/hello, reply once with a short professional offer of help — for example: '
  + '“How can I assist you today?” — and nothing else.';

const CONTINUITY =
  'You are continuing an ongoing ARK conversation. Use the prior messages as context. '
  + 'Do not restart with a greeting, intro, or “what would you like to do today?” '
  + 'Do not repeat the user’s words back as a quote. '
  + 'Pick up mid-task and answer the latest user message directly.';

/** Strip UI / media noise so providers get usable text. */
export function slimTurnContent(content: string): string {
  const raw = (content || '').trim();
  if (!raw) return '';
  if (raw.startsWith('__generating__:')) return '';
  if (raw.includes('ark-media:')) {
    const title = raw.match(/^#+\s*(.+)$/m)?.[1]?.trim();
    return title ? `[Prior media creation: ${title.slice(0, 120)}]` : '[Prior media creation in this chat]';
  }
  // Drop giant data-URLs / markdown images
  let text = raw
    .replace(/!\[[^\]]*]\(data:[^)]+\)/g, '[image]')
    .replace(/!\[[^\]]*]\(https?:[^)]+\)/g, '[image]')
    .replace(/data:image\/[a-zA-Z+]+;base64,[A-Za-z0-9+/=]+/g, '[image]');
  // Drop accidental llama.cpp banners that may have been stored in older threads
  if (/loading model|available commands|llama\.cpp/i.test(text)) {
    const ark = text.match(/(?:^|\n)\s*(?:ARK|Assistant)\s*:\s*([\s\S]+)/i);
    if (ark?.[1]) text = ark[1].replace(/^\s*ARK\s*:\s*/i, '');
    text = text
      .split('\n')
      .filter(line => {
        const t = line.trim();
        if (!t) return true;
        if (/^(loading model|build\s*:|model\s*:|ftype\s*:|modalities\s*:|available commands)/i.test(t)) return false;
        if (/^\[\s*Prompt:/i.test(t)) return false;
        if (/ark-engine[\\/]+models/i.test(t)) return false;
        return true;
      })
      .join('\n')
      .trim();
  }
  if (text.length > MAX_TURN_CHARS) {
    text = `${text.slice(0, MAX_TURN_CHARS)}…`;
  }
  return text.trim();
}

type LooseMessage = {
  role?: string;
  content?: string;
};

/**
 * Build a router history window from the UI thread + the message about to send.
 * `prior` should be messages already in the thread (not the empty assistant placeholder).
 */
export function buildRouterHistory(
  prior: LooseMessage[],
  latestUserMessage: string,
): RouterChatTurn[] {
  const turns: RouterChatTurn[] = [];
  for (const m of prior) {
    const role = m.role === 'assistant' ? 'assistant' : m.role === 'user' ? 'user' : null;
    if (!role) continue;
    const content = slimTurnContent(m.content || '');
    if (!content) continue;
    turns.push({ role, content });
  }

  const latest = slimTurnContent(latestUserMessage) || latestUserMessage.trim();
  if (latest) {
    const last = turns[turns.length - 1];
    if (!(last?.role === 'user' && last.content === latest)) {
      turns.push({ role: 'user', content: latest });
    }
  }

  // Keep the most recent turns, then trim by total size from the front.
  let window = turns.slice(-MAX_TURNS);
  let total = window.reduce((n, t) => n + t.content.length, 0);
  while (window.length > 1 && total > MAX_CHARS) {
    const removed = window.shift();
    total -= removed?.content.length || 0;
  }
  // Ensure we still end on the latest user turn
  if (window.length === 0 && latest) {
    window = [{ role: 'user', content: latest.slice(0, MAX_TURN_CHARS) }];
  }
  return window;
}

export function routerSystemPrompt(history: RouterChatTurn[]): string {
  const hasPrior = history.some(t => t.role === 'assistant') || history.length > 1;
  return hasPrior ? `${BASE_SYSTEM}\n\n${CONTINUITY}` : BASE_SYSTEM;
}

/** Pack history into one prompt for engines that only take a single string (GGUF / Core / Ollama generate). */
export function packHistoryPrompt(history: RouterChatTurn[], latestFallback?: string): string {
  if (history.length === 0) return latestFallback || '';
  if (history.length === 1 && history[0].role === 'user') return history[0].content;

  const lines: string[] = [
    'Ongoing ARK conversation — continue from context. Do not restart with a greeting.',
    '',
  ];
  for (const turn of history) {
    const who = turn.role === 'user' ? 'User' : 'ARK';
    lines.push(`${who}: ${turn.content}`);
    lines.push('');
  }
  lines.push('ARK:');
  return lines.join('\n');
}

export function latestUserMessage(history: RouterChatTurn[], fallback: string): string {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === 'user') return history[i].content;
  }
  return fallback;
}
