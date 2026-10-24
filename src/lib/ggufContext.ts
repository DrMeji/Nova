/**
 * Local GGUF context size scaled to this PC’s RAM.
 * More RAM → longer chat history before compression / rotation.
 * Capped so KV-cache doesn’t eat the machine (OS + model weights still need room).
 */

import { loadHardwareSnapshot, parseRamGb } from '@/lib/api';
import { getLocalPrefs } from '@/lib/localPrefs';

/** Leave room for the next reply (chat nPredict default is 4096). */
export const REPLY_RESERVE = 4096;

/** Absolute ceiling — beyond this, latency and OOM risk climb fast on consumer PCs. */
export const GGUF_CTX_MAX = 65536;
export const GGUF_CTX_MIN = 8192;

/** Create / share-GPU ceilings — keep in sync with electron/novaGguf.cjs. */
export const GGUF_CTX_CREATE_CAP = 16384;
export const GGUF_CTX_SHARE_GPU_CAP = 12288;

/**
 * Pick a llama.cpp `-c` size from installed system RAM (GB).
 * Same table as electron/novaGguf.cjs — keep them in sync.
 */
export function resolveGgufCtx(
  ramGb: number,
  opts?: { shareGpu?: boolean; createInflight?: boolean },
): number {
  const ram = Number(ramGb);
  const g = Number.isFinite(ram) && ram > 0 ? ram : 8;
  let ctx = GGUF_CTX_MAX;
  if (g < 8) ctx = 8192;
  else if (g < 12) ctx = 16384;
  else if (g < 20) ctx = 24576;
  else if (g < 28) ctx = 32768;
  else if (g < 40) ctx = 49152;
  else ctx = GGUF_CTX_MAX;
  if (opts?.shareGpu) ctx = Math.min(ctx, GGUF_CTX_SHARE_GPU_CAP);
  else if (opts?.createInflight) ctx = Math.min(ctx, GGUF_CTX_CREATE_CAP);
  return ctx;
}

/** Current PC’s local context window (tokens), honoring share-GPU prefs when available. */
export function getGgufCtx(): number {
  const hw = loadHardwareSnapshot();
  const ram = hw ? parseRamGb(hw) : 8;
  let shareGpu = true;
  try {
    shareGpu = getLocalPrefs().shareGpuMode !== false;
  } catch {
    shareGpu = true;
  }
  return resolveGgufCtx(ram, { shareGpu });
}

/** Tokens available for history / packed prompt (ctx minus reply reserve). */
export function getUsableTokens(ctx = getGgufCtx()): number {
  return Math.max(4096, ctx - REPLY_RESERVE - 512);
}

export function getRamGbForCtx(): number {
  const hw = loadHardwareSnapshot();
  return hw ? parseRamGb(hw) : 8;
}

/** Short UI line: "32 GB RAM → 32,768 token context". */
export function ggufCtxCapacityLabel(ramGb = getRamGbForCtx(), ctx = resolveGgufCtx(ramGb)): string {
  const ramLabel = Number.isFinite(ramGb) ? `${Math.round(ramGb)} GB RAM` : 'this PC';
  const history = getUsableTokens(ctx);
  return `${ramLabel} → ${ctx.toLocaleString()} token local context (~${history.toLocaleString()} for history)`;
}
