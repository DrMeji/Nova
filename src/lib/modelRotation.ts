/**
 * Seamless brain rotation: real context pressure + speed-aware preload.
 * Fast links wait (~90–95%); slow links start the next GGUF early.
 * Hot-swap on the following turn with history. No new screens. Never requires Ollama.
 */

import { getAccurateHardware, parseRamGb } from '@/lib/api';
import { getEngineStatus } from '@/lib/arkEngine';
import {
  compressHistoryIfNeeded,
  flattenHistoryText,
  type RouterChatTurn,
} from '@/lib/chatHistory';
import { isEngineDownloading, startEngineDownload } from '@/lib/engineDownloads';
import { pickNextBackupId, pickSuccessorReadyId } from '@/lib/enginePick';
import {
  saveThreadBrain,
  type ThreadBrain,
  type ThreadBrainKind,
} from '@/lib/threadBrain';
import { loadSavedSpeed, preloadStartRatio, runSpeedTest, saveSpeedSample } from '@/lib/speedTest';
import {
  estimateTokens,
  getTokenUsageRatio,
  resetTokenUsage,
  syncTokenUsage,
  getUsableTokens,
} from '@/lib/tokenUsage';
import { resetModelHealth } from '@/lib/modelHealth';

export type RotationKind = 'chat' | 'coding' | 'image' | 'video';

export const ROTATION_NOTE_EVENT = 'ark-rotation-note';

function kindToEngine(kind: ThreadBrainKind): RotationKind {
  if (kind === 'coding' || kind === 'image' || kind === 'video') return kind;
  return 'chat';
}

function engineRowName(models: { id?: string; name?: string }[], id: string) {
  return models.find(m => m.id === id)?.name || id;
}

function engineRowSize(models: { id?: string; sizeGb?: number }[], id: string) {
  const n = models.find(m => m.id === id)?.sizeGb;
  return typeof n === 'number' && n > 0 ? n : 4.7;
}

export function measureThreadPressure(history: RouterChatTurn[]): number {
  const tokens = estimateTokens(flattenHistoryText(history));
  return Math.max(0, Math.min(1, tokens / getUsableTokens()));
}

let lastRotationNote = '';
export function emitRotationNote(message: string) {
  if (!message || message === lastRotationNote) return;
  lastRotationNote = message;
  try {
    window.dispatchEvent(new CustomEvent(ROTATION_NOTE_EVENT, { detail: { message } }));
  } catch {
    /* ignore */
  }
}

let speedProbeStarted = false;
function ensureSpeedSample() {
  if (speedProbeStarted) return;
  if (loadSavedSpeed()) return;
  speedProbeStarted = true;
  void runSpeedTest()
    .then(sample => saveSpeedSample(sample))
    .catch(() => {
      speedProbeStarted = false;
    });
}

async function warmIfPossible(id: string) {
  try {
    await window.arkDesktop?.engineSetModel?.(id);
  } catch {
    /* not ready yet */
  }
}

function withPending(
  brain: ThreadBrain | null,
  opts: { kind: ThreadBrainKind; currentId?: string; currentName?: string },
  pendingId: string,
  pendingName: string,
): ThreadBrain | null {
  if (brain) return { ...brain, pendingModelId: pendingId, pendingModelName: pendingName };
  if (!opts.currentId) return null;
  return {
    kind: opts.kind,
    modelId: opts.currentId,
    modelName: opts.currentName || opts.currentId,
    pinnedSource: 'local',
    tier: 'local-free',
    pendingModelId: pendingId,
    pendingModelName: pendingName,
  };
}

/**
 * Call at the start of a generate. Applies a pending swap if the next GGUF
 * is ready; otherwise may enqueue a background download. Always returns
 * history (possibly compressed). never an empty thread.
 */
