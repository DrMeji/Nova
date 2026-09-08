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
  isSoftContinuityAsk,
  usableAssistantText,
  stripFirstPersonAskRestatement,
  type RouterChatTurn,
} from '@/lib/chatHistory';
import { honestNoLiveChatReply } from '@/lib/arkCapacity';
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
import { cloudGenerateImage } from '@/lib/cloudMedia';
import { getLocalPrefs, type AiModePref } from '@/lib/localPrefs';
import {
  isOllamaEnabled,
  ollamaChat,
  probeOllamaOptional,
} from '@/lib/ollamaOptional';
import { getEngineStatus } from '@/lib/arkEngine';
import { classifyChatIntent } from '@/lib/chatIntent';
import { isWeakChatBrain, rankedReadyEngineIds } from '@/lib/enginePick';
import { loadHardwareSnapshot, parseRamGb } from '@/lib/api';

type HuntRunOutOpts = {
  kind: 'chat' | 'coding' | 'image' | 'video';
  reason: 'quota' | 'timeout' | 'empty' | 'context' | 'media';
  currentModelId?: string;
};

function queueHuntBootstrap(opts: HuntRunOutOpts) {
  void import('@/lib/arkHuntBootstrap').then(m =>
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
  return Boolean(prefs.askBeforeCloudFailover && !prefs.autoFailover);
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
    modelName: 'NOVA Auto',
    source: 'none',
    tier: 'local-free',
    attempted,
  };
}

function modePrefersCloud(mode: AiModePref) {
  return mode === 'cloud_when_available' || mode === 'local_fallback';
}

import { isTemplateEngineReply } from '@/lib/codeBuildHonesty';
import { codingOutputIncomplete, coerceCodingFileReply, stripFileBlocks } from '@/lib/projectCodeEdit';

