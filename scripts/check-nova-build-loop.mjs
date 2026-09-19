/**
 * Static regression: Nova build-loop modules parse + prefs + tool names.
 * No network. Free forever — asserts no paywall strings in new modules.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  'src/lib/novaStudioModes.ts',
  'src/lib/novaBuildContext.ts',
  'src/lib/novaBuildLoop.ts',
  'src/lib/arkAgentLoop.ts',
  'src/lib/localPrefs.ts',
];

for (const rel of files) {
  const abs = path.join(root, rel);
  assert.ok(fs.existsSync(abs), `missing ${rel}`);
  const text = fs.readFileSync(abs, 'utf8');
  assert.ok(text.length > 200, `${rel} too small`);
  // Hard ban: Nova must never introduce product paywalls in these modules.
  assert.ok(
    !/\b(stripe\.com|requirePayment|mustSubscribe|unlockPro|\$\d+\s*\/\s*mo)\b/i.test(text),
    `${rel} looks like a paywall hook`,
  );
}

const loop = fs.readFileSync(path.join(root, 'src/lib/arkAgentLoop.ts'), 'utf8');
assert.ok(/TOOL_NAMES = '[\w|]*ready[\w|]*assets[\w|]*'/.test(loop) || /ready\|assets/.test(loop), 'ready/assets tools missing');
assert.ok(/action\.tool === 'ready'/.test(loop), 'ready handler missing');
assert.ok(/action\.tool === 'assets'/.test(loop), 'assets handler missing');
assert.ok(/Nova is free/.test(loop), 'free forever prompt missing');

const prefs = fs.readFileSync(path.join(root, 'src/lib/localPrefs.ts'), 'utf8');
assert.ok(/agentLoopOnCreate:\s*boolean/.test(prefs), 'agentLoopOnCreate type missing');
assert.ok(/agentLoopOnCreate:\s*true/.test(prefs), 'agentLoopOnCreate default should be true');
assert.ok(/planApproveGate:\s*false/.test(prefs), 'planApproveGate default off');

const modes = fs.readFileSync(path.join(root, 'src/lib/novaStudioModes.ts'), 'utf8');
assert.ok(/formatBuildPlanReply/.test(modes), 'plan reply missing');
assert.ok(/no paywall/i.test(modes), 'plan must say no paywall');

const create = fs.readFileSync(path.join(root, 'src/lib/chatTurnHandlers/create.ts'), 'utf8');
assert.ok(/runNovaCreateBuildLoop/.test(create), 'create must call Nova build loop');
assert.ok(/planApproveGate/.test(create), 'create must honor plan gate');

const edit = fs.readFileSync(path.join(root, 'src/lib/chatTurnHandlers/edit.ts'), 'utf8');
assert.ok(/shouldUseNovaEditBuildLoop/.test(edit), 'edit must opt into Nova loop');

console.log('check-nova-build-loop: OK');
