/** Network speed helpers for proactive model preload planning. */

export type SpeedSample = {
  /** Download throughput in megabytes per second */
  MBps: number;
  source: 'measured' | 'browser' | 'estimate';
};

export type PreloadPlan = {
  nextModelName: string;
  nextModelSizeGb: number;
  downloadSeconds: number;
  /** Session progress % when ARK should begin downloading the next model */
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

/**
 * Plan when to start downloading the next model so it finishes
 * before the user needs to switch (with a safety buffer).
 *
 * Slower links → start much earlier (e.g. ~20% usage).
 * Faster links → can wait longer (e.g. ~70%+ usage).
 */
export function computePreloadPlan(
  MBps: number,
  nextModel: { name: string; sizeGb: number },
  opts?: { sessionMinutes?: number; bufferMinutes?: number; readyByPercent?: number },
): PreloadPlan {
  const sessionMinutes = opts?.sessionMinutes ?? 45;
  const bufferMinutes = opts?.bufferMinutes ?? 4;
  const readyByPercent = opts?.readyByPercent ?? 90;

  const sizeMb = nextModel.sizeGb * 1024;
  const downloadSeconds = MBps > 0 ? (sizeMb / MBps) : Infinity;
  const downloadMinutes = downloadSeconds / 60;

  // Fraction of a typical session the download will consume
  const downloadShare = downloadMinutes / sessionMinutes;
  const bufferShare = bufferMinutes / sessionMinutes;

  // Start early enough that download + buffer finish by readyByPercent
  const startAtPercent = clamp(
    Math.round(readyByPercent - (downloadShare + bufferShare) * 100),
    5,
    85,
  );

  let rating: PreloadPlan['rating'] = 'ok';
  let ratingLabel = 'Okay';
  if (MBps < 5 || startAtPercent <= 25) {
    rating = 'slow';
    ratingLabel = 'Slow, preload early';
  } else if (MBps >= 25 && startAtPercent >= 55) {
    rating = 'fast';
    ratingLabel = 'Fast, late preload is fine';
  }

  const summary =
    rating === 'slow'
      ? `Connection is limited. ARK should start the next model around ${startAtPercent}% usage so it is ready before a switch.`
      : rating === 'fast'
        ? `Connection is strong. ARK can wait until about ${startAtPercent}% usage before preloading the next model.`
        : `ARK should begin preloading around ${startAtPercent}% usage so the next model is ready when you need it.`;

  return {
    nextModelName: nextModel.name,
    nextModelSizeGb: nextModel.sizeGb,
    downloadSeconds,
    startAtPercent,
    rating,
    ratingLabel,
    summary,
  };
}

/** Best-effort download speed sample. Desktop uses a 25 MB Cloudflare probe in main. */
export async function runSpeedTest(): Promise<SpeedSample> {
  try {
    const desktop = await window.arkDesktop?.speedTest?.();
    if (desktop?.ok && desktop.MBps > 0) {
      return { MBps: desktop.MBps, source: 'measured' };
    }
  } catch {
    /* fall through to browser probe */
  }

  try {
    const bytes = 10_000_000;
    const url = `https://speed.cloudflare.com/__down?bytes=${bytes}&measId=${Date.now()}`;
    const t0 = performance.now();
    const res = await fetch(url, { cache: 'no-store', mode: 'cors' });
    if (!res.ok) throw new Error('speed fetch failed');
    await res.arrayBuffer();
    const seconds = Math.max((performance.now() - t0) / 1000, 0.05);
    const MBps = bytes / (1024 * 1024) / seconds;
    return { MBps, source: 'measured' };
  } catch {
    const conn = (navigator as Navigator & { connection?: { downlink?: number } }).connection;
    if (conn?.downlink && conn.downlink > 0) {
      // downlink is megabits/sec → megabytes/sec
      return { MBps: conn.downlink / 8, source: 'browser' };
    }
    return { MBps: 8, source: 'estimate' };
  }
}
