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
const UI_SHOWN_FLAG = 'ark-ui-shown.flag';
const SPLASH_ALIVE_FLAG = 'ark-update-splash-alive.flag';

function uiShownFlagPath() {
  return path.join(app.getPath('temp'), UI_SHOWN_FLAG);
}

function splashAliveFlagPath() {
  return path.join(app.getPath('temp'), SPLASH_ALIVE_FLAG);
}

function markUiShown() {
  try {
    fs.writeFileSync(uiShownFlagPath(), `${Date.now()}\n`, 'utf8');
  } catch {
    /* ignore */
  }
}

function clearUiShown() {
  try {
    fs.unlinkSync(uiShownFlagPath());
  } catch {
    /* ignore */
  }
}

function clearSplashAlive() {
  try {
    fs.unlinkSync(splashAliveFlagPath());
  } catch {
    /* ignore */
  }
}

async function waitForFile(filePath, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (filePath && fs.existsSync(filePath)) return true;
    } catch {
      /* ignore */
    }
    await sleep(80);
  }
  return false;
}

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
    path.join(__dirname, '..', 'build', 'icon.png'),
    path.join(__dirname, '..', 'public', 'ark-icon.png'),
    path.join(app.getAppPath(), 'build', 'icon.png'),
    path.join(app.getAppPath(), 'dist', 'ark-icon.png'),
    path.join(process.resourcesPath || '', 'app.asar', 'dist', 'ark-icon.png'),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'build', 'icon.png'),
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

