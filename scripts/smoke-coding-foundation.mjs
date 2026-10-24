/**
 * Coding foundation — agent loop owns edit + create by default.
 *   npx tsx --tsconfig tsconfig.app.json scripts/smoke-coding-foundation.mjs
 */
import assert from 'node:assert/strict';

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  };
}
if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}

const { getLocalPrefs, setLocalPrefs } = await import('../src/lib/localPrefs.ts');
const {
  shouldUseNovaEditBuildLoop,
  shouldUseNovaCreateBuildLoop,
} = await import('../src/lib/novaBuildLoop.ts');
const { isCreateV2Active } = await import('../src/lib/createV2.ts');
const { canUnlockCreateLive } = await import('../src/lib/createReady.ts');
const { judgeCreateVerified } = await import('../src/lib/createPassSpine.ts');
const { emptyCreateEvidence, finalizeCreateEvidence } = await import('../src/lib/createEvidence.ts');

// Fresh defaults (empty storage → DEFAULT_PREFS).
localStorage.clear();
const prefs = getLocalPrefs();
assert.equal(prefs.agentLoopOnEdit, true, 'default agentLoopOnEdit on');
assert.equal(prefs.agentLoopOnCreate, true, 'default agentLoopOnCreate on');
assert.equal(prefs.agentLoopEnabled, true, 'default agentLoopEnabled on');
assert.equal(shouldUseNovaEditBuildLoop(), true, 'edit build loop enabled by default');
assert.equal(shouldUseNovaCreateBuildLoop(), true, 'create build loop enabled by default');
assert.equal(isCreateV2Active(), false, 'createV2 invent demoted when agent loop on create');

// Migrate v12-era blob (loops forced off) → v15 turns them back on.
localStorage.clear();
localStorage.setItem('NOVA:local-prefs', JSON.stringify({
  prefsVersion: 12,
  agentLoopOnEdit: false,
  agentLoopOnCreate: false,
  agentLoopEnabled: true,
  multiModelCreate: false,
}));
const migrated = getLocalPrefs();
assert.ok((migrated.prefsVersion || 0) >= 15, 'prefs migrate to v15+');
assert.equal(migrated.agentLoopOnEdit, true, 'v15 forces agentLoopOnEdit');
assert.equal(migrated.agentLoopOnCreate, true, 'v15 forces agentLoopOnCreate');
assert.equal(shouldUseNovaEditBuildLoop(), true);
assert.equal(shouldUseNovaCreateBuildLoop(), true);

// Live unlock with URL; composition soft.
const evidence = finalizeCreateEvidence(emptyCreateEvidence({
  staticReady: true, npmInstalled: true, httpOk: true, mounted: true,
  consoleClean: true, smokeOk: true,
}));
const thin = judgeCreateVerified({
  evidence,
  files: { 'src/App.jsx': 'export default function App(){return <main>Hi</main>}', 'src/App.css': '.app{}' },
  brief: 'Build a matcha brand website with tasting notes and shop',
  productName: 'Verdigris',
});
assert.equal(thin.liveUnlock, true, 'mount evidence unlocks Live');
assert.equal(thin.qualityReady, false, 'thin composition denies quality Ready');

const unlock = canUnlockCreateLive(
  {
    id: 'cf1',
    chatId: 'c',
    path: '',
    projectId: 'p',
    name: 'Verdigris',
    files: { 'src/App.jsx': 'export default function App(){return <main/>}' },
    status: 'verifying',
    previewUrl: 'http://127.0.0.1:5173/',
    craftBlocked: false,
    blockedReasons: [],
    updatedAt: Date.now(),
  },
  { 'src/App.jsx': 'export default function App(){return <main/>}' },
  'Build a matcha brand website',
);
assert.equal(unlock.ok, true, 'canUnlockCreateLive ok with preview URL');

// Explicit off still works for power users.
setLocalPrefs({ agentLoopOnEdit: false, agentLoopOnCreate: false });
assert.equal(shouldUseNovaEditBuildLoop(), false);
assert.equal(shouldUseNovaCreateBuildLoop(), false);
assert.equal(isCreateV2Active(), true, 'createV2 invent active when create loop explicitly off');

console.log('smoke-coding-foundation: ok');
