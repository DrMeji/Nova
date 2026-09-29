/**
 * Chat turn — Q&A / inspect. Only place besides edit.ts that may call answerStudio.
 * Pure social asks (story, hello, jokes) skip studio packing entirely.
 */

import { answerStudio } from '@/lib/studioAnswerEngine';
import { arkRoute, routerProviderLabel } from '@/lib/novaRouter';
import { buildRouterHistory, type RouterChatTurn } from '@/lib/chatHistory';
import { getLocalPrefs } from '@/lib/localPrefs';
import { chatSuccess, type ChatSuccess } from '@/lib/productContract';
import { looksLikeBoundProjectAsk } from '@/lib/chatProjectDebug';
import { hasRealStudioFiles } from '@/lib/plainChatAsk';
import {
  looksLikePlainChatAsk,
  looksLikePureGreeting,
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
import { looksLikeTalkBeforeCreateAsk, looksLikeRequirementsAsk } from '@/lib/chatIdeaIntent';
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
  webSearchForChat,
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
import { runDeepResearch } from '@/lib/deepResearch';
import { scrubDictationTranscript } from '@/lib/voiceSession';
import { looksLikeColorCodeAsk, colorCodeReply } from '@/lib/colorCodeAsk';

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
  if (looksLikePureGreeting(content)) {
    return [{
      role: 'user',
      content: '[Reply style for this turn: one short natural greeting only. Do not list features or capabilities.]',
    }, {
      role: 'assistant',
      content: 'Understood.',
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
  if (looksLikeTalkBeforeCreateAsk(content) || looksLikeRequirementsAsk(content)) {
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
        'This is a normal conversation about a problem or product idea. Do NOT push to create files, pick a folder, or “set up Vite + React” unless the user clearly said build / create / go build / start building.',
        'Write a thorough planning reply (about 180–320 words). Do NOT stop after three short bullets — cover the real shape of the idea.',
        'Structure (use **Bold** titles on numbered lines; under each use - bullets):',
        '1) Acknowledge the problem in plain language (they lose track of X — I can help).',
        '2) Who it is for and the main job on a phone (one screen at a time).',
        '3) What to track — concrete fields that fit THEIR domain (not a generic inventory lecture).',
        '4) Day-of flows / main screens — registration, overview, updates (use - bullets under this step).',
        '5) Must-have actions for a tiny v1 vs nice-to-haves later (at least 3 must-haves and 2 later ideas).',
        '6) What “done” looks like for a first useful version.',
        'Then an OVERALL exit paragraph (2–3 sentences): the simplest path forward for a tiny phone page, what to nail first, and how the pieces fit together. Do not stop right after the last numbered item.',
        'Finally ask 1–2 concrete clarifying questions (who uses it, phone-only?, how many stalls).',
        'LIST FORMAT: Main points are 1, 2, 3, 4, 5, 6 in order — never repeat 1. Under each point use - bullets only. Never use ★. Never leave empty numbered lines (no “4. User” with nothing under it).',
        'VOICE: Open with “I can help…” / “I can tackle…”. Use “we” only for joint next steps (“we can go through this one by one”). Never “We can definitely help with that.”',
        'Stay accurate to what they said — farmers market stalls ≠ bookstore shelf. Mirror their words.',
        'Do NOT add “implementation steps”, tech stack, HTML/CSS/JS, backend, localStorage, database, or “let’s start building”. Product plan only.',
        'Never end with “Would you like to proceed with creating this page?” or “What directory should we use?” or “Let’s start by setting up Vite”.',
        'Never pitch React Native, Flutter, Firebase, Express, MongoDB, AWS, or auth/payments unless they ask.',
        'Talk as a collaborator (“we can…”, “here’s a simple approach”). Do not lecture (“you should implement…”).',
        'If they only sketched an idea (stalls, shelf, borrow), mirror it and outline features in prose — no code dumps, no @@@FILE, no markdown fences.',
        'Never restart with “Hello! How can I assist you today?” — stay on this thread.',
        'Only when they explicitly ask to build/create should you discuss creating a project on disk.]',
      ].join(' '),
    }, {
      role: 'assistant',
      content: homepage
        ? 'Understood — numbered homepage layout with bold labels and muted detail under each section. No Vite/build push.'
        : 'Understood — numbered plan 1…n with bullets under each, then an overall wrap-up paragraph and clarifying questions. No Vite/build push.',
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

export async function runChatTurn(host: ChatTurnHost): Promise<ChatTurnResult> {
  const started = Date.now();
  const abortMs = host.timeoutMs ?? (host.allowFileEdits ? 120_000 : CHAT_STREAM_ABORT_MS);
  // Fix common voice mishears before routing / web lookup (Timmy ≠ teammate).
  host = { ...host, content: scrubDictationTranscript(host.content) };

  const statusPause = (ms: number) => new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
  // Read → think first on every chat ask (then research only when needed).
  if (!host.shouldAbort()) {
    host.onStatus?.('Reading your message…');
    await statusPause(450);
  }
  if (!host.shouldAbort()) {
    host.onStatus?.('Thinking…');
    await statusPause(400);
  }

  // Chat turns never pack project files into the bubble — arkRoute only.
  // Exception: bound-project overview / diagnose asks must read the folder.
  const talkOrAdvice =
    looksLikeTalkBeforeCreateAsk(host.content) || looksLikeRequirementsAsk(host.content);
  const projectAwareAsk =
    looksLikeBoundProjectAsk(host.content)
    && hasRealStudioFiles(host.files);
  if (!host.allowFileEdits && !projectAwareAsk) {
    const prefs = getLocalPrefs();
    let streamed = '';
    let lastGood = '';
    const sideQuest = looksLikeSideQuestAsk(host.content);
    const followUp = looksLikeThreadFollowUpAsk(host.content);
    // Follow-ups about “he / the game” must keep thread context (do not wipe Apex→Fortnite).
    let history = buildRouterHistory(threadHistoryForChat(host), host.content, undefined, {
      keepContinuity: !sideQuest || followUp,
      kind: 'chat',
    });

    // Live web for real-world asks (people, brands, products, sports, news).
    let webHit: Awaited<ReturnType<typeof webSearchForChat>> | null = null;
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
    // Color codes: short deterministic reply + clickable hex swatch (no HTML/CSS lecture).
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

    const identifyAskEarly = looksLikeIdentifyMediaAsk(host.content)
      || looksLikeExplicitResearchAsk(host.content)
      || looksLikeRejectedPriorAnswerAsk(host.content);
    const bookFindAskEarly = looksLikeBookFindOrBuyAsk(host.content);

    // Book identify: deep multi-query research FIRST (real searches + images).
    if (identifyAskEarly) {
      try {
        const deep = await runDeepResearch(host.content, {
          shouldAbort: () => host.shouldAbort(),
          timeoutMs: 75_000,
          wantImages: true,
          onProgress: (p) => {
            const detail = p.detail ? ` — ${p.detail}` : '';
            host.onStatus?.(`${p.label}${detail}`);
          },
        });
        webHit = deep.searchPerformed
          ? { ok: deep.ok, text: deep.text, sources: deep.sources }
          : null;
        if (host.shouldAbort()) {
          return {
            status: 'handled',
            text: '',
            intent: 'plain-chat',
            contract: chatSuccess(''),
            provider: 'NOVA',
          };
        }
        if (deep.answer) {
          return {
            status: 'handled',
            text: deep.answer,
            intent: 'plain-chat',
            contract: chatSuccess(deep.answer),
            provider: 'NOVA',
          };
        }
      } catch {
        webHit = null;
      }
      if (host.shouldAbort()) {
        return {
          status: 'handled',
          text: '',
          intent: 'plain-chat',
          contract: chatSuccess(''),
          provider: 'NOVA',
        };
      }
      const failed = identifyResearchFailedReply(host.content);
      return {
        status: 'handled',
        text: failed,
        intent: 'plain-chat',
        contract: chatSuccess(failed),
        provider: 'NOVA',
      };
    }

    if (
      !projectAwareAsk
      && (
        looksLikeWebGroundedAsk(host.content)
        || bookFindAskEarly
        || (followUp && /\b(?:more\s+(?:info|information|details?)|tell\s+me\s+more|net\s*worth|who\s+(?:is|are)|what\s+about|look\s+up|research|nope|wrong|not\s+the\s+name)\b/i.test(host.content)
          && !/\b(?:this|the|my|our)\s+(?:project|folder|app)\b/i.test(host.content))
      )
    ) {
      try {
        host.onStatus?.('Researching…');
        webHit = await webSearchForChat(host.content, {
          priorTurns: host.priorHistory || [],
          timeoutMs: 45_000,
        });
      } catch {
        webHit = null;
      }
      if (host.shouldAbort()) {
        return {
          status: 'handled',
          text: lastGood || '',
          intent: 'plain-chat',
          contract: chatSuccess(lastGood || ''),
          provider: 'NOVA',
        };
      }
      if (webHit?.ok) {
        host.onStatus?.('Reviewing sources…');
      } else {
        host.onStatus?.('Thinking…');
      }
      const identifyAsk = false;
      const bookFindAsk = bookFindAskEarly;
      const note = webHit?.ok
        ? formatWebLookupForPrompt(webHit, {
          comprehensive: looksLikeComprehensiveAsk(host.content)
            || looksLikeExplicitResearchAsk(host.content)
            || bookFindAsk,
          identify: identifyAsk && !bookFindAsk,
        })
        : '';
      if (sideQuest || followUp || webHit?.ok) {
        history = [
          {
            role: 'user',
            content: [
              sideQuestAnswerHint(host.content),
              followUp
                ? 'This is a follow-up. Stay on the same person/game from the prior turns. Do not invent a different title (e.g. do not switch Apex → Fortnite).'
                : '',
            ].filter(Boolean).join(' '),
          },
          {
            role: 'assistant',
            content: 'Understood. Answer only this question with concrete facts and markdown links from lookup notes — keep thread continuity.',
          },
          ...history,
        ];
      }
      if (note) {
        const shape = answerShapeHintForAsk(host.content);
        history = [
          ...history,
          {
            role: 'user',
            content: [
              note,
              shape,
              `User question (answer this now): ${String(host.content || '').trim()}`,
            ].filter(Boolean).join('\n\n'),
          },
        ];
      } else if (looksLikeWebGroundedAsk(host.content) || followUp) {
        const shape = answerShapeHintForAsk(host.content);
        history = [
          ...history,
          { role: 'user', content: webLookupUnavailableNote() },
          ...(shape
            ? [{ role: 'user' as const, content: shape }, { role: 'assistant' as const, content: 'Understood — I will follow that answer shape.' }]
            : []),
          {
            role: 'assistant',
            content: 'Understood — I will say when live lookup was thin and still give the best grounded answer I can, with links when known. I will not invent earnings or switch games.',
          },
        ];
      }
    }

    // Even without web notes, push shape for factoid vs expand asks.
    {
      const shape = answerShapeHintForAsk(host.content);
      if (shape && !looksLikeWebGroundedAsk(host.content) && !followUp) {
        history = [
          { role: 'user', content: shape },
          { role: 'assistant', content: 'Understood — I will follow that answer shape.' },
          ...history,
        ];
      } else if (shape && (looksLikeWebGroundedAsk(host.content) || followUp)) {
        // Already attached with the lookup note above when present; if only follow-up path, ensure shape once.
        const already = history.some((h) => /ANSWER SHAPE/i.test(String(h.content || '')));
        if (!already) {
          history = [
            { role: 'user', content: shape },
            { role: 'assistant', content: 'Understood — I will follow that answer shape.' },
            ...history,
          ];
        }
      }
    }

    if (host.regenerate) {
      history = [
        {
          role: 'user',
          content: [
            'RETRY: The user asked for a better answer to the same question.',
            'Do NOT repeat the previous short reply. Add more concrete facts (real name, teams, birth year, follower rank, brand history, products) and include 1–3 real links (Twitch/YouTube/official/store) when lookup notes or confident knowledge allow.',
            'Use a short opening paragraph, then a **Quick facts** bullet list with bold labels, then links.',
            'Never invent fake details. Prefer lookup notes when present.',
          ].join(' '),
        },
        {
          role: 'assistant',
          content: 'Understood — deeper structured answer with facts and links.',
        },
        ...history,
      ];
    }

    const routed = await arkRoute({
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
          if (host.shouldAbort()) return;
          const delta = String(piece || '');
          if (!delta) return;
          // Full quiet-commit from the router (one-shot replace after a silent retry/hop).
          if (streamed.length === 0 && delta.length >= 80) {
            // Never let a quiet hop/retry shrink a solid live answer.
            if (lastGood.length >= 80 && delta.length < Math.floor(lastGood.length * 0.92)) {
              host.onDelta?.(lastGood);
              streamed = lastGood;
              return;
            }
            streamed = delta;
          } else if (delta.length > streamed.length + 40 && delta.length >= 80) {
            if (lastGood.length >= 80 && delta.length < Math.floor(lastGood.length * 0.92)) {
              host.onDelta?.(lastGood);
              return;
            }
            streamed = delta;
          } else {
            streamed += delta;
          }
          let live = scrubFalseProjectChatPreamble(streamed);
          live = scrubTalkFirstCodeBleed(live);
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
          if (isTalkFenceJunk(live)) {
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
          lastGood = preferEnglishSafeReply(live, lastGood, host.content);
          host.onDelta?.(lastGood);
        }
        : undefined,
    });
    // Prefer the longest solid live paint — never let a quieter scrub retract the bubble.
    // Exception: never restore a foreign-script bleed over scrubbed English.
    const routedText = String(routed.reply || '').trim();
    let raw = preferEnglishSafeReply(routedText, lastGood, host.content);
    if (
      lastGood.length >= 80
      && lastGood.length > routedText.length * 1.08
      && !replyHasUnexpectedForeignBleed(lastGood, host.content)
    ) {
      raw = lastGood;
    } else if (!raw) {
      raw = lastGood || streamed || '';
    }
    let text = scrubTalkFirstCodeBleed(scrubFalseProjectChatPreamble(raw));
    if (sideQuest) text = scrubSideQuestBleed(text, host.content) || text;
    text = scrubEmptyFactPlaceholders(text);
    text = scrubUnexpectedForeignScript(text, host.content) || text;
    // If scrubbing shrinks a solid live answer, keep the live paint — unless live was bleed.
    if (
      lastGood.length >= 80
      && text.length < Math.floor(lastGood.length * 0.85)
      && !replyHasUnexpectedForeignBleed(lastGood, host.content)
    ) {
      text = scrubEmptyFactPlaceholders(lastGood) || lastGood;
    }
    if (talkOrAdvice) {
      text = scrubBuildAggression(text);
      text = scrubHelpVoice(text);
      text = ensurePlanningExit(text, host.content);
    }
    if (!text || isTalkFenceJunk(text)) {
      text = (lastGood && !isTalkFenceJunk(lastGood) && !replyHasUnexpectedForeignBleed(lastGood, host.content))
        ? lastGood
        : scrubUnexpectedForeignScript(lastGood, host.content) || '';
    }
    if (looksLikeOrphanChatTail(text)) {
      text = (lastGood && !looksLikeOrphanChatTail(lastGood) && !replyHasUnexpectedForeignBleed(lastGood, host.content))
        ? lastGood
        : '';
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
    // Never leave product-planning “Overall: keep the first version tiny…” glued onto book answers.
    text = text
      .replace(/\n+(?:\*\s*)?\*{0,2}\s*Overall:\s*keep the first version tiny[\s\S]*$/i, '')
      .replace(/\n+(?:\*\s*)?\*{0,2}\s*Overall:\s*keep v1 tiny[\s\S]*$/i, '')
      .replace(/\n+(?:\*\s*)?\*{0,2}\s*Overall:\s*keep every band[\s\S]*$/i, '')
      .replace(/(?:^|\n)(?:\*\s*)?\*\*\s*$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

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
    if (!text || isTalkFenceJunk(text) || looksLikeOrphanChatTail(text)) {
      // Prefer a clear prose fallback over an empty CODE / "markdown ```" bubble.
      // Never inject product-planning fallbacks into book identify / find asks.
      if (identifyAsk || bookFindAsk) {
        text = webHit?.ok
          ? (identifyAsk
            ? identifyAnswerFromLookup(host.content, webHit)
            : bookFindAnswerFromLookup(host.content, webHit))
          : 'I could not finish that lookup cleanly — ask again and I will research it once more.';
      } else {
        text = orphanChatPlanFallback(host.content);
      }
    }
    if (isCannedGreetingReply(text, host.content) && lastGood && !isCannedGreetingReply(lastGood, host.content)) {
      text = lastGood;
    }
    // Attach real hrefs for “live here” / empty markdown links from lookup sources.
    if (webHit?.ok && Array.isArray(webHit.sources) && webHit.sources.length) {
      text = repairReplySourceLinks(text, webHit.sources);
    } else {
      text = repairReplySourceLinks(text);
    }
    // Strip leftover “use this in HTML/CSS…” lectures on color answers.
    text = text.replace(
      /\s*(?:You can use this code in HTML,?\s*CSS(?:,|\s+or)[^.!\n]*[.!]?\s*)+/gi,
      '',
    ).trim();
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
      text = ensurePlanningExit(text, host.content) || text;
    }
    // Always scrub talk replies — models still emit @@@FILE / CSS / fake CODE fences mid-plan.
    {
      const scrubbed = scrubTalkFirstCodeBleed(text);
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
