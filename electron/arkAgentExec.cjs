/**
 * Run approved shell commands for ARK agent (npm, pip, git, …).
 * Execution mode always comes from stored workspace grants — never from the renderer.
 */

const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const arkProjects = require('./arkProjects.cjs');
const arkSelfGuard = require('./arkSelfGuard.cjs');

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
  // Inline code eval — treat as always-dangerous regardless of mode.
  /\bnode(?:\.exe)?\s+(-e|--eval)\b/i,
  /\bpython(?:\d+(?:\.\d+)?)?(?:\.exe)?\s+(-c|--command)\b/i,
  /\bpy(?:\.exe)?\s+(-3\s+)?-c\b/i,
  /\bnpx(?:\.cmd)?\s+(-[yc]\s+)?(-e|--eval)\b/i,
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

function onAllowlist(command) {
  return ALLOWLIST.some(re => re.test(command));
}

/** node / python / npx can run arbitrary code — never silent-auto. */
function isPowerfulInterpreter(command) {
  return /^(node|python(?:\d+(?:\.\d+)?)?|py|npx)(\.exe|\.cmd)?(\s|$)/i.test(String(command || '').trim());
}

/**
 * @param {string} command
 * @param {'allowlist'|'auto_review'|'run_all'} mode
 * @param {boolean} userConfirmed  Renderer already showed a confirm dialog for this command.
 */
function commandAllowed(command, mode, userConfirmed) {
  const cmd = String(command || '').trim();
  if (!cmd) return { ok: false, error: 'Empty command.' };
  if (BLOCKED.some(re => re.test(cmd))) {
    return { ok: false, error: 'That command is blocked for safety.' };
  }

  if (mode === 'allowlist') {
    if (!onAllowlist(cmd)) {
      return {
        ok: false,
        error: 'Command not on the allowlist. Switch to Auto-review or Run everything in Settings → Security.',
      };
    }
    // Allowlisted still needs an explicit confirm from the UI (skipConfirm after dialog).
    if (!userConfirmed) {
      return { ok: false, needsConfirm: true, error: 'Confirm this command in ARK before it can run.' };
    }
    return { ok: true };
  }

  if (mode === 'auto_review') {
    // Known package managers / git may run quietly; interpreters always need confirm.
    if (onAllowlist(cmd) && !isPowerfulInterpreter(cmd)) return { ok: true };
    if (!userConfirmed) {
      return { ok: false, needsConfirm: true, error: 'Confirm this command in ARK before it can run.' };
    }
    return { ok: true };
  }

  // run_all — allowlisted non-interpreters may run; everything else needs UI confirm.
  if (onAllowlist(cmd) && !isPowerfulInterpreter(cmd)) return { ok: true };
  if (!userConfirmed) {
    return { ok: false, needsConfirm: true, error: 'Confirm this command in ARK before it can run.' };
  }
  return { ok: true };
}

