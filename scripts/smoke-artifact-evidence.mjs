/**
 * Non-web Ready requires artifactEvidence.runOk when provided.
 *   npx tsx --tsconfig tsconfig.app.json scripts/smoke-artifact-evidence.mjs
 */
import assert from 'node:assert/strict';
import { verifyArtifactFiles } from '../src/lib/artifactEvidence.ts';

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
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;

const cliOk = verifyArtifactFiles({
  'package.json': '{"name":"x","bin":{"x":"bin/cli.js"}}',
  'bin/cli.js': '#!/usr/bin/env node\n',
}, 'node-cli');
assert.equal(cliOk.runOk, true);

const apiOk = verifyArtifactFiles({
  'package.json': '{"name":"api"}',
  'src/server.js': 'app.get("/health", () => {})',
}, 'node-api');
assert.equal(apiOk.runOk, true);
assert.match(apiOk.runDetail, /health/i);

const apiBad = verifyArtifactFiles({ 'README.md': 'hi' }, 'node-api');
assert.equal(apiBad.runOk, false);

const {
  startCreateJob,
  markCreateJobReady,
  getCreateJobForChat,
} = await import('../src/lib/createJobStore.ts');

const job = startCreateJob({
  id: 'ev-job',
  chatId: 'ev-chat',
  path: 'C:\\tmp\\cli',
  projectId: 'proj-ev',
  name: 'Cli',
  files: { 'bin/cli.js': '#!/usr/bin/env node\n', 'package.json': '{}' },
  originalBrief: 'Build a node CLI tool',
  artifactKind: 'node-cli',
  status: 'verifying',
});

markCreateJobReady(job.id, null, 'ok', {
  allowWithoutPreview: true,
  artifactKind: 'node-cli',
  artifactEvidence: cliOk,
  brief: job.originalBrief,
});
assert.equal(getCreateJobForChat('ev-chat')?.status, 'ready');

const job2 = startCreateJob({
  id: 'ev-job2',
  chatId: 'ev-chat2',
  path: 'C:\\tmp\\cli2',
  projectId: 'proj-ev2',
  name: 'Cli2',
  files: {},
  originalBrief: 'Build a node CLI tool',
  artifactKind: 'node-cli',
  status: 'verifying',
});
markCreateJobReady(job2.id, null, 'bad', {
  allowWithoutPreview: true,
  artifactKind: 'node-cli',
  artifactEvidence: { kind: 'node-cli', runOk: false, runDetail: 'missing entry', evidencePath: '' },
  brief: job2.originalBrief,
});
assert.equal(getCreateJobForChat('ev-chat2')?.status, 'failed');

console.log('smoke-artifact-evidence: ok');
