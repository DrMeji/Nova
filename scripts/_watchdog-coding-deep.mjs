/**
 * Watchdog DISABLED by default — prior versions spawned Terminal windows
 * and duplicate loops. Set CODING_WATCHDOG=1 to enable (pid-lock only).
 *
 * Prefer a single hidden loop; check scripts/data/coding-deep-loop.out.log
 */
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));
const project = path.join(root, '..');
const logPath = path.join(root, 'data', 'coding-deep-watchdog.log');
const lockPath = path.join(root, 'data', 'coding-deep-loop.pid');
const checkpointPath = path.join(root, 'data', 'coding-deep-checkpoint.json');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(logPath, `${line}\n`); } catch { /* */ }
}

if (process.env.CODING_WATCHDOG !== '1') {
  log('watchdog idle — CODING_WATCHDOG!=1 (refuses to spawn; prevents Terminal flood)');
  process.exit(0);
}

const EVERY = Math.max(60_000, Number(process.env.WATCH_EVERY_MS || 90_000));
let restarts = 0;
let downStreak = 0;

function pidAlive(pid) {
  if (!pid || !Number.isFinite(pid)) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function readLockPid() {
  try {
    if (!fs.existsSync(lockPath)) return null;
    const n = Number(String(fs.readFileSync(lockPath, 'utf8')).trim());
    return Number.isFinite(n) ? n : null;
  } catch { return null; }
}

function loopRunning() {
  const pid = readLockPid();
  if (pidAlive(pid)) return true;
  try { if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath); } catch { /* */ }
  return false;
}

function startLoop() {
  if (loopRunning()) return;
  restarts += 1;
  if (restarts > 20) {
    log('too many restarts — giving up');
    return;
  }
  log(`starting hidden loop #${restarts}`);
  const child = spawn(process.execPath, [path.join(root, '_loop-coding-deep-forever.mjs')], {
    cwd: project,
    env: {
      ...process.env,
      CODING_RESET: '0',
      MAX_WAVES: '0',
      AUTO_IMPLEMENT_QUALITY: '1',
      CONTINUE_AFTER_QUALITY_IMPLEMENT: '1',
      MILESTONE_AUTO_CONTINUE: '1',
      CATALOG_MILESTONE_STEP: '500000',
      WAVE_COOLDOWN_MS: '4000',
      CANVAS_SAMPLE_N: '500',
      EXTRA_ROWS: '300',
    },
    stdio: 'ignore',
    windowsHide: true,
    detached: true,
  });
  child.unref();
}

log(`watchdog enabled every ${EVERY}ms`);
setInterval(() => {
  if (loopRunning()) {
    downStreak = 0;
    let ck = {};
    try { ck = JSON.parse(fs.readFileSync(checkpointPath, 'utf8')); } catch { /* */ }
    log(`ok pid=${readLockPid()} wave=${ck.lastWave ?? '?'}`);
    return;
  }
  downStreak += 1;
  // Require 2 consecutive misses before restart (avoids false LOOP DOWN).
  if (downStreak >= 2) {
    log('LOOP DOWN confirmed — resume once');
    startLoop();
    downStreak = 0;
  } else {
    log('LOOP maybe down — waiting to confirm');
  }
}, EVERY);
