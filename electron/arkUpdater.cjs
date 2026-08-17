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

/** @type {null | (() => void)} */
let onBeforeForceExit = null;

function setForceExitHook(fn) {
  onBeforeForceExit = typeof fn === 'function' ? fn : null;
}

/** Hard exit so the Updating splash is not stuck on “Waiting for ARK to close”. */
function forceExitForUpdate() {
  try {
    onBeforeForceExit?.();
  } catch {
    /* ignore */
  }
  try {
    for (const win of BrowserWindow.getAllWindows()) {
      try {
        win.destroy();
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  // app.quit() can hang with tray/brain; Lyndsey uses exit after handoff.
  setTimeout(() => {
    try {
      app.exit(0);
    } catch {
      process.exit(0);
    }
  }, 120);
}

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
    path.join(process.resourcesPath || '', 'app.asar', 'dist', 'ark-icon.png'),
    path.join(app.getAppPath(), 'dist', 'ark-icon.png'),
    path.join(__dirname, '..', 'dist', 'ark-icon.png'),
    path.join(__dirname, '..', 'public', 'ark-icon.png'),
    path.join(app.getAppPath(), 'build', 'icon.png'),
    path.join(__dirname, '..', 'build', 'icon.png'),
  ];
  for (const src of candidates) {
    try {
      if (src && fs.existsSync(src)) return src;
    } catch {
      /* try next */
    }
  }
  return null;
}

/** Inline mark so the splash never shows a broken image icon. */
function splashIconMarkup(iconFileUrl) {
  if (iconFileUrl) {
    return `<img src="${iconFileUrl}" alt="ARK" width="72" height="72" draggable="false" style="object-fit:contain;display:block;margin:0 auto;user-select:none;" />`;
  }
  return `<div style="width:72px;height:72px;margin:0 auto 0;border-radius:16px;background:#141416;display:flex;align-items:center;justify-content:center;color:#f2f2f3;font:700 20px Segoe UI,system-ui,sans-serif;">ARK</div>`;
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

/**
 * NEVER mass-kill ARK.exe by image name.
 * Electron’s GPU/renderer helpers are also named ARK.exe — killing them blanks the
 * Updating window and hangs forever on executeJavaScript (blank splash, 0% CPU).
 * Only kill the known parent PID tree.
 */
function killParentTree(parentPid, writeLog) {
  if (process.platform !== 'win32') return;
  const pid = Number(parentPid);
  if (!Number.isFinite(pid) || pid <= 0) return;
  if (pid === process.pid) return;
  try {
    spawn('taskkill', ['/F', '/PID', String(pid), '/T'], {
      windowsHide: true,
      stdio: 'ignore',
    });
    writeLog?.(`taskkill parent tree pid=${pid}`);
  } catch (err) {
    writeLog?.(`taskkill parent failed: ${err}`);
  }
}

/** Small centered Updating card — logo, status, percent, thin bar. */
function splashHtml(iconFileUrl) {
  const icon = splashIconMarkup(iconFileUrl);
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<style>
  html,body{margin:0;height:100%;background:#0a0a0c;color:#f2f2f3;font-family:"Segoe UI",system-ui,sans-serif;overflow:hidden;user-select:none;-webkit-app-region:drag;}
  .wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:36px 40px 40px;box-sizing:border-box;}
  .logo-wrap{margin:0 0 24px;animation:pulse 1.8s ease-in-out infinite;}
  @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.88;transform:scale(1.03)}}
  #label{font-size:17px;font-weight:600;letter-spacing:0.01em;margin:0 0 8px;text-align:center;}
  #pct{font-size:13px;font-weight:500;color:rgba(255,255,255,0.55);margin:0 0 16px;text-align:center;font-variant-numeric:tabular-nums;min-height:1.2em;}
  #sub{font-size:12px;font-weight:400;color:rgba(255,255,255,0.38);margin:0 0 18px;text-align:center;min-height:1.1em;}
  .track{width:280px;height:5px;border-radius:999px;background:#1c1c20;overflow:hidden;}
  #fill{height:100%;width:4%;border-radius:999px;background:linear-gradient(90deg,#9aa3b2,#e8eaed);transition:width 0.22s ease-out;}
</style></head>
<body>
  <div class="wrap">
    <div class="logo-wrap">${icon}</div>
    <div id="label">Updating ARK</div>
    <div id="pct">0%</div>
    <div id="sub">Preparing</div>
    <div class="track"><div id="fill"></div></div>
  </div>
  <script>
    window.__arkSet = function(pct, text, sub) {
      var n = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
      var f = document.getElementById('fill');
      var l = document.getElementById('label');
      var p = document.getElementById('pct');
      var s = document.getElementById('sub');
      if (f) f.style.width = Math.max(4, n) + '%';
      if (p) p.textContent = n + '%';
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
    // Hard timeout — never block install if the renderer was killed or hung.
    await Promise.race([
      win.webContents.executeJavaScript(
        `window.__arkSet && window.__arkSet(${Number(pct) || 0}, '${esc(text)}', '${esc(sub)}')`,
      ),
      sleep(600),
    ]);
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
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      resolve(124);
    }, 8 * 60_000);
    child.on('error', () => {
      clearTimeout(timer);
      resolve(1);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve(code ?? 1);
    });
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
  writeLog(`pid=${process.pid} exec=${process.execPath}`);

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
  const iconUrl = iconPath ? `file:///${iconPath.replace(/\\/g, '/')}` : '';

  // loadFile is reliable; data: URLs can leave a blank black frame on Electron 43.
  const splashPath = path.join(app.getPath('temp'), `ark-update-splash-${process.pid}.html`);
  try {
    fs.writeFileSync(splashPath, splashHtml(iconUrl), 'utf8');
  } catch (err) {
    writeLog(`splash write failed: ${err}`);
  }

  const win = new BrowserWindow({
    width: 460,
    height: 300,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    backgroundColor: '#0a0a0c',
    show: false,
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

  try {
    await win.loadFile(splashPath);
  } catch (err) {
    writeLog(`loadFile failed: ${err}; falling back to data URL`);
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml(iconUrl))}`);
  }

  try {
    win.once('ready-to-show', () => {
      try {
        win.show();
        win.center();
        win.focus();
      } catch {
        /* ignore */
      }
    });
    // Fallback if ready-to-show already fired
    if (!win.isVisible()) {
      win.show();
      win.center();
    }
  } catch {
    /* ignore */
  }

  await setSplash(win, 4, 'Updating ARK', 'Preparing');
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
  const arkExeTarget = path.join(
    process.env.LOCALAPPDATA || '',
    'Programs',
    'ARK',
    'ARK.exe',
  );
  const reopenExe = (arkExeTarget && fs.existsSync(arkExeTarget))
    ? arkExeTarget
    : path.join(installDir, 'ARK.exe');

  try {
    await setSplash(win, 8, 'Updating ARK', 'Waiting for ARK to close');
    // Give the parent a few seconds to exit on its own, then force-kill that PID tree only.
    const softDeadline = Date.now() + 8_000;
    while (pidAlive(parentPid) && Date.now() < softDeadline) {
      await sleep(150);
    }
    if (pidAlive(parentPid) && parentPid > 0) {
      writeLog(`parent still alive after soft wait; force-killing tree pid=${parentPid}`);
      killParentTree(parentPid, writeLog);
      await sleep(1200);
    }
    writeLog(`parent exited alive=${pidAlive(parentPid)}`);
    await sleep(500);

    await setSplash(win, 18, 'Updating ARK', 'Preparing installer');
    writeLog('past waiting — starting install prep');

    if (isUrl) {
      await setSplash(win, 12, 'Updating ARK', 'Downloading installer');
      try {
        if (fs.existsSync(localSetup)) fs.unlinkSync(localSetup);
      } catch {
        /* ignore */
      }
      await downloadFile(payload, localSetup, async (pct) => {
        await setSplash(win, Math.round((pct / 100) * 40), 'Updating ARK', 'Downloading installer');
      });
      writeLog('download done');
    } else {
      await setSplash(win, 24, 'Updating ARK', 'Installer ready');
      const exists = fs.existsSync(localSetup);
      let size = 0;
      try {
        size = exists ? fs.statSync(localSetup).size : 0;
      } catch {
        /* ignore */
      }
      writeLog(`local setup exists=${exists} size=${size} path=${localSetup}`);
      if (!exists || size < 1_000_000) throw new Error('Installer file missing or incomplete');
    }

    // Copy to a private temp path so the installer is not deleted/locked under pending/.
    const installCopy = path.join(
      app.getPath('temp'),
      `ARK-Setup-install-${expectedVersion || 'update'}-${process.pid}.exe`,
    );
    try {
      fs.copyFileSync(localSetup, installCopy);
      writeLog(`copied installer to ${installCopy}`);
    } catch (err) {
      writeLog(`copy failed (${err}); installing from original path`);
    }
    const setupToRun = fs.existsSync(installCopy) ? installCopy : localSetup;

    /**
     * CRITICAL: do NOT run NSIS while this process still holds ARK.exe open.
     * Silent install overwrites ARK.exe → kills this splash mid-way (~60%) and never relaunches.
     * Hand off to a hidden apply script that waits for *this* PID to exit, then installs + opens ARK.
     */
    await setSplash(win, 35, 'Updating ARK', 'Starting installer');
    writeLog(`delegate install ${setupToRun} → ${installDir}; reopen=${reopenExe}`);
    launchCmdApplyUpdate({
      setupPath: setupToRun,
      installDir,
      expectedVersion,
      parentPid: process.pid,
      arkExe: reopenExe,
    });

    // Brief progress while we exit cleanly (unlocks ARK.exe for NSIS).
    for (const step of [
      [48, 'Installing…'],
      [62, 'Installing…'],
      [78, 'Almost done…'],
      [92, 'ARK will reopen shortly'],
    ]) {
      await setSplash(win, step[0], 'Updating ARK', step[1]);
      await sleep(350);
    }

    try {
      if (!win.isDestroyed()) win.close();
    } catch {
      /* ignore */
    }

    writeLog('splash exiting so installer can replace ARK.exe');
  } catch (err) {
    writeLog(`error ${err instanceof Error ? err.stack || err.message : err}`);
    try {
      await setSplash(win, 100, 'Update failed', 'You can reopen ARK manually');
      await sleep(3200);
    } catch {
      /* ignore */
    }
  } finally {
    writeLog('updater done');
    try {
      fs.unlinkSync(splashPath);
    } catch {
      /* ignore */
    }
    // Small delay so the apply script observes this PID as gone, then installs.
    setTimeout(() => {
      try {
        app.exit(0);
      } catch {
        process.exit(0);
      }
    }, 200);
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
 * Prefer a plain CMD apply script (no second Electron) — it cannot blank itself with taskkill.
 */
function launchCmdApplyUpdate({ setupPath, installDir, expectedVersion, parentPid, arkExe }) {
  const temp = app.getPath('temp');
  const stamp = Date.now();
  const cmdPath = path.join(temp, `ark-apply-update-${stamp}.cmd`);
  const vbsPath = path.join(temp, `ark-apply-update-${stamp}.vbs`);
  const logPath = path.join(temp, `ark-apply-update-${stamp}.log`);
  const readyPath = path.join(temp, `ark-update-helper-${parentPid || process.pid}.ready`);
  const ver = normalizeVersion(expectedVersion);
  const q = (s) => String(s).replace(/"/g, '""');

  try {
    if (fs.existsSync(readyPath)) fs.unlinkSync(readyPath);
  } catch {
    /* ignore */
  }

  // Ready file immediately so the parent can exit; the script owns install after that.
  try {
    fs.writeFileSync(readyPath, `cmd-ready ${new Date().toISOString()}\n`, 'utf8');
  } catch {
    /* ignore */
  }

  const cmdBody = [
    '@echo off',
    'setlocal',
    `title Updating ARK ${ver}`,
    `echo [%date% %time%] apply begin>> "${logPath}"`,
    `echo Waiting for updater pid ${parentPid} to exit...>> "${logPath}"`,
    'set /a waits=0',
    ':waitparent',
    `tasklist /FI "PID eq ${parentPid}" 2>nul | findstr /C:"${parentPid}" >nul`,
    'if not errorlevel 1 (',
    '  set /a waits+=1',
    '  if %waits% GEQ 90 (',
    `    echo timed out waiting for pid ${parentPid}>> "${logPath}"`,
    '    goto install',
    '  )',
    '  timeout /t 1 /nobreak >nul',
    '  goto waitparent',
    ')',
    ':install',
    'timeout /t 2 /nobreak >nul',
    `echo Installing ${q(setupPath)} into ${q(installDir)}>> "${logPath}"`,
    `"${setupPath}" /S --updated /D=${installDir}`,
    'set EXITCODE=%ERRORLEVEL%',
    `echo installer exit=%EXITCODE%>> "${logPath}"`,
    'if not "%EXITCODE%"=="0" (',
    '  timeout /t 2 /nobreak >nul',
    `  "${setupPath}" /S --updated /D=${installDir}`,
    '  set EXITCODE=%ERRORLEVEL%',
    `  echo installer retry exit=%EXITCODE%>> "${logPath}"`,
    ')',
    'timeout /t 2 /nobreak >nul',
    `if exist "${arkExe}" (`,
    `  echo Starting ARK ${q(arkExe)}>> "${logPath}"`,
    `  start "" "${arkExe}"`,
    ') else (',
    `  echo missing ${q(arkExe)}, trying install dir>> "${logPath}"`,
    `  start "" "${installDir}\\ARK.exe"`,
    ')',
    `echo done>> "${logPath}"`,
    'endlocal',
    'exit /b 0',
  ].join('\r\n');
  fs.writeFileSync(cmdPath, cmdBody, 'utf8');

  const vbs = [
    'On Error Resume Next',
    'Dim sh, fso, log',
    'Set fso = CreateObject("Scripting.FileSystemObject")',
    `Set log = fso.OpenTextFile("${q(logPath)}", 8, True)`,
    'log.WriteLine "vbs apply launch"',
    'Set sh = CreateObject("WScript.Shell")',
    // 0 = hidden — never flash a terminal; GUI splash owns the UX
    `sh.Run "cmd.exe /c ""${q(cmdPath)}""", 0, False`,
    'log.WriteLine "vbs Run issued"',
    'log.Close',
  ].join('\r\n');
  fs.writeFileSync(vbsPath, vbs, 'utf8');

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

  setTimeout(() => {
    for (const p of [vbsPath]) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* ignore */
      }
    }
  }, 30_000);

  return { logPath, readyPath, cmdPath };
}

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

  const handoffAndExit = async (installerPath) => {
    // Copy out of electron-updater's pending/ folder before the parent exits —
    // that directory can be cleaned or locked when the main app dies.
    const stable = path.join(
      app.getPath('temp'),
      `ARK-Setup-handoff-${expectedVersion || 'update'}.exe`,
    );
    try {
      fs.copyFileSync(installerPath, stable);
    } catch (err) {
      sendProgress({
        status: 'error',
        percent: 100,
        message: 'Could not stage the installer. Try Update again.',
        error: err instanceof Error ? err.message : 'copy failed',
      });
      return { ok: false, message: 'Could not stage the installer.' };
    }

    markPostUpdateLandChat();
    sendProgress({
      status: 'handoff',
      percent: 100,
      message: 'Download complete. Installing…',
      version: expectedVersion,
    });

    const installDir = path.dirname(process.execPath);
    const arkExe = process.execPath;

    try {
      // Primary: small Updating ARK splash (logo + %). Hidden CMD only if splash fails.
      const electronHandoff = launchUpdaterBreakaway({
        payload: stable,
        expectedVersion,
        parentPid: process.pid,
      });
      const electronReady = await waitForUpdaterReady(electronHandoff.readyPath, 14_000);
      if (!electronReady) {
        const handoff = launchCmdApplyUpdate({
          setupPath: stable,
          installDir,
          expectedVersion,
          parentPid: process.pid,
          arkExe,
        });
        const ready = await waitForUpdaterReady(handoff.readyPath, 5_000);
        if (!ready) {
          sendProgress({
            status: 'error',
            percent: 100,
            message: 'Updater did not start. Try Update again, or install ARK-Setup.exe from GitHub Releases.',
            error: 'updater-ready-timeout',
          });
          return { ok: false, message: 'Updater did not start.' };
        }
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

    setTimeout(() => forceExitForUpdate(), 250);
    return { ok: true, message: 'Installing update…' };
  };

  // Prefer a full Setup.exe download. electron-updater deltas previously handed a path
  // into a second Electron process that blanked itself; full download + CMD apply is reliable.
  const deltaPath = null;
  if (deltaPath) {
    return handoffAndExit(deltaPath);
  }

  if (typeof setupUrl !== 'string' || !/^https:\/\//i.test(setupUrl)) {
    return { ok: false, message: 'Missing installer download URL.' };
  }

  const dest = path.join(app.getPath('temp'), `ARK-Setup-${expectedVersion || 'update'}.exe`);

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

  return handoffAndExit(dest);
}

module.exports = {
  checkForUpdate,
  downloadAndInstall,
  getState,
  consumePostUpdate,
  runStandaloneSplash,
  setForceExitHook,
  UPDATE_REPO,
};
