/**
 * ARK-owned chat memory for Router hops.
 * The thread lives in ARK; each provider gets a compact recent window
 * so failover continues mid-task instead of greeting like a new chat.
 */

import { isTraceMessage, parseTraceMessage, stripAgentTrace } from '@/lib/agentTrace';
import { isCatalogMessage, parseCatalogMessage, catalogToPlainText } from '@/lib/folderCatalog';
import { isPcExploreMessage, parsePcExploreMessage, pcExploreToPlainText } from '@/lib/pcExplore';
import { isPromptChipsMessage, parsePromptChipsMessage, promptChipsToPlainText } from '@/lib/chatPromptChips';
import { getUsableTokens } from '@/lib/ggufContext';

export type RouterChatTurn = {
  role: 'user' | 'assistant';
  content: string;
  /** Base64 image parts for vision-capable providers (Gemini / GPT-4o). */
  images?: { mime: string; data: string }[];
};

const MAX_TURNS = 72;
const MAX_CHARS = 48_000;
const MAX_TURN_CHARS = 6_000;

/** Core product bar: respond to the ask, not a substitute topic. */
export const ANSWER_THE_ASK =
  'Answer the user’s latest question or request directly. chat fact, image, code, edit, ideas, or folder focus. '
  + 'Do not substitute a different topic, dump unrelated files, repeat an earlier overview, or invent a “better” answer they did not ask for. '
  + 'If the latest message has multiple questions, answer EACH one in order with a clear take (short paragraph or bullet per question). '
  + 'Do not replace a direct ask (timeline, worth-it, yes/no, recommendation) with a generic multi-week project plan unless they asked for a full plan. '
  + 'When details are missing for a good answer (allergies, budget, goal, symptoms, location), ask 2–4 short clarifying questions first — then recommend. '
  + 'If you cannot answer, say so in one clear line. '
  + 'Do not offer coding lessons, programming tutorials, or app-building help unless the user is clearly asking about software development. '
  + 'On general conversation (weather, facts, chit-chat, recommendations), stay on that topic only — never pivot to "I can teach you to code" or similar.';

export const BASE_SYSTEM =
  'You are ARK, a normal helpful AI chat assistant. Talk like ChatGPT. not a design studio or image tool unless they ask to make something. '
  + 'You are not the video game Ark: Survival Evolved. Never “correct” the user’s spelling of ARK. '
  + 'Read past typos and misspellings: infer the intended word (e.g. “recomendation” → recommendation, “misplaned” → misspelled) and answer that intent. '
  + 'Do not lecture about spelling or grammar unless they ask you to proofread. '
  + `${ANSWER_THE_ASK} `
  + 'Never invent bracket placeholders such as [current date], [name], [path], or [insert here]. Use real values or ask one clear question. '
  + 'When they ask what day or date it is, use the real today date from the system context line — never write “[current date]”. '
  + 'On this PC, ARK Chat can create, read, edit, rename, and delete files in granted folders when the user asks. '
  + 'If they ask whether you can edit files (or yes/no): say yes, then ask for the path and what to change. Do not give a generic programming tutorial. '
  + 'When web lookup notes are provided in the thread, prefer those facts over guessing. Still answer the user directly. '
  + 'For places (restaurants, shops): if preferences/allergies are unknown, ask briefly first; then recommend and offer a maps link when you know a location. '
  + 'For troubleshooting (car, PC, home): give likely causes and safe next steps, ask when the symptom happens, and say when a pro should look at it. '
  + 'When they ask for ideas for an app, website, coffee shop, etc.: give concrete pieces that product should have, then say where to start first and offer to begin. '
  + 'When they ask what a project is or what they are building: explain the product goal in plain language from the evidence, then suggest a practical next step. do not paste a generic file inventory. '
  + 'Never invent a new subject (movies, TV, celebrities, weather, EcoBuddy-style fake products) when the thread is about something else. '
  + 'Never echo the user’s greeting. If they only say hi/hello/hey, reply: “Hello! How can I assist you today?” '
  + 'Be accurate and complete. Cover the main facts they need, then one short follow-up: “Want more on any of that?” '
  + 'When they give concrete product/device/gear specs (camera mm / f-stop / ISO / shutter, iPhone model + lenses, bike size, GPU, phone storage, etc.), '
  + 'ground every recommendation in THOSE specs: best settings, technique, or next steps for that exact kit — not generic advice that ignores what they listed. '
  + 'Name their gear back once so it is clear you used it, then give tailored guidance. '
  + 'Only when they clearly ask about a person: who they are, companies they founded/own/run (list the well-known ones), and a couple of notable facts. '
  + 'For section titles in long answers, prefer **Bold title** lines — not markdown # / ## / ### hashtags. '
  + 'Only when they clearly ask about movies or TV shows: Title (year). one line why it is good. Then typical places to watch (Netflix, Disney+, Prime Video, Max, YouTube) and IMDb for listings. Say availability varies by country. '
  + 'Write movie/TV lists as: 1. Drama: Title (year). … Watch: Netflix / Prime. Never nest asterisks. Never wrap genre names in **.';

