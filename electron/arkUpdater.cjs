/**
 * In-app updates via public DrMeji/ark-dist Releases.
 * Download → install → relaunch. Session/userData must survive upgrades.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { spawn } = require('child_process');
const { app, BrowserWindow } = require('electron');

const UPDATE_REPO = 'DrMeji/ark-dist';
const POST_UPDATE_FLAG = 'ark-post-update.json';

/** @type {{ status: string, percent: number, message: string, version?: string, error?: string } | null} */
let state = null;

function sendProgress(payload) {
  state = { ...(state || {}), ...payload };
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      win.webContents.send('ark:update-progress', state);
    } catch {
      /* ignore */
    }
  }
}

function getState() {
  return state || { status: 'idle', percent: 0, message: 'Ready' };
}

function postUpdatePath() {
  return path.join(app.getPath('userData'), POST_UPDATE_FLAG);
}

function markPostUpdateLandChat() {
  try {
    fs.writeFileSync(
      postUpdatePath(),
      JSON.stringify({ land: 'chat', at: new Date().toISOString(), keepSession: true }),
      'utf8',
    );
  } catch {
    /* ignore */
  }
}

function consumePostUpdate() {
  const p = postUpdatePath();
  try {
    if (!fs.existsSync(p)) return { ok: true, land: null };
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    fs.unlinkSync(p);
    return { ok: true, land: raw?.land === 'chat' ? 'chat' : null };
  } catch {
    try {
      fs.unlinkSync(p);
    } catch {
      /* ignore */
    }
    return { ok: true, land: null };
  }
}

function httpsJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': 'ARK-Desktop',
          Accept: 'application/vnd.github+json',
          ...headers,
        },
      },
      (res) => {
        let body = '';
        res.on('data', (c) => {
          body += c;
        });
        res.on('end', () => {
          let data = null;
          try {
            data = body ? JSON.parse(body) : null;
          } catch {
            data = null;
          }
          resolve({ status: res.statusCode || 0, data, headers: res.headers });
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(45_000, () => {
      req.destroy(new Error('Timeout'));
    });
  });
}

function downloadFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const follow = (currentUrl, redirectsLeft) => {
      const mod = currentUrl.startsWith('http://') ? http : https;
      const req = mod.get(
        currentUrl,
        {
          headers: { 'User-Agent': 'ARK-Desktop', Accept: '*/*' },
        },
        (res) => {
          const code = res.statusCode || 0;
          if ([301, 302, 303, 307, 308].includes(code) && res.headers.location) {
            if (redirectsLeft <= 0) {
              reject(new Error('Too many redirects'));
              return;
            }
            res.resume();
            follow(res.headers.location, redirectsLeft - 1);
            return;
          }
          if (code !== 200) {
            res.resume();
            reject(new Error(`Download failed (${code})`));
            return;
          }
          const total = parseInt(res.headers['content-length'] || '0', 10) || 0;
          let received = 0;
          const out = fs.createWriteStream(dest);
          res.on('data', (chunk) => {
            received += chunk.length;
            if (total > 0 && onProgress) {
              onProgress(Math.min(99, Math.round((received / total) * 100)), received, total);
            }
          });
          res.pipe(out);
          out.on('finish', () => {
            out.close(() => resolve({ bytes: received }));
          });
          out.on('error', reject);
        },
      );
      req.on('error', reject);
      req.setTimeout(10 * 60_000, () => {
        req.destroy(new Error('Download timeout'));
      });
    };
    follow(url, 8);
  });
}

function normalizeVersion(v) {
  return String(v || '')
    .trim()
    .replace(/^v/i, '');
}

