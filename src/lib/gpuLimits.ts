/**
 * GPU / VRAM fit for local GGUF coders.
 * Weights + KV + ~1.2 GB reserved for Windows + Preview.
 * Prefer Q5_K_M when it fits; else Q4_K_M. Never recommend Q3/Q2 as coder.
 */

export type GgufQuant = 'Q8_0' | 'Q6_K' | 'Q5_K_M' | 'Q4_K_M' | 'Q4_K_S' | 'Q3_K_M' | 'Q2_K' | 'unknown';

/** Approx bytes per parameter for common quants. */
const BYTES_PER_PARAM: Record<GgufQuant, number> = {
  Q8_0: 1.0,
  Q6_K: 0.78,
  Q5_K_M: 0.66,
  Q4_K_M: 0.56,
  Q4_K_S: 0.52,
  Q3_K_M: 0.4,
  Q2_K: 0.3,
  unknown: 0.56,
};

const OS_RESERVE_GB = 1.2;

export function parseGgufQuant(idOrName: string): GgufQuant {
  const t = String(idOrName || '');
  if (/Q8_0|q8_0/i.test(t)) return 'Q8_0';
  if (/Q6_K|q6_k/i.test(t)) return 'Q6_K';
  if (/Q5_K_M|q5_k_m|Q5_K|q5_k/i.test(t)) return 'Q5_K_M';
  if (/Q4_K_M|q4_k_m/i.test(t)) return 'Q4_K_M';
  if (/Q4_K_S|q4_k_s|IQ4/i.test(t)) return 'Q4_K_S';
  if (/Q3_K|q3_k/i.test(t)) return 'Q3_K_M';
  if (/Q2_K|q2_k/i.test(t)) return 'Q2_K';
  return 'unknown';
}

export function parseParamsB(idOrName: string): number | null {
  const m = String(idOrName || '').match(/(\d+(?:\.\d+)?)\s*b\b/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Max Q4-class coder params for a VRAM budget (2k ctx assumption). */
export function maxCoderParamsBForVram(vramGb: number | null | undefined): number {
  const v = typeof vramGb === 'number' && vramGb > 0 ? vramGb : 0;
  if (v < 4) return 0;
  if (v < 6) return 3;
  if (v < 12) return 7;
  // Create-safe ceiling: 14B. Larger GGUFs stall craft/polish even on high VRAM.
  return 14;
}

export function estimateGgufGb(paramsB: number, quant: GgufQuant = 'Q4_K_M'): number {
  const bp = BYTES_PER_PARAM[quant] ?? BYTES_PER_PARAM.unknown;
  // paramsB * 1e9 * bytes + ~15% KV/overhead for short ctx
  return (paramsB * bp * 1.15) + OS_RESERVE_GB;
}

export type VramFitResult = {
  ok: boolean;
  reason: string;
  quant: GgufQuant;
  needGb: number;
  vramGb: number;
};

export function assertVramFits(opts: {
  vramGb: number | null | undefined;
  idOrName: string;
  quant?: GgufQuant;
}): VramFitResult {
  const vramGb = typeof opts.vramGb === 'number' && opts.vramGb > 0 ? opts.vramGb : 0;
  const quant = opts.quant || parseGgufQuant(opts.idOrName);
  if (quant === 'Q3_K_M' || quant === 'Q2_K') {
    return {
      ok: false,
      reason: 'Q3/Q2 quants are not offered as coder — quality is too low for code.',
      quant,
      needGb: 0,
      vramGb,
    };
  }
  if (vramGb < 4) {
    return {
      ok: false,
      reason: 'No usable dedicated VRAM for a local coder (CPU / iGPU mode). Use scaffold + cloud, or a tiny chat model only.',
      quant,
      needGb: 0,
      vramGb,
    };
  }
  const params = parseParamsB(opts.idOrName);
  if (params == null) {
    return { ok: true, reason: 'Unknown param size — allowing; watch free VRAM.', quant, needGb: 0, vramGb };
  }
  const needGb = estimateGgufGb(params, quant);
  if (needGb > vramGb) {
    return {
      ok: false,
      reason: `Needs ~${needGb.toFixed(1)} GB VRAM (weights+KV+reserve); this PC reports ~${vramGb.toFixed(1)} GB.`,
      quant,
      needGb,
      vramGb,
    };
  }
  const maxP = maxCoderParamsBForVram(vramGb);
  if (params > maxP) {
    return {
      ok: false,
      reason: `~${params}B exceeds this VRAM band’s max coder (~${maxP}B Q4-class).`,
      quant,
      needGb,
      vramGb,
    };
  }
  return { ok: true, reason: `Fits (~${needGb.toFixed(1)} GB of ${vramGb.toFixed(1)} GB VRAM).`, quant, needGb, vramGb };
}

/** Preferred download quant for this VRAM. */
export function preferredCoderQuant(vramGb: number | null | undefined): GgufQuant {
  const v = typeof vramGb === 'number' && vramGb > 0 ? vramGb : 0;
  if (v >= 10) return 'Q5_K_M';
  if (v >= 4) return 'Q4_K_M';
  return 'Q4_K_M';
}

/** Two concurrent GGUFs need fat RAM + VRAM. */
export function allowTwoLocalModels(ramGb: number, vramGb: number | null | undefined): boolean {
  const v = typeof vramGb === 'number' ? vramGb : 0;
  return ramGb >= 32 && v >= 8;
}
