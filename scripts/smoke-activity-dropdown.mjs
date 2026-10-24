/**
 * Smoke: status labels classify into Cursor-style activity kinds.
 *   npx tsx --tsconfig tsconfig.app.json scripts/smoke-activity-dropdown.mjs
 */
import assert from 'node:assert/strict';
import {
  classifyStatusActivity,
  compressActivitySteps,
  enrichActivityStep,
  formatLiveWorkingHeader,
  formatWorkingDuration,
} from '../src/lib/chatTurnActivity.ts';
import {
  normalizeStatusHistory,
  pushChatTurnStatus,
  getChatTurnStatus,
  clearChatTurnStatus,
  forgetFinishedChatTurnStatus,
} from '../src/lib/chatTurnStatusStore.ts';

assert.equal(classifyStatusActivity('Thinking: user asks two vague questions').kind, 'thinking');
assert.equal(classifyStatusActivity('Creating folder in NOVA Projects (fern-latch)…').kind, 'list');
assert.equal(classifyStatusActivity('Reading src/App.jsx').kind, 'read');
assert.equal(classifyStatusActivity('Writing src/App.jsx: layout, sections, and interactions…').kind, 'write');
assert.equal(classifyStatusActivity('Building package.json: dependencies and project name…').kind, 'write');
assert.equal(classifyStatusActivity('npm · installing while invent continues…').kind, 'install');
assert.equal(classifyStatusActivity('Installing npm packages…').kind, 'install');
assert.equal(classifyStatusActivity('Fix: Craft stalled : step wall').kind, 'fix');
assert.equal(classifyStatusActivity('Architect · plan unique site (Qwen)…').kind, 'plan');
assert.equal(classifyStatusActivity('Search QUALITY_FLOOR').kind, 'search');
assert.equal(classifyStatusActivity('To-dos 1/4 done').kind, 'todos');
assert.equal(classifyStatusActivity('Invent floor · hero/shop/story seeded…').kind, 'invent');
assert.equal(classifyStatusActivity('Style · Fraunces + parchment atmosphere…').kind, 'design');
assert.equal(classifyStatusActivity('Fetching images for this brief…').kind, 'assets');
assert.equal(classifyStatusActivity('Heal · parchment palette restored…').kind, 'heal');
assert.equal(classifyStatusActivity('Checking Preview is really ready…').kind, 'verify');
assert.equal(classifyStatusActivity('Starting the live Preview server…').kind, 'preview');
assert.equal(classifyStatusActivity('Scaffolding the Vite project…').kind, 'scaffold');
assert.equal(classifyStatusActivity('Loading model · Qwen2.5-Coder…').kind, 'connect');
assert.equal(classifyStatusActivity('Debug clinic · Pass 1 inventory…').kind, 'analyze');
assert.equal(classifyStatusActivity('Copy · product headlines…').kind, 'copy');
assert.equal(classifyStatusActivity('Applying UI patch…').kind, 'apply');
assert.equal(classifyStatusActivity('Updating project files…').kind, 'edit');
assert.equal(classifyStatusActivity('Plan: outline sections from brief').kind, 'plan');
assert.equal(classifyStatusActivity('Invent: unique shop from brief').kind, 'invent');
assert.equal(
  classifyStatusActivity('Spine: Scaffold (4/12) · Vite scaffold').kind,
  'scaffold',
);
assert.equal(
  classifyStatusActivity('Spine: Floor (5/12) · invent floor').kind,
  'floor',
);
assert.equal(
  classifyStatusActivity('Spine: Craft (7/12) · invent enrich').kind,
  'craft',
);
assert.equal(
  classifyStatusActivity('Spine: Heal (8/12) · remount + heal').kind,
  'heal',
);

