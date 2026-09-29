/** Product surface gates. Image / Video / Call / Testers / Beta are removed from the product UI. */

export type ParkId = 'networking' | 'message' | 'call';

const KEY = 'NOVA:revealed-features';

/** Social surfaces parked while GitHub-only auth lands — re-enable later deliberately. */
const ALWAYS_LIVE: ParkId[] = [];

function readList(): ParkId[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [...ALWAYS_LIVE];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...ALWAYS_LIVE];
    const list = parsed.filter((id): id is ParkId =>
      id === 'networking' || id === 'message' || id === 'call',
    );
    for (const id of ALWAYS_LIVE) {
      if (!list.includes(id)) list.push(id);
    }
    return list;
  } catch {
    return [...ALWAYS_LIVE];
  }
}

function writeList(ids: ParkId[]) {
  localStorage.setItem(KEY, JSON.stringify(ids));
  window.dispatchEvent(new Event('NOVA:features-changed'));
}

export function listRevealed(): ParkId[] {
  return readList();
}

export function isRevealed(id: ParkId): boolean {
  if (id === 'call') return false;
  if (ALWAYS_LIVE.includes(id)) return true;
  return readList().includes(id);
}

export function setRevealed(id: ParkId, on: boolean) {
  if (id === 'call') return;
  if (ALWAYS_LIVE.includes(id) && !on) return;
  const cur = new Set(readList());
  if (on) cur.add(id);
  else cur.delete(id);
  writeList([...cur]);
}

/** Networking + Message stay parked until we redesign social on GitHub identity. */
export function isSocialParked(name: 'networking' | 'message' | 'call'): boolean {
  if (name === 'call') return true;
  if (name === 'networking' || name === 'message') return true;
  return !isRevealed(name);
}

/** Removed from product — always off. */
export function isCallUiEnabled(): boolean {
  return false;
}

/** Removed from product — always off. */
export function isVideoTabEnabled(): boolean {
  return false;
}

/** Removed from product — always off. */
export function isImageTabEnabled(): boolean {
  return false;
}

/** Voice chat tab stays available via Settings → Voice (and always on in dev). */
export { isVoiceTabEnabled } from '@/lib/voiceMode';

/** Removed from product — always off. */
export function isTestersSettingsEnabled(): boolean {
  return false;
}

/** Removed from product — always off. */
export function isBetaSettingsEnabled(): boolean {
  return false;
}

/** Legacy Code / ProjectWorkspace tab — retired; Code pill overlay is the only code UI. */
export function isCodeTabEnabled(): boolean {
  return false;
}
