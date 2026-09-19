/**
 * Chat turn — Q&A / inspect. Only place besides edit.ts that may call answerStudio.
 * Pure social asks (story, hello, jokes) skip studio packing entirely.
 */

import { answerStudio } from '@/lib/studioAnswerEngine';
import { arkRoute, routerProviderLabel } from '@/lib/arkRouter';
import { buildRouterHistory, type RouterChatTurn } from '@/lib/chatHistory';
import { getLocalPrefs } from '@/lib/localPrefs';
import { chatSuccess, type ChatSuccess } from '@/lib/productContract';
import {
  hasRealStudioFiles,
  looksLikePlainChatAsk,
  looksLikePureGreeting,
  looksLikeCapabilityOverviewAsk,
  scrubFalseProjectChatPreamble,
  scrubTalkFirstCodeBleed,
  isTalkFenceJunk,
} from '@/lib/plainChatAsk';
import { looksLikeTalkBeforeCreateAsk, looksLikeRequirementsAsk } from '@/lib/chatIdeaIntent';
import { isCannedGreetingReply, usableAssistantText, scrubCannedGreetingFlash } from '@/lib/chatHistory';

/** Soft style hints for the model — never a canned user-visible reply. */
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
    return [{
      role: 'user',
      content: [
        '[Reply style for this turn: answer the user\'s question fully in clear prose.',
        'If they ask whether you know a product (Discord, Twitch, Netflix, etc.), say yes and briefly what it is, then discuss what building something like it would involve (core features, rough stack choices, what to decide first).',
        'If they sketch a product idea (shelf, browse, borrow, etc.), mirror the idea in plain language and suggest a simple feature outline.',
        'Finish every answer — never stop mid-sentence or after a colon.',
        'Do NOT open with markdown fences (no ```markdown). Do NOT dump source code, @@@FILE blocks, Flask/Express scaffolds, or language tags like :javascript / :cpp.',
        'A numbered outline or bullet plan in prose is fine. Do NOT create files. Talk only until they clearly ask you to build it out.]',
      ].join(' '),
    }, {
      role: 'assistant',
      content: 'Understood — full conversational answer, no code dump.',
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
  shouldAbort: () => boolean;
  onDelta?: (live: string) => void;
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

  // Plain social / creative / requirements chat — never invent empty project context.
  // Talk-before-create / requirements stay on this path even if a prior folder is bound,
  // so exploratory Discord/Netflix chats cannot dump @@@FILE into the bubble.
  const talkOrAdvice =
    looksLikeTalkBeforeCreateAsk(host.content) || looksLikeRequirementsAsk(host.content);
  if (
    looksLikePlainChatAsk(host.content)
    && (!hasRealStudioFiles(host.files) || talkOrAdvice)
  ) {
    const prefs = getLocalPrefs();
    let streamed = '';
    let lastGood = '';
    const history = buildRouterHistory(threadHistoryForChat(host), host.content, undefined, {
      keepContinuity: true,
      kind: 'chat',
    });
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
          // Abort cancels only. Never silence tokens for wall-clock — that made
          // long outlines look frozen while the model kept writing.
          if (host.shouldAbort()) return;
          const delta = String(piece || '');
          if (!delta) return;
          // Full quiet-commit from the router (one-shot replace after a silent retry/hop).
          if (streamed.length === 0 && delta.length >= 80) {
            streamed = delta;
          } else if (delta.length > streamed.length + 40 && delta.length >= 80) {
            streamed = delta;
          } else {
            streamed += delta;
          }
          let live = scrubFalseProjectChatPreamble(streamed);
          // Plain chat never ships file protocol / scaffold dumps into the bubble.
          live = scrubTalkFirstCodeBleed(live);
          live = scrubCannedGreetingFlash(live);
          if (
            live.length < 2
            || isTalkFenceJunk(live)
            || isCannedGreetingReply(live, host.content)
            || isCannedGreetingReply(String(streamed || '').trim(), host.content)
          ) {
            if (lastGood.length >= 2) host.onDelta?.(lastGood);
            return;
          }
          const usable = usableAssistantText(live, host.content);
          if (usable) live = usable;
          if (isTalkFenceJunk(live)) {
            if (lastGood.length >= 2) host.onDelta?.(lastGood);
            return;
          }
          // After a retry, ignore short unrelated replacements until they grow (stops flicker).
          if (
            lastGood.length >= 48
            && live.length < Math.floor(lastGood.length * 0.55)
            && !live.startsWith(lastGood.slice(0, Math.min(48, lastGood.length)))
          ) {
            return;
          }
          lastGood = live;
          host.onDelta?.(live);
        }
        : undefined,
    });
    const raw = String(routed.reply || lastGood || streamed || '').trim();
    let text = scrubTalkFirstCodeBleed(scrubFalseProjectChatPreamble(raw));
    if (!text || isTalkFenceJunk(text)) {
      text = (lastGood && !isTalkFenceJunk(lastGood)) ? lastGood : '';
    }
    if (!text || isTalkFenceJunk(text)) {
      // Prefer a clear prose fallback over an empty CODE / "markdown ```" bubble.
      // (Router already failed-fast on fence-only junk; avoid a second multi-minute generate.)
      text = 'Got it — a simple borrow shelf with who-has-what, no accounts. Want a quick feature outline, or should I start building it?';
      if (!/shelf|borrow|book|lend|checkout/i.test(host.content)) {
        text = 'Got it. Want a short feature outline next, or should I start building it?';
      }
    }
    if (isCannedGreetingReply(text, host.content) && lastGood && !isCannedGreetingReply(lastGood, host.content)) {
      text = lastGood;
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
    // Strip real code / @@@FILE bleed. Planning ```markdown outlines must survive.
    if (talkOrAdvice || /@@@FILE\b|```(?:jsx?|tsx?|javascript|typescript|html|css|python|json|bash|sh|markdown)?\b/i.test(text)) {
      const scrubbed = scrubTalkFirstCodeBleed(text);
      if (scrubbed && !isTalkFenceJunk(scrubbed)) text = scrubbed;
      else if (isTalkFenceJunk(text) || /^```/.test(text.trim())) {
        text = 'Got it — happy to keep shaping that idea in plain language. Want a short feature outline, or should I start building it?';
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
