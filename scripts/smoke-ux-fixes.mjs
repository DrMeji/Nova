/**
 * Small smoke checks for the MossMarket post-mortem fixes.
 * Run: node --experimental-strip-types scripts/smoke-ux-fixes.mjs
 * (or npx tsx if available)
 */
import assert from 'assert';
import { formatStepDurationMs } from '../src/lib/chatTurnStatusStore.ts';
import { extractProjectName } from '../src/lib/createProjectIntent.ts';
import { looksLikeGreenfieldKeepPlanning } from '../src/lib/chatIdeaIntent.ts';

assert.strictEqual(formatStepDurationMs(0), '0s');
assert.strictEqual(formatStepDurationMs(400), '<1s');
assert.strictEqual(formatStepDurationMs(1200), '1s');
assert.strictEqual(formatStepDurationMs(65_000), '1m 05s');
assert.strictEqual(formatStepDurationMs(205_000), '3m 25s');
console.log('ok timers');

const moss = extractProjectName(
  'ok build MossMarket now. phone-friendly stall browser with save-a-bag + undo. create the project on disk in NOVA Projects.',
);
assert.strictEqual(moss, 'MossMarket', `expected MossMarket got ${moss}`);
const noNova = extractProjectName('create the project on disk in NOVA Projects');
assert.ok(!noNova || !/^nova$/i.test(noNova), `must not name product NOVA, got ${noNova}`);
console.log('ok naming');

assert.ok(looksLikeGreenfieldKeepPlanning('fold those into the plan'));
assert.ok(looksLikeGreenfieldKeepPlanning('love those. fold those into the plan please'));
assert.ok(looksLikeGreenfieldKeepPlanning('expand the plan'));
console.log('ok plan-fold');

console.log('smoke-ux-fixes passed');
