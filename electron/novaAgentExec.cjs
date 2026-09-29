/**
 * Run approved shell commands for NOVA Agent (npm, pip, git, …).
 * Execution mode always comes from stored workspace grants — never from the renderer.
 */

const { execFile, spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const novaProjects = require('./novaProjects.cjs');
const novaSelfGuard = require('./novaSelfGuard.cjs');

/** @type {Map<string, { url: string, pid?: number, child?: import('child_process').ChildProcess }>} */
const devServersByCwd = new Map();

/**
 * Return an existing preview/dev-server session for this cwd, if any.
 * @param {string} cwd
 * @returns {{ url: string, pid?: number, child?: import('child_process').ChildProcess, cwd: string } | null}
 */
function getPreviewSession(cwd) {
  const key = String(cwd || '').trim().toLowerCase();
  if (!key) return null;
  const session = devServersByCwd.get(key);
  if (!session?.url) return null;
  return { ...session, cwd: key };
}

/**
 * If a live session already owns this cwd, return its URL (no new Vite).
 * Dead map entries are cleared so a later start can own the cwd again.
 * @param {string} cwd
 * @returns {Promise<{ ok: true, cwd: string, url: string, attached: true, reused: true } | null>}
 */
async function attachLivePreviewSession(cwd) {
  const existing = getPreviewSession(cwd);
  if (!existing?.url) return null;
  const cwdKey = String(cwd || '').trim().toLowerCase();
  const port = portFromUrl(existing.url);
  // Placeholder 127.0.0.1:0 is never "ready" — drop and start real Vite.
  if (!port) {
    try { existing.child?.kill?.(); } catch { /* ignore */ }
    if (cwdKey) devServersByCwd.delete(cwdKey);
    return null;
  }
  if (await httpProbePortAny(port) && await vitePreviewLooksHealthy(existing.url)) {
    return { ok: true, cwd: existing.cwd || cwdKey, url: existing.url, attached: true, reused: true };
  }
  // Port up but serving raw/broken TSX — kill and let caller start a healthy web-only Vite.
  try { killProcessTree(Number(existing.pid || existing.child?.pid || 0)); } catch { /* ignore */ }
  try { existing.child?.kill?.(); } catch { /* ignore */ }
  if (cwdKey) devServersByCwd.delete(cwdKey);
  return null;
}

/** Kill every project Vite preview — call on app quit so orphans do not linger. */
function stopAllPreviews() {
  for (const [key, session] of [...devServersByCwd.entries()]) {
    const pid = Number(session?.pid || session?.child?.pid || 0);
    // Windows: npm run dev → vite is a grandchild. Soft kill leaves dozens of node.exe orphans.
    try { killProcessTree(pid); } catch { /* ignore */ }
    try { session.child?.kill?.(); } catch { /* ignore */ }
    devServersByCwd.delete(key);
  }
  return { ok: true };
}

/**
 * Serialize npm/pnpm/yarn installs app-wide. Parallel node_modules storms
 * freeze the whole PC (Defender + disk) — YouTube and everything hitch.
 */
let packageInstallChain = Promise.resolve();

function killProcessTree(pid) {
  if (!pid || !Number.isFinite(pid)) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(pid), '/t', '/f'], {
        windowsHide: true,
        stdio: 'ignore',
      });
      return;
    }
  } catch { /* ignore */ }
  try { process.kill(pid, 'SIGKILL'); } catch { /* ignore */ }
}

function isHeavyPackageInstall(command) {
  const cmd = String(command || '').trim();
  return /^(npm|pnpm|yarn)(\.cmd)?\s+(install|i|ci|add)(\s|$)/i.test(cmd);
}

/** Cap npm network/disk pressure so install stays a background neighbor. */
function softenPackageInstallCommand(command) {
  const cmd = String(command || '').trim();
  if (!/^(npm)(\.cmd)?\s+/i.test(cmd)) return cmd;
  if (/\s--maxsockets\b/i.test(cmd)) return cmd;
  if (/^(npm)(\.cmd)?\s+(install|i)(\s|$)/i.test(cmd)) {
    const rest = cmd.replace(/^(npm)(\.cmd)?\s+(install|i)\b/i, '').trim();
    return `npm install --no-audit --no-fund --progress=false --maxsockets=2${rest ? ` ${rest}` : ''}`;
  }
  if (/^(npm)(\.cmd)?\s+ci(\s|$)/i.test(cmd)) {
    return 'npm ci --no-audit --no-fund --progress=false --maxsockets=2';
  }
  if (/^(npm)(\.cmd)?\s+add(\s|$)/i.test(cmd)) {
    const rest = cmd.replace(/^(npm)(\.cmd)?\s+add\b/i, '').trim();
    return `npm install --no-audit --no-fund --progress=false --maxsockets=2${rest ? ` ${rest}` : ''}`;
  }
  return cmd;
}

