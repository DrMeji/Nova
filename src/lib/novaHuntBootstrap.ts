/**
 * Internet hunt lists GGUFs in Models / Local AI.
 * Auto-download the next fitting brain when the current path runs out
 * (quota, timeout, context budget, or image/video host failure).
 */

import { getAccurateHardware, isEngineDownloadable, parseRamGb } from '@/lib/api';
import { getEngineStatus } from '@/lib/novaEngine';
import {
  bestCodingHunt,
  huntModelsForPc,
  type HuntedModel,
} from '@/lib/novaModelHunt';
import { pickNextBackupId } from '@/lib/enginePick';
import { startEngineDownload, getEngineDownloadMap, isEngineDownloading } from '@/lib/engineDownloads';
import { getLocalPrefs } from '@/lib/localPrefs';

export const BACKUP_DOWNLOAD_EVENT = 'ark-backup-download';

export type RunOutKind = 'chat' | 'coding' | 'image' | 'video';
export type RunOutReason = 'quota' | 'timeout' | 'empty' | 'context' | 'media';

const AUTO_KEY = 'NOVA:runout-hunt-install';
const RETRY_MS = 6 * 60 * 60 * 1000;

function alreadyTried(id: string) {
  try {
    const raw = localStorage.getItem(AUTO_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { id?: string; at?: number };
    if (parsed.id !== id || !parsed.at) return false;
    return Date.now() - parsed.at < RETRY_MS;
  } catch {
    return false;
  }
}

function markTried(id: string) {
  try {
    localStorage.setItem(AUTO_KEY, JSON.stringify({ id, at: Date.now() }));
  } catch {
    /* ignore */
  }
}

function busyDownloadingTextBrain() {
  const downloading = Object.keys(getEngineDownloadMap());
  return downloading.some(id => {
    if (!isEngineDownloading(id)) return false;
    return !/image|video|^sd|flux/i.test(id);
  });
}

function emitBackup(id: string, name: string, kind: RunOutKind, reason: RunOutReason) {
  try {
    window.dispatchEvent(new CustomEvent(BACKUP_DOWNLOAD_EVENT, {
      detail: { id, name, kind, reason },
    }));
  } catch {
    /* ignore */
  }
}

async function startCatalogBackup(
  id: string,
  name: string,
  kind: RunOutKind,
  reason: RunOutReason,
) {
  if (alreadyTried(id) || isEngineDownloading(id)) return null;
  markTried(id);
  await startEngineDownload({
    id,
    name: reason === 'context' ? `Next brain · ${name}` : name,
    source: 'local-ai',
    forceUnknownDisk: true,
  });
  emitBackup(id, name, kind, reason);
  return { id, name };
}

/** Called when the live cloud/local/media path hits a limit. Never on hunt alone. */
export async function installNextWhenCurrentRanOut(opts?: {
  kind?: RunOutKind;
  reason?: RunOutReason;
  currentModelId?: string;
  /** Catalog successor for context rotation. do not require hunt toggles. */
  ignoreHuntPrefs?: boolean;
}): Promise<{ id: string; name: string } | null> {
  const prefs = getLocalPrefs();
  const kind = opts?.kind || 'chat';
  const reason = opts?.reason || 'quota';
  const rotation = opts?.ignoreHuntPrefs || reason === 'context';
  const allowCatalog = rotation || prefs.autoInstallHuntModels;
  const allowHunt = prefs.huntInternetModels && prefs.autoInstallHuntModels;
  if (!allowCatalog && !allowHunt) return null;
  if (busyDownloadingTextBrain()) return null;

  const hw = await getAccurateHardware(true);
  const ramGb = parseRamGb(hw);

  let status;
  try {
    status = await getEngineStatus();
  } catch {
    return null;
  }

  const catalogId = pickNextBackupId(status.models, kind, ramGb, opts?.currentModelId);
  if (catalogId && isEngineDownloadable(catalogId)) {
    const row = status.models.find(m => m.id === catalogId);
    const started = await startCatalogBackup(
      catalogId,
      row?.name || catalogId,
      kind,
      reason,
    );
    if (started) return started;
  }

  if (kind === 'image' || kind === 'video') return null;
  if (!allowHunt) return null;

  const found = await huntModelsForPc(hw);
  if (!found.length) return null;

  const ready = new Set(
    (status.models || []).filter(m => m.status === 'ready').map(m => m.id),
  );
  const waiting = found.filter(m => !ready.has(m.id));
  const next: HuntedModel | null =
    (kind === 'coding' ? bestCodingHunt(waiting) : waiting[0]) || waiting[0] || null;
  if (!next || alreadyTried(next.id) || isEngineDownloading(next.id)) return null;

  markTried(next.id);
  await startEngineDownload({
    id: next.id,
    name: next.name,
    source: 'models',
    forceUnknownDisk: true,
    hunt: {
      url: next.url,
      sizeGb: next.sizeGb,
      detail: next.detail,
      category: next.category,
    },
  });
  emitBackup(next.id, next.name, kind, reason);
  return { id: next.id, name: next.name };
}

/** Hunt + cache only. Does not download. */
export function startModelHuntCycle() {
  const run = () => {
    if (!getLocalPrefs().huntInternetModels) return;
    void (async () => {
      try {
        const hw = await getAccurateHardware(true);
        await huntModelsForPc(hw);
      } catch {
        /* hunt is best-effort */
      }
    })();
  };
  run();
  const timer = window.setInterval(run, 6 * 60 * 60 * 1000);
  return () => window.clearInterval(timer);
}