function isStrongLocal(source?: string) {
  return source === 'ark-gguf' || source === 'ark-engine' || source === 'ark-media';
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
): Promise<ArkRouterResult | null> {
  const runOne = async (id: string | undefined): Promise<ArkRouterResult | null> => {
    attempted.push(id ? `NOVA Engine · ${id}` : 'NOVA Engine');
    try {
      if (!window.arkDesktop?.engineGenerate) {
        const brain = await probeBrain();
        if (!brain.ok) return null;
      }
      const prompt = packHistoryPrompt(history, message);
      const result = onChunk
        ? await brainGenerateStream(prompt, id, onChunk, kind)
        : await brainGenerate(prompt, id, kind);
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
        onAttemptReset?.();
        const deepenPrompt = [
          packHistoryPrompt(history, message),
          '',
          'CRITICAL RETRY: Your last draft repeated the previous answer. Write a longer NEW expansion with facts and angles that were not already covered. Do not restate the same temperatures, totals, or summary.',
        ].join('\n');
        const retry = onChunk
          ? await brainGenerateStream(deepenPrompt, id, onChunk, kind)
          : await brainGenerate(deepenPrompt, id, kind);
        cleaned = usableAssistantText(retry.reply, message, prevAsst);
        rawText = String(retry.reply || '').trim();
        if (cleaned || rawText) {
          Object.assign(result, retry);
        }
      }
      // Local models often restate “I want to build…” — strip first; only regenerate if still echo-only.
      if (
        kind === 'chat'
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
        } else {
          onAttemptReset?.();
          const noEchoPrompt = [
            packHistoryPrompt(history, message),
            '',
            'CRITICAL RETRY: Do NOT restate the user message. Do NOT start with “I want to…”. '
            + 'Open as the assistant (e.g. “Sure — here is how I would approach that”), then give concrete steps.',
          ].join('\n');
          const retry = onChunk
            ? await brainGenerateStream(noEchoPrompt, id, onChunk, kind)
            : await brainGenerate(noEchoPrompt, id, kind);
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
            Object.assign(result, retry);
          } else if (retryBest.length > firstDraft.length) {
            cleaned = retryClean || retryRaw;
            rawText = retryRaw;
            Object.assign(result, retry);
          }
        }
      }
      // If a local GGUF echoes the system prompt, we must fail this attempt so failover
      // can hop to a model that returns a real answer.
      if (!cleaned.trim() && looksLikePromptEcho(rawText)) return null;
      const reply = cleaned || rawText;
      if (!reply || isTemplateEngineReply(reply)) return null;
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
        onAttemptReset?.();
        const codeRetryPrompt = [
          packHistoryPrompt(history, message),
          '',
          'CRITICAL: Do NOT greet. The user asked for code/files. Emit COMPLETE @@@FILE blocks with full source now. No chatter.',
        ].join('\n');
        try {
          const retry = onChunk
            ? await brainGenerateStream(codeRetryPrompt, id, onChunk, kind)
            : await brainGenerate(codeRetryPrompt, id, kind);
          const retryRaw = String(retry.reply || '').trim();
          const retryClean = usableAssistantText(retryRaw, message, prevAsst);
          if (
            retryRaw
            && !/Hello! How can I assist you today\??/i.test(retryRaw)
            && (/@@@FILE\b/i.test(retryRaw) || retryRaw.length > 400)
          ) {
            cleaned = retryClean || retryRaw;
            rawText = retryRaw;
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
            return {
              reply: keep,
              media: result.media,
              modelName: result.modelName || 'NOVA Engine',
              modelId: id || result.modelName,
              source: result.source || 'ark-engine',
              tier: 'local-free',
              attempted,
              continued: hasContinuity(history),
              ipcFallback: 'ipcFallback' in result ? result.ipcFallback : undefined,
            };
          }
        }
        onAttemptReset?.();
        return null;
      }
      if (result.source === 'ark-engine' && !result.media && isTemplateEngineReply(reply)) {
        queueHuntBootstrap({
          kind,
          reason: 'empty',
          currentModelId: id,
        });
        return null;
      }
      // Thin or rushed chat answers — deepen for substance (1+ min think is OK).
      // Skip when the draft already has a real outline/list (retry was retracting FPS plans).
      const thoroughAsk = /\b(?:explain|thorough|cover|detail|why|how\s+does|trilateration|walk\s+me\s+through)\b/i.test(
        String(message || ''),
      );
      const hasSolidOutline = ((reply.match(/^\s*(?:\d+\.|[-*•])/gm) || []).length >= 3)
        || ((reply.match(/\*\*[^*\n]{3,}\*\*/g) || []).length >= 3 && reply.trim().length >= 500);
      if (
        kind === 'chat'
        && reply.trim().length > 0
        && !hasSolidOutline
        && (
          reply.trim().length < 900
          || (thoroughAsk && reply.trim().length < 2200)
        )
        && !/^(hi|hello|hey|thanks|thank you)[.!]?\s*$/i.test(reply.trim())
        && !looksLikePromptEcho(reply)
      ) {
        onAttemptReset?.();
        const deepenPrompt = [
          packHistoryPrompt(history, message),
          '',
          thoroughAsk
            ? 'CRITICAL RETRY: Expand this into a longer, clearer answer. Cover every requested topic with concrete detail. Take your time. Do not pad with filler. Do not restart with a greeting.'
            : 'CRITICAL RETRY: Your last draft was too short or rushed. Take your time. Write a longer, clearer, more accurate answer with real detail, numbered structure if helpful, and concrete examples. Do not pad with filler. Do not restart with a greeting.',
        ].join('\n');
        try {
          const retry = onChunk
            ? await brainGenerateStream(deepenPrompt, id, onChunk, kind)
            : await brainGenerate(deepenPrompt, id, kind);
          const retryClean = usableAssistantText(retry.reply, message, prevAsst);
          const retryRaw = String(retry.reply || '').trim();
          if ((retryClean || retryRaw).length > reply.length) {
            cleaned = retryClean || retryRaw;
            rawText = retryRaw;
            Object.assign(result, retry);
          }
        } catch {
          /* keep first reply */
        }
      }
      // Thorough asks: one more expansion pass so answers aren't rushed in a few seconds.
      const afterDeepen = (cleaned || rawText || reply).trim();
      if (
        kind === 'chat'
        && thoroughAsk
        && afterDeepen.length > 0
        && afterDeepen.length < 3600
        && !looksLikePromptEcho(afterDeepen)
      ) {
        onAttemptReset?.();
        const expandPrompt = [
          packHistoryPrompt(history, message),
          '',
          'EXPAND FURTHER: Add another layer of accurate detail (edge cases, common misconceptions, and a short concrete example). Keep the same topic. Do not greet. Do not shorten.',
          '',
          'Draft so far:',
          afterDeepen.slice(0, 2800),
        ].join('\n');
        try {
          const retry = onChunk
            ? await brainGenerateStream(expandPrompt, id, onChunk, kind)
            : await brainGenerate(expandPrompt, id, kind);
          const retryClean = usableAssistantText(retry.reply, message, prevAsst);
          const retryRaw = String(retry.reply || '').trim();
          const best = (retryClean || retryRaw);
          if (best.length > afterDeepen.length) {
            cleaned = best;
            rawText = retryRaw;
            Object.assign(result, retry);
          }
        } catch {
          /* keep deepened reply */
        }
      }
      const finalReply = (kind === 'coding' ? (cleaned || rawText) : (cleaned || rawText)) || reply;
      return {
        reply: finalReply,
        media: result.media,
        modelName: result.modelName || 'NOVA Engine',
        modelId: id || result.modelName,
        source: result.source || 'ark-engine',
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
      onAttemptReset?.();
      return null;
    }
  };

  const first = await runOne(modelId);
  if (first?.reply?.trim() && isStrongLocal(first.source)) return first;

  // Coding must not hop through every weak chat GGUF (each can take minutes).
  if (!failover || kind === 'coding') return null;

  const extras: string[] = [];
  if (failoverIds?.length) {
    for (const id of failoverIds) {
      if (id && id !== modelId && !extras.includes(id)) extras.push(id);
    }
  } else {
    try {
      const status = await getEngineStatus();
      for (const m of status.models) {
        if (
          m.status === 'ready'
          && m.id !== modelId
          && m.id !== 'NOVA-core'
          && m.id !== 'NOVA-image-core'
          && m.id !== 'NOVA-video-core'
        ) extras.push(m.id);
      }
    } catch {
      /* ignore */
    }
  }

  // Chat: one brain attempt. hopping local GGUFs can stall for minutes with no answer.
  const maxLocalFailover = modelId ? 0 : 1;
  for (const id of extras.slice(0, maxLocalFailover)) {
    const hit = await runOne(id);
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
    const cleaned = sanitizeAssistantReply(reply, message, prevAsst);
    return {
      reply: cleaned || reply,
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
  const preferredId = opts.preferredModelId;
  const preferredName = opts.preferredModelName || preferredId || '';
  const isAuto =
    preferredId === 'NOVA-auto'
    || opts.preferredSource === 'auto';
  const pinnedCloud = opts.preferredSource === 'cloud' && !isAuto;
  const pinnedOllama = Boolean(preferredId?.startsWith('ollama:')) && !isAuto;
  const pinnedLocalEngine =
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
  const tryFreeCloud = () => cloudChatFreeKeys(
    opts.message,
    attempted,
    history,
    opts.onChunk,
    { acceptReply: acceptCodingReply, onHop: opts.onAttemptReset },
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
        source: hitSource(paid.provider),
        tier: 'paid',
        attempted,
      }, history);
    }
  }

  const hwSnap = loadHardwareSnapshot();
  const ramGb = hwSnap ? parseRamGb(hwSnap) : 8;
  let ranked: string[] = [];
  try {
    const status = await getEngineStatus();
    ranked = rankedReadyEngineIds(status.models, intent, ramGb);
  } catch {
    /* Engine offline */
  }
  const picked = ranked[0];
  const rest = ranked.slice(1);
  const capableLocal = Boolean(picked && !isWeakChatBrain(picked));

  // ── NOVA Auto: Engine is the brain; Ollama is last-resort optional ──
  if (isAuto) {
    if (opts.stickyModelId && opts.stickyPinnedSource) {
      const sticky = await tryStickyBrain(
        history,
        opts.message,
        opts.stickyModelId,
        opts.stickyModelName || opts.stickyModelId,
        opts.stickyPinnedSource,
        attempted,
        opts.onChunk,
        brainKind,
        mode,
        opts.onAttemptReset,
      );
      if (sticky && sticky.source !== 'none') return sticky;
    }

    if (brainKind === 'coding' && opts.preferCloudCoding && modeAllowsCloud(mode) && hasAnyCloudChatKey()) {
      const freeCloud = await tryFreeCloud();
      if (freeCloud && acceptCodingReply(freeCloud.reply)) {
        return withContinued({
          reply: freeCloud.reply,
          modelName: `${freeCloud.provider} · ${freeCloud.model}`,
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
        opts.onChunk,
        failover,
        rest,
        brainKind,
        opts.onAttemptReset,
      );
      if (local && isStrongLocal(local.source)) return local;
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
          opts.onChunk,
          failover,
          rest,
          brainKind,
          opts.onAttemptReset,
        );
        if (weak && isStrongLocal(weak.source)) return weak;
      }
      const ollamaOnly = await tryOllama(history, opts.message, preferredId, attempted);
      if (ollamaOnly) return ollamaOnly;
      return {
        reply: [
          'Local-only mode is on, but no live local brain is ready.',
          'Install a GGUF model into NOVA Engine (Local AI / Models), or enable optional Ollama.',
          'NOVA Core’s template replies are not a live model. they won’t answer like ChatGPT.',
        ].join('\n'),
        modelName: 'NOVA Engine',
        source: 'none',
        tier: 'local-free',
        attempted,
      };
    }

    // Tiny 1.5B-only (or no GGUF): free cloud for quality, then weak Engine.
    if (modeAllowsCloud(mode) && hasAnyCloudChatKey() && !capableLocal) {
      const free = await tryFreeCloud();
      if (free) {
        return withContinued({
          reply: free.reply,
          modelName: `${free.provider} · ${free.model}`,
          source: hitSource(free.provider),
          tier: 'free-key',
          attempted,
        }, history);
      }
    }

    if (picked && brainKind !== 'coding') {
      const local = await tryLocalChat(
        history,
        opts.message,
        picked,
        attempted,
        opts.onChunk,
        failover,
        rest,
        brainKind,
        opts.onAttemptReset,
      );
      if (local && isStrongLocal(local.source)) return local;
    }

    if (modeAllowsCloud(mode)) {
      if (hasAnyCloudChatKey()) {
        const free = await tryFreeCloud();
        if (free) {
          return withContinued({
            reply: free.reply,
            modelName: `${free.provider} · ${free.model}`,
            source: hitSource(free.provider),
            tier: 'free-key',
            attempted,
          }, history);
        }
      }
      const paid = await cloudChatPaidKeys(opts.message, attempted, history, opts.onChunk);
      if (paid) {
        return withContinued({
          reply: paid.reply,
          modelName: `${paid.provider} · ${paid.model}`,
          source: hitSource(paid.provider),
          tier: 'paid',
          attempted,
        }, history);
      }
    }

    const ollama = await tryOllama(history, opts.message, preferredId, attempted);
    if (ollama) return ollama;

    return {
      reply: honestNoLiveChatReply(),
      modelName: 'NOVA Auto',
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
        'NOVA Core’s template replies are not a live model. they won’t answer like ChatGPT.',
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
    modelName: 'NOVA Auto',
    source: 'none',
    tier: 'local-free',
    attempted,
  };
}