function packageInstallEnv() {
  return {
    ...process.env,
    npm_config_maxsockets: '2',
    npm_config_fetch_retries: '2',
    npm_config_progress: 'false',
    npm_config_audit: 'false',
    npm_config_fund: 'false',
    npm_config_prefer_offline: 'true',
  };
}

function lowerChildPriority(pid) {
  if (!pid) return;
  try {
    // Prefer LOWEST for heavy installs so Defender/disk storms stay behind the desktop.
    const levels = os.constants.priority;
    const level = levels.PRIORITY_LOWEST ?? levels.PRIORITY_BELOW_NORMAL;
    os.setPriority(pid, level);
  } catch {
    /* ignore — some hosts disallow priority changes */
  }
}

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
  // Chat must never PC-wide install runtimes.
  /^winget(\s|$)/i,
  /^choco(\s|$)/i,
  // Inline code eval — treat as always-dangerous regardless of mode.
  /\bnode(?:\.exe)?\s+(-e|--eval)\b/i,
  /\bpython(?:\d+(?:\.\d+)?)?(?:\.exe)?\s+(-c|--command)\b/i,
  /\bpy(?:\.exe)?\s+(-3\s+)?-c\b/i,
  /\bnpx(?:\.cmd)?\s+(-[yc]\s+)?(-e|--eval)\b/i,
];

function loadExecutionMode() {
  try {
    const grants = novaProjects.loadWorkspaceGrants();
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
      return { ok: false, needsConfirm: true, error: 'Confirm this command in NOVA before it can run.' };
    }
    return { ok: true };
  }

  if (mode === 'auto_review') {
    // Known package managers / git may run quietly; interpreters always need confirm.
    if (onAllowlist(cmd) && !isPowerfulInterpreter(cmd)) return { ok: true };
    if (!userConfirmed) {
      return { ok: false, needsConfirm: true, error: 'Confirm this command in NOVA before it can run.' };
    }
    return { ok: true };
  }

  // run_all — allowlisted non-interpreters may run; everything else needs UI confirm.
  if (onAllowlist(cmd) && !isPowerfulInterpreter(cmd)) return { ok: true };
  if (!userConfirmed) {
    return { ok: false, needsConfirm: true, error: 'Confirm this command in NOVA before it can run.' };
  }
  return { ok: true };
}

function packageCmdNeedsProjectCwd(command) {
  const cmd = String(command || '').trim();
  if (!/^(npm|pnpm|yarn|npx)(\.cmd)?(\s|$)/i.test(cmd)) return false;
  if (/\s(-v|--version)\b/i.test(cmd)) return false;
  return true;
}

function resolveCwd(cwd, command) {
  const raw = String(cwd || '').trim();
  if (!raw && packageCmdNeedsProjectCwd(command)) {
    return { ok: false, error: 'Working folder required for package commands. Bind a project folder first.' };
  }
  const fallback = os.homedir();
  const p = path.resolve(raw || fallback);
  if (!fs.existsSync(p)) return { ok: false, error: 'Working folder not found.' };
  if (novaSelfGuard.isArkProtectedPath(p)) {
    return { ok: false, error: novaSelfGuard.protectedPathError() };
  }
  if (!novaProjects.isAllowedExternalPath(p)) {
    return { ok: false, error: 'That folder is outside NOVA access. Enable Desktop/Documents or Full PC access in Settings.' };
  }
  return { ok: true, path: p };
}

