/**
 * Structure-first create brief + ready gate.
 *   npx tsx --tsconfig tsconfig.app.json scripts/smoke-structure-first.mjs
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

const { wantsStructureFirstCreate, buildCreateBrief } = await import('../src/lib/novaBuildLoop.ts');

assert.equal(wantsStructureFirstCreate('Build a tip calculator'), true);
assert.equal(wantsStructureFirstCreate('Build a gin brand website'), true);

const tipBrief = buildCreateBrief({
  brief: 'Build TipLab tip calculator with bill and tip percent inputs and totals',
  productName: 'TipLab',
  files: { 'src/App.tsx': 'export default function App(){return <div/>}' },
  projectId: 'p',
});
assert.match(tipBrief, /STRUCTURE FIRST/i);
assert.match(tipBrief, /Skip TOOL: assets/i);
assert.doesNotMatch(tipBrief, /Premium depth|TOOL: assets\. Fix failures/i);
assert.match(tipBrief, /bill|tip|inputs/i);

console.log('smoke-structure-first: ok');