// Invent firehose compresses to ≤2 Invent rows.
{
  const flood = Array.from({ length: 12 }, (_, i) => enrichActivityStep({
    label: i % 2 === 0
      ? `Invent directions: dir-${i}=Hero-forward`
      : `Invent Subagent fork : ${20 + i} files`,
    at: 1_000 + i * 100,
  }));
  flood.push(enrichActivityStep({ label: 'Spine: Floor (5/12) · invent floor', at: 2_500 }));
  flood.push(enrichActivityStep({ label: 'Installing npm packages…', at: 3_000 }));
  flood.push(enrichActivityStep({ label: 'Spine: Craft (7/12) · invent enrich', at: 3_500 }));
  const slim = compressActivitySteps(flood);
  assert.ok(slim.length <= 8, `trail too long: ${slim.length}`);
  assert.ok(slim.filter((s) => s.kind === 'invent').length <= 2, 'too many Invent rows');
  assert.ok(slim.some((s) => s.kind === 'floor'), 'Floor spine row missing');
  assert.ok(slim.some((s) => s.kind === 'craft'), 'Craft spine row missing');
  assert.ok(slim.some((s) => s.kind === 'install'), 'Install row missing');
}

const { progressiveSpineStages } = await import('../src/components/CreateSpineProgressStrip.tsx');
const mid = progressiveSpineStages('craft', 3);
assert.deepEqual(mid.stages, ['floor', 'npm', 'craft']);
assert.equal(mid.absoluteIdx, 6);
const early = progressiveSpineStages('disk', 3);
assert.deepEqual(early.stages, ['hard-go', 'brief', 'disk']);
const none = progressiveSpineStages(null, 3);
assert.equal(none.stages.length, 0);

const run = classifyStatusActivity('npm run typecheck — Success');
assert.equal(run.kind, 'run');
assert.equal(run.runStatus, 'success');

const hist = normalizeStatusHistory([
  'Thinking: Building Fern Latch from the brief',
  'Creating folder in NOVA Projects (fern-latch)…',
  'Writing src/App.jsx: layout…',
  'Reading package.json',
  'npm · installing while invent continues…',
  'Fix: App still bare scaffold',
], 'Working…');
assert.ok(hist.every((h) => h.kind), 'each step has a kind');
const compressed = compressActivitySteps(hist.map(enrichActivityStep));
assert.ok(compressed.length >= 4, `expected several activity rows, got ${compressed.length}`);
assert.ok(compressed.some((s) => s.kind === 'thinking'));
assert.ok(compressed.some((s) => s.kind === 'write'));
assert.ok(compressed.some((s) => s.kind === 'install' || s.kind === 'run'));

assert.match(formatWorkingDuration(97_000, false), /Working for 1m 37s/);
assert.match(formatWorkingDuration(97_000, true), /Worked for 1m 37s/);

assert.match(
  formatLiveWorkingHeader({
    kind: 'spine',
    summary: 'Thin create · genre seed before depth · clearsLive=no · logo=other',
  }),
  /^Spine · Thin create/,
);
assert.match(
  formatLiveWorkingHeader({
    kind: 'verify',
    summary: 'Live evidence · targeted build repair 1/2',
  }),
  /^Verify · Live evidence/,
);
{
  const fs = await import('node:fs');
  const css = fs.readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
  assert.match(css, /\.nova-build-signal\b/);
  assert.match(css, /@keyframes nova-build-point/);
  const progress = fs.readFileSync(new URL('../src/components/AgentProgressStatus.tsx', import.meta.url), 'utf8');
  assert.match(progress, /BuildSignal/);
  assert.match(progress, /formatLiveWorkingHeader/);
  assert.doesNotMatch(progress, /Now ·/);
}
assert.equal(
  formatLiveWorkingHeader({ kind: 'spine', summary: 'Spine: Thin create · genre seed' }),
  'Spine · Thin create · genre seed',
);

forgetFinishedChatTurnStatus('a1');
clearChatTurnStatus('a1');
pushChatTurnStatus({
  chatId: 'c1',
  assistantId: 'a1',
  label: 'Writing src/sections/HeroSection.jsx…',
});
const live = getChatTurnStatus();
assert.equal(live?.history?.[0]?.kind, 'write');
assert.match(String(live?.history?.[0]?.summary || ''), /HeroSection/);
clearChatTurnStatus('a1');
forgetFinishedChatTurnStatus('a1');

console.log('smoke-activity-dropdown: ok');