function runCommand(command, cwd, timeoutMs = 120_000) {
  const heavy = isHeavyPackageInstall(command);
  const finalCommand = heavy ? softenPackageInstallCommand(command) : String(command || '').trim();

  const execute = () => new Promise((resolve) => {
    const maxBuffer = 4 * 1024 * 1024;
    const finish = (err, stdout, stderr) => {
      resolve({
        ok: !err,
        code: err && typeof err.code === 'number' ? err.code : 0,
        stdout: String(stdout || '').trim(),
        stderr: String(stderr || '').trim(),
        error: err && !stdout && !stderr ? (err.message || 'Command failed') : undefined,
      });
    };

    // Heavy installs: spawn npm via cmd (not PowerShell) at below-normal priority
    // so unpacking node_modules does not freeze YouTube / the whole desktop.
    if (heavy && process.platform === 'win32') {
      const child = spawn('cmd.exe', ['/d', '/s', '/c', finalCommand], {
        cwd,
        windowsHide: true,
        env: packageInstallEnv(),
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      lowerChildPriority(child.pid);
      let stdout = '';
      let stderr = '';
      let settled = false;
      const timer = setTimeout(() => {
        try { killProcessTree(child.pid); } catch { /* ignore */ }
        try { child.kill(); } catch { /* ignore */ }
        done(Object.assign(new Error(`Command timed out after ${Math.round(timeoutMs / 1000)}s`), { code: 'ETIMEDOUT', killed: true }));
      }, timeoutMs);
      const done = (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        finish(err, stdout.slice(0, maxBuffer), stderr.slice(0, maxBuffer));
      };
      child.stdout?.on('data', (chunk) => {
        if (stdout.length < maxBuffer) stdout += String(chunk);
      });
      child.stderr?.on('data', (chunk) => {
        if (stderr.length < maxBuffer) stderr += String(chunk);
      });
      child.on('error', (err) => done(err));
      child.on('close', (code) => {
        if (code === 0) done(null);
        else {
          const err = new Error(`Command failed with code ${code}`);
          err.code = code;
          done(err);
        }
      });
      return;
    }

    const shell = process.platform === 'win32' ? 'powershell.exe' : '/bin/sh';
    const args = process.platform === 'win32'
      ? ['-NoProfile', '-NonInteractive', '-Command', finalCommand]
      : ['-lc', finalCommand];
    const child = execFile(shell, args, {
      cwd,
      windowsHide: true,
      timeout: timeoutMs,
      maxBuffer,
      env: heavy ? packageInstallEnv() : process.env,
    }, (err, stdout, stderr) => finish(err, stdout, stderr));
    lowerChildPriority(child?.pid);
  });

  if (!heavy) return execute();

  const queued = packageInstallChain.then(execute, execute);
  packageInstallChain = queued.then(() => undefined, () => undefined);
  return queued;
}

async function agentRun(payload) {
  const command = String(payload?.command || '').trim();
  // Never trust renderer-supplied mode.
  const mode = loadExecutionMode();
  // Never trust renderer skipConfirm alone for arbitrary shell.
  // skipConfirm only counts for allowlisted package-manager / git status-style cmds.
  const skipOk = payload?.skipConfirm === true
    && onAllowlist(command)
    && !isPowerfulInterpreter(command);
  const userConfirmed = payload?.userConfirmed === true || skipOk;
  const allowed = commandAllowed(command, mode, userConfirmed);
  if (!allowed.ok) return allowed;

  const cwdRes = resolveCwd(payload?.cwd, command);
  if (!cwdRes.ok) return cwdRes;

  // Heavy package installs can take longer on cold cache / Defender PCs.
  const timeoutMs = typeof payload?.timeoutMs === 'number' && payload.timeoutMs > 0
    ? payload.timeoutMs
    : (isHeavyPackageInstall(command) ? 180_000 : 120_000);
  const ran = await runCommand(command, cwdRes.path, timeoutMs);
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
      const code = Number(res.statusCode || 0);
      res.resume();
      // Treat connection as up for 2xx–4xx (Vite may 404 /); reject hard 5xx / invalid.
      resolve(code >= 200 && code < 500);
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

/** Real listen port, or null for placeholder / bad URLs (never treat :0 as 5173). */
function portFromUrl(url) {
  try {
    const raw = String(new URL(url).port || '');
    if (!raw || raw === '0') return null;
    const p = Number(raw);
    if (!Number.isFinite(p) || p <= 0) return null;
    return p;
  } catch {
    return null;
  }
}

/** Project Vite previews. start above NOVA's own UI ports (5173–5174). */
const DEV_PORT_CANDIDATES = Array.from({ length: 151 }, (_, i) => 5200 + i);

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
  // Force IPv4 + an explicit free port so we never steal NOVA's own Vite or miss ::1-only binds.
  const run = `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`;
  const env = { ...process.env, BROWSER: 'none' };
  if (process.platform === 'win32') {
    // npm.cmd + shell:false causes EINVAL on Windows — use cmd /c with hidden window.
    // Do not use detached:true — it forces a visible CMD on Windows despite windowsHide.
    const child = spawn('cmd.exe', ['/d', '/s', '/c', run], {
      cwd,
      stdio: 'ignore',
      windowsHide: true,
      windowsVerbatimArguments: false,
      env,
    });
    lowerChildPriority(child.pid);
    return child;
  }
  const child = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd,
    stdio: 'ignore',
    windowsHide: true,
    env,
  });
  lowerChildPriority(child.pid);
  return child;
}

