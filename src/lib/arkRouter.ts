/**
 * ARK Router — ARK-owned free-first routing for chat / image / video.
 *
 * Not a localhost proxy for other IDEs. This is the in-app path picker:
 *   local Engine → optional Ollama → free-key clouds → paid keys
 * with silent fallback when a hop fails or rate-limits.
 *
 * Chat memory is ARK-owned: history travels with every hop so a new
 * provider continues mid-task instead of greeting like a fresh chat.
 */

import {
  packHistoryPrompt,
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
import { cloudGenerateImage } from '@/lib/cloudMedia';
import { getLocalPrefs, type AiModePref } from '@/lib/localPrefs';
import {
  isOllamaEnabled,
  ollamaChat,
  probeOllamaOptional,
} from '@/lib/ollamaOptional';
import { getEngineStatus } from '@/lib/arkEngine';

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
  /** Engine / catalog id when known — for chips only; never hijack the picker. */
  modelId?: string;
  source: string;
  tier: RouterTier;
  attempted: string[];
  /** True when prior turns were sent so the model can continue mid-task. */
  continued?: boolean;
};

export type ArkRouteOpts = {
  message: string;
  kind: RouterKind;
  preferredModelId?: string;
  preferredModelName?: string;
  preferredSource?: 'local' | 'cloud' | 'auto';
  /** Prior + current user turns owned by ARK (not the provider). */
  history?: RouterChatTurn[];
  /** When set, local GGUF tokens stream into this callback. */
  onChunk?: (text: string) => void;
};

function modeAllowsCloud(mode: AiModePref) {
  return mode !== 'local_only';
}

function modePrefersCloud(mode: AiModePref) {
  return mode === 'cloud_when_available' || mode === 'local_fallback';
}

