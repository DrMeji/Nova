/** Parked product surfaces: wired, hidden until Testers reveals them one at a time. */

export type ParkId = 'networking' | 'message' | 'call' | 'testers';

const KEY = 'ark:revealed-features';

function readList(): ParkId[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is ParkId =>
      id === 'networking' || id === 'message' || id === 'call' || id === 'testers',
    );
  } catch {
    return [];
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
  return readList().includes(id);
}

export function setRevealed(id: ParkId, on: boolean) {
  const cur = new Set(readList());
  if (on) cur.add(id);
  else cur.delete(id);
  writeList([...cur]);
}

export function isSocialParked(name: 'networking' | 'message' | 'call'): boolean {
  return !isRevealed(name);
}
