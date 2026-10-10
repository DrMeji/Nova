/**
 * Chat turn — Q&A / inspect. Only place besides edit.ts that may call answerStudio.
 * Answer spine: resolveAnswerContract → gather → compose → verify (see docs/ANSWER-CONTRACT.md).
 */

import { answerStudio } from '@/lib/studioAnswerEngine';
import { arkRoute, routerProviderLabel } from '@/lib/novaRouter';
import { engineGenerateCancel } from '@/lib/novaEngine';
import {
  buildRouterHistory,
  looksLikeExplicitTopicSwitch,
  looksLikeThreadMemoryAsk,
  looksLikeThreadMemoryPlant,
  looksLikeTopicSwitchBleed,
  quietRetryExtendsPainted,
  type RouterChatTurn,
} from '@/lib/chatHistory';
import { extractVisionImages } from '@/lib/recentStore';
import { getLocalPrefs } from '@/lib/localPrefs';
import { chatSuccess, type ChatSuccess } from '@/lib/productContract';
import { hasRealStudioFiles } from '@/lib/plainChatAsk';
import {
  looksLikePlainChatAsk,
  looksLikePureGreeting,
  instantGreetingReply,
  looksLikeSoftCheckInAsk,
  looksLikeCapabilityOverviewAsk,
  scrubFalseProjectChatPreamble,
  scrubTalkFirstCodeBleed,
  scrubBuildAggression,
  scrubHelpVoice,
  ensurePlanningExit,
  isTalkFenceJunk,
  looksLikeOrphanChatTail,
  orphanChatPlanFallback,
} from '@/lib/plainChatAsk';
import {
  scrubPlanExitBleed,
  scrubMarkdownHashHeadings,
  looksLikeRunawayTokenGarbage,
  cutBeforeTokenGarbage,
  looksLikeShoppingOrPartsLinksAsk,
  looksLikeHowToGuideAsk,
  looksLikeThinHowToOutline,
  shoppingLinksHonestGap,
  howToGuideHonestGap,
} from '@/lib/replySanity';
import { isTalkFirstChatTurn } from '@/lib/classifyTurn';
import {
  looksLikeSimpleBuildToyChatAsk,
  looksLikeBrokenToyDemoReply,
  simpleToyDemoHonestGap,
  ensureToyDemoFenced,
} from '@/lib/chatIntent';
import { isCannedGreetingReply, usableAssistantText, scrubCannedGreetingFlash } from '@/lib/chatHistory';
import {
  preferEnglishSafeReply,
  replyHasUnexpectedForeignBleed,
  scrubUnexpectedForeignScript,
} from '@/lib/scrubForeignBleed';
import {
  looksLikeWebGroundedAsk,
  looksLikeLyricsAsk,
  looksLikeSideQuestAsk,
  looksLikeThreadFollowUpAsk,
  looksLikeComprehensiveAsk,
  looksLikeIdentifyMediaAsk,
  looksLikeExplicitResearchAsk,
  looksLikeRejectedPriorAnswerAsk,
  looksLikeBookFindOrBuyAsk,
  honestLyricsUnavailableReply,
  sideQuestAnswerHint,
  formatWebLookupForPrompt,
  webLookupUnavailableNote,
  fallbackAnswerFromLookup,
  looksLikeThinSideQuestReply,
  scrubSideQuestBleed,
  scrubEmptyFactPlaceholders,
  repairReplySourceLinks,
  pickBestBookCandidateFromLookup,
  identifyAnswerFromLookup,
  identifyReplyConflictsWithLookup,
  bookFindAnswerFromLookup,
  identifyResearchFailedReply,
} from '@/lib/webSearch';
import { scrubDictationTranscript } from '@/lib/voiceSession';
import { looksLikeColorCodeAsk, colorCodeReply } from '@/lib/colorCodeAsk';
import { resolveAnswerContract } from '@/lib/answerContract';
import { gatherForContract, companionStanceHint } from '@/lib/answerGather';
import { verifyAnswerReply, scrubInventedLinkDump, honestGapForContract } from '@/lib/answerVerify';

