/**
 * A visual-depth failure must not short-circuit npm/build diagnostics.
 * Run with: node scripts/check-create-build-reaches-runtime.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/lib/chatTurnHandlers/create.ts', import.meta.url), 'utf8');
const gateStart = source.indexOf('// Keep the visual floor as a Ready gate');
const installStart = source.indexOf("host.pushStatus('Installing project dependencies (npm)", gateStart);
assert.ok(gateStart >= 0 && installStart > gateStart, 'visual gate and dependency install stages must exist in order');

const visualGate = source.slice(gateStart, installStart);
assert.match(visualGate, /thinBlocksLivePreview/);
assert.match(visualGate, /uiPolishOk\s*=\s*false/);
assert.doesNotMatch(visualGate, /return\s*\{\s*status:\s*['"]handled['"]/,
  'an open visual floor must not return before build diagnostics');

const runtimeStart = source.indexOf("const { runCreateVerifyAndFix } = await import('@/lib/createRuntimeLoop')", installStart);
assert.ok(runtimeStart > installStart, 'installed projects must reach the runtime build/evidence loop');
assert.match(source.slice(runtimeStart, runtimeStart + 2200), /repairBuild:/,
  'runtime build failures must have a bounded coder repair callback');

assert.match(source, /async function runCreatePackageBuildWithRepair/,
  'a project that cannot start Vite must still get a production build check');
assert.match(source, /bootstrap\.npmInstalled\s*&&\s*!bootstrap\.previewLive/,
  'build-only verification must cover projects whose preview server failed');
assert.match(source, /\*\*Package build:\*\* passed/);
assert.match(source, /\*\*Package build:\*\* failed/);

console.log('check-create-build-reaches-runtime: ok');