function isNewer(latest, current) {
  const a = normalizeVersion(latest)
    .split(/[.+-]/)
    .map((p) => parseInt(p.replace(/\D/g, ''), 10) || 0);
  const b = normalizeVersion(current)
    .split(/[.+-]/)
    .map((p) => parseInt(p.replace(/\D/g, ''), 10) || 0);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

function escapeForCmd(p) {
  return String(p).replace(/"/g, '');
}

/**
 * VBS launcher survives Electron quitting (plain detached cmd often dies with the app).
 * Waits for ARK.exe to exit, runs silent NSIS, then starts ARK again.
 */
function launchInstallerThenRelaunch(setupPath) {
  const appExe = process.execPath;
  const temp = app.getPath('temp');
  const stamp = Date.now();
  const helperCmd = path.join(temp, `ark-update-${stamp}.cmd`);
  const helperVbs = path.join(temp, `ark-update-${stamp}.vbs`);
  const logFile = path.join(temp, `ark-update-${stamp}.log`);

  const localPrograms = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'ARK', 'ARK.exe');
  const programFiles = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'ARK', 'ARK.exe');

  const setup = escapeForCmd(setupPath);
  const exe = escapeForCmd(appExe);
  const local = escapeForCmd(localPrograms);
  const pf = escapeForCmd(programFiles);
  const log = escapeForCmd(logFile);

  const cmd = [
    '@echo off',
    'setlocal EnableExtensions',
    `echo ARK update helper started > "${log}"`,
    'echo Waiting for ARK.exe to exit...>> "' + log + '"',
    'set /a _tries=0',
    ':waitloop',
    'set /a _tries+=1',
    'if %_tries% GEQ 90 goto afterwait',
    'tasklist /FI "IMAGENAME eq ARK.exe" 2>NUL | find /I "ARK.exe" >NUL',
    'if not errorlevel 1 (',
    '  ping -n 2 127.0.0.1 >nul',
    '  goto waitloop',
    ')',
    ':afterwait',
    'ping -n 3 127.0.0.1 >nul',
    `echo Running installer...>> "${log}"`,
    `"${setup}" /S`,
    'set _err=%ERRORLEVEL%',
    `echo Installer exit=%_err%>> "${log}"`,
    'ping -n 3 127.0.0.1 >nul',
    'set "TARGET="',
    `if exist "${exe}" set "TARGET=${exe}"`,
    `if not defined TARGET if exist "${local}" set "TARGET=${local}"`,
    `if not defined TARGET if exist "${pf}" set "TARGET=${pf}"`,
    'if defined TARGET (',
    `  echo Starting %TARGET%>> "${log}"`,
    '  start "" "%TARGET%"',
    ') else (',
    `  echo Could not find ARK.exe to relaunch>> "${log}"`,
    ')',
    `del /q "${escapeForCmd(helperVbs)}" 2>nul`,
    `del /q "${escapeForCmd(helperCmd)}" 2>nul`,
  ].join('\r\n');

  fs.writeFileSync(helperCmd, `${cmd}\r\n`, 'utf8');

  // 0 = hidden window; False = don't wait (returns immediately so VBS exits, cmd keeps running)
  const vbs = [
    'Set sh = CreateObject("WScript.Shell")',
    `sh.Run "cmd /c ""${escapeForCmd(helperCmd)}""", 0, False`,
  ].join('\r\n');
  fs.writeFileSync(helperVbs, `${vbs}\r\n`, 'utf8');

  const child = spawn('wscript.exe', [helperVbs], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    cwd: temp,
  });
  child.unref();
}