function hitSource(provider: string) {
  return provider.toLowerCase().replace(/\s+/g, '-');
}

function isAutoRoute(opts: ArkRouteOpts) {
  return opts.preferredModelId === 'NOVA-auto' || opts.preferredSource === 'auto';
}

async function tryStickyImage(
  opts: ArkRouteOpts,
  attempted: string[],
  mode: AiModePref,
): Promise<ArkRouterResult | null> {
  if (!opts.stickyModelId || !opts.stickyPinnedSource) return null;
  attempted.push(`Sticky · ${opts.stickyModelName || opts.stickyModelId}`);

  if (opts.stickyPinnedSource === 'cloud' && modeAllowsCloud(mode)) {
    try {
      const cloud = await cloudGenerateImage(opts.message);
      if (!cloud?.dataUrl && !cloud?.url) return null;
      return {
        reply: cloud.reply,
        media: {
          kind: 'image',
          dataUrl: cloud.dataUrl || cloud.url || '',
          libraryId: `cloud-${Date.now()}`,
          real: true,
        },
        modelName: cloud.provider,
        modelId: opts.stickyModelId,
        source: hitSource(cloud.provider),
        tier: cloud.tier === 'free-key' ? 'free-key' : 'paid',
        attempted,
      };
    } catch {
      return null;
    }
  }

  const modelId = opts.stickyModelId || 'NOVA-image-core';
  try {
    const result = await brainGenerate(opts.message, modelId, 'image', {
      mediaDurationSec: opts.mediaDurationSec,
      referenceImageDataUrl: opts.referenceImageDataUrl,
    });
    if (!result.media?.dataUrl) {
      return result.reply
        ? {
          reply: result.reply,
          modelName: result.modelName || 'NOVA Image Core',
          modelId,
          source: result.source || 'ark-media',
          tier: 'no-key-free',
          attempted,
        }
        : null;
    }
    return {
      reply: result.reply,
      media: result.media,
      modelName: result.modelName || 'NOVA Image Core',
      modelId,
      source: result.source || 'ark-media',
      tier: result.media.real ? 'no-key-free' : 'local-free',
      attempted,
    };
  } catch {
    return null;
  }
}

