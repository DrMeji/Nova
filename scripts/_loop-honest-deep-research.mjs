/**
 * Continuous honest deep-research loop (top → bottom):
 *   research peers → append catalog → grade all testable families top-down
 *   → print next FAIL for implement → (optional) stop for agent src/ fix
 *   → re-grade → sync canvas → repeat
 *
 * Env:
 *   MAX_WAVES=20
 *   RESEARCH_EVERY=1     run peer batch every N waves
 *   STOP_FOR_IMPLEMENT=1 pause when a FAIL needs src/ work (default)
 *   FAMILY=              empty = grade all families with tests
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { catalogStats, loadCatalogMap, NEXT_FAIL_PATH, GRADE_REPORT_PATH } from './lib/honestCatalog.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const project = path.join(root, '..');
const progressPath = path.join(root, 'data', 'honest-deep-research-progress.json');
const MAX_WAVES = Math.max(1, Number(process.env.MAX_WAVES || 20));
const RESEARCH_EVERY = Math.max(1, Number(process.env.RESEARCH_EVERY || 1));
const STOP = process.env.STOP_FOR_IMPLEMENT !== '0';

function run(label, script, env = {}) {
  console.log(`\n======== ${label} ========`);
  const r = spawnSync(process.execPath, [path.join(root, script)], {
    cwd: project,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  if (r.status !== 0 && r.status !== 2) throw new Error(`${label} failed status=${r.status}`);
  return r.status || 0;
}

const progress = {
  startedAt: new Date().toISOString(),
  note: 'Top→bottom honest deep research. Strong only via tests.',
  waves: [],
};

console.log(`HONEST DEEP RESEARCH LOOP waves=${MAX_WAVES}`);

if (loadCatalogMap().size === 0) {
  run('seed', '_seed-honest-catalog.mjs');
}

for (let wave = 1; wave <= MAX_WAVES; wave += 1) {
  console.log(`\n########## WAVE ${wave}/${MAX_WAVES} ##########`);

  if ((wave - 1) % RESEARCH_EVERY === 0) {
    run(`wave ${wave} peer research`, '_deep-research-peers-batch.mjs', { APPLY: '1' });
  }

  // Grade top→bottom: fidelity → conversation → protocol → craft (no FAMILY = all testable)
  run(`wave ${wave} grade`, '_grade-catalog-from-tests.mjs', {
    FAMILY: process.env.FAMILY || '',
  });
  run(`wave ${wave} canvas`, '_sync-honest-catalog-canvas.mjs');

  const report = fs.existsSync(GRADE_REPORT_PATH)
    ? JSON.parse(fs.readFileSync(GRADE_REPORT_PATH, 'utf8'))
    : null;
  const next = fs.existsSync(NEXT_FAIL_PATH)
    ? JSON.parse(fs.readFileSync(NEXT_FAIL_PATH, 'utf8'))
    : null;
  const stats = catalogStats();

  progress.waves.push({
    wave,
    at: new Date().toISOString(),
    verdict: report?.verdict,
    stats,
    nextFail: next?.stem || null,
  });
  progress.updatedAt = new Date().toISOString();
  fs.writeFileSync(progressPath, `${JSON.stringify(progress, null, 2)}\n`);

  console.log(JSON.stringify({
    wave,
    strong: stats.by.strong,
    open: stats.open,
    byFamily: stats.byFamily,
    next: next?.stem || null,
    verdict: report?.verdict,
  }, null, 2));

  if (next && STOP) {
    console.log('\n########## STOP FOR REAL IMPLEMENT ##########');
    console.log(JSON.stringify(next, null, 2));
    console.log('Edit src/ for this FAIL, then re-run this loop (or _grade-catalog-from-tests.mjs).');
    break;
  }

  if (!next) {
    console.log('No testable open FAILs — research-only stems remain. Continuing research…');
    // Keep researching; don't infinite-spin without STOP if catalog only has coverage-matrix.
    if (wave >= 3 && (stats.byFamily['coverage-matrix']?.open || 0) === stats.open) {
      console.log('Only research-only coverage left. Pausing for agent to map more tests / implement peers.');
      break;
    }
  }
}

console.log('\nDEEP RESEARCH WAVE COMPLETE');
console.log(JSON.stringify({ progressPath, stats: catalogStats() }, null, 2));
