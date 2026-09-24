/**
 * BrainProfile — RAM/VRAM → chat/coder/vision caps for this PC.
 * Separate from brainContract HTTP API (8787).
 *
 * Probe order: accurate Electron hardware → navigator.deviceMemory → assume 8 GB CPU.
 */

import { getAccurateHardware, parseRamGb, type HardwareInfo } from '@/lib/api';
import { isCoderEngineId } from '@/lib/enginePick';
import {
  allowTwoLocalModels,
  assertVramFits,
  maxCoderParamsBForVram,
  parseParamsB,
  preferredCoderQuant,
  type GgufQuant,
} from '@/lib/gpuLimits';

export type ModelRef = { id: string; name: string; role: 'chat' | 'coder' | 'vision' };

export type BrainProfile = {
  ramGB: number;
  vramGB: number | null;
  cores: number;
  gpuName: string;
  gpuUsable: boolean;
  maxCoderParamsB: number;
  maxChatParamsB: number;
  allowMultiModel: boolean;
  preferredQuant: GgufQuant;
  recommend: { chat: ModelRef; coder: ModelRef | null; vision: ModelRef | null };
  reason: string;
  probedAt: number;
};

export type GateResult = { ok: true; reason?: string } | { ok: false; reason: string };

let cached: BrainProfile | null = null;

export function isWeakCoderId(id: string | null | undefined): boolean {
  return /1\.5b|0\.5b|0\.6b|tiny|qwen2\.5-1\.5|qwen25-15b/i.test(String(id || ''));
}

function parseVramGb(hw: HardwareInfo): number | null {
  const raw = `${hw.vram || ''} ${hw.gpu || ''}`;
  const m = raw.match(/(\d+(?:\.\d+)?)\s*GB/i);
  if (m) return parseFloat(m[1]);
  // Dedicated accel without a number — assume mid band so 7B can try; assertVramFits still checks.
  if (hw.acceleration === 'CUDA' || hw.acceleration === 'Vulkan' || hw.acceleration === 'Metal') {
    return 8;
  }
  // iGPU / CPU
  return 0;
}

function buildProfile(hw: HardwareInfo): BrainProfile {
  const ramGB = parseRamGb(hw) || 8;
  const vramGB = parseVramGb(hw);
  const cores = navigator.hardwareConcurrency || 4;
  const gpuUsable = (vramGB || 0) >= 4
    && (hw.acceleration === 'CUDA' || hw.acceleration === 'Vulkan' || hw.acceleration === 'Metal');
  // VRAM band for full-GPU load; high RAM still allows larger Q4 coders via CPU/partial offload.
  // 16GB+ RAM can run 7B Q4; 20GB+ → try 14B offload; 24GB → solid 14B; 48GB+ → 32B.
  const ramCoderCap = ramGB >= 64 ? 32 : ramGB >= 48 ? 32 : ramGB >= 24 ? 14 : ramGB >= 20 ? 14 : ramGB >= 16 ? 7 : ramGB >= 10 ? 3 : 0;
  const gpuCoderCap = gpuUsable ? maxCoderParamsBForVram(vramGB) : 0;
  const maxCoderParamsB = Math.max(ramCoderCap, gpuCoderCap);
  const maxChatParamsB = ramGB >= 16 ? 7 : ramGB >= 8 ? 3 : 1.5;
  const allowMultiModel = allowTwoLocalModels(ramGB, vramGB) && maxCoderParamsB >= 7;
  const preferredQuant = preferredCoderQuant(vramGB);

  let chat: ModelRef;
  if (maxChatParamsB >= 7) chat = { id: 'qwen25-7b', name: 'Qwen2.5 7B Instruct', role: 'chat' };
  else if (maxChatParamsB >= 3) chat = { id: 'llama32-3b', name: 'Llama 3.2 3B Instruct', role: 'chat' };
  else chat = { id: 'qwen25-15b', name: 'Qwen2.5 1.5B Instruct', role: 'chat' };

  // Recommend the strongest real coder this PC can run — never Instruct as a fake coder.
  let coder: ModelRef | null = null;
  if (maxCoderParamsB >= 32) {
    coder = { id: 'qwen25-coder-32b', name: 'Qwen2.5-Coder 32B', role: 'coder' };
  } else if (maxCoderParamsB >= 14) {
    coder = { id: 'qwen25-coder-14b', name: 'Qwen2.5-Coder 14B', role: 'coder' };
  } else if (maxCoderParamsB >= 7) {
    coder = { id: 'qwen25-coder-7b', name: 'Qwen2.5-Coder 7B', role: 'coder' };
  } else {
    coder = null;
  }

  const vision: ModelRef | null = ramGB >= 16 && (vramGB || 0) >= 6
    ? { id: 'qwen2-vl-7b', name: 'Qwen2-VL 7B', role: 'vision' }
    : null;

  const mode = gpuUsable ? `GPU ~${vramGB} GB` : 'CPU / iGPU';
  const offloadNote = ramCoderCap > gpuCoderCap
    ? ' · RAM offload OK for coder'
    : '';
  const reason = [
    `${ramGB} GB RAM · ${mode} · ${cores} cores`,
    coder
      ? `Coder up to ~${maxCoderParamsB}B (${preferredQuant})${offloadNote}`
      : 'No local coder — scaffold + optional cloud',
    allowMultiModel ? 'Multi-model polish allowed' : 'Multi-model off on this PC',
  ].join(' · ');

  return {
    ramGB,
    vramGB,
    cores,
    gpuName: hw.gpu || 'Unknown',
    gpuUsable,
    maxCoderParamsB,
    maxChatParamsB,
    allowMultiModel,
    preferredQuant,
    recommend: { chat, coder, vision },
    reason,
    probedAt: Date.now(),
  };
}

