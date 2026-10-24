/**
 * Chat-scoped reusable create jobs — never cross-bind into another chat's project.
 *   node scripts/smoke-reusable-create-job-chat-scope.mjs
 */
import assert from 'node:assert/strict';

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => store.clear(),
    key: (i) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
}
if (typeof globalThis.sessionStorage === 'undefined') {
  const store = new Map();
  globalThis.sessionStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => store.clear(),
    key: (i) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
}
if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}

const {
  startCreateJob,
  getLatestReusableCreateJob,
} = await import('../src/lib/createJobStore.ts');

startCreateJob({
  id: 'job-volt',
  chatId: 'chat-volt',
  path: 'C:\\Users\\test\\Projects\\VoltCore',
  projectId: 'proj-volt',
  name: 'VoltCore',
  files: { 'src/App.jsx': 'export default function App(){return <h1>Volt</h1>}' },
  originalBrief: 'Build VoltCore API',
  status: 'ready',
  previewUrl: 'http://127.0.0.1:5179',
});

// Newer unrelated job — must NOT be returned for chat-app
await new Promise((r) => setTimeout(r, 5));
startCreateJob({
  id: 'job-desk',
  chatId: 'chat-desk',
  path: 'C:\\Users\\test\\Projects\\DeskSite',
  projectId: 'proj-desk',
  name: 'DeskSite',
  files: { 'src/App.jsx': 'export default function App(){return <h1>Desk</h1>}' },
  originalBrief: 'Standing desk brand site',
  status: 'ready',
  previewUrl: 'http://127.0.0.1:5180',
});

assert.equal(
  getLatestReusableCreateJob({ chatId: 'chat-volt' })?.projectId,
  'proj-volt',
  'chat-owned job wins',
);
assert.equal(
  getLatestReusableCreateJob({ chatId: 'chat-missing' }),
  null,
  'missing chat must not steal another project',
);
assert.equal(
  getLatestReusableCreateJob(),
  null,
  'no-arg must refuse cross-chat guess',
);
assert.equal(
  getLatestReusableCreateJob({ allowCrossChat: true })?.projectId,
  'proj-desk',
  'explicit cross-chat returns newest',
);

console.log('smoke-reusable-create-job-chat-scope: ok');
