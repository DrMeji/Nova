/**
 * Chat turn — Q&A / inspect. Only place besides edit.ts that may call answerStudio.
 * Pure social asks (story, hello, jokes) skip studio packing entirely.
 */

import { answerStudio } from '@/lib/studioAnswerEngine';
import { arkRoute, routerProviderLabel } from '@/lib/novaRouter';
import { buildRouterHistory, type RouterChatTurn } from '@/lib/chatHistory';
import { getLocalPrefs } from '@/lib/localPrefs';
import { chatSuccess, type ChatSuccess } from '@/lib/productContract';
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
  looksLikeWebGroundedAsk,
  looksLikeLyricsAsk,
  looksLikeSideQuestAsk,
  looksLikeThreadFollowUpAsk,
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
} from '@/lib/webSearch';
import { scrubDictationTranscript } from '@/lib/voiceSession';

/** Soft style hints for the model — never a canned user-visible reply. */
function answerShapeHintForAsk(message: string): string {
  const t = String(message || '').trim();
  if (!t) return '';
  // Factoid: net worth / price / how much — lead with the number, not a bio.
  if (/\b(?:net\s*worth|how\s+much\s+(?:is|are|does|did|has|have)|(?:what(?:'s|\s+is)\s+(?:the\s+)?)?(?:price|cost|salary|earnings?|revenue|valuation))\b/i.test(t)) {
    return [
      'ANSWER SHAPE (factoid): Lead with the number/estimate in the FIRST sentence.',
      'Do NOT open with a biography (“X is a South African-born…”).',
      'Then 2–4 quick facts tied to that number (assets, date of estimate if in notes).',
      'End with 1–2 markdown source links. Never invent precise figures or future dates not in the lookup notes.',
    ].join(' ');
  }
  // Expand / who is / more info — bio first, then depth.
  if (/\b(?:more\s+(?:info|information|details)|tell\s+me\s+more|who\s+is|who\s+are|about)\b/i.test(t)
    && !/\b(?:net\s*worth|how\s+much|price|cost)\b/i.test(t)) {
    return [
      'ANSWER SHAPE (expand): Open with who they are (short bio), then career/companies, then notable facts.',
      'This is a deepen ask — go broader than a one-line number. Include 1–3 clear markdown links.',
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

  // Chat turns never pack project files into the bubble — arkRoute only.
  // (Previously non-plain chat still hit answerStudio → @@@FILE / CSS bleed.)
  const talkOrAdvice =
    looksLikeTalkBeforeCreateAsk(host.content) || looksLikeRequirementsAsk(host.content);
  if (!host.allowFileEdits) {
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
    if (looksLikeWebGroundedAsk(host.content) || followUp) {
      try {
        webHit = await webSearchForChat(host.content, {
          priorTurns: host.priorHistory || [],
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
      const note = webHit?.ok ? formatWebLookupForPrompt(webHit) : '';
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
          if (usable) live = usable;
          if (isTalkFenceJunk(live)) {
            if (lastGood.length >= 2) host.onDelta?.(lastGood);
            return;
          }
          // After a retry, ignore short unrelated replacements (stops long→short flicker).
          if (
            lastGood.length >= 48
            && live.length < Math.floor(lastGood.length * 0.92)
            && !live.startsWith(lastGood.slice(0, Math.min(48, lastGood.length)))
          ) {
            return;
          }
          lastGood = live.length >= lastGood.length ? live : lastGood;
          host.onDelta?.(lastGood);
        }
        : undefined,
    });
    // Prefer the longest solid live paint — never let a quieter scrub retract the bubble.
    const routedText = String(routed.reply || '').trim();
    let raw = routedText;
    if (lastGood.length >= 80 && lastGood.length > routedText.length * 1.08) {
      raw = lastGood;
    } else if (!raw) {
      raw = lastGood || streamed || '';
    }
    let text = scrubTalkFirstCodeBleed(scrubFalseProjectChatPreamble(raw));
    if (sideQuest) text = scrubSideQuestBleed(text, host.content) || text;
    text = scrubEmptyFactPlaceholders(text);
    // If scrubbing shrinks a solid live answer, keep the live paint.
    if (lastGood.length >= 80 && text.length < Math.floor(lastGood.length * 0.85)) {
      text = scrubEmptyFactPlaceholders(lastGood) || lastGood;
    }
    if (talkOrAdvice) {
      text = scrubBuildAggression(text);
      text = scrubHelpVoice(text);
      text = ensurePlanningExit(text, host.content);
    }
    if (!text || isTalkFenceJunk(text)) {
      text = (lastGood && !isTalkFenceJunk(lastGood)) ? lastGood : '';
    }
    if (looksLikeOrphanChatTail(text)) {
      text = (lastGood && !looksLikeOrphanChatTail(lastGood)) ? lastGood : '';
    }
    // Prefer the live paint when a quiet hop shrunk a solid answer into a snippet dump.
    const preferSolid = (a: string, b: string) => {
      const score = (s: string) => {
        if (!s || /^here'?s what turned up live/i.test(s)) return 0;
        const prose = s.replace(/https?:\/\/\S+/gi, '').replace(/\[[^\]]+\]\([^)]+\)/g, '').replace(/\s+/g, ' ').trim().length;
        const concrete = /\b(?:quick facts|net worth|born|founded|\$\d|billion|million|ceo|entrepreneur|biography)\b/i.test(s) ? 80 : 0;
        return prose + concrete;
      };
      return score(a) >= score(b) ? a : b;
    };
    text = preferSolid(text, lastGood);

    if (webHit && looksLikeThinSideQuestReply(text, host.content)) {
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
      // Domain-scoped so farmers-market / Apple copy never bleeds into unrelated chats.
      text = orphanChatPlanFallback(host.content);
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