function todaySystemLine(): string {
  try {
    const label = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    return `Today's date is ${label}.`;
  } catch {
    return '';
  }
}

const CONTINUITY =
  'This is a follow-up in the same ARK chat. '
  + 'Stay on the same topic as the earlier turns (coding lesson, app idea, troubleshooting, etc.). '
  + 'Interpret typos the same way: guess the intended words and stay helpful. '
  + 'If they say “more details”, “dive deeper”, “recommended area”, or similar, deepen the PREVIOUS answer. do not switch subjects. '
  + 'Answer the latest user message with a brand-new reply. '
  + `${ANSWER_THE_ASK} `
  + 'If they ask how fast / how long / is it worth it: give a direct judgment first (timeline estimate + yes/no with reasons), then optional short detail — not a fresh full project plan dump. '
  + 'If they ask where to start, what first, or for next steps: prioritize the topic from this thread. '
  + 'If they ask to continue, tell more, or go on, finish the previous answer from where it stopped. do not restart the same list from item 1. '
  + 'If they clearly switched topics (e.g. coding → ninja warriors), follow the new topic.';

const CHAT_CODE_OUTPUT =
  'Give one short intro sentence, then one complete markdown code fence. No placeholders.';

const SYSTEM_ECHO_RE =
  /^You are ARK(?:,|\s)[\s\S]*?(?:Do not echo the prompt\.|Never continue a previous sentence[^.\n]*\.|Answer only the latest user message[^.\n]*\.)/i;
const PROMPT_FRAGMENT_RE =
  /^(?:You are ARK\b|Answer the latest user request clearly\.?|Answer the user’s latest question[^\n]*\.?|Do not echo the prompt\.?|Do not correct the spelling of ARK\.?|Answer only the latest user message with a brand-new reply\.?|Never continue a previous sentence, list item, or closing question\.?)$/i;
const INSTRUCTION_LEAD_RES = [
  /^Never continue a previous sentence[^\n]*\.?\s*/i,
  /^The user wants working source code[^\n]*\.?\s*/i,
  /^Reply with:\s*\(1\)[^\n]*\s*/i,
  /^Give one short intro sentence[^\n]*\.?\s*/i,
  /^Answer only the latest user message[^\n]*\.?\s*/i,
  /^Do not (?:echo the prompt|correct the spelling of ARK|repeat system instructions)[^\n]*\.?\s*/i,
  /^Pick the right fence tag[^\n]*\.?\s*/i,
  /^You are ARK, the assistant[^\n]*(?:\n(?!```)[^\n]{0,240})*\n+/i,
  /^You are ARK, a (?:normal )?helpful AI chat assistant[^\n]*(?:\n(?!```)[^\n]{0,280})*\n+/i,
];


const CODING_WORKSPACE_ECHO_RE =
  /^You are ARK inside a developer project workspace[\s\S]*?(?:WITHOUT @@@FILE blocks\.|answer normally WITHOUT @@@FILE blocks\.)/i;

const BUILD_HINT =
  /\b(build|create|make|implement|develop)\b.{0,48}\b(app|apps|website|site|calculator|program|game|page|ui)\b|\b(write|give|paste|show)\b.{0,32}\b(code|html|css|javascript|python|script|source)\b|\bfull (file|source)\b|\bcopy and paste\b/i;
