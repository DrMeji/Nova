/**
 * Run approved shell commands for ARK agent (npm, pip, git, …).
 * Respects execution mode stored with workspace grants.
 */

const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const arkProjects = require('./arkProjects.cjs');

/** @type {Map<string, { url: string, pid?: number, child?: import('child_process').ChildProcess }>} */
const devServersByCwd = new Map();

const ALLOWLIST = [
  /^npm(\s|$)/i,
  /^npx(\s|$)/i,
  /^pnpm(\s|$)/i,
  /^yarn(\s|$)/i,
  /^node(\s|$)/i,
  /^python(\s|$)/i,
  /^py(\s|-)/i,
  /^pip(\s|$)/i,
  /^pip3(\s|$)/i,
  /^git(\s|$)/i,
  /^winget(\s|$)/i,
  /^choco(\s|$)/i,
  /^Checkpoint-Computer\b/i,
  /^Get-ComputerRestorePoint\b/i,
  /^Enable-ComputerRestore\b/i,
];

const BLOCKED = [
  /\bformat\b/i,
  /\bdel\s+\/[sf]/i,
  /\brd\s+\/s/i,
  /\brmdir\s+\/s/i,
  /\brm\s+-rf\b/i,
  /Remove-Item\s+-Recurse\s+-Force\s+[A-Z]:\\/i,
  /\bshutdown\b/i,
  /\brestart-computer\b/i,
];

function loadExecutionMode() {
  try {
    const grants = arkProjects.loadWorkspaceGrants();
    if (grants.executionMode === 'run_all' || grants.executionMode === 'auto_review') {
      return grants.executionMode;
    }
  } catch {
    /* ignore */
  }
  return 'allowlist';
}

function commandAllowed(command, mode) {
  const cmd = String(command || '').trim();
  if (!cmd) return { ok: false, error: 'Empty command.' };
  if (BLOCKED.some(re => re.test(cmd))) {
    return { ok: false, error: 'That command is blocked for safety.' };
  }
  if (mode === 'run_all') return { ok: true };
  if (mode === 'auto_review') return { ok: true };
  if (ALLOWLIST.some(re => re.test(cmd))) return { ok: true };
  return {
    ok: false,
    error: 'Command not on the allowlist. Switch to Auto-review or Run everything in Settings → Security.',
  };
}

function resolveCwd(cwd) {
  const os = require('os');
  const fallback = os.homedir();
  const p = path.resolve(String(cwd || fallback));
  if (!fs.existsSync(p)) return { ok: false, error: 'Working folder not found.' };
  if (!arkProjects.isAllowedExternalPath(p)) {
    return { ok: false, error: 'That folder is outside ARK access. Enable Desktop/Documents or Full PC access in Settings.' };
  }
  return { ok: true, path: p };
}

function runCommand(command, cwd, timeoutMs = 120_000) {
  return new Promise((resolve) => {
    const shell = process.platform === 'win32' ? 'powershell.exe' : '/bin/sh';
    const args = process.platform === 'win32'
      ? ['-NoProfile', '-NonInteractive', '-Command', command]
      : ['-lc', command];
    execFile(shell, args, {
      cwd,
      windowsHide: true,
      timeout: timeoutMs,
      maxBuffer: 4 * 1024 * 1024,
    }, (err, stdout, stderr) => {
      resolve({
        ok: !err,
        code: err && typeof err.code === 'number' ? err.code : 0,
        stdout: String(stdout || '').trim(),
        stderr: String(stderr || '').trim(),
        error: err && !stdout && !stderr ? (err.message || 'Command failed') : undefined,
      });
    });
  });
}

async function agentRun(payload) {
  const command = String(payload?.command || '').trim();
  const mode = payload?.mode || loadExecutionMode();
  const allowed = commandAllowed(command, mode);
  if (!allowed.ok) return allowed;

  const cwdRes = resolveCwd(payload?.cwd);
  if (!cwdRes.ok) return cwdRes;

  const ran = await runCommand(command, cwdRes.path);
  const out = [ran.stdout, ran.stderr].filter(Boolean).join('\n').trim();
  return {
    ok: ran.ok,
    command,
    cwd: cwdRes.path,
    output: out.slice(0, 12_000),
    error: ran.ok ? undefined : (ran.error || ran.stderr || 'Command failed'),
  };
}

