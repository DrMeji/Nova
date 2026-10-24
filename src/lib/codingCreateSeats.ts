/**
 * Explicit create-vs-chat model seats + cheap classify / expensive implement.
 */
import { getLocalPrefs, setLocalPrefs } from '@/lib/localPrefs';

export type CodingSeatKind = 'chat' | 'create' | 'classify' | 'implement';

export type CodingSeats = {
  chatModelId: string | null;
  createModelId: string | null;
  classifyModelId: string | null;
  implementModelId: string | null;
};

const KEY = 'nova-coding-seats-v1';

export function loadCodingSeats(): CodingSeats {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...emptySeats(), ...JSON.parse(raw) };
  } catch { /* */ }
  const prefs = getLocalPrefs();
  const sticky = (prefs as { stickyModelId?: string }).stickyModelId || null;
  return {
    chatModelId: sticky,
    createModelId: sticky,
    classifyModelId: sticky,
    implementModelId: sticky,
  };
}

function emptySeats(): CodingSeats {
  return {
    chatModelId: null,
    createModelId: null,
    classifyModelId: null,
    implementModelId: null,
  };
}

export function saveCodingSeats(seats: Partial<CodingSeats>) {
  const next = { ...loadCodingSeats(), ...seats };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* */ }
  return next;
}

/** Cheap model for classify / expensive for implement. */
export function pickSeatForPhase(phase: 'classify' | 'implement' | 'create' | 'chat'): string | null {
  const s = loadCodingSeats();
  if (phase === 'classify') return s.classifyModelId || s.chatModelId;
  if (phase === 'implement' || phase === 'create') {
    return s.implementModelId || s.createModelId || s.chatModelId;
  }
  return s.chatModelId;
}

export function classifyVsImplement(): { classify: string | null; implement: string | null } {
  return {
    classify: pickSeatForPhase('classify'),
    implement: pickSeatForPhase('implement'),
  };
}

/** Sync create seat into prefs sticky when user picks create model. */
export function applyCreateSeatToPrefs(modelId: string) {
  saveCodingSeats({ createModelId: modelId, implementModelId: modelId });
  try {
    setLocalPrefs({ stickyModelId: modelId } as never);
  } catch { /* */ }
}
