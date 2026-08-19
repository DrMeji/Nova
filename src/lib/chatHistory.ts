/**
 * ARK-owned chat memory for Router hops.
 * The thread lives in ARK; each provider gets a compact recent window
 * so failover continues mid-task instead of greeting like a new chat.
 */

export type RouterChatTurn = {
  role: 'user' | 'assistant';
  content: string;
  /** Base64 image parts for vision-capable providers (Gemini / GPT-4o). */
  images?: { mime: string; data: string }[];
};

const MAX_TURNS = 16;
const MAX_CHARS = 12_000;
const MAX_TURN_CHARS = 2_400;

const BASE_SYSTEM =
  'You are ARK, the assistant inside the ARK desktop creation studio on this computer. '
  + 'ARK the product can chat, write and edit code, generate images and video, run a local AI brain, and connect free/cloud models. '
  + 'You are not the video game Ark: Survival Evolved, not a dinosaur-survival game, and not an unrelated game engine. '
  + 'Never “correct” the user’s spelling of ARK. Never mention that game unless they clearly ask about it by name. '
  + 'Be concise. Never echo the user’s greeting. '
  + 'If they only say hi/hello, reply once: “How can I assist you today?”';

const CONTINUITY =
  'This is a follow-up in the same ARK app chat. '
  + 'Answer the latest user message with a brand-new reply. '
  + 'If they ask to continue, tell more, or go on, finish the previous answer from where it stopped — do not restart the same list from item 1. '
  + 'If they asked a new question, do not repeat an earlier list.';

const CHAT_CODE_OUTPUT =
  'Give one short intro sentence, then one complete markdown code fence. No placeholders.';

const SYSTEM_ECHO_RE =
  /^You are ARK(?:,|\s)[\s\S]*?(?:Do not echo the prompt\.|Never continue a previous sentence[^.\n]*\.|Answer only the latest user message[^.\n]*\.)/i;
const PROMPT_FRAGMENT_RE =
  /^(?:You are ARK\b|Answer the latest user request clearly\.?|Do not echo the prompt\.?|Do not correct the spelling of ARK\.?|Answer only the latest user message with a brand-new reply\.?|Never continue a previous sentence, list item, or closing question\.?)$/i;