/**
 * Prefer real Node over Electron's binary. Spawning Vite with process.execPath
 * leaves @vitejs/plugin-react unloaded → raw TSX → blank Live + crash sound.
 */
function resolveSystemNodeBin() {
  const candidates = [];
  if (process.env.NOVA_NODE_BIN) candidates.push(String(process.env.NOVA_NODE_BIN));
  if (process.platform === 'win32') {
    candidates.push(
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node.exe'),
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'nodejs', 'node.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'nodejs', 'node.exe'),
    );
  } else {
    candidates.push('/usr/local/bin/node', '/usr/bin/node');
  }
  // ELECTRON_RUN_AS_NODE can make Electron act like Node, but only as last resort.
  for (const c of candidates) {
    if (c && fs.existsSync(c) && !/electron/i.test(c)) return c;
  }
  try {
    const which = process.platform === 'win32'
      ? spawnSync('where.exe', ['node'], { encoding: 'utf8', windowsHide: true })
      : spawnSync('which', ['node'], { encoding: 'utf8' });
    const line = String(which.stdout || '').split(/\r?\n/).map((s) => s.trim()).find(Boolean);
    if (line && fs.existsSync(line) && !/electron/i.test(line)) return line;
  } catch { /* ignore */ }
  return null;
}

/**
 * Prebundle React as ESM for Live Preview. Vite's optimizeDeps crashes on many
 * vite-plugin-electron trees (depsInfo.imports), and raw CJS react has no default export.
 */