const TEACH_HINT =
  /\b(teach|learn|tutorial|explain how|how (do i|to|can i) (learn|code|program|start)|teach me how to code|learning to code)\b/i;
const CODING_TOPIC_HINT =
  /\b(code|coding|program(?:ming)?|python|javascript|typescript|java|html|css|leetcode|variables?|functions?|loops?|syntax|debug(?:ging)?|software|developer|compiler)\b/i;

const FACT_HINT =
  /\b(weather|temperature|forecast|rain|humid|capital of|who is|what is|when did|population|india|history of)\b/i;
const STORY_HINT = /\b(story|joke|poem|song|riddle|fairytale)\b/i;
const GREET_HINT = /^(hi|hello|hey|yo|sup|howdy)\b/i;
const MEDIA_ASK_HINT =
  /\b(movies?|tv\s*shows?|films?|netflix|what\s+should\s+i\s+watch|watch\s+next)\b/i;
/** Soft deepen / continue — always keep prior turns. */
const FOLLOW_UP_HINT =
  /^(?:(?:can you |could you |please )?(?:tell me more|say more|go on|continue|elaborate)|more|why|how so|and\b|also\b|what about|ok but|please explain|okay[,.]?\s*|ok[,.]?\s*)\b/i;
const SOFT_FOLLOW_UP_HINT =
  /\b(?:dive\s+(?:deeper|in)|go\s+deeper|more\s+details?|tell\s+me\s+more|expand\s+on|recommended\s+area|that\s+area|this\s+area|those\s+steps?|any\s+of\s+(?:these|those|them)|focus\s+on\s+(?:a\s+)?specific|in\s+(?:that|this|the)\s+(?:area|step|topic|one)|give\s+me\s+more|i\s+would\s+like\s+more|yes[,.]?\s+(?:please|more|that))\b/i;
/** Same-thread next steps. must keep prior context. */
const THREAD_CONTINUE_HINT =
  /\b(where (should|do|to) (we|i|you) start|where (do you think )?(we|i) should start|what (should|do) (we|i) (do )?first|what first|next step|i want (some |a )?recommendations?|recommendations?\b|recommend(?:ed|ation)?s?)\b/i;

function significantTokens(text: string): Set<string> {
  return new Set(
    String(text || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter(w => w.length > 3)
      .filter(w => !/^(that|this|with|from|have|what|when|where|your|about|please|would|could|should|there|their|like|would|deeper|area|more|details?)$/i.test(w)),
  );
}

function isSoftContinuityAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  return FOLLOW_UP_HINT.test(t) || SOFT_FOLLOW_UP_HINT.test(t) || THREAD_CONTINUE_HINT.test(t);
}

export type ThreadTopicKind = 'coding' | 'product' | 'media' | 'general';

