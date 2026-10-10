/**
 * Smoke: bulk History wipe must stay O(1) localStorage scans (not per-chat).
 * Runs in Node with a minimal localStorage shim — no Electron.
 *
 *   npx tsx --tsconfig tsconfig.app.json scripts/smoke-bulk-chat-delete.mjs
 */
import { createRequire } from 'module';

const N = 40;
const store = new Map();
let keyScans = 0;

const localStorageShim = {
  get length() {
    return store.size;
  },
  key(i) {
    return [...store.keys()][i] ?? null;
  },
  getItem(k) {
    return store.has(k) ? store.get(k) : null;
  },
  setItem(k, v) {
    store.set(String(k), String(v));
  },
  removeItem(k) {
    store.delete(String(k));
  },
  clear() {
    store.clear();
  },
};

// Count full-table key enumeration (the old per-chat freeze source).
const origKey = localStorageShim.key.bind(localStorageShim);
localStorageShim.key = (i) => {
  if (i === 0) keyScans += 1;
  return origKey(i);
};

globalThis.localStorage = localStorageShim;
// recentStore calls window.setTimeout / clearTimeout — Node has them on globalThis only.
globalThis.window = {
  dispatchEvent() {},
  addEventListener() {},
  removeEventListener() {},
  novaDesktop: undefined,
  setTimeout: (...args) => globalThis.setTimeout(...args),
  clearTimeout: (...args) => globalThis.clearTimeout(...args),
  setInterval: (...args) => globalThis.setInterval(...args),
  clearInterval: (...args) => globalThis.clearInterval(...args),
};

const CHATS_KEY = 'NOVA:recent-chats';
const CREATIONS_KEY = 'NOVA:recent-creations';
const PROJECTS_KEY = 'NOVA:recent-projects';

const chats = [];
for (let i = 0; i < N; i++) {
  const id = `chat-bulk-${i}`;
  chats.push({
    id,
    title: `Chat ${i}`,
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  });
  store.set(`NOVA:chat-thread:chat:${id}`, JSON.stringify([{ role: 'user', content: `hi ${i}` }]));
  store.set(`NOVA:chat-studio:${id}`, '{}');
  store.set(`NOVA:inflight:${id}`, '1');
}
store.set(CHATS_KEY, JSON.stringify(chats));
store.set(CREATIONS_KEY, JSON.stringify([]));
store.set(PROJECTS_KEY, JSON.stringify([]));
store.set('NOVA:deleted-chat-ids', '[]');
store.set('NOVA:deleted-media-ids', '[]');

const { deleteRecentChatsPermanentlyBulk, loadRecentChats } = await import('../src/lib/recentStore.ts');

keyScans = 0;
const t0 = performance.now();
const wiped = deleteRecentChatsPermanentlyBulk(chats.map((c) => c.id));
const ms = performance.now() - t0;

if (wiped !== N) {
  console.error(`FAIL: wiped ${wiped}, expected ${N}`);
  process.exit(1);
}
const left = loadRecentChats();
if (left.length !== 0) {
  console.error(`FAIL: ${left.length} chats remain`);
  process.exit(1);
}
// One leftover scan for the batch (plus any incidental length walks). Cap well below N.
if (keyScans > 8) {
  console.error(`FAIL: too many localStorage key scans (${keyScans}); expected ~1 for bulk`);
  process.exit(1);
}
if (ms > 500) {
  console.error(`FAIL: bulk delete took ${ms.toFixed(1)}ms for ${N} chats (should be <<500ms in Node)`);
  process.exit(1);
}

console.log(`ok bulk wipe ${N} chats in ${ms.toFixed(1)}ms with ${keyScans} key-scan(s)`);