/** Probe + cache. Pass true to refresh after Settings / GPU change. */
export async function getBrainProfile(force = false): Promise<BrainProfile> {
  if (!force && cached) return cached;
  try {
    const hw = await getAccurateHardware(force);
    cached = buildProfile(hw);
  } catch {
    cached = buildProfile({
      os: 'Unknown',
      cpu: 'Unknown',
      ram: '8 GB',
      gpu: 'Unknown',
      vram: '0 GB',
      storage: 'Unknown',
      acceleration: 'CPU',
      ramGb: 8,
      accurate: false,
    });
  }
  return cached;
}

export function getBrainProfileSync(): BrainProfile | null {
  return cached;
}

export function assertCoderAllowed(
  profile: BrainProfile,
  modelId?: string | null,
  modelName?: string | null,
): GateResult {
  const label = `${modelId || ''} ${modelName || ''}`;
  if (isWeakCoderId(label)) {
    return { ok: false, reason: '1.5B / tiny models cannot be the coder. Pin a larger coder or use surgical/scaffold only.' };
  }
  // Chat Instruct / multimodal brains are not create polish brains.
  const id = String(modelId || '').trim();
  if (id && id !== 'NOVA-auto' && !isCoderEngineId(id) && !isCoderEngineId(modelName)) {
    return {
      ok: false,
      reason: 'Create/build needs a coder GGUF (for example Qwen Coder 7B/14B). Chat Instruct cannot polish UI.',
    };
  }
  if (profile.maxCoderParamsB <= 0) {
    return { ok: false, reason: profile.reason };
  }
  const params = parseParamsB(label);
  if (params != null && params > profile.maxCoderParamsB) {
    return {
      ok: false,
      reason: `~${params}B coder exceeds this PC’s max (~${profile.maxCoderParamsB}B). ${profile.reason}`,
    };
  }
  const vram = assertVramFits({ vramGb: profile.vramGB, idOrName: label });
  if (!vram.ok && profile.gpuUsable) {
    // High-RAM machines: allow Q4 coders via CPU / partial offload when within maxCoderParamsB.
    if (profile.ramGB >= 24 && (params == null || params <= profile.maxCoderParamsB)) {
      return { ok: true, reason: `${profile.reason} · CPU/RAM offload` };
    }
    return { ok: false, reason: vram.reason };
  }
  // CPU-only / low-VRAM: params already gated by maxCoderParamsB (includes RAM offload cap).
  return { ok: true, reason: profile.reason };
}

export function assertMultiModelAllowed(profile: BrainProfile): GateResult {
  if (!profile.allowMultiModel) {
    return {
      ok: false,
      reason: 'Multi-model polish needs ~32 GB RAM and ~8 GB VRAM. Left off on this PC.',
    };
  }
  return { ok: true };
}