/** Infer what this chat is currently about so follow-ups stay anchored. */
export function inferThreadTopic(history: RouterChatTurn[]): { kind: ThreadTopicKind; label: string } {
  const users = history.filter(t => t.role === 'user').map(t => t.content);
  const assistants = history.filter(t => t.role === 'assistant').map(t => t.content);
  const latestUser = [...users].reverse().find(u => u.trim() && !GREET_HINT.test(u.trim())) || '';
  // Prefer the latest user ask when it clearly starts a new subject.
  if (MEDIA_ASK_HINT.test(latestUser)) {
    return { kind: 'media', label: 'movies / TV' };
  }
  if (TEACH_HINT.test(latestUser) || (CODING_TOPIC_HINT.test(latestUser) && !BUILD_HINT.test(latestUser))) {
    return { kind: 'coding', label: 'learning to code / programming' };
  }
  if (BUILD_HINT.test(latestUser)) {
    return { kind: 'product', label: 'building a software product' };
  }
  // Soft follow-ups: topic comes from earlier turns + last assistant.
  const priorBlob = [
    ...users.filter(u => u !== latestUser).slice(-4),
    ...assistants.slice(-2),
  ].join('\n');
  if (isSoftContinuityAsk(latestUser) || !latestUser) {
    if (TEACH_HINT.test(priorBlob) || CODING_TOPIC_HINT.test(priorBlob)) {
      return { kind: 'coding', label: 'learning to code / programming' };
    }
    if (BUILD_HINT.test(priorBlob) || /\b(app|website|mvp|stack|scaffold|project)\b/i.test(priorBlob)) {
      return { kind: 'product', label: 'building a software product' };
    }
    if (MEDIA_ASK_HINT.test(priorBlob)) {
      return { kind: 'media', label: 'movies / TV' };
    }
  }
  const blob = [...users, ...assistants.slice(-2)].join('\n');
  if (TEACH_HINT.test(blob) || CODING_TOPIC_HINT.test(blob)) {
    return { kind: 'coding', label: 'learning to code / programming' };
  }
  if (BUILD_HINT.test(blob) || /\b(app|website|mvp|stack|scaffold|project)\b/i.test(blob)) {
    return { kind: 'product', label: 'building a software product' };
  }
  if (latestUser) {
    const clip = latestUser.replace(/\s+/g, ' ').trim().slice(0, 80);
    return { kind: 'general', label: clip };
  }
  return { kind: 'general', label: 'the ongoing conversation' };
}

/** True when the latest ask is a new task, not a follow-up to the prior one. */
export function isTopicShift(history: RouterChatTurn[], latestUserMessage: string): boolean {
  const latest = String(latestUserMessage || '').trim();
  if (!latest) return false;
  // Soft deepen / continue always keeps the thread (fixes “dive deeper in recommended area” → movies).
  if (isSoftContinuityAsk(latest)) return false;
  const priorUsers = history.filter(t => t.role === 'user');
  const earlier = priorUsers.length > 1
    ? priorUsers[priorUsers.length - 2]
    : priorUsers.length === 1 && priorUsers[0].content !== latest
      ? priorUsers[0]
      : null;
  if (!earlier?.content) return false;
  const a = earlier.content.trim();
  const b = latest;
  const priorIsBuildThread =
    TEACH_HINT.test(a) || CODING_TOPIC_HINT.test(a) || BUILD_HINT.test(a)
    || /\b(app|website|site|product|project|landing|page|ui|layout)\b/i.test(a);
  const latestIsBuildish =
    BUILD_HINT.test(b) || CODING_TOPIC_HINT.test(b) || THREAD_CONTINUE_HINT.test(b)
    || /\b(app|website|site|product|project|landing|page|color|font|layout|edit|change|add|fix)\b/i.test(b);

  // Long planning / build threads must stay intact — weak word-overlap must not wipe memory.
  if (priorIsBuildThread && (latestIsBuildish || b.length < 220)) return false;
  // After teach/learn or build, short / deepen asks stay on that topic.
  if ((TEACH_HINT.test(a) || CODING_TOPIC_HINT.test(a) || BUILD_HINT.test(a)) && b.length < 220) return false;
  if (BUILD_HINT.test(a) && THREAD_CONTINUE_HINT.test(b)) return false;
  if (BUILD_HINT.test(a) && /\b(app|website|site|product|project|build)\b/i.test(b)) return false;
  // Explicit media ask after a non-media thread is a real switch.
  if (MEDIA_ASK_HINT.test(b) && !MEDIA_ASK_HINT.test(a) && !isSoftContinuityAsk(b)) return true;
  if (GREET_HINT.test(a) && !GREET_HINT.test(b) && !isSoftContinuityAsk(b) && b.length > 24) return true;
  if (STORY_HINT.test(b) && !STORY_HINT.test(a)) return true;
  if (STORY_HINT.test(a) && !STORY_HINT.test(b) && !isSoftContinuityAsk(b) && !latestIsBuildish) return true;
  if (BUILD_HINT.test(b) && !BUILD_HINT.test(a) && (FACT_HINT.test(a) || a.length > 12) && !priorIsBuildThread) return true;
  if (FACT_HINT.test(b) && BUILD_HINT.test(a) && !isSoftContinuityAsk(b)) return true;
  const ta = significantTokens(a);
  const tb = significantTokens(b);
  if (tb.size < 2 || ta.size < 2) {
    if ((BUILD_HINT.test(a) || TEACH_HINT.test(a) || CODING_TOPIC_HINT.test(a)) && b.length < 180) return false;
    // Short follow-ups in an ongoing thread are almost never a real topic change.
    if (priorUsers.length >= 2 && b.length < 160) return false;
    return a.toLowerCase() !== b.toLowerCase() && !isSoftContinuityAsk(b);
  }
  let overlap = 0;
  for (const t of tb) if (ta.has(t)) overlap += 1;
  // Only treat as a shift when almost no shared words (was 0.28 — too eager mid-build).
  return overlap / tb.size < 0.12;
}

