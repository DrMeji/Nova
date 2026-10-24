/**
 * CODING-DEEP forever loop (RESET — isolated catalog):
 *   research coding gaps → sync Missing tab → grade uniqueness/agent tests
 *   → canvas → repeat.
 *
 * Catalog + progress persist on disk every wave — crash/restart resumes
 * at lastWave+1 (CODING_RESET=0). Never restarts catalog from scratch.
 *
 * Env:
 *   MAX_WAVES=0 infinite (default 0)
 *   EXTRA_ROWS=300
 *   STOP_FOR_IMPLEMENT=1 stop when testable FAIL appears (default 1)
 *   SEGMENT_WAVES=0 pause every N waves (0=off; prefer catalog milestones)
 *   CATALOG_MILESTONE_STEP=500000 pause at 500k, 1M, 1.5M… for implement
 *   MILESTONE_AUTO_CONTINUE=1 after placing Missing→homes, keep researching
 *   AUTO_IMPLEMENT_QUALITY=1 on open FAIL run _implement-coding-quality + regrade
 *   CONTINUE_AFTER_QUALITY_IMPLEMENT=1 keep researching after quality implement
 *   WAVE_COOLDOWN_MS=2500 sleep between waves (PC safety)
 *   CODING_RESET=1 archive prior coding catalog first
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));
const project = path.join(root, '..');

/** Isolated coding catalog — does NOT touch the old 1M PeerR catalog. */
const codingEnv = {
  NOVA_CATALOG_PATH: path.join(root, 'data', 'nova-coding-catalog.jsonl'),
  NOVA_CATALOG_META_PATH: path.join(root, 'data', 'nova-coding-catalog-meta.json'),
  NOVA_NEXT_FAIL_PATH: path.join(root, 'data', 'coding-next-fail.json'),
  NOVA_GRADE_REPORT_PATH: path.join(root, 'data', 'coding-grade-report.json'),
  NOVA_LAST_DISCOVER_PATH: path.join(root, 'data', 'coding-last-discover.json'),
};
Object.assign(process.env, codingEnv);

const {
  catalogStats,
  CATALOG_PATH,
} = await import('./lib/honestCatalog.mjs');

const progressPath = path.join(root, 'data', 'coding-deep-progress.json');
const checkpointPath = path.join(root, 'data', 'coding-deep-checkpoint.json');
const lockPath = path.join(root, 'data', 'coding-deep-loop.pid');

function acquireLock() {
  try {
    if (fs.existsSync(lockPath)) {
      const other = Number(String(fs.readFileSync(lockPath, 'utf8')).trim());
      if (other && other !== process.pid) {
        try {
          process.kill(other, 0);
          console.error(`CODING-DEEP already running pid=${other} — exiting duplicate`);
          process.exit(0);
        } catch { /* stale */ }
      }
    }
    fs.writeFileSync(lockPath, `${process.pid}\n`);
  } catch (e) {
    console.error('lock write failed', e?.message || e);
  }
}
function releaseLock() {
  try {
    if (fs.existsSync(lockPath)) {
      const cur = Number(String(fs.readFileSync(lockPath, 'utf8')).trim());
      if (cur === process.pid) fs.unlinkSync(lockPath);
    }
  } catch { /* */ }
}
acquireLock();
process.on('exit', releaseLock);
process.on('SIGINT', () => { releaseLock(); process.exit(130); });
process.on('SIGTERM', () => { releaseLock(); process.exit(143); });
const MAX = process.env.MAX_WAVES === '0' || !process.env.MAX_WAVES
  ? Infinity
  : Math.max(1, Number(process.env.MAX_WAVES));
const SEGMENT = Math.max(0, Number(process.env.SEGMENT_WAVES ?? 0));
const MILESTONE_STEP = Math.max(0, Number(process.env.CATALOG_MILESTONE_STEP ?? 500_000));
const MILESTONE_AUTO_CONTINUE = process.env.MILESTONE_AUTO_CONTINUE !== '0';
const AUTO_IMPLEMENT_QUALITY = process.env.AUTO_IMPLEMENT_QUALITY !== '0';
const CONTINUE_AFTER_QUALITY = process.env.CONTINUE_AFTER_QUALITY_IMPLEMENT !== '0';
const COOLDOWN = Math.max(0, Number(process.env.WAVE_COOLDOWN_MS ?? 2500));
const CODE_WAVE_RE =
  /Code(?:Build|Nav|Model|UX|Kind|Unique|MissingUI|Pipe|Craft|Verify|Premium|Understand|Quality)\s+(\d+)\b/g;