function ensureLiveReactVendor(cwd) {
  const vendorDir = path.join(cwd, '.nova-live-vendor');
  const reactOut = path.join(vendorDir, 'react.js');
  const reactDomOut = path.join(vendorDir, 'react-dom.js');
  const reactDomClientOut = path.join(vendorDir, 'react-dom-client.js');
  const bundlePath = path.join(vendorDir, 'bundle.js');
  const nm = path.join(cwd, 'node_modules');
  const reactEntry = path.join(nm, 'react', 'index.js');
  const reactDomEntry = path.join(nm, 'react-dom', 'index.js');
  const reactDomClientEntry = path.join(nm, 'react-dom', 'client.js');
  if (!fs.existsSync(reactEntry) || !fs.existsSync(reactDomEntry)) {
    return { ok: false, error: 'React is not installed in this project (need react + react-dom).' };
  }
  const stampPath = path.join(vendorDir, '.nova-stamp');
  let stamp = '';
  try {
    stamp = [
      fs.statSync(reactEntry).mtimeMs,
      fs.existsSync(reactDomEntry) ? fs.statSync(reactDomEntry).mtimeMs : 0,
      fs.existsSync(reactDomClientEntry) ? fs.statSync(reactDomClientEntry).mtimeMs : 0,
      'shared-bundle-v1',
    ].join(':');
  } catch { /* ignore */ }
  if (
    fs.existsSync(reactOut)
    && fs.existsSync(reactDomOut)
    && fs.existsSync(reactDomClientOut)
    && fs.existsSync(bundlePath)
    && fs.existsSync(stampPath)
    && String(fs.readFileSync(stampPath, 'utf8') || '') === stamp
  ) {
    return { ok: true, vendorDir };
  }

  let esbuild;
  try {
    esbuild = require(path.join(nm, 'esbuild'));
  } catch {
    try { esbuild = require('esbuild'); } catch {
      return { ok: false, error: 'esbuild is missing — cannot prep Live Preview React bundles.' };
    }
  }

  try {
    fs.mkdirSync(vendorDir, { recursive: true });
    const React = require(reactEntry);
    const ReactDOM = require(reactDomEntry);
    const toPosix = (p) => String(p || '').replace(/\\/g, '/');

    // One shared bundle = one React instance (split+external CJS require breaks hooks).
    esbuild.buildSync({
      stdin: {
        contents: [
          `import __ReactMod from "${toPosix(reactEntry)}";`,
          `import __ReactDOMMod from "${toPosix(reactDomEntry)}";`,
          'export const React = __ReactMod?.default ?? __ReactMod;',
          'export const ReactDOM = __ReactDOMMod?.default ?? __ReactDOMMod;',
          'export default React;',
          '',
        ].join('\n'),
        resolveDir: cwd,
        sourcefile: 'nova-live-react-bundle.js',
      },
      outfile: bundlePath,
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: ['es2020'],
      logLevel: 'silent',
    });

    const reactKeys = Object.keys(React || {}).filter((k) => /^[A-Za-z_$][\w$]*$/.test(k));
    const reactDomKeys = Object.keys(ReactDOM || {}).filter((k) => /^[A-Za-z_$][\w$]*$/.test(k));

    fs.writeFileSync(
      reactOut,
      [
        'import { React } from "./bundle.js";',
        'export default React;',
        ...reactKeys.map((k) => `export const ${k} = React.${k};`),
        '',
      ].join('\n'),
      'utf8',
    );
    fs.writeFileSync(
      reactDomOut,
      [
        'import { ReactDOM } from "./bundle.js";',
        'export default ReactDOM;',
        ...reactDomKeys.map((k) => `export const ${k} = ReactDOM.${k};`),
        '',
      ].join('\n'),
      'utf8',
    );
    fs.writeFileSync(
      reactDomClientOut,
      [
        'import { ReactDOM } from "./bundle.js";',
        'export const createRoot = ReactDOM.createRoot;',
        'export const hydrateRoot = ReactDOM.hydrateRoot;',
        'export default { createRoot, hydrateRoot };',
        '',
      ].join('\n'),
      'utf8',
    );
    fs.writeFileSync(stampPath, stamp, 'utf8');
    return { ok: true, vendorDir };
  } catch (err) {
    return { ok: false, error: err?.message || 'Failed to prebundle React for Live Preview.' };
  }
}

/**
 * Vite without vite-plugin-electron — Live Preview must not open the desktop shell.
 * Writes a project-local config + ESM React vendor so JSX always transforms
 * (Electron-as-Node / broken optimizeDeps were serving raw TSX or CJS React → blank + crash sound).
 */