/** Strip UI / media noise so providers get usable text. */
export function slimTurnContent(content: string, maxChars = MAX_TURN_CHARS): string {
  const raw = (content || '').trim();
  if (!raw) return '';
  if (raw.startsWith('__generating__:')) return '';
  if (isCatalogMessage(raw)) {
    const data = parseCatalogMessage(raw);
    return data ? catalogToPlainText(data) : '';
  }
  if (isPcExploreMessage(raw)) {
    const data = parsePcExploreMessage(raw);
    return data ? pcExploreToPlainText(data) : '';
  }
  if (isPromptChipsMessage(raw)) {
    const { body, chips } = parsePromptChipsMessage(raw);
    const chipNote = chips.length ? `\n[Options: ${promptChipsToPlainText(chips)}]` : '';
    return `${body}${chipNote}`.trim();
  }

  if (raw.includes('ark-media:')) {
    const stripped = stripAgentTrace(raw.replace(/!\[[^\]]*]\(ark-media:[^)]+\)/g, '').trim());
    const note = '[Attached image]';
    return stripped ? `${stripped}\n\n${note}` : note;
  }

  let text = stripAgentTrace(raw);
  if (!text && isTraceMessage(raw)) {
    const { payload } = parseTraceMessage(raw);
    if (payload?.answer) text = payload.answer;
    else if (payload) return '[Working…]';
  }
  if (!text) return '';

  // Drop giant data-URLs / markdown images
  text = text
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
  if (text.length > maxChars) {
    const slice = text.slice(0, maxChars);
    const breakAt = Math.max(
      slice.lastIndexOf('\n'),
      slice.lastIndexOf('. '),
      slice.lastIndexOf('? '),
      slice.lastIndexOf('! '),
      slice.lastIndexOf(' '),
    );
    const cut = breakAt > maxChars * 0.45 ? slice.slice(0, breakAt + 1) : slice;
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
  opts?: { keepContinuity?: boolean; kind?: 'chat' | 'coding'; maxTurns?: number },
): RouterChatTurn[] {
  const turns: RouterChatTurn[] = [];
  const keepContinuity = Boolean(opts?.keepContinuity || opts?.kind === 'coding');
  // Coding: keep prior turns short. do not re-pack old @@@FILE dumps into the context window.
  const assistantCap = opts?.kind === 'coding' ? 480 : 1_200;
  const maxChars = opts?.kind === 'coding' ? 28_000 : MAX_CHARS;
  const maxTurns = opts?.maxTurns
    ?? (opts?.kind === 'coding' ? 24 : MAX_TURNS);
  const latestCap = opts?.kind === 'coding' ? 48_000 : MAX_TURN_CHARS;
  for (const m of prior) {
    const role = m.role === 'assistant' ? 'assistant' : m.role === 'user' ? 'user' : null;
    if (!role) continue;
    let content = slimTurnContent(m.content || '');
    if (!content) continue;
    if (opts?.kind === 'coding' && role === 'assistant') {
      // Drop file dumps; keep a short status line for continuity.
      content = content
        .replace(/@@@FILE\b[\s\S]*?(?=\n@@@FILE\b|$)/gi, '')
        .replace(/```[\s\S]*?```/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      if (!content) content = 'Updated project files.';
    }
    if (role === 'assistant' && content.length > assistantCap) {
      const slice = content.slice(0, assistantCap);
      const breakAt = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('\n'), slice.lastIndexOf(' '));
      content = `${(breakAt > assistantCap * 0.4 ? slice.slice(0, breakAt + 1) : slice).trimEnd()}…`;
    }
    turns.push({ role, content });
  }

  const latest = slimTurnContent(latestUserMessage, latestCap) || latestUserMessage.trim();
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
  let window = turns.slice(-maxTurns);
  let total = window.reduce((n, t) => n + t.content.length, 0);
  while (window.length > 1 && total > maxChars) {
    const removed = window.shift();
    total -= removed?.content.length || 0;
  }
  // Ensure we still end on the latest user turn
  if (window.length === 0 && latest) {
    window = [{ role: 'user', content: latest.slice(0, latestCap), images: vision }];
  }

  // New task (e.g. weather → “build an app”): drop prior turns so GGUF cannot regurgitate them.
  // Keep the thread when a brain rotation is pending/applied. the user should not re-brief.
  if (!keepContinuity && latest && isTopicShift(window, latest)) {
    return [{ role: 'user', content: latest.slice(0, latestCap), images: vision }];
  }

  return window;
}

