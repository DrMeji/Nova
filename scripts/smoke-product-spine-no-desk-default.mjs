/**
 * Non-desk / non-hardware product spines must not ship /heroes/desk.svg by default.
 *   npx tsx --tsconfig tsconfig.app.json scripts/smoke-product-spine-no-desk-default.mjs
 */
import assert from 'node:assert/strict';

const { materializeProductSpineFiles } = await import('../src/lib/createProductLadder.ts');

const coffee = materializeProductSpineFiles(
  'Build a brand website for Aurel Coffee with a shop and landing page',
  'Aurel Coffee',
  '11',
);
const app = String(coffee['src/App.jsx'] || '');
assert.doesNotMatch(app, /\/heroes\/desk\.svg/, 'coffee brand must not get desk hero');
assert.match(app, /\/logo\.svg|\/heroes\//, 'still has an offline hero/logo asset');

const desk = materializeProductSpineFiles(
  'Build a standing desk brand website for RidgeDesk with shop',
  'RidgeDesk',
  '22',
);
const deskApp = String(desk['src/App.jsx'] || '');
assert.match(deskApp, /\/heroes\/desk\.svg/, 'desk brand still gets desk hero');

console.log('smoke-product-spine-no-desk-default: ok');