function isStrongLocal(source?: string) {
  return source === 'ark-gguf' || source === 'ark-media';
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
): Promise<ArkRouterResult | null> {
  const runOne = async (id: string | undefined): Promise<ArkRouterResult | null> => {
    attempted.push(id ? `ARK Engine · ${id}` : 'ARK Engine');
    try {
      const brain = await probeBrain();
      if (!brain.ok && !window.arkDesktop?.engineGenerate) {
        return null;
      }
      const prompt = packHistoryPrompt(history, message);
      const result = onChunk
        ? await brainGenerateStream(prompt, id, onChunk, 'chat')
        : await brainGenerate(prompt, id, 'chat');
      return {
        reply: result.reply,
        media: result.media,
        modelName: result.modelName || 'ARK Engine',
        modelId: id || result.modelName,
        source: result.source || 'ark-engine',
        tier: 'local-free',
        attempted,
        continued: hasContinuity(history),
      };
    } catch {
      return null;
    }
  };

  const first = await runOne(modelId);
  if (first && isStrongLocal(first.source)) return first;

  if (!failover) return null;

  try {
    const status = await getEngineStatus();
    const ready = status.models.filter(m =>
      m.status === 'ready'
      && m.id !== modelId
      && m.id !== 'ark-core'
      && m.id !== 'ark-image-core'
      && m.id !== 'ark-video-core',
    );
    for (const m of ready) {
      const hit = await runOne(m.id);
      if (hit && isStrongLocal(hit.source)) return hit;
    }
  } catch {
    /* ignore */
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
    const packed = packHistoryPrompt(history, message);
    const reply = await ollamaChat(model, history, packed);
    return {
      reply,
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

async function routeChat(opts: ArkRouteOpts): Promise<ArkRouterResult> {
  const prefs = getLocalPrefs();
  const mode = prefs.aiMode;
  const failover = prefs.autoFailover;
  const attempted: string[] = [];
  const preferredId = opts.preferredModelId;
  const preferredName = opts.preferredModelName || preferredId || '';
  const isAuto =
    preferredId === 'ark-auto'
    || opts.preferredSource === 'auto';
  const pinnedCloud = opts.preferredSource === 'cloud' && !isAuto;
  const pinnedOllama = Boolean(preferredId?.startsWith('ollama:')) && !isAuto;
  const pinnedLocalEngine =
    !isAuto
    && !pinnedCloud
    && !pinnedOllama
    && Boolean(preferredId)
    && preferredId !== 'ark-auto'
    && opts.preferredSource === 'local';
  const history = historyFor(opts);

  // ── Pinned cloud model (skipped for ARK Auto) ──────────────────────
  if (pinnedCloud && modeAllowsCloud(mode) && !isAuto) {
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
        source: hit.provider.toLowerCase().replace(/\s+/g, '-'),
        tier: hit.cost,
        attempted,
      }, history);
    }
    if (!failover) {
      return {
        reply: 'Cloud request failed. Add a matching API key in Models → Cloud, or enable Auto failover in Settings.',
        modelName: preferredName || 'Cloud',
        source: 'none',
        tier: 'paid',
        attempted,
      };
    }
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

  // ── Pinned ARK Engine GGUF ─────────────────────────────────────────
  if (pinnedLocalEngine) {
    const localPinned = await tryLocalChat(
      history,
      opts.message,
      preferredId,
      attempted,
      opts.onChunk,
      failover,
    );
    if (localPinned && isStrongLocal(localPinned.source)) return localPinned;
    if (!failover) {
      return {
        reply: 'That local brain isn’t ready. Install it from Local AI / Models, or enable Auto failover in Settings.',
        modelName: preferredName || 'ARK Engine',
        source: 'none',
        tier: 'local-free',
        attempted,
      };
    }
  }

  // ── Cloud-preferring modes ─────────────────────────────────────────
  if (modePrefersCloud(mode) && modeAllowsCloud(mode) && hasAnyCloudChatKey()) {
    const free = await cloudChatFreeKeys(opts.message, attempted, history, opts.onChunk);
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

  // ── Local (GGUF / Engine) ─────────────────────────────────────────
  const local = await tryLocalChat(
    history,
    opts.message,
    isAuto || pinnedCloud || pinnedOllama || pinnedLocalEngine ? undefined : preferredId,
    attempted,
    opts.onChunk,
    failover,
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
        'Install a GGUF model into ARK Engine (Local AI / Models), or enable optional Ollama.',
        'ARK Core’s template replies are not a live model — they won’t answer like ChatGPT.',
      ].join('\n'),
      modelName: 'ARK Engine',
      source: 'none',
      tier: 'local-free',
      attempted,
    };
  }

  // ── Optional Ollama ───────────────────────────────────────────────
  const ollama = await tryOllama(history, opts.message, preferredId, attempted);
  if (ollama) return ollama;

  // ── Free-key → paid (automatic / after soft local) ─────────────────
  if (modeAllowsCloud(mode)) {
    const free = await cloudChatFreeKeys(opts.message, attempted, history, opts.onChunk);
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

  // Never return ARK Core template as a finished answer — be honest.
  return {
    reply: honestNoLiveChatReply(),
    modelName: 'ARK Auto',
    source: 'none',
    tier: 'local-free',
    attempted,
  };
}

function hitSource(provider: string) {
  return provider.toLowerCase().replace(/\s+/g, '-');
}

async function routeImage(opts: ArkRouteOpts): Promise<ArkRouterResult> {
  const prefs = getLocalPrefs();
  const mode = prefs.aiMode;
  const failover = prefs.autoFailover;
  const attempted: string[] = [];
  const wantsCloud =
    opts.preferredSource === 'cloud'
    || Boolean(opts.preferredModelId?.includes('dall'))
    || Boolean(opts.preferredModelId?.includes('hf-flux'))
    || Boolean(opts.preferredModelId?.includes('flux'))
    || modePrefersCloud(mode);

  const tryCloud = async (): Promise<ArkRouterResult | null> => {
    if (!modeAllowsCloud(mode)) return null;
    attempted.push('Cloud image (HF / OpenAI)');
    try {
      const cloud = await cloudGenerateImage(opts.message);
      if (!cloud?.dataUrl && !cloud?.url) return null;
      const dataUrl = cloud.dataUrl || cloud.url || '';
      const libraryId = `cloud-${Date.now()}`;
      return {
        reply: cloud.reply,
        media: {
          kind: 'image',
          dataUrl,
          libraryId,
          real: true,
        },
        modelName: cloud.provider,
        source: hitSource(cloud.provider),
        tier: cloud.tier === 'free-key' ? 'free-key' : 'paid',
        attempted,
      };
    } catch {
      return null;
    }
  };

  const tryLocalMedia = async (): Promise<ArkRouterResult | null> => {
    attempted.push('ARK Image Core');
    try {
      const result = await brainGenerate(opts.message, opts.preferredModelId || 'ark-image-core', 'image');
      if (!result.media?.dataUrl) {
        return {
          reply: result.reply,
          modelName: result.modelName || 'ARK Image Core',
          source: result.source || 'ark-media',
          tier: 'no-key-free',
          attempted,
        };
      }
      return {
        reply: result.reply,
        media: result.media,
        modelName: result.modelName || 'ARK Image Core',
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
        reply: 'Cloud image failed. Add a Hugging Face or OpenAI key in Models → Cloud, or switch to ARK Image Core.',
        modelName: opts.preferredModelName || 'Cloud image',
        source: 'none',
        tier: 'paid',
        attempted,
      };
    }
  }

  const local = await tryLocalMedia();
  // Prefer real cloud images over local SVG fallback when failover is on.
  if (local?.media?.dataUrl && local.media.real) return local;

  if ((!wantsCloud || !local?.media?.real) && failover && modeAllowsCloud(mode)) {
    const cloud = await tryCloud();
    if (cloud) return cloud;
  }

  if (local?.media?.dataUrl && local.media.real) return local;

  // Last resort: labeled preview only — never treat SVG fallback as finished art.
  if (local?.media?.dataUrl && !local.media.real) {
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

  return {
    reply: 'Image generation failed. Check ARK Engine / network, or add a Hugging Face / OpenAI key.',
    modelName: 'ARK Router',
    source: 'none',
    tier: 'no-key-free',
    attempted,
  };
}

async function routeVideo(opts: ArkRouteOpts): Promise<ArkRouterResult> {
  const attempted: string[] = [];
  attempted.push('ARK Video Core');
  try {
    const result = await brainGenerate(opts.message, opts.preferredModelId || 'ark-video-core', 'video');
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
    }
    return {
      reply,
      media: result.media,
      modelName: result.modelName || 'ARK Video Core',
      source,
      tier: isMp4 ? 'no-key-free' : isFallback ? 'local-free' : (result.media?.real ? 'no-key-free' : 'local-free'),
      attempted,
    };
  } catch (err) {
    return {
      reply: err instanceof Error ? err.message : 'Video generation failed',
      modelName: 'ARK Video Core',
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

/** Short label for chat bubbles — keeps the provider quiet but honest. */
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