/** Soft style hints for the model — never a canned user-visible reply. */
function answerShapeHintForAsk(message: string): string {
  const t = String(message || '').trim();
  if (!t) return '';
  // Identify: only override when lookup conflicts or source labels are empty — never just because links are missing.
  if (
    looksLikeIdentifyMediaAsk(t)
    || looksLikeExplicitResearchAsk(t)
    || looksLikeRejectedPriorAnswerAsk(t)
  ) {
    return [
      'ANSWER SHAPE (identify): Lead with the best matching title + author ONLY if it appears in lookup notes / CANDIDATE TITLES.',
      'Then map the user’s remembered plot points to confirmed facts from the notes.',
      'Include 2–4 markdown Sources links with real https URLs from lookup Sources only (Goodreads / Wikipedia / Open Library / Amazon / store).',
      'Never invent titles. Never name “AI book finder” tools as the book. Never list filler “possible books” that are not in the notes.',
    ].join(' ');
  }
  if (looksLikeBookFindOrBuyAsk(t)) {
    return [
      'ANSWER SHAPE (find/buy): List the books briefly if asked, then give 3–5 markdown links with real https URLs from lookup Sources (Amazon, Barnes & Noble, Google Books, Open Library, Audible).',
      'Every store name MUST include a clickable URL. Never say “sure, here are links” without actual https links.',
      'Do not invent URLs. Prefer exact URLs from the lookup Sources list.',
    ].join(' ');
  }
  if (looksLikeSimpleBuildToyChatAsk(t)) {
    return [
      'ANSWER SHAPE (simple demo in chat): The user wants a WORKING mini demo NOW — not a product plan.',
      'Deliver ONE complete copy-paste HTML file (inline CSS + JS) inside a single markdown fenced code block tagged ```html.',
      'Put a short 1–2 sentence intro BEFORE the fence. Put ALL code INSIDE the fence — never paste CSS/JS as a wall of unfenced text.',
      'Use real newlines inside the fence (readable). Do NOT mash selectors and functions onto one line.',
      'Do NOT write “Overall: keep the first version tiny”. Do NOT ask “who is the main user”.',
      'Do NOT end with “Would you like to proceed with this plan?” — end with how to save and open the file in a browser.',
      'Professional tone. No emojis. Keep it under ~80 lines of code when possible.',
    ].join(' ');
  }
  // How-to / DIY / build guides + shopping follow-ups — depth like a real engineer brief (no emoji).
  if (looksLikeHowToGuideAsk(t) || looksLikeShoppingOrPartsLinksAsk(t)) {
    return [
      'ANSWER SHAPE (how-to / build guide): Deliver a REAL guide — not a thin 1–2–3 tease.',
      'Professional tone. No emojis. No markdown # / ## / #### hashtags — use **Bold titles** only.',
      'Do NOT end with only “Would you like to start with hardware or software?”',
      'Include all of the following when relevant:',
      '(1) Two clear options — easier prototype vs advanced from-scratch — with tradeoffs.',
      '(2) A recommended first prototype path with named parts (sensor/module families, boards, cables, enclosure) when known.',
      '(3) Rough price bands when known; say when uncertain — never invent fake exact SKUs.',
      '(4) Markdown https buy links: each link LABEL must match the URL. Prefer Amazon/Digi-Key search URLs that include the exact part name in the query. Never attach a random Adafruit/Amazon product page to a different part name.',
      '(5) A simple text signal-flow / stack of the build (lens → sensor → bridge → USB → computer).',
      '(6) What to buy first vs later, and a short versioned path (v1 → enclosure → custom PCB).',
      'Aim for depth (~350–800 words). More concrete information is better than a short outline.',
      'If the user also asked for buy links, every part row should include a real https link when possible.',
    ].join(' ');
  }
  // Factoid: net worth / price / how much — lead with the number, not a bio.
  if (/\b(?:net\s*worth|how\s+much\s+(?:is|are|does|did|has|have)|(?:what(?:'s|\s+is)\s+(?:the\s+)?)?(?:price|cost|salary|earnings?|revenue|valuation))\b/i.test(t)) {
    return [
      'ANSWER SHAPE (factoid): Lead with the number/estimate in the FIRST sentence.',
      'Do NOT open with a biography (“X is a South African-born…”).',
      'Then 2–4 quick facts tied to that number (assets, date of estimate if in notes).',
      'End with 1–2 markdown source links copied from lookup Sources only. Never invent URLs.',
    ].join(' ');
  }
  // Comprehensive / “everything you know”
  if (looksLikeComprehensiveAsk(t)) {
    return [
      'ANSWER SHAPE (comprehensive): The user wants a FULL answer — do not hold back to a short card.',
      'Write ~250–450 words with clear sections (Overview, Background, Career, Companies/projects, Public role).',
      'Use every usable fact from lookup notes. Omit unknowns — never write “Not specified”.',
      'End with a Sources list using ONLY exact URLs from the lookup Sources. Never invent biography.com or random blog links.',
    ].join(' ');
  }
  // Expand / who is / more info — bio first, then depth.
  if (/\b(?:more\s+(?:info|information|details)|tell\s+me\s+more|who\s+is|who\s+are|about)\b/i.test(t)
    && !/\b(?:net\s*worth|how\s+much|price|cost)\b/i.test(t)) {
    return [
      'ANSWER SHAPE (expand): Open with who they are (short bio), then career/companies, then notable facts.',
      'This is a deepen ask — go broader than a one-line number.',
      'Include 1–3 markdown links using ONLY exact URLs from lookup Sources. Never invent links.',
      'Do not invent earnings/net-worth figures unless they appear in the lookup notes.',
    ].join(' ');
  }
  return '';
}

function plainChatHistorySeed(content: string): RouterChatTurn[] {
  if (looksLikePureGreeting(content) || looksLikeSoftCheckInAsk(content)) {
    return [{
      role: 'user',
      content: [
        '[Reply style for this turn: warm, human, one or two short sentences.',
        'Greet them like a real person — not a canned “Sure, what’s up?”.',
        'Do not mention coding, programming, projects, apps, or features.',
        'Do not ask what they want to build. Just be present and invite them to say what they need.]',
      ].join(' '),
    }, {
      role: 'assistant',
      content: 'Understood — warm human hello, no coding pitch, no canned “what’s up”.',
    }];
  }
  if (looksLikeCapabilityOverviewAsk(content)) {
    return [{
      role: 'user',
      content: '[Reply style for this turn: ONE professional sentence (two max) about what NOVA actually does — chat with local or cloud models on this PC, build websites and apps when the user asks you to create them, edit files in folders they grant, and help with images and projects. No numbered lists. No fake categories like calendar, entertainment packages, or generic personal assistance.]',
    }, {
      role: 'assistant',
      content: 'Understood — one real sentence about NOVA.',
    }];
  }
  if (isTalkFirstChatTurn(content)) {
    // Hardware / DIY how-to must NOT get the software product-plan seed.
    if (looksLikeHowToGuideAsk(content)) {
      return [{
        role: 'user',
        content: [
          '[Reply style for this turn — CRITICAL:]',
          'The user wants a concrete how-to / build guide for a real device or DIY project.',
          'Give options, a first prototype path, named parts, rough prices, buy links when known, and a simple signal-flow.',
          'Professional. No emojis. No Vite/React/scaffold. No “Overall: keep the first version tiny” product-app wrap-up.',
          'Do not stop after three generic bullets — deliver the information they asked for.',
        ].join(' '),
      }, {
        role: 'assistant',
        content: 'Understood — deep how-to guide with options, parts, prices, and links. No software plan seed.',
      }];
    }
    const homepage = /\b(?:homepage|apple\.com|product\s+band|iphone|landing\s+page)\b/i.test(content);
    return [{
      role: 'user',
      content: homepage
        ? [
          '[Reply style for this turn — CRITICAL:]',
          'They sketched a premium product homepage (apple.com style). Plan the page in numbered sections — do NOT create files yet.',
          'Structure with **Bold** titles and - bullets under each:',
          '1. **Header — Navigation** (Appearance / Items as bold labels with muted detail after the colon)',
          '2. **Hero — New phone** (Look, Visual, Motion)',
          '3. **Product bands** (Mac, iPad, Watch, AirPods — each always visible, never hidden behind a click)',
          '4. **Footer**',
          'Then a short Overall wrap-up and 1–2 clarifying questions.',
          'Use lots of white space in the prose. Never dump code, CSS, HTML, or markup.',
          'Never say “here is the HTML/CSS structure”, “let’s create the HTML”, Vite, scaffold, or pick a folder.',
          'Product plan only — files are created only after they clearly say build / create / ok start building.',
        ].join(' ')
        : [
        '[Reply style for this turn — CRITICAL:]',
        'This is a normal human conversation about a problem or product idea. Do NOT push to create files, pick a folder, or “set up Vite + React” unless they clearly said build / create / go build / start building.',
        'Sound like a person chatting — warm, specific, contractions OK. Not a template, not “Great question!”, not a corporate brief.',
        'Write about 100–220 words. Lead with prose that mirrors THEIR words. Use a short numbered list only if it helps; otherwise stay in paragraphs.',
        'Cover naturally: the problem you heard, a simple v1 shape (fields / one screen), what can wait, and 1–2 plain questions.',
        'VOICE: “Yeah — that makes sense…” / “I’d keep v1 tiny…” / “Here’s what I’d put on the first screen…”. Never “We can definitely help with that.”',
        'Stay accurate to what they said — farmers market stalls ≠ bookstore shelf. Mirror their words.',
        'Do NOT dump tech stack, HTML/CSS/JS, backend, localStorage, or “let’s start building”. No @@@FILE, no code fences.',
        'Never end with “Would you like to proceed with creating this page?” or “What directory should we use?” or “Let’s start by setting up Vite”.',
        'Never pitch React Native, Flutter, Firebase, Express, MongoDB, AWS, or auth/payments unless they ask.',
        'Never restart with “Hello! How can I assist you today?” — stay on this thread.',
        'Only when they explicitly ask to build/create should you discuss creating a project on disk.]',
      ].join(' '),
    }, {
      role: 'assistant',
      content: homepage
        ? 'Understood — numbered homepage layout with bold labels and muted detail under each section. No Vite/build push.'
        : 'Understood — talk like a human collaborator about their idea. Prose first, light structure, no Vite/build push.',
    }];
  }
  return [];
}

export type ChatTurnHost = {
  content: string;
  files: Record<string, string>;
  projectName?: string;
  mode: 'chat' | 'code';
  allowFileEdits: boolean;
  preferredModelId?: string | null;
  preferredModelName?: string | null;
  preferredSource?: string | null;
  stickyModelId?: string | null;
  stickyModelName?: string | null;
  stickyPinnedSource?: string | null;
  /** Prior user/assistant turns for continuity (not including the current ask). */
  priorHistory?: RouterChatTurn[];
  planOnly?: boolean;
  /** True when user hit Try again — deepen with more facts/links, do not echo prior reply. */
  regenerate?: boolean;
  shouldAbort: () => boolean;
  onDelta?: (live: string) => void;
  /** Optional status for long lookups (keep quiet for plain chat). */
  onStatus?: (label: string) => void;
  timeoutMs?: number;
};

export type ChatTurnResult = {
  status: 'handled';
  text: string;
  intent?: unknown;
  findings?: unknown;
  packedTokens?: number;
  contract: ChatSuccess;
  provider?: string;
  modelId?: string;
  modelName?: string;
  attemptedLen?: number;
  source?: string;
  tier?: string;
};

function threadHistoryForChat(host: ChatTurnHost): RouterChatTurn[] {
  const seed = plainChatHistorySeed(host.content);
  const prior = (host.priorHistory || [])
    .filter((t) => t && (t.role === 'user' || t.role === 'assistant'))
    .map((t) => ({
      role: t.role as 'user' | 'assistant',
      content: String(t.content || '').trim(),
    }))
    .filter((t) => t.content && !t.content.startsWith('__generating__:'));
  // Style seed first, then real thread — never replace history with seed alone.
  return [...seed, ...prior];
}

/** Soft wall for abort only — never silence streaming chunks while the model is still writing. */
const CHAT_STREAM_ABORT_MS = 300_000;
const CHAT_EMPTY_TURN_FALLBACK = 'I could not finish that answer cleanly — try asking again in one short sentence.';
const SCAFFOLD_TOKEN_BUDGET = 300;

function estimateScaffoldTokens(text: string): number {
  return Math.ceil(String(text || '').trim().length / 4);
}

function appendScaffoldUser(
  turns: RouterChatTurn[],
  content: string,
  budget: { left: number },
): RouterChatTurn[] {
  const c = String(content || '').trim();
  if (!c) return turns;
  const cost = estimateScaffoldTokens(c);
  if (cost > budget.left) return turns;
  budget.left -= cost;
  return [...turns, { role: 'user', content: c }];
}

function topicSwitchCleanReply(ask: string): string | null {
  const a = String(ask || '');
  if (/\bstretch|desk\b/i.test(a)) {
    return [
      'Try a seated chest opener: sit tall, clasp your hands behind your back (or hold the chair sides), and gently lift your chest while rolling the shoulders back.',
      'Hold for 20–30 seconds, breathe slowly, then release. Do it once or twice when you notice yourself slumping.',
    ].join(' ');
  }
  if (/\bbreath|wired at night|feeling wired\b/i.test(a)) {
    return [
      'Try a slow 4-7-8 breath: inhale through your nose for 4, hold for 7, then exhale through your mouth for 8.',
      'Do three to four rounds in bed with lights low. If holding feels tense, shorten the hold and keep the exhale longer than the inhale.',
    ].join(' ');
  }
  return null;
}

export async function runChatTurn(host: ChatTurnHost): Promise<ChatTurnResult> {
  const started = Date.now();
  const abortMs = host.timeoutMs ?? (host.allowFileEdits ? 120_000 : CHAT_STREAM_ABORT_MS);
  // Fix common voice mishears before routing / web lookup (Timmy ≠ teammate).
  host = { ...host, content: scrubDictationTranscript(host.content) };

  const statusPause = (ms: number) => new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });

  // Answer Contract SSOT — gates web / disk / companion (no keyword race for ownership).
  const contract = resolveAnswerContract({
    message: host.content,
    hasBoundFiles: hasRealStudioFiles(host.files),
    priorHistory: host.priorHistory || [],
  });
  const slowStatusTurn = contract.allowWeb || contract.useStudioDisk || contract.job === 'research' || contract.job === 'diagnose';
  // Read → think — short for simple chat; longer when web/disk research is coming.
  if (!host.shouldAbort()) {
    host.onStatus?.('Reading your message…');
    await statusPause(slowStatusTurn ? 450 : 100);
  }
  if (!host.shouldAbort()) {
    host.onStatus?.('Thinking…');
    await statusPause(slowStatusTurn ? 400 : 80);
  }
  const talkOrAdvice =
    (contract.job === 'plan_talk')
    && !/\b(?:validate|validation|founder|week[- ]by[- ]week|30\s+days|customer\s+interview)\b/i.test(host.content);
  const projectAwareAsk = contract.useStudioDisk && hasRealStudioFiles(host.files);

  if (!host.allowFileEdits && !projectAwareAsk) {
    const prefs = getLocalPrefs();
    let streamed = '';
    let lastGood = '';
    let garbageAbort = false;
    const sideQuest = looksLikeSideQuestAsk(host.content) || contract.stance === 'companion';
    const followUp = looksLikeThreadFollowUpAsk(host.content) || contract.topic === 'thread_entity';
    const shoppingAsk = looksLikeShoppingOrPartsLinksAsk(host.content);
    const simpleToyChat = looksLikeSimpleBuildToyChatAsk(host.content);
    const scrubTalkCode = (s: string) => (simpleToyChat ? String(s || '') : scrubTalkFirstCodeBleed(s));
    const topicSwitch = looksLikeExplicitTopicSwitch(host.content);
    const memoryAsk = looksLikeThreadMemoryAsk(host.content);
    const memoryPlant = looksLikeThreadMemoryPlant(host.content);
    // Follow-ups about “he / the game” must keep thread context (do not wipe Apex→Fortnite).
    // Explicit “switching topics” must wipe so the prior essay cannot continue mid-word.
    // Pass real pixels so vision (or honest blindness) runs — never invent from the filename alt.
    const visionPixels = extractVisionImages(host.content);
    let history = buildRouterHistory(threadHistoryForChat(host), host.content, visionPixels, {
      keepContinuity: memoryAsk || memoryPlant || (((!sideQuest || followUp || contract.stance === 'companion') && !topicSwitch)),
      kind: 'chat',
    });
    if (topicSwitch) {
      // Hard wipe — never let prior assistant text leak into a fresh topic.
      history = [{
        role: 'user',
        content: String(host.content || '').trim(),
        images: visionPixels.length ? visionPixels : undefined,
      }];
      try { host.onDelta?.(''); } catch { /* ignore */ }
    }
    // Live web only when the contract allows it.
    let webHit: Awaited<ReturnType<typeof gatherForContract>>['webHit'] = null;

    if (contract.job === 'deterministic') {
      if (looksLikePureGreeting(host.content)) {
        const hi = instantGreetingReply();
        return {
          status: 'handled',
          text: hi,
          intent: 'plain-chat',
          contract: chatSuccess(hi),
          provider: 'NOVA',
          modelName: 'NOVA',
        };
      }
      if (looksLikeLyricsAsk(host.content)) {
        const lyrics = honestLyricsUnavailableReply(host.content);
        return {
          status: 'handled',
          text: lyrics,
          intent: 'plain-chat',
          contract: chatSuccess(lyrics),
          provider: 'NOVA',
        };
      }
      if (looksLikeColorCodeAsk(host.content)) {
        const color = colorCodeReply(host.content);
        return {
          status: 'handled',
          text: color,
          intent: 'plain-chat',
          contract: chatSuccess(color),
          provider: 'NOVA',
        };
      }
    }

    const gathered = await gatherForContract({
      message: host.content,
      contract,
      priorTurns: host.priorHistory || [],
      shouldAbort: () => host.shouldAbort(),
      onStatus: host.onStatus,
      timeoutMs: contract.allowWeb ? 75_000 : 45_000,
    });

    if (host.shouldAbort()) {
      return {
        status: 'handled',
        text: CHAT_EMPTY_TURN_FALLBACK,
        intent: 'plain-chat',
        contract: chatSuccess(CHAT_EMPTY_TURN_FALLBACK),
        provider: 'NOVA',
      };
    }

    if (gathered.kind === 'deterministic' && gathered.deterministicText) {
      return {
        status: 'handled',
        text: gathered.deterministicText,
        intent: 'plain-chat',
        contract: chatSuccess(gathered.deterministicText),
        provider: 'NOVA',
      };
    }

    if (gathered.kind === 'deep' && gathered.deepAnswer) {
      const v = verifyAnswerReply(contract, host.content, gathered.deepAnswer);
      const deepText = v.ok ? gathered.deepAnswer : (v.honestGap || gathered.deepAnswer);
      return {
        status: 'handled',
        text: deepText,
        intent: 'plain-chat',
        contract: chatSuccess(deepText),
        provider: 'NOVA',
      };
    }

    // Identify research failed with no usable deep answer.
    if (
      contract.allowWeb
      && contract.reason === 'explicit-research'
      && !gathered.deepAnswer
      && !gathered.webHit?.ok
      && (looksLikeIdentifyMediaAsk(host.content)
        || looksLikeExplicitResearchAsk(host.content)
        || looksLikeRejectedPriorAnswerAsk(host.content))
    ) {
      const failed = identifyResearchFailedReply(host.content);
      return {
        status: 'handled',
        text: failed,
        intent: 'plain-chat',
        contract: chatSuccess(failed),
        provider: 'NOVA',
      };
    }

    webHit = gathered.webHit || null;
    const bookFindAskEarly = looksLikeBookFindOrBuyAsk(host.content);
    const conversationalScaffold = talkOrAdvice && !contract.allowWeb;
    const scaffoldBudget = { left: SCAFFOLD_TOKEN_BUDGET };

    if (contract.allowWeb && contract.grounding === 'web') {
      const identifyAsk = false;
      const bookFindAsk = bookFindAskEarly;
      const note = gathered.promptNote
        || (webHit?.ok
          ? formatWebLookupForPrompt(webHit, {
            comprehensive: looksLikeComprehensiveAsk(host.content)
              || looksLikeExplicitResearchAsk(host.content)
              || looksLikeHowToGuideAsk(host.content)
              || looksLikeShoppingOrPartsLinksAsk(host.content)
              || bookFindAsk,
            identify: identifyAsk && !bookFindAsk,
          })
          : '');
      if (sideQuest || followUp || webHit?.ok) {
        const hint = [
          sideQuestAnswerHint(host.content),
          followUp
            ? 'This is a follow-up. Stay on the same person/game from the prior turns. Do not invent a different title (e.g. do not switch Apex → Fortnite).'
            : '',
          conversationalScaffold
            ? ''
            : 'Answer only this question with concrete facts and markdown links from lookup notes — keep thread continuity.',
        ].filter(Boolean).join(' ');
        history = appendScaffoldUser(history, hint, scaffoldBudget);
      }
      if (note) {
        const shape = conversationalScaffold ? '' : answerShapeHintForAsk(host.content);
        history = appendScaffoldUser(history, [
          note,
          shape,
          `User question (answer this now): ${String(host.content || '').trim()}`,
        ].filter(Boolean).join('\n\n'), scaffoldBudget);
      } else if (looksLikeWebGroundedAsk(host.content) || followUp) {
        const shape = conversationalScaffold ? '' : answerShapeHintForAsk(host.content);
        history = appendScaffoldUser(history, [
          webLookupUnavailableNote(),
          shape,
          conversationalScaffold
            ? ''
            : 'Say when live lookup was thin and still give the best grounded answer you can, with links when known. Do not invent earnings or switch games.',
        ].filter(Boolean).join('\n\n'), scaffoldBudget);
      }
    } else if (contract.stance === 'companion' && gathered.promptNote) {
      history = appendScaffoldUser(
        history,
        [
          gathered.promptNote || companionStanceHint(host.content),
          conversationalScaffold ? '' : 'Stay on topic; no invented links or project dumps.',
        ].filter(Boolean).join(' '),
        scaffoldBudget,
      );
    }

    // Even without web notes, push shape for factoid vs expand asks (research stance only).
    if (contract.allowWeb && !conversationalScaffold) {
      const shape = answerShapeHintForAsk(host.content);
      if (shape && !looksLikeWebGroundedAsk(host.content) && !followUp) {
        history = appendScaffoldUser(history, shape, scaffoldBudget);
      } else if (shape && (looksLikeWebGroundedAsk(host.content) || followUp)) {
        const already = history.some((h) => /ANSWER SHAPE/i.test(String(h.content || '')));
        if (!already) {
          history = appendScaffoldUser(history, shape, scaffoldBudget);
        }
      }
    }

    if (host.regenerate) {
      history = appendScaffoldUser(history, [
        'RETRY: The user asked for a better answer to the same question.',
        'Do NOT repeat the previous short reply. Add more concrete facts (real name, teams, birth year, follower rank, brand history, products) and include 1–3 real links (Twitch/YouTube/official/store) when lookup notes or confident knowledge allow.',
        'Use a short opening paragraph, then a **Quick facts** bullet list with bold labels, then links.',
        'Never invent fake details. Prefer lookup notes when present.',
      ].join(' '), scaffoldBudget);
    }

    let firstTokenAt = 0;
    let abortPollId: number | null = null;
    const killChatInfer = () => { void engineGenerateCancel(); };
    const routePromise = arkRoute({
      message: host.content,
      kind: 'chat',
      preferredModelId: host.preferredModelId || undefined,
      preferredModelName: host.preferredModelName || undefined,
      preferredSource: host.preferredSource as 'local' | 'cloud' | 'auto' | undefined,
      stickyModelId: host.stickyModelId || undefined,
      stickyModelName: host.stickyModelName || undefined,
      stickyPinnedSource: host.stickyPinnedSource as 'local' | 'cloud' | undefined,
      history,
      onAttemptReset: () => {
        // Clear buffer only — keep lastGood on screen so hops never blank the bubble.
        streamed = '';
        if (lastGood.length >= 2) host.onDelta?.(lastGood);
      },
      onChunk: prefs.streamResponses && host.onDelta
        ? (piece) => {
          if (!firstTokenAt) {
            firstTokenAt = Date.now();
          }
          if (host.shouldAbort() || garbageAbort) return;
          const delta = String(piece || '');
          if (!delta) return;
          // Full quiet-commit from the router (one-shot replace after a silent retry/hop).
          if (streamed.length === 0 && delta.length >= 80) {
            if (
              lastGood.length >= 24
              && !quietRetryExtendsPainted(lastGood, delta)
            ) {
              host.onDelta?.(lastGood);
              streamed = lastGood;
              return;
            }
            streamed = delta;
          } else if (delta.length > streamed.length + 40 && delta.length >= 80) {
            if (
              lastGood.length >= 24
              && !quietRetryExtendsPainted(lastGood, delta)
            ) {
              host.onDelta?.(lastGood);
              return;
            }
            streamed = delta;
          } else {
            streamed += delta;
          }
          // Topic switch: abort mid-sentence prior-topic bleed early and paint a clean answer.
          if (topicSwitch && looksLikeTopicSwitchBleed(streamed, host.content)) {
            garbageAbort = true;
            const clean = topicSwitchCleanReply(host.content);
            if (clean) {
              lastGood = clean;
              streamed = clean;
              host.onDelta?.(clean);
            } else if (lastGood.length >= 2) {
              host.onDelta?.(lastGood);
            }
            return;
          }
          // Abort runaway %2Cfff / hex dumps early — keep any leading prose.
          if (looksLikeRunawayTokenGarbage(streamed)) {
            garbageAbort = true;
            const cut = cutBeforeTokenGarbage(streamed) || scrubPlanExitBleed(lastGood);
            if (cut.length >= 24) {
              lastGood = cut;
              streamed = cut;
              host.onDelta?.(cut);
            } else if (lastGood.length >= 2) {
              host.onDelta?.(lastGood);
            }
            return;
          }
          let live = scrubFalseProjectChatPreamble(streamed);
          live = scrubTalkCode(live);
          live = scrubPlanExitBleed(live);
          live = scrubMarkdownHashHeadings(live);
          if (talkOrAdvice) {
            live = scrubBuildAggression(live);
            live = scrubHelpVoice(live);
          }
          live = scrubCannedGreetingFlash(live);
          if (sideQuest) live = scrubSideQuestBleed(live, host.content) || live;
          if (
            live.length < 2
            || isTalkFenceJunk(live)
            || isCannedGreetingReply(live, host.content)
            || isCannedGreetingReply(String(streamed || '').trim(), host.content)
          ) {
            if (lastGood.length >= 2) host.onDelta?.(lastGood);
            return;
          }
          const usable = usableAssistantText(live, host.content, undefined, { stream: true });
          // Always prefer scrubbed English over a longer foreign-bleed draft.
          live = scrubUnexpectedForeignScript(usable || live, host.content) || usable || live;
          live = scrubPlanExitBleed(live);
          if (isTalkFenceJunk(live) || looksLikeRunawayTokenGarbage(live)) {
            if (lastGood.length >= 2 && !replyHasUnexpectedForeignBleed(lastGood, host.content)) {
              host.onDelta?.(lastGood);
            }
            return;
          }
          // After a retry, ignore short unrelated replacements (stops long→short flicker).
          if (
            lastGood.length >= 48
            && live.length < Math.floor(lastGood.length * 0.92)
            && !live.startsWith(lastGood.slice(0, Math.min(48, lastGood.length)))
            && !replyHasUnexpectedForeignBleed(lastGood, host.content)
          ) {
            return;
          }
          // Prefer longer only when it does not introduce unexpected foreign script.
          if (replyHasUnexpectedForeignBleed(live, host.content) && lastGood && !replyHasUnexpectedForeignBleed(lastGood, host.content)) {
            host.onDelta?.(lastGood);
            return;
          }
          const candidate = preferEnglishSafeReply(live, lastGood, host.content);
          const nextGood = scrubMarkdownHashHeadings(candidate);
          // Stream paint only grows — prefix extension or tiny seed paint only.
          if (lastGood.length < 24 || quietRetryExtendsPainted(lastGood, nextGood)) {
            lastGood = nextGood;
            host.onDelta?.(lastGood);
          } else if (lastGood.length >= 2) {
            host.onDelta?.(lastGood);
          }
        }
        : undefined,
    });

    // Hard timeout + abort poll — cooperative shouldAbort alone can leave "Thinking…" forever.
    const abortRace = new Promise<{ ok: false; aborted: true }>((resolve) => {
      abortPollId = window.setInterval(() => {
        if (host.shouldAbort() || Date.now() - started > abortMs) {
          killChatInfer();
          resolve({ ok: false, aborted: true });
        } else if (!firstTokenAt && Date.now() - started > 20_000) {
          try { host.onStatus?.('Loading local brain…'); } catch { /* ignore */ }
        }
      }, 100);
    });
    const timed = await Promise.race([
      routePromise.then((r) => ({ ok: true as const, routed: r })),
      new Promise<{ ok: false; aborted?: false }>((resolve) => {
        window.setTimeout(() => {
          killChatInfer();
          resolve({ ok: false });
        }, abortMs);
      }),
      abortRace,
    ]);
    if (abortPollId != null) window.clearInterval(abortPollId);
    if (!timed.ok) {
      const keep = lastGood || streamed || CHAT_EMPTY_TURN_FALLBACK;
      try { host.onDelta?.(keep); } catch { /* ignore */ }
      return {
        status: 'handled',
        text: keep,
        intent: 'plain-chat',
        contract: chatSuccess(keep),
        provider: 'NOVA · timed out',
      };
    }
    const routed = timed.routed;

    // Prefer the longest solid live paint — never let a quieter scrub retract the bubble.
    // Exception: never restore a foreign-script bleed over scrubbed English.
    // Exception: topic-switch mid-sentence bleed — keep the clean abort paint, not the long prior-topic dump.
    const routedText = String(routed.reply || '').trim();
    let raw = preferEnglishSafeReply(routedText, lastGood, host.content);
    if (topicSwitch && looksLikeTopicSwitchBleed(routedText, host.content) && lastGood.length >= 40) {
      raw = lastGood;
    } else if (
      lastGood.length >= 80
      && lastGood.length > routedText.length * 1.08
      && !replyHasUnexpectedForeignBleed(lastGood, host.content)
    ) {
      raw = lastGood;
    } else if (!raw) {
      raw = lastGood || streamed || '';
    }
    let text = scrubTalkCode(scrubFalseProjectChatPreamble(raw));
    if (sideQuest) text = scrubSideQuestBleed(text, host.content) || text;
    text = scrubEmptyFactPlaceholders(text);
    text = scrubUnexpectedForeignScript(text, host.content) || text;
    text = scrubPlanExitBleed(text);
    text = scrubMarkdownHashHeadings(text);
    if (looksLikeRunawayTokenGarbage(text)) {
      text = cutBeforeTokenGarbage(text)
        || (lastGood && !looksLikeRunawayTokenGarbage(lastGood) ? scrubPlanExitBleed(lastGood) : '');
    }
    // If scrubbing shrinks a solid live answer, keep the live paint — unless live was bleed.
    // Always re-scrub plan-exit bleed so “Overall: keep the first version tiny…” cannot return.
    if (
      lastGood.length >= 80
      && text.length < Math.floor(lastGood.length * 0.85)
      && !replyHasUnexpectedForeignBleed(lastGood, host.content)
      && !looksLikeRunawayTokenGarbage(lastGood)
    ) {
      const restored = scrubPlanExitBleed(scrubEmptyFactPlaceholders(lastGood) || lastGood);
      if (restored.length >= 40) text = restored;
    }
    if (talkOrAdvice) {
      text = scrubBuildAggression(text);
      text = scrubHelpVoice(text);
      // Only append product-plan exits for real product talk — never OS how-tos.
      if (
        /\b(?:build|create|app|website|mvp|product|tracker|stall|shelf)\b/i.test(host.content)
        && !/\b(?:windows|browser|taskbar|settings|stretch|habit|dinner)\b/i.test(host.content)
      ) {
        text = ensurePlanningExit(text, host.content);
      }
    }
    text = scrubPlanExitBleed(text);
    if (!text || isTalkFenceJunk(text)) {
      text = (lastGood && !isTalkFenceJunk(lastGood) && !replyHasUnexpectedForeignBleed(lastGood, host.content))
        ? lastGood
        : scrubUnexpectedForeignScript(lastGood, host.content) || '';
    }
    if (looksLikeOrphanChatTail(text)) {
      text = (lastGood && !looksLikeOrphanChatTail(lastGood) && !replyHasUnexpectedForeignBleed(lastGood, host.content))
        ? lastGood
        : CHAT_EMPTY_TURN_FALLBACK;
    }
    // Prefer the live paint when a quiet hop shrunk a solid answer into a snippet dump.
    const preferSolid = (a: string, b: string) => {
      const score = (s: string) => {
        if (!s || /^here'?s what turned up live/i.test(s)) return 0;
        if (replyHasUnexpectedForeignBleed(s, host.content)) return 0;
        const prose = s.replace(/https?:\/\/\S+/gi, '').replace(/\[[^\]]+\]\([^)]+\)/g, '').replace(/\s+/g, ' ').trim().length;
        const concrete = /\b(?:quick facts|net worth|born|founded|\$\d|billion|million|ceo|entrepreneur|biography)\b/i.test(s) ? 80 : 0;
        return prose + concrete;
      };
      return score(a) >= score(b) ? a : b;
    };
    text = preferEnglishSafeReply(preferSolid(text, lastGood), text, host.content);
    text = scrubUnexpectedForeignScript(text, host.content) || text;
    text = scrubPlanExitBleed(text);
    text = text
      .replace(/\n+(?:\*\s*)?\*{0,2}\s*Overall:\s*keep the first version tiny[\s\S]*$/i, '')
      .replace(/\n+(?:\*\s*)?\*{0,2}\s*Overall:\s*keep v1 tiny[\s\S]*$/i, '')
      .replace(/\n+(?:\*\s*)?\*{0,2}\s*Overall:\s*keep every band[\s\S]*$/i, '')
      .replace(/(?:^|\n)\s*Overall:\s*keep the first version tiny[\s\S]*$/i, '')
      .replace(/(?:^|\n)(?:\*\s*)?\*\*\s*$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // Always strip product-plan “Overall: keep the first version tiny…” glued onto any chat reply.
    text = scrubPlanExitBleed(text)
      .replace(/\s*Overall:\s*keep the first version tiny[\s\S]*$/i, '')
      .replace(/\s*Overall:\s*keep v1 tiny[\s\S]*$/i, '')
      .trim();

    // Topic switch: if the model continued the previous essay mid-word / wrong subject, one clean retry.
    if (topicSwitch && looksLikeTopicSwitchBleed(text, host.content) && !host.shouldAbort()) {
      try { host.onStatus?.('Refocusing…'); } catch { /* ignore */ }
      try { host.onDelta?.(''); } catch { /* ignore */ }
      streamed = '';
      lastGood = '';
      const retryHistory: RouterChatTurn[] = [
        {
          role: 'user',
          content: [
            'SYSTEM: Brand-new topic. Do not continue any previous answer. Start with a capital letter.',
            `User ask: ${String(host.content || '').trim()}`,
          ].join('\n'),
        },
      ];
      const retry = await arkRoute({
        message: host.content,
        kind: 'chat',
        preferredModelId: host.preferredModelId || undefined,
        preferredModelName: host.preferredModelName || undefined,
        preferredSource: host.preferredSource as 'local' | 'cloud' | 'auto' | undefined,
        stickyModelId: host.stickyModelId || undefined,
        stickyModelName: host.stickyModelName || undefined,
        stickyPinnedSource: host.stickyPinnedSource as 'local' | 'cloud' | undefined,
        history: retryHistory,
        onChunk: prefs.streamResponses && host.onDelta
          ? (piece) => {
            if (host.shouldAbort()) return;
            streamed += String(piece || '');
            const live = scrubPlanExitBleed(streamed);
            if (live.length >= 2) {
              lastGood = live;
              host.onDelta?.(live);
            }
          }
          : undefined,
      });
      const retryText = scrubPlanExitBleed(String(retry.reply || lastGood || '').trim());
      if (retryText && !looksLikeTopicSwitchBleed(retryText, host.content)) {
        text = retryText;
      } else if (looksLikeTopicSwitchBleed(text, host.content)) {
        const clean = topicSwitchCleanReply(host.content);
        if (clean) {
          text = clean;
          try { host.onDelta?.(text); } catch { /* ignore */ }
        }
      }
    } else if (topicSwitch && looksLikeTopicSwitchBleed(text, host.content)) {
      const clean = topicSwitchCleanReply(host.content);
      if (clean) {
        text = clean;
        try { host.onDelta?.(text); } catch { /* ignore */ }
      }
    }

    const identifyAsk = looksLikeIdentifyMediaAsk(host.content)
      || looksLikeExplicitResearchAsk(host.content)
      || looksLikeRejectedPriorAnswerAsk(host.content);
    const bookFindAsk = looksLikeBookFindOrBuyAsk(host.content);

    // Book identify: only replace the model when a TRUSTED catalog title conflicts — never SEO “AI book finder” junk.
    if (identifyAsk && webHit?.ok) {
      const best = pickBestBookCandidateFromLookup(webHit);
      const emptySources = /(?:^|\n)\s*[-*•]\s*\*{0,2}(?:Goodreads|Open Library|Wikipedia|Amazon|Scholastic)\*{0,2}\s*:?\s*(?=\n|$)/i.test(text)
        && !/\[[^\]]+\]\(https?:\/\//i.test(text);
      const metaJunkReply = /\b(?:free\s+ai\s+tool|find\s+a\s+book\s+title\s+by\s+plot|what\s+is\s+that\s+book\?|book\s+finder\s+for\s+forgotten)\b/i.test(text);
      if (best && (identifyReplyConflictsWithLookup(text, webHit) || emptySources || metaJunkReply)) {
        text = identifyAnswerFromLookup(host.content, webHit, best);
      }
    }

    // “Give me links / where can I find” — require real store URLs from research.
    if (bookFindAsk && webHit?.ok && !/\[[^\]]+\]\(https?:\/\//i.test(text)) {
      text = bookFindAnswerFromLookup(host.content, webHit);
    }

    if (webHit && looksLikeThinSideQuestReply(text, host.content) && !identifyAsk) {
      // Never replace a solid prose answer (or live paint) with the raw snippet dump.
      const solid = text.length >= 160
        && !/^here'?s what turned up live/i.test(text)
        && (/\b(?:quick facts|net worth|born|founded|\$\d|billion|million)\b/i.test(text) || text.split(/\n/).length >= 4);
      if (!solid) {
        text = fallbackAnswerFromLookup(host.content, webHit);
      }
    }
    // Prefer a clear prose fallback over an empty CODE / "markdown ```" bubble.
    // Never inject product-planning fallbacks into research / shopping / companion answers.
    if (!text || isTalkFenceJunk(text) || looksLikeOrphanChatTail(text) || looksLikeRunawayTokenGarbage(text)) {
      if (looksLikeRunawayTokenGarbage(text) && lastGood && !looksLikeRunawayTokenGarbage(lastGood)) {
        text = scrubPlanExitBleed(lastGood);
      } else if (identifyAsk || bookFindAsk) {
        text = webHit?.ok
          ? (identifyAsk
            ? identifyAnswerFromLookup(host.content, webHit)
            : bookFindAnswerFromLookup(host.content, webHit))
          : 'I could not finish that lookup cleanly — ask again and I will research it once more.';
      } else if (shoppingAsk || looksLikeHowToGuideAsk(host.content)) {
        text = webHit?.ok
          ? fallbackAnswerFromLookup(host.content, webHit)
          : (shoppingAsk ? shoppingLinksHonestGap(host.content) : howToGuideHonestGap(host.content));
      } else if (contract.job === 'plan_talk') {
        text = orphanChatPlanFallback(host.content);
      } else if (lastGood && !looksLikeRunawayTokenGarbage(lastGood) && !isTalkFenceJunk(lastGood)) {
        text = scrubPlanExitBleed(lastGood);
      } else {
        text = honestGapForContract(contract, host.content);
      }
    }
    if (isCannedGreetingReply(text, host.content) && lastGood && !isCannedGreetingReply(lastGood, host.content)) {
      text = lastGood;
    }
    // Attach real hrefs for “live here” / empty markdown links from lookup sources.
    // Shopping: keep Amazon/Digi-Key/etc. so streamed buy-links are not retracted on finalize.
    const linkOpts = shoppingAsk || looksLikeHowToGuideAsk(host.content)
      || (contract.allowWeb && contract.grounding === 'web' && /\b(?:buy|parts?|links?|amazon|build|how\s+to)\b/i.test(host.content))
      ? { allowShopHosts: true, maxLinks: 8 }
      : undefined;
    const countMdLinks = (s: string) => (String(s || '').match(/\[[^\]]+\]\(https?:\/\/[^)]+\)/gi) || []).length;
    if (webHit?.ok && Array.isArray(webHit.sources) && webHit.sources.length) {
      text = repairReplySourceLinks(text, webHit.sources, linkOpts);
    } else {
      text = repairReplySourceLinks(text, undefined, linkOpts);
    }
    // Prefer the live paint when finalize scrubbed away links the user already saw.
    if (
      shoppingAsk
      && countMdLinks(lastGood) > countMdLinks(text)
      && !looksLikeRunawayTokenGarbage(lastGood)
      && lastGood.length >= 80
    ) {
      text = repairReplySourceLinks(scrubPlanExitBleed(lastGood), webHit?.sources, linkOpts);
    }
    // Strip leftover “use this in HTML/CSS…” lectures on color answers.
    text = text.replace(
      /\s*(?:You can use this code in HTML,?\s*CSS(?:,|\s+or)[^.!\n]*[.!]?\s*)+/gi,
      '',
    ).trim();

    // Final plan-exit bleed scrub (after fallbacks / ensurePlanningExit / orphans).
    text = scrubPlanExitBleed(text);
    text = scrubMarkdownHashHeadings(text);

    // Simple demos: reject plan outlines / broken fences — ask user to pick cloud or retry.
    if (looksLikeBrokenToyDemoReply(text, host.content)) {
      text = simpleToyDemoHonestGap(host.content);
    } else {
      text = ensureToyDemoFenced(text, host.content);
    }

    // Answer Contract verify — reject invented link dumps / clinic bleed; one soft scrub then honest gap.
    {
      let v = verifyAnswerReply(contract, host.content, text);
      if (!v.ok && (v.reason === 'invented-link-dump' || v.reason === 'companion-link-dump')) {
        const scrubbed = scrubInventedLinkDump(text);
        if (scrubbed && scrubbed.length >= 40) {
          v = verifyAnswerReply(contract, host.content, scrubbed);
          if (v.ok) text = scrubbed;
        }
      }
      if (!v.ok && v.reason === 'runaway-garbage' && lastGood && !looksLikeRunawayTokenGarbage(lastGood)) {
        text = scrubPlanExitBleed(lastGood);
        v = verifyAnswerReply(contract, host.content, text);
      }
      if (!v.ok && v.reason === 'plan-exit-bleed' && v.honestGap && v.honestGap.length >= 40
        && !looksLikeRunawayTokenGarbage(v.honestGap)) {
        text = v.honestGap;
        v = verifyAnswerReply(contract, host.content, text);
      }
      if (!v.ok && v.reason === 'thin-howto-outline') {
        if (lastGood && !looksLikeThinHowToOutline(lastGood, host.content) && !looksLikeRunawayTokenGarbage(lastGood)) {
          text = repairReplySourceLinks(scrubPlanExitBleed(lastGood), webHit?.sources, linkOpts);
          v = verifyAnswerReply(contract, host.content, text);
        } else if (webHit?.ok) {
          text = repairReplySourceLinks(fallbackAnswerFromLookup(host.content, webHit), webHit.sources, linkOpts);
          v = verifyAnswerReply(contract, host.content, text);
        }
        if (!v.ok) {
          text = howToGuideHonestGap(host.content);
          v = { ok: true };
        }
      }
      if (!v.ok) {
        if (
          shoppingAsk
          && lastGood
          && countMdLinks(lastGood) >= 1
          && !looksLikeRunawayTokenGarbage(lastGood)
        ) {
          text = repairReplySourceLinks(scrubPlanExitBleed(lastGood), webHit?.sources, linkOpts);
        } else if (shoppingAsk && (!text.trim() || looksLikeRunawayTokenGarbage(text))) {
          text = shoppingLinksHonestGap(host.content);
        } else {
          text = v.honestGap || honestGapForContract(contract, host.content);
        }
      }
    }

    // Final display sanitize: coding pitches, topic-switch bleed, plan Overall, etc.
    text = usableAssistantText(text, host.content) || text;
    if (!String(text || '').trim() || isTalkFenceJunk(text)) {
      text = (lastGood && !isTalkFenceJunk(lastGood) && String(lastGood).trim())
        ? lastGood
        : CHAT_EMPTY_TURN_FALLBACK;
    }
    try { host.onDelta?.(text); } catch { /* ignore */ }

    return {
      status: 'handled',
      text,
      intent: 'plain-chat',
      contract: chatSuccess(text),
      provider: routerProviderLabel(routed, 'NOVA'),
      modelId: routed.modelId,
      modelName: routed.modelName,
      attemptedLen: routed.attempted?.length || 0,
      source: routed.source,
      tier: routed.tier,
    };
  }

  const result = await answerStudio(
    {
      userMessage: host.content,
      files: host.files,
      projectName: host.projectName,
      mode: host.mode,
      preferredModelId: host.preferredModelId || undefined,
      preferredModelName: host.preferredModelName || undefined,
      preferredSource: host.preferredSource as 'local' | 'cloud' | 'auto' | undefined,
      stickyModelId: host.stickyModelId || undefined,
      stickyModelName: host.stickyModelName || undefined,
      stickyPinnedSource: host.stickyPinnedSource as 'local' | 'cloud' | undefined,
      planOnly: host.planOnly,
      allowFileEdits: host.allowFileEdits,
      shouldAbort: () => host.shouldAbort() || Date.now() - started > abortMs,
    },
    host.onDelta,
  );
  let text = String(result.text || '').trim() || 'I could not answer that.';
  if (!host.allowFileEdits) {
    text = scrubFalseProjectChatPreamble(text) || text;
    if (talkOrAdvice || looksLikePlainChatAsk(host.content)) {
      text = scrubBuildAggression(text) || text;
      text = scrubHelpVoice(text) || text;
      if (
        /\b(?:build|create|app|website|mvp|product|tracker|stall|shelf)\b/i.test(host.content)
        && !/\b(?:windows|browser|taskbar|settings|stretch|habit|dinner)\b/i.test(host.content)
      ) {
        text = ensurePlanningExit(text, host.content) || text;
      }
      text = scrubPlanExitBleed(text) || text;
    }
    // Always scrub talk replies — models still emit @@@FILE / CSS / fake CODE fences mid-plan.
    {
      const scrubbed = looksLikeSimpleBuildToyChatAsk(host.content) ? text : scrubTalkFirstCodeBleed(text);
      if (scrubbed && !isTalkFenceJunk(scrubbed) && !looksLikeOrphanChatTail(scrubbed)) {
        text = scrubbed;
      } else if (
        !scrubbed
        || isTalkFenceJunk(text)
        || isTalkFenceJunk(scrubbed || '')
        || looksLikeOrphanChatTail(scrubbed || text)
        || /@@@FILE\b|^```/m.test(text.trim())
        || /here(?:'s| is)\s+(?:the\s+)?(?:basic\s+)?(?:html|css)/i.test(text)
      ) {
        text = orphanChatPlanFallback(host.content)
          || 'Got it — happy to keep shaping that idea in plain language. Want a short feature outline next?';
      }
    }
    // Disk / overview contract verify.
    if (contract.useStudioDisk || contract.grounding === 'disk') {
      let v = verifyAnswerReply(contract, host.content, text);
      if (!v.ok && (v.reason === 'invented-link-dump' || v.reason === 'unrelated-books')) {
        const scrubbed = scrubInventedLinkDump(text);
        v = verifyAnswerReply(contract, host.content, scrubbed);
        if (v.ok) text = scrubbed;
      }
      if (!v.ok) {
        text = v.honestGap || honestGapForContract(contract, host.content);
      }
    }
  }
  // Never label a talk/plan reply as "attached files".
  let provider = result.meta || 'NOVA';
  if (!host.allowFileEdits && /·\s*attached files\s*$/i.test(provider)) {
    provider = provider.replace(/\s*·\s*attached files\s*$/i, '').trim() || 'NOVA';
  }
  return {
    status: 'handled',
    text,
    intent: result.intent,
    findings: result.findings,
    packedTokens: result.packedTokens,
    contract: chatSuccess(text),
    provider,
  };
}
