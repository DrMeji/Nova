/**
 * DISABLED: fake clear→grow→flip-Strong loop.
 * Use scripts/_loop-honest-scan-implement.mjs instead.
 *
 * Escape hatch: ALLOW_FAKE_SCAN_LOOP=1
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

if (process.env.ALLOW_FAKE_SCAN_LOOP !== '1') {
  console.error(JSON.stringify({
    refused: true,
    reason: 'Fake scan→flip loop disabled — it never implemented product code.',
    use: 'node scripts/_loop-honest-scan-implement.mjs',
  }, null, 2));
  process.exit(2);
}

const root = path.dirname(fileURLToPath(import.meta.url));
const project = path.join(root, '..');
const progressPath = path.join(root, 'data', 'scan-implement-loop-progress.json');

const CYCLE_MAX = Number(process.env.CYCLE_MAX_ROWS || 500_000);
const WAVE_SIZE = Number(process.env.WAVE_SIZE || 100_000);
const SYNC_EVERY = Number(process.env.SYNC_EVERY || 1);

function run(label, script, args = [], env = {}) {
  console.log(`\n======== ${label} ========`);
  const r = spawnSync(process.execPath, [path.join(root, script), ...args], {
    cwd: project,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  if (r.status !== 0) throw new Error(`${label} failed status=${r.status}`);
}

function saveProgress(p) {
  fs.writeFileSync(progressPath, `${JSON.stringify(p, null, 2)}\n`);
}

const progress = {
  startedAt: new Date().toISOString(),
  cycleMaxRows: CYCLE_MAX,
  waveSize: WAVE_SIZE,
  note: 'Infinite scan→implement until process killed / user stop',
  cycles: [],
};

let cycle = 0;
console.log(`SCAN↔IMPLEMENT LOOP start cycleMax=${CYCLE_MAX} waveSize=${WAVE_SIZE}`);

while (true) {
  cycle += 1;
  const at = new Date().toISOString();
  console.log(`\n########## CYCLE ${cycle} CLEAR+SCAN → ${CYCLE_MAX} ##########`);
  run(`cycle ${cycle} clear`, '_clear-deep-rescan-fresh.mjs');
  run(`cycle ${cycle} research`, '_loop-deep-research-infinite.mjs', [], {
    DEEP_RESCAN_MAX: String(CYCLE_MAX),
    DEEP_RESCAN_MAX_WAVES: String(Math.ceil(CYCLE_MAX / WAVE_SIZE) + 2),
    WAVE_SIZE: String(WAVE_SIZE),
    SYNC_EVERY: String(SYNC_EVERY),
  });
  console.log(`\n########## CYCLE ${cycle} IMPLEMENT + VERIFY ##########`);
  run(`cycle ${cycle} implement`, '_implement-deep-rescan-stream.mjs');
  progress.cycles.push({ cycle, at, rows: CYCLE_MAX, doneAt: new Date().toISOString() });
  progress.updatedAt = new Date().toISOString();
  progress.lastCycle = cycle;
  saveProgress(progress);
  console.log(`\n########## CYCLE ${cycle} COMPLETE — looping ##########`);
}