function spawnHiddenWebOnlyVite(cwd, port) {
  const vendor = ensureLiveReactVendor(cwd);
  if (!vendor.ok) {
    const err = new Error(vendor.error || 'Live React vendor prep failed');
    err.code = 'NOVA_LIVE_VENDOR';
    throw err;
  }

  const cfgPath = path.join(cwd, '.nova-live-vite.config.mjs');
  const cfg = [
    'import { createRequire } from "module";',
    'import path from "path";',
    'import { fileURLToPath } from "url";',
    'const __dirname = path.dirname(fileURLToPath(import.meta.url));',
    'const require = createRequire(path.join(__dirname, "package.json"));',
    'const { defineConfig } = require("vite");',
    'const vendor = path.join(__dirname, ".nova-live-vendor");',
    'export default defineConfig({',
    '  root: __dirname,',
    '  base: "/",',
    '  // Skip @vitejs/plugin-react — it force-includes jsx-runtime into optimizeDeps and crashes Vite 5.',
    '  plugins: [],',
    '  esbuild: { jsx: "transform", jsxFactory: "__novaReact.createElement", jsxFragment: "__novaReact.Fragment", jsxInject: "import * as __novaReact from \\"react\\"" },',
    `  server: { host: "127.0.0.1", port: ${Number(port) || 5200}, strictPort: true },`,
    '  resolve: {',
    '    alias: {',
    '      "@": path.join(__dirname, "src"),',
    '      react: path.join(vendor, "react.js"),',
    '      "react-dom/client": path.join(vendor, "react-dom-client.js"),',
    '      "react-dom": path.join(vendor, "react-dom.js"),',
    '    },',
    '    dedupe: ["react", "react-dom"],',
    '  },',
    '  optimizeDeps: { noDiscovery: true, include: [] },',
    '});',
    '',
  ].join('\n');
  fs.writeFileSync(cfgPath, cfg, 'utf8');

  // Stale electron-plugin dep cache under node_modules/.vite causes blank Live crashes.
  try {
    const viteCache = path.join(cwd, 'node_modules', '.vite');
    if (fs.existsSync(viteCache)) {
      fs.rmSync(viteCache, { recursive: true, force: true });
    }
  } catch { /* ignore */ }

  const viteJs = path.join(cwd, 'node_modules', 'vite', 'bin', 'vite.js');
  const env = { ...process.env, BROWSER: 'none' };
  // Do not inherit ELECTRON_RUN_AS_NODE — Vite must run as plain Node.
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_NO_ASAR;
  const logPath = path.join(os.tmpdir(), `nova-live-vite-${Number(port) || 0}.log`);
  try { fs.writeFileSync(logPath, '', 'utf8'); } catch { /* ignore */ }
  const outFd = (() => {
    try { return fs.openSync(logPath, 'a'); } catch { return 'ignore'; }
  })();
  const stdio = outFd === 'ignore' ? 'ignore' : ['ignore', outFd, outFd];
  const nodeBin = resolveSystemNodeBin();
  if (fs.existsSync(viteJs) && nodeBin) {
    const child = spawn(nodeBin, [viteJs, '--config', cfgPath, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
      cwd,
      stdio,
      windowsHide: true,
      env,
    });
    lowerChildPriority(child.pid);
    return child;
  }
  if (fs.existsSync(viteJs) && !nodeBin) {
    // Last resort: Electron-as-Node. Prefer failing health check over silent blank.
    const elecEnv = { ...env, ELECTRON_RUN_AS_NODE: '1' };
    const child = spawn(process.execPath, [viteJs, '--config', cfgPath, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
      cwd,
      stdio,
      windowsHide: true,
      env: elecEnv,
    });
    lowerChildPriority(child.pid);
    return child;
  }
  const run = `npx --yes vite --config "${cfgPath}" --host 127.0.0.1 --port ${port} --strictPort`;
  if (process.platform === 'win32') {
    const child = spawn('cmd.exe', ['/d', '/s', '/c', run], {
      cwd,
      stdio,
      windowsHide: true,
      env,
    });
    lowerChildPriority(child.pid);
    return child;
  }
  const child = spawn('npx', ['--yes', 'vite', '--config', cfgPath, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd,
    stdio,
    windowsHide: true,
    env,
  });
  lowerChildPriority(child.pid);
  return child;
}

async function waitForViteDepsReady(cwd, timeoutMs = 8_000) {
  // Prefer our ESM vendor (bypasses broken Vite optimizeDeps on electron trees).
  const vendorReact = path.join(cwd, '.nova-live-vendor', 'react.js');
  if (fs.existsSync(vendorReact)) return true;
  const meta = path.join(cwd, 'node_modules', '.vite', 'deps', '_metadata.json');
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      if (fs.existsSync(meta)) {
        const raw = fs.readFileSync(meta, 'utf8');
        if (/react-dom\/client|"react-dom"/i.test(raw) || /"react"/.test(raw)) return true;
      }
    } catch { /* ignore */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return fs.existsSync(vendorReact);
}

/** True when Vite is actually transforming TSX (not serving raw source that crashes the preview). */
function httpGetText(url, headers = {}, timeoutMs = 4000) {
  return new Promise((resolve) => {
    try {
      const req = http.get(url, { timeout: timeoutMs, headers }, (res) => {
        let body = '';
        res.on('data', (c) => { body += c; if (body.length > 50_000) res.destroy(); });
        res.on('end', () => resolve(body));
        res.on('error', () => resolve(''));
      });
      req.on('error', () => resolve(''));
      req.on('timeout', () => { try { req.destroy(); } catch { /* ignore */ } resolve(''); });
    } catch {
      resolve('');
    }
  });
}

