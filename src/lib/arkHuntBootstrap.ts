/**
 * Internet hunt lists GGUFs in Models / Local AI.
 * Auto-download only when the model currently in use runs out (rate limit / quota).
 */

import { getAccurateHardware } from '@/lib/api';
import { getEngineStatus } from '@/lib/arkEngine';
import {
  bestCodingHunt,
  huntModelsForPc,
  type HuntedModel,
} from '@/lib/arkModelHunt';
import { startEngineDownload, getEngineDownloadMap, isEngineDownloading } from '@/lib/engineDownloads';
import { getLocalPrefs } from '@/lib/localPrefs';

const AUTO_KEY = 'ark:runout-hunt-install';
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

/** Called when the live cloud/local path hits 429 / quota. Never on hunt alone. */
export async function installNextWhenCurrentRanOut(): Promise<HuntedModel | null> {
  const prefs = getLocalPrefs();
  if (!prefs.huntInternetModels || !prefs.autoInstallHuntModels) return null;

  const downloading = Object.keys(getEngineDownloadMap());
  if (downloading.some(id => id.startsWith('hunt-') || isEngineDownloading(id))) return null;

  const hw = await getAccurateHardware(true);
  const found = await huntModelsForPc(hw);
  if (!found.length) return null;

  let status;
  try {
    status = await getEngineStatus();
  } catch {
    return null;
  }
  const ready = new Set(
    (status.models || []).filter(m => m.status === 'ready').map(m => m.id),
  );
  const waiting = found.filter(m => !ready.has(m.id));
  const next = bestCodingHunt(waiting) || waiting[0] || null;
  if (!next || alreadyTried(next.id) || isEngineDownloading(next.id)) return null;

  markTried(next.id);
  await startEngineDownload({
    id: next.id,
    name: next.name,
    source: 'models',
    hunt: {
      url: next.url,
      sizeGb: next.sizeGb,
      detail: next.detail,
      category: next.category,
    },
  });
  return next;
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
