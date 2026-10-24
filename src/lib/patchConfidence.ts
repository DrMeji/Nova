/**
 * Apply-patch confidence meter — Missing-tab coding gap.
 * Scores how safe a patch looks before apply (not a model guarantee).
 */

export type PatchConfidence = {
  score: number; // 0..100
  label: 'low' | 'medium' | 'high';
  reasons: string[];
};

export function scorePatchConfidence(opts: {
  search?: string;
  replace?: string;
  path?: string;
  fileBefore?: string;
}): PatchConfidence {
  const reasons: string[] = [];
  let score = 55;
  const search = String(opts.search || '');
  const replace = String(opts.replace || '');
  const before = String(opts.fileBefore || '');
  const path = String(opts.path || '');

  if (path) score += 5;
  if (search.length >= 12 && before.includes(search)) {
    score += 25;
    reasons.push('SEARCH uniquely anchored in file');
  } else if (search.length >= 12) {
    score -= 20;
    reasons.push('SEARCH not found in file — risky');
  } else {
    score -= 10;
    reasons.push('SEARCH too short');
  }
  if (replace.length > 0 && replace !== search) {
    score += 10;
    reasons.push('REPLACE changes content');
  }
  if (/@@@FILE|<<<<<<<|>>>>>>>/i.test(replace)) {
    score -= 30;
    reasons.push('REPLACE contains conflict/markers');
  }
  if (replace.length > 12_000) {
    score -= 15;
    reasons.push('very large REPLACE');
  }
  score = Math.max(0, Math.min(100, score));
  const label = score >= 75 ? 'high' : score >= 45 ? 'medium' : 'low';
  return { score, label, reasons };
}

export function formatPatchConfidenceChip(c: PatchConfidence): string {
  return `Patch confidence ${c.score}/100 (${c.label})`;
}