export function routerSystemPrompt(history: RouterChatTurn[]): string {
  const latest = latestUserMessage(history, '');
  const hasVision = history.some(t => t.images?.length);
  const visionNote = hasVision
    ? '\n\nThe user attached a photo. If this request includes image pixels, describe what you see. If you cannot see the image, say so in one line and do not invent the contents.'
    : '';
  const today = todaySystemLine();
  const todayNote = today ? `\n\n${today}` : '';
  const hasPrior = history.some(t => t.role === 'assistant') || history.length > 1;
  if (!hasPrior) return `${BASE_SYSTEM}${todayNote}${visionNote}`;
  const topic = inferThreadTopic(history);
  const topicLine =
    `Current thread topic: ${topic.label}. Stay on this unless the user clearly switches to something else.`;
  if (isSoftContinuityAsk(latest.trim())) {
    return `${BASE_SYSTEM}${todayNote}\n\n${topicLine}\nThis is a follow-up. Deepen the previous answer on that topic. Do not invent movies, TV, celebrities, or a new product.${visionNote}`;
  }
  return `${BASE_SYSTEM}${todayNote}\n\n${topicLine}\n${CONTINUITY}${visionNote}`;
}

function wantsChatCode(latest: string) {
  return BUILD_HINT.test(latest) && !TEACH_HINT.test(latest);
}

export function flattenHistoryText(history: RouterChatTurn[]): string {
  return history
    .map(t => `${t.role === 'user' ? 'User' : 'ARK'}: ${String(t.content || '').trim()}`)
    .filter(Boolean)
    .join('\n');
}

/**
 * If the thread is over the GGUF prompt budget, fold oldest turns into one
 * memory blob and keep recent turns verbatim. Never wipe the thread.
 * The full chat stays in localStorage / UI — only the model prompt is compacted.
 */
export function compressHistoryIfNeeded(
  history: RouterChatTurn[],
  maxChars?: number,
  opts?: { aggressive?: boolean },
): RouterChatTurn[] {
  // Scale soft cap with this PC’s usable token budget (~4 chars/token).
  const budgetChars = maxChars ?? Math.min(64_000, Math.max(24_000, getUsableTokens() * 4));
  const text = flattenHistoryText(history);
  const aggressive = Boolean(opts?.aggressive) || text.length > budgetChars * 0.85;
  const softBudget = aggressive ? Math.floor(budgetChars * 0.55) : budgetChars;
  if (!history.length || text.length <= softBudget) {
    if (!aggressive || history.length <= 10) return history;
  }
  const keep = aggressive ? Math.min(8, history.length) : Math.min(16, history.length);
  if (history.length <= keep) {
    return history.map(t => ({
      ...t,
      content: t.content.length > 2400 ? `${t.content.slice(0, 500)}\n…\n${t.content.slice(-1600)}` : t.content,
    }));
  }
  const old = history.slice(0, -keep);
  const recent = history.slice(-keep);
  const firstUser = old.find(t => t.role === 'user')?.content.replace(/\s+/g, ' ').trim().slice(0, 420) || '';
  const userBeats = old
    .filter(t => t.role === 'user')
    .slice(-6)
    .map(t => `- ${t.content.replace(/\s+/g, ' ').trim().slice(0, 220)}`);
  const asstBeats = old
    .filter(t => t.role === 'assistant')
    .slice(-5)
    .map(t => {
      const one = t.content.replace(/\s+/g, ' ').trim();
      const cut = one.match(/^.{40,280}?[.!?](?:\s|$)/)?.[0] || one.slice(0, 220);
      return `- ${cut}`;
    });
  const blob = [
    firstUser ? `Original ask: ${firstUser}` : '',
    userBeats.length ? `Earlier user points:\n${userBeats.join('\n')}` : '',
    asstBeats.length ? `Earlier ARK points:\n${asstBeats.join('\n')}` : '',
  ].filter(Boolean).join('\n').slice(0, aggressive ? 4_500 : 6_500);
  return [
    {
      role: 'user',
      content: `Earlier in this chat (memory compact — keep using this; do not greet like a new chat; full UI history is unchanged):\n${blob}`,
    },
    ...recent.map(t => ({
      ...t,
      content: t.content.length > 2800 ? `${t.content.slice(0, 600)}\n…\n${t.content.slice(-1800)}` : t.content,
    })),
  ];
}