async function vitePreviewLooksHealthy(url) {
  const base = String(url || '').trim();
  if (!base) return false;
  const port = portFromUrl(base);
  if (!port || !(await httpProbePortAny(port))) return false;
  // Prefer transformed module probe — raw `!)`.render` / JSX means blank Live preview.
  let sawEntry = false;
  for (const rel of ['/src/main.tsx', '/src/main.jsx', '/src/index.tsx', '/src/index.jsx']) {
    const body = await httpGetText(new URL(rel, base).href, {
      Accept: 'text/javascript, application/javascript, */*',
    });
    if (!body) continue;
    sawEntry = true;
    if (/getElementById\([^)]*\)!/.test(body)) return false;
    if (/<React\.StrictMode>|<App\s*\/>/.test(body) && !/jsxDEV|createElement/.test(body)) return false;
    if (/jsxDEV|createElement|createRoot/.test(body)) {
      // Warm App too — Vite 5 can crash on the second module after "ready".
      await httpGetText(new URL('/src/App.tsx', base).href, {
        Accept: 'text/javascript, application/javascript, */*',
      });
      await new Promise((r) => setTimeout(r, 250));
      if (!(await httpProbePortAny(port))) return false;
      return true;
    }
    // Served something for main — if it still looks like raw TSX, unhealthy.
    if (/\bimport\s+React\b/.test(body) && /from\s+['"]react['"]/.test(body) && /<[A-Z]/.test(body)) {
      return false;
    }
    return true;
  }
  // No main entry — still allow HTML-only / other stacks if port is up.
  return !sawEntry;
}

