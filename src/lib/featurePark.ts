/** Parked product surfaces — wired in code, hidden from retail UI until flags flip. */

import { isArkDevSession } from '@/lib/arkRuntime';

export type ParkId = 'networking' | 'message' | 'call' | 'testers';

const KEY = 'ark:revealed-features';

/** Always on for signed-in users (Message / Networking). Call is opt-in via Testers on bat/dev. */
const ALWAYS_LIVE: ParkId[] = ['networking', 'message'];

function readList(): ParkId[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [...ALWAYS_LIVE];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...ALWAYS_LIVE];
    const list = parsed.filter((id): id is ParkId =>
      id === 'networking' || id === 'message' || id === 'call' || id === 'testers',
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
  window.dispatchEvent(new Event('ark:features-changed'));
}

export function listRevealed(): ParkId[] {
  return readList();
}

export function isRevealed(id: ParkId): boolean {
  if (ALWAYS_LIVE.includes(id)) return true;
  return readList().includes(id);
}

export function setRevealed(id: ParkId, on: boolean) {
  if (ALWAYS_LIVE.includes(id) && !on) return;
  const cur = new Set(readList());
  if (on) cur.add(id);
  else cur.delete(id);
  writeList([...cur]);
}

export function isSocialParked(name: 'networking' | 'message' | 'call'): boolean {
  if (name === 'networking' || name === 'message') return false;
  return !isRevealed(name);
}

/** True when Call UI (Message pills / Call tab) should be shown. */
export function isCallUiEnabled(): boolean {
  return !isSocialParked('call');
}

/** Video tab — UI + engine routes exist; hidden until isVideoTabEnabled() is true. */
export function isVideoTabEnabled(): boolean {
  return false;
}

/**
 * Image tab — DEV / bat sessions keep it.
 * Packaged retail builds show Image as SOON (same as Video) until image gen is ready to ship.
 * Also keep Image for the local DEV profile name used while testing packaged builds.
 */
export function isImageTabEnabled(): boolean {
  if (isArkDevSession()) return true;
  try {
    const raw = localStorage.getItem('ark:local-prefs');
    if (!raw) return false;
    const prefs = JSON.parse(raw) as { displayName?: string };
    const name = String(prefs?.displayName || '').trim().toLowerCase();
    return name === 'dev';
  } catch {
    return false;
  }
}

/** Voice tab — session hooks exist; hidden until isVoiceTabEnabled() is true. */
export { isVoiceTabEnabled } from '@/lib/voiceMode';

/** Settings → Testers — reveal toggles wired; hidden until enabled. */
export function isTestersSettingsEnabled(): boolean {
  return false;
}

/** Settings → Beta channel — wired; hidden until enabled. */
export function isBetaSettingsEnabled(): boolean {
  return false;
}

/** Legacy Code / ProjectWorkspace tab — retired; Code pill overlay is the only code UI. */
export function isCodeTabEnabled(): boolean {
  return false;
}
