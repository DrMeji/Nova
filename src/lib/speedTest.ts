/** Network speed helpers for proactive model preload planning. */

export type HostSpeed = {
  id: string;
  name: string;
  ok: boolean;
  MBps: number;
  rttMs?: number;
  error?: string;
};

export type SpeedSample = {
  /** Download throughput in megabytes per second */
  MBps: number;
  /** Upload throughput when measured */
  upMBps?: number;
  source: 'measured' | 'huggingface' | 'browser' | 'estimate' | 'multi';
  preferredHost?: string;
  preferredHostName?: string;
  hosts?: HostSpeed[];
  samples?: number;
};

export type PreloadPlan = {
  nextModelName: string;
  nextModelSizeGb: number;
  downloadSeconds: number;
  /** Session progress % when NOVA should begin downloading the next model */
  startAtPercent: number;
  rating: 'slow' | 'ok' | 'fast';
  ratingLabel: string;
  summary: string;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'n/a';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

/** Compact label under assistant bubbles (e.g. "2.4 s", "1m 12s"). */
export function formatReplyElapsed(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return '';
  if (ms < 1000) return `${Math.max(1, Math.round(ms))} ms`;
  const s = ms / 1000;
  if (s < 60) return s < 10 ? `${s.toFixed(1)} s` : `${Math.round(s)} s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

export function formatMBps(MBps: number) {
  if (!Number.isFinite(MBps) || MBps <= 0) return 'n/a';
  const mbpsBits = MBps * 8;
  const mbLabel =
    MBps < 0.1
      ? `${(MBps * 1024).toFixed(0)} KB/s`
      : MBps < 10
        ? `${MBps.toFixed(1)} MB/s`
        : `${MBps.toFixed(0)} MB/s`;
  if (mbpsBits >= 10) {
    return `${mbLabel} (~${mbpsBits >= 100 ? Math.round(mbpsBits) : mbpsBits.toFixed(0)} Mbps)`;
  }
  return mbLabel;
}

const SPEED_STORE_KEY = 'NOVA:network-speed';

export type SavedSpeed = SpeedSample & {
  at: number;
  startAtPercent: number;
};

export function loadSavedSpeed(): SavedSpeed | null {
  try {
    const raw = localStorage.getItem(SPEED_STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedSpeed;
    if (!parsed || !(parsed.MBps > 0)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSpeedSample(sample: SpeedSample, plan?: PreloadPlan) {
  try {
    const payload: SavedSpeed = {
      ...sample,
      at: Date.now(),
      startAtPercent: plan?.startAtPercent ?? computePreloadPlan(sample.MBps).startAtPercent,
    };
    localStorage.setItem(SPEED_STORE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

/**
 * Session usage 0–1 when the next GGUF should start downloading.
 * Uses saved speed in **MBps (megabytes/s)**, not megabits. 100 Mbps ≈ 12.5 MBps.
 * No sample → middle-band default (`computePreloadPlan(8)`). Fast links ~90–95%; slow links much earlier.
 * Pass `nextModel.sizeGb` so a 14B on a slow link starts earlier than a 1.5B.
 */
export function preloadStartRatio(nextModel?: { name: string; sizeGb: number }): number {
  const saved = loadSavedSpeed();
  const MBps = saved && saved.MBps > 0 ? saved.MBps : 8;
  return computePreloadPlan(MBps, nextModel).startAtPercent / 100;
}

/**
 * Plan when to start downloading the next model so it is ready before a switch.
 * Slow Wi-Fi starts around 20–40% usage. Fast links wait until 90–95%.
 */
export function computePreloadPlan(
  MBps: number,
  nextModel?: { name: string; sizeGb: number },
  opts?: { sessionMinutes?: number; bufferMinutes?: number; readyByPercent?: number },
): PreloadPlan {
  const model = nextModel || { name: 'Next local brain', sizeGb: 4.7 };
  const sessionMinutes = opts?.sessionMinutes ?? 45;
  const bufferMinutes = opts?.bufferMinutes ?? 3;
  const readyByPercent = opts?.readyByPercent ?? 95;

  const sizeMb = model.sizeGb * 1024;
  const downloadSeconds = MBps > 0 ? (sizeMb / MBps) : Infinity;
  const downloadMinutes = downloadSeconds / 60;
  const downloadShare = downloadMinutes / sessionMinutes;
  const bufferShare = bufferMinutes / sessionMinutes;

  let startAtPercent = Math.round(readyByPercent - (downloadShare + bufferShare) * 100);

  if (MBps >= 25) {
    startAtPercent = Math.max(startAtPercent, 90);
    startAtPercent = Math.min(startAtPercent, 95);
  } else if (MBps >= 12) {
    startAtPercent = clamp(startAtPercent, 70, 88);
  } else if (MBps >= 5) {
    startAtPercent = clamp(startAtPercent, 40, 70);
  } else {
    startAtPercent = clamp(startAtPercent, 15, 40);
  }

  startAtPercent = clamp(startAtPercent, 15, 95);

  let rating: PreloadPlan['rating'] = 'ok';
  let ratingLabel = 'Okay';
  if (MBps < 5 || startAtPercent <= 40) {
    rating = 'slow';
    ratingLabel = 'Slow, preload early';
  } else if (MBps >= 25 && startAtPercent >= 90) {
    rating = 'fast';
    ratingLabel = 'Fast, late preload is fine';
  }

  const summary =
    rating === 'slow'
      ? `Connection is limited. NOVA should start the next model around ${startAtPercent}% usage so it is ready before a switch.`
      : rating === 'fast'
        ? `Connection is strong. NOVA can wait until about ${startAtPercent}% usage before preloading the next model.`
        : `NOVA should begin preloading around ${startAtPercent}% usage so the next model is ready when you need it.`;

  return {
    nextModelName: model.name,
    nextModelSizeGb: model.sizeGb,
    downloadSeconds,
    startAtPercent,
    rating,
    ratingLabel,
    summary,
  };
}

/** Best-effort speed sample from Hugging Face (same CDN as GGUF installs). */
export async function runSpeedTest(): Promise<SpeedSample> {
  try {
    const desktop = await window.arkDesktop?.speedTest?.();
    if (desktop?.ok && (desktop.MBps > 0 || (desktop.downMBps ?? 0) > 0)) {
      const down = desktop.downMBps ?? desktop.MBps;
      const hosts = Array.isArray(desktop.hosts) ? desktop.hosts : undefined;
      return {
        MBps: down,
        upMBps: desktop.upMBps,
        source: desktop.source === 'multi' || hosts?.length ? 'multi' : desktop.source === 'huggingface' ? 'huggingface' : 'measured',
        preferredHost: desktop.preferredHost || desktop.host,
        preferredHostName: desktop.preferredHostName,
        hosts,
        samples: desktop.samples,
      };
    }
  } catch {
    /* fall through */
  }

  const conn = (navigator as Navigator & { connection?: { downlink?: number } }).connection;
  if (conn?.downlink && conn.downlink > 0) {
    return { MBps: conn.downlink / 8, source: 'browser' };
  }
  return { MBps: 8, source: 'estimate' };
}
