/**
 * Latest patch snapshot for Agents / Code diff review chrome.
 */
export type PendingDiffReview = {
  path: string;
  diff: string;
  confidenceLabel?: string;
  at: number;
};

const KEY = 'nova-pending-diff-review';

export function stashPendingDiffReview(entry: Omit<PendingDiffReview, 'at'>): void {
  try {
    const payload: PendingDiffReview = { ...entry, at: Date.now() };
    sessionStorage.setItem(KEY, JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent('nova-pending-diff', { detail: payload }));
  } catch { /* ignore */ }
}

export function readPendingDiffReview(): PendingDiffReview | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingDiffReview;
    if (!parsed?.path) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingDiffReview(): void {
  try {
    sessionStorage.removeItem(KEY);
    window.dispatchEvent(new CustomEvent('nova-pending-diff', { detail: null }));
  } catch { /* ignore */ }
}
