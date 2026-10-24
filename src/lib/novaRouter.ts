/**
 * NOVA Router. NOVA-owned routing for chat / image / video.
 *
 * Auto hops (NOVA is the brain; Ollama is never identity):
 *   capable NOVA Engine GGUF (intent + RAM) → free-key cloud if local is
 *   weak/missing → remaining Engine GGUFs → paid keys → optional Ollama last
 *
 * Chat memory is NOVA-owned: history travels with every hop so a new
 * provider continues mid-task instead of greeting like a fresh chat.
 */

import {
  packHistoryPrompt,
  sanitizeAssistantReply,
  looksLikePromptEcho,
  looksLikeRestatedPriorAnswer,
  looksLikeUserAskEcho,
  looksLikeTruncatedAssistantReply,
  isSoftContinuityAsk,
  isCannedGreetingReply,
  usableAssistantText,
  stripFirstPersonAskRestatement,
  type RouterChatTurn,
  quietRetryExtendsPainted,
} from '@/lib/chatHistory';
import { honestNoLiveChatReply } from '@/lib/novaCapacity';
import { isTalkBeforeCreateChatTurn, isTalkFirstChatTurn } from '@/lib/classifyTurn';
import { scrubTalkFirstCodeBleed, isTalkFenceJunk } from '@/lib/plainChatAsk';
import { brainGenerate, brainGenerateStream, probeBrain } from '@/lib/brain';
import {
  cloudChatFreeKeys,
  cloudChatPaidKeys,
  cloudChatPreferredThenCascade,
  hasAnyCloudChatKey,
} from '@/lib/cloudChat';
import {
  hasVisionCapability,
  historyHasImages,
  runVisionDescribeHop,
  visionCapabilityGapReply,
} from '@/lib/chatMultiModel';
import '@/lib/cloudMedia';
import { getLocalPrefs, type AiModePref } from '@/lib/localPrefs';
import {
  isOllamaEnabled,
  ollamaChat,
  probeOllamaOptional,
} from '@/lib/ollamaOptional';
import { looksLikeSimpleBuildToyChatAsk } from '@/lib/chatIntent';
import { getEngineStatus } from '@/lib/novaEngine';
import { classifyChatIntent } from '@/lib/chatIntent';
import { isCoderEngineId, isUiDesignEngineId, isWeakChatBrain, rankedReadyEngineIds } from '@/lib/enginePick';
import { loadHardwareSnapshot, parseRamGb } from '@/lib/api';
import {
  preferEnglishSafeReply,
  replyHasUnexpectedForeignBleed,
  scrubUnexpectedForeignScript,
  userAskedForOtherLanguage,
  userMessageLooksEnglish,
} from '@/lib/scrubForeignBleed';

type HuntRunOutOpts = {
  kind: 'chat' | 'coding' | 'image' | 'video';
  reason: 'quota' | 'timeout' | 'empty' | 'context' | 'media';
  currentModelId?: string;
};

function queueHuntBootstrap(opts: HuntRunOutOpts) {
  void import('@/lib/novaHuntBootstrap').then(m =>
    m.installNextWhenCurrentRanOut(opts),
  ).catch(() => undefined);
}

export type RouterKind = 'chat' | 'image' | 'video' | 'coding';

export type RouterTier =
  | 'local-free'
  | 'no-key-free'
  | 'free-key'
  | 'paid'
  | 'optional';

export type ArkRouterResult = {
  reply: string;
  media?: {
    kind: string;
    dataUrl: string;
    path?: string;
    libraryId?: string;
    real?: boolean;
  };
  modelName: string;
  /** Engine / catalog id when known. for chips only; never hijack the picker. */
  modelId?: string;
  source: string;
  tier: RouterTier;
  attempted: string[];
  /** True when prior turns were sent so the model can continue mid-task. */
  continued?: boolean;
  /** Dev: IPC failed and brain HTTP was used instead. */
  ipcFallback?: boolean;
};

export type ArkRouteOpts = {
  message: string;
  kind: RouterKind;
  preferredModelId?: string;
  preferredModelName?: string;
  preferredSource?: 'local' | 'cloud' | 'auto';
  /** Prior + current user turns owned by NOVA (not the provider). */
  history?: RouterChatTurn[];
  /** When set, local GGUF tokens stream into this callback. */
  onChunk?: (text: string) => void;
  /** Clear a failed attempt’s stream before hopping to the next provider. */
  onAttemptReset?: () => void;
  /** Auto: reuse this equipped brain for the thread until it fails. */
  stickyModelId?: string;
  stickyModelName?: string;
  stickyPinnedSource?: 'local' | 'cloud' | 'optional';
  /** Target clip length for video generation (seconds, max 30). */
  mediaDurationSec?: number;
  /** Optional reference photo for img2img recreation. */
  referenceImageDataUrl?: string;
  /** Large-repo coding: try cloud keys before weak local GGUF. */
  preferCloudCoding?: boolean;
};

function modeAllowsCloud(mode: AiModePref) {
  return mode !== 'local_only';
}

function shouldAskBeforeCloud(prefs: ReturnType<typeof getLocalPrefs>) {
  return Boolean(prefs.askBeforeCloudFailover);
}

function askCloudRetryReply(attempted: string[]): ArkRouterResult {
  return {
    reply: [
      'Local brain failed or is not ready.',
      '',
      'Enable **Auto failover** in Settings → AI, or pick a cloud model from the NOVA menu and send again.',
      '',
      '**Retry with cloud?** Choose a cloud model, then resend your message.',
    ].join('\n'),
    modelName: 'Nova Auto',
    source: 'none',
    tier: 'local-free',
    attempted,
  };
}

function modePrefersCloud(mode: AiModePref) {
  // Hybrid (cloud_when_available) + Cloud Create (local_fallback) prefer keyed cloud first.
  return mode === 'cloud_when_available' || mode === 'local_fallback';
}

import { isTemplateEngineReply } from '@/lib/codeBuildHonesty';
import { codingOutputIncomplete, coerceCodingFileReply, stripFileBlocks } from '@/lib/projectCodeEdit';

function isStrongLocal(source?: string) {
  return source === 'ark-gguf' || source === 'nova-engine' || source === 'ark-media';
}

function historyFor(opts: ArkRouteOpts): RouterChatTurn[] {
  if (opts.history && opts.history.length > 0) return opts.history;
  return [{ role: 'user', content: opts.message }];
}

function hasContinuity(history: RouterChatTurn[]) {
  return history.length > 1 || history.some(t => t.role === 'assistant');
}

function withContinued(
  result: ArkRouterResult,
  history: RouterChatTurn[],
): ArkRouterResult {
  return { ...result, continued: hasContinuity(history) };
}

