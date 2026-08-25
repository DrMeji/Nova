/**
 * Local GGUF context size scaled to this PC’s RAM.
 * More RAM → longer chat history before compression / rotation.
 * Capped so KV-cache doesn’t eat the machine (OS + model weights still need room).
 */

import { loadHardwareSnapshot, parseRamGb } from '@/lib/api';

/** Leave room for the next reply (chat nPredict default is 4096). */
export const REPLY_RESERVE = 4096;

/** Absolute ceiling — beyond this, latency and OOM risk climb fast on consumer PCs. */
export const GGUF_CTX_MAX = 65536;
export const GGUF_CTX_MIN = 8192;

/**
 * Pick a llama.cpp `-c` size from installed system RAM (GB).
 * Same table as electron/arkGguf.cjs — keep them in sync.
 */
export function resolveGgufCtx(ramGb: number): number {
  const ram = Number(ramGb);
  const g = Number.isFinite(ram) && ram > 0 ? ram : 8;
  if (g < 8) return 8192;
  if (g < 12) return 16384;
  if (g < 20) return 24576;
  if (g < 28) return 32768;
  if (g < 40) return 49152;
  return GGUF_CTX_MAX;
}

/** Current PC’s local context window (tokens). */
export function getGgufCtx(): number {
  const hw = loadHardwareSnapshot();
  const ram = hw ? parseRamGb(hw) : 8;
  return resolveGgufCtx(ram);
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
