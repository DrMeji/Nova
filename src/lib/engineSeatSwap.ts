/**
 * Sequential specialty seat swap — one GGUF at a time with rollback on failure.
 * Never concurrent multi-model load.
 */

import { MODEL_LOAD_CAP_MS } from '@/lib/createV2';
import {
  setEngineModel,
  getEngineStatus,
  syncEnginePerfPolicy,
  stopEngine,
} from '@/lib/novaEngine';

export type SeatSwapResult = {
  ok: boolean;
  id: string;
  restored?: boolean;
  error?: string;
};

/**
 * Bind a specialty seat (design / coder). On timeout or throw, leave engine alone
 * so the caller can fall back to the previous seat without a half-loaded server.
 */
export async function swapEngineSeat(
  modelId: string,
  opts?: { timeoutMs?: number; createInflight?: boolean },
): Promise<SeatSwapResult> {
  const id = String(modelId || '').trim();
  if (!id || id === 'NOVA-auto') {
    return { ok: false, id, error: 'no seat id' };
  }
  const timeoutMs = opts?.timeoutMs ?? MODEL_LOAD_CAP_MS;
  try {
    await syncEnginePerfPolicy({ createInflight: Boolean(opts?.createInflight) });
    // Already on this seat — skip reload (avoids VRAM thrash mid-create).
    try {
      const status = await getEngineStatus();
      if (String(status.activeModelId || '') === id) {
        return { ok: true, id };
      }
    } catch { /* continue to set */ }
    await Promise.race([
      Promise.resolve(setEngineModel(id)),
      new Promise((_, reject) => {
        window.setTimeout(() => reject(new Error(`seat-swap-timeout-${timeoutMs}`)), timeoutMs);
      }),
    ]);
    // Confirm ready + active when status is available.
    try {
      const status = await getEngineStatus();
      const hit = (status.models || []).find((m) => m.id === id);
      if (hit && hit.status && hit.status !== 'ready') {
        return { ok: false, id, error: `seat not ready (${hit.status})` };
      }
      const active = String(status.activeModelId || '');
      if (active && active !== id) {
        return { ok: false, id, error: `active still ${active}` };
      }
    } catch { /* status optional */ }
    return { ok: true, id };
  } catch (err) {
    return {
      ok: false,
      id,
      error: err instanceof Error ? err.message : 'seat swap failed',
    };
  }
}

/**
 * Run work on `seatId`, then restore `restoreId`. If seat swap fails, run on restoreId.
 */
export async function withEngineSeat<T>(opts: {
  seatId: string;
  restoreId: string;
  createInflight?: boolean;
  run: (activeId: string) => Promise<T>;
}): Promise<{ result: T; usedId: string; swapped: boolean }> {
  const seat = String(opts.seatId || '').trim();
  const restore = String(opts.restoreId || '').trim();
  let usedId = restore;
  let swapped = false;
  if (seat && seat !== restore) {
    const up = await swapEngineSeat(seat, { createInflight: opts.createInflight });
    if (up.ok) {
      usedId = seat;
      swapped = true;
    }
  }
  try {
    const result = await opts.run(usedId);
    return { result, usedId, swapped };
  } finally {
    if (swapped && restore && restore !== usedId) {
      const back = await swapEngineSeat(restore, { createInflight: opts.createInflight });
      if (!back.ok) {
        // Restore failed — unload specialty seat so VRAM is not stuck mid-swap.
        try { await syncEnginePerfPolicy({ createInflight: false }); } catch { /* ignore */ }
        try { await stopEngine(); } catch { /* ignore */ }
        // One more restore attempt after unload (fresh bind, ngl ladder applies).
        try {
          await swapEngineSeat(restore, { createInflight: false });
        } catch { /* leave unloaded; idle path will stay cold */ }
      }
    }
  }
}
