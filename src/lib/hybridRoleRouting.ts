/**
 * Role-based model routing for hybrid create / edit (local GGUF ∥ cloud).
 * Cloud is preferred for create when keyed; vision and review use best fit.
 */

export type HybridRole = 'vision' | 'code' | 'review' | 'file-find' | 'design';

export type HybridCandidate = {
  id: string;
  name: string;
  source: 'local' | 'cloud' | 'auto';
};

export type HybridAiMode = 'automatic' | 'local_only' | 'cloud_when_available' | 'local_fallback' | 'hybrid';

/** Normalize prefs / UI labels onto the four stored modes (+ hybrid alias). */
export function normalizeHybridAiMode(raw: string | null | undefined): HybridAiMode {
  const t = String(raw || 'automatic').trim().toLowerCase();
  if (t === 'hybrid' || t === 'cloud+local' || t === 'cloud_local') return 'hybrid';
  if (t === 'local_only' || t === 'local') return 'local_only';
  if (t === 'local_fallback') return 'local_fallback';
  if (t === 'cloud_when_available' || t === 'cloud') return 'cloud_when_available';
  return 'automatic';
}

export function preferCloudForCreate(mode: HybridAiMode, hasCloudKey: boolean): boolean {
  if (!hasCloudKey) return false;
  if (mode === 'local_only') return false;
  // Hybrid + cloud_when_available + automatic: create lane prefers cloud when available.
  return mode === 'hybrid' || mode === 'cloud_when_available' || mode === 'automatic' || mode === 'local_fallback';
}

export function pickForRole(
  role: HybridRole,
  opts: {
    mode: HybridAiMode;
    locals: HybridCandidate[];
    clouds: HybridCandidate[];
    visionLocals?: HybridCandidate[];
  },
): HybridCandidate | null {
  const mode = opts.mode;
  const locals = opts.locals;
  const clouds = opts.clouds;
  const visionLocals = opts.visionLocals || locals;

  const coderScore = (n: string) => {
    const s = n.toLowerCase();
    let score = 0;
    if (/coder|code|deepseek|qwen.*code|claude|gpt-4|sonnet|opus|gemini/i.test(s)) score += 40;
    if (/14b|32b|70b|405b/i.test(s)) score += 20;
    if (/7b|8b/i.test(s)) score += 8;
    if (/3b|1\.|tiny|mini/i.test(s)) score -= 10;
    return score;
  };

  const bestLocal = [...locals].sort((a, b) => coderScore(b.name) - coderScore(a.name))[0] || null;
  const bestCloud = [...clouds].sort((a, b) => coderScore(b.name) - coderScore(a.name))[0] || null;
  const bestVision = visionLocals[0] || bestLocal;

  if (role === 'vision') {
    if (mode === 'local_only') return bestVision;
    return bestVision || bestCloud;
  }
  if (role === 'file-find') {
    return bestLocal || bestCloud;
  }
  if (role === 'review') {
    if (mode === 'local_only') return bestLocal;
    return bestCloud || bestLocal;
  }
  if (role === 'design') {
    if (mode === 'local_only') return bestLocal;
    return bestCloud || bestLocal;
  }
  // code
  if (mode === 'local_only') return bestLocal;
  if (preferCloudForCreate(mode, clouds.length > 0)) return bestCloud || bestLocal;
  return bestLocal || bestCloud;
}

/** Short attribution for chat footer: Vision → Code → Review */
export function formatHybridAttribution(parts: Array<{ role: HybridRole; name: string }>): string {
  const label: Record<HybridRole, string> = {
    vision: 'Vision',
    code: 'Code',
    review: 'Review',
    'file-find': 'Find',
    design: 'Design',
  };
  return parts
    .filter((p) => p.name)
    .map((p) => `${label[p.role]} · ${p.name}`)
    .join(' → ');
}
