/**
 * Forever honest loop: expand research → grade → sync → repeat.
 * Stops only when a testable FAIL appears (needs real src/ implement).
 *
 * Env:
 *   MAX_WAVES=0 means infinite. Default 50.
 *   START_WAVE=N resume from N (else max existing PeerR/CoverageR + 1).
 *   EXTRA_ROWS / STOP_FOR_IMPLEMENT as before.
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import {
  catalogStats,
  NEXT_FAIL_PATH,
  GRADE_REPORT_PATH,
  CATALOG_PATH,
} from './lib/honestCatalog.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const project = path.join(root, '..');
const progressPath = path.join(root, 'data', 'honest-forever-progress.json');
const MAX = process.env.MAX_WAVES === '0' ? Infinity : Math.max(1, Number(process.env.MAX_WAVES || 50));

function run(label, script, env = {}) {
  console.log(`\n======== ${label} ========`);
  const r = spawnSync(process.execPath, [path.join(root, script)], {
    cwd: project,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  if (r.status !== 0 && r.status !== 2) {
    console.error(`${label} status=${r.status}`);
    return r.status || 1;
  }
  return 0;
}

/** Resume after highest wave already stamped in progress or catalog. */
function resumeWaveStart() {
  if (process.env.START_WAVE) return Math.max(1, Number(process.env.START_WAVE));
  let max = 0;
  if (fs.existsSync(progressPath)) {
    try {
      const prev = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
      for (const w of prev.waves || []) max = Math.max(max, Number(w.wave) || 0);
    } catch { /* ignore */ }
  }
  if (fs.existsSync(CATALOG_PATH)) {
    const text = fs.readFileSync(CATALOG_PATH, 'utf8');
    const re = /(?:PeerR|CoverageR)(\d+)\b/g;
    let m;
    while ((m = re.exec(text))) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

const startWave = resumeWaveStart();
const progress = { startedAt: new Date().toISOString(), resumedFrom: startWave, waves: [] };
console.log(`HONEST FOREVER research loop max=${MAX === Infinity ? '∞' : MAX} startWave=${startWave}`);

for (let i = 0; i < MAX; i += 1) {
  const wave = startWave + i;
  console.log(`\n########## FOREVER WAVE ${wave} ##########`);
  run(`research ${wave}`, '_deep-research-expand-forever.mjs', {
    APPLY: '1',
    RESEARCH_WAVE: String(wave),
    EXTRA_ROWS: process.env.EXTRA_ROWS || '500',
  });
  // Sync immediately so the living list shows THIS wave's new stems (even before grade).
  run(`canvas ${wave} pre-grade`, '_sync-honest-catalog-canvas.mjs');
  run(`grade ${wave}`, '_grade-catalog-from-tests.mjs');
  run(`canvas ${wave}`, '_sync-honest-catalog-canvas.mjs');

  const stats = catalogStats();
  const next = fs.existsSync(NEXT_FAIL_PATH)
    ? JSON.parse(fs.readFileSync(NEXT_FAIL_PATH, 'utf8'))
    : null;
  const report = fs.existsSync(GRADE_REPORT_PATH)
    ? JSON.parse(fs.readFileSync(GRADE_REPORT_PATH, 'utf8'))
    : null;

  const entry = {
    wave,
    at: new Date().toISOString(),
    total: stats.total,
    strong: stats.by.strong,
    open: stats.open,
    byFamily: stats.byFamily,
    next: next?.stem || null,
    verdict: report?.verdict,
  };
  progress.waves.push(entry);
  progress.updatedAt = entry.at;
  fs.writeFileSync(progressPath, `${JSON.stringify(progress, null, 2)}\n`);
  console.log(JSON.stringify(entry, null, 2));

  if (next && process.env.STOP_FOR_IMPLEMENT !== '0') {
    console.log('\nSTOP — real implement required for:');
    console.log(JSON.stringify(next, null, 2));
    break;
  }
}

console.log('FOREVER LOOP segment complete', progressPath);