async function tryStickyVideo(
  opts: ArkRouteOpts,
  attempted: string[],
): Promise<ArkRouterResult | null> {
  if (!opts.stickyModelId || !opts.stickyPinnedSource) return null;
  attempted.push(`Sticky · ${opts.stickyModelName || opts.stickyModelId}`);
  const modelId = opts.stickyModelId || 'NOVA-video-core';
  try {
    const result = await brainGenerate(opts.message, modelId, 'video', {
      mediaDurationSec: opts.mediaDurationSec,
    });
    const source = result.source || 'ark-media';
    const isMp4 = Boolean(
      result.media?.dataUrl?.startsWith('data:video/')
      || source.includes('mp4')
      || source.includes('huggingface-video'),
    );
    const isFallback = Boolean(
      source.includes('motion-still')
      || source.includes('fallback')
      || (!isMp4 && result.media?.dataUrl?.startsWith('data:image/svg')),
    );
    let reply = result.reply;
    if (isFallback && result.media?.dataUrl) {
      reply = [
        'Video preview · motion still (MP4 hosts were busy or need credits).',
        '',
        result.reply,
      ].join('\n');
    }
    return {
      reply,
      media: result.media,
      modelName: result.modelName || 'NOVA Video Core',
      modelId,
      source,
      tier: isMp4 ? 'no-key-free' : isFallback ? 'local-free' : (result.media?.real ? 'no-key-free' : 'local-free'),
      attempted,
    };
  } catch {
    return null;
  }
}

