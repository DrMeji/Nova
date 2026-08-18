/**
 * Local git for ARK Code — uses the Git binary on this PC.
 */

const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

function runGit(cwd, args, opts = {}) {
  return new Promise((resolve) => {
    const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', ...(opts.env || {}) };
    execFile('git', args, {
      cwd,
      env,
      timeout: opts.timeout || 120_000,
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
    }, (err, stdout, stderr) => {
      if (err) {
        if (err.code === 'ENOENT') {
          resolve({
            ok: false,
            error: 'Git is not installed on this PC. Install Git for Windows, then try again in ARK.',
          });
          return;
        }
        const detail = String(stderr || err.message || 'git failed').trim();
        resolve({ ok: false, error: detail.slice(0, 800), stdout: String(stdout || '').trim() });
        return;
      }
      resolve({ ok: true, stdout: String(stdout || '').trim(), stderr: String(stderr || '').trim() });
    });
  });
}

async function ensureIdentity(cwd) {
  const name = await runGit(cwd, ['config', 'user.name']);
  if (!name.ok || !name.stdout) {
    await runGit(cwd, ['config', 'user.name', 'ARK']);
  }
  const email = await runGit(cwd, ['config', 'user.email']);
  if (!email.ok || !email.stdout) {
    await runGit(cwd, ['config', 'user.email', 'ark@local']);
  }
}

function authEnv(token) {
  if (!token) return {};
  return {
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.extraHeader',
    GIT_CONFIG_VALUE_0: `Authorization: Bearer ${token}`,
  };
}

async function status(cwd) {
  if (!cwd || !fs.existsSync(cwd)) return { ok: false, error: 'No project folder' };
  const inside = await runGit(cwd, ['rev-parse', '--is-inside-work-tree']);
  if (!inside.ok) {
    return { ok: true, git: false, branch: null, dirty: 0, files: [], log: [], diff: '', remote: '' };
  }
  const branch = await runGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const porcelain = await runGit(cwd, ['status', '--porcelain']);
  const log = await runGit(cwd, ['log', '-8', '--pretty=format:%h %s']);
  const diff = await runGit(cwd, ['diff', '--stat']);
  const remote = await runGit(cwd, ['remote', 'get-url', 'origin']);
  const files = String(porcelain.stdout || '')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
  return {
    ok: true,
    git: true,
    branch: branch.stdout || 'HEAD',
    dirty: files.length,
    files,
    log: String(log.stdout || '').split('\n').filter(Boolean),
    diff: diff.stdout || '',
    remote: remote.ok ? remote.stdout : '',
  };
}

async function initIfNeeded(cwd) {
  const inside = await runGit(cwd, ['rev-parse', '--is-inside-work-tree']);
  if (inside.ok) return { ok: true, created: false };
  const init = await runGit(cwd, ['init']);
  if (!init.ok) return init;
  await ensureIdentity(cwd);
  return { ok: true, created: true };
}

async function commitAll(cwd, message) {
  if (!cwd) return { ok: false, error: 'No project folder' };
  const ready = await initIfNeeded(cwd);
  if (!ready.ok) return ready;
  await ensureIdentity(cwd);
  const add = await runGit(cwd, ['add', '-A']);
  if (!add.ok) return add;
  const msg = String(message || 'Update from ARK').slice(0, 200);
  const committed = await runGit(cwd, ['commit', '-m', msg]);
  if (!committed.ok) {
    if (/nothing to commit/i.test(committed.error || '')) {
      return { ok: true, message: 'Nothing to commit — working tree clean.' };
    }
    return committed;
  }
  const st = await status(cwd);
  return { ok: true, message: committed.stdout || 'Committed.', ...st };
}

async function push(cwd, token) {
  if (!cwd) return { ok: false, error: 'No project folder' };
  const st = await status(cwd);
  if (!st.git) return { ok: false, error: 'This folder is not a git repo yet. Commit first.' };
  if (!st.remote) return { ok: false, error: 'No origin remote. Create a GitHub repo from ARK first, or add origin.' };
  const result = await runGit(cwd, ['push', '-u', 'origin', 'HEAD'], {
    env: authEnv(token),
    timeout: 180_000,
  });
  if (!result.ok) return result;
  return { ok: true, message: result.stderr || result.stdout || 'Pushed.', remote: st.remote };
}

async function cloneRepo(cwd, url, token) {
  const dest = path.resolve(cwd);
  fs.mkdirSync(dest, { recursive: true });
  const tmp = path.join(path.dirname(dest), `${path.basename(dest)}-clone-${Date.now()}`);
  const cloned = await runGit(path.dirname(dest), ['clone', '--depth', '1', url, tmp], {
    timeout: 180_000,
    env: authEnv(token),
  });
  if (!cloned.ok) {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
    return cloned;
  }
  try {
    const entries = fs.readdirSync(tmp);
    for (const name of entries) {
      const from = path.join(tmp, name);
      const to = path.join(dest, name);
      if (fs.existsSync(to) && name !== '.git') {
        fs.rmSync(to, { recursive: true, force: true });
      }
      fs.renameSync(from, to);
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Clone copy failed' };
  }
  const st = await status(dest);
  return { ok: true, message: `Cloned ${url}`, ...st };
}

async function setOrigin(cwd, remoteUrl) {
  const existing = await runGit(cwd, ['remote', 'get-url', 'origin']);
  if (existing.ok) {
    return runGit(cwd, ['remote', 'set-url', 'origin', remoteUrl]);
  }
  return runGit(cwd, ['remote', 'add', 'origin', remoteUrl]);
}

async function diffSummary(cwd) {
  const st = await status(cwd);
  if (!st.git) return { ok: true, text: 'This project is not a git repo yet.' };
  const parts = [
    st.branch ? `Branch: ${st.branch}` : '',
    st.remote ? `Remote: ${st.remote}` : 'No origin remote.',
    st.dirty ? `${st.dirty} changed file(s)` : 'Working tree clean.',
    st.diff || '',
    st.log.length ? `Recent:\n${st.log.map(l => `• ${l}`).join('\n')}` : '',
  ].filter(Boolean);
  return { ok: true, text: parts.join('\n'), ...st };
}

module.exports = {
  runGit,
  status,
  commitAll,
  push,
  cloneRepo,
  setOrigin,
  initIfNeeded,
  diffSummary,
};
