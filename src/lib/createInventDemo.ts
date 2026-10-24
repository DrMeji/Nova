/**
 * Invent-demo REMOVED.
 *
 * This module used to host-stamp canned Landing / cafe / luggage / speakers
 * twins when invent stalled. That made every create look identical and
 * “succeed” without matching the brief.
 *
 * Policy: no preview, demo, fallback, or look-back recreate. Model invents
 * from the user brief only. Exports remain as no-ops so old imports compile.
 */

export {
  detectInventGenre,
  inventBriefLayoutFidelity,
  inventFidelityBlocksReady,
} from '@/lib/inventBriefFidelity';

export function inventDemoHostStampAllowed(): boolean {
  return false;
}

/** Detect leftover twin markers from older builds (block Ready — never stamp). */
export function logoLooksLikeInventDemoMark(svg: string): boolean {
  const s = String(svg || '');
  return /data-nova-invent-logo\s*=\s*["']1["']/i.test(s);
}

export function appLooksLikeInventIncomplete(files: Record<string, string>): boolean {
  const app = String(files['src/App.jsx'] || files['src/App.tsx'] || '');
  if (!app.trim()) return true;
  if (/data-nova-invent-demo\s*=\s*["']1["']/.test(app)) return true;
  if (app.length < 1200) return true;
  return false;
}

/** Permanently removed — never compose a host twin. */
export function composeInventDemoSite(_opts: {
  brand: string;
  brief: string;
}): { files: Record<string, string>; note: string; genre: string } {
  return {
    files: {},
    note: 'invent-demo removed — model must invent from brief',
    genre: 'none',
  };
}

/** Permanently removed — never stamp luggage premium twin. */
export function applyLuggagePremiumRedesign(
  files: Record<string, string>,
  _brand: string,
  _brief: string,
): { files: Record<string, string>; applied: boolean; note: string } {
  return { files, applied: false, note: 'luggage invent-demo redesign removed' };
}

/** Permanently removed — never apply invent-demo to Acc / disk / Live. */
export function applyInventDemoToFiles(
  files: Record<string, string>,
  _brand: string,
  _brief: string,
  _opts?: { force?: boolean },
): { files: Record<string, string>; applied: boolean; note: string } {
  return {
    files,
    applied: false,
    note: 'invent-demo removed — no host twin, no fallback, invent from brief only',
  };
}