async function tryLocalChat(
  history: RouterChatTurn[],
  message: string,
  modelId: string | undefined,
  attempted: string[],
  onChunk?: (text: string) => void,
  failover = true,
  failoverIds?: string[],
  kind: 'chat' | 'coding' = 'chat',
  onAttemptReset?: () => void,
  /** When true, never live-stream (prior attempt already painted the bubble). */
  forceQuiet = false,
): Promise<ArkRouterResult | null> {
  /** One full replace into the bubble — never a second live stream (stops multi-response flash). */
  const commitBubble = (text: string) => {
    const t = String(text || '').trim();
    if (!t || !onChunk) return;
    onAttemptReset?.();
    onChunk(t);
  };

  /** Retries / hops regenerate quietly; the first live stream stays on screen until commit. */
  const genQuiet = async (prompt: string, id: string | undefined) => {
    try {
      return await brainGenerate(prompt, id, kind);
    } catch {
      return brainGenerateStream(prompt, id, () => {}, kind);
    }
  };

  const runOne = async (
    id: string | undefined,
    opts?: { live?: boolean },
  ): Promise<ArkRouterResult | null> => {
    const live = !forceQuiet && opts?.live !== false && Boolean(onChunk);
    let silentUpgrade = false;
    attempted.push(id ? `NOVA Engine · ${id}` : 'NOVA Engine');
    try {
      if (!window.novaDesktop?.engineGenerate) {
        const brain = await probeBrain();
        if (!brain.ok) return null;
      }
      const prompt = packHistoryPrompt(history, message);
      const result = live
        ? await brainGenerateStream(prompt, id, onChunk!, kind)
        : await genQuiet(prompt, id);
      // Freeze what the live stream painted BEFORE quiet retries (one-paint rule).
      const livePaintedDraft = live ? String(result.reply || '').trim() : '';
      const frozenChatPaint = kind === 'chat'
        ? scrubUnexpectedForeignScript(livePaintedDraft, message).trim()
        : '';
      const chatQuietMayAdopt = (candidate: string, fallbackBaseline = ''): boolean => {
        if (kind !== 'chat') return true;
        const next = String(candidate || '').trim();
        if (!next) return false;
        const base = frozenChatPaint || String(fallbackBaseline || '').trim();
        if (!base) return true;
        return quietRetryExtendsPainted(base, next);
      };
      const prevAsst = [...history].reverse().find(t => t.role === 'assistant')?.content;
      let rawText = String(result.reply || '').trim();
      if (kind === 'coding') {
        rawText = coerceCodingFileReply(rawText);
      }
      // Coding replies must keep @@@FILE / SEARCH blocks for disk apply.
      // usableAssistantText/sanitizeAssistantReply strips those for chat bubbles.
      let cleaned = kind === 'coding'
        ? rawText
        : usableAssistantText(result.reply, message, prevAsst);
      // Soft “yes / more / overall”: if the model restated the prior answer, retry once with a harder deepen prompt.
      if (
        kind === 'chat'
        && isSoftContinuityAsk(message)
        && prevAsst
        && looksLikeRestatedPriorAnswer(cleaned || rawText, prevAsst)
      ) {
        const firstDraft = String(cleaned || rawText || '').trim();
        const deepenPrompt = [
          packHistoryPrompt(history, message),
          '',
          'CRITICAL RETRY: Your last draft repeated the previous answer. Write a longer NEW expansion with facts and angles that were not already covered. Do not restate the same temperatures, totals, or summary.',
        ].join('\n');
        const retry = await genQuiet(deepenPrompt, id);
        const retryClean = usableAssistantText(retry.reply, message, prevAsst);
        const retryRaw = String(retry.reply || '').trim();
        // Never replace a solid first draft with an empty/shorter retry.
        if ((retryClean || retryRaw) && String(retryClean || retryRaw).trim().length >= firstDraft.length) {
          cleaned = retryClean || retryRaw;
          rawText = retryRaw;
          silentUpgrade = true;
          Object.assign(result, retry);
        } else if (firstDraft) {
          cleaned = firstDraft;
          rawText = firstDraft;
        }
      }
      // Local models often restate “I want to build…” — strip first; only regenerate if still echo-only.
      // Skip the expensive second generate for exploratory talk (keeps the desktop responsive).
      if (
        kind === 'chat'
        && !isTalkBeforeCreateChatTurn(message)
        && looksLikeUserAskEcho(cleaned || rawText, message)
      ) {
        const firstDraft = (cleaned || rawText).trim();
        const stripped = stripFirstPersonAskRestatement(firstDraft, message).trim();
        const strippedClean = usableAssistantText(stripped, message, prevAsst) || stripped;
        if (
          strippedClean.length >= Math.min(280, Math.max(120, Math.floor(firstDraft.length * 0.55)))
          && !looksLikeUserAskEcho(strippedClean, message)
        ) {
          cleaned = strippedClean;
          rawText = stripped;
          silentUpgrade = true;
        } else {
          const noEchoPrompt = [
            packHistoryPrompt(history, message),
            '',
            'CRITICAL RETRY: Do NOT restate the user message. Do NOT start with “I want to…”. '
            + 'Open as the assistant (e.g. “Sure — here is how I would approach that”), then give concrete steps.',
          ].join('\n');
          const retry = await genQuiet(noEchoPrompt, id);
          const retryClean = usableAssistantText(retry.reply, message, prevAsst);
          const retryRaw = String(retry.reply || '').trim();
          const retryBest = (retryClean || retryRaw).trim();
          // Never replace a longer good outline with a shorter retry.
          if (
            retryBest
            && !looksLikeUserAskEcho(retryBest, message)
            && retryBest.length >= Math.floor(firstDraft.length * 0.85)
          ) {
            cleaned = retryClean || retryRaw;
            rawText = retryRaw;
            silentUpgrade = true;
            Object.assign(result, retry);
          } else if (retryBest.length > firstDraft.length) {
            cleaned = retryClean || retryRaw;
            rawText = retryRaw;
            silentUpgrade = true;
            Object.assign(result, retry);
          }
        }
      }
      // If a local GGUF echoes the system prompt, we must fail this attempt so failover
      // can hop to a model that returns a real answer.
      if (!cleaned.trim() && looksLikePromptEcho(rawText)) return null;
      let reply = cleaned || rawText;
      if (!reply || isTemplateEngineReply(reply)) return null;
      // Never ship the canned greeting unless the user only said a short hi/hello/hey.
      // "hey so …" idea pitches must get a real plan — not "Hello! How can I assist you today?"
      if (
        (kind === 'chat' || kind === 'coding')
        && isCannedGreetingReply(reply, message)
      ) {
        const noGreetPrompt = [
          packHistoryPrompt(history, message),
          '',
          'CRITICAL: Do NOT greet. Continue THIS conversation. Answer the latest user message with a concrete plan or reply. No "Hello! How can I assist you today?"',
        ].join('\n');
        try {
          const retry = await genQuiet(noGreetPrompt, id);
          const retryRaw = String(retry.reply || '').trim();
          const retryClean = usableAssistantText(retryRaw, message, prevAsst);
          if (retryRaw && !isCannedGreetingReply(retryRaw, message) && !isCannedGreetingReply(retryClean || '', message)) {
            cleaned = retryClean || retryRaw;
            rawText = retryRaw;
            reply = cleaned || rawText;
            silentUpgrade = true;
            Object.assign(result, retry);
          } else {
            return null;
          }
        } catch {
          return null;
        }
      }
      // Absolute fail-closed: never return the canned greeting on a substantive ask.
      if (isCannedGreetingReply(cleaned || rawText || reply, message)) return null;
      // Coding must never ship a greeting — force one hard code retry, then fail closed.
      if (
        kind === 'coding'
        && (
          /Hello! How can I assist you today\??/i.test(reply.trim())
          || /^(hi|hello|hey)[.!]?\s*(how can I help|what can I do)?[.!]?\s*$/i.test(reply.trim())
        )
        && !/@@@FILE\b/i.test(reply)
        && reply.trim().length < 400
      ) {
        const codeRetryPrompt = [
          packHistoryPrompt(history, message),
          '',
          'CRITICAL: Do NOT greet. The user asked for code/files. Emit COMPLETE @@@FILE blocks with full source now. No chatter.',
        ].join('\n');
        try {
          const retry = await genQuiet(codeRetryPrompt, id);
          const retryRaw = String(retry.reply || '').trim();
          const retryClean = usableAssistantText(retryRaw, message, prevAsst);
          if (
            retryRaw
            && !/Hello! How can I assist you today\??/i.test(retryRaw)
            && (/@@@FILE\b/i.test(retryRaw) || retryRaw.length > 400)
          ) {
            cleaned = retryClean || retryRaw;
            rawText = retryRaw;
            silentUpgrade = true;
            Object.assign(result, retry);
          } else {
            return null;
          }
        } catch {
          return null;
        }
      }
      if (kind === 'coding' && codingOutputIncomplete(rawText, message)) {
        // Never strip @@@FILE into prose-only — that made create/build leave empty scaffolds.
        // Prefer returning whatever file blocks we have (even if imperfect) so apply can run;
        // otherwise fail this attempt so failover/retry can try again.
        const closed = /@@@FILE\b/i.test(rawText) || /<<<<<<< SEARCH/.test(rawText);
        if (closed) {
          const keep = cleaned || rawText;
          if (keep.trim()) {
            if (!live && onChunk) commitBubble(keep);
            return {
              reply: keep,
              media: result.media,
              modelName: result.modelName || 'NOVA Engine',
              modelId: id || result.modelName,
              source: result.source || 'nova-engine',
              tier: 'local-free',
              attempted,
              continued: hasContinuity(history),
              ipcFallback: 'ipcFallback' in result ? result.ipcFallback : undefined,
            };
          }
        }
        return null;
      }
      if (result.source === 'nova-engine' && !result.media && isTemplateEngineReply(reply)) {
        queueHuntBootstrap({
          kind,
          reason: 'empty',
          currentModelId: id,
        });
        return null;
      }
      // Never auto-deepen ordinary chat — that wiped the first stream and pasted a second answer
      // (visible flicker). Only deepen when the user clearly asked for thorough detail.
      // But DO finish truncated drafts (ends with ":" / "here's the structure" with nothing after).
      let workingReply = (cleaned || rawText || reply).trim();
      // Exploratory product talk / requirements / any chat that opens with empty fences
      // must stay prose — fences, @@@FILE, or glued :javascript dumps.
      const fenceOnlyJunk = kind === 'chat' && isTalkFenceJunk(workingReply);
      const talkBleed = kind === 'chat'
        && (
          isTalkFirstChatTurn(message)
          || fenceOnlyJunk
          || /^```/.test(workingReply)
        )
        && (
          fenceOnlyJunk
          || /^```/.test(workingReply)
          || /@@@FILE\b/i.test(workingReply)
          || /```/.test(workingReply)
          || /:(?:javascript|typescript|python|java|cpp|jsx|tsx)\b/i.test(workingReply)
          || /^(?:import |const\s+app\s*=|from\s+flask\s+import)/im.test(workingReply)
        );
      if (talkBleed) {
        // Empty ```markdown / CODE-only drafts: fail fast for failover — a quiet
        // prose retry here was the 1–2 minute "frozen bubble" after a 5s junk stream.
        if (fenceOnlyJunk || isTalkFenceJunk(workingReply)) {
          const quickStrip = scrubTalkFirstCodeBleed(workingReply);
          if (quickStrip.length >= 40 && !isTalkFenceJunk(quickStrip)) {
            cleaned = quickStrip;
            rawText = quickStrip;
            workingReply = quickStrip;
            silentUpgrade = true;
          } else {
            return null;
          }
        } else {
        const prosePrompt = [
          packHistoryPrompt(history, message),
          '',
          'CRITICAL RETRY: Answer in clear prose only. Confirm familiarity if asked, explain what the product is, then outline what building something like it involves.',
          'Do NOT emit code, @@@FILE blocks, markdown fences (no ```), or language tags like :javascript. Finish in complete sentences.',
        ].join('\n');
        try {
          const retry = await genQuiet(prosePrompt, id);
          const retryClean = usableAssistantText(retry.reply, message, prevAsst);
          const retryRaw = String(retry.reply || '').trim();
          const best = scrubTalkFirstCodeBleed(retryClean || retryRaw).trim() || (retryClean || retryRaw).trim();
          const stillBleed = isTalkFenceJunk(best)
            || /^```/.test(best)
            || /@@@FILE\b/i.test(best)
            || /```/.test(best)
            || /:(?:javascript|typescript|python|cpp|jsx)\b/i.test(best);
          if (best && !stillBleed && best.length >= 40) {
            cleaned = best;
            rawText = best;
            workingReply = best;
            silentUpgrade = true;
            Object.assign(result, retry);
          } else {
            // Strip protocol junk from the first draft; never keep fence-only crumbs.
            const stripped = scrubTalkFirstCodeBleed(
              stripFileBlocks(workingReply)
                .replace(/([A-Za-z0-9).\]"'])\s*:\s*(javascript|typescript|python|java|cpp|jsx|tsx)\b/gi, '$1')
                .replace(/\n{3,}/g, '\n\n')
                .trim(),
            );
            if (stripped.length >= 40 && !isTalkFenceJunk(stripped)) {
              cleaned = stripped;
              rawText = stripped;
              workingReply = stripped;
              silentUpgrade = true;
            } else if (isTalkFenceJunk(workingReply)) {
              return null;
            }
          }
        } catch {
          if (isTalkFenceJunk(workingReply)) return null;
          /* keep prior */
        }
        }
      }
      if (
        kind === 'chat'
        && looksLikeTruncatedAssistantReply(workingReply)
        && !/^(?:hi|hello|hey|yo|sup|howdy)\b/i.test(String(message || '').trim())
        && !/\b(?:what\s+can\s+you\s+do|who\s+are\s+you)\b/i.test(String(message || ''))
      ) {
        const continuePrompt = [
          packHistoryPrompt(history, message),
          '',
          'CONTINUE: Your last draft stopped mid-answer. Pick up exactly where it ended and finish in complete sentences.',
          'Do not restart. Do not greet. Prefer clear prose over unfinished code scaffolds unless the user asked for code.',
          '',
          'Draft so far:',
          workingReply.slice(0, 2800),
        ].join('\n');
        try {
          const retry = await genQuiet(continuePrompt, id);
          const retryClean = usableAssistantText(retry.reply, message, prevAsst);
          const retryRaw = String(retry.reply || '').trim();
          const cont = (retryClean || retryRaw).trim();
          if (cont) {
            // Prefer finished restart over append — appending restarted openers duplicates
            // “Here's a basic structure…” mid-bubble (retract flash).
            const head = workingReply.slice(0, Math.min(48, workingReply.length)).toLowerCase();
            const contHead = cont.slice(0, Math.min(48, cont.length)).toLowerCase();
            const sameOpener = Boolean(head)
              && (
                cont.startsWith(workingReply.slice(0, Math.min(40, workingReply.length)))
                || contHead.slice(0, 24) === head.slice(0, 24)
                || /here(?:'s| is)\s+(?:the\s+)?(?:basic\s+)?(?:html|css|structure)/i.test(cont)
                  && /here(?:'s| is)\s+(?:the\s+)?(?:basic\s+)?(?:html|css|structure)/i.test(workingReply)
              );
            const tail = workingReply.slice(-80).trim();
            const continuesTail = Boolean(tail)
              && cont.length < workingReply.length + 200
              && cont.toLowerCase().includes(tail.slice(0, Math.min(40, tail.length)).toLowerCase());
            const merged = sameOpener || cont.length > workingReply.length + 40
              ? cont
              : (continuesTail ? `${workingReply}\n\n${cont}`.trim() : cont);
            if (merged.length >= workingReply.length * 0.85) {
              cleaned = merged;
              rawText = merged;
              workingReply = merged;
              silentUpgrade = true;
              Object.assign(result, retry);
            }
          }
        } catch {
          /* keep truncated draft */
        }
      }
      const thoroughAsk = /\b(?:explain|thorough|cover|detail|why|how\s+does|trilateration|walk\s+me\s+through|in\s+depth|deep\s+dive)\b/i.test(
        String(message || ''),
      );
      const wantsShort =
        /^(?:hi|hello|hey|yo|sup|howdy)\b/i.test(String(message || '').trim())
        || /\b(?:what\s+can\s+you\s+do|who\s+are\s+you|what\s+is\s+nova)\b/i.test(String(message || ''));
      const hasSolidOutline = ((workingReply.match(/^\s*(?:\d+\.|[-*•])/gm) || []).length >= 3)
        || ((workingReply.match(/\*\*[^*\n]{3,}\*\*/g) || []).length >= 3 && workingReply.trim().length >= 500);
      // At most ONE quiet deepen — a second expand pass was a common multi-response flash.
      if (
        kind === 'chat'
        && thoroughAsk
        && !wantsShort
        && workingReply.trim().length > 0
        && !hasSolidOutline
        && workingReply.trim().length < 2200
        && !/^(hi|hello|hey|thanks|thank you)[.!]?\s*$/i.test(workingReply.trim())
        && !looksLikePromptEcho(workingReply)
      ) {
        const deepenPrompt = [
          packHistoryPrompt(history, message),
          '',
          'CRITICAL RETRY: Expand this into a longer, clearer answer. Cover every requested topic with concrete detail. Take your time. Do not pad with filler. Do not restart with a greeting.',
          '',
          'Draft so far:',
          workingReply.slice(0, 2800),
        ].join('\n');
        try {
          const retry = await genQuiet(deepenPrompt, id);
          const retryClean = usableAssistantText(retry.reply, message, prevAsst);
          const retryRaw = String(retry.reply || '').trim();
          if ((retryClean || retryRaw).length > workingReply.length) {
            cleaned = retryClean || retryRaw;
            rawText = retryRaw;
            silentUpgrade = true;
            Object.assign(result, retry);
          }
        } catch {
          /* keep first reply */
        }
      }
      // Qwen-class GGUFs sometimes open in English then dump CJK. Scrub + English-only retry.
      if (
        kind === 'chat'
        && userMessageLooksEnglish(message)
        && !userAskedForOtherLanguage(message)
        && (
          replyHasUnexpectedForeignBleed(cleaned || rawText, message)
          || replyHasUnexpectedForeignBleed(livePaintedDraft, message)
        )
      ) {
        const firstClean = scrubUnexpectedForeignScript(cleaned || rawText, message).trim();
        const englishOnlyPrompt = [
          packHistoryPrompt(history, message),
          '',
          'CRITICAL RETRY: Reply in English only. Do not use Chinese, Japanese, Korean, or any other script. '
          + 'Write the full answer in English from start to finish. No bilingual mix.',
        ].join('\n');
        try {
          const retry = await genQuiet(englishOnlyPrompt, id);
          const retryClean = usableAssistantText(retry.reply, message, prevAsst);
          const retryRaw = String(retry.reply || '').trim();
          const retryBest = scrubUnexpectedForeignScript(retryClean || retryRaw, message).trim();
          if (
            retryBest
            && !replyHasUnexpectedForeignBleed(retryBest, message)
            && retryBest.length >= Math.max(48, Math.floor(firstClean.length * 0.6))
          ) {
            cleaned = retryBest;
            rawText = retryRaw;
            silentUpgrade = true;
            Object.assign(result, retry);
          } else if (firstClean) {
            cleaned = firstClean;
            rawText = firstClean;
          }
        } catch {
          if (firstClean) {
            cleaned = firstClean;
            rawText = firstClean;
          }
        }
      }

      if (
        kind === 'chat'
        && silentUpgrade
        && frozenChatPaint
        && !chatQuietMayAdopt(String(cleaned || rawText || ''))
      ) {
        cleaned = frozenChatPaint;
        rawText = frozenChatPaint;
        silentUpgrade = false;
      }

      let finalReply = (kind === 'coding' ? (cleaned || rawText) : (cleaned || rawText)) || reply;
      if (kind === 'chat') {
        finalReply = scrubUnexpectedForeignScript(finalReply, message) || finalReply;
      }
      // One-paint rule: quiet retries must strictly extend the live paint — never replace it.
      const liveDraftSafe = kind === 'chat'
        ? scrubUnexpectedForeignScript(livePaintedDraft, message).trim()
        : livePaintedDraft;
      const liveLooksJunk = !liveDraftSafe
        || liveDraftSafe.length < 48
        || isCannedGreetingReply(liveDraftSafe, message)
        || /^(?:here(?:'s| is)\s+(?:the\s+)?(?:basic\s+)?(?:html|css))/i.test(liveDraftSafe)
        || replyHasUnexpectedForeignBleed(livePaintedDraft, message);
      const candidateReply = String(finalReply || '').trim();
      if (live && kind === 'chat' && onChunk && liveDraftSafe && !liveLooksJunk) {
        const nextIsSnippetDump = /^here'?s what turned up live/i.test(candidateReply);
        const liveIsProse = liveDraftSafe.length >= 160 && !/^here'?s what turned up live/i.test(liveDraftSafe);
        if (
          !silentUpgrade
          || !chatQuietMayAdopt(candidateReply)
          || (nextIsSnippetDump && liveIsProse)
        ) {
          finalReply = preferEnglishSafeReply(liveDraftSafe, finalReply, message);
          silentUpgrade = false;
        }
      }
      // Live first draft already painted. Quiet upgrades paint once here only when they extend.
      if ((!live || silentUpgrade) && onChunk && candidateReply) {
        let mayCommit = !live || silentUpgrade;
        if (
          mayCommit
          && live
          && kind === 'chat'
          && liveDraftSafe
          && !liveLooksJunk
          && !chatQuietMayAdopt(candidateReply)
          && !replyHasUnexpectedForeignBleed(livePaintedDraft, message)
        ) {
          finalReply = preferEnglishSafeReply(liveDraftSafe, finalReply, message);
          mayCommit = false;
          silentUpgrade = false;
        }
        if (mayCommit) commitBubble(finalReply);
      }
      return {
        reply: kind === 'chat'
          ? (scrubUnexpectedForeignScript(finalReply, message) || finalReply)
          : finalReply,
        media: result.media,
        modelName: result.modelName || 'NOVA Engine',
        modelId: id || result.modelName,
        source: result.source || 'nova-engine',
        tier: 'local-free',
        attempted,
        continued: hasContinuity(history),
        ipcFallback: 'ipcFallback' in result ? result.ipcFallback : undefined,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/timed out|Empty GGUF|not ready|No GGUF|llama-cli|No local GGUF/i.test(msg)) {
        queueHuntBootstrap({
          kind,
          reason: /timed out/i.test(msg) ? 'timeout' : 'empty',
          currentModelId: id,
        });
      }
      return null;
    }
  };

  const first = await runOne(modelId, { live: true });
  if (first?.reply?.trim() && isStrongLocal(first.source)) return first;

  // Coding: always try ranked coder backups on this PC (adaptive), even if cloud autoFailover is off.
  // Chat: respect autoFailover pref.
  if (!failover && kind !== 'coding') return null;

  const extras: string[] = [];
  if (failoverIds?.length) {
    for (const id of failoverIds) {
      if (id && id !== modelId && !extras.includes(id)) extras.push(id);
    }
  } else if (kind !== 'coding') {
    try {
      const status = await getEngineStatus();
      for (const m of status.models) {
        if (
          m.status === 'ready'
          && m.id !== modelId
          && m.id !== 'NOVA-core'
          && m.id !== 'NOVA-image-core'
          && m.id !== 'NOVA-video-core'
          && !isCoderEngineId(m.id)
        ) extras.push(m.id);
      }
    } catch {
      /* ignore */
    }
  }

  // One-seat mode (ensemble parked): stay on the locked brain — no quiet coder cascade.
  // Exhaustion handoff is prepareBrainRotation’s job on the next turn, not mid-turn hops.
  let ensembleParked = true;
  try {
    const { isEnsembleAutoParked } = await import('@/lib/localPrefs');
    ensembleParked = isEnsembleAutoParked();
  } catch { /* default parked */ }

  // Coding: hop only along ranked coder GGUFs (never Instruct chat brains).
  // Up to 2 backups so a strong PC can fall 32B → 14B → 7B when one stalls.
  if (kind === 'coding') {
    if (ensembleParked && modelId) return null;
    const coderExtras = extras.filter((id) =>
      /coder|starcoder|codestral|codellama|devstral|deepseek-coder/i.test(id),
    );
    for (const id of coderExtras.slice(0, 2)) {
      // Quiet hop — keep the first draft on screen until this one commits.
      const hit = await runOne(id, { live: false });
      if (hit && isStrongLocal(hit.source)) return hit;
    }
    return null;
  }

  // Chat: one quiet backup max. Never live-stream a second answer over the first.
  // Locked seat (sticky/preferred id) never hops while ensemble is parked.
  const maxLocalFailover = (modelId || ensembleParked) ? 0 : 1;
  for (const id of extras.slice(0, maxLocalFailover)) {
    const hit = await runOne(id, { live: false });
    if (hit && isStrongLocal(hit.source)) return hit;
  }

  return null;
}

async function tryOllama(
  history: RouterChatTurn[],
  message: string,
  preferredModelId: string | undefined,
  attempted: string[],
): Promise<ArkRouterResult | null> {
  if (!isOllamaEnabled()) return null;
  attempted.push('Ollama');
  try {
    const probe = await probeOllamaOptional();
    if (!probe.online || probe.models.length === 0) return null;
    const preferred = preferredModelId?.startsWith('ollama:')
      ? preferredModelId.replace(/^ollama:/, '')
      : undefined;
    const model = preferred && probe.models.some(m => m.name === preferred)
      ? preferred
      : probe.models[0].name;
    const prevAsst = [...history].reverse().find(t => t.role === 'assistant')?.content;
    const packed = packHistoryPrompt(history, message);
    const reply = await ollamaChat(model, history, packed);
    // Keep raw coding dumps for disk apply — sanitize strips @@@FILE / fences.
    const looksCoding = /@@@FILE|SEARCH:|<<<<<<<\s*SEARCH|export\s+default\s+function/i.test(reply)
      || /\b(?:App\.jsx|index\.html|create\s+(?:a\s+)?(?:project|app))\b/i.test(message);
    const cleaned = looksCoding
      ? String(reply || '').trim()
      : sanitizeAssistantReply(reply, message, prevAsst);
    const safe = looksCoding
      ? (cleaned || reply)
      : (scrubUnexpectedForeignScript(cleaned || reply, message) || cleaned || reply);
    return {
      reply: safe,
      modelName: model,
      source: 'ollama',
      tier: 'optional',
      attempted,
      continued: hasContinuity(history),
    };
  } catch {
    return null;
  }
}

async function tryStickyBrain(
  history: RouterChatTurn[],
  message: string,
  modelId: string,
  modelName: string,
  pinnedSource: 'local' | 'cloud' | 'optional',
  attempted: string[],
  onChunk: ((text: string) => void) | undefined,
  brainKind: 'chat' | 'coding',
  mode: AiModePref,
  onAttemptReset?: () => void,
): Promise<ArkRouterResult | null> {
  if (pinnedSource === 'local') {
    const hit = await tryLocalChat(
      history,
      message,
      modelId,
      attempted,
      onChunk,
      false,
      undefined,
      brainKind,
      onAttemptReset,
    );
    if (hit && isStrongLocal(hit.source)) {
      return { ...hit, modelId };
    }
    return null;
  }

  if (pinnedSource === 'optional') {
    const ollamaId = modelId.startsWith('ollama:') ? modelId : `ollama:${modelId}`;
    const hit = await tryOllama(history, message, ollamaId, attempted);
    if (hit) return { ...hit, modelId: ollamaId };
    return null;
  }

  if (pinnedSource === 'cloud' && modeAllowsCloud(mode)) {
    const hit = await cloudChatPreferredThenCascade({
      modelId,
      modelName,
      message,
      cascade: false,
      attempted,
      history,
      onChunk,
    });
    if (hit) {
      return withContinued({
        reply: hit.reply,
        modelName: `${hit.provider} · ${hit.model}`,
        modelId,
        source: hitSource(hit.provider),
        tier: hit.cost,
        attempted,
      }, history);
    }
  }

  return null;
}

async function routeChat(opts: ArkRouteOpts): Promise<ArkRouterResult> {
  const prefs = getLocalPrefs();
  const mode = prefs.aiMode;
  const failover = prefs.autoFailover;
  const attempted: string[] = [];
  let preferredId = opts.preferredModelId;
  let preferredName = opts.preferredModelName || preferredId || '';
  const isAuto =
    preferredId === 'NOVA-auto'
    || opts.preferredSource === 'auto';
  const pinnedCloud = opts.preferredSource === 'cloud' && !isAuto;
  const pinnedOllama = Boolean(preferredId?.startsWith('ollama:')) && !isAuto;
  let pinnedLocalEngine =
    !isAuto
    && !pinnedCloud
    && !pinnedOllama
    && Boolean(preferredId)
    && preferredId !== 'NOVA-auto'
    && opts.preferredSource === 'local';
  const history = historyFor(opts);
  const intent = classifyChatIntent(opts.message, opts.kind);
  const brainKind: 'chat' | 'coding' = intent === 'coding' ? 'coding' : 'chat';
  const acceptCodingReply = (reply: string) =>
    brainKind !== 'coding' || !codingOutputIncomplete(coerceCodingFileReply(reply), opts.message);

  // Normal chat must never load a coder GGUF (sticky or pinned). Coders are build-only —
  // Instruct↔Coder unload/load mid-thread is the freeze / multi-flash path.
  // One-seat parked + explicit lock: keep the locked brain (user/Auto picked it for the chat).
  let oneSeatLocked = false;
  try {
    const { isEnsembleAutoParked } = await import('@/lib/localPrefs');
    oneSeatLocked = isEnsembleAutoParked() && Boolean(opts.stickyModelId && opts.stickyPinnedSource);
  } catch { /* ignore */ }
  if (brainKind === 'chat' && !oneSeatLocked) {
    if (isCoderEngineId(opts.stickyModelId) || isCoderEngineId(opts.stickyModelName)) {
      opts = { ...opts, stickyModelId: undefined, stickyModelName: undefined, stickyPinnedSource: undefined };
    }
    if (pinnedLocalEngine && isCoderEngineId(preferredId)) {
      pinnedLocalEngine = false;
    }
  }

  // Wave 2: block weak / oversized local coder before any coding generate hop.
  if (brainKind === 'coding') {
    // Explicit create pins (UIGEN / Instruct / VL) must stay — demoting to Auto causes
    // silent GGUF unload/reload and "nothing for 15 minutes" stalls.
    const isExplicitCreatePin = (id?: string | null, name?: string | null) => {
      const s = `${id || ''} ${name || ''}`;
      if (!String(id || '').trim() || id === 'NOVA-auto') return false;
      if (isCoderEngineId(id) || isCoderEngineId(name)) return true;
      if (isUiDesignEngineId(id) || isUiDesignEngineId(name)) return true;
      // Instruct / VL stress pins the user (or ladder) selected on purpose.
      if (/\b(?:instruct|qwen25-7b|qwen2\.?5\s*7b|qwen2-?vl|vision)\b/i.test(s)) return true;
      return false;
    };
    if (
      opts.stickyModelId
      && !isExplicitCreatePin(opts.stickyModelId, opts.stickyModelName)
    ) {
      opts = { ...opts, stickyModelId: undefined, stickyModelName: undefined, stickyPinnedSource: undefined };
    }
    if (
      preferredId
      && preferredId !== 'NOVA-auto'
      && !isExplicitCreatePin(preferredId, preferredName)
    ) {
      preferredId = 'NOVA-auto';
      preferredName = 'NOVA Auto';
      pinnedLocalEngine = false;
    }
    try {
      const { getBrainProfile, assertCoderAllowed } = await import('@/lib/brainProfile');
      const profile = await getBrainProfile();
      const gate = assertCoderAllowed(
        profile,
        opts.stickyModelId || preferredId,
        opts.stickyModelName || preferredName,
      );
      if (!gate.ok) {
        // Soft miss — skip local coding; cloud preferCloudCoding may still run below
        // only when maxCoderParamsB > 0 or cloud is explicitly preferred.
        if (profile.maxCoderParamsB <= 0 && !opts.preferCloudCoding) {
          return {
            reply: [
              gate.reason,
              '',
              'This PC cannot run a local coder. Pin a cloud coding model, or keep using surgical edits / scaffold.',
            ].join('\n'),
            modelName: 'Brain gate',
            source: 'none',
            tier: 'local-free',
            attempted,
          };
        }
        if (isWeakChatBrain(`${opts.stickyModelId || preferredId || ''} ${opts.stickyModelName || preferredName || ''}`)) {
          // Clear weak sticky so later hops don't keep retrying the tiny model.
          opts = { ...opts, stickyModelId: undefined, stickyModelName: undefined };
        }
      }
    } catch {
      /* probe failed — continue routing */
    }
  }

  const tryFreeCloud = () => cloudChatFreeKeys(
    opts.message,
    attempted,
    history,
    opts.onChunk,
    {
      acceptReply: acceptCodingReply,
      onHop: opts.onAttemptReset,
      preferCoding: brainKind === 'coding' || Boolean(opts.preferCloudCoding),
    },
  );

  // ── Multi-model vision hop (before text-only local brains invent from blindness) ──
  const hasVision = historyHasImages(history);
  if (hasVision) {
    const visionReady = await hasVisionCapability();
    if (visionReady) {
      const hop = await runVisionDescribeHop({
        userMessage: opts.message,
        history,
        onChunk: opts.onChunk,
      });
      if (hop.ok && hop.notes) {
        return withContinued({
          reply: hop.notes,
          modelName: hop.providerLabel || 'Vision hop',
          source: hop.providerLabel?.includes('local') ? 'ark-gguf-vl' : 'cloud-vision',
          tier: hop.providerLabel?.includes('local') ? 'local-free' : 'paid',
          attempted,
        }, history);
      }
      if (!hop.ok && hop.error !== 'no_vision') {
        return {
          reply: visionCapabilityGapReply({ localOnly: !modeAllowsCloud(mode) }),
          modelName: 'Vision hop',
          source: 'none',
          tier: 'local-free',
          attempted,
        };
      }
    }
    return {
      reply: visionCapabilityGapReply({ localOnly: !modeAllowsCloud(mode) }),
      modelName: 'Vision hop',
      source: 'none',
      tier: 'local-free',
      attempted,
    };
  }

  // ── Pinned cloud model (skipped for NOVA Auto) ──────────────────────
  // Explicit cloud picks must stick: cascade among cloud keys only — never snap to local.
  if (pinnedCloud && !isAuto) {
    if (!modeAllowsCloud(mode)) {
      return {
        reply: [
          'Local-only mode is on, so the cloud model you picked was not used.',
          'Switch Routing mode in Settings → AI, or pick a local brain from the NOVA menu.',
        ].join(' '),
        modelName: preferredName || 'Cloud',
        source: 'none',
        tier: 'paid',
        attempted,
      };
    }
    const hit = await cloudChatPreferredThenCascade({
      modelId: preferredId || '',
      modelName: preferredName,
      message: opts.message,
      cascade: failover,
      attempted,
      history,
      onChunk: opts.onChunk,
    });
    if (hit) {
      return withContinued({
        reply: hit.reply,
        modelName: `${hit.provider} · ${hit.model}`,
        modelId: preferredId,
        source: hit.provider.toLowerCase().replace(/\s+/g, '-'),
        tier: hit.cost,
        attempted,
      }, history);
    }
    return {
      reply: failover
        ? [
          `Cloud model **${preferredName || preferredId || 'Cloud'}** failed, and other cloud keys did not answer.`,
          'NOVA stayed on cloud (did not switch to a local brain).',
          'Check the matching API key in Models → Cloud, or pick another cloud model.',
        ].join(' ')
        : [
          'Cloud request failed.',
          'Add a matching API key in Models → Cloud, or enable Auto failover in Settings → AI to try other cloud keys (still not local).',
        ].join(' '),
      modelName: preferredName || 'Cloud',
      source: 'none',
      tier: 'paid',
      attempted,
    };
  }

  // ── Pinned Ollama ──────────────────────────────────────────────────
  if (pinnedOllama) {
    const ollama = await tryOllama(history, opts.message, preferredId, attempted);
    if (ollama) return ollama;
    if (!failover) {
      return {
        reply: 'Enable Ollama in Models (optional) and make sure it is running.',
        modelName: preferredName || 'Ollama',
        source: 'ollama',
        tier: 'optional',
        attempted,
      };
    }
  }

  // ── Pinned NOVA Engine GGUF ─────────────────────────────────────────
  if (pinnedLocalEngine) {
    const localPinned = await tryLocalChat(
      history,
      opts.message,
      preferredId,
      attempted,
      opts.onChunk,
      failover,
      undefined,
      brainKind,
      opts.onAttemptReset,
    );
    if (localPinned && isStrongLocal(localPinned.source)) return localPinned;
    if (!failover) {
      return {
        reply: 'That local brain isn’t ready. Install it from Local AI / Models, or enable Auto failover in Settings.',
        modelName: preferredName || 'NOVA Engine',
        source: 'none',
        tier: 'local-free',
        attempted,
      };
    }
  }

  // ── Cloud-preferring modes ─────────────────────────────────────────
  if (modePrefersCloud(mode) && modeAllowsCloud(mode) && hasAnyCloudChatKey()) {
    const free = await tryFreeCloud();
    if (free) {
      return withContinued({
        reply: free.reply,
        modelName: `${free.provider} · ${free.model}`,
        modelId: free.model,
        source: hitSource(free.provider),
        tier: 'free-key',
        attempted,
      }, history);
    }
    const paid = await cloudChatPaidKeys(opts.message, attempted, history, opts.onChunk);
    if (paid) {
      return withContinued({
        reply: paid.reply,
        modelName: `${paid.provider} · ${paid.model}`,
        modelId: paid.model,
        source: hitSource(paid.provider),
        tier: 'paid',
        attempted,
      }, history);
    }
  }

  const hwSnap = loadHardwareSnapshot();
  const ramGb = hwSnap ? parseRamGb(hwSnap) : 8;
  let maxCoderParamsB: number | null = null;
  if (brainKind === 'coding') {
    try {
      const { getBrainProfile } = await import('@/lib/brainProfile');
      maxCoderParamsB = (await getBrainProfile()).maxCoderParamsB;
    } catch {
      maxCoderParamsB = null;
    }
  }
  let ranked: string[] = [];
  try {
    const status = await getEngineStatus();
    ranked = rankedReadyEngineIds(status.models, intent, ramGb, maxCoderParamsB);
  } catch {
    /* Engine offline */
  }
  const picked = ranked[0];
  const rest = ranked.slice(1);
  const capableLocal = Boolean(picked && !isWeakChatBrain(picked));

  // Coding with no ready coder GGUF — never pretend Instruct built files.
  if (brainKind === 'coding' && isAuto && !picked && !opts.preferCloudCoding) {
    return {
      reply: [
        'No local **coder** model is ready, so this build cannot run yet.',
        '',
        'Install **qwen25-coder-7b** (or another coder) under **Models / Brain**, or pin a cloud coding model.',
        'Chat Instruct models answer questions — they are not used to fake a code build.',
      ].join('\n'),
      modelName: 'NOVA · need coder',
      source: 'none',
      tier: 'local-free',
      attempted,
    };
  }

  // Specialty seat for Auto: chat → chat brain, coding → coder (sequential; one GGUF at a time).
  // Soft prefer only — skip seats that are not ready so we never stall on a missing GGUF.
  if (isAuto && !pinnedCloud && !pinnedOllama && (!preferredId || preferredId === 'NOVA-auto')) {
    try {
      const { getActiveBrainId } = await import('@/lib/brainRoles');
      const { getEngineStatus } = await import('@/lib/novaEngine');
      const seat = brainKind === 'coding' ? getActiveBrainId('coder') : getActiveBrainId('chat');
      if (seat && seat !== 'NOVA-auto') {
        const status = await getEngineStatus();
        const hit = (status.models || []).find((m) => m.id === seat);
        const ready = hit && hit.status === 'ready';
        const alreadyActive = String(status.activeModelId || '') === seat;
        // Prefer ready seats; also accept already-loaded (warm) even if status laggy.
        if (ready || alreadyActive) {
          preferredId = seat;
          preferredName = String(hit?.name || seat);
        }
      }
    } catch { /* keep Auto cascade */ }
  }

  // ── NOVA Auto: Engine is the brain; Ollama is last-resort optional ──
  if (isAuto || (brainKind === 'chat' && !pinnedCloud && !pinnedOllama && !pinnedLocalEngine)) {
    // Track live paint so a sticky miss → next model does not stream a second answer over the first.
    let livePainted = false;
    const trackedChunk = opts.onChunk
      ? (t: string) => {
        livePainted = true;
        opts.onChunk!(t);
      }
      : undefined;

    if (
      opts.stickyModelId
      && opts.stickyPinnedSource
      && !(brainKind === 'chat' && isCoderEngineId(opts.stickyModelId))
    ) {
      const sticky = await tryStickyBrain(
        history,
        opts.message,
        opts.stickyModelId,
        opts.stickyModelName || opts.stickyModelId,
        opts.stickyPinnedSource,
        attempted,
        trackedChunk,
        brainKind,
        mode,
        opts.onAttemptReset,
      );
      if (sticky && sticky.source !== 'none') return sticky;
    }

    // Mini demos (calculator / todo) — free cloud first when Auto; weak local GGUFs stall mid-code.
    // Reject prose-only “here's an example” replies and keep trying free keys until one fences code.
    const toyDemo = looksLikeSimpleBuildToyChatAsk(opts.message);
    const toyAccept = (reply: string) => {
      const toyReply = String(reply || '');
      if (toyReply.length < 140) return false;
      // Prefer a real markdown fence with body.
      if (/```[\s\S]{40,}```/.test(toyReply)) return true;
      // Complete HTML document (not a lone DOCTYPE crumb glued into prose).
      if (/<html[\s\S]{80,}<\/html>/i.test(toyReply)) return true;
      if (/<!DOCTYPE\s+html[\s\S]{80,}<\/html>/i.test(toyReply)) return true;
      // Inline demo with real tags + script (still usable unfenced).
      if (
        /<script[\s\S]{40,}<\/script>/i.test(toyReply)
        && /<(?:button|input|ul|div|style)[\s\S]{20,}/i.test(toyReply)
      ) {
        return true;
      }
      return false;
    };
    if (toyDemo && isAuto && modeAllowsCloud(mode) && hasAnyCloudChatKey()) {
      // Fail fast: a couple free hops, then honest gap — never burn minutes on weak dumps.
      for (let hop = 0; hop < 2; hop++) {
        const freeToy = await tryFreeCloud();
        if (!freeToy) break;
        if (toyAccept(freeToy.reply)) {
          return withContinued({
            reply: freeToy.reply,
            modelName: `${freeToy.provider} · ${freeToy.model}`,
            modelId: freeToy.model,
            source: hitSource(freeToy.provider),
            tier: 'free-key',
            attempted,
          }, history);
        }
      }
      // Soft toys: do not fall through into slow local GGUF / more cloud thrash.
      return {
        reply: '',
        modelName: 'Nova Auto',
        source: 'none',
        tier: 'local-free',
        attempted,
      };
    }

    if (brainKind === 'coding' && opts.preferCloudCoding && modeAllowsCloud(mode) && hasAnyCloudChatKey()) {
      const freeCloud = await tryFreeCloud();
      if (freeCloud && acceptCodingReply(freeCloud.reply)) {
        return withContinued({
          reply: freeCloud.reply,
          modelName: `${freeCloud.provider} · ${freeCloud.model}`,
          modelId: freeCloud.model,
          source: hitSource(freeCloud.provider),
          tier: 'free-key',
          attempted,
        }, history);
      }
      const paidCloud = await cloudChatPaidKeys(opts.message, attempted, history, opts.onChunk);
      if (paidCloud && acceptCodingReply(paidCloud.reply)) {
        return withContinued({
          reply: paidCloud.reply,
          modelName: `${paidCloud.provider} · ${paidCloud.model}`,
          modelId: paidCloud.model,
          source: hitSource(paidCloud.provider),
          tier: 'paid',
          attempted,
        }, history);
      }
    }

    if (capableLocal) {
      const local = await tryLocalChat(
        history,
        opts.message,
        picked,
        attempted,
        trackedChunk || opts.onChunk,
        failover,
        rest,
        brainKind,
        opts.onAttemptReset,
        livePainted,
      );
      if (local && isStrongLocal(local.source) && (!toyDemo || toyAccept(local.reply))) {
        return local;
      }
      if (shouldAskBeforeCloud(prefs) && modeAllowsCloud(mode)) {
        return askCloudRetryReply(attempted);
      }
    }

    if (mode === 'local_only') {
      if (picked) {
        const weak = await tryLocalChat(
          history,
          opts.message,
          picked,
          attempted,
          trackedChunk || opts.onChunk,
          failover,
          rest,
          brainKind,
          opts.onAttemptReset,
          livePainted,
        );
        if (weak && isStrongLocal(weak.source)) return weak;
      }
      const ollamaOnly = await tryOllama(history, opts.message, preferredId, attempted);
      if (ollamaOnly) return ollamaOnly;
      return {
        reply: [
          'Local-only mode is on, but no live local brain is ready.',
          'Install a GGUF model into NOVA Engine (Local AI / Models), or enable optional Ollama.',
          'NOVA Core’s template replies are not a live model. Connect or download a chat model for real answers.',
        ].join('\n'),
        modelName: 'NOVA Engine',
        source: 'none',
        tier: 'local-free',
        attempted,
      };
    }

    // Tiny 1.5B-only (or no GGUF): free cloud for quality, then weak Engine.
    // Soft toys: never accept a prose-only cloud miss here after the toy gate above rejected it.
    if (modeAllowsCloud(mode) && hasAnyCloudChatKey() && !capableLocal) {
      const free = await tryFreeCloud();
      if (free) {
        const toyMiss = toyDemo && !toyAccept(free.reply);
        if (!toyMiss) {
          return withContinued({
            reply: free.reply,
            modelName: `${free.provider} · ${free.model}`,
            modelId: free.model,
            source: hitSource(free.provider),
            tier: 'free-key',
            attempted,
          }, history);
        }
      }
    }

    if (picked && brainKind !== 'coding') {
      const local = await tryLocalChat(
        history,
        opts.message,
        picked,
        attempted,
        trackedChunk || opts.onChunk,
        failover,
        rest,
        brainKind,
        opts.onAttemptReset,
        livePainted,
      );
      if (local && isStrongLocal(local.source)) return local;
    }

    if (modeAllowsCloud(mode)) {
      if (hasAnyCloudChatKey()) {
        const free = await tryFreeCloud();
        if (free) {
          const toyMiss = toyDemo && !toyAccept(free.reply);
          if (!toyMiss) {
            return withContinued({
              reply: free.reply,
              modelName: `${free.provider} · ${free.model}`,
              modelId: free.model,
              source: hitSource(free.provider),
              tier: 'free-key',
              attempted,
            }, history);
          }
        }
      }
      const paid = await cloudChatPaidKeys(opts.message, attempted, history, opts.onChunk);
      if (paid) {
        const toyMiss = toyDemo && !toyAccept(paid.reply);
        if (!toyMiss) {
          return withContinued({
            reply: paid.reply,
            modelName: `${paid.provider} · ${paid.model}`,
            modelId: paid.model,
            source: hitSource(paid.provider),
            tier: 'paid',
            attempted,
          }, history);
        }
      }
    }

    const ollama = await tryOllama(history, opts.message, preferredId, attempted);
    if (ollama && (!toyDemo || toyAccept(ollama.reply))) return ollama;

    // Soft toys: every hop missed a usable demo — empty reply so chat finalize shows the honest gap.
    if (toyDemo) {
      return {
        reply: '',
        modelName: 'Nova Auto',
        source: 'none',
        tier: 'local-free',
        attempted,
      };
    }

    // Models may be installed but every hop failed (timeout / busy / OOM).
    // Never claim “no live model” when we clearly attempted local Engine.
    const triedLocal = attempted.some((a) => /NOVA Engine|ark-gguf|local/i.test(a));
    if (triedLocal) {
      return {
        reply: [
          'Your local brain is installed, but that reply did not finish (busy, timed out, or overloaded).',
          '',
          'Try again in a moment. If the desktop feels frozen while a reply runs, wait for it to finish or press Stop, then resend.',
          'For smoother chat, keep Nova Auto and prefer the 7B instruct brain for normal conversation (coders are for file builds).',
        ].join('\n'),
        modelName: 'Nova Auto',
        source: 'none',
        tier: 'local-free',
        attempted,
      };
    }

    return {
      reply: honestNoLiveChatReply(),
      modelName: 'Nova Auto',
      source: 'none',
      tier: 'local-free',
      attempted,
    };
  }

  // ── Pinned / named Engine (not Auto) ──────────────────────────────
  const local = await tryLocalChat(
    history,
    opts.message,
    pinnedCloud || pinnedOllama || pinnedLocalEngine ? undefined : preferredId,
    attempted,
    opts.onChunk,
    failover,
    undefined,
    brainKind,
    opts.onAttemptReset,
  );

  if (local && isStrongLocal(local.source)) {
    return local;
  }

  if (mode === 'local_only') {
    if (local && isStrongLocal(local.source)) return local;
    const ollamaOnly = await tryOllama(history, opts.message, preferredId, attempted);
    if (ollamaOnly) return ollamaOnly;
    return {
      reply: [
        'Local-only mode is on, but no live local brain is ready.',
        'Install a GGUF model into NOVA Engine (Local AI / Models), or enable optional Ollama.',
        'NOVA Core’s template replies are not a live model. Connect or download a chat model for real answers.',
      ].join('\n'),
      modelName: 'NOVA Engine',
      source: 'none',
      tier: 'local-free',
      attempted,
    };
  }

  // ── Free-key → paid, then optional Ollama ─────────────────────────
  if (modeAllowsCloud(mode)) {
    const free = await tryFreeCloud();
    if (free) {
      return withContinued({
        reply: free.reply,
        modelName: `${free.provider} · ${free.model}`,
        modelId: free.model,
        source: hitSource(free.provider),
        tier: 'free-key',
        attempted,
      }, history);
    }
    const paid = await cloudChatPaidKeys(opts.message, attempted, history, opts.onChunk);
    if (paid) {
      return withContinued({
        reply: paid.reply,
        modelName: `${paid.provider} · ${paid.model}`,
        modelId: paid.model,
        source: hitSource(paid.provider),
        tier: 'paid',
        attempted,
      }, history);
    }
  }

  const ollama = await tryOllama(history, opts.message, preferredId, attempted);
  if (ollama) return ollama;

  // Never return NOVA Core template as a finished answer. be honest.
  return {
    reply: honestNoLiveChatReply(),
    modelName: 'Nova Auto',
    source: 'none',
    tier: 'local-free',
    attempted,
  };
}

function hitSource(provider: string) {
  return provider.toLowerCase().replace(/\s+/g, '-');
}











/**
 * Single entry for Chat / Image / Video (and coding = chat path).
 * Views keep UX (progress stages); the router owns try/fallback + history.
 */
export async function arkRoute(opts: ArkRouteOpts): Promise<ArkRouterResult> {
  const kind = opts.kind === 'coding' ? 'chat' : opts.kind;
  // Image / Video product surfaces are removed — refuse at the router entry.
  if (kind === 'image' || kind === 'video') {
    return {
      reply: 'Image and Video generation are not available in NOVA right now. Use Chat for text, code, and projects.',
      source: 'none',
      modelName: 'NOVA',
      tier: 'local-free',
      attempted: [],
    };
  }
  return routeChat(opts);
}

/** Short label for chat bubbles. keeps the provider quiet but honest. */
export function routerProviderLabel(result: ArkRouterResult, fallback: string) {
  if (result.source === 'none') return fallback;
  // Retries on the same GGUF (greeting / echo scrub) inflate attempted — only
  // show · switched when the engine id actually changed.
  const engineIds = (result.attempted || [])
    .map((a) => String(a || '').replace(/^NOVA Engine ·\s*/i, '').trim())
    .filter(Boolean);
  const uniqueEngines = new Set(engineIds);
  const hop = uniqueEngines.size > 1 ? ' · switched' : '';
  if (result.tier === 'free-key') return `Free · ${result.modelName}${hop}`;
  if (result.tier === 'no-key-free') return `Free · ${result.modelName}${hop}`;
  if (result.tier === 'local-free') return `Local · ${result.modelName}${hop}`;
  if (result.tier === 'optional') return `Optional · ${result.modelName}${hop}`;
  if (result.tier === 'paid') return `Cloud · ${result.modelName}${hop}`;
  return `${result.modelName || fallback}${hop}`;
}
