/**
 * Brain roles for Chat — chat / coder / vision / design.
 * Falls back to legacy defaultModelId / defaultCodeModelId.
 */

import { getLocalPrefs, setLocalPrefs } from '@/lib/localPrefs';
import { isCoderEngineId, isUiDesignEngineId } from '@/lib/enginePick';

export type BrainRole = 'chat' | 'coder' | 'vision' | 'design';

function looksLikeVisionBrainId(id: string): boolean {
  return /\b(?:vl|vision|llava|moondream|minicpm[-_]?v|mmproj|qwen2-vl|qwen2\.5-vl)\b/i.test(id);
}

/** Hard firewall — vision GGUFs must never fill chat/coder/design slots. */
export function brainRoleAllowsId(role: BrainRole, id: string | null | undefined): boolean {
  const clean = String(id || '').trim();
  if (!clean || clean === 'NOVA-auto') return true;
  if (looksLikeVisionBrainId(clean)) {
    return role === 'vision';
  }
  if (role === 'coder') {
    return isCoderEngineId(clean) && !isWeakCoderId(clean);
  }
  if (role === 'design') {
    if (isCoderEngineId(clean) && !isUiDesignEngineId(clean)) return false;
    return !isWeakCoderId(clean);
  }
  if (role === 'chat') {
    // Chat may use Instruct; never VL, never pure coder as sticky chat.
    return !isCoderEngineId(clean) || isUiDesignEngineId(clean);
  }
  return true;
}

export function getActiveBrainId(role: BrainRole): string {
  const prefs = getLocalPrefs();
  if (role === 'coder') {
    for (const candidate of [prefs.activeCoderId, prefs.defaultCodeModelId, prefs.defaultModelId, 'NOVA-auto']) {
      const id = String(candidate || '').trim();
      if (!id || isWeakCoderId(id)) continue;
      if (id !== 'NOVA-auto' && !brainRoleAllowsId('coder', id)) continue;
      return id;
    }
    return 'NOVA-auto';
  }
  if (role === 'vision') {
    const id = String(prefs.activeVisionId || prefs.defaultModelId || 'NOVA-auto');
    if (id !== 'NOVA-auto' && !brainRoleAllowsId('vision', id)) return 'NOVA-auto';
    return id;
  }
  if (role === 'design') {
    for (const candidate of [prefs.activeDesignId, prefs.activeChatId, prefs.defaultModelId, 'NOVA-auto']) {
      const id = String(candidate || '').trim();
      if (!id) continue;
      if (id === 'NOVA-auto') return id;
      if (!brainRoleAllowsId('design', id)) continue;
      return id;
    }
    return 'NOVA-auto';
  }
  for (const candidate of [prefs.activeChatId, prefs.lastChatModelId, prefs.defaultModelId, 'NOVA-auto']) {
    const id = String(candidate || '').trim();
    if (!id) continue;
    if (id === 'NOVA-auto') return id;
    if (!brainRoleAllowsId('chat', id)) continue;
    return id;
  }
  return 'NOVA-auto';
}

export function isWeakCoderId(id: string | null | undefined): boolean {
  return /1\.5b|0\.5b|0\.6b|tiny|qwen2\.5-1\.5/i.test(String(id || ''));
}

export function setActiveBrainId(role: BrainRole, id: string): void {
  const clean = String(id || '').trim() || 'NOVA-auto';
  if (clean !== 'NOVA-auto' && !brainRoleAllowsId(role, clean)) {
    // Refuse cross-role pins (e.g. VL into chat/coder).
    return;
  }
  if (role === 'coder') {
    // Weak models cannot be the coding brain — pin chat-only instead.
    if (isWeakCoderId(clean)) {
      setLocalPrefs({ activeChatId: clean, defaultModelId: clean, lastChatModelId: clean });
      return;
    }
    setLocalPrefs({ activeCoderId: clean, defaultCodeModelId: clean });
    return;
  }
  if (role === 'vision') {
    setLocalPrefs({ activeVisionId: clean });
    return;
  }
  if (role === 'design') {
    setLocalPrefs({ activeDesignId: clean });
    return;
  }
  setLocalPrefs({ activeChatId: clean, defaultModelId: clean, lastChatModelId: clean });
}

/** Hardware blurb for first-run / Models card. */
export function hardwareCoderRecommendation(ramGb?: number | null): string {
  const ram = typeof ramGb === 'number' && ramGb > 0 ? ramGb : 8;
  if (ram < 8) {
    return `${ram} GB RAM → prefer cloud coding keys, or a tiny local chat model only. Don’t assign 1.5B as coder.`;
  }
  if (ram < 16) {
    return `${ram} GB RAM → Qwen 7B Q4 (coder) or cloud. Keep 1.5B for chat only. Add UIGEN-class 4B for Design when possible.`;
  }
  return `${ram} GB RAM → Qwen 14B / 32B Q4 or cloud coder. Assign a Design brain (UIGEN / Instruct) separately.`;
}
