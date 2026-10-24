/**
 * 10-cycle deep-rescan loop:
 *   Cycle 1: implement current 100k → all Strong
 *   Cycles 2–10: grow +100k research → implement all Strong
 * Ends ~1_000_000 rows, all Strong. Slim canvas synced each cycle.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const root = path.dirname(fileURLToPath(import.meta.url));
const project = path.join(root, '..');
const progressPath = path.join(root, 'data', 'loop-10x-progress.json');
const CYCLES = 10;

function run(label, args, env = {}) {
  console.log(`\n======== ${label} ========`);
  const r = spawnSync(process.execPath, args, {
    cwd: project,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  if (r.status !== 0) {
    throw new Error(`${label} failed with status ${r.status}`);
  }
}

const progress = {
  startedAt: new Date().toISOString(),
  cycles: [],
};

for (let cycle = 1; cycle <= CYCLES; cycle++) {
  const target = cycle * 100_000;
  console.log(`\n########## CYCLE ${cycle}/${CYCLES} → target ${target} ##########`);

  if (cycle > 1) {
    run(`grow→${target}`, [path.join(root, '_grow-deep-rescan-plus100k.mjs'), String(target)], {
      DEEP_RESCAN_CYCLE: String(cycle),
    });
  }

  run(`implement cycle ${cycle}`, [path.join(root, '_implement-deep-rescan-jsonl.mjs')], {
    DEEP_RESCAN_CYCLE: String(cycle),
  });

  const metaPath = path.join(root, 'data', 'deep-rescan-meta.json');
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  progress.cycles.push({
    cycle,
    target,
    at: new Date().toISOString(),
    rows: meta.rows,
    openAfter: meta.openAfter,
    openClosed: meta.openClosed,
  });
  progress.updatedAt = new Date().toISOString();
  fs.writeFileSync(progressPath, `${JSON.stringify(progress, null, 2)}\n`);

  if (meta.openAfter !== 0) {
    throw new Error(`Cycle ${cycle}: openAfter=${meta.openAfter} (expected 0)`);
  }
}

progress.finishedAt = new Date().toISOString();
progress.ok = true;
fs.writeFileSync(progressPath, `${JSON.stringify(progress, null, 2)}\n`);
console.log('\n########## 10x LOOP COMPLETE ##########');
console.log(JSON.stringify(progress, null, 2));
