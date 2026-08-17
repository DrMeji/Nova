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
  + 'Do not paste, continue, or remix a previous assistant answer into this reply. '
  + 'Answer ONLY the latest user message directly with new content.';

const BUILD_HINT =
  /\b(build|create|make|code|app|apps|calculator|website|project|implement|develop|program|software|ui|api)\b/i;
const FACT_HINT =
  /\b(weather|temperature|forecast|rain|humid|capital of|who is|what is|when did|population|india|history of)\b/i;

function significantTokens(text: string): Set<string> {
  return new Set(
    String(text || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter(w => w.length > 3)
      .filter(w => !/^(that|this|with|from|have|what|when|where|your|about|please|would|could|should|there|their)$/i.test(w)),
  );
}

/** True when the latest ask is a new task, not a follow-up to the prior one. */
export function isTopicShift(history: RouterChatTurn[], latestUserMessage: string): boolean {
  const latest = String(latestUserMessage || '').trim();
  if (!latest) return false;
  const priorUsers = history.filter(t => t.role === 'user');
  // history may already include latest as last turn
  const earlier = priorUsers.length > 1
    ? priorUsers[priorUsers.length - 2]
    : priorUsers.length === 1 && priorUsers[0].content !== latest
      ? priorUsers[0]
      : null;
  if (!earlier?.content) return false;
  const a = earlier.content.trim();
  const b = latest;
  if (BUILD_HINT.test(b) && !BUILD_HINT.test(a) && (FACT_HINT.test(a) || a.length > 12)) return true;
  if (FACT_HINT.test(b) && BUILD_HINT.test(a)) return true;
  const ta = significantTokens(a);
  const tb = significantTokens(b);
  if (tb.size < 2 || ta.size < 2) return false;
  let overlap = 0;
  for (const t of tb) if (ta.has(t)) overlap += 1;
  return overlap / tb.size < 0.28;
}

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

  // New task (e.g. weather → “build an app”): drop prior turns so GGUF cannot regurgitate them.
  if (latest && isTopicShift(window, latest)) {
    return [{ role: 'user', content: latest.slice(0, MAX_TURN_CHARS) }];
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
  if (history.length === 1 && history[0].role === 'user') {
    const alone = history[0].content;
    if (BUILD_HINT.test(alone)) {
      return [
        'You are ARK helping the user build software.',
        'Answer this build request only. Do not mention unrelated prior topics.',
        '',
        alone,
      ].join('\n');
    }
    return alone;
  }

  const latest = latestUserMessage(history, latestFallback || '');
  if (isTopicShift(history, latest)) {
    return packHistoryPrompt([{ role: 'user', content: latest }], latest);
  }

  const lines: string[] = [
    'Ongoing ARK conversation.',
    'Answer ONLY the latest User message below.',
    'Do not repeat earlier ARK answers. Do not continue a previous topic unless asked.',
    '',
  ];
  for (const turn of history) {
    const who = turn.role === 'user' ? 'User' : 'ARK';
    lines.push(`${who}: ${turn.content}`);
    lines.push('');
  }
  lines.push(`Latest request: ${latest}`);
  lines.push('ARK:');
  return lines.join('\n');
}

export function latestUserMessage(history: RouterChatTurn[], fallback: string): string {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === 'user') return history[i].content;
  }
  return fallback;
}

/**
 * Strip GGUF / packed-prompt echoes so the bubble never shows “> hello” or
 * a full User:/ARK: transcript before the real answer.
 */
export function sanitizeAssistantReply(
  raw: string,
  lastUserMessage?: string,
  previousAssistant?: string,
): string {
  let text = String(raw || '').replace(/\r\n/g, '\n').trim();
  if (!text) return '';

  // Prefer the completion after the last ARK: / Assistant: marker (packed prompt echo).
  const markRe = /(?:^|\n)\s*(?:ARK|Assistant)\s*:\s*/gi;
  let lastMark: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = markRe.exec(text)) !== null) lastMark = m;
  if (lastMark && typeof lastMark.index === 'number') {
    text = text.slice(lastMark.index + lastMark[0].length).replace(/^\s*ARK\s*:\s*/i, '').trim();
  }

  // Drop leading shell-style echoes: "> hello"
  text = text.replace(/^(?:>\s*.+\n)+/m, '').trim();
  text = text.replace(/^>\s*.+$/m, '').trim();

  const user = String(lastUserMessage || '').trim();
  if (user) {
    const esc = user.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const echoLead = new RegExp(
      `^(?:>\\s*)?(?:User\\s*:\\s*)?${esc}\\s*(?:\\n+|\\s{2,})`,
      'i',
    );
    text = text.replace(echoLead, '').trim();
    // Bare first-line echo of the user message
    const firstLine = text.split('\n')[0]?.trim() || '';
    if (firstLine.toLowerCase() === user.toLowerCase() || firstLine.toLowerCase() === `> ${user}`.toLowerCase()) {
      text = text.slice(firstLine.length).replace(/^\n+/, '').trim();
    }
  }

  // If the model re-emits the previous assistant answer, drop that prefix / paragraphs.
  const prev = String(previousAssistant || '').trim();
  if (prev.length >= 24) {
    const prevLower = prev.toLowerCase();
    const textLower = text.toLowerCase();
    if (textLower === prevLower || (prev.length >= 40 && textLower.startsWith(prevLower))) {
      text = text.slice(prev.length).replace(/^\s*[.…\-–—]+/i, '').trim();
    }
    const prevHead = prev.slice(0, Math.min(180, prev.length)).trim();
    if (prevHead && text.startsWith(prevHead)) {
      text = text.slice(prevHead.length).replace(/^\s*[.…\-–—]+/i, '').trim();
    } else {
      const words = prev.split(/\s+/).slice(0, 14).join(' ');
      if (words.length >= 24 && text.toLowerCase().startsWith(words.toLowerCase())) {
        text = text.slice(words.length).replace(/^\s*[.…\-–—]+/i, '').trim();
      }
    }
    const keptParas = text.split(/\n{2,}/).filter((para) => {
      const chunk = para.trim();
      if (chunk.length < 36) return true;
      const sample = chunk.slice(0, 56).toLowerCase();
      if (prevLower.includes(sample.slice(0, 28))) {
        if (user && significantTokens(user).size > 0) {
          const ut = significantTokens(user);
          const pt = significantTokens(chunk);
          let hit = 0;
          for (const t of ut) if (pt.has(t)) hit += 1;
          if (hit / ut.size < 0.2) return false;
        } else {
          return false;
        }
      }
      return true;
    });
    if (keptParas.length) text = keptParas.join('\n\n').trim();
  }

  // If user asked to build something, strip leftover weather/fact lead-ins.
  if (user && BUILD_HINT.test(user)) {
    text = text
      .split(/\n{2,}/)
      .filter((para) => !FACT_HINT.test(para) || BUILD_HINT.test(para))
      .join('\n\n')
      .trim();
  }

  // Drop "Latest request: ..." echo lines from packed prompts
  text = text.replace(/^Latest request:\s*.+\n+/im, '').trim();

  // Collapse accidental duplicated timeout / error lines glued together
  text = text.replace(
    /(Response timed out\.[^\n]*)\1+/gi,
    '$1',
  );

  // Drop leftover "User: …" lines if the model still mirrored the transcript
  text = text
    .split('\n')
    .filter(line => !/^\s*User\s*:/i.test(line.trim()))
    .filter(line => !/^\s*Latest request:/i.test(line.trim()))
    .join('\n')
    .trim();

  return text;
}
