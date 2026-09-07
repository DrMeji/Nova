/** Per-device networking engagement: views, saves, post discussions (until cloud sync). */

export type DiscussionMessage = {
  id: string;
  name: string;
  body: string;
  at: string;
  senderArkId?: string;
};

const VIEWERS_KEY = 'NOVA:network-post-viewers';
const SAVERS_KEY = 'NOVA:network-post-savers';
const DISCUSSIONS_KEY = 'NOVA:network-discussions';
const DISCUSSION_READ_KEY = 'NOVA:network-discussion-read';

function readMap<T>(key: string): Record<string, T> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, T>;
  } catch {
    return {};
  }
}

function writeMap(key: string, data: Record<string, unknown>) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

const PLACEHOLDER_SENDERS = new Set(['Riley Park', 'Jordan Lee', 'Maya Chen']);

export function loadDiscussions(): Record<string, DiscussionMessage[]> {
  const raw = readMap<DiscussionMessage[]>(DISCUSSIONS_KEY);
  const out: Record<string, DiscussionMessage[]> = {};
  let changed = false;
  for (const [id, list] of Object.entries(raw)) {
    const filtered = (Array.isArray(list) ? list : []).filter(m => !PLACEHOLDER_SENDERS.has(m.name));
    if (filtered.length !== (list?.length || 0)) changed = true;
    out[id] = filtered;
  }
  if (changed) saveDiscussions(out);
  return out;
}

export function saveDiscussions(data: Record<string, DiscussionMessage[]>) {
  writeMap(DISCUSSIONS_KEY, data);
}

/** Unique viewers per post — owner re-opens never count. */
export function recordPostView(postId: string, viewerArkId: string, ownerArkId: string): number {
  if (!postId || !viewerArkId || viewerArkId === ownerArkId) return getViewCount(postId);
  const map = readMap<string[]>(VIEWERS_KEY);
  const set = new Set(map[postId] || []);
  set.add(viewerArkId);
  map[postId] = [...set];
  writeMap(VIEWERS_KEY, map);
  return set.size;
}

export function getViewCount(postId: string): number {
  const map = readMap<string[]>(VIEWERS_KEY);
  return (map[postId] || []).length;
}

/** Unique savers per post — toggling save only counts once per user. */
export function recordPostSave(postId: string, saverArkId: string, saving: boolean): number {
  if (!postId || !saverArkId) return getSaveCount(postId);
  const map = readMap<string[]>(SAVERS_KEY);
  const set = new Set(map[postId] || []);
  if (saving) set.add(saverArkId);
  else set.delete(saverArkId);
  map[postId] = [...set];
  writeMap(SAVERS_KEY, map);
  return set.size;
}

export function getSaveCount(postId: string): number {
  const map = readMap<string[]>(SAVERS_KEY);
  return (map[postId] || []).length;
}

export function getDiscussionReadCount(postId: string): number {
  const map = readMap<number>(DISCUSSION_READ_KEY);
  return map[postId] || 0;
}

export function markDiscussionRead(postId: string, messageCount: number) {
  const map = readMap<number>(DISCUSSION_READ_KEY);
  map[postId] = messageCount;
  writeMap(DISCUSSION_READ_KEY, map);
}

export function hasUnreadDiscussion(
  postId: string,
  messages: DiscussionMessage[],
  myArkId: string,
): boolean {
  const read = getDiscussionReadCount(postId);
  if (messages.length <= read) return false;
  return messages.slice(read).some(m => m.senderArkId && m.senderArkId !== myArkId);
}
