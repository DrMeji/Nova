/**
 * Sticky brain per thread — Auto picks once, stays equipped until failover.
 * Scoped by chat/project id + kind (chat, coding, image, video).
 */

import type { ChatMode } from '@/context/RouterContext';
import type { ArkRouterResult, RouterKind, RouterTier } from '@/lib/arkRouter';

export type ThreadBrainKind = 'chat' | 'coding' | 'image' | 'video';

export type ThreadBrainPinnedSource = 'local' | 'cloud' | 'optional';

export type ThreadBrain = {
  kind: ThreadBrainKind;
  modelId: string;
  modelName: string;
  pinnedSource: ThreadBrainPinnedSource;
  tier?: RouterTier;
};

export function brainKindForChatMode(mode: ChatMode): ThreadBrainKind {
  if (mode === 'code') return 'coding';
  if (mode === 'image') return 'image';
  if (mode === 'video') return 'video';
  return 'chat';
}

export function brainKindForRouterKind(kind: RouterKind): ThreadBrainKind {
  if (kind === 'coding') return 'coding';
  if (kind === 'image') return 'image';
  if (kind === 'video') return 'video';
  return 'chat';
}

export function threadBrainKey(scopeId: string, kind: ThreadBrainKind = 'chat') {
  return `ark:chat-thread:brain:${scopeId}:${kind}`;
}

function legacyThreadBrainKey(scopeId: string) {
  return `ark:chat-thread:brain:${scopeId}`;
}

export function loadThreadBrain(scopeId: string, kind: ThreadBrainKind = 'chat'): ThreadBrain | null {
  if (!scopeId) return null;
  try {
    const raw = localStorage.getItem(threadBrainKey(scopeId, kind));
    if (raw) {
      const parsed = JSON.parse(raw) as ThreadBrain;
      if (parsed?.modelId && parsed?.modelName && parsed?.pinnedSource) {
        return { ...parsed, kind: parsed.kind || kind };
      }
    }
    if (kind === 'chat' || kind === 'coding') {
      const legacy = localStorage.getItem(legacyThreadBrainKey(scopeId));
      if (legacy) {
        const parsed = JSON.parse(legacy) as ThreadBrain;
        if (parsed?.modelId && parsed?.modelName && parsed?.pinnedSource) {
          return { ...parsed, kind: parsed.kind || kind };
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function saveThreadBrain(scopeId: string, brain: ThreadBrain, kind?: ThreadBrainKind) {
  if (!scopeId) return;
  const k = kind || brain.kind || 'chat';
  try {
    localStorage.setItem(threadBrainKey(scopeId, k), JSON.stringify({ ...brain, kind: k }));
    if (k === 'chat' || k === 'coding') {
      localStorage.removeItem(legacyThreadBrainKey(scopeId));
    }
  } catch {
    /* ignore */
  }
}

export function clearThreadBrain(scopeId: string, kind?: ThreadBrainKind) {
  if (!scopeId) return;
  try {
    if (kind) {
      localStorage.removeItem(threadBrainKey(scopeId, kind));
      return;
    }
    for (const k of ['chat', 'coding', 'image', 'video'] as ThreadBrainKind[]) {
      localStorage.removeItem(threadBrainKey(scopeId, k));
    }
    localStorage.removeItem(legacyThreadBrainKey(scopeId));
  } catch {
    /* ignore */
  }
}

export function tierToPinnedSource(tier: RouterTier): ThreadBrainPinnedSource {
  if (tier === 'local-free' || tier === 'no-key-free') return 'local';
  if (tier === 'optional') return 'optional';
  return 'cloud';
}

export function threadBrainFromResult(
  result: ArkRouterResult,
  kind: ThreadBrainKind,
  prev?: ThreadBrain | null,
): ThreadBrain {
  return {
    kind,
    modelId: result.modelId || prev?.modelId || result.modelName,
    modelName: result.modelName,
    pinnedSource: tierToPinnedSource(result.tier),
    tier: result.tier,
  };
}

/** Pill label when ARK Auto has a sticky brain for this thread. */
export function autoPillLabel(brain: ThreadBrain | null): string {
  if (!brain?.modelName) return 'ARK';
  const short = brain.modelName
    .replace(/^Local · /i, '')
    .replace(/^Free · /i, '')
    .replace(/^Cloud · /i, '')
    .replace(/^Optional · /i, '')
    .replace(/ · switched$/i, '')
    .trim();
  const name = short.length > 22 ? `${short.slice(0, 20).trim()}…` : short;
  return name ? `ARK · ${name}` : 'ARK';
}

export function autoRingDetail(brain: ThreadBrain | null, kind?: ThreadBrainKind): string {
  if (!brain) {
    if (kind === 'image') return 'Picks best image path · stays on for this chat';
    if (kind === 'video') return 'Picks best video path · stays on for this chat';
    if (kind === 'coding') return 'Picks best coder · stays on for this chat';
    return 'Picks best brain · stays on for this chat';
  }
  if (brain.pinnedSource === 'local') return `Local · ${brain.modelName}`;
  if (brain.pinnedSource === 'optional') return `Optional · ${brain.modelName}`;
  return `Cloud · ${brain.modelName}`;
}

export function saveAutoThreadBrain(
  scopeId: string,
  kind: ThreadBrainKind,
  result: ArkRouterResult,
  prev: ThreadBrain | null,
  attemptedLen: number,
) {
  if (result.source === 'none') return prev;
  const shouldSave = !prev || attemptedLen > 1 || prev.modelId !== result.modelId;
  if (!shouldSave) return prev;
  const brain = threadBrainFromResult(result, kind, prev);
  saveThreadBrain(scopeId, brain, kind);
  return brain;
}