function httpProbePort(port, host = '127.0.0.1', timeoutMs = 800) {
  return new Promise((resolve) => {
    const req = http.get({ host, port, path: '/', timeout: timeoutMs, family: host === '::1' ? 6 : 4 }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

/** Vite on Windows often binds ::1 first; probe both stacks. */
async function httpProbePortAny(port, timeoutMs = 800) {
  if (await httpProbePort(port, '127.0.0.1', timeoutMs)) return '127.0.0.1';
  if (await httpProbePort(port, '::1', timeoutMs)) return '::1';
  return null;
}

function portFromUrl(url) {
  try {
    const p = Number(new URL(url).port);
    return p || 5173;
  } catch {
    return 5173;
  }
}

const DEV_PORT_CANDIDATES = [5173, 5174, 5175, 5176, 5177, 5178, 5179, 5180];

async function findFreeDevPort() {
  for (const port of DEV_PORT_CANDIDATES) {
    if (!(await httpProbePortAny(port, 400))) return port;
  }
  return null;
}

async function waitForDevServerUrl(port, timeoutMs = 25_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const host = await httpProbePortAny(port);
    if (host) {
      const authority = host === '::1' ? `[::1]:${port}` : `127.0.0.1:${port}`;
      return `http://${authority}/`;
    }
    await new Promise(r => setTimeout(r, 350));
  }
  throw new Error(`Dev server did not respond on port ${port}`);
}

function spawnHiddenDevServer(cwd, port) {
  const { spawn } = require('child_process');
  // Force IPv4 + an explicit free port so we never steal ARK's own Vite or miss ::1-only binds.
  const run = `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`;
  const env = { ...process.env, BROWSER: 'none' };
  if (process.platform === 'win32') {
    // npm.cmd + shell:false causes EINVAL on Windows — use cmd /c with hidden window.
    // Do not use detached:true — it forces a visible CMD on Windows despite windowsHide.
    return spawn('cmd.exe', ['/d', '/s', '/c', run], {
      cwd,
      stdio: 'ignore',
      windowsHide: true,
      windowsVerbatimArguments: false,
      env,
    });
  }
  return spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd,
    stdio: 'ignore',
    windowsHide: true,
    env,
  });
}

/** Start npm run dev in the background on a free port. No visible terminal. */
async function agentStartDevServer(payload) {
  const cwdRes = resolveCwd(payload?.cwd);
  if (!cwdRes.ok) return cwdRes;

  const cwdKey = cwdRes.path.toLowerCase();
  const existing = devServersByCwd.get(cwdKey);
  if (existing?.url) {
    const port = portFromUrl(existing.url);
    if (await httpProbePortAny(port)) {
      return { ok: true, cwd: cwdRes.path, url: existing.url };
    }
    try { existing.child?.kill?.(); } catch { /* ignore */ }
    devServersByCwd.delete(cwdKey);
  }

  const pkgPath = path.join(cwdRes.path, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return { ok: false, error: 'No package.json in this folder.' };
  }

  const port = await findFreeDevPort();
  if (!port) {
    return { ok: false, error: 'No free port in 5173–5180 for the project dev server.' };
  }

  try {
    const child = spawnHiddenDevServer(cwdRes.path, port);
    // Keep child referenced in the Map (no unref) so the console stays hidden and we can kill later.
    const url = await waitForDevServerUrl(port, 25_000);
    devServersByCwd.set(cwdKey, { url, pid: child.pid, child });
    return { ok: true, cwd: cwdRes.path, url };
  } catch (err) {
    return { ok: false, error: err?.message || 'Could not start dev server.' };
  }
}

module.exports = {
  agentRun,
  agentStartDevServer,
  commandAllowed,
};