async function checkForUpdate() {
  const currentVersion = app.getVersion();
  sendProgress({ status: 'checking', percent: 0, message: 'Checking for updates…', version: currentVersion });

  try {
    const res = await httpsJson(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`);
    if (res.status !== 200 || !res.data) {
      sendProgress({
        status: 'error',
        percent: 0,
        message: 'Could not check for updates right now.',
        error: `HTTP ${res.status}`,
      });
      return {
        ok: false,
        newerAvailable: false,
        currentVersion,
        message: 'Could not check for updates right now. Try again in a moment.',
      };
    }

    const tag = res.data.tag_name || '';
    const assets = Array.isArray(res.data.assets) ? res.data.assets : [];
    const setup = assets.find((a) => /^ARK-Setup(\.|-).*\.exe$/i.test(a.name || ''))
      || assets.find((a) => /ARK-Setup\.exe$/i.test(a.name || ''));
    const newer = tag ? isNewer(tag, currentVersion) : false;
    const setupUrl = setup?.browser_download_url || null;

    if (!newer) {
      sendProgress({
        status: 'idle',
        percent: 0,
        message: `You are on the latest release (${currentVersion}).`,
        version: currentVersion,
      });
      return {
        ok: true,
        newerAvailable: false,
        currentVersion,
        latestTag: tag,
        message: `You are on the latest release (${currentVersion}).`,
      };
    }

    if (!setupUrl) {
      sendProgress({
        status: 'error',
        percent: 0,
        message: 'Update found but installer asset is missing.',
        version: currentVersion,
      });
      return {
        ok: false,
        newerAvailable: true,
        currentVersion,
        latestTag: tag,
        message: `Update ${tag} is listed but ARK-Setup.exe was not found.`,
      };
    }

    sendProgress({
      status: 'available',
      percent: 0,
      message: `Update available: ${tag}`,
      version: normalizeVersion(tag),
    });

    return {
      ok: true,
      newerAvailable: true,
      currentVersion,
      latestTag: tag,
      latestName: res.data.name || tag,
      setupAssetUrl: setupUrl,
      message: `Update available: ${res.data.name || tag}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Check failed';
    sendProgress({ status: 'error', percent: 0, message: msg, error: msg });
    return {
      ok: false,
      newerAvailable: false,
      currentVersion,
      message: 'Could not check for updates right now.',
    };
  }
}

async function downloadAndInstall(setupUrl, latestTag) {
  if (!app.isPackaged) {
    return {
      ok: false,
      message: 'Updates install only in the packaged ARK app (not electron:dev).',
    };
  }
  if (typeof setupUrl !== 'string' || !/^https:\/\//i.test(setupUrl)) {
    return { ok: false, message: 'Missing installer download URL.' };
  }

  const dest = path.join(app.getPath('temp'), `ARK-Setup-${normalizeVersion(latestTag || 'update')}.exe`);
  try {
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
  } catch {
    /* ignore */
  }

  sendProgress({
    status: 'downloading',
    percent: 0,
    message: 'Downloading update…',
    version: normalizeVersion(latestTag || ''),
  });

  try {
    await downloadFile(setupUrl, dest, (percent) => {
      sendProgress({
        status: 'downloading',
        percent,
        message: `Downloading update… ${percent}%`,
        version: normalizeVersion(latestTag || ''),
      });
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Download failed';
    sendProgress({ status: 'error', percent: 0, message: msg, error: msg });
    return { ok: false, message: msg };
  }

  markPostUpdateLandChat();
  sendProgress({
    status: 'installing',
    percent: 100,
    message: 'Download complete. Installing — ARK will reopen automatically…',
    version: normalizeVersion(latestTag || ''),
  });

  // Let the overlay paint, start the detached helper, then quit so NSIS can replace files.
  setTimeout(() => {
    try {
      launchInstallerThenRelaunch(dest);
    } catch (err) {
      console.error('[ark] failed to launch installer helper', err);
      sendProgress({
        status: 'error',
        percent: 100,
        message: 'Could not start the installer. Try again.',
        error: err instanceof Error ? err.message : 'spawn failed',
      });
      return;
    }
    setTimeout(() => app.quit(), 600);
  }, 1500);

  return { ok: true, message: 'Download complete. Installing — ARK will reopen automatically…' };
}

module.exports = {
  checkForUpdate,
  downloadAndInstall,
  getState,
  consumePostUpdate,
  UPDATE_REPO,
};
