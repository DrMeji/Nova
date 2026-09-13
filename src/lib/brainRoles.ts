/**
 * Brain roles for Chat — one coder / chat / vision id.
 * Falls back to legacy defaultModelId / defaultCodeModelId.
 */

import { getLocalPrefs, setLocalPrefs } from '@/lib/localPrefs';

export type BrainRole = 'chat' | 'coder' | 'vision';

export function getActiveBrainId(role: BrainRole): string {
  const prefs = getLocalPrefs();
  if (role === 'coder') {
    return String(prefs.activeCoderId || prefs.defaultCodeModelId || prefs.defaultModelId || 'NOVA-auto');
  }
  if (role === 'vision') {
    return String(prefs.activeVisionId || prefs.defaultModelId || 'NOVA-auto');
  }
  return String(prefs.activeChatId || prefs.lastChatModelId || prefs.defaultModelId || 'NOVA-auto');
}

export function setActiveBrainId(role: BrainRole, id: string): void {
  const clean = String(id || '').trim() || 'NOVA-auto';
  if (role === 'coder') {
    setLocalPrefs({ activeCoderId: clean, defaultCodeModelId: clean });
    return;
  }
  if (role === 'vision') {
    setLocalPrefs({ activeVisionId: clean });
    return;
  }
  setLocalPrefs({ activeChatId: clean, defaultModelId: clean, lastChatModelId: clean });
}

export function isWeakCoderId(id: string | null | undefined): boolean {
  return /1\.5b|0\.5b|0\.6b|tiny|qwen2\.5-1\.5/i.test(String(id || ''));
}

/** Hardware blurb for first-run / Models card. */
export function hardwareCoderRecommendation(ramGb?: number | null): string {
  const ram = typeof ramGb === 'number' && ramGb > 0 ? ramGb : 8;
  if (ram < 8) {
    return `${ram} GB RAM → prefer cloud coding keys, or a tiny local chat model only. Don’t assign 1.5B as coder.`;
  }
  if (ram < 16) {
    return `${ram} GB RAM → Qwen 7B Q4 (coder) or cloud. Keep 1.5B for chat only.`;
  }
  return `${ram} GB RAM → Qwen 14B / 32B Q4 or cloud coder.`;
}