function resolveUpdateIco() {
  const candidates = [
    path.join(__dirname, '..', 'build', 'icon.ico'),
    path.join(app.getAppPath(), 'build', 'icon.ico'),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'build', 'icon.ico'),
    path.join(process.resourcesPath || '', 'icon.ico'),
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

function splashIconDataUri() {
  const src = resolveUpdateIcon();
  if (!src) return '';
  try {
    return `data:image/png;base64,${fs.readFileSync(src).toString('base64')}`;
  } catch {
    return '';
  }
}

/** Logo always inlined so HTA/Electron never show a broken-image box. */
function splashIconMarkup() {
  const data = splashIconDataUri();
  if (data) {
    return `<img src="${data}" alt="" width="64" height="64" draggable="false" style="object-fit:contain;display:block;margin:0 auto;user-select:none;" />`;
  }
  return `<div style="width:64px;height:64px;margin:0 auto;border-radius:14px;background:#1a1a1e;display:flex;align-items:center;justify-content:center;color:#f2f2f3;font:700 15px Segoe UI,system-ui,sans-serif;">ARK</div>`;
}

function splashShellCss() {
  return `
  html,body{margin:0;height:100%;background:#0a0a0c;color:#f2f2f3;font-family:"Segoe UI",system-ui,sans-serif;overflow:hidden;user-select:none;}
  .wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:36px 32px 40px;box-sizing:border-box;}
  .logo-wrap{margin:0 0 20px;}
  #label{font-size:16px;font-weight:600;letter-spacing:0.01em;margin:0 0 8px;text-align:center;color:#f2f2f3;}
  #pct{font-size:13px;font-weight:500;color:#a8a8b3;margin:0 0 18px;text-align:center;font-variant-numeric:tabular-nums;}
  .track{width:260px;height:10px;border-radius:999px;background:#3a3a44;overflow:hidden;}
  #fill{height:100%;width:8%;min-width:12px;border-radius:999px;background:#f2f2f4;}
`;
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

/** Small centered card — logo, one status line, percent, bar. */
function splashHtml() {
  const icon = splashIconMarkup();
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<style>
${splashShellCss()}
  html,body{-webkit-app-region:drag;}
</style></head>
<body>
  <div class="wrap">
    <div class="logo-wrap">${icon}</div>
    <div id="label">Installing update</div>
    <div id="pct">0%</div>
    <div class="track"><div id="fill"></div></div>
  </div>
  <script>
    window.__arkSet = function(pct, text) {
      var n = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
      var f = document.getElementById('fill');
      var l = document.getElementById('label');
      var p = document.getElementById('pct');
      if (f) f.style.width = Math.max(8, n) + '%';
      if (p) p.textContent = n + '%';
      if (l && text) l.textContent = text;
    };
  </script>
</body></html>`;
}

/**
 * Independent HTML splash via mshta — not ARK.exe, so NSIS can replace the install
 * without killing this window. Stays up until main.cjs writes ark-ui-shown.flag.
 */
function splashHtaHtml({ statusPath, shownPath, alivePath, icoName }) {
  const icon = splashIconMarkup();
  const jsStr = (s) => JSON.stringify(String(s || ''));
  const icoAttr = icoName ? `\n  icon="${icoName}"` : '';
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<hta:application
  id="ArkUpdateSplash"
  applicationname="ARK"
  border="none"
  caption="no"
  showintaskbar="yes"
  sysmenu="no"
  scroll="no"
  innerborder="no"
  selection="no"
  contextmenu="no"${icoAttr}
/>
<title>ARK</title>
<style>
${splashShellCss()}
</style>
</head>
<body>
  <div class="wrap">
    <div class="logo-wrap">${icon}</div>
    <div id="label">Installing update</div>
    <div id="pct">8%</div>
    <div class="track"><div id="fill"></div></div>
  </div>
  <script language="JScript">
    var STATUS = ${jsStr(statusPath)};
    var SHOWN = ${jsStr(shownPath)};
    var ALIVE = ${jsStr(alivePath)};
    var started = (new Date()).getTime();
    var closing = false;

    function fso() { return new ActiveXObject("Scripting.FileSystemObject"); }
    function writeAlive() {
      try {
        var f = fso().CreateTextFile(ALIVE, true);
        f.WriteLine("ok");
        f.Close();
      } catch (e) {}
    }
    function readText(p) {
      try {
        if (!fso().FileExists(p)) return "";
        var t = fso().OpenTextFile(p, 1);
        var s = t.ReadAll();
        t.Close();
        return s;
      } catch (e) { return ""; }
    }
    function setUi(n, text) {
      n = Math.max(0, Math.min(100, Math.round(n || 0)));
      var fill = document.getElementById("fill");
      var pct = document.getElementById("pct");
      var lab = document.getElementById("label");
      if (fill) fill.style.width = Math.max(8, n) + "%";
      if (pct) pct.innerText = n + "%";
      if (lab && text) lab.innerText = text;
    }
    function parseStatus(raw) {
      var map = {};
      var lines = String(raw || "").split("\\n");
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].replace("\\r", "");
        var eq = line.indexOf("=");
        if (eq < 1) continue;
        map[line.substring(0, eq)] = line.substring(eq + 1);
      }
      return map;
    }
    function tick() {
      if (closing) return;
      if ((new Date()).getTime() - started > 600000) { window.close(); return; }
      var map = parseStatus(readText(STATUS));
      var line = map.sub || map.label || "Installing update";
      if (map.pct) setUi(parseInt(map.pct, 10) || 0, line);
      try { window.focus(); } catch (e2) {}
      if (readText(SHOWN)) {
        closing = true;
        setUi(100, "Opening ARK");
        setTimeout(function () { window.close(); }, 450);
      }
    }
    window.resizeTo(420, 280);
    try {
      window.moveTo(Math.max(0, (screen.width - 420) / 2), Math.max(0, (screen.height - 280) / 2));
    } catch (e) {}
    writeAlive();
    setInterval(tick, 350);
    tick();
  </script>
</body>
</html>`;
}

function copySplashIcoToTemp(tempDir, destName = 'ark-update.ico') {
  const dest = path.join(tempDir, destName);
  const candidates = [
    resolveUpdateIco(),
    path.join(process.resourcesPath || '', 'icon.ico'),
    process.execPath,
  ].filter(Boolean);
  for (const src of candidates) {
    try {
      if (!src || src === dest) continue;
      if (!fs.existsSync(src)) continue;
      if (/\.exe$/i.test(src)) continue;
      fs.copyFileSync(src, dest);
      if (fs.existsSync(dest)) return dest;
    } catch {
      /* try next */
    }
  }
  return fs.existsSync(dest) ? dest : null;
}

function launchHtaSplash({ statusPath, shownPath }) {
  const temp = app.getPath('temp');
  const stamp = Date.now();
  const base = `ark-update-splash-${stamp}`;
  const htaPath = path.join(temp, `${base}.hta`);
  const alivePath = splashAliveFlagPath();
  const icoPath = copySplashIcoToTemp(temp, `${base}.ico`);
  try {
    fs.writeFileSync(
      htaPath,
      splashHtaHtml({
        statusPath,
        shownPath,
        alivePath,
        icoName: icoPath ? `${base}.ico` : '',
      }),
      'utf8',
    );
  } catch (err) {
    return { ok: false, error: String(err), htaPath, alivePath };
  }

  const mshta = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'mshta.exe');
  try {
    spawn(mshta, [htaPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
      cwd: temp,
    }).unref();
  } catch (err) {
    return { ok: false, error: String(err), htaPath, alivePath };
  }

  setTimeout(() => {
    try {
      fs.unlinkSync(htaPath);
    } catch {
      /* ignore */
    }
  }, 600_000);

  return { ok: true, htaPath, alivePath };
}

async function setSplash(win, pct, text, sub) {
  if (!win || win.isDestroyed()) return;
  const line = String(sub || text || 'Installing update');
  const esc = (v) => String(v || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  try {
    await Promise.race([
      win.webContents.executeJavaScript(
        `window.__arkSet && window.__arkSet(${Number(pct) || 0}, '${esc(line)}')`,
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
  try {
    app.setAppUserModelId('com.ark.studio');
  } catch {
    /* ignore */
  }

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

  const iconPath = resolveUpdateIco() || resolveUpdateIcon();

  const splashPath = path.join(app.getPath('temp'), `ark-update-splash-${process.pid}.html`);
  try {
    fs.writeFileSync(splashPath, splashHtml(), 'utf8');
  } catch (err) {
    writeLog(`splash write failed: ${err}`);
  }

  clearUiShown();
  clearSplashAlive();
  const statusPath = path.join(
    app.getPath('temp'),
    `ark-update-status-${process.pid}-${Date.now()}.txt`,
  );
  const shownPath = uiShownFlagPath();
  writeUpdateStatus(statusPath, 'waiting', 8, 'Installing update', 'Installing update');

  const win = new BrowserWindow({
    width: 420,
    height: 280,
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
    title: 'ARK',
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
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml())}`);
  }

  const showElectronSplash = () => {
    try {
      if (win.isDestroyed()) return;
      win.show();
      win.center();
      win.focus();
    } catch {
      /* ignore */
    }
  };

  const alivePath = splashAliveFlagPath();
  const winforms = launchInstallHandoffSplash({
    statusPath,
    expectedVersion,
    arkExe: process.execPath,
    shownPath,
    alivePath,
  });
  writeLog(`winforms splash launched ok=${winforms.ok} err=${winforms.error || ''}`);

  const winformsAlive = await waitForFile(alivePath, 7000);
  writeLog(`winforms alive=${winformsAlive}`);

  if (!winformsAlive) {
    const hta = launchHtaSplash({ statusPath, shownPath });
    writeLog(`hta splash launched ok=${hta.ok} path=${hta.htaPath || ''} err=${hta.error || ''}`);
    const htaAlive = await waitForFile(hta.alivePath, 3500);
    writeLog(`hta alive=${htaAlive}`);
    if (!htaAlive) {
      writeLog('independent splash did not paint; showing Electron splash');
      showElectronSplash();
      await setSplash(win, 4, 'Installing update');
    }
  } else {
    writeLog('WinForms splash is up; Electron window stays hidden so the splash never blinks off');
  }

  // Only then tell the parent it can quit — splash is already on screen.
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
    await setSplash(win, 8, 'Closing ARK');
    writeUpdateStatus(statusPath, 'waiting', 12, 'Closing ARK', 'Closing ARK');
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
    await sleep(400);

    await setSplash(win, 18, 'Installing update');
    writeUpdateStatus(statusPath, 'waiting', 18, 'Installing update', 'Installing update');
    writeLog('past waiting — starting install prep');

    if (isUrl) {
      await setSplash(win, 12, 'Downloading update');
      writeUpdateStatus(statusPath, 'downloading', 12, 'Downloading update', 'Downloading update');
      try {
        if (fs.existsSync(localSetup)) fs.unlinkSync(localSetup);
      } catch {
        /* ignore */
      }
      await downloadFile(payload, localSetup, async (pct) => {
        const n = Math.round((pct / 100) * 40);
        await setSplash(win, n, 'Downloading update');
        writeUpdateStatus(statusPath, 'downloading', n, 'Downloading update', 'Downloading update');
      });
      writeLog('download done');
    } else {
      await setSplash(win, 24, 'Installing update');
      writeUpdateStatus(statusPath, 'waiting', 24, 'Installing update', 'Installing update');
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
     * Do NOT run NSIS while this process still holds ARK.exe open.
     * Independent HTA/WinForms splash stays until the new ARK window is shown.
     */
    writeUpdateStatus(statusPath, 'waiting', 40, 'Installing update', 'Installing update');
    await setSplash(win, 40, 'Installing update');
    writeLog(`delegate install ${setupToRun} → ${installDir}; reopen=${reopenExe}`);
    launchCmdApplyUpdate({
      setupPath: setupToRun,
      installDir,
      expectedVersion,
      parentPid: process.pid,
      arkExe: reopenExe,
      statusPath,
    });

    writeUpdateStatus(statusPath, 'waiting', 48, 'Installing update', 'Installing update');
    await setSplash(win, 48, 'Installing update');

    // Independent splash already painted — close this ARK.exe window so NSIS can replace the binary.
    try {
      if (!win.isDestroyed()) win.close();
    } catch {
      /* ignore */
    }

    writeLog('electron splash closed; independent splash stays until ARK window opens');
    await sleep(400);
  } catch (err) {
    writeLog(`error ${err instanceof Error ? err.stack || err.message : err}`);
    try {
      await setSplash(win, 100, 'Update failed');
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

/** Status file the install CMD + handoff splash share (survives NSIS killing ARK.exe). */
function writeUpdateStatus(statusPath, stage, pct, label, sub) {
  try {
    fs.writeFileSync(
      statusPath,
      [
        `stage=${String(stage || '')}`,
        `pct=${Math.max(0, Math.min(100, Math.round(Number(pct) || 0)))}`,
        `label=${String(label || 'Installing update')}`,
        `sub=${String(sub || '')}`,
      ].join('\n') + '\n',
      'utf8',
    );
  } catch {
    /* ignore */
  }
}

/**
 * Independent WinForms splash — not loaded from install-dir ARK.exe, so NSIS cannot kill it.
 * Stays up through install until ARK.exe is running again, then closes.
 */
function launchInstallHandoffSplash({ statusPath, expectedVersion, arkExe, shownPath, alivePath }) {
  const temp = app.getPath('temp');
  const stamp = Date.now();
  const ps1Path = path.join(temp, `ark-update-handoff-${stamp}.ps1`);
  const ver = normalizeVersion(expectedVersion) || 'update';
  const qPs = (s) => String(s).replace(/'/g, "''");
  const splashAlive = alivePath || splashAliveFlagPath();

  const icoForForm = copySplashIcoToTemp(temp, `ark-update-handoff-${stamp}.ico`);
  const pngSrc = resolveUpdateIcon();
  let pngForForm = '';
  if (pngSrc) {
    pngForForm = path.join(temp, `ark-update-handoff-${stamp}.png`);
    try {
      fs.copyFileSync(pngSrc, pngForForm);
    } catch {
      pngForForm = pngSrc;
    }
  }

  const ps1 = [
    '$ErrorActionPreference = "Continue"',
    'Add-Type -AssemblyName System.Windows.Forms | Out-Null',
    'Add-Type -AssemblyName System.Drawing | Out-Null',
    'try {',
    '  Add-Type -TypeDefinition @"',
    'using System.Runtime.InteropServices;',
    'public static class ArkSplashAppId {',
    '  [DllImport("shell32.dll", CharSet = CharSet.Unicode)]',
    '  public static extern int SetCurrentProcessExplicitAppUserModelID(string AppID);',
    '}',
    '"@',
    '  [void][ArkSplashAppId]::SetCurrentProcessExplicitAppUserModelID("ARK.Studio.Update")',
    '} catch {}',
    `$statusPath = '${qPs(statusPath)}'`,
    `$arkExe = '${qPs(arkExe || '')}'`,
    `$shownPath = '${qPs(shownPath || uiShownFlagPath())}'`,
    `$alivePath = '${qPs(splashAlive)}'`,
    `$icoPath = '${qPs(icoForForm || '')}'`,
    `$pngPath = '${qPs(pngForForm || '')}'`,
    `$ver = '${qPs(ver)}'`,
    'function Write-ArkAlive { try { Set-Content -LiteralPath $alivePath -Value "ok" -Encoding ASCII } catch {} }',
    '$form = New-Object System.Windows.Forms.Form',
    `$form.Text = "ARK"`,
    '$form.Size = New-Object System.Drawing.Size(420, 280)',
    '$form.StartPosition = "CenterScreen"',
    '$form.FormBorderStyle = "None"',
    '$form.BackColor = [System.Drawing.Color]::FromArgb(10, 10, 12)',
    '$form.TopMost = $true',
    '$form.ShowInTaskbar = $true',
    'if ($icoPath -and (Test-Path -LiteralPath $icoPath)) { try { $form.Icon = New-Object System.Drawing.Icon($icoPath) } catch {} }',
    'if (-not $form.Icon) {',
    '  try {',
    '    $exeForIcon = $arkExe',
    '    if (-not $exeForIcon -or -not (Test-Path -LiteralPath $exeForIcon)) { $exeForIcon = [Diagnostics.Process]::GetCurrentProcess().MainModule.FileName }',
    '    $form.Icon = [System.Drawing.Icon]::ExtractAssociatedIcon($exeForIcon)',
    '  } catch {}',
    '}',
    '$pic = New-Object System.Windows.Forms.PictureBox',
    '$pic.SizeMode = "Zoom"',
    '$pic.Size = New-Object System.Drawing.Size(64, 64)',
    '$pic.Location = New-Object System.Drawing.Point(178, 40)',
    'if ($pngPath -and (Test-Path -LiteralPath $pngPath)) { try { $pic.Image = [System.Drawing.Image]::FromFile($pngPath) } catch {} }',
    'if (-not $pic.Image -and $form.Icon) { try { $pic.Image = $form.Icon.ToBitmap() } catch {} }',
    '$label = New-Object System.Windows.Forms.Label',
    '$label.Text = "Installing update"',
    '$label.ForeColor = [System.Drawing.Color]::FromArgb(242, 242, 243)',
    '$label.Font = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Bold)',
    '$label.AutoSize = $false',
    '$label.TextAlign = "MiddleCenter"',
    '$label.Size = New-Object System.Drawing.Size(380, 28)',
    '$label.Location = New-Object System.Drawing.Point(20, 118)',
    '$pct = New-Object System.Windows.Forms.Label',
    '$pct.Text = "8%"',
    '$pct.ForeColor = [System.Drawing.Color]::FromArgb(168, 168, 179)',
    '$pct.Font = New-Object System.Drawing.Font("Segoe UI", 11)',
    '$pct.AutoSize = $false',
    '$pct.TextAlign = "MiddleCenter"',
    '$pct.Size = New-Object System.Drawing.Size(380, 22)',
    '$pct.Location = New-Object System.Drawing.Point(20, 148)',
    '$track = New-Object System.Windows.Forms.Panel',
    '$track.BackColor = [System.Drawing.Color]::FromArgb(58, 58, 68)',
    '$track.Size = New-Object System.Drawing.Size(260, 10)',
    '$track.Location = New-Object System.Drawing.Point(80, 186)',
    '$fill = New-Object System.Windows.Forms.Panel',
    '$fill.BackColor = [System.Drawing.Color]::FromArgb(242, 242, 244)',
    '$fill.Size = New-Object System.Drawing.Size(21, 10)',
    '$fill.Location = New-Object System.Drawing.Point(0, 0)',
    '$track.Controls.Add($fill)',
    '$form.Controls.Add($pic)',
    '$form.Controls.Add($label)',
    '$form.Controls.Add($pct)',
    '$form.Controls.Add($track)',
    '$script:baselinePids = @{}',
    'try { Get-Process -Name "ARK" -ErrorAction SilentlyContinue | ForEach-Object { $script:baselinePids[$_.Id] = $true } } catch {}',
    '$script:installFinished = $false',
    '$script:waitingReopen = $false',
    '$script:closeArmed = $false',
    '$script:closeAt = 0',
    '$script:startedAt = [Environment]::TickCount',
    '$timer = New-Object System.Windows.Forms.Timer',
    '$timer.Interval = 350',
    '$timer.Add_Tick({',
    '  try {',
    '    if (Test-Path -LiteralPath $statusPath) {',
    '      $map = @{}',
    '      Get-Content -LiteralPath $statusPath -ErrorAction SilentlyContinue | ForEach-Object {',
    '        if ($_ -match "^(.*?)=(.*)$") { $map[$matches[1]] = $matches[2] }',
    '      }',
    '      if ($map.sub) { $label.Text = [string]$map.sub }',
    '      elseif ($map.label) { $label.Text = [string]$map.label }',
    '      if ($map.pct) {',
    '        $n = [int]$map.pct',
    '        if ($n -lt 0) { $n = 0 }',
    '        if ($n -gt 100) { $n = 100 }',
    '        $pct.Text = "$n%"',
    '        $w = [Math]::Max(12, [int](260 * $n / 100))',
    '        $fill.Width = $w',
    '      }',
    '      $stage = [string]$map.stage',
    '      if ($stage -eq "opening" -or $stage -eq "done" -or $stage -eq "waiting_reopen") {',
    '        $script:installFinished = $true',
    '        if (-not $script:waitingReopen) {',
    '          $script:waitingReopen = $true',
    '          $label.Text = "Opening ARK"',
    '        }',
    '      }',
    '    }',
    '  } catch {}',
    '  $uiReady = $false',
    '  try { if (Test-Path -LiteralPath $shownPath) { $uiReady = $true } } catch {}',
    '  if ($uiReady -and -not $script:closeArmed) {',
    '    $script:closeArmed = $true',
    '    $script:closeAt = [Environment]::TickCount + 400',
    '    $label.Text = "Opening ARK"',
    '    $pct.Text = "100%"',
    '    $fill.Width = 260',
    '  }',
    '  if (([Environment]::TickCount - $script:startedAt) -gt 600000) { $timer.Stop(); $form.Close() }',
    '  if ($script:closeArmed -and [Environment]::TickCount -ge $script:closeAt) {',
    '    $timer.Stop()',
    '    $form.Close()',
    '  }',
    '})',
    '$timer.Start()',
    '$form.Add_Shown({ Write-ArkAlive; $form.Activate(); $form.BringToFront() })',
    'Write-ArkAlive',
    '[void]$form.ShowDialog()',
  ].join('\r\n');

  try {
    fs.writeFileSync(ps1Path, ps1, 'utf8');
  } catch (err) {
    return { ok: false, error: String(err) };
  }

  const psExe = path.join(
    process.env.SystemRoot || 'C:\\Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );
  try {
    spawn(
      psExe,
      ['-STA', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', ps1Path],
      {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
        cwd: temp,
      },
    ).unref();
  } catch (err) {
    return { ok: false, error: String(err) };
  }

  setTimeout(() => {
    try {
      fs.unlinkSync(ps1Path);
    } catch {
      /* ignore */
    }
  }, 300_000);

  return { ok: true, ps1Path };
}

/**
 * Breakaway launch via wscript + cmd fallback so Electron's job object cannot kill the updater.
 * Prefer a plain CMD apply script (no second Electron) — it cannot blank itself with taskkill.
 * A separate WinForms splash (launchInstallHandoffSplash) covers the install gap.
 */
function launchCmdApplyUpdate({ setupPath, installDir, expectedVersion, parentPid, arkExe, statusPath }) {
  const temp = app.getPath('temp');
  const stamp = Date.now();
  const cmdPath = path.join(temp, `ark-apply-update-${stamp}.cmd`);
  const vbsPath = path.join(temp, `ark-apply-update-${stamp}.vbs`);
  const logPath = path.join(temp, `ark-apply-update-${stamp}.log`);
  const readyPath = path.join(temp, `ark-update-helper-${parentPid || process.pid}.ready`);
  const statusFile = statusPath || path.join(temp, `ark-update-status-${stamp}.json`);
  const ver = normalizeVersion(expectedVersion);
  const q = (s) => String(s).replace(/"/g, '""');

  try {
    if (fs.existsSync(readyPath)) fs.unlinkSync(readyPath);
  } catch {
    /* ignore */
  }

  try {
    fs.writeFileSync(readyPath, `cmd-ready ${new Date().toISOString()}\n`, 'utf8');
  } catch {
    /* ignore */
  }

  // Plain key=value status — echo-friendly for CMD (no JSON quoting).
  const setStatus = (stage, pct, label, sub) => [
    `> "${statusFile}" echo stage=${stage}`,
    `>> "${statusFile}" echo pct=${pct}`,
    `>> "${statusFile}" echo label=${label}`,
    `>> "${statusFile}" echo sub=${sub}`,
  ].join('\r\n');

  const cmdBody = [
    '@echo off',
    'setlocal',
    `title Updating ARK ${ver}`,
    `echo [%date% %time%] apply begin>> "${logPath}"`,
    `echo Waiting for updater pid ${parentPid} to exit...>> "${logPath}"`,
    setStatus('waiting', 42, 'Closing ARK', 'Closing ARK'),
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
    'timeout /t 1 /nobreak >nul',
    setStatus('installing', 55, 'Installing update', 'Installing update'),
    `echo Installing ${q(setupPath)} into ${q(installDir)}>> "${logPath}"`,
    `"${setupPath}" /S --updated /D=${installDir}`,
    'set EXITCODE=%ERRORLEVEL%',
    `echo installer exit=%EXITCODE%>> "${logPath}"`,
    'if not "%EXITCODE%"=="0" (',
    '  timeout /t 2 /nobreak >nul',
    setStatus('installing', 68, 'Installing update', 'Installing update'),
    `  "${setupPath}" /S --updated /D=${installDir}`,
    '  set EXITCODE=%ERRORLEVEL%',
    `  echo installer retry exit=%EXITCODE%>> "${logPath}"`,
    ')',
    setStatus('finishing', 85, 'Installing update', 'Installing update'),
    `del /f /q "${q(uiShownFlagPath())}" >nul 2>nul`,
    'timeout /t 1 /nobreak >nul',
    setStatus('opening', 88, 'Opening ARK', 'Opening ARK'),
    `if exist "${arkExe}" (`,
    `  echo Starting ARK ${q(arkExe)}>> "${logPath}"`,
    `  start "" "${arkExe}"`,
    ') else (',
    `  echo missing ${q(arkExe)}, trying install dir>> "${logPath}"`,
    `  start "" "${installDir}\\ARK.exe"`,
    ')',
    setStatus('waiting_reopen', 94, 'Opening ARK', 'Opening ARK'),
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

  return { logPath, readyPath, cmdPath, statusPath: statusFile };
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
    clearUiShown();
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
        const statusPath = path.join(
          app.getPath('temp'),
          `ark-update-status-fallback-${process.pid}.txt`,
        );
        launchInstallHandoffSplash({
          statusPath,
          expectedVersion,
          arkExe,
          shownPath: uiShownFlagPath(),
        });
        const handoff = launchCmdApplyUpdate({
          setupPath: stable,
          installDir,
          expectedVersion,
          parentPid: process.pid,
          arkExe,
          statusPath,
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
  markUiShown,
  clearUiShown,
  UPDATE_REPO,
};
