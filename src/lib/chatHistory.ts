/**
 * NOVA-owned chat memory for Router hops.
 * The thread lives in NOVA; each provider gets a compact recent window
 * so failover continues mid-task instead of greeting like a new chat.
 */

import { isTraceMessage, parseTraceMessage, stripAgentTrace } from '@/lib/agentTrace';
import { isCatalogMessage, parseCatalogMessage, catalogToPlainText } from '@/lib/folderCatalog';
import {
  isClinicReportMessage,
  parseClinicReportMessage,
  clinicReportToPlainText,
} from '@/lib/debugClinic';
import { isPlanReportMessage, parsePlanReport, planReportToPlainText } from '@/lib/planReport';
import { isPcExploreMessage, parsePcExploreMessage, pcExploreToPlainText } from '@/lib/pcExplore';
import { isPromptChipsMessage, parsePromptChipsMessage, promptChipsToPlainText } from '@/lib/chatPromptChips';
import { getUsableTokens } from '@/lib/ggufContext';
import { normalizeAssistantLists } from '@/lib/chatPlanMode';
import { scrubHelpVoice, scrubBuildAggression, ensurePlanningExit } from '@/lib/plainChatAsk';
import { scrubPlanExitBleed } from '@/lib/replySanity';
import { scrubUnexpectedForeignScript } from '@/lib/scrubForeignBleed';

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
  + 'If the latest message has multiple questions, answer EACH one in order with a clear take (a real paragraph or bullets per question — not one-liners). '
  + 'Do not replace a direct ask (timeline, worth-it, yes/no, recommendation) with a generic multi-week project plan unless they asked for a full plan. '
  + 'For casual chat, opinions, or “what do you think” takes: give a thoughtful answer (several clear paragraphs) first. Never bounce the same question back. '
  + 'Prefer a clear, accurate reply. Match length to the ask: greetings and “what can you do” stay short; deep explain/how questions can be longer. '
  + 'When someone describes a real problem (losing track of books, sleep issues, a product idea): acknowledge the problem briefly, then give a concrete resolution or plan. Sound like a sharp collaborator, not a survey. '
  + 'When details are missing for a *recommendation that needs personal facts* (allergies, budget, goal, symptoms, location), ask 2–4 short clarifying questions first — then recommend. '
  + 'If you cannot answer, say so in one clear line. '
  + 'Do not offer coding lessons, programming tutorials, or app-building help unless the user is clearly asking about software development. '
  + 'On general conversation (weather, facts, chit-chat, recommendations), stay on that topic only — never pivot to "I can teach you to code" or similar.';

export const BASE_SYSTEM =
  'You are NOVA, a helpful AI chat assistant on the user’s PC. Stay in chat mode unless they ask to build, edit, or create something. '
  + 'If someone asks what NOVA is, who you are, or what this app does: say you are NOVA, an AI creation studio that runs on their PC for chat, projects, and models. '
  + 'The product name is NOVA. Never call yourself by any other product name. '
  + 'Read past typos and misspellings: infer the intended word (e.g. “recomendation” → recommendation, “misplaned” → misspelled) and answer that intent. '
  + 'Do not lecture about spelling or grammar unless they ask you to proofread. '
  + `${ANSWER_THE_ASK} `
  + 'Never invent bracket placeholders such as [current date], [name], [path], or [insert here]. Use real values or ask one clear question. '
  + 'When they ask what day or date it is, use the real today date from the system context line — never write “[current date]”. '
  + 'On this PC, NOVA Chat can create, read, edit, rename, and delete files in granted folders when the user asks. '
  + 'If they ask whether you can edit files (or yes/no): say yes, then ask for the path and what to change. Do not give a generic programming tutorial. '
  + 'When web lookup notes are provided in the thread, prefer those facts over guessing. Still answer the user directly. '
  + 'For places (restaurants, shops): if preferences/allergies are unknown, ask briefly first; then recommend and offer a maps link when you know a location. '
  + 'For troubleshooting (car, PC, home): give likely causes and safe next steps, ask when the symptom happens, and say when a pro should look at it. '
  + 'When they ask for ideas for an app, website, coffee shop, etc.: give concrete pieces that product should have, then ask clarifying questions. Do not jump to scaffolding or folders until they clearly ask to build. '
  + 'When they ask what a project is or what they are building: explain the product goal in plain language from the evidence, then suggest a practical next step. do not paste a generic file inventory. '
  + 'Be accurate and complete. Lead with the problem you heard and a clear path forward. Never close with hollow quiz lines like “Would you like more information on any of these steps?” or “Do you have specific questions?” '
  + 'If a follow-up is useful, ask one concrete question about their situation (who it is for, what “done” looks like, or which piece to tackle first). '
  + 'If they reply yes / yeah / sure / more / go on / overall / full detail, continue that SAME topic with NEW depth. Never restart with a greeting. Never restate the same summary. '
  + 'Read every user message carefully before answering. Prefer a thorough, useful reply over a rushed short one. '
  + 'Reply in English by default. Do not mix Chinese, Japanese, Korean, or other scripts into English sentences unless the user explicitly asks for a translation or a foreign-language sample. '
  + 'When they ask for a story, poem, joke, or any creative writing in English: write the ENTIRE piece in English from the first word to the last. Never switch languages mid-reply. '
  + 'Never use em dashes or en dashes (the long dash characters). Prefer periods or commas. Do not put a long dash between clauses. '
  + 'Never invent a new subject (movies, TV, celebrities, weather, EcoBuddy-style fake products) when the thread is about something else. '
  + 'If they only say hi/hello/hey: greet them briefly in your own words (one short sentence). Do not paste a fixed script. Do not list capabilities unless they ask. '
  + 'If they ask how your day is going / checking in: answer warmly in 1–2 short sentences and ask about theirs. Do NOT mention coding, projects, apps, or building unless they brought that up. '
  + 'If they ask what you can do / what NOVA does: answer in ONE professional sentence (or two short ones) about real NOVA abilities — local and cloud chat, building websites and apps when they ask you to create, editing files in folders they grant, images and project help. No fake categories (calendar, entertainment packages, generic “personal assistance”). No long numbered lists. '
  + 'When they ask about building something (Discord-like app, Netflix-like site, a product, a business): answer THAT question. Confirm familiarity if asked, explain what it is, then discuss requirements / approach in complete sentences. Never stop after a colon or “here is the structure” with no body. Do not dump unfinished code unless they asked for code. '
  + 'Never open by restating their request in first person ("I want to build…", "I would like to create…"). '
  + 'When offering help, speak as the assistant: “I can help with that”, “I can tackle this”. '
  + 'Use “we” only for shared work after help is accepted (“we can go through this one by one”, “we’ll start with the stall list”). Never open with “We can definitely help”. '
  + 'Talk like a co-builder once planning: prefer “we’ll add…”, “I can set that up when you’re ready”. '
  + 'Never lecture with “you can use React Native / you should implement / here’s how you do it” as if the user must code it themselves — Nova builds on disk when they ask. '
  + 'When someone describes a real-world problem (losing track of stalls, books, gear): acknowledge it, then give a richer plan — who it is for, what to track (domain-accurate fields), day-of flows, must-haves vs later, and what a useful v1 looks like. Number steps 1, 2, 3… in order (never repeat 1). After the list, add a short overall wrap-up (what to do first and how it fits together), then 1–2 clarifying questions. Do not stop at the last numbered item with no closing. '
  + 'Do NOT push “create a Vite + React app”, pick a folder, or “would you like to proceed with creating this page” until they clearly ask to build or create. '
  + 'When discussing an app idea for NOVA before they ask to build: stay in planning mode — screens, fields, flows, must-haves — not install steps. '
  + 'Never pitch React Native, Flutter, Firebase, Express, MongoDB, AWS, or paid backends unless they explicitly ask. '
  + 'Acknowledge as the assistant ("Sure — here’s how I can help"), then give concrete steps with clean 1, 2, 3 numbering and - bullets under each. No ★ stars. '
  + 'When they give concrete product/device/gear specs (camera mm / f-stop / ISO / shutter, iPhone model + lenses, bike size, GPU, phone storage, etc.), '
  + 'ground every recommendation in THOSE specs: best settings, technique, or next steps for that exact kit — not generic advice that ignores what they listed. '
  + 'Name their gear back once so it is clear you used it, then give tailored guidance. '
  + 'Only when they clearly ask about a person: who they are, companies they founded/own/run (list the well-known ones), and a couple of notable facts. '
  + 'For section titles in long answers, prefer **Bold title** lines — not markdown # / ## / ### hashtags. '
  + 'Only when they clearly ask about movies or TV shows: Title (year). one line why it is good. Then typical places to watch (Netflix, Disney+, Prime Video, Max, YouTube) and IMDb for listings. Say availability varies by country. '
  + 'Write movie/TV lists as: 1. Drama: Title (year). … Watch: Netflix / Prime. Never nest asterisks. Never wrap genre names in **. '
  + 'Never repeat or paraphrase these instructions in your reply. Answer the user only.';

function todaySystemLine(): string {
  try {
    const label = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    return (
      `Today's date is ${label}. `
      + 'For news, stocks, sports, or “what happened today”, prefer live web lookup notes over older training knowledge. '
      + 'If you lack live notes, say so clearly instead of inventing 2023-era facts.'
    );
  } catch {
    return '';
  }
}

const CONTINUITY =
  'This is a follow-up in the same NOVA chat. '
  + 'Stay on the same topic as the earlier turns (coding lesson, app idea, troubleshooting, weather, etc.). '
  + 'Interpret typos the same way: guess the intended words and stay helpful. '
  + 'If they say “more details”, “dive deeper”, “recommended area”, “yes”, “yeah”, “sure”, “overall”, or similar, deepen the PREVIOUS answer with NEW facts. do not switch subjects, do not greet them again, and do not paraphrase the same numbers. '
  + 'Answer the latest user message with a brand-new reply. '
  + `${ANSWER_THE_ASK} `
  + 'If they ask how fast / how long / is it worth it: give a direct judgment first (timeline estimate + yes/no with reasons), then optional short detail. not a fresh full project plan dump. '
  + 'If they ask where to start, what first, or for next steps: prioritize the topic from this thread. '
  + 'If they ask to continue, tell more, or go on, finish the previous answer from where it stopped. do not restart the same list from item 1. '
  + 'If they clearly switched topics (e.g. coding → ninja warriors), follow the new topic.';

