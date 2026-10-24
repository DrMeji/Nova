/**
 * Artifact kind: product-site is opt-in; CLI/API/dashboard are not product invent.
 *   npx tsx --tsconfig tsconfig.app.json scripts/smoke-artifact-kind.mjs
 */
import assert from 'node:assert/strict';
import {
  resolveArtifactKind,
  artifactWantsProductLadder,
  isProductSiteAsk,
} from '../src/lib/createArtifactKind.ts';
import { classifyTurn } from '../src/lib/classifyTurn.ts';

assert.equal(resolveArtifactKind('Build a node CLI tool that renames files'), 'node-cli');
assert.equal(resolveArtifactKind('Build an Express REST API for todos — no frontend'), 'node-api');
assert.equal(resolveArtifactKind('Build a React dashboard for sales metrics on disk'), 'web-app');
assert.equal(
  resolveArtifactKind('Build a landing page for Voltcore, a gaming mouse brand, with a shop'),
  'product-site',
);
assert.equal(resolveArtifactKind('Create a TypeScript library for date parsing'), 'library');
assert.equal(resolveArtifactKind('Write a Python FastAPI service for invoices'), 'python');

assert.equal(artifactWantsProductLadder('node-cli', 'Build a CLI'), false);
assert.equal(artifactWantsProductLadder('web-app', 'Build a dashboard'), false);
assert.equal(
  artifactWantsProductLadder(
    'product-site',
    'Build a landing page for Voltcore gaming mouse with shop',
  ),
  true,
);
assert.equal(isProductSiteAsk('Build a React dashboard for sales'), false);
assert.equal(isProductSiteAsk('Standing desk brand website with shop'), true);

const dash = classifyTurn('Build a React dashboard for sales metrics on disk', { workspaceEmpty: true });
assert.equal(dash.kind, 'create', `dashboard create, got ${dash.kind}/${dash.reason}`);

const cli = classifyTurn('Build a node CLI tool that renames files', { workspaceEmpty: true });
assert.equal(cli.kind, 'create');

console.log('smoke-artifact-kind: ok', { dash, cli });
