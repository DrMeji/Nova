/**
 * Pre-download hardware fit + similar-model recommendations for Models / Local AI.
 */

import type { HardwareClass } from '@/lib/api';
import { getHardwareClass, parseRamGb, type HardwareInfo } from '@/lib/api';

export type ModelFitLevel = 'good' | 'stretch' | 'poor';

export type ModelFitAssessment = {
  level: ModelFitLevel;
  headline: string;
  body: string;
  sizeGb: number;
  needRamGb: number;
  pcRamGb: number;
  pcClass: HardwareClass;
};

export type SimilarModelPick = {
  id: string;
  name: string;
  sizeLabel: string;
  sizeGb: number;
  category?: string;
  reason: string;
};

type CompatCandidate = {
  id: string;
  name: string;
  sizeGb: number;
  category?: string;
  /** Prefer catalog / recommended brains when suggesting an alternative. */
  preferred?: boolean;
};

function needRamForSize(sizeGb: number): number {
  return Math.round((sizeGb * 1.35 + 4) * 10) / 10;
}

function classForSize(sizeGb: number): HardwareClass {
  if (sizeGb >= 12) return 'strong';
  if (sizeGb >= 4) return 'standard';
  return 'light';
}

/**
 * Assess whether a GGUF (or similar) download is a good fit for this PC.
 */
export function assessModelDownloadFit(
  sizeGb: number,
  hw: HardwareInfo | null | undefined,
): ModelFitAssessment {
  const pcClass = hw ? getHardwareClass(hw) : 'standard';
  const pcRamGb = hw ? parseRamGb(hw) : 8;
  const need = needRamForSize(Math.max(0.1, sizeGb));
  const modelClass = classForSize(sizeGb);
  const rank: Record<HardwareClass, number> = { light: 0, standard: 1, strong: 2 };

  let level: ModelFitLevel = 'good';
  if (rank[modelClass] > rank[pcClass] || pcRamGb < need * 0.85) {
    level = 'poor';
  } else if (pcRamGb < need || (sizeGb >= 8 && pcClass === 'standard')) {
    level = 'stretch';
  } else if (sizeGb < 2 || pcRamGb >= need) {
    level = 'good';
  }

  if (level === 'good') {
    return {
      level,
      headline: 'Compatible with this PC',
      body: `${sizeGb.toFixed(1)} GB fits your ${pcRamGb} GB system. You can download it into NOVA Engine.`,
      sizeGb,
      needRamGb: need,
      pcRamGb,
      pcClass,
    };
  }
  if (level === 'stretch') {
    return {
      level,
      headline: 'May run with limits on this PC',
      body: `This ${sizeGb.toFixed(1)} GB model needs about ${need} GB free RAM alongside the OS. On your ${pcRamGb} GB system it may load slowly or use a shorter context. You can continue, or choose a similar model that fits more comfortably.`,
      sizeGb,
      needRamGb: need,
      pcRamGb,
      pcClass,
    };
  }
  return {
    level,
    headline: 'Not recommended for this PC',
    body: `This ${sizeGb.toFixed(1)} GB model typically needs about ${need} GB of available memory. Your system reports ${pcRamGb} GB RAM (${pcClass} profile), so it may fail to load or run unreliably. A similar, smaller model is recommended below.`,
    sizeGb,
    needRamGb: need,
    pcRamGb,
    pcClass,
  };
}

function sameLane(a?: string, b?: string): boolean {
  const norm = (c?: string) => {
    const x = String(c || '').toLowerCase();
    if (x === 'code' || x === 'coding') return 'coding';
    if (x === 'chat' || x === 'general' || x === 'fast') return 'chat';
    if (x === 'design') return 'design';
    if (x === 'vision') return 'vision';
    if (x === 'reasoning') return 'reasoning';
    return x || 'chat';
  };
  return norm(a) === norm(b);
}

/**
 * Pick a similar catalog/hunt model that fits this PC better than the requested one.
 */
export function findSimilarRecommendedModel(
  requested: { id: string; name: string; sizeGb: number; category?: string },
  candidates: CompatCandidate[],
  hw: HardwareInfo | null | undefined,
): SimilarModelPick | null {
  const fitReq = assessModelDownloadFit(requested.sizeGb, hw);
  if (fitReq.level === 'good') return null;

  const pcRamGb = hw ? parseRamGb(hw) : 8;
  const pcClass = hw ? getHardwareClass(hw) : 'standard';
  const rank: Record<HardwareClass, number> = { light: 0, standard: 1, strong: 2 };

  const scored = candidates
    .filter((c) => c.id !== requested.id)
    .filter((c) => c.sizeGb > 0 && c.sizeGb < requested.sizeGb)
    .filter((c) => sameLane(c.category, requested.category) || !requested.category)
    .map((c) => {
      const need = needRamForSize(c.sizeGb);
      const modelClass = classForSize(c.sizeGb);
      const fits =
        rank[modelClass] <= rank[pcClass]
        && (pcRamGb >= need || c.sizeGb < 2);
      const stretch = !fits && pcRamGb >= need * 0.75;
      let score = 0;
      if (fits) score += 100;
      else if (stretch) score += 40;
      else score -= 50;
      if (c.preferred) score += 25;
      if (sameLane(c.category, requested.category)) score += 30;
      // Prefer closest size under the request without being tiny.
      score += Math.min(20, c.sizeGb * 2);
      score -= Math.abs(c.sizeGb - Math.min(requested.sizeGb * 0.55, 7));
      return { c, score, fits };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const best = scored[0]?.c;
  if (!best) return null;

  return {
    id: best.id,
    name: best.name,
    sizeLabel: `${best.sizeGb.toFixed(1)} GB`,
    sizeGb: best.sizeGb,
    category: best.category,
    reason: sameLane(best.category, requested.category)
      ? `Similar ${best.category || 'assistant'} model that fits this PC better.`
      : 'Similar local model sized for this PC.',
  };
}

/** Professional confirm copy keyed by fit level. */
export function modelDownloadConfirmCopy(fit: ModelFitAssessment): {
  title: string;
  primaryLabel: string;
  secondaryLabel: string;
} {
  if (fit.level === 'good') {
    return {
      title: 'Confirm download',
      primaryLabel: 'Download',
      secondaryLabel: 'Cancel',
    };
  }
  if (fit.level === 'stretch') {
    return {
      title: 'Review before downloading',
      primaryLabel: 'Download anyway',
      secondaryLabel: 'Cancel',
    };
  }
  return {
    title: 'Hardware recommendation',
    primaryLabel: 'Download anyway',
    secondaryLabel: 'Cancel',
  };
}