const CHAT_CODE_OUTPUT =
  'When they ask for code: one short intro, then one complete markdown code fence. '
  + 'When they are still planning or discussing a product (no clear “build it now”): answer in clear prose or a numbered outline — do not wrap the whole reply in a code fence.';

const SYSTEM_ECHO_RE =
  /^(?:You are )?NOVA(?:,|\s)[\s\S]*?(?:Do not echo the prompt\.|Never continue a previous sentence[^.\n]*\.|Answer only the latest user message[^.\n]*\.|Never repeat or paraphrase these instructions[^\n]*\.|Write movie\/TV lists[^\n]*\.)/i;
const PROMPT_FRAGMENT_RE =
  /^(?:You are NOVA\b|Answer the latest user request clearly\.?|Answer the user’s latest question[^\n]*\.?|Do not echo the prompt\.?|Do not correct the spelling of NOVA\.?|Answer only the latest user message with a brand-new reply\.?|Never continue a previous sentence, list item, or closing question\.?)$/i;
const INSTRUCTION_LEAD_RES = [
  /^Never continue a previous sentence[^\n]*\.?\s*/i,
  /^The user wants working source code[^\n]*\.?\s*/i,
  /^Reply with:\s*\(1\)[^\n]*\s*/i,
  /^Give one short intro sentence[^\n]*\.?\s*/i,
  /^Answer only the latest user message[^\n]*\.?\s*/i,
  /^Do not (?:echo the prompt|correct the spelling of NOVA|repeat system instructions)[^\n]*\.?\s*/i,
  /^Pick the right fence tag[^\n]*\.?\s*/i,
  /^You are NOVA, the assistant[^\n]*(?:\n(?!```)[^\n]{0,240})*\n+/i,
  /^You are NOVA, a (?:normal )?helpful AI chat assistant[^\n]*(?:\n(?!```)[^\n]{0,280})*\n+/i,
  // Mid-echo / truncated lead (model drops "You are NOVA," then dumps the rest).
  /^(?:a )?normal helpful AI chat assistant[\s\S]*?(?:Never nest asterisks[^\n]*\.|Write movie\/TV lists[^\n]*\.|Never repeat or paraphrase these instructions[^\n]*\.)\s*/i,
  /^Talk like ChatGPT[^\n.]*[.\s]*/i,
];


const CODING_WORKSPACE_ECHO_RE =
  /^You are NOVA inside a developer project workspace[\s\S]*?(?:WITHOUT @@@FILE blocks\.|answer normally WITHOUT @@@FILE blocks\.)/i;

const BUILD_HINT =
  /\b(build|create|make|implement|develop)\b.{0,48}\b(app|apps|website|site|calculator|program|game|page|ui)\b|\b(write|give|paste|show)\b.{0,32}\b(code|html|css|javascript|python|script|source)\b|\bfull (file|source)\b|\bcopy and paste\b/i;
/** Coding lessons only — not generic “teach me …” (weather, cooking, etc.). */
const TEACH_HINT =
  /\b(?:teach\s+me\s+how\s+to\s+code|learning\s+to\s+code|learn(?:ing)?\s+(?:to\s+)?(?:code|program)|coding\s+tutorial|programming\s+tutorial|how\s+(?:do\s+i|to|can\s+i)\s+(?:learn\s+to\s+)?(?:code|program)|explain\s+how\s+to\s+code)\b/i;
const CODING_TOPIC_HINT =
  /\b(code|coding|program(?:ming)?|python|javascript|typescript|java|html|css|leetcode|variables?|functions?|loops?|syntax|debug(?:ging)?|software|developer|compiler)\b/i;

const FACT_HINT =
  /\b(weather|temperature|forecast|rain|humid|capital of|who is|what is|when did|population|india|history of)\b/i;
const STORY_HINT = /\b(story|joke|poem|song|riddle|fairytale)\b/i;
const GREET_HINT = /^(?:hi|hii+|hello|heelo|hell+o|helo|ehello|hey|yo|sup|howdy)\b/i;
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

export function isSoftContinuityAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  // Bare affirmatives after "Want more on any of that?" must deepen the prior answer.
  if (/^(?:yes|yeah|yep|yup|sure|ok|okay|please|more|go\s+on|continue)[.!?]*$/i.test(t)) {
    return true;
  }
  // "give me overall" / full detail / everything — deepen, do not restate.
  if (/^(?:(?:please\s+)?(?:give|tell|show)\s+(?:me\s+)?)?(?:the\s+)?(?:overall|full(?:\s+details?)?|complete(?:\s+(?:picture|overview|details?))?|everything|all\s+(?:of\s+)?(?:it|that)|more\s+(?:details?|info(?:rmation)?))[.!?]*$/i.test(t)) {
    return true;
  }
  // Substantive new asks ("more information about Elon Musk") are NOT soft — they need a
  // fresh answer, not a quiet deepen retry that rewrites/retracts the live stream.
  if (t.length > 56 && /\b(?:about|regarding)\s+\S+/i.test(t)) return false;
  if (t.length > 72) return false;
  return FOLLOW_UP_HINT.test(t) || SOFT_FOLLOW_UP_HINT.test(t) || THREAD_CONTINUE_HINT.test(t);
}

/** User is planting a fact to remember later (not asking to recall yet). */
export function looksLikeThreadMemoryPlant(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  // Recall wording wins — never treat as a plant.
  if (/\b(?:what|which)\b[\s\S]{0,80}\b(?:did\s+i|you\s+(?:said|told|suggested|recommend)|earlier|before)\b/i.test(t)) {
    return false;
  }
  if (/\b(?:remember|recall)\b[\s\S]{0,64}\b(?:what|which|earlier|before|i\s+(?:asked|told)|you\s+(?:gave|said|told|suggested))\b/i.test(t)) {
    return false;
  }
  if (/\bremember\s+this\b/i.test(t)) return true;
  if (/\bfor\s+later\b/i.test(t) && /\b(?:remember|favorite|favourite|my)\b/i.test(t)) return true;
  if (/\bmy\s+(?:favorite|favourite)\s+(?:accent\s+)?(?:color|colour)\s+is\b/i.test(t)) return true;
  if (
    /\b(?:please\s+)?remember\b[\s\S]{0,60}\b(?:is|are|:)\b/i.test(t)
    && !/\b(?:what|which|did\s+i|earlier|before|i\s+asked)\b/i.test(t)
  ) {
    return true;
  }
  return false;
}

/** User wants a fact recalled from earlier in this same chat (color, habit, dinner, etc.). */
export function looksLikeThreadMemoryAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  // Planting a new fact is not a recall ask (avoids “quote prior turn” prompts on save).
  if (looksLikeThreadMemoryPlant(t)) return false;
  if (/\b(?:what|which)\b[\s\S]{0,80}\b(?:did\s+i\s+(?:tell|say|mention)|i\s+told\s+you|you\s+(?:said|told|suggested|recommend)|earlier|before)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:remember|recall)\b[\s\S]{0,64}\b(?:what|which|earlier|before|i\s+(?:told|asked)|you\s+(?:gave|said|told|suggested)|color|hex|habit|dinner)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:earlier|before)\b[\s\S]{0,48}\b(?:suggest|recommend|tell|say|color|hex|habit|dinner|accent)\b/i.test(t)) {
    return true;
  }
  return false;
}

