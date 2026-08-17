/**
 * In-app updates via public DrMeji/Ark Releases.
 *
 * 1) Download installer inside the main ARK app
 * 2) Breakaway-launch ARK.exe --ark-updater (survives parent quit; no PowerShell UI)
 * 3) Updater splash waits for parent → silent install → relaunch ARK
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { spawn } = require('child_process');
const { app, BrowserWindow } = require('electron');

const UPDATE_REPO = 'DrMeji/Ark';
const POST_UPDATE_FLAG = 'ark-post-update.json';

function tryElectronUpdater() {
  try {
    // Optional delta path — requires latest.yml from electron-builder publish.
    // eslint-disable-next-line global-require
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowDowngrade = false;
    return autoUpdater;
  } catch {
    return null;
  }
}

/** @type {{ status: string, percent: number, message: string, version?: string, error?: string } | null} */
let state = null;

function sendProgress(payload) {
  state = { ...(state || {}), ...payload };
  if (payload?.status === 'error') {
    try {
      const arkCrashLog = require('./arkCrashLog.cjs');
      arkCrashLog.appendReport('update-error', {
        message: payload.message,
        error: payload.error,
        version: payload.version,
      });
    } catch {
      /* ignore */
    }
  }
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

/** Discord-style black box — slightly larger, clean type, thin bar. */
function splashHtml(iconFileUrl) {
  const icon = iconFileUrl
    ? `<img src="${iconFileUrl}" alt="ARK" width="64" height="64" draggable="false" style="object-fit:contain;display:block;margin:0 auto 22px;user-select:none;" />`
    : `<div style="width:64px;height:64px;margin:0 auto 22px;border-radius:14px;background:#141416;"></div>`;
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<style>
  html,body{margin:0;height:100%;background:#050506;color:#f2f2f3;font-family:"Segoe UI",system-ui,sans-serif;overflow:hidden;user-select:none;-webkit-app-region:drag;}
  .wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 36px 40px;box-sizing:border-box;}
  #label{font-size:16px;font-weight:600;letter-spacing:0.01em;margin:0 0 8px;text-align:center;}
  #sub{font-size:12px;font-weight:400;color:rgba(255,255,255,0.45);margin:0 0 22px;text-align:center;min-height:1.2em;}
  .track{width:260px;height:5px;border-radius:999px;background:#1c1c20;overflow:hidden;}
  #fill{height:100%;width:4%;border-radius:999px;background:#c8ccd4;transition:width 0.18s ease-out;}
</style></head>
<body>
  <div class="wrap">
    ${icon}
    <div id="label">Updating ARK...</div>
    <div id="sub"></div>
    <div class="track"><div id="fill"></div></div>
  </div>
  <script>
    window.__arkSet = function(pct, text, sub) {
      var f = document.getElementById('fill');
      var l = document.getElementById('label');
      var s = document.getElementById('sub');
      if (f) f.style.width = Math.max(4, Math.min(100, pct || 0)) + '%';
      if (l && text) l.textContent = text;
      if (s) s.textContent = sub || '';
    };
  </script>
</body></html>`;
}

async function setSplash(win, pct, text, sub) {
  if (!win || win.isDestroyed()) return;
  const esc = (v) => String(v || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  try {
    await win.webContents.executeJavaScript(
      `window.__arkSet && window.__arkSet(${Number(pct) || 0}, '${esc(text)}', '${esc(sub)}')`,
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
  // shell:true + start helps avoid console inheritance on Windows
  if (process.platform === 'win32') {
    spawn(`"${exePath}"`, [], {
      detached: true,
      stdio: 'ignore',
      cwd: dir,
      shell: true,
      windowsHide: false,
    }).unref();
    return;
  }
  spawn(exePath, [], {
    detached: true,
    stdio: 'ignore',
    cwd: dir,
  }).unref();
}

function killOtherArkProcesses(writeLog) {
  if (process.platform !== 'win32') return;
  try {
    // Kill leftover ARK.exe except this updater process
    spawn(
      'taskkill',
      ['/F', '/IM', 'ARK.exe', '/FI', `PID ne ${process.pid}`],
      { windowsHide: true, stdio: 'ignore' },
    );
    writeLog?.('taskkill other ARK issued');
  } catch (err) {
    writeLog?.(`taskkill failed: ${err}`);
  }
}

/**
 * Standalone updater: ARK.exe --ark-updater <setupPathOrUrl> <version> <parentPid>
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
  const localSetup = !isUrl
    ? payload
    : path.join(app.getPath('temp'), `ARK-Setup-${expectedVersion || 'update'}.exe`);

  const iconPath = resolveUpdateIcon();
  const iconUrl = iconPath ? `file://${iconPath.replace(/\\/g, '/')}` : '';

  const win = new BrowserWindow({
    width: 420,
    height: 268,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    backgroundColor: '#050506',
    show: true,
    alwaysOnTop: true,
    center: true,
    autoHideMenuBar: true,
    title: 'Updating ARK',
    icon: iconPath || undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setMenuBarVisibility(false);
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml(iconUrl))}`);
  await setSplash(win, 5, 'Updating ARK...', 'Preparing');
  writeLog('splash shown');
  // Signal parent that the updater process is alive (Lyndsey-style ready handoff).
  try {
    const readyPath = path.join(app.getPath('temp'), `ark-update-helper-${parentPid || '0'}.ready`);
    fs.writeFileSync(readyPath, `ok ${new Date().toISOString()}\n`, 'utf8');
    writeLog(`ready ${readyPath}`);
  } catch (err) {
    writeLog(`ready write failed: ${err}`);
  }

  const installDir = path.dirname(process.execPath);

  try {
    await setSplash(win, 8, 'Updating ARK...', 'Waiting for ARK to close');
    const deadline = Date.now() + 60_000;
    while (pidAlive(parentPid) && Date.now() < deadline) {
      await sleep(80);
    }
    await sleep(500);
    killOtherArkProcesses(writeLog);
    await sleep(400);
    writeLog(`parent exited alive=${pidAlive(parentPid)}`);

    if (isUrl) {
      await setSplash(win, 12, 'Downloading update...', 'Fetching installer');
      try {
        if (fs.existsSync(localSetup)) fs.unlinkSync(localSetup);
      } catch {
        /* ignore */
      }
      await downloadFile(payload, localSetup, async (pct) => {
        await setSplash(win, 12 + Math.round((pct / 100) * 48), 'Downloading update...', `${pct}%`);
      });
      writeLog('download done');
    } else {
      await setSplash(win, 45, 'Updating ARK...', 'Installer ready');
      writeLog(`local setup exists=${fs.existsSync(localSetup)}`);
      if (!fs.existsSync(localSetup)) throw new Error('Installer file missing');
    }

    await setSplash(win, 62, 'Installing...', 'Almost done');
    let code = await runInstaller(localSetup, installDir);
    writeLog(`installer exit=${code}`);
    if (code !== 0) {
      await sleep(700);
      code = await runInstaller(localSetup, installDir);
      writeLog(`installer retry exit=${code}`);
    }

    await setSplash(win, 96, 'Opening ARK...', '');
    await sleep(200);

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
      await setSplash(win, 100, 'Update failed', 'You can reopen ARK manually');
      await sleep(2800);
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
    const hasLatestYml = assets.some((a) => /^latest\.yml$/i.test(a.name || ''));
    const hasBlockmap = assets.some((a) => /\.blockmap$/i.test(a.name || ''));
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
      differential: Boolean(hasLatestYml || hasBlockmap),
      message: `Update available: ${res.data.name || tag}${hasLatestYml ? ' (delta-ready)' : ''}`,
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
 * Breakaway launch via wscript + cmd fallback so Electron's job object cannot kill the updater.
 */
function launchUpdaterBreakaway({ payload, expectedVersion, parentPid }) {
  const temp = app.getPath('temp');
  const stamp = Date.now();
  const vbsPath = path.join(temp, `ark-boot-updater-${stamp}.vbs`);
  const cmdPath = path.join(temp, `ark-boot-updater-${stamp}.cmd`);
  const logPath = path.join(temp, `ark-boot-updater-${stamp}.log`);
  const readyPath = path.join(temp, `ark-update-helper-${parentPid || process.pid}.ready`);
  const exe = process.execPath;
  const cwd = path.dirname(exe);
  const ver = normalizeVersion(expectedVersion);
  const q = (s) => String(s).replace(/"/g, '""');

  try {
    if (fs.existsSync(readyPath)) fs.unlinkSync(readyPath);
  } catch {
    /* ignore */
  }

  const vbs = [
    'On Error Resume Next',
    'Dim sh, fso, log, cmd',
    'Set fso = CreateObject("Scripting.FileSystemObject")',
    `Set log = fso.OpenTextFile("${q(logPath)}", 8, True)`,
    'log.WriteLine "vbs launch begin"',
    'Set sh = CreateObject("WScript.Shell")',
    `sh.CurrentDirectory = "${q(cwd)}"`,
    `cmd = """${q(exe)}"" --ark-updater ""${q(payload)}"" ${ver} ${parentPid}"`,
    'log.WriteLine cmd',
    'sh.Run cmd, 1, False',
    'If Err.Number <> 0 Then log.WriteLine "Run error " & Err.Number & " " & Err.Description',
    'log.WriteLine "vbs Run issued"',
    'log.Close',
  ].join('\r\n');
  fs.writeFileSync(vbsPath, vbs, 'utf8');

  // Fallback if wscript is blocked: start "" breaks away without a lasting console title
  const cmdBody = [
    '@echo off',
    `cd /d "${cwd}"`,
    `start "" "${exe}" --ark-updater "${payload}" ${ver} ${parentPid}`,
    'exit /b 0',
  ].join('\r\n');
  fs.writeFileSync(cmdPath, cmdBody, 'utf8');

  const wscript = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'wscript.exe');
  try {
    spawn(wscript, ['//B', '//Nologo', vbsPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      cwd: temp,
    }).unref();
  } catch {
    spawn(cmdPath, [], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      shell: true,
      cwd: temp,
    }).unref();
  }

  // Secondary delayed fallback if VBS silently failed AND updater never became ready
  setTimeout(() => {
    try {
      if (!fs.existsSync(readyPath) && !fs.existsSync(logPath)) {
        spawn(cmdPath, [], {
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
          shell: true,
          cwd: temp,
        }).unref();
      }
    } catch {
      /* ignore */
    }
  }, 1200);

  setTimeout(() => {
    for (const p of [vbsPath, cmdPath]) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* ignore */
      }
    }
  }, 25_000);

  return { logPath, readyPath };
}

async function waitForUpdaterReady(readyPath, timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (readyPath && fs.existsSync(readyPath)) return true;
    } catch {
      /* ignore */
    }
    await sleep(100);
  }
  return false;
}

/** Try electron-updater differential download; returns local installer path or null. */
function tryDownloadWithElectronUpdater(expectedVersion) {
  const autoUpdater = tryElectronUpdater();
  if (!autoUpdater || !app.isPackaged) return Promise.resolve(null);

  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const timer = setTimeout(() => done(null), 45_000);

    autoUpdater.once('update-downloaded', (info) => {
      clearTimeout(timer);
      try {
        const downloaded = info?.downloadedFile || info?.path;
        if (typeof downloaded === 'string' && fs.existsSync(downloaded)) {
          sendProgress({
            status: 'downloaded',
            percent: 100,
            message: 'Delta update ready',
            version: expectedVersion || info.version,
          });
          done(downloaded);
          return;
        }
      } catch {
        /* fall through */
      }
      done(null);
    });
    autoUpdater.once('error', () => {
      clearTimeout(timer);
      done(null);
    });
    autoUpdater.on('download-progress', (p) => {
      const percent = Math.max(0, Math.min(99, Math.round(p.percent || 0)));
      sendProgress({
        status: 'downloading',
        percent,
        message: `Downloading delta update… ${percent}%`,
        version: expectedVersion,
      });
    });

    autoUpdater
      .checkForUpdates()
      .then((result) => {
        if (!result?.updateInfo) {
          clearTimeout(timer);
          done(null);
          return;
        }
        return autoUpdater.downloadUpdate();
      })
      .catch(() => {
        clearTimeout(timer);
        done(null);
      });
  });
}

async function downloadAndInstall(setupUrl, latestTag) {
  if (!app.isPackaged) {
    return {
      ok: false,
      message: 'Updates install only in the packaged ARK app. Use a built installer to test updates.',
    };
  }

  const expectedVersion = normalizeVersion(latestTag || '');

  // Prefer electron-updater delta download when latest.yml was published.
  const deltaPath = await tryDownloadWithElectronUpdater(expectedVersion);
  if (deltaPath) {
    markPostUpdateLandChat();
    sendProgress({
      status: 'installing',
      percent: 100,
      message: 'Closing ARK to finish updating...',
      version: expectedVersion,
    });
    try {
      const handoff = launchUpdaterBreakaway({
        payload: deltaPath,
        expectedVersion,
        parentPid: process.pid,
      });
      const ready = await waitForUpdaterReady(handoff.readyPath, 12_000);
      if (!ready) {
        sendProgress({
          status: 'error',
          percent: 100,
          message: 'Updater window did not start. Try Update again.',
          error: 'updater-ready-timeout',
        });
        return { ok: false, message: 'Updater window did not start.' };
      }
    } catch (err) {
      sendProgress({
        status: 'error',
        percent: 100,
        message: 'Could not start the updater. Try again.',
        error: err instanceof Error ? err.message : 'spawn failed',
      });
      return { ok: false, message: 'Could not start the updater.' };
    }
    setTimeout(() => app.quit(), 400);
    return { ok: true, message: 'Closing ARK to finish updating...' };
  }

  if (typeof setupUrl !== 'string' || !/^https:\/\//i.test(setupUrl)) {
    return { ok: false, message: 'Missing installer download URL.' };
  }

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

  try {
    const handoff = launchUpdaterBreakaway({
      payload: dest,
      expectedVersion,
      parentPid: process.pid,
    });
    const ready = await waitForUpdaterReady(handoff.readyPath, 12_000);
    if (!ready) {
      sendProgress({
        status: 'error',
        percent: 100,
        message: 'Updater window did not start. Try Update again.',
        error: 'updater-ready-timeout',
      });
      return { ok: false, message: 'Updater window did not start.' };
    }
  } catch (err) {
    console.error('[ark] failed to launch updater', err);
    sendProgress({
      status: 'error',
      percent: 100,
      message: 'Could not start the updater. Try again.',
      error: err instanceof Error ? err.message : 'spawn failed',
    });
    return { ok: false, message: 'Could not start the updater.' };
  }

  setTimeout(() => app.quit(), 400);
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