const INSTRUCTION_LEAD_RES = [
  /^Never continue a previous sentence[^\n]*\.?\s*/i,
  /^The user wants working source code[^\n]*\.?\s*/i,
  /^Reply with:\s*\(1\)[^\n]*\s*/i,
  /^Give one short intro sentence[^\n]*\.?\s*/i,
  /^Answer only the latest user message[^\n]*\.?\s*/i,
  /^Do not (?:echo the prompt|correct the spelling of ARK|repeat system instructions)[^\n]*\.?\s*/i,
  /^Pick the right fence tag[^\n]*\.?\s*/i,
  /^You are ARK, the assistant[^\n]*(?:\n(?!```)[^\n]{0,240})*\n+/i,
];


const CODING_WORKSPACE_ECHO_RE =
  /^You are ARK inside a developer project workspace[\s\S]*?(?:WITHOUT @@@FILE blocks\.|answer normally WITHOUT @@@FILE blocks\.)/i;

const BUILD_HINT =
  /\b(build|create|make|implement|develop)\b.{0,48}\b(app|apps|website|site|calculator|program|game|page|ui)\b|\b(write|give|paste|show)\b.{0,32}\b(code|html|css|javascript|python|script|source)\b|\bfull (file|source)\b|\bcopy and paste\b/i;
const TEACH_HINT =
  /\b(teach|learn|tutorial|explain how|how (do i|to|can i) (learn|code|program|start))\b/i;

const FACT_HINT =
  /\b(weather|temperature|forecast|rain|humid|capital of|who is|what is|when did|population|india|history of)\b/i;
const STORY_HINT = /\b(story|joke|poem|song|riddle|fairytale)\b/i;
const GREET_HINT = /^(hi|hello|hey|yo|sup|howdy)\b/i;
const FOLLOW_UP_HINT =
  /^(?:(?:can you |could you |please )?(?:tell me more|say more|go on|continue|elaborate)|more|why|how so|and\b|also\b|what about|ok but|please explain)\b/i;

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
  if (FOLLOW_UP_HINT.test(latest)) return false;
  const priorUsers = history.filter(t => t.role === 'user');
  const earlier = priorUsers.length > 1
    ? priorUsers[priorUsers.length - 2]
    : priorUsers.length === 1 && priorUsers[0].content !== latest
      ? priorUsers[0]
      : null;
  if (!earlier?.content) return false;
  const a = earlier.content.trim();
  const b = latest;
  if (GREET_HINT.test(a) && !GREET_HINT.test(b) && !FOLLOW_UP_HINT.test(b)) return true;
  if (STORY_HINT.test(b) && !STORY_HINT.test(a)) return true;
  if (STORY_HINT.test(a) && !STORY_HINT.test(b) && !FOLLOW_UP_HINT.test(b)) return true;
  if (BUILD_HINT.test(b) && !BUILD_HINT.test(a) && (FACT_HINT.test(a) || a.length > 12)) return true;
  if (FACT_HINT.test(b) && BUILD_HINT.test(a)) return true;
  const ta = significantTokens(a);
  const tb = significantTokens(b);
  if (tb.size < 2 || ta.size < 2) {
    return a.toLowerCase() !== b.toLowerCase() && !FOLLOW_UP_HINT.test(b);
  }
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
    const text = raw.replace(/!\[[^\]]*]\(ark-media:[^)]+\)/g, '').trim();
    const note = '[Attached image]';
    return text ? `${text}\n\n${note}` : note;
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
    const slice = text.slice(0, MAX_TURN_CHARS);
    const breakAt = Math.max(
      slice.lastIndexOf('\n'),
      slice.lastIndexOf('. '),
      slice.lastIndexOf('? '),
      slice.lastIndexOf('! '),
      slice.lastIndexOf(' '),
    );
    const cut = breakAt > MAX_TURN_CHARS * 0.45 ? slice.slice(0, breakAt + 1) : slice;
    text = `${cut.trimEnd()}…`;
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
  images?: { mime: string; data: string }[],
): RouterChatTurn[] {
  const turns: RouterChatTurn[] = [];
  for (const m of prior) {
    const role = m.role === 'assistant' ? 'assistant' : m.role === 'user' ? 'user' : null;
    if (!role) continue;
    let content = slimTurnContent(m.content || '');
    if (!content) continue;
    // Keep prior assistant turns short so local models do not “finish” a truncated line.
    if (role === 'assistant' && content.length > 720) {
      const slice = content.slice(0, 720);
      const breakAt = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('\n'), slice.lastIndexOf(' '));
      content = `${(breakAt > 280 ? slice.slice(0, breakAt + 1) : slice).trimEnd()}…`;
    }
    turns.push({ role, content });
  }

  const latest = slimTurnContent(latestUserMessage) || latestUserMessage.trim();
  const vision = images?.length ? images : undefined;
  if (latest) {
    const last = turns[turns.length - 1];
    if (!(last?.role === 'user' && last.content === latest)) {
      turns.push({ role: 'user', content: latest, images: vision });
    } else if (vision) {
      last.images = vision;
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
    window = [{ role: 'user', content: latest.slice(0, MAX_TURN_CHARS), images: vision }];
  }

  // New task (e.g. weather → “build an app”): drop prior turns so GGUF cannot regurgitate them.
  if (latest && isTopicShift(window, latest)) {
    return [{ role: 'user', content: latest.slice(0, MAX_TURN_CHARS), images: vision }];
  }

  return window;
}

export function routerSystemPrompt(history: RouterChatTurn[]): string {
  const latest = latestUserMessage(history, '');
  const hasVision = history.some(t => t.images?.length);
  const visionNote = hasVision
    ? '\n\nThe user attached a photo. If this request includes image pixels, describe what you see. If you cannot see the image, say so in one line and do not invent the contents.'
    : '';
  const hasPrior = history.some(t => t.role === 'assistant') || history.length > 1;
  if (!hasPrior) return `${BASE_SYSTEM}${visionNote}`;
  if (FOLLOW_UP_HINT.test(latest.trim())) {
    return `${BASE_SYSTEM}\n\nThis is a follow-up. Continue the previous answer from where it stopped. Do not restart the same numbered list from 1.${visionNote}`;
  }
  return `${BASE_SYSTEM}\n\n${CONTINUITY}${visionNote}`;
}

function wantsChatCode(latest: string) {
  return BUILD_HINT.test(latest) && !TEACH_HINT.test(latest);
}

/** Pack history into one prompt for engines that only take a single string (GGUF / Core / Ollama generate). */
export function packHistoryPrompt(history: RouterChatTurn[], latestFallback?: string): string {
  const latest = latestUserMessage(history, latestFallback || '').trim();
  if (!latest) return latestFallback || '';

  // Keep identity in the ChatML system turn (arkGguf wrapChatPrompt). Stuffing it into
  // the user text makes Qwen parrot “Never continue a previous sentence…” in the bubble.
  if (history.length <= 1 || !history.some(t => t.role === 'assistant') || isTopicShift(history, latest)) {
    return wantsChatCode(latest) ? `${CHAT_CODE_OUTPUT}\n\n${latest}` : latest;
  }

  const priorUsers = history
    .filter(t => t.role === 'user' && t.content.trim() && t.content.trim() !== latest)
    .slice(-3)
    .map(t => `- ${t.content.replace(/\s+/g, ' ').slice(0, 160)}`);
  const lastAssistant = [...history].reverse().find(t => t.role === 'assistant')?.content
    ?.replace(/\s+/g, ' ')
    .trim()
    .slice(-900);

  if (wantsChatCode(latest)) {
    return [
      CHAT_CODE_OUTPUT,
      priorUsers.length ? `Earlier user asks:\n${priorUsers.join('\n')}` : '',
      lastAssistant ? `Previous answer (may be incomplete):\n${lastAssistant}` : '',
      `Latest:\n${latest}`,
    ].filter(Boolean).join('\n\n');
  }

  const follow = FOLLOW_UP_HINT.test(latest.trim());
  return [
    priorUsers.length ? `Earlier user asks${follow ? '' : ' (already answered)'}:\n${priorUsers.join('\n')}` : '',
    lastAssistant
      ? `${follow ? 'Previous answer — continue from the end, do not restart:\n' : 'Previous answer:\n'}${lastAssistant}`
      : '',
    `Latest:\n${latest}`,
  ].filter(Boolean).join('\n\n');
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

  // Drop full system-prompt echoes from GGUF / packed prompts.
  text = text.replace(SYSTEM_ECHO_RE, '').trim();
  text = text.replace(CODING_WORKSPACE_ECHO_RE, '').trim();
  let peeled = '';
  while (text !== peeled) {
    peeled = text;
    for (const re of INSTRUCTION_LEAD_RES) text = text.replace(re, '').trim();
  }
  if (/^You are ARK[\s\S]{20,400}$/i.test(text.trim())) return '';

  text = text.replace(/^\(?\s*truncated\s*\)?\s*/i, '').trim();

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

  // Orphan leftovers from a prior turn (list item / typo-correction closer)
  text = text.replace(/^[a-z]\.\s+Is there anything specific you'd like to know about Ark\??\s*/i, '').trim();
  text = text.replace(/^[a-z]\.\s+(?:If you have any specific|I(?:['’]d| would) be happy)[^\n]*\n*/i, '').trim();
  text = text.replace(/^Hello!\s+It (?:looks|seems) like you might have (?:meant|a typo)[^\n]*\n*/i, '').trim();

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
    // Mid-word continuation of a truncated prior reply (e.g. "…Evolved" → "vival Evolved")
    if (/^[a-z0-9]/.test(text) && /[A-Za-z]$/.test(prev.replace(/…$/, ''))) {
      const firstBreak = text.search(/[\s.!?]/);
      const glued = firstBreak > 0 ? text.slice(0, firstBreak) : text.slice(0, 24);
      if (glued.length > 0 && glued.length < 28) {
        text = text.slice(glued.length).replace(/^\s+/, '');
      }
    }
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
    text = stripPreviousBleed(text, prev);
  }

  // If the user didn't ask about the game, drop Survival Evolved / gameplay-tip riffs.
  if (user && !/\bsurvival evolved\b/i.test(user) && !/\bgameplay\b/i.test(user)) {
    text = text
      .split(/\n{2,}/)
      .filter((para) => {
        if (!/\bsurvival evolved\b|\bgameplay tips\b|\btroubleshooting issues with the game\b/i.test(para)) return true;
        return BUILD_HINT.test(user) || STORY_HINT.test(user);
      })
      .join('\n\n')
      .trim();
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
    .filter(line => !/^\s*Latest (request|user message):/i.test(line.trim()))
    .join('\n')
    .trim();

  return text;
}

export function looksLikePromptEcho(reply: string): boolean {
  const t = String(reply || '').trim().replace(/^[,.;:\s]+/, '');
  if (!t) return false;
  if (PROMPT_FRAGMENT_RE.test(t)) return true;
  // Strong signal: models sometimes re-emit the exact system instruction block.
  if (/^You are ARK, the assistant inside the ARK desktop creation studio on this computer\./i.test(t)) {
    return /Do not echo the prompt\./i.test(t) || /Answer the latest user request clearly\./i.test(t);
  }
  if (/^You are ARK, the assistant in the ARK desktop creation studio/i.test(t)) {
    return /Never continue a previous sentence/i.test(t) || /Answer only the latest user message/i.test(t);
  }
  if (/^Never continue a previous sentence/i.test(t) && /The user wants working source code/i.test(t)) {
    return !/```/.test(t);
  }
  // Weaker fallback: if it starts like the system prompt, and contains typical system phrases.
  if (/^You are ARK(?:,|\s)/i.test(t) && /Do not echo the prompt\./i.test(t)) return true;
  return false;
}

/** Prefer sanitized text, but never hide a real answer behind prompt-echo stripping. */
export function usableAssistantText(
  raw: string,
  lastUserMessage?: string,
  previousAssistant?: string,
): string {
  const cleaned = sanitizeAssistantReply(raw, lastUserMessage, previousAssistant);
  if (cleaned.trim()) return cleaned.trim();

  let light = String(raw || '').replace(/\r\n/g, '\n').trim();
  if (!light) return '';
  const markRe = /(?:^|\n)\s*(?:ARK|Assistant)\s*:\s*/gi;
  let lastMark: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = markRe.exec(light)) !== null) lastMark = m;
  if (lastMark && typeof lastMark.index === 'number') {
    light = light.slice(lastMark.index + lastMark[0].length).trim();
  }
  light = light.replace(/^You are ARK[\s\S]*?(?:\n\n|User:\s*)/i, '').trim();
  light = light.replace(/^>\s*/gm, '').trim();
  if (light.length >= 2 && !/^You are ARK\b/i.test(light)) return light;
  return '';
}