export async function prepareBrainRotation(opts: {
  scopeId: string;
  kind: ThreadBrainKind;
  history: RouterChatTurn[];
  currentModelId?: string;
  brain: ThreadBrain | null;
}): Promise<{
  brain: ThreadBrain | null;
  history: RouterChatTurn[];
  swapped: boolean;
  pressure: number;
  threshold: number;
}> {
  ensureSpeedSample();
  const history = compressHistoryIfNeeded(opts.history);
  let brain = opts.brain;
  let swapped = false;
  const engineKind = kindToEngine(opts.kind);
  const currentId = brain?.modelId || opts.currentModelId;

  let pressure = 0;
  if (brain?.freshBudget) {
    pressure = getTokenUsageRatio(opts.scopeId);
  } else {
    syncTokenUsage(opts.scopeId, estimateTokens(flattenHistoryText(opts.history)));
    pressure = measureThreadPressure(opts.history);
  }

  let threshold = preloadStartRatio();

  try {
    const [status, hw] = await Promise.all([
      getEngineStatus().catch(() => null),
      getAccurateHardware(false).catch(() => null),
    ]);
    const models = status?.models || [];
    const ramGb = hw ? parseRamGb(hw) : 8;
    const ready = new Set(
      models.filter(m => m.status === 'ready' && m.id).map(m => String(m.id)),
    );

    const pendingId = brain?.pendingModelId;
    if (pendingId && ready.has(pendingId) && pendingId !== currentId) {
      brain = {
        kind: opts.kind,
        modelId: pendingId,
        modelName: brain?.pendingModelName || engineRowName(models, pendingId),
        pinnedSource: brain?.pinnedSource || 'local',
        tier: brain?.tier || 'local-free',
        freshBudget: true,
      };
      saveThreadBrain(opts.scopeId, brain, opts.kind);
      resetTokenUsage(opts.scopeId);
      resetModelHealth(opts.scopeId);
      pressure = 0;
      swapped = true;
      void warmIfPossible(pendingId);
    } else if (
      pendingId
      && !ready.has(pendingId)
      && !isEngineDownloading(pendingId)
      && !models.some(m => m.id === pendingId && m.status === 'downloading')
    ) {
      void startEngineDownload({
        id: pendingId,
        name: `Next brain · ${brain?.pendingModelName || engineRowName(models, pendingId)}`,
        source: 'local-ai',
        forceUnknownDisk: true,
      }).catch(() => undefined);
    } else if (!pendingId && !swapped) {
      const successorReady = pickSuccessorReadyId(models, engineKind, ramGb, currentId);
      const backupId = successorReady ? undefined : pickNextBackupId(models, engineKind, ramGb, currentId);
      const nextId = successorReady || backupId;
      const nextMeta = nextId
        ? { name: engineRowName(models, nextId), sizeGb: engineRowSize(models, nextId) }
        : { name: 'Next local brain', sizeGb: 4.7 };
      threshold = preloadStartRatio(nextMeta);

      if (pressure >= threshold) {
        if (successorReady) {
          brain = withPending(
            brain,
            { kind: opts.kind, currentId, currentName: engineRowName(models, currentId || '') },
            successorReady,
            nextMeta.name,
          );
          if (brain) saveThreadBrain(opts.scopeId, brain, opts.kind);
          void warmIfPossible(successorReady);
        } else if (backupId) {
          brain = withPending(
            brain,
            { kind: opts.kind, currentId, currentName: engineRowName(models, currentId || '') },
            backupId,
            nextMeta.name,
          );
          if (brain) saveThreadBrain(opts.scopeId, brain, opts.kind);
          void startEngineDownload({
            id: backupId,
            name: `Next brain · ${nextMeta.name}`,
            source: 'local-ai',
            forceUnknownDisk: true,
          }).catch(() => undefined);
        } else {
          emitRotationNote('No second on-device brain fits this PC. Auto can use a free cloud path if a key is saved.');
        }
      }
    }
  } catch {
    /* rotation is best-effort. never block the user's message */
  }

  return { brain, history, swapped, pressure, threshold };
}
