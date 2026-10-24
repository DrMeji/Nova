#!/usr/bin/env node
/**
 * K1 invent craft pack — peer bar after invent-demo removal.
 * Demo compose must stay empty; craft helpers (salt, logo lock) still work.
 */
import assert from 'node:assert/strict';
import {
  composeInventDemoSite,
  applyInventDemoToFiles,
  inventDemoHostStampAllowed,
  appLooksLikeInventIncomplete,
} from '../src/lib/createInventDemo.ts';
import {
  inventLayoutSalt,
  assertInventLogoLock,
} from '../src/lib/inventCraftPack.ts';

assert.equal(inventDemoHostStampAllowed(), false, 'host stamp permanently off');

const brand = 'RidgeForge Carry';
const brief = 'Create a premium luggage brand site with travel bags';
const demo = composeInventDemoSite({ brand, brief });
assert.deepEqual(demo.files, {}, 'composeInventDemoSite must return empty files');
assert.match(demo.note, /removed|invent from brief/i);

const applied = applyInventDemoToFiles(
  { 'src/App.jsx': 'export default function App(){return null}' },
  brand,
  brief,
  { force: true },
);
assert.equal(applied.applied, false, 'applyInventDemoToFiles never stamps');
assert.equal(
  applied.files['src/App.jsx'],
  'export default function App(){return null}',
  'prior files unchanged',
);

const salt = inventLayoutSalt(brand, brief);
assert.equal(typeof salt, 'number');
assert.ok(salt >= 0);

const lucide = '<svg viewBox="0 0 24 24"><path d="M9.937 15.5"/></svg>';
const noDemo = {
  'src/App.jsx': 'export default function App(){return <div/>}',
  'public/logo.svg': lucide,
};
assert.equal(
  assertInventLogoLock(noDemo, lucide).ok,
  true,
  'no invent-demo lock → Lucide allowed (model invent owns mark)',
);

const leftoverDemo = {
  'src/App.jsx': 'export default function App(){return <div data-nova-invent-demo="1"/>}',
  'public/logo.svg': '<svg data-nova-invent-logo="1" viewBox="0 0 64 64"><rect width="64" height="64"/></svg>',
};
assert.equal(
  assertInventLogoLock(leftoverDemo, lucide).ok,
  false,
  'leftover invent-demo logo lock blocks Lucide overwrite',
);

assert.equal(
  appLooksLikeInventIncomplete({
    'src/App.jsx': 'export default function App(){return <div data-nova-invent-demo="1"/>}',
  }),
  true,
  'leftover invent-demo marker = incomplete',
);

console.log('smoke-invent-craft-pack: ok — invent-demo empty + craft helpers');