async function routeImage(opts: ArkRouteOpts): Promise<ArkRouterResult> {
  const prefs = getLocalPrefs();
  const mode = prefs.aiMode;
  const failover = prefs.autoFailover;
  const attempted: string[] = [];
  const isAuto = isAutoRoute(opts);

  if (isAuto && opts.stickyModelId && opts.stickyPinnedSource) {
    const sticky = await tryStickyImage(opts, attempted, mode);
    // Only keep sticky when it actually produced a real image. otherwise free hosts never run
    // and users see "busy / couldn't generate" from a failed local SD sticky.
    if (sticky?.media?.dataUrl && sticky.media.real) return sticky;
  }

  const wantsCloud =
    (!isAuto && opts.preferredSource === 'cloud')
    || Boolean(opts.preferredModelId?.includes('dall'))
    || Boolean(opts.preferredModelId?.includes('hf-flux'))
    || Boolean(opts.preferredModelId?.includes('flux'))
    || (isAuto ? false : modePrefersCloud(mode));

  const tryCloud = async (): Promise<ArkRouterResult | null> => {
    if (!modeAllowsCloud(mode)) return null;
    attempted.push('Cloud image (HF / OpenAI)');
    try {
      const cloud = await cloudGenerateImage(opts.message);
      if (!cloud?.dataUrl && !cloud?.url) return null;
      const dataUrl = cloud.dataUrl || cloud.url || '';
      const libraryId = `cloud-${Date.now()}`;
      const cloudModelId = opts.preferredModelId?.includes('dall') ? 'dall-e-3' : 'cloud-image';
      return {
        reply: cloud.reply,
        media: {
          kind: 'image',
          dataUrl,
          libraryId,
          real: true,
        },
        modelName: cloud.provider,
        modelId: cloudModelId,
        source: hitSource(cloud.provider),
        tier: cloud.tier === 'free-key' ? 'free-key' : 'paid',
        attempted,
      };
    } catch {
      return null;
    }
  };

  const tryLocalMedia = async (modelId?: string): Promise<ArkRouterResult | null> => {
    const mid = modelId || opts.preferredModelId || 'NOVA-image-core';
    const label = mid === 'NOVA-image-core' ? 'NOVA Image Core' : mid;
    attempted.push(label);
    try {
      const result = await brainGenerate(opts.message, mid, 'image', {
        mediaDurationSec: opts.mediaDurationSec,
        referenceImageDataUrl: opts.referenceImageDataUrl,
      });
      if (!result.media?.dataUrl) {
        return {
          reply: result.reply,
          modelName: result.modelName || label,
          modelId: mid,
          source: result.source || 'ark-media',
          tier: 'no-key-free',
          attempted,
        };
      }
      return {
        reply: result.reply,
        media: result.media,
        modelName: result.modelName || label,
        modelId: mid,
        source: result.source || 'ark-media',
        tier: result.media.real ? 'no-key-free' : 'local-free',
        attempted,
      };
    } catch {
      return null;
    }
  };

  if (wantsCloud) {
    const cloud = await tryCloud();
    if (cloud) return cloud;
    if (!failover && opts.preferredSource === 'cloud') {
      return {
        reply: 'Cloud image failed. Add a Hugging Face or OpenAI key in Models → Cloud, or switch to NOVA Image Core.',
        modelName: opts.preferredModelName || 'Cloud image',
        source: 'none',
        tier: 'paid',
        attempted,
      };
    }
  }

  const local = await tryLocalMedia();
  if (local?.media?.dataUrl && local.media.real) return local;

  // Cascade: cloud (HF/OpenAI) after free hosts if failover is on.
  if ((!wantsCloud || !local?.media?.real) && failover && modeAllowsCloud(mode)) {
    const cloud = await tryCloud();
    if (cloud) {
      if (local && attempted.length > 1) {
        return { ...cloud, attempted: [...attempted, ...(cloud.attempted || [])] };
      }
      return cloud;
    }
  }

  if (local?.media?.dataUrl && local.media.real) return local;

  // Last resort: labeled preview only. never treat SVG fallback as finished art.
  // Never invent “use Canva / Photoshop” text. hosts failed; tell the user to retry or add a key.
  if (local?.media?.dataUrl && !local.media.real) {
    queueHuntBootstrap({
      kind: 'image',
      reason: 'media',
      currentModelId: opts.preferredModelId,
    });
    return {
      ...local,
      reply: [
        'Image preview · offline fallback (not a finished generation).',
        '',
        'Add a Hugging Face or OpenAI key in Models → Cloud, or retry when the free image host is online.',
        '',
        local.reply,
      ].join('\n'),
    };
  }

  if (local) return local;

  queueHuntBootstrap({
    kind: 'image',
    reason: 'media',
    currentModelId: opts.preferredModelId,
  });

  return {
    reply: [
      'Image generation failed. No local image weights and the free image host did not return a real image.',
      'Open Local AI to install image weights, or add a Hugging Face / OpenAI key in Models → Cloud.',
    ].join(' '),
    modelName: 'NOVA Router',
    source: 'none',
    tier: 'no-key-free',
    attempted,
  };
}