/** True when compaction changed the shape of history (for UI note). */
export function historyWasCompacted(before: RouterChatTurn[], after: RouterChatTurn[]): boolean {
  if (before.length !== after.length) return true;
  if (!before.length) return false;
  return /Earlier in this chat/i.test(after[0]?.content || '')
    && !/Earlier in this chat/i.test(before[0]?.content || '');
}

/** Pack history into one prompt for engines that only take a single string (GGUF / Core / Ollama generate). */
export function packHistoryPrompt(history: RouterChatTurn[], latestFallback?: string): string {
  const latest = latestUserMessage(history, latestFallback || '').trim();
  if (!latest) return latestFallback || '';

  // Keep identity in the ChatML system turn (arkGguf wrapChatPrompt). Stuffing it into
  // the user text makes Qwen parrot “Never continue a previous sentence…” in the bubble.
  const softFollow = isSoftContinuityAsk(latest);
  const userCount = history.filter(t => t.role === 'user').length;
  const keepContinuity = softFollow
    || history.some(t => /Earlier in this chat/i.test(t.content))
    || userCount >= 2
    || history.some(t => t.role === 'assistant');
  if (
    history.length <= 1
    || !history.some(t => t.role === 'assistant')
    || (!keepContinuity && isTopicShift(history, latest))
  ) {
    return wantsChatCode(latest) ? `${CHAT_CODE_OUTPUT}\n\n${latest}` : latest;
  }

  const packedHistory = compressHistoryIfNeeded(history);
  const topic = inferThreadTopic(packedHistory);
  const priorUsers = packedHistory
    .filter(t => t.role === 'user' && t.content.trim() && t.content.trim() !== latest)
    .slice(-12)
    .map(t => `- ${t.content.replace(/\s+/g, ' ').slice(0, 520)}`);
  const lastAssistant = [...packedHistory].reverse().find(t => t.role === 'assistant')?.content
    ?.replace(/\s+/g, ' ')
    .trim()
    .slice(-3200);

  if (wantsChatCode(latest)) {
    return [
      CHAT_CODE_OUTPUT,
      priorUsers.length ? `Earlier user asks:\n${priorUsers.join('\n')}` : '',
      lastAssistant ? `Previous answer (may be incomplete):\n${lastAssistant}` : '',
      `Latest:\n${latest}`,
    ].filter(Boolean).join('\n\n');
  }

  return [
    `Thread topic: ${topic.label}. Stay on it unless Latest clearly switches.`,
    priorUsers.length ? `Earlier user asks${softFollow ? '' : ' (already answered)'}:\n${priorUsers.join('\n')}` : '',
    lastAssistant
      ? `${softFollow ? 'Previous answer. continue / deepen from here, do not restart or change subject:\n' : 'Previous answer:\n'}${lastAssistant}`
      : '',
    `Latest:\n${latest}`,
  ].filter(Boolean).join('\n\n');
}

