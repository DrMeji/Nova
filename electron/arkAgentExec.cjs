/**
 * Run approved shell commands for ARK agent (npm, pip, git, …).
 * Respects execution mode stored with workspace grants.
 */

const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const arkProjects = require('./arkProjects.cjs');

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

/** Start npm run dev in the background (Vite default port 5173). */
async function agentStartDevServer(payload) {
  const { spawn } = require('child_process');
  const cwdRes = resolveCwd(payload?.cwd);
  if (!cwdRes.ok) return cwdRes;

  const pkgPath = path.join(cwdRes.path, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return { ok: false, error: 'No package.json in this folder.' };
  }

  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  try {
    const child = spawn(npm, ['run', 'dev'], {
      cwd: cwdRes.path,
      detached: true,
      stdio: 'ignore',
      shell: process.platform === 'win32',
    });
    child.unref();
    return { ok: true, cwd: cwdRes.path, url: 'http://localhost:5173' };
  } catch (err) {
    return { ok: false, error: err?.message || 'Could not start dev server.' };
  }
}

module.exports = {
  agentRun,
  agentStartDevServer,
  commandAllowed,
};