function nextMilestoneAfter(total) {
  if (!MILESTONE_STEP) return null;
  return (Math.floor(Number(total || 0) / MILESTONE_STEP) + 1) * MILESTONE_STEP;
}

function crossedMilestone(prevTotal, total) {
  if (!MILESTONE_STEP) return null;
  const prevM = Math.floor(Number(prevTotal || 0) / MILESTONE_STEP);
  const curM = Math.floor(Number(total || 0) / MILESTONE_STEP);
  if (curM > prevM && curM > 0) return curM * MILESTONE_STEP;
  return null;
}

const loopLogPath = path.join(root, 'data', 'coding-deep-loop.out.log');

function appendLoopLog(text) {
  try { fs.appendFileSync(loopLogPath, text); } catch { /* */ }
}

function run(label, script, env = {}) {
  const header = `\n======== ${label} ========\n`;
  console.log(header.trim());
  appendLoopLog(header);
  // NEVER stdio:'inherit' on Windows — that spawns Terminal/conhost per child.
  const r = spawnSync(process.execPath, [path.join(root, script)], {
    cwd: project,
    env: { ...process.env, ...codingEnv, ...env },
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  if (out) {
    appendLoopLog(out.slice(-200_000));
    // Keep console quiet when running headless; still echo a short line.
    const tail = out.trim().split(/\r?\n/).slice(-3).join(' | ');
    if (tail) console.log(tail.slice(0, 300));
  }
  if (r.status !== 0 && r.status !== 2) {
    console.error(`${label} status=${r.status}`);
    appendLoopLog(`${label} status=${r.status}\n`);
    return r.status || 1;
  }
  return 0;
}

function sleep(ms) {
  if (ms <= 0) return;
  // In-process wait — no child process / no Terminal window.
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    const end = Date.now() + ms;
    while (Date.now() < end) { /* spin */ }
  }
}

function writeCheckpoint(payload) {
  fs.writeFileSync(checkpointPath, `${JSON.stringify(payload, null, 2)}\n`);
}

function resumeWaveStart() {
  if (process.env.START_WAVE) return Math.max(1, Number(process.env.START_WAVE));
  let max = 0;
  // Prefer lightweight progress / checkpoint — avoid scanning huge catalog every start.
  if (fs.existsSync(checkpointPath)) {
    try {
      const ck = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
      max = Math.max(max, Number(ck.lastWave) || 0);
    } catch { /* */ }
  }
  if (fs.existsSync(progressPath)) {
    try {
      const prev = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
      max = Math.max(max, Number(prev.lastWave) || 0);
      for (const w of prev.waves || []) max = Math.max(max, Number(w.wave) || 0);
    } catch { /* */ }
  }
  if (max > 0) return max + 1;

  // Fallback: only tail of catalog (PC-safe).
  const cat = codingEnv.NOVA_CATALOG_PATH;
  if (fs.existsSync(cat)) {
    const st = fs.statSync(cat);
    const fd = fs.openSync(cat, 'r');
    const take = Math.min(st.size, 2_000_000);
    const buf = Buffer.alloc(take);
    fs.readSync(fd, buf, 0, take, Math.max(0, st.size - take));
    fs.closeSync(fd);
    const text = buf.toString('utf8');
    let m;
    CODE_WAVE_RE.lastIndex = 0;
    while ((m = CODE_WAVE_RE.exec(text))) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

if (process.env.CODING_RESET === '1' && fs.existsSync(codingEnv.NOVA_CATALOG_PATH)) {
  const arch = path.join(root, 'data', 'archives');
  fs.mkdirSync(arch, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.renameSync(
    codingEnv.NOVA_CATALOG_PATH,
    path.join(arch, `nova-coding-catalog-${stamp}.jsonl`),
  );
  for (const p of [progressPath, checkpointPath, codingEnv.NOVA_LAST_DISCOVER_PATH]) {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  console.log('CODING RESET — archived previous coding catalog');
}

const startWave = resumeWaveStart();
let priorWaves = [];
if (fs.existsSync(progressPath)) {
  try {
    priorWaves = JSON.parse(fs.readFileSync(progressPath, 'utf8')).waves || [];
  } catch { priorWaves = []; }
}
let startStats = { total: 0 };
try { startStats = catalogStats(); } catch { /* */ }
const progress = {
  startedAt: new Date().toISOString(),
  kind: 'coding-deep',
  resumedFrom: startWave,
  catalog: codingEnv.NOVA_CATALOG_PATH,
  lastWave: startWave - 1,
  lastTotal: startStats.total || 0,
  segmentWaves: SEGMENT,
  catalogMilestoneStep: MILESTONE_STEP,
  nextMilestone: nextMilestoneAfter(startStats.total || 0),
  waves: priorWaves.slice(-80),
};
writeCheckpoint({
  status: 'running',
  lastWave: startWave - 1,
  lastTotal: progress.lastTotal,
  nextMilestone: progress.nextMilestone,
  resumedFrom: startWave,
  at: progress.startedAt,
  note: 'Catalog + progress on disk; restart with CODING_RESET=0 continues here.',
});
console.log(`CODING-DEEP FOREVER max=${MAX === Infinity ? '∞' : MAX} startWave=${startWave}`);
console.log(
  `milestones every ${MILESTONE_STEP || 'off'} catalog rows · wave-segment ${SEGMENT || 'off'} · cooldown ${COOLDOWN}ms`,
);
console.log('catalog', CATALOG_PATH, 'total~', progress.lastTotal, 'nextMilestone', progress.nextMilestone);

let prevTotal = progress.lastTotal || 0;

for (let i = 0; i < MAX; i += 1) {
  const wave = startWave + i;
  console.log(`\n########## CODING WAVE ${wave} ##########`);
  run(`research ${wave}`, '_deep-research-coding-forever.mjs', {
    APPLY: '1',
    RESEARCH_WAVE: String(wave),
    EXTRA_ROWS: process.env.EXTRA_ROWS || '300',
    MISSING_NEW_CAP: process.env.MISSING_NEW_CAP || '800',
  });
  run(`missing-tab ${wave}`, '_sync-coding-missing-items.mjs');
  run(`grade ${wave}`, '_grade-catalog-from-tests.mjs');

  // Hard coding-quality win: implement wires/fixes when tests open FAILs, then re-grade.
  let next = fs.existsSync(codingEnv.NOVA_NEXT_FAIL_PATH)
    ? JSON.parse(fs.readFileSync(codingEnv.NOVA_NEXT_FAIL_PATH, 'utf8'))
    : null;
  if (next && AUTO_IMPLEMENT_QUALITY) {
    console.log(`\n======== quality-implement ${wave} ========`);
    run(`quality-implement ${wave}`, '_implement-coding-quality.mjs');
    run(`grade-after-implement ${wave}`, '_grade-catalog-from-tests.mjs');
    next = fs.existsSync(codingEnv.NOVA_NEXT_FAIL_PATH)
      ? JSON.parse(fs.readFileSync(codingEnv.NOVA_NEXT_FAIL_PATH, 'utf8'))
      : null;
  }

  run(`canvas ${wave}`, '_sync-coding-deep-canvas.mjs', {
    CANVAS_SAMPLE_N: process.env.CANVAS_SAMPLE_N || '500',
  });

  const stats = catalogStats();
  const report = fs.existsSync(codingEnv.NOVA_GRADE_REPORT_PATH)
    ? JSON.parse(fs.readFileSync(codingEnv.NOVA_GRADE_REPORT_PATH, 'utf8'))
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
  if (progress.waves.length > 80) progress.waves = progress.waves.slice(-80);
  progress.lastWave = wave;
  progress.lastTotal = entry.total;
  progress.nextMilestone = nextMilestoneAfter(entry.total);
  progress.updatedAt = entry.at;
  fs.writeFileSync(progressPath, `${JSON.stringify(progress, null, 2)}\n`);
  writeCheckpoint({
    status: 'running',
    lastWave: wave,
    total: entry.total,
    strong: entry.strong,
    open: entry.open,
    nextMilestone: progress.nextMilestone,
    at: entry.at,
    next: entry.next,
    verdict: entry.verdict,
  });
  console.log(JSON.stringify(entry, null, 2));

  if (next && process.env.STOP_FOR_IMPLEMENT !== '0' && !CONTINUE_AFTER_QUALITY) {
    writeCheckpoint({
      status: 'pause_for_implement',
      reason: 'open_fail',
      lastWave: wave,
      lastTotal: entry.total,
      next,
      at: entry.at,
      resumeHint: 'Fix FAIL, then restart loop with CODING_RESET=0 — resumes at lastWave+1',
    });
    console.log('\nSTOP — coding implement required for:');
    console.log(JSON.stringify(next, null, 2));
    break;
  }
  if (next && CONTINUE_AFTER_QUALITY) {
    console.log(`\nOPEN FAIL tracked (continuing): ${next.stem || next.id || '?'}`);
    writeCheckpoint({
      status: 'running_with_open_fail',
      reason: 'quality_open_continue',
      lastWave: wave,
      lastTotal: entry.total,
      next,
      at: entry.at,
    });
  }

  // Catalog milestone: 500k → place Missing into homes → (auto) continue → 1M …
  const hit = crossedMilestone(prevTotal, entry.total);
  prevTotal = entry.total;
  if (hit) {
    console.log(`\n======== milestone ${hit} implement (Missing → homes) ========`);
    run(`milestone-place ${hit}`, '_implement-coding-milestone.mjs', {
      MILESTONE: String(hit),
      MISSING_UI_CAP: process.env.MISSING_UI_CAP || '2000',
    });
    const implPath = path.join(root, 'data', 'coding-milestone-implement.json');
    let impl = null;
    if (fs.existsSync(implPath)) {
      try { impl = JSON.parse(fs.readFileSync(implPath, 'utf8')); } catch { /* */ }
    }
    writeCheckpoint({
      status: MILESTONE_AUTO_CONTINUE ? 'milestone_placed_continuing' : 'pause_for_implement',
      reason: 'catalog_milestone',
      milestone: hit,
      catalogMilestoneStep: MILESTONE_STEP,
      lastWave: wave,
      lastTotal: entry.total,
      at: entry.at,
      implement: impl,
      missingPath: path.join(root, 'data', 'coding-missing-discovered.json'),
      byHomePath: path.join(root, 'data', 'coding-missing-by-home.json'),
      resumeHint: MILESTONE_AUTO_CONTINUE
        ? 'Missing items routed to Settings/Agents/Live homes; research continuing to next milestone.'
        : 'Placement done. Restart CODING_RESET=0 after any extra code fixes — continues at lastWave+1.',
    });
    console.log(
      MILESTONE_AUTO_CONTINUE
        ? `\nMILESTONE ${hit.toLocaleString()} — Missing routed to homes; continuing research (catalog kept).`
        : `\nSTOP — milestone ${hit.toLocaleString()} placed. Restart CODING_RESET=0 to continue.`,
    );
    if (!MILESTONE_AUTO_CONTINUE) break;
  }

  // Optional wave-count segment (off by default when using milestones).
  if (SEGMENT > 0 && (i + 1) % SEGMENT === 0) {
    writeCheckpoint({
      status: 'pause_for_implement',
      reason: 'segment',
      segmentWaves: SEGMENT,
      lastWave: wave,
      lastTotal: entry.total,
      at: entry.at,
      resumeHint: 'Implement segment gaps, then restart with CODING_RESET=0 — continues at lastWave+1',
    });
    console.log(`\nSTOP — segment checkpoint after wave ${wave} (${SEGMENT} waves).`);
    console.log('Progress saved. Restart loop (CODING_RESET=0) to continue exactly here.');
    console.log('checkpoint', checkpointPath);
    break;
  }

  sleep(COOLDOWN);
}

console.log('CODING-DEEP LOOP segment complete', progressPath);
console.log('checkpoint', checkpointPath);
