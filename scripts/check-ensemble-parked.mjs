/**
 * Ensemble Auto stays parked; multi-hop resolve stays single-craft.
 *   npx tsx --tsconfig tsconfig.app.json scripts/check-ensemble-parked.mjs
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

const { resolveCreateEnsembleTeam } = await import('../src/lib/createEnsemble.ts');
const {
  getLocalPrefs,
  isEnsembleAutoParked,
  setLocalPrefs,
} = await import('../src/lib/localPrefs.ts');

setLocalPrefs({ ensembleAutoParked: true });
assert.equal(isEnsembleAutoParked(), true, 'isEnsembleAutoParked when parked');
assert.equal(getLocalPrefs().ensembleAutoParked, true, 'prefs ensembleAutoParked');

const models = [
  { id: 'qwen25-7b', name: 'Qwen2.5 7B', status: 'ready' },
  { id: 'uigen-fx-4b', name: 'UIGEN-FX 4B', status: 'ready' },
  { id: 'qwen25-coder-7b', name: 'Qwen2.5 Coder 7B', status: 'ready' },
];

const forced = resolveCreateEnsembleTeam(models, {
  allowMultiHop: true,
  craftId: 'qwen25-coder-7b',
  ramGb: 16,
});
assert.equal(forced.multiHop, false, 'parked forces multiHop false even when allowMultiHop true');
assert.ok(
  forced.members.every((m) => m.role === 'craft'),
  `parked team is craft-only, got: ${forced.members.map((m) => m.role).join(',')}`,
);

// Explicit unpark restores multi-hop opt-in (code not deleted).
setLocalPrefs({ ensembleAutoParked: false });
assert.equal(isEnsembleAutoParked(), false, 'unpark works');
const multi = resolveCreateEnsembleTeam(models, {
  allowMultiHop: true,
  craftId: 'qwen25-coder-7b',
  ramGb: 16,
});
assert.equal(multi.multiHop, true, 'unparked + allowMultiHop can multiHop');
assert.ok(multi.members.length >= 2, 'unparked team has multiple seats');

setLocalPrefs({ ensembleAutoParked: true });
assert.equal(getLocalPrefs().ensembleAutoParked, true, 're-park sticks');
assert.equal(getLocalPrefs().multiModelCreate, false, 'multiModelCreate stays dead');

console.log('check-ensemble-parked: ok');
