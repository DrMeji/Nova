/**
 * Fix #1 (Moss Thread): early npm kick must dedupe and be wired for late await.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  kickEarlyNpmInstall,
  peekEarlyNpmInstall,
  clearEarlyNpmInstallJobs,
  normalizeProjectNpmKey,
} from '../src/lib/createProjectFlow.ts';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
clearEarlyNpmInstallJobs();

assert.equal(
  normalizeProjectNpmKey('C:\\Users\\a\\proj\\'),
  normalizeProjectNpmKey('C:/Users/a/proj'),
  'npm key normalizes slashes',
);

// Without Electron agentRun, bootstrap fails soft — still must dedupe one job.
const a = kickEarlyNpmInstall('/tmp/nova-early-npm-smoke', 'vite-react', {
  files: {
    'package.json': JSON.stringify({
      name: 'smoke',
      private: true,
      type: 'module',
      dependencies: { react: '^18.3.1' },
      devDependencies: { vite: '^5.4.11' },
    }),
  },
  npmTimeoutMs: 5_000,
});
const b = kickEarlyNpmInstall('/tmp/nova-early-npm-smoke', 'vite-react', {
  files: { 'package.json': '{}' },
  npmTimeoutMs: 5_000,
});
assert.equal(a, b, 'second kick returns same promise');
assert.equal(peekEarlyNpmInstall('/tmp/nova-early-npm-smoke'), a, 'peek matches');
const result = await a;
assert.equal(typeof result.npmInstalled, 'boolean');
clearEarlyNpmInstallJobs();
assert.equal(peekEarlyNpmInstall('/tmp/nova-early-npm-smoke'), null, 'cleared');

const createSrc = fs.readFileSync(path.join(root, 'src/lib/chatTurnHandlers/create.ts'), 'utf8');
assert.match(createSrc, /kickEarlyNpmInstall/, 'create kicks early npm');
assert.match(createSrc, /npm · installing while invent continues/, 'status copy present');
assert.match(createSrc, /peekEarlyNpmInstall/, 'late path awaits early npm');
assert.match(createSrc, /awaiting early install started during invent/, 'late await status');

const flowSrc = fs.readFileSync(path.join(root, 'src/lib/createProjectFlow.ts'), 'utf8');
assert.match(flowSrc, /node_modules\/vite already on disk — skipping npm install/, 'skip double install');

console.log('smoke-early-npm-kick: ok');