function looksLikeExplicitTopicSwitch(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  if (
    /\b(?:new\s+topic|change\s+(?:the\s+)?subject|change\s+(?:of\s+)?(?:subject|topic)|different\s+question|unrelated\s+question|switching\s+topics?)\b/i.test(t)
  ) {
    return true;
  }
  // Clearly named new entity after an explicit pivot cue (not casual “switch to X” follow-ups).
  if (
    /\b(?:let'?s\s+(?:talk|discuss|switch)\s+(?:about\s+)?|moving\s+on\s+to\s+|totally\s+different\s+(?:topic|subject)\s*:\s*)\S/i.test(t)
    && /\b(?:about|to|:)\s+[A-Z0-9@][\w.-]{2,}/.test(t)
  ) {
    return true;
  }
  return false;
}

/** One-paint law: a quiet retry may only extend what was already painted. */
export function quietRetryExtendsPainted(painted: string, retry: string): boolean {
  const p = String(painted || '').trim();
  const r = String(retry || '').trim();
  if (!r) return false;
  if (!p) return true;
  if (r.startsWith(p)) return true;
  const pl = p.toLowerCase();
  const rl = r.toLowerCase();
  if (rl.startsWith(pl)) return true;
  const pTokens = pl.split(/\s+/).filter(Boolean);
  if (!pTokens.length) return true;
  const rSet = new Set(rl.split(/\s+/).filter(Boolean));
  let hits = 0;
  for (const tok of pTokens) {
    if (rSet.has(tok)) hits += 1;
  }
  return hits / pTokens.length >= 0.95;
}

export { looksLikeExplicitTopicSwitch };

/** True when a topic-switch reply clearly continued the previous subject. */
export function looksLikeTopicSwitchBleed(reply: string, ask: string): boolean {
  const t = String(reply || '').trim();
  const a = String(ask || '').trim();
  if (!t || !a) return false;
  // Mid-word / mid-list continuation from the previous bubble.
  if (/^[a-z]/.test(t)) return true;
  if (/^(?:and|or|,|;|:|-)\s/i.test(t)) return true;
  // Stretch ask but reply is still the prior subject (water habit OR color/hex essay).
  if (/\bstretch|desk|sit(?:ting)?\b/i.test(a)) {
    const stretchLead = /\b(?:stretch|chin tuck|shoulder|neck|hamstring|hip flexor|chest opener|cat-?cow|desk stretch|seated)\b/i.test(t.slice(0, 280));
    const waterHeavy = /\bhydrat|water bottle|drink(?:ing)?\s+(?:more\s+)?water|water intake|glasses?\s+of\s+water\b/i.test(t);
    const colorHeavy = /\b(?:hex(?:adecimal)?|accent color|#(?:[0-9a-f]{3}|[0-9a-f]{6})\b|purple accent|teal|color code|website design|call-to-action)\b/i.test(t.slice(0, 400));
    const windowsHeavy = /\b(?:default browser|Windows\s*11|taskbar|Default apps|Dock)\b/i.test(t.slice(0, 400));
    if (!stretchLead && (waterHeavy || colorHeavy || windowsHeavy)) return true;
    if (!stretchLead && /\bdive deeper in the topic of a good (?:purple|teal)\b/i.test(t)) return true;
  }
  // Breathing / calm ask but reply stuck on prior color or how-to.
  if (/\bbreath|wired at night|feeling wired\b/i.test(a)) {
    const breathLead = /\b(?:breath|inhale|exhale|box breath|4-?7-?8|calm|nose|count)\b/i.test(t.slice(0, 280));
    const priorHeavy = /\b(?:hex|teal|purple|accent color|Dock|Windows|default browser|balcony|garden)\b/i.test(t.slice(0, 400));
    if (!breathLead && priorHeavy) return true;
  }
  return false;
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
  // Soft follow-ups: topic from earlier USER turns only (assistant refusals often
  // mention “coding” and must not hijack weather / chit-chat threads).
  const priorUsers = users.filter(u => u !== latestUser && u.trim() && !isSoftContinuityAsk(u));
  const priorUserBlob = priorUsers.slice(-4).join('\n');
  if (isSoftContinuityAsk(latestUser) || !latestUser) {
    if (TEACH_HINT.test(priorUserBlob) || CODING_TOPIC_HINT.test(priorUserBlob)) {
      return { kind: 'coding', label: 'learning to code / programming' };
    }
    if (BUILD_HINT.test(priorUserBlob) || /\b(app|website|mvp|stack|scaffold|project)\b/i.test(priorUserBlob)) {
      return { kind: 'product', label: 'building a software product' };
    }
    if (MEDIA_ASK_HINT.test(priorUserBlob)) {
      return { kind: 'media', label: 'movies / TV' };
    }
    const priorAsk = [...priorUsers].reverse().find(u => u.trim() && !GREET_HINT.test(u.trim()));
    if (priorAsk) {
      return { kind: 'general', label: priorAsk.replace(/\s+/g, ' ').trim().slice(0, 80) };
    }
  }
  // Prefer user messages for topic; ignore assistant text (refusals / pivots pollute).
  const userBlob = users.join('\n');
  if (TEACH_HINT.test(userBlob) || CODING_TOPIC_HINT.test(userBlob)) {
    return { kind: 'coding', label: 'learning to code / programming' };
  }
  if (BUILD_HINT.test(userBlob) || /\b(app|website|mvp|stack|scaffold|project)\b/i.test(userBlob)) {
    return { kind: 'product', label: 'building a software product' };
  }
  if (latestUser && !isSoftContinuityAsk(latestUser)) {
    const clip = latestUser.replace(/\s+/g, ' ').trim().slice(0, 80);
    return { kind: 'general', label: clip };
  }
  void assistants;
  return { kind: 'general', label: 'the ongoing conversation' };
}

/** True when the latest ask is a new task, not a follow-up to the prior one. */
export function isTopicShift(history: RouterChatTurn[], latestUserMessage: string): boolean {
  const latest = String(latestUserMessage || '').trim();
  if (!latest) return false;
  // Soft deepen / continue always keeps the thread (fixes “dive deeper in recommended area” → movies).
  if (isSoftContinuityAsk(latest)) return false;
  // Memory plant/recall must keep the full thread — never wipe prior facts.
  if (looksLikeThreadMemoryAsk(latest) || looksLikeThreadMemoryPlant(latest)) return false;
  // Explicit “switching topics” is a real break.
  if (looksLikeExplicitTopicSwitch(latest)) return true;
  const priorUsers = history.filter(t => t.role === 'user');
  const earlier = priorUsers.length > 1
    ? priorUsers[priorUsers.length - 2]
    : priorUsers.length === 1 && priorUsers[0].content !== latest
      ? priorUsers[0]
      : null;
  if (!earlier?.content) return false;
  const a = earlier.content.trim();
  const b = latest;

  // Side quests (lyrics, weather, F1, stocks, news) always break out of a build/plan thread.
  // Import lazily via inline patterns to avoid circular deps with webSearch.
  const sideQuest = looksLikeSideQuestInline(b);
  const priorSide = looksLikeSideQuestInline(a);
  if (sideQuest && !priorSide) return true;
  if (sideQuest && priorSide && significantTokens(a).size > 0) {
    // lyrics → weather is also a shift
    const ta = significantTokens(a);
    const tb = significantTokens(b);
    let overlap = 0;
    for (const t of tb) if (ta.has(t)) overlap += 1;
    if (tb.size >= 2 && overlap / tb.size < 0.25) return true;
  }

  const priorIsBuildThread =
    TEACH_HINT.test(a) || CODING_TOPIC_HINT.test(a) || BUILD_HINT.test(a)
    || /\b(app|website|site|product|project|landing|page|ui|layout|marketplace|membership|craftsmen)\b/i.test(a);
  const latestIsBuildish =
    BUILD_HINT.test(b) || CODING_TOPIC_HINT.test(b) || THREAD_CONTINUE_HINT.test(b)
    || /\b(app|website|site|product|project|landing|page|color|font|layout|edit|change|add|fix)\b/i.test(b);

  // Long planning / build threads must stay intact — unless this is an explicit side quest.
  if (priorIsBuildThread && !sideQuest && (latestIsBuildish || b.length < 220)) return false;
  // After teach/learn or build, short / deepen asks stay on that topic (not side quests).
  if (!sideQuest && (TEACH_HINT.test(a) || CODING_TOPIC_HINT.test(a) || BUILD_HINT.test(a)) && b.length < 220) return false;
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
    if (!sideQuest && (BUILD_HINT.test(a) || TEACH_HINT.test(a) || CODING_TOPIC_HINT.test(a)) && b.length < 180) return false;
    // Short follow-ups in an ongoing thread are almost never a real topic change.
    if (!sideQuest && priorUsers.length >= 2 && b.length < 160) return false;
    return a.toLowerCase() !== b.toLowerCase() && !isSoftContinuityAsk(b);
  }
  let overlap = 0;
  for (const t of tb) if (ta.has(t)) overlap += 1;
  // Only treat as a shift when almost no shared words (was 0.28 — too eager mid-build).
  return overlap / tb.size < 0.12;
}

/** Keep in sync with looksLikeSideQuestAsk in webSearch.ts (avoid import cycles). */
function looksLikeSideQuestInline(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  if (/^(?:keep\s+building|continue\s+building|get\s+back\s+to\s+(?:building|the\s+(?:build|project|site|app)))\b/i.test(t)) {
    return false;
  }
  if (/\b(?:lyrics?|lyric\s+to|words\s+to\s+(?:the\s+)?(?:song|track))\b/i.test(t)) return true;
  if (/\b(?:song|track|album)\b/i.test(t) && /\b(?:by|from|lyrics|artist)\b/i.test(t)) return true;
  if (/\b(?:weather|forecast|temperature|humid(?:ity)?)\b/i.test(t)) return true;
  if (/\b(?:F1|formula\s*1|grand\s+prix|nascar|nba|nfl|mlb|nhl|mls|world\s+cup|premier\s+league|ufc|boxing|tennis|golf|olympics?)\b/i.test(t)) return true;
  if (/\b(?:valorant|valora(?:nt|qnt)|cs2|counter[- ]?strike|league\s+of\s+legends|\blo\s*l\b|dota\s*2|overwatch|rocket\s+league|apex\s+legends|fortnite|call\s+of\s+duty|warzone|rainbow\s+six|r6\s+siege|esports?|e[- ]?sports)\b/i.test(t)) return true;
  if (/\b(?:PRX|paper\s*rex|team\s+liquid|\bTL\b|FNATIC|FNC|Sentinels|SEN|NRG|Cloud9|C9|Gen\.?\s*G|T1|DRX|Evil\s+Geniuses|\bEG\b|G2|NaVi|Natus\s+Vincere|100\s*Thieves|LOUD|KR[UÜ]|FURIA)\b/i.test(t)
    && /\b(?:win|won|vs\.?|versus|match|series|playoffs?|tournament|champions?|masters|vct|predict|or)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:upcoming|next)\s+(?:race|races|gp|grand\s+prix|match|game|series)\b/i.test(t)) return true;
  if (/\bwho\s+(?:do\s+(?:you|u)\s+think\s+)?(?:i'?d\s+|is\s+)?(?:gonna|gon+a|gon\s*na|gonman|going\s+to|will|would)\s+win\b/i.test(t)) return true;
  if (/\bwho\s+(?:do\s+(?:you|u)\s+think\b).{0,40}\bwin\b/i.test(t)) return true;
  if (/\bwho\s+(?:wins?|winning)\b/i.test(t) && /\b(?:or|vs\.?|versus)\b/i.test(t)) return true;
  if (/\b(?:predict|prediction|favorite|favourite|underdog)\b/i.test(t)
    && /\b(?:win|match|game|series|vs\.?|versus|tournament)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:who\s+(?:is|are|was|were|'s)|who(?:'s)\s+|tell\s+me\s+about|what\s+(?:is|are)\s+(?:the\s+)?(?:brand|company|streamer|player))\b/i.test(t)
    && !/\b(?:file|folder|project|website|app\.jsx|button|css)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:twitch|youtube\.com|streamer|stream\s+on|pro\s+player)\b/i.test(t)
    && /\b(?:who|what|about|info|information|details?)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:who\s+created|founded|founder|how\s+did\s+(?:they|it|the\s+brand|the\s+company)\s+(?:start|begin|get\s+started))\b/i.test(t)) {
    return true;
  }
  if (/\b(?:stock|stocks|share\s+price|AAPL|TSLA|NVDA|S&P|nasdaq|dow\s+jones)\b/i.test(t)) return true;
  if (/\b(?:white\s+house|president|congress|election|headlines?|breaking\s+news|current\s+events)\b/i.test(t)) return true;
  if (/\bwhat(?:'s|\s+is)\s+(?:the\s+)?(?:weather|score|price|news)\b/i.test(t)) return true;
  if (/\bwho\s+won\b|\bwhat\s+happened\s+(?:today|yesterday|this\s+week|in\s+the\s+white\s+house)\b/i.test(t)) return true;
  return false;
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
  if (isClinicReportMessage(raw)) {
    const report = parseClinicReportMessage(raw);
    return report ? clinicReportToPlainText(report) : '';
  }
  if (isPlanReportMessage(raw)) {
    const report = parsePlanReport(raw);
    return report ? planReportToPlainText(report) : '';
  }
  if (isPcExploreMessage(raw)) {
    const data = parsePcExploreMessage(raw);
    return data ? pcExploreToPlainText(data) : '';
  }
  if (isPromptChipsMessage(raw)) {
    const { body, chips } = parsePromptChipsMessage(raw);
    if (isPlanReportMessage(body)) {
      return slimTurnContent(body, maxChars);
    }
    const chipNote = chips.length ? `\n[Options: ${promptChipsToPlainText(chips)}]` : '';
    return `${body}${chipNote}`.trim();
  }

  if (raw.includes('nova-media:')) {
    const stripped = stripAgentTrace(raw.replace(/!\[[^\]]*]\(nova-media:[^)]+\)/g, '').trim());
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
    const NOVA = text.match(/(?:^|\n)\s*(?:NOVA|Assistant)\s*:\s*([\s\S]+)/i);
    if (NOVA?.[1]) text = NOVA[1].replace(/^\s*NOVA\s*:\s*/i, '');
    text = text
      .split('\n')
      .filter(line => {
        const t = line.trim();
        if (!t) return true;
        if (/^(loading model|build\s*:|model\s*:|ftype\s*:|modalities\s*:|available commands)/i.test(t)) return false;
        if (/^\[\s*Prompt:/i.test(t)) return false;
        if (/nova-engine[\\/]+models/i.test(t)) return false;
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
  const keepContinuity = Boolean(
    opts?.keepContinuity
    || opts?.kind === 'coding'
    || looksLikeThreadMemoryAsk(latestUserMessage)
    || looksLikeThreadMemoryPlant(latestUserMessage),
  );  // Coding: keep prior turns short. do not re-pack old @@@FILE dumps into the context window.
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
    ? '\n\nThe user attached a photo. Describe ONLY what the image pixels show. '
      + 'Never invent contents from a filename or alt text (those labels can be wrong). '
      + 'If you cannot see the image, say so in one line. '
      + 'Do not pitch coding, apps, or building a project unless they clearly asked to build or edit.'
    : '';
  const today = todaySystemLine();
  const todayNote = today ? `\n\n${today}` : '';
  // Topic switch / memory plant must win even when history was wiped to one user turn.
  if (looksLikeExplicitTopicSwitch(latest.trim())) {
    return `${BASE_SYSTEM}${todayNote}\n\n`
      + 'The user clearly switched topics. Answer ONLY the new ask with a brand-new reply. '
      + 'Do not continue the previous subject mid-sentence. Do not mention water habits, cooking, Windows, or coding unless the new ask is about that. Do not offer coding unless they asked.'
      + visionNote;
  }
  if (looksLikeThreadMemoryPlant(latest.trim())) {
    return `${BASE_SYSTEM}${todayNote}\n\n`
      + 'The user is sharing a fact to remember later in THIS chat. '
      + 'Acknowledge briefly and confirm the exact fact they gave (name, hex, habit, etc.). '
      + 'Do NOT tie it to earlier how-tos, Windows tips, browsers, or any prior subject. '
      + 'Do NOT offer coding, projects, or “related” follow-ups. Stop after the confirmation.'
      + visionNote;
  }
  const hasPrior = history.some(t => t.role === 'assistant') || history.length > 1;
  if (!hasPrior) return `${BASE_SYSTEM}${todayNote}${visionNote}`;
  const topic = inferThreadTopic(history);
  const topicLine =
    `Current thread topic: ${topic.label}. Stay on this unless the user clearly switches to something else.`;
  if (looksLikeThreadMemoryAsk(latest.trim())) {
    return `${BASE_SYSTEM}${todayNote}\n\n${topicLine}\n`
      + 'The user is asking you to RECALL something from earlier in THIS chat. '
      + 'Answer in 1–2 short sentences: quote the fact (hex code, habit name, dinner idea). '
      + 'Do not restart a full plan or recipe. Do not ask them to restate it. Do not invent a new example. '
      + 'Do not offer coding help. Do not drag in unrelated earlier topics (Windows, browsers, how-tos).'
      + visionNote;
  }
  if (isSoftContinuityAsk(latest.trim())) {
    return `${BASE_SYSTEM}${todayNote}\n\n${topicLine}\n`
      + 'The user asked to continue / deepen (yes, more, overall, full detail). '
      + 'Deepen the previous answer with NEW facts, numbers, examples, or angles that were NOT already said. '
      + 'Do not paraphrase the same temperatures, precip totals, or summary. Do not restart with Hello. '
      + 'Take your time. Prefer thorough, useful detail over a short restatement. '
      + 'For weather: add week-by-week feel, humidity, wind, sunshine vs rain days, packing/clothing, how it compares to adjacent months, and tourist tips. '
      + 'Do not offer coding or programming unless that was already the topic.'
      + visionNote;
  }
  return `${BASE_SYSTEM}${todayNote}\n\n${topicLine}\n${CONTINUITY}${visionNote}`;
}

function wantsChatCode(latest: string) {
  const t = String(latest || '');
  // Create/craft and disk file edits already demand @@@FILE — never prepend the
  // chat “one markdown fence” hint (32B GGUFs echo that into App.jsx).
  if (/\b@@@FILE\b/i.test(t) || /\bcreateV2 RULES\b/i.test(t) || /\bOutput ONLY (?:one )?file block/i.test(t)) {
    return false;
  }
  return BUILD_HINT.test(t) && !TEACH_HINT.test(t);
}

export function flattenHistoryText(history: RouterChatTurn[]): string {
  return history
    .map((t) => {
      const raw = String(t.content || '').trim();
      // Prefer spoken answer — nova-trace JSON (esp. invent Acc file lists) must not inflate budget.
      const body = t.role === 'assistant' ? (stripAgentTrace(raw) || raw) : raw;
      return `${t.role === 'user' ? 'User' : 'NOVA'}: ${body}`;
    })
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
    asstBeats.length ? `Earlier NOVA points:\n${asstBeats.join('\n')}` : '',
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
  const memoryAsk = looksLikeThreadMemoryAsk(latest);
  const memoryPlant = looksLikeThreadMemoryPlant(latest);
  const topicSwitch = looksLikeExplicitTopicSwitch(latest);
  const userCount = history.filter(t => t.role === 'user').length;
  // Explicit topic switch must NOT keep packing the old thread into the user prompt.
  const keepContinuity = !topicSwitch && (
    softFollow
    || memoryAsk
    || memoryPlant
    || history.some(t => /Earlier in this chat/i.test(t.content))
    || userCount >= 2
    || history.some(t => t.role === 'assistant')
  );  if (
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
      ? `${softFollow
        ? 'Previous answer (already given). Your job is to ADD new depth, not repeat it:\n'
        : 'Previous answer:\n'}${lastAssistant}`
      : '',
    softFollow
      ? 'Instruction: Write a thorough NEW expansion with facts or angles missing above. Do not copy or lightly rephrase the previous answer. At least 2–3 substantial new paragraphs when the topic supports it.'
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
 * Strip unfinished outline leftovers local models emit: bare “7. Backend”,
 * orphan “-” bullets, hanging “— Technical Considerations” with no body.
 */
export function scrubHollowOutlineLists(raw: string): string {
  let text = String(raw || '').replace(/\r\n/g, '\n');
  if (!text) return text;
  // Orphan dash / bullet-only lines.
  text = text.replace(/^\s*[-*•]\s*$/gm, '');
  // Numbered item split across lines with empty body: "1.\nTitle" kept if title has prose;
  // bare "7. Backend\n-" style hollows dropped below.
  // Numbered or bulleted title with no following content before next item / end.
  // Keep items that have real prose on the same line after the title.
  text = text.replace(
    /(?:^|\n)(\s*(?:\d+[.)]\s+|[-*•]\s+)\*{0,2}[A-Za-z][^\n*]{0,48}\*{0,2})\s*(?=\n\s*(?:\d+[.)]\s+|[-*•]\s+|$)|\n\n|$)/gm,
    (full, head: string) => {
      const body = String(head || '').replace(/^\s*(?:\d+[.)]\s+|[-*•]\s+)/, '').replace(/\*+/g, '').trim();
      // Drop skeletal one-word / two-word headers with no detail clause.
      if (/^(?:Backend|Frontend|Security|Deployment|Testing|Styling|Database|API|Auth(?:entication)?|Infrastructure|Example Flow|Technical Considerations|Choose a Tech Stack|Design Wireframes|Set Up Development Environment|Start Coding|User Signs Up|Posting a Note|Viewing Posts|Commenting and Reacting|Notifying Users)$/i.test(body)) {
        return '\n';
      }
      // Same-line title that ends with a colon and nothing after.
      if (/:\s*$/.test(body) && body.length < 40) return '\n';
      // Title-only (no dash/colon detail) under 4 words — usually incomplete outline stubs.
      if (!/[-–—:]/.test(body) && body.split(/\s+/).length <= 4 && body.length < 36) {
        return '\n';
      }
      return full;
    },
  );
  // Hanging em-dash section labels with no following paragraph.
  text = text.replace(/(?:^|\n)\s*[—–-]\s*(?:Technical Considerations|Example Flow|Next Steps?|Would you like[^\n]*)\s*(?=\n|$)/gi, '\n');
  // Collapse leftover blank runs.
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Strip GGUF / packed-prompt echoes so the bubble never shows “> hello” or
 * a full User:/NOVA: transcript before the real answer.
 */
/**
 * Keep planning outlines that models wrap in ```markdown / ```text.
 * Only real code languages stay fenced for the code-dump stripper below.
 */
function unwrapPlanningFences(input: string): string {
  let text = String(input || '');
  const planLang = /^(?:markdown|md|text|plain|outline|plan)?$/i;
  const codeLang = /^(?:jsx?|tsx?|javascript|typescript|html|css|python|json|bash|sh|shell|xml|sql|rust|go|cpp|c\+\+|c|java|swift|kotlin|vue|svelte)$/i;

  // Closed fences: unwrap planning languages; leave code fences alone.
  text = text.replace(/```([\w.+-]*)[^\n]*\n([\s\S]*?)```/g, (full, lang, body) => {
    const l = String(lang || '').trim();
    const inner = String(body || '').replace(/\s+$/, '');
    if (codeLang.test(l)) return full;
    if ((planLang.test(l) || !l) && !inner.trim()) return '';
    if (planLang.test(l) || !l) return inner;
    // Unknown lang: unwrap if body looks like a list/outline, else keep.
    if (/^\s*(?:\d+\.|[-*•]|\*\*[^*\n]+)/m.test(inner) && !/(?:export\s+default|className=|<!DOCTYPE|function\s*\()/m.test(inner)) {
      return inner;
    }
    return full;
  });

  // Unclosed fence at end (common while streaming): keep the outline, don’t delete to EOF.
  const unclosed = text.match(/```([\w.+-]*)[^\n]*\n([\s\S]*)$/);
  if (unclosed) {
    const l = String(unclosed[1] || '').trim();
    const body = unclosed[2] || '';
    const looksCode = codeLang.test(l)
      || /(?:export\s+default|function\s*\(|const\s+\w+\s*=|className=|<!DOCTYPE)/.test(body);
    const looksPlan = planLang.test(l)
      || /^\s*(?:\d+\.|[-*•]|\*\*[^*\n]+)/m.test(body)
      || (body.length > 80 && !looksCode);
    if (looksPlan && !looksCode) {
      text = text.replace(/```[\w.+-]*[^\n]*\n[\s\S]*$/, body.trim() ? body.replace(/\s+$/, '') : '');
    }
  }
  text = text.replace(/```(?:markdown|md|text|plain|outline|plan)?\s*$/gi, '');
  text = text.replace(/(?:^|\n)\s*(?:markdown|md|text|plain|outline|plan)\s*```+\s*/gi, '\n');
  text = text.replace(/```+\s*(?:markdown|md|text|plain|outline|plan)?\s*$/gi, '');

  return text;
}

export function sanitizeAssistantReply(
  raw: string,
  lastUserMessage?: string,
  previousAssistant?: string,
  opts?: { stream?: boolean },
): string {
  let text = String(raw || '').replace(/\r\n/g, '\n').trim();
  if (!text) return '';
  // Structured clinic / plan payloads — never run fence/JSON strippers on them.
  if (isClinicReportMessage(text)) return text;
  if (isPlanReportMessage(text)) return text;
  text = stripAgentTrace(text);

  // Drop full system-prompt echoes from GGUF / packed prompts.
  text = text.replace(SYSTEM_ECHO_RE, '').trim();
  text = text.replace(CODING_WORKSPACE_ECHO_RE, '').trim();
  let peeled = '';
  while (text !== peeled) {
    peeled = text;
    for (const re of INSTRUCTION_LEAD_RES) text = text.replace(re, '').trim();
  }
  text = stripEmbeddedSystemPrompt(text);
  if (/^You are NOVA[\s\S]{20,400}$/i.test(text.trim())) return '';
  if (/^(?:a )?normal helpful AI chat assistant\b/i.test(text.trim())) return '';
  if (/\bTalk like ChatGPT\b/i.test(text) && text.length < 900) {
    text = text.replace(/\bTalk like ChatGPT[^\n.]*/gi, '').trim();
  }

  text = text.replace(/^\(?\s*truncated\s*\)?\s*/i, '').trim();

  // Prefer the completion after the last NOVA: / Assistant: marker (packed prompt echo).
  const markRe = /(?:^|\n)\s*(?:NOVA|Assistant)\s*:\s*/gi;
  let lastMark: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = markRe.exec(text)) !== null) lastMark = m;
  if (lastMark && typeof lastMark.index === 'number') {
    text = text.slice(lastMark.index + lastMark[0].length).replace(/^\s*NOVA\s*:\s*/i, '').trim();
  }

  // Drop leading shell-style echoes: "> hello"
  text = text.replace(/^(?:>\s*.+\n)+/m, '').trim();
  text = text.replace(/^>\s*.+$/m, '').trim();

  // Orphan leftovers from a prior turn (list item / typo-correction closer)
  text = text.replace(/^[a-z]\.\s+Is there anything specific you'd like to know about NOVA\??\s*/i, '').trim();
  text = text.replace(/^[a-z]\.\s+(?:If you have any specific|I(?:['’]d| would) be happy)[^\n]*\n*/i, '').trim();
  text = text.replace(/^Hello!\s+It (?:looks|seems) like you might have (?:meant|a typo)[^\n]*\n*/i, '').trim();
  text = tidyMarkdownStars(text);
  text = normalizeAssistantLists(text);
  text = scrubHelpVoice(text);
  text = scrubBuildAggression(text);
  // Display-time wrap-up only for real product/planning asks — never Windows how-tos or chit-chat.
  const userForExit = String(lastUserMessage || '').trim();
  const productPlanExit =
    /\b(?:build|create|scaffold|app|website|mvp|product|tracker|stall|shelf|borrow|landing\s+page)\b/i.test(userForExit)
    && !/\b(?:windows|browser|taskbar|settings|stretch|habit|dinner|capital|workout|walk)\b/i.test(userForExit);
  if (!opts?.stream && productPlanExit && /^\s*\d+[.)]\s+/m.test(text)) {
    text = ensurePlanningExit(text, lastUserMessage || text);
  }
  // Never leave product-plan Overall glued on (whether we just appended or the model did).
  text = scrubPlanExitBleed(text);

  // Strip fancy dashes from model output (em/en dash). keep normal hyphens in words/versions.
  text = text
    .replace(/\u2014|\u2013|\u2212/g, '. ')
    .replace(/\s+\.\s+/g, '. ')
    .replace(/([.!?])\s*\./g, '$1')
    .replace(/\.\s*\./g, '.')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/ {2,}/g, ' ')
    .trim();

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
    text = stripFirstPersonAskRestatement(text, user);
    // Strip mirrored openers like “I like your ideas. Let's focus…”
    text = text.replace(/^(?:i\s+like\s+your\s+ideas?|thanks?(?:\s+for(?:\s+the)?\s+ideas?)?|sounds?\s+good)[,!.]?\s+/i, '').trim();
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

  // Unsolicited coding pivots (common local-model habit after refusals / chit-chat).
  const userAskedCode =
    Boolean(user)
    && (TEACH_HINT.test(user) || CODING_TOPIC_HINT.test(user) || BUILD_HINT.test(user));
  if (!userAskedCode) {
    text = text
      .replace(
        /(?:^|\n+)(?:Instead[,.]?\s+)?(?:I\s+can\s+help\s+you\s+(?:get\s+started\s+with\s+)?learning\s+(?:to\s+)?(?:code|coding|program(?:ming)?)[^.!?\n]*[.!?]?\s*)+/gi,
        '\n',
      )
      .replace(
        /(?:^|\n+)What\s+specific\s+aspect\s+of\s+coding[^.!?\n]*[.!?]?\s*/gi,
        '\n',
      )
      .replace(
        /(?:^|\n+)(?:For\s+example,\s+)?do\s+you\s+want\s+to\s+learn\s+(?:a\s+)?particular\s+programming\s+language[^.!?\n]*[.!?]?\s*/gi,
        '\n',
      )
      .replace(
        /(?:^|\n+)I(?:'m|\s+am)\s+happy\s+to\s+help\s+you\s+(?:get\s+started\s+with\s+)?(?:coding|programming|learning\s+to\s+code)[^.!?\n]*[.!?]?\s*/gi,
        '\n',
      )
      // Greeting / chit-chat: never pivot into coding projects.
      .replace(
        /(?:\s+|\n+)Any coding projects you(?:'re| are) excited about[^.!?\n]*[.!]?\s*/gi,
        ' ',
      )
      .replace(
        /(?:\s+|\n+)(?:Any|Got any) (?:coding |programming )?(?:projects?|apps?) you(?:'re| are) (?:working on|excited about|building)[^.!?\n]*[.!]?\s*/gi,
        ' ',
      )
      // "What kind of fun coding project…" / "Maybe we can build a simple game…"
      .replace(
        /(?:\s+|\n+)What kind of (?:fun\s+)?(?:coding|programming)\s+project[^.!?\n]*[.!]?\s*/gi,
        ' ',
      )
      .replace(
        /(?:\s+|\n+)Maybe we can (?:build|create|make) (?:a\s+)?(?:simple\s+)?(?:game|calculator|web\s+page|app)[^.!?\n]*[.!]?\s*/gi,
        ' ',
      )
      .replace(
        /(?:\s+|\n+)What (?:kind of |catches your interest|are you interested in)[^.!?\n]*(?:coding|project|build)[^.!?\n]*[.!]?\s*/gi,
        ' ',
      )
      .replace(
        /(?:\s+|\n+)How about yours\?\s*Any coding[^.!?\n]*[.!]?\s*/gi,
        ' How about yours? ',
      )
      // Soft check-in: "What's your quick question about coding or programming?"
      .replace(
        /\b(?:what(?:'s|\s+is)\s+your\s+(?:quick\s+)?question\s+about\s+(?:coding|programming)(?:\s+or\s+(?:coding|programming))?)\s*\??/gi,
        "what's on your mind?",
      )
      .replace(
        /\s+about\s+(?:coding|programming)(?:\s+or\s+(?:coding|programming))?\s*\??/gi,
        '?',
      )
      .replace(
        /\bquick question about (?:coding|programming)(?:\s+or\s+(?:coding|programming))?\b/gi,
        'quick question',
      )
      // Unsolicited coding CTA after a normal fact / chit-chat answer.
      .replace(
        /(?:\s+|\n+)If you have any (?:coding|programming|code)(?:\s+or\s+programming)? questions[^.!?\n]*[.!]?\s*/gi,
        ' ',
      )
      .replace(
        /(?:\s+|\n+)If you have any more questions about (?:coding|programming)(?:\s+or\s+anything else)?[^.!?\n]*[.!]?\s*/gi,
        ' ',
      )
      .replace(
        /(?:\s+|\n+)(?:Feel free to ask|Let me know) if you (?:have|need) (?:any )?(?:coding|programming|code)[^.!?\n]*[.!]?\s*/gi,
        ' ',
      )
      .replace(
        /(?:\s+|\n+)(?:Happy to help with|I can (?:also )?help with) (?:any )?(?:coding|programming)[^.!?\n]*[.!]?\s*/gi,
        ' ',
      )
      .replace(
        /(?:\s+|\n+)How can we dive deeper (?:in|into|with) (?:coding|programming)[^.!?\n]*[.!]?\s*/gi,
        ' ',
      )
      .replace(
        /(?:\s+|\n+)(?:Want to|Would you like to) (?:dive deeper|go deeper|talk more) (?:about |into )?(?:coding|programming)[^.!?\n]*[.!]?\s*/gi,
        ' ',
      )
      .replace(
        /(?:\s+|\n+)(?:Any|Have any) (?:coding|programming) questions[^.!?\n]*[.!]?\s*/gi,
        ' ',
      )
      .replace(
        /(?:\s+|\n+)If you need help incorporating[^.!?\n]*(?:coding|design)[^.!?\n]*[.!]?\s*/gi,
        ' ',
      )
      .replace(
        /(?:\s+|\n+)If you need (?:any )?(?:coding tips|help with (?:your )?projects)[^.!?\n]*[.!]?\s*/gi,
        ' ',
      )
      .replace(
        /(?:\s+|\n+)If you(?:'re| are) interested in learning more about[^.!?\n]*related to (?:coding|programming)[^.!?\n]*[.!]?\s*/gi,
        ' ',
      )
      .replace(
        /(?:\s+|\n+)(?:or )?need any information related to (?:coding|programming)[^.!?\n]*[.!]?\s*/gi,
        ' ',
      )
      .replace(
        /(?:\s+|\n+)(?:any information )?related to (?:coding|programming)[^.!?\n]*[.!]?\s*/gi,
        ' ',
      )
      .replace(
        /(?:\s+|\n+)(?:Anything else|Any other questions) (?:related to |about )?(?:coding|programming)[^.!?\n]*[.!]?\s*/gi,
        ' ',
      )
      .replace(
        /(?:\s+|\n+)Let me know if you need any more help with coding[^.!?\n]*[.!]?\s*/gi,
        ' ',
      )
      .replace(
        /(?:\s+|\n+)If you have any specific questions about using this color[^.!?\n]*[.!]?\s*/gi,
        ' ',
      )
      // Topic glue: "fun detail… not related to [prior how-to]" after memory / chit-chat.
      .replace(
        /(?:\s+|\n+)(?:While\s+)?this\s+is\s+a\s+fun\s+detail[^.!?\n]*[.!]?\s*/gi,
        ' ',
      )
      .replace(
        /(?:\s+|\n+)(?:it\s+)?might\s+not\s+directly\s+relate\s+to[^.!?\n]*[.!]?\s*/gi,
        ' ',
      )
      .replace(
        /(?:\s+|\n+)(?:For example,\s+)?if you want to know how to change (?:the\s+)?(?:accent\s+)?color on your Windows[^.!?\n]*[.!]?\s*/gi,
        ' ',
      )
      .replace(
        /(?:\s+|\n+)(?:we can explore that too|feel free to ask)[^.!?\n]*[.!]?\s*$/gim,
        ' ',
      )
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  // Memory plant: keep only the acknowledgment — strip prior-topic leftovers.
  if (user && looksLikeThreadMemoryPlant(user)) {
    text = text
      .replace(/(?:^|\n+)[^.!\n]*(?:default browser|Windows\s*11|taskbar|pin an app)[^.!\n]*[.!]?\s*/gi, '\n')
      .replace(/(?:^|\n+)[^.!\n]*(?:coding|programming|projects?)[^.!\n]*[.!]?\s*/gi, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  // Memory recall: never re-open prior how-tos.
  if (user && looksLikeThreadMemoryAsk(user)) {
    text = text
      .replace(/(?:^|\n+)[^.!\n]*(?:default browser|Windows\s*11|taskbar)[^.!\n]*[.!]?\s*/gi, '\n')
      .replace(/(?:^|\n+)[^.!\n]*questions about coding[^.!\n]*[.!]?\s*/gi, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  // Drop hollow quiz closers local models love ("Would you like more information on any of these steps?").
  text = text
    .replace(/(?:\n+|^)\s*Would you like more information on any of these steps[^.!?\n]*[.!?]?\s*/gi, '\n')
    .replace(/(?:\n+|^)\s*Do you have (?:any )?specific questions(?: about[^.!?\n]*)?[.!]?\s*/gi, '\n')
    .replace(/(?:\n+|^)\s*Would you like (?:me to )?(?:provide )?(?:more|any) (?:information|details|help)[^.!?\n]*[.!?]?\s*$/gim, '\n')
    .replace(/(?:\n+|^)\s*Would you like to (?:start with|focus on|add or modify|try|explore|continue with)[^.!?\n]*[.!?]?\s*$/gim, '\n')
    .replace(/(?:\n+|^)\s*Would you like (?:to )?(?:me to )?[^.!?\n]{0,80}\?\s*$/gim, '\n')
    .replace(/(?:\n+|^)\s*Want more on any of that\??\s*$/gim, '\n')
    .replace(/(?:\n+|^)\s*(?:How do these suggestions sound[^.!?\n]*[.!?]?\s*)?(?:Are there any specific areas you'?d like (?:to focus on first|more detail on))\??\s*$/gim, '\n')
    .replace(/(?:\n+|^)\s*Let me know if you (?:have|need|want) (?:any )?(?:questions|more)[^.!?\n]*[.!?]?\s*$/gim, '\n')
    .replace(/(?:\n+|^)\s*What platform or technology do you plan to use[^.!?\n]*[.!?]?\s*$/gim, '\n')
    .replace(/(?:\n+|^)\s*Would you like to dive (?:in|into|deeper)[^.!?\n]*[.!?]?\s*$/gim, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Incomplete product outlines: bare titles, orphan dashes, hanging section labels with no body.
  text = scrubHollowOutlineLists(text);

  // Soft “yes” after a real answer: drop fresh greetings that ignore continuity.
  if (user && isSoftContinuityAsk(user)) {
    text = text
      .replace(/^Hello[!.,]?\s+/i, '')
      .replace(/^Hi[!.,]?\s+How\s+can\s+I\s+assist[^.!?\n]*[.!?]?\s*/i, '')
      .replace(/^How\s+can\s+I\s+assist\s+you\s+further[^.!?\n]*[.!?]?\s*/i, '')
      .trim();
  }

  // Topic switch: drop mid-sentence leftovers from the previous answer.
  if (user && looksLikeExplicitTopicSwitch(user)) {
    if (/^[a-z]/.test(text)) {
      const cut = text.match(/[.!?]\s+([A-Z][\s\S]*)/);
      if (cut?.[1] && cut[1].length >= 40 && !looksLikeTopicSwitchBleed(cut[1], user)) {
        text = cut[1].trim();
      }
    }
    if (looksLikeTopicSwitchBleed(text, user) && !opts?.stream) {
      // Prefer a clean short ask-shaped answer over prior-topic garbage.
      if (/\bstretch|desk\b/i.test(user)) {
        text = [
          'Try a seated chest opener: sit tall, clasp your hands behind your back (or hold the chair sides), and gently lift your chest while rolling the shoulders back.',
          'Hold for 20–30 seconds, breathe slowly, then release. Do it once or twice when you notice yourself slumping.',
        ].join(' ');
      } else if (/\bbreath|wired at night|feeling wired\b/i.test(user)) {
        text = [
          'Try a slow 4-7-8 breath: inhale through your nose for 4, hold for 7, then exhale through your mouth for 8.',
          'Do three to four rounds in bed with lights low. If holding feels tense, shorten the hold and keep the exhale longer than the inhale.',
        ].join(' ');
      } else {
        const cut = text.match(/[.!?]\s+([A-Z][\s\S]*)/);
        text = (cut?.[1] && cut[1].length >= 40) ? cut[1].trim() : text.replace(/^[a-z][\s\S]*?(?=[A-Z])/m, '').trim() || text;
      }
    }
  }

  // Unless the user asked to see source in chat, never leave code fences / JSX dumps in the bubble.
  // Planning outlines often use ```markdown — unwrap those so lists are not retracted mid-stream.
  const keepCodeInChat = Boolean(
    user
    && (
      /\b(?:copy[\s-]?paste|paste(?:able)?|clipboard)\b/i.test(user)
      || /\b(?:give|show|write|paste|provide|see)\b[\s\S]{0,48}\b(?:me\s+)?(?:the\s+)?(?:full\s+)?(?:source\s+)?(?:code|snippet)\b/i.test(user)
      || (/\bin\s+chat\b/i.test(user) && /\b(?:code|snippet|source)\b/i.test(user))
    )
    && !/\b(?:create\s+(?:a\s+)?(?:project|folder)|on\s+disk|preview|localhost|scaffold)\b/i.test(user)
  );
  if (!keepCodeInChat) {
    text = unwrapPlanningFences(text);
    const hadCodeDump = /@@@FILE|<!DOCTYPE\b|<html[\s>]|export\s+default\s+function/i.test(text)
      || /```(?:jsx?|tsx?|javascript|typescript|html|css|python|json|bash|sh|shell|xml|sql|rust|go|cpp|c\+\+|java|swift|kotlin|vue|svelte)\b/i.test(text)
      || /<(?:section|div|header|nav|button|form|select|option|style|script)\b/i.test(text)
      || /\b(?:document\.querySelector|addEventListener|useState\s*\(|className\s*=)/i.test(text)
      || ((text.match(/[{};]/g) || []).length >= 10 && /className=|<\/?[A-Z][A-Za-z]+/.test(text));
    if (hadCodeDump && !opts?.stream) {
      text = text
        .replace(/@@@FILE\s+[^\n\r]+\s*```[\w.+-]*\s*\n[\s\S]*?```/gi, '')
        .replace(/```(?:jsx?|tsx?|javascript|typescript|html|css|python|json|bash|sh|shell|xml|sql|rust|go|cpp|c\+\+|java|swift|kotlin|vue|svelte)[^\n]*\n[\s\S]*?```/gi, '')
        .replace(/```(?:jsx?|tsx?|javascript|typescript|html|css|python|json|bash|sh|shell|xml|sql|rust|go|cpp|c\+\+|java|swift|kotlin|vue|svelte)[^\n]*\n[\s\S]*$/gi, '')
        .replace(/```[\s\S]*?```/g, '')
        .replace(/(?:^|\n)\s*(?:html|jsx|javascript|css|tsx?)\s*\n?[\s\S]*?(?=\n\s*(?:Open your|Save all|If you need|Responded)|$)/gi, '\n')
        .replace(/<\/?[A-Za-z][^>]*>/g, '')
        .replace(/\b(?:document\.querySelector|addEventListener)\([^)]*\)[^.;\n]*[.;]?/gi, '')
        .replace(/^\s*(?:import|export|const|let|var|function|return|className=)\b[^\n]*$/gim, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      // Never invent “I applied that…” — only apply handlers may claim disk writes.
      if (!text || text.length < 12 || /here'?s how you can do it/i.test(text)) {
        text = user && /\b(?:rebuild|edit|fix|apply)\b/i.test(user)
          ? 'I could not apply that change yet. Pin a coder in **Models**, tell me what to fix, or open **Code** to edit.'
          : (text || 'Got it — happy to keep going in plain language.');
      }
    } else if (hadCodeDump && opts?.stream) {
      // Live: unwrap fences lightly; never collapse the bubble to a canned line mid-stream.
      text = text
        .replace(/@@@FILE\s+[^\n\r]+\s*/gi, '')
        .replace(/```[\w.+-]*\n?/g, '')
        .trim();
    }
  }

  // Summaries: collapse “1. 2. 3.” laundry lists into flowing prose when clearly a recap ask.
  if (user && /\b(?:summarize|summary|recap)\b/i.test(user) && /\b(?:chat|conversation|thread)\b/i.test(user)) {
    text = text
      .replace(/^(?:Sure[!.,]?\s*)?(?:Here'?s|Here is)(?:\s+a)?\s+summary[^.!?\n]*[.!]?\s*/i, '')
      .replace(/^\s*\d+\.\s+/gm, '')
      .replace(/\n{2,}/g, ' ')
      .replace(/\s+/g, ' ')
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

  // English chat: strip accidental CJK/etc. bleed unless they asked for a translation.
  text = scrubUnexpectedForeignScript(text, lastUserMessage);

  return text;
}

export function looksLikePromptEcho(reply: string): boolean {
  const t = String(reply || '').trim().replace(/^[,.;:\s]+/, '');
  if (!t) return false;
  if (PROMPT_FRAGMENT_RE.test(t)) return true;
  // Strong signal: models sometimes re-emit the exact system instruction block.
  if (/^You are NOVA, a (?:normal )?helpful AI chat assistant/i.test(t)
    || /^(?:a )?normal helpful AI chat assistant\b/i.test(t)
    || /\bTalk like ChatGPT\b/i.test(t)) {
    return /Hello! How can I assist you today/i.test(t)
      || /Never nest asterisks/i.test(t)
      || /Want more on any of that/i.test(t)
      || /Never introduce yourself/i.test(t)
      || /AI creation studio that runs on their PC/i.test(t)
      || t.length > 200;
  }
  if (/^You are NOVA, the assistant inside the NOVA desktop creation studio on this computer\./i.test(t)) {
    return /Do not echo the prompt\./i.test(t) || /Answer the latest user request clearly\./i.test(t);
  }
  if (/^You are NOVA, the assistant in the NOVA desktop creation studio/i.test(t)) {
    return /Never continue a previous sentence/i.test(t) || /Answer only the latest user message/i.test(t);
  }
  if (/^Never continue a previous sentence/i.test(t) && /The user wants working source code/i.test(t)) {
    return !/```/.test(t);
  }
  // Weaker fallback: if it starts like the system prompt, and contains typical system phrases.
  if (/^You are NOVA(?:,|\s)/i.test(t) && /Do not echo the prompt\./i.test(t)) return true;
  return false;
}

/**
 * True only for short pure greetings.
 * "hey so my community center…" / idea pitches that start with hey are NOT greetings.
 */
export function userMessageIsPureGreeting(userMessage?: string): boolean {
  const u = String(userMessage || '').trim();
  if (!u || u.length > 40) return false;
  // Keep in sync with looksLikePureGreeting (typos like ehello).
  if (/^(hi|hii+|hello|heelo|hell+o|helo|ehello|hey|howdy|yo)(\s+(there|nova|friend|team))?[.!?]*$/i.test(u)) {
    return true;
  }
  const letters = u.toLowerCase().replace(/[^a-z]/g, '');
  return /^e?h+[ei]*l+o+$/.test(letters) && letters.length <= 10;
}

/**
 * Strip the canned system greeting anywhere it appears (not only exact full replies).
 * Stops mid-stream flicker: "Sure! Here's" → Hello → rewrite.
 */
export function scrubCannedGreetingFlash(text: string): string {
  return String(text || '')
    .replace(/Hello!\s*How can I assist you today\??\.?/gi, '')
    .replace(/^\s*["']?\s*If\.\s*/i, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Exact system greeting parroted when the user did not ask for a greeting. */
export function isCannedGreetingReply(reply: string, userMessage?: string): boolean {
  const raw = String(reply || '').trim();
  const r = scrubCannedGreetingFlash(raw);
  if (!r) return !userMessageIsPureGreeting(userMessage); // was only the greeting
  if (/^Hello! How can I assist you today\??\.?$/i.test(raw)) {
    return !userMessageIsPureGreeting(userMessage);
  }
  // Mid-thread reset: greeting + assist ask when the user already gave product context.
  if (
    /Hello!\s*How can I assist you today/i.test(raw)
    && !userMessageIsPureGreeting(userMessage)
  ) {
    return true;
  }
  // Generic "how can I assist / what would you like" with no substance after a real ask.
  if (
    /^(?:Hi|Hello|Hey)[!.,]?\s*(?:How can I (?:assist|help) you today|What (?:can I|would you like)[^.!?]{0,40})\??\.?\s*$/i.test(raw)
    && !userMessageIsPureGreeting(userMessage)
  ) {
    return true;
  }
  // Greeting mashed into a stub / truncated flash
  if (
    /Hello!\s*How can I assist you today/i.test(raw)
    && r.length < 80
    && !userMessageIsPureGreeting(userMessage)
  ) {
    return true;
  }
  return false;
}

/** Reply stopped mid-thought (common on small local models). */
export function looksLikeTruncatedAssistantReply(text: string): boolean {
  const t = String(text || '').trim();
  if (!t || t.length < 48) return false;
  // Outline headings often end with ":" ("4. Backend:") — do NOT treat as truncated
  // when the reply already has multiple numbered sections (avoids a 1–2 min CONTINUE stall).
  if (/[:：]\s*$/.test(t)) {
    const numbered = (t.match(/^\s*\d+\.\s+/gm) || []).length;
    if (numbered >= 2 && t.length >= 200) return false;
    return true;
  }
  if (/\b(?:here(?:'s| is)|following|below|structure|example|using)\b[^.!?\n]{0,80}$/i.test(t)
    && !/[.!?]"?\s*$/.test(t)) {
    return true;
  }
  if (/\b(?:flask|django|express|fastapi|react|python)\b[^.!?\n]{0,60}:\s*$/i.test(t)) return true;
  // Ends mid-word or without terminal punctuation after a long clause.
  if (t.length >= 120 && !/[.!?…]["')\]]?\s*$/.test(t) && /,\s*$/.test(t)) return true;
  return false;
}

/** True when a soft follow-up reply mostly restates the previous assistant answer. */
export function looksLikeRestatedPriorAnswer(reply: string, previousAssistant?: string): boolean {
  const r = String(reply || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const p = String(previousAssistant || '').trim().replace(/\s+/g, ' ').toLowerCase();
  if (!r || p.length < 80) return false;
  if (r === p) return true;
  // Share of reply tokens that already appeared in the prior answer.
  const rt = r.split(/[^a-z0-9]+/).filter(w => w.length > 3);
  const pt = new Set(p.split(/[^a-z0-9]+/).filter(w => w.length > 3));
  if (rt.length < 12 || pt.size < 12) return false;
  let hit = 0;
  for (const w of rt) if (pt.has(w)) hit += 1;
  const overlap = hit / rt.length;
  // Near-copy, or shorter paraphrase of the same content.
  if (overlap >= 0.72) return true;
  if (overlap >= 0.58 && r.length < p.length * 1.15) return true;
  return false;
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
  // First-person restatement of a build/create ask (“I want to build a basic 3D…”)
  const lead = r.slice(0, Math.min(220, r.length));
  if (
    /^(?:sure[,.]?\s+)?i\s+(?:want|would like|['’]d like|am trying|need)\s+to\s+(?:build|create|make|start)/i.test(lead)
    && /\b(?:build|create|make)\b/i.test(u)
  ) {
    const ut = significantTokens(u);
    const lt = significantTokens(lead);
    let hit = 0;
    for (const w of lt) if (ut.has(w)) hit += 1;
    if (ut.size >= 4 && hit / Math.min(ut.size, Math.max(lt.size, 1)) >= 0.45) return true;
  }
  // Mirror openers (“I like your ideas…”) pasted back as the assistant lead.
  if (
    /^(?:i\s+like\s+your\s+ideas?|thanks?(?:\s+for\s+(?:the\s+)?ideas?)?|sounds?\s+good)\b/i.test(lead)
    && /^(?:i\s+like\s+your\s+ideas?|thanks?|sounds?\s+good)\b/i.test(u)
  ) {
    return true;
  }
  if (
    /^(?:i\s+like\s+your\s+ideas?)[,.]?\s+/i.test(rl)
    && /\bi\s+like\s+your\s+ideas?\b/i.test(ul)
  ) {
    return true;
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

/**
 * Drop a leading first-person paraphrase of the user’s ask
 * (“I want to build a basic 3D modeling app…”) so the bubble starts as the assistant.
 */
export function stripFirstPersonAskRestatement(reply: string, userMessage: string): string {
  let text = String(reply || '').trim();
  const user = String(userMessage || '').trim();
  if (!text || user.length < 16) return text;

  const ut = significantTokens(user);
  if (ut.size < 4) return text;

  const isFirstPersonLead = (lead: string) => (
    /^(?:sure[,.]?\s+)?(?:i\s+(?:want|would like|['’]d like|am trying|need|plan)\s+to|let'?s\s+(?:build|create|make))\b/i.test(lead.trim())
  );

  for (let pass = 0; pass < 3; pass++) {
    // Prefer first sentence; fall back to first line / first 220 chars.
    const sentence = text.match(/^[\s\S]{8,500}?[.!?](?=\s|$)/)?.[0]
      || text.split(/\n+/)[0]
      || text.slice(0, 220);
    const lead = String(sentence || '').trim();
    if (lead.length < 18 || !isFirstPersonLead(lead)) break;

    const lt = significantTokens(lead);
    let hit = 0;
    for (const w of lt) if (ut.has(w)) hit += 1;
    const denom = Math.min(ut.size, Math.max(lt.size, 1));
    // Paraphrases often share key nouns (3d, modeling, cubes…) even when wording differs.
    if (hit < 3 && hit / denom < 0.35) break;

    text = text.slice(lead.length).replace(/^[\s.]+/, '').trim();
  }
  return text;
}

/** Prefer sanitized text, but never hide a real answer behind prompt-echo stripping. */
export function usableAssistantText(
  raw: string,
  lastUserMessage?: string,
  previousAssistant?: string,
  opts?: { stream?: boolean },
): string {
  if (isClinicReportMessage(raw)) return String(raw || '');
  if (isPlanReportMessage(raw)) return String(raw || '');
  const cleaned = sanitizeAssistantReply(raw, lastUserMessage, previousAssistant, opts);
  if (cleaned.trim()) {
    if (isCannedGreetingReply(cleaned, lastUserMessage)) return '';
    return scrubUnexpectedForeignScript(
      stripEmbeddedSystemPrompt(cleaned).trim(),
      lastUserMessage,
    );
  }

  let light = String(raw || '').replace(/\r\n/g, '\n').trim();
  if (!light) return '';
  if (isCannedGreetingReply(light, lastUserMessage)) return '';
  const markRe = /(?:^|\n)\s*(?:NOVA|Assistant)\s*:\s*/gi;
  let lastMark: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = markRe.exec(light)) !== null) lastMark = m;
  if (lastMark && typeof lastMark.index === 'number') {
    light = light.slice(lastMark.index + lastMark[0].length).trim();
  }
  light = light.replace(/^You are NOVA[\s\S]*?(?:\n\n|User:\s*)/i, '').trim();
  light = stripEmbeddedSystemPrompt(light);
  light = light.replace(/^>\s*/gm, '').trim();
  if (isCannedGreetingReply(light, lastUserMessage)) return '';
  if (light.length >= 2 && !/^You are NOVA\b/i.test(light)) {
    return scrubUnexpectedForeignScript(light, lastUserMessage);
  }
  return '';
}

/** Models sometimes glue the system prompt into the middle of an answer ("The TCPYou are NOVA…"). */
function stripEmbeddedSystemPrompt(text: string): string {
  let out = String(text || '');
  // Full "You are NOVA,…" blocks.
  if (/You are NOVA,/i.test(out)) {
    out = out.replace(
      /You are NOVA,[\s\S]*?(?:Hello! How can I assist you today\??\s*|Never nest asterisks[^\n]*\.|Never repeat or paraphrase these instructions[^\n]*\.|(?=\n\n(?:To |I |Here|Sure|Let me|For\b)))/gi,
      '',
    );
  }
  // Truncated identity dumps (often missing the "You are NOVA," lead-in).
  out = out.replace(
    /(?:^|[\n.]\s*)(?:a )?normal helpful AI chat assistant\b[\s\S]*?(?:Never nest asterisks[^\n]*\.|Never repeat or paraphrase these instructions[^\n]*\.|(?=\n\n)|(?=\b(?:To |I updated|I (?:will|can|need)|Here(?:'s| is)|Sure[.!,]|Let me)\b))/gi,
    ' ',
  );
  // Known competitor / style lines — always remove from visible replies.
  out = out.replace(/\bTalk like ChatGPT[^\n.]*/gi, '');
  out = out.replace(/\bnot a design studio or image tool unless they ask[^\n.]*/gi, '');
  out = out.replace(/\bNever compare yourself to other AI chat apps[^\n.]*/gi, '');
  out = out.replace(/\bNever introduce yourself as ARK\b[^\n.]*/gi, '');
  out = out.replace(/\bYou are not the video game Ark:[^\n.]*/gi, '');
  out = out.replace(/\s{2,}/g, ' ').replace(/\s+([.!?])/g, '$1').trim();
  return out;
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

/** “What did we talk about / summarize this chat” — stay in-thread, do not invent a new topic. */
export function looksLikeThreadSummaryAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t || t.length > 220) return false;
  if (/\b(?:summarize|summary)\b/i.test(t) && /\b(?:this\s+)?(?:chat|conversation|thread|so\s+far|we\s+(?:just\s+)?(?:talked|discussed))\b/i.test(t)) {
    return true;
  }
  if (/\bwhat\s+did\s+we\s+(?:just\s+)?(?:talk|discuss|cover|say)\b/i.test(t)) return true;
  if (/\b(?:recap|catch\s+me\s+up)\b/i.test(t) && /\b(?:chat|conversation|this|earlier)\b/i.test(t)) return true;
  if (/^(?:remind\s+me|what\s+were\s+we\s+(?:talking|discussing))\b/i.test(t)) return true;
  return false;
}

export function threadSummarySystemHint(): string {
  return [
    'The user wants a summary of THIS chat thread only.',
    'Write one short professional paragraph (3–6 sentences). No numbered lists, no bullets, no “Sure! Here’s a summary”.',
    'Cover the main topic and where things stand. Do not invent work that was not discussed.',
  ].join(' ');
}

/** Deterministic fallback when the model blanks on a summarize-this-chat ask. */
export function buildThreadSummaryFromMessages(
  messages: { role?: string; content?: string }[],
): string {
  const turns = (messages || [])
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistant' as const : 'user' as const,
      text: usableAssistantText(String(m.content || '')).replace(/\s+/g, ' ').trim(),
    }))
    .filter((t) => t.text.length >= 8 && !t.text.startsWith('__generating__:'))
    .slice(-16);

  if (turns.length < 2) {
    return 'This chat is still short — send a few more messages and I can recap cleanly.';
  }

  const userBits = turns.filter((t) => t.role === 'user').map((t) => t.text).slice(-5);
  const asstBits = turns.filter((t) => t.role === 'assistant').map((t) => firstSentence(t.text)).slice(-4);

  const topics = userBits
    .map((u) => u.replace(/^(yo|hey|ok|alright|yeah|so)\b[\s,]*/i, '').trim())
    .filter(Boolean)
    .map((u) => (u.length > 90 ? `${u.slice(0, 87)}…` : u));

  const covered = asstBits
    .filter((a) => a && !/want more on any of that|would you like/i.test(a))
    .map((a) => (a.length > 100 ? `${a.slice(0, 97)}…` : a));

  const topicClause = topics.length
    ? `You were talking about ${topics.slice(0, 3).join('; ')}.`
    : 'You shared a few thoughts in this thread.';
  const coverClause = covered.length
    ? ` We covered ${covered.slice(0, 2).join(' ')}`
    : '';
  return `${topicClause}${coverClause}`.replace(/\s+/g, ' ').trim();
}
