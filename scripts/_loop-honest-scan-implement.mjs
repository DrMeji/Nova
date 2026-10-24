/**
 * Honest loop: discover (optional) → grade from tests → pick next FAIL →
 * pause for real src/ implement → re-grade → persist Strong → sync canvas.
 *
 * Does NOT flip JSONL grades. Does NOT clear passing Strong.
 *
 * Env:
 *   FAMILY=prompt-fidelity     grade/implement filter
 *   MAX_CYCLES=1               default 1 (agent implements between cycles)
 *   SKIP_DISCOVER=1            skip append discover batch
 *   AUTO_GRADE_ONLY=1          grade+sync+print next fail; never claim implement
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { NEXT_FAIL_PATH, GRADE_REPORT_PATH, catalogStats, loadCatalogMap } from './lib/honestCatalog.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const project = path.join(root, '..');
const progressPath = path.join(root, 'data', 'honest-loop-progress.json');
const MAX_CYCLES = Math.max(1, Number(process.env.MAX_CYCLES || 1));
const FAMILY = process.env.FAMILY || 'prompt-fidelity';

function run(label, script, env = {}) {
  console.log(`\n======== ${label} ========`);
  const r = spawnSync(process.execPath, [path.join(root, script)], {
    cwd: project,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  if (r.status !== 0) throw new Error(`${label} failed status=${r.status}`);
}

const progress = {
  startedAt: new Date().toISOString(),
  family: FAMILY,
  note: 'Honest scan→implement: Strong only via tests. Agent must edit src/ for each FAIL.',
  cycles: [],
};

console.log(`HONEST LOOP start family=${FAMILY} maxCycles=${MAX_CYCLES}`);

if (process.env.SKIP_DISCOVER !== '1') {
  const batch = path.join(root, 'data', 'discover-batch.jsonl');
  if (fs.existsSync(batch) && fs.statSync(batch).size > 0) {
    run('discover append', '_discover-append-catalog.mjs');
  } else {
    console.log('discover: no discover-batch.jsonl — seeding from OPEN_ALL_CAPS if catalog empty');
    if (loadCatalogMap().size === 0) {
      run('seed catalog', '_seed-honest-catalog.mjs');
    }
  }
} else if (loadCatalogMap().size === 0) {
  run('seed catalog', '_seed-honest-catalog.mjs');
}

for (let cycle = 1; cycle <= MAX_CYCLES; cycle += 1) {
  console.log(`\n########## HONEST CYCLE ${cycle} GRADE ##########`);
  run(`cycle ${cycle} grade`, '_grade-catalog-from-tests.mjs', { FAMILY });
  run(`cycle ${cycle} canvas`, '_sync-honest-catalog-canvas.mjs');

  const report = fs.existsSync(GRADE_REPORT_PATH)
    ? JSON.parse(fs.readFileSync(GRADE_REPORT_PATH, 'utf8'))
    : null;
  const next = fs.existsSync(NEXT_FAIL_PATH)
    ? JSON.parse(fs.readFileSync(NEXT_FAIL_PATH, 'utf8'))
    : null;
  const stats = catalogStats();

  progress.cycles.push({
    cycle,
    at: new Date().toISOString(),
    verdict: report?.verdict,
    stats,
    nextFail: next ? { stem: next.stem, family: next.family, grade: next.grade } : null,
  });
  progress.updatedAt = new Date().toISOString();
  fs.writeFileSync(progressPath, `${JSON.stringify(progress, null, 2)}\n`);

  if (!next) {
    console.log(JSON.stringify({
      done: true,
      message: `No open FAILs with tests in family=${FAMILY}`,
      stats,
      verdict: report?.verdict,
    }, null, 2));
    break;
  }

  console.log('\n########## NEXT FAIL — REAL IMPLEMENT REQUIRED ##########');
  console.log(JSON.stringify({
    stem: next.stem,
    family: next.family,
    grade: next.grade,
    lastFail: next.lastFail,
    targetFiles: next.targetFiles,
    instruction: next.instruction,
    note: 'Scripts cannot invent product logic. Edit src/, then re-run this loop / grade.',
  }, null, 2));

  if (process.env.AUTO_GRADE_ONLY === '1' || process.env.STOP_FOR_IMPLEMENT !== '0') {
    // Default: stop so the agent/human implements, then re-run.
    console.log('\nHONEST LOOP paused for implement (re-run after src/ fix).');
    break;
  }
}

console.log('\nHONEST LOOP cycle complete');
console.log(JSON.stringify({ progressPath, stats: catalogStats() }, null, 2));
