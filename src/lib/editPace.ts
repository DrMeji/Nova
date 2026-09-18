/**
 * Pace local patches so chat doesn't flash "Done in 40ms" for real file work.
 * Image / cinematic backgrounds intentionally take longer (search + download).
 */

export function looksLikeHeavyImageAsk(message: string): boolean {
  const t = String(message || '');
  return (
    /\b(?:cinematic|movie[- ]?like|film\s+still|premium\s+(?:background|atmosphere|website|site)|atmospheric|website[- ]?fit|editorial\s+background|hero\s+(?:image|photo|shot)|background\s+image|full[- ]?bleed)\b/i.test(t)
    || (/\b(?:background|hero|wallpaper|atmosphere)\b/i.test(t) && /\b(?:photo|image|imagery|photograph|orb|glow|depth|scroll|website)\b/i.test(t))
  );
}

export function minEditPaceMs(message: string): number {
  const t = String(message || '');
  // Multi-panel / website imagery: search + download several heroes.
  if (looksLikeHeavyImageAsk(t) && /\b(?:scroll|pages?|website|landing|multi|premium)\b/i.test(t)) {
    return 120_000;
  }
  if (looksLikeHeavyImageAsk(t)) return 90_000;
  if (/\b(?:logos?|icons?|simple\s*icons?|lucide)\b/i.test(t) && /\b(?:add|put|place|insert)\b/i.test(t)) {
    return 2_500;
  }
  if (/\b(?:add|put|place|change|update|make|set|remove)\b/i.test(t)) return 1_600;
  return 900;
}

/** Wait until startedAt + minMs (no busy spin beyond the remaining gap). */
export async function paceUntil(startedAt: number, minMs: number): Promise<void> {
  const remain = Math.max(0, minMs - (Date.now() - startedAt));
  if (remain <= 0) return;
  await new Promise<void>((r) => setTimeout(r, remain));
}