function resolveCwd(cwd) {
  const os = require('os');
  const fallback = os.homedir();
  const p = path.resolve(String(cwd || fallback));
  if (!fs.existsSync(p)) return { ok: false, error: 'Working folder not found.' };
  if (arkSelfGuard.isArkProtectedPath(p)) {
    return { ok: false, error: arkSelfGuard.protectedPathError() };
  }
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
  // Never trust renderer-supplied mode.
  const mode = loadExecutionMode();
  const userConfirmed = payload?.userConfirmed === true || payload?.skipConfirm === true;
  const allowed = commandAllowed(command, mode, userConfirmed);
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

/** Ensure node_modules exists before Vite — blank Localhost is usually a missing install. */
async function ensureNodeModules(cwd) {
  const nm = path.join(cwd, 'node_modules');
  if (fs.existsSync(nm)) {
    try {
      const entries = fs.readdirSync(nm);
      if (entries.length > 0) return { ok: true };
    } catch {
      /* fall through to install */
    }
  }
  const ran = await runCommand('npm install', cwd, 300_000);
  if (!ran.ok) {
    return {
      ok: false,
      error: ran.error || ran.stderr || ran.stdout || 'npm install failed',
    };
  }
  return { ok: true };
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

  const deps = await ensureNodeModules(cwdRes.path);
  if (!deps.ok) {
    return { ok: false, error: deps.error || 'npm install failed before starting the preview server.' };
  }

  const port = await findFreeDevPort();
  if (!port) {
    return { ok: false, error: 'No free port in 5173–5180 for the project dev server.' };
  }

  try {
    const child = spawnHiddenDevServer(cwdRes.path, port);
    // Keep child referenced in the Map (no unref) so the console stays hidden and we can kill later.
    const url = await waitForDevServerUrl(port, 45_000);
    devServersByCwd.set(cwdKey, { url, pid: child.pid, child });
    return { ok: true, cwd: cwdRes.path, url };
  } catch (err) {
    return { ok: false, error: err?.message || 'Could not start dev server.' };
  }
}

function readBatUrls(cwd) {
  const urls = [];
  for (const name of ['run.bat', 'start.bat', 'preview.bat', 'dev.bat', 'serve.bat']) {
    const full = path.join(cwd, name);
    if (!fs.existsSync(full)) continue;
    let text = '';
    try { text = fs.readFileSync(full, 'utf8'); } catch { continue; }
    const matches = text.match(/https?:\/\/(?:127\.0\.0\.1|localhost):\d+/gi) || [];
    for (const m of matches) {
      try {
        const u = new URL(m.replace(/localhost/i, '127.0.0.1'));
        const port = Number(u.port);
        if (port > 0) urls.push({ url: `http://127.0.0.1:${port}/`, port, from: name });
      } catch { /* ignore */ }
    }
  }
  return urls;
}

function spawnHiddenUvicorn(cwd, port) {
  const { spawn } = require('child_process');
  const venvPy = process.platform === 'win32'
    ? path.join(cwd, '.venv', 'Scripts', 'python.exe')
    : path.join(cwd, '.venv', 'bin', 'python');
  const py = fs.existsSync(venvPy) ? venvPy : (process.platform === 'win32' ? 'python' : 'python3');
  const args = ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(port)];
  return spawn(py, args, {
    cwd,
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, BROWSER: 'none' },
  });
}

/**
 * Start (or reuse) whatever this folder already uses for Preview:
 * Vite npm run dev, an already-running bat localhost, or FastAPI/uvicorn.
 */
async function agentStartFolderPreview(payload) {
  const cwdRes = resolveCwd(payload?.cwd);
  if (!cwdRes.ok) return cwdRes;
  const cwd = cwdRes.path;
  const cwdKey = cwd.toLowerCase();

  const existing = devServersByCwd.get(cwdKey);
  if (existing?.url) {
    const port = portFromUrl(existing.url);
    if (await httpProbePortAny(port)) {
      return { ok: true, cwd, url: existing.url };
    }
    try { existing.child?.kill?.(); } catch { /* ignore */ }
    devServersByCwd.delete(cwdKey);
  }

  // Reuse a server the user (or run.bat) already started.
  for (const hit of readBatUrls(cwd)) {
    if (await httpProbePortAny(hit.port, 500)) {
      const url = `http://127.0.0.1:${hit.port}/`;
      devServersByCwd.set(cwdKey, { url });
      return { ok: true, cwd, url };
    }
  }

  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    return agentStartDevServer({ cwd });
  }

  const fastapi = fs.existsSync(path.join(cwd, 'app', 'main.py'))
    || fs.existsSync(path.join(cwd, 'requirements.txt'));
  if (fastapi) {
    const preferred = readBatUrls(cwd)[0]?.port || 8000;
    if (await httpProbePortAny(preferred, 400)) {
      const url = `http://127.0.0.1:${preferred}/`;
      devServersByCwd.set(cwdKey, { url });
      return { ok: true, cwd, url };
    }
    try {
      const child = spawnHiddenUvicorn(cwd, preferred);
      const url = await waitForDevServerUrl(preferred, 20_000);
      devServersByCwd.set(cwdKey, { url, pid: child.pid, child });
      return { ok: true, cwd, url };
    } catch (err) {
      return { ok: false, error: err?.message || 'Could not start the Python preview server.' };
    }
  }

  return { ok: false, error: 'No live preview server for this folder.' };
}

module.exports = {
  agentRun,
  agentStartDevServer,
  agentStartFolderPreview,
  commandAllowed,
  loadExecutionMode,
};
