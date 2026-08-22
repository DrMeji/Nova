/** Parked product surfaces. Networking + Message are live; Call stays opt-in via Testers. */

export type ParkId = 'networking' | 'message' | 'call' | 'testers';

const KEY = 'ark:revealed-features';

/** Always available in the sidebar — not behind Testers. */
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
    // Migrate older installs that never revealed social tabs.
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
  if (ALWAYS_LIVE.includes(id) && !on) {
    // Networking + Message stay live; Call can still be toggled.
    return;
  }
  const cur = new Set(readList());
  if (on) cur.add(id);
  else cur.delete(id);
  writeList([...cur]);
}

export function isSocialParked(name: 'networking' | 'message' | 'call'): boolean {
  if (name === 'networking' || name === 'message') return false;
  return !isRevealed(name);
}

/** Video tab parked until generative video is reliable (motion-still fallback is not product-ready). */
export function isVideoTabEnabled(): boolean {
  return false;
}
