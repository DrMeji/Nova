/**
 * In-app updates via public DrMeji/ark-dist Releases.
 *
 * Normal app: spawn a second ARK.exe with --ark-updater (Electron splash — no PowerShell).
 * Updater process: small black BrowserWindow → download → silent install → relaunch ARK.
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

function httpsJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': 'ARK-Desktop',
          Accept: 'application/vnd.github+json',
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
          resolve({ status: res.statusCode || 0, data });
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(45_000, () => req.destroy(new Error('Timeout')));
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

function downloadFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const follow = (currentUrl, redirectsLeft) => {
      const mod = currentUrl.startsWith('http://') ? http : https;
      const req = mod.get(
        currentUrl,
        { headers: { 'User-Agent': 'ARK-Desktop', Accept: '*/*' } },
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
              onProgress(Math.min(99, Math.round((received / total) * 100)));
            }
          });
          res.pipe(out);
          out.on('finish', () => out.close(() => resolve({ bytes: received })));
          out.on('error', reject);
        },
      );
      req.on('error', reject);
      req.setTimeout(10 * 60_000, () => req.destroy(new Error('Download timeout')));
    };
    follow(url, 8);
  });
}

function resolveUpdateIcon() {
  const candidates = [
    path.join(app.getAppPath(), 'dist', 'ark-icon.png'),
    path.join(__dirname, '..', 'dist', 'ark-icon.png'),
    path.join(__dirname, '..', 'public', 'ark-icon.png'),
    path.join(__dirname, '..', 'build', 'icon.png'),
  ];
  for (const src of candidates) {
    try {
      if (fs.existsSync(src)) return src;
    } catch {
      /* try next */
    }
  }
  return null;
}