function firstSentence(text: string) {
  const m = String(text || '').match(/^[\s\S]{8,280}?(?:[.!?](?=\s|$)|$)/);
  return (m?.[0] || text.split('\n')[0] || '').trim();
}

function stripPreviousBleed(text: string, previousAssistant: string): string {
  let out = text.trim();
  const prev = previousAssistant.trim();
  if (!out || prev.length < 16) return out;

  const prevLower = prev.toLowerCase();

  // Leading list leftover: "c. Is there anything specific…"
  out = out.replace(/^[a-z]\.\s+[^\n]{8,180}\n*/i, (lead) => (
    prevLower.includes(lead.replace(/^[a-z]\.\s+/i, '').slice(0, 24).toLowerCase()) ? '' : lead
  )).trim();

  const sent = firstSentence(out);
  if (sent.length >= 16 && prevLower.includes(sent.slice(0, Math.min(80, sent.length)).toLowerCase())) {
    out = out.slice(sent.length).replace(/^[.\s]+/, '').trim();
  }

  const firstLine = out.split('\n')[0]?.trim() || '';
  if (firstLine.length >= 16 && prevLower.includes(firstLine.slice(0, 48).toLowerCase())) {
    out = out.slice(firstLine.length).replace(/^\s+/, '').trim();
  }

  // Tail of previous reply glued onto the start of this one
  for (const n of [48, 72, 96, 140]) {
    const tail = prev.slice(-n).replace(/^\S*\s/, '').trim();
    if (tail.length < 20) continue;
    if (out.toLowerCase().startsWith(tail.toLowerCase())) {
      out = out.slice(tail.length).replace(/^[.,;:\s]+/, '').trim();
      break;
    }
  }

  return out;
}