async function routeVideo(opts: ArkRouteOpts): Promise<ArkRouterResult> {
  const attempted: string[] = [];
  const isAuto = isAutoRoute(opts);

  if (isAuto && opts.stickyModelId && opts.stickyPinnedSource) {
    const sticky = await tryStickyVideo(opts, attempted);
    if (sticky && sticky.source !== 'none') return sticky;
  }

  const modelId = opts.preferredModelId && opts.preferredModelId !== 'NOVA-auto'
    ? opts.preferredModelId
    : 'NOVA-video-core';
  attempted.push(modelId === 'NOVA-video-core' ? 'NOVA Video Core' : modelId);
  try {
    const result = await brainGenerate(opts.message, modelId, 'video', {
      mediaDurationSec: opts.mediaDurationSec,
    });
    const source = result.source || 'ark-media';
    const isMp4 = Boolean(
      result.media?.dataUrl?.startsWith('data:video/')
      || source.includes('mp4')
      || source.includes('huggingface-video'),
    );
    const isFallback = Boolean(
      result.source?.includes('motion-still')
      || result.source?.includes('fallback')
      || (!isMp4 && result.media?.dataUrl?.startsWith('data:image/svg')),
    );
    let reply = result.reply;
    if (isFallback && result.media?.dataUrl) {
      reply = [
        'Video preview · motion still (MP4 hosts were busy or need credits).',
        '',
        result.reply,
      ].join('\n');
      queueHuntBootstrap({
        kind: 'video',
        reason: 'media',
        currentModelId: modelId,
      });
    }
    return {
      reply,
      media: result.media,
      modelName: result.modelName || 'NOVA Video Core',
      modelId,
      source,
      tier: isMp4 ? 'no-key-free' : isFallback ? 'local-free' : (result.media?.real ? 'no-key-free' : 'local-free'),
      attempted,
    };
  } catch (err) {
    if (modelId !== 'NOVA-video-core') {
      try {
        attempted.push('NOVA Video Core');
        const retry = await brainGenerate(opts.message, 'NOVA-video-core', 'video', {
          mediaDurationSec: opts.mediaDurationSec,
        });
        if (retry?.media?.dataUrl) {
          return {
            reply: retry.reply,
            media: retry.media,
            modelName: retry.modelName || 'NOVA Video Core',
            modelId: 'NOVA-video-core',
            source: retry.source || 'ark-media',
            tier: retry.media.real ? 'no-key-free' : 'local-free',
            attempted,
          };
        }
      } catch {
        /* fall through */
      }
    }
    queueHuntBootstrap({
      kind: 'video',
      reason: 'media',
      currentModelId: modelId,
    });
    return {
      reply: [
        err instanceof Error ? err.message : 'Video generation failed',
        'Open Local AI to install video weights, or add a key in Models → Cloud.',
      ].join(' '),
      modelName: 'NOVA Video Core',
      source: 'none',
      tier: 'no-key-free',
      attempted,
    };
  }
}

/**
 * Single entry for Chat / Image / Video (and coding = chat path).
 * Views keep UX (progress stages); the router owns try/fallback + history.
 */
export async function arkRoute(opts: ArkRouteOpts): Promise<ArkRouterResult> {
  const kind = opts.kind === 'coding' ? 'chat' : opts.kind;
  if (kind === 'image') return routeImage(opts);
  if (kind === 'video') return routeVideo(opts);
  return routeChat(opts);
}

/** Short label for chat bubbles. keeps the provider quiet but honest. */
export function routerProviderLabel(result: ArkRouterResult, fallback: string) {
  if (result.source === 'none') return fallback;
  const hop = result.attempted.length > 1 ? ' · switched' : '';
  if (result.tier === 'free-key') return `Free · ${result.modelName}${hop}`;
  if (result.tier === 'no-key-free') return `Free · ${result.modelName}${hop}`;
  if (result.tier === 'local-free') return `Local · ${result.modelName}${hop}`;
  if (result.tier === 'optional') return `Optional · ${result.modelName}${hop}`;
  if (result.tier === 'paid') return `Cloud · ${result.modelName}${hop}`;
  return `${result.modelName || fallback}${hop}`;
}