function pidAlive(pid) {
  if (!pid || !Number.isFinite(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function splashHtml(iconFileUrl) {
  const icon = iconFileUrl
    ? `<img src="${iconFileUrl}" alt="ARK" width="56" height="56" style="object-fit:contain;display:block;margin:0 auto 18px;" />`
    : `<div style="width:56px;height:56px;margin:0 auto 18px;border-radius:12px;background:#1a1a10;"></div>`;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<style>
  html,body{margin:0;height:100%;background:#0a0a0c;color:#fff;font-family:Segoe UI,system-ui,sans-serif;overflow:hidden;user-select:none;}
  .wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:28px 32px 36px;box-sizing:border-box;}
  #label{font-size:15px;font-weight:600;letter-spacing:0.01em;margin:0 0 18px;}
  .track{width:240px;height:6px;border-radius:999px;background:#28282c;overflow:hidden;}
  #fill{height:100%;width:4%;border-radius:999px;background:#d2d6dc;transition:width 0.15s ease-out;}
</style></head>
<body>
  <div class="wrap">
    ${icon}
    <div id="label">Updating...</div>
    <div class="track"><div id="fill"></div></div>
  </div>
  <script>
    window.__arkSet = function(pct, text) {
      var f = document.getElementById('fill');
      var l = document.getElementById('label');
      if (f) f.style.width = Math.max(4, Math.min(100, pct || 0)) + '%';
      if (l && text) l.textContent = text;
    };
  </script>
</body></html>`;
}

async function setSplash(win, pct, text) {
  if (!win || win.isDestroyed()) return;
  const safe = String(text || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  try {
    await win.webContents.executeJavaScript(
      `window.__arkSet && window.__arkSet(${Number(pct) || 0}, '${safe}')`,
    );
  } catch {
    /* ignore */
  }
}

function runInstaller(setupPath, installDir) {
  return new Promise((resolve) => {
    const args = ['/S', '--updated', `/D=${installDir}`];
    const child = spawn(setupPath, args, {
      windowsHide: true,
      stdio: 'ignore',
      detached: false,
    });
    child.on('error', () => resolve(1));
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

function startArk(exePath) {
  const dir = path.dirname(exePath);
  const child = spawn(exePath, [], {
    detached: true,
    stdio: 'ignore',
    cwd: dir,
    windowsHide: false,
  });
  child.unref();
}

/**
 * Standalone updater process entry
 * (ARK.exe --ark-updater <url-or-local-setup> <version> <parentPid>).
 */
async function runStandaloneSplash(argv) {
  const logFile = path.join(app.getPath('temp'), `ark-updater-run-${Date.now()}.log`);
  const writeLog = (m) => {
    try {
      fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${m}\n`, 'utf8');
    } catch {
      /* ignore */
    }
  };
  writeLog(`argv=${JSON.stringify(argv)}`);

  const idx = argv.indexOf('--ark-updater');
  const payload = argv[idx + 1];
  const expectedVersion = normalizeVersion(argv[idx + 2] || '');
  const parentPid = parseInt(argv[idx + 3] || '', 10);

  if (!payload) {
    writeLog('missing payload');
    app.quit();
    return;
  }

  const isUrl = /^https:\/\//i.test(payload);
  const localSetup = !isUrl ? payload : path.join(
    app.getPath('temp'),
    `ARK-Setup-${expectedVersion || 'update'}.exe`,
  );

  const iconPath = resolveUpdateIcon();
  const iconUrl = iconPath ? `file://${iconPath.replace(/\\/g, '/')}` : '';

  const win = new BrowserWindow({
    width: 400,
    height: 250,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    backgroundColor: '#0a0a0c',
    show: true,
    alwaysOnTop: true,
    center: true,
    autoHideMenuBar: true,
    title: 'ARK',
    icon: iconPath || undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setMenuBarVisibility(false);
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml(iconUrl))}`);
  await setSplash(win, 4, 'Updating...');
  writeLog('splash shown');

  const installDir = path.dirname(process.execPath);

  try {
    await setSplash(win, 6, 'Waiting to update...');
    const deadline = Date.now() + 60_000;
    while (pidAlive(parentPid) && Date.now() < deadline) {
      await sleep(100);
    }
    await sleep(400);
    writeLog(`parent exited alive=${pidAlive(parentPid)}`);

    if (isUrl) {
      await setSplash(win, 10, 'Downloading update...');
      try {
        if (fs.existsSync(localSetup)) fs.unlinkSync(localSetup);
      } catch {
        /* ignore */
      }
      await downloadFile(payload, localSetup, async (pct) => {
        const mapped = 10 + Math.round((pct / 100) * 45);
        await setSplash(win, mapped, 'Downloading update...');
      });
      writeLog('download done');
    } else {
      await setSplash(win, 40, 'Preparing install...');
      writeLog(`using local setup ${localSetup} exists=${fs.existsSync(localSetup)}`);
      if (!fs.existsSync(localSetup)) {
        throw new Error('Installer file missing');
      }
    }

    await setSplash(win, 60, 'Installing...');
    let code = await runInstaller(localSetup, installDir);
    writeLog(`installer exit=${code}`);
    if (code !== 0) {
      await sleep(600);
      code = await runInstaller(localSetup, installDir);
      writeLog(`installer retry exit=${code}`);
    }

    await setSplash(win, 96, 'Opening ARK...');
    await sleep(150);

    const candidates = [
      process.execPath,
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'ARK', 'ARK.exe'),
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'ARK', 'ARK.exe'),
    ];
    const target = candidates.find((c) => c && fs.existsSync(c)) || process.execPath;

    try {
      if (!win.isDestroyed()) win.close();
    } catch {
      /* ignore */
    }

    writeLog(`starting ${target}`);
    startArk(target);
  } catch (err) {
    writeLog(`error ${err instanceof Error ? err.stack || err.message : err}`);
    try {
      await setSplash(win, 100, 'Update failed');
      await sleep(2500);
    } catch {
      /* ignore */
    }
  } finally {
    writeLog('updater done');
    app.quit();
  }
}

async function checkForUpdate() {
  const currentVersion = app.getVersion();
  sendProgress({ status: 'checking', percent: 0, message: 'Checking for updates...', version: currentVersion });

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

/**
 * Quit main ARK after download, then boot a breakaway ARK.exe updater splash.
 * Direct spawn() dies with the parent (Windows job object) — must use wscript.
 */
function launchUpdaterBreakaway({ payload, expectedVersion, parentPid }) {
  const temp = app.getPath('temp');
  const stamp = Date.now();
  const vbsPath = path.join(temp, `ark-boot-updater-${stamp}.vbs`);
  const logPath = path.join(temp, `ark-boot-updater-${stamp}.log`);
  const exe = process.execPath;
  const cwd = path.dirname(exe);
  const q = (s) => String(s).replace(/"/g, '""');

  const script = [
    'On Error Resume Next',
    'Dim sh, fso, log, cmd',
    'Set fso = CreateObject("Scripting.FileSystemObject")',
    `Set log = fso.OpenTextFile("${q(logPath)}", 8, True)`,
    'log.WriteLine "launch begin"',
    'Set sh = CreateObject("WScript.Shell")',
    `sh.CurrentDirectory = "${q(cwd)}"`,
    // Normal window (1), async (False) — breakaway from Electron job object
    `cmd = """${q(exe)}"" --ark-updater ""${q(payload)}"" ${normalizeVersion(expectedVersion)} ${parentPid}"`,
    'log.WriteLine cmd',
    'sh.Run cmd, 1, False',
    'If Err.Number <> 0 Then log.WriteLine "Run error " & Err.Number & " " & Err.Description',
    'log.WriteLine "Run issued"',
    'log.Close',
  ].join('\r\n');

  fs.writeFileSync(vbsPath, script, 'utf8');

  const wscript = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'wscript.exe');
  const child = spawn(wscript, ['//B', '//Nologo', vbsPath], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    cwd: temp,
  });
  child.unref();

  setTimeout(() => {
    try {
      fs.unlinkSync(vbsPath);
    } catch {
      /* ignore */
    }
  }, 20_000);

  return { logPath, vbsPath };
}

/**
 * Download in-app, then hand off to breakaway ARK splash for install + relaunch.
 */
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

  const expectedVersion = normalizeVersion(latestTag || '');
  const dest = path.join(app.getPath('temp'), `ARK-Setup-${expectedVersion || 'update'}.exe`);

  markPostUpdateLandChat();
  sendProgress({
    status: 'downloading',
    percent: 0,
    message: 'Downloading update...',
    version: expectedVersion,
  });

  try {
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
  } catch {
    /* ignore */
  }

  try {
    await downloadFile(setupUrl, dest, (percent) => {
      sendProgress({
        status: 'downloading',
        percent,
        message: `Downloading update... ${percent}%`,
        version: expectedVersion,
      });
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Download failed';
    sendProgress({ status: 'error', percent: 0, message: msg, error: msg });
    return { ok: false, message: msg };
  }

  if (!fs.existsSync(dest) || fs.statSync(dest).size < 1_000_000) {
    sendProgress({
      status: 'error',
      percent: 0,
      message: 'Download looked incomplete. Try again.',
    });
    return { ok: false, message: 'Download incomplete' };
  }

  sendProgress({
    status: 'installing',
    percent: 100,
    message: 'Closing ARK to finish updating...',
    version: expectedVersion,
  });

  setTimeout(() => {
    try {
      launchUpdaterBreakaway({
        payload: dest,
        expectedVersion,
        parentPid: process.pid,
      });
    } catch (err) {
      console.error('[ark] failed to launch updater', err);
      sendProgress({
        status: 'error',
        percent: 100,
        message: 'Could not start the updater. Try again.',
        error: err instanceof Error ? err.message : 'spawn failed',
      });
      return;
    }
    // Give wscript time to start the breakaway ARK process
    setTimeout(() => app.quit(), 900);
  }, 250);

  return { ok: true, message: 'Closing ARK to finish updating...' };
}

module.exports = {
  checkForUpdate,
  downloadAndInstall,
  getState,
  consumePostUpdate,
  runStandaloneSplash,
  UPDATE_REPO,
};