/** Ensure node_modules exists before Vite — blank Localhost is usually a missing install. */
async function ensureNodeModules(cwd, opts = {}) {
  const nm = path.join(cwd, 'node_modules');
  const viteBin = path.join(nm, 'vite');
  const reactBin = path.join(nm, 'react');
  const treeLooksReady = () => {
    if (!fs.existsSync(nm)) return false;
    if (!(fs.existsSync(viteBin) || fs.existsSync(reactBin))) return false;
    try {
      return fs.readdirSync(nm).length > 2;
    } catch {
      return false;
    }
  };

  // Create bootstrap already ran npm install — do not thrash disk a second time.
  if (opts.depsReady === true && treeLooksReady()) {
    return { ok: true };
  }
  if (treeLooksReady()) {
    return { ok: true };
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
  const attached = await attachLivePreviewSession(cwdRes.path);
  if (attached) return attached;

  const pkgPath = path.join(cwdRes.path, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return { ok: false, error: 'No package.json in this folder.' };
  }

  const deps = await ensureNodeModules(cwdRes.path, { depsReady: payload?.depsReady === true });
  if (!deps.ok) {
    return { ok: false, error: deps.error || 'npm install failed before starting the preview server.' };
  }

  const port = await findFreeDevPort();
  if (!port) {
    return { ok: false, error: 'No free port in 5200–5350 for the project dev server.' };
  }

  try {
    const child = spawnHiddenDevServer(cwdRes.path, port);
    // Keep child referenced in the Map (no unref) so the console stays hidden and we can kill later.
    const url = await waitForDevServerUrl(port, 45_000);
    if (!(await vitePreviewLooksHealthy(url))) {
      try { killProcessTree(child.pid); } catch { /* ignore */ }
      try { child.kill?.(); } catch { /* ignore */ }
      // npm run dev without JSX transform (common with broken electron Vite) — web-only fallback.
      const webPort = await findFreeDevPort();
      if (!webPort) {
        return {
          ok: false,
          error: 'Live preview started but JSX was not transforming (blank window). Reinstall deps and try Live again.',
        };
      }
      try {
        const webChild = spawnHiddenWebOnlyVite(cwdRes.path, webPort);
        const webUrl = await waitForDevServerUrl(webPort, 45_000);
        if (!(await vitePreviewLooksHealthy(webUrl))) {
          try { killProcessTree(webChild.pid); } catch { /* ignore */ }
          try { webChild.kill?.(); } catch { /* ignore */ }
          return {
            ok: false,
            error: 'Live preview started but JSX was not transforming (blank window). Reinstall deps (`npm install`) and try Live again.',
          };
        }
        devServersByCwd.set(cwdKey, { url: webUrl, pid: webChild.pid, child: webChild });
        return { ok: true, cwd: cwdRes.path, url: webUrl, webOnly: true };
      } catch (webErr) {
        return { ok: false, error: webErr?.message || 'Could not start web-only preview fallback.' };
      }
    }
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

function packageLooksLikeElectronApp(cwd) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    if (deps.electron || deps['electron-builder'] || deps['vite-plugin-electron'] || deps['@electron-forge/cli']) {
      return true;
    }
    const main = String(pkg.main || '');
    if (/electron|dist-electron/i.test(main)) return true;
    const scripts = pkg.scripts || {};
    for (const key of Object.keys(scripts)) {
      const cmd = String(scripts[key] || '');
      // Pure electron launchers (no vite/webpack) — never use for Live Preview.
      if (/^\s*electron(\s|$)/i.test(cmd) || /electron\s+\.|electron-forge|electron-builder/i.test(cmd)) {
        if (!/vite|webpack|parcel|next\s+dev/i.test(cmd)) return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Start (or reuse) whatever this folder already uses for Preview:
 * Vite npm run dev, an already-running bat localhost, or FastAPI/uvicorn.
 * Never launch Electron desktop apps — Live Preview is in-app / localhost only.
 */
async function agentStartFolderPreview(payload) {
  const cwdRes = resolveCwd(payload?.cwd);
  if (!cwdRes.ok) return cwdRes;
  const cwd = cwdRes.path;
  const cwdKey = cwd.toLowerCase();

  const attached = await attachLivePreviewSession(cwd);
  if (attached) return attached;

  // Reuse a server only when THIS cwd already owns it in our map (checked above).
  // Do not attach to arbitrary localhost ports listed in run.bat — those may belong
  // to another project or a leftover process.
  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    // vite-plugin-electron / Electron apps: `npm run dev` opens the desktop shell.
    // Start a web-only Vite (temp config, no electron plugin) for Live Preview.
    if (packageLooksLikeElectronApp(cwd)) {
      const deps = await ensureNodeModules(cwd, {});
      if (!deps.ok) {
        return { ok: false, error: deps.error || 'npm install failed before starting the preview server.' };
      }
      const port = await findFreeDevPort();
      if (!port) {
        return { ok: false, error: 'No free port in 5200–5350 for the project preview server.' };
      }
      try {
        const child = spawnHiddenWebOnlyVite(cwd, port);
        const url = await waitForDevServerUrl(port, 45_000);
        await waitForViteDepsReady(cwd, 20_000);
        if (!(await vitePreviewLooksHealthy(url))) {
          try { killProcessTree(child.pid); } catch { /* ignore */ }
          try { child.kill?.(); } catch { /* ignore */ }
          return {
            ok: false,
            error: 'Live preview started but JSX was not transforming (blank window). Reinstall deps (`npm install`) and try Live again.',
            electronApp: true,
          };
        }
        devServersByCwd.set(cwdKey, { url, pid: child.pid, child });
        return { ok: true, cwd, url, webOnly: true };
      } catch (err) {
        return {
          ok: false,
          error: err?.message || 'Could not start web-only preview (Electron shell skipped).',
          electronApp: true,
        };
      }
    }
    return agentStartDevServer({ cwd });
  }

  const fastapi = fs.existsSync(path.join(cwd, 'app', 'main.py'));
  if (fastapi) {
    let preferred = readBatUrls(cwd)[0]?.port || 8000;
    // Never attach to a foreign live port — pick a free port if preferred is busy.
    if (await httpProbePortAny(preferred, 400)) {
      const free = await findFreeDevPort();
      if (!free) {
        return { ok: false, error: 'No free port for the Python preview server.' };
      }
      preferred = free;
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

/**
 * Preview SSOT: attach to an existing cwd session when live; otherwise start folder preview.
 * Never starts a second Vite while a live URL already exists for the same cwd.
 * @param {string | { cwd?: string }} cwdOrPayload
 */
async function getOrAttachPreview(cwdOrPayload) {
  const cwd = typeof cwdOrPayload === 'string'
    ? cwdOrPayload
    : (cwdOrPayload?.cwd || '');
  const cwdRes = resolveCwd(cwd);
  if (!cwdRes.ok) return cwdRes;

  const attached = await attachLivePreviewSession(cwdRes.path);
  if (attached) return attached;

  return agentStartFolderPreview({ cwd: cwdRes.path });
}

module.exports = {
  agentRun,
  agentStartDevServer,
  agentStartFolderPreview,
  getPreviewSession,
  getOrAttachPreview,
  attachLivePreviewSession,
  stopAllPreviews,
  commandAllowed,
  loadExecutionMode,
};
