/**
 * Coding asks with product nouns must NOT become product-site.
 *   npx tsx --tsconfig tsconfig.app.json scripts/smoke-artifact-kind-hijack.mjs
 */
import assert from 'node:assert/strict';
import { resolveArtifactKind, isProductSiteAsk } from '../src/lib/createArtifactKind.ts';

const cases = [
  ['Build a node CLI tool for a coffee shop inventory', 'node-cli'],
  ['Build an Express API for a restaurant booking website', 'node-api'],
  ['Build a TypeScript library for date range parsing', 'library'],
  ['Build a React dashboard for sales metrics', 'web-app'],
  ['Make a canvas snake game', 'game'],
  ['Build a website for a coffee brand', 'product-site'],
  ['Build a gaming mouse brand website with shop', 'product-site'],
  ['Create a python script to rename files', 'python'],
  ['Build an Electron app with tray IPC', 'electron'],
  ['Write a pytest test suite for the parser module', 'test-suite'],
];

for (const [ask, want] of cases) {
  const got = resolveArtifactKind(ask);
  assert.equal(got, want, `${ask} → ${got} (want ${want}); product=${isProductSiteAsk(ask)}`);
}

assert.equal(isProductSiteAsk('Build a node CLI tool for a coffee shop inventory'), false);
assert.equal(isProductSiteAsk('Build a website for a coffee brand'), true);

console.log('smoke-artifact-kind-hijack: ok');