export function latestUserMessage(history: RouterChatTurn[], fallback: string): string {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === 'user') {
      const content = history[i].content;
      // Prefer the full inspect/coding prompt when history was truncated.
      if (
        fallback
        && fallback.length > content.length + 200
        && /Selected file contents|@@@FILE|File tree/i.test(fallback)
      ) {
        return fallback;
      }
      return content;
    }
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
  text = stripAgentTrace(text);

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
  text = tidyMarkdownStars(text);

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
  if (/^You are ARK, a (?:normal )?helpful AI chat assistant/i.test(t)) {
    return /Hello! How can I assist you today/i.test(t) || /Never nest asterisks/i.test(t) || /Want more on any of that/i.test(t);
  }
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

/** Exact system greeting parroted when the user did not say hi/hello/hey. */
export function isCannedGreetingReply(reply: string, userMessage?: string): boolean {
  const r = String(reply || '').trim();
  if (!/^Hello! How can I assist you today\??\.?$/i.test(r)) return false;
  const u = String(userMessage || '').trim();
  if (!u) return true;
  return !/^(hi|hello|hey)\b/i.test(u);
}

/** True when the assistant mostly repeated the user’s ask (e.g. “Updated Okay, on top right…”). */
export function looksLikeUserAskEcho(reply: string, userMessage: string): boolean {
  const r = String(reply || '').trim().replace(/\s+/g, ' ');
  const u = String(userMessage || '').trim().replace(/\s+/g, ' ');
  if (!r || u.length < 16) return false;
  const rl = r.toLowerCase();
  const ul = u.toLowerCase();
  const snippet = ul.slice(0, Math.min(64, ul.length));
  if (snippet.length >= 16 && rl.includes(snippet)) {
    // “Updated {user text}…” or reply that is mostly the ask
    if (/^updated\b/i.test(r) && r.length < u.length * 2.8) return true;
    if (r.length < u.length * 1.6) return true;
  }
  // High token overlap on short replies
  const ut = new Set(ul.split(/[^a-z0-9]+/).filter(w => w.length > 3));
  const rt = rl.split(/[^a-z0-9]+/).filter(w => w.length > 3);
  if (ut.size >= 4 && rt.length >= 4 && rt.length <= 40) {
    let hit = 0;
    for (const w of rt) if (ut.has(w)) hit += 1;
    if (hit / rt.length >= 0.72 && !/```|@@@FILE/.test(r)) return true;
  }
  return false;
}

/** Prefer sanitized text, but never hide a real answer behind prompt-echo stripping. */
export function usableAssistantText(
  raw: string,
  lastUserMessage?: string,
  previousAssistant?: string,
): string {
  const cleaned = sanitizeAssistantReply(raw, lastUserMessage, previousAssistant);
  if (cleaned.trim()) {
    if (isCannedGreetingReply(cleaned, lastUserMessage)) return '';
    return cleaned.trim();
  }

  let light = String(raw || '').replace(/\r\n/g, '\n').trim();
  if (!light) return '';
  if (isCannedGreetingReply(light, lastUserMessage)) return '';
  const markRe = /(?:^|\n)\s*(?:ARK|Assistant)\s*:\s*/gi;
  let lastMark: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = markRe.exec(light)) !== null) lastMark = m;
  if (lastMark && typeof lastMark.index === 'number') {
    light = light.slice(lastMark.index + lastMark[0].length).trim();
  }
  light = light.replace(/^You are ARK[\s\S]*?(?:\n\n|User:\s*)/i, '').trim();
  light = light.replace(/^>\s*/gm, '').trim();
  if (isCannedGreetingReply(light, lastUserMessage)) return '';
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

/** Collapse nested / escaped bold so **Drama** renders instead of **\*\*Drama\*\*:** */
export function tidyMarkdownStars(text: string): string {
  let out = String(text || '');
  out = out.replace(/\*\*\\+\*\*/g, '**');
  out = out.replace(/\\(\*)/g, '$1');
  out = out.replace(/\*\*\*\*+/g, '**');
  out = out.replace(/\*\*\s*\*\*/g, '');
  return out;
}
