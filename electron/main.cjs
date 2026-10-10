const { app, BrowserWindow, shell, ipcMain, dialog, Tray, Menu, nativeImage, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs');
const novaEngine = require('./novaEngine.cjs');
const novaPreview = require('./novaPreview.cjs');
const novaMedia = require('./novaMedia.cjs');
const novaProjects = require('./novaProjects.cjs');
const novaGit = require('./novaGit.cjs');
const novaSecrets = require('./novaSecrets.cjs');
const novaOpenExternal = require('./novaOpenExternal.cjs');
const novaBrainToken = require('./novaBrainToken.cjs');
const novaSystem = require('./novaSystem.cjs');
const novaSetup = require('./novaSetup.cjs');
const novaUpdater = require('./novaUpdater.cjs');
const novaAuthStore = require('./novaAuthStore.cjs');
const novaPaths = require('./novaPaths.cjs');
const novaOAuth = require('./novaOAuth.cjs');
const novaCrashLog = require('./novaCrashLog.cjs');
const novaGguf = require('./novaGguf.cjs');
const novaBrainApi = require('./novaBrainApi.cjs');
const novaConfig = require('./novaConfig.cjs');
const novaPcInventory = require('./novaPcInventory.cjs');
const novaWebSearch = require('./novaWebSearch.cjs');
const novaSelfGuard = require('./novaSelfGuard.cjs');
const novaEdgeTts = require('./novaEdgeTts.cjs');
const novaCloudEnv = require('./novaCloudEnv.cjs');

// Keep the process alive on unexpected faults; log for freeze reports.
process.on('uncaughtException', (err) => {
  try {
    console.error('[NOVA] uncaughtException', err);
    novaCrashLog.appendReport('uncaughtException', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
  } catch { /* ignore */ }
});
process.on('unhandledRejection', (reason) => {
  try {
    const message = reason instanceof Error ? reason.message : String(reason);
    console.error('[NOVA] unhandledRejection', message);
    novaCrashLog.appendReport('unhandledRejection', {
      error: message,
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  } catch { /* ignore */ }
});

// Convert thrown IPC handler errors into stable { ok:false } payloads so the
// renderer is never left awaiting a forever-rejected invoke.
{
  const rawHandle = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (channel, listener) => rawHandle(channel, async (event, ...args) => {
    try {
      return await listener(event, ...args);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      try {
        novaCrashLog.appendReport('ipc-handler-error', {
          channel: String(channel),
          error: message,
          stack: err instanceof Error ? err.stack : undefined,
        });
      } catch { /* ignore */ }
      return { ok: false, error: message, code: 'IPC_HANDLER_ERROR' };
    }
  });
}

function refreshArkSelfGuard() {
  novaSelfGuard.init({
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
    execPath: process.execPath,
    isPackaged: app.isPackaged,
    // Unpackaged source builds (Open-NOVA-Build) must bind/audit this tree for Debug clinic.
    // Packaged installs stay locked out of their own app.asar / resources.
    allowDevSelfAccess: !app.isPackaged,
  });
}
refreshArkSelfGuard();

const DEV_URL = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173';
/** True only when Vite dev server is running (`npm run electron:dev`). Bat builds use dist/ instead. */
const isDev = process.env.NOVA_DEV === '1';
const isUpdaterMode = process.argv.includes('--nova-updater');
const BRAIN_PORT = novaConfig.BRAIN_PORT_BASE;
let brainPort = BRAIN_PORT;

/** Pin AppData under NOVA / NOVA-Dev only. */
(function pinStableUserData() {
  const fs = require('fs');
  const appData = app.getPath('appData');
  if (!app.isPackaged) {
    const dir = path.join(appData, 'NOVA-Dev');
    fs.mkdirSync(dir, { recursive: true });
    app.setPath('userData', dir);
  } else {
    const dir = path.join(appData, 'NOVA');
    fs.mkdirSync(dir, { recursive: true });
    app.setPath('userData', dir);
  }
  // Drop Chromium per-host zoom leftovers before sessions load. Live preview used to
  // call setZoomFactor on 127.0.0.1 and that map leaked into the shell (same host in dev).
  try {
    const prefsPath = path.join(app.getPath('userData'), 'Preferences');
    if (!fs.existsSync(prefsPath)) return;
    const parsed = JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
    if (parsed?.partition?.per_host_zoom_levels) {
      delete parsed.partition.per_host_zoom_levels;
      fs.writeFileSync(prefsPath, JSON.stringify(parsed));
    }
  } catch {
    /* prefs optional / locked */
  }
})();


const ALLOWED_HOSTS = new Set([
  'api.github.com',
  'api.notion.com',
  'www.googleapis.com',
  'gmail.googleapis.com',
  'oauth2.googleapis.com',
  'generativelanguage.googleapis.com',
  'api.openai.com',
  'api.anthropic.com',
  'api.groq.com',
  'api.perplexity.ai',
  'api.x.ai',
  'api.telegram.org',
  'openrouter.ai',
  'api.slack.com',
  'api.linear.app',
  'api.figma.com',
  'image.pollinations.ai',
  'gen.pollinations.ai',
  'aihorde.net',
  'huggingface.co',
  'hf-mirror.com',
  'api-inference.huggingface.co',
  'router.huggingface.co',
  'www.modelscope.cn',
  'modelscope.cn',
  'modelscope.ai',
  'integrate.api.nvidia.com',
  'api.nvcf.nvidia.com',
  'api.together.xyz',
  'api.fireworks.ai',
  'api.deepseek.com',
  'api.mistral.ai',
  'api.cerebras.ai',
  'api.sambanova.ai',
  'api.vercel.com',
  'discord.com',
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
  'speed.cloudflare.com',
  '127.0.0.1',
  'localhost',
]);

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {Tray | null} */
let tray = null;
let quitting = false;
const userSelectedImageGrants = new Map();
const USER_SELECTED_IMAGE_GRANT_MS = 10 * 60 * 1000;

function grantUserSelectedImages(paths) {
  const expiresAt = Date.now() + USER_SELECTED_IMAGE_GRANT_MS;
  for (const targetPath of paths) {
    userSelectedImageGrants.set(path.resolve(String(targetPath)), expiresAt);
  }
}

function hasUserSelectedImageGrant(targetPath) {
  const resolved = path.resolve(String(targetPath || ''));
  const expiresAt = userSelectedImageGrants.get(resolved);
  if (!expiresAt) return false;
  if (expiresAt < Date.now()) {
    userSelectedImageGrants.delete(resolved);
    return false;
  }
  return true;
}

function resolveAppIcon() {
  const candidates = [
    path.join(__dirname, '..', 'build', 'icon.png'),
    path.join(__dirname, '..', 'dist', 'nova-icon.png'),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', 'build', 'icon.png'),
  ];
  for (const p of candidates) {
    try {
      const image = nativeImage.createFromPath(p);
      if (!image.isEmpty()) return { path: p, image };
    } catch {
      /* try next */
    }
  }
  return { path: '', image: nativeImage.createEmpty() };
}

function refreshTrayMenu() {
  if (!tray) return;
  const engine = novaEngine.getStatus();
  const token = novaBrainToken.loadToken();
  const brainUrl = `http://127.0.0.1:${brainPort}`;
  const authLabel = app.isPackaged
    ? (token ? 'Auth: on' : 'Auth: on (no token file)')
    : (token ? 'Auth: on (dev token set)' : 'Auth: off (dev)');
  const brainStatus = engine.phase === 'ready' ? 'Online' : engine.phase === 'starting' ? 'Starting…' : (engine.phase || 'Offline');
  const menu = Menu.buildFromTemplate([
    {
      label: 'Show NOVA',
      click: () => {
        showMainWindow();
      },
    },
    {
      label: 'Open Settings',
      click: () => {
        showMainWindow();
        // Small delay so the window is ready before sending the IPC event.
        setTimeout(() => {
          try {
            mainWindow?.webContents.send('NOVA:open-settings', { section: 'account' });
          } catch {
            /* ignore */
          }
        }, 150);
      },
    },
    { type: 'separator' },
    {
      label: `Brain  ${brainStatus}`,
      enabled: false,
    },
    {
      label: `API  ${brainUrl}`,
      enabled: false,
    },
    {
      label: 'Copy API URL',
      click: () => {
        const { clipboard } = require('electron');
        clipboard.writeText(brainUrl);
      },
    },
    ...(token ? [{
      label: 'Copy API token',
      click: () => {
        const { clipboard } = require('electron');
        clipboard.writeText(token);
      },
    }] : []),
    { type: 'separator' },
    {
      label: 'Minimize to tray',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit NOVA',
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip(`NOVA · ${engine.phase || 'starting'} · ${brainPort}`);
}

function createTray() {
  if (tray) {
    refreshTrayMenu();
    return;
  }
  const { image } = resolveAppIcon();
  const trayImage = image.isEmpty()
    ? image
    : image.resize({ width: 16, height: 16 });
  tray = new Tray(trayImage);
  refreshTrayMenu();
  tray.on('double-click', () => {
    showMainWindow();
  });
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

/** Dev builds must never register Windows startup — raw electron.exe shows the Electron splash. */
function loginItemAllowed() {
  return app.isPackaged && !isDev;
}

function applyLoginItem(openAtLogin) {
  if (!loginItemAllowed()) {
    try {
      app.setLoginItemSettings({ openAtLogin: false });
    } catch {
      /* ignore */
    }
    return { ok: true, openAtLogin: false, devBlocked: true };
  }
  app.setLoginItemSettings({
    openAtLogin: Boolean(openAtLogin),
    openAsHidden: false,
    path: process.execPath,
    args: [],
  });
  const s = app.getLoginItemSettings();
  return { ok: true, openAtLogin: Boolean(s.openAtLogin) };
}

/** Remove stale Run-key entries left by dev Electron (node_modules\\electron). */
function cleanupStaleDevStartupEntry() {
  if (process.platform !== 'win32') return;
  try {
    const { execFileSync } = require('child_process');
    const script = [
      '$k = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"',
      '$p = Get-ItemProperty -Path $k -ErrorAction SilentlyContinue',
      'if (-not $p) { exit 0 }',
      'foreach ($prop in $p.PSObject.Properties) {',
      '  if ($prop.Name -match "^PS") { continue }',
      '  if ("$($prop.Value)" -match "node_modules[\\\\/]+electron") {',
      '    Remove-ItemProperty -Path $k -Name $prop.Name -Force -ErrorAction SilentlyContinue',
      '  }',
      '}',
    ].join(' ');
    execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      stdio: 'ignore',
      windowsHide: true,
      timeout: 12000,
    });
  } catch {
    /* ignore */
  }
}

function chromeZoomPath() {
  return path.join(app.getPath('userData'), 'nova-chrome-zoom.json');
}

function readChromeZoomFactor() {
  // Locked at 1 — do not persist Ctrl+/- / pinch zoom. Accidental zoom-out was
  // shrinking the rail + composer on every relaunch and feeling like “everything shrunk”.
  try {
    const raw = fs.readFileSync(chromeZoomPath(), 'utf8');
    const parsed = JSON.parse(raw);
    const z = Number(parsed?.zoomFactor);
    // Migrate any saved non-1 zoom back to locked baseline.
    if (Number.isFinite(z) && Math.abs(z - 1) > 0.001) {
      writeChromeZoomFactor(1);
    }
  } catch { /* default */ }
  return 1;
}

function writeChromeZoomFactor(factor) {
  try {
    // Always persist 1 (chrome size lock). Ignore factor argument.
    void factor;
    fs.writeFileSync(chromeZoomPath(), JSON.stringify({ zoomFactor: 1 }, null, 2), 'utf8');
  } catch { /* ignore */ }
}

/** Permanent shell size lock — zoomFactor 1, zoomLevel 0, no pinch/Ctrl+/- drift. */
function lockMainWindowChromeZoom(win) {
  if (!win || win.isDestroyed()) return;
  const apply = () => {
    try {
      win.webContents.setZoomFactor(1);
      win.webContents.setZoomLevel(0);
      writeChromeZoomFactor(1);
    } catch { /* ignore */ }
  };
  try {
    win.webContents.setVisualZoomLevelLimits(1, 1);
  } catch { /* ignore */ }
  apply();

  win.webContents.on('zoom-changed', () => apply());
  win.webContents.on('did-finish-load', () => apply());
  win.webContents.on('did-navigate', () => apply());
  win.webContents.on('did-navigate-in-page', () => apply());

  // Always block zoom chords (dev + packaged). Packaged still blocks DevTools separately.
  win.webContents.on('before-input-event', (event, input) => {
    const key = String(input.key || '');
    const keyLower = key.toLowerCase();
    const ctrl = Boolean(input.control || input.meta);
    if (!ctrl) return;
    // Ctrl/Cmd + +/- / = / 0 / NumpadAdd/Subtract
    const zoomKey =
      key === '='
      || key === '+'
      || key === '-'
      || key === '_'
      || key === '0'
      || keyLower === 'add'
      || keyLower === 'subtract'
      || keyLower === 'numpadadd'
      || keyLower === 'numpadsubtract'
      || keyLower === 'equal';
    if (zoomKey && (input.type === 'keyDown' || input.type === 'keyUp')) {
      event.preventDefault();
      apply();
      return;
    }
    // Ctrl + mouse wheel (when surfaced as before-input)
    if (input.type === 'mouseWheel' || keyLower === 'mousewheel') {
      event.preventDefault();
      apply();
    }
  });

  // Re-assert while focused — catches trackpad pinch that skips zoom-changed on some builds.
  const pulse = setInterval(() => {
    if (!win || win.isDestroyed()) {
      clearInterval(pulse);
      return;
    }
    try {
      const zf = Number(win.webContents.getZoomFactor());
      const zl = Number(win.webContents.getZoomLevel());
      if (Math.abs(zf - 1) > 0.001 || Math.abs(zl) > 0.01) apply();
    } catch {
      clearInterval(pulse);
    }
  }, 1500);
  win.on('closed', () => clearInterval(pulse));
}

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    showMainWindow();
    return;
  }

  const packaged = app.isPackaged;
  const { path: iconPath } = resolveAppIcon();

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 720,
    minHeight: 520,
    title: 'NOVA',
    backgroundColor: '#0a0a0b',
    autoHideMenuBar: true,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    icon: iconPath || undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
      additionalArguments: [`--ark-packaged=${packaged ? '1' : '0'}`],
    },
  });

  mainWindow = win;

  // D4: one automatic reload on renderer crash / hang; second within 60s → recovery message.
  let lastRendererCrashAt = 0;
  win.webContents.on('render-process-gone', (_e, details) => {
    try {
      novaCrashLog.appendReport('render-process-gone', {
        reason: details?.reason,
        exitCode: details?.exitCode,
      });
    } catch { /* ignore */ }
    if (quitting || win.isDestroyed()) return;
    const now = Date.now();
    if (now - lastRendererCrashAt < 60_000) {
      try {
        void win.webContents.executeJavaScript(`(() => {
          const root = document.getElementById('root') || document.body;
          if (!root) return;
          root.innerHTML = '<div style="padding:32px;font-family:Segoe UI,sans-serif;color:#f5f5f5;background:#0a0a0b;min-height:100vh"><p style="font-weight:600">NOVA had to stop recovering</p><p style="opacity:.75;font-size:13px">Quit from the tray and reopen. Use Copy freeze / build report if it keeps happening.</p></div>';
        })()`);
      } catch { /* ignore */ }
      return;
    }
    lastRendererCrashAt = now;
    try { win.webContents.reloadIgnoringCache(); } catch { /* ignore */ }
  });
  win.on('unresponsive', () => {
    try {
      novaCrashLog.appendReport('window-unresponsive', { at: new Date().toISOString() });
    } catch { /* ignore */ }
    if (quitting || win.isDestroyed()) return;
    const now = Date.now();
    if (now - lastRendererCrashAt < 60_000) return;
    lastRendererCrashAt = now;
    try { win.webContents.forcefullyCrashRenderer(); } catch {
      try { win.webContents.reloadIgnoringCache(); } catch { /* ignore */ }
    }
  });

  // Chrome zoom permanently locked at 1 (no Ctrl+/- / pinch / wheel drift).
  try {
    void readChromeZoomFactor();
    lockMainWindowChromeZoom(win);
  } catch { /* zoom optional */ }

  // Packaged builds only — keep Vite HMR unconstrained in bat/dev.
  if (packaged) {
    try {
      win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
        const headers = { ...(details.responseHeaders || {}) };
        headers['Content-Security-Policy'] = [
          [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob: https:",
            "font-src 'self' data:",
            "media-src 'self' blob: data:",
            "connect-src 'self' https: http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*",
            "frame-src 'none'",
            "object-src 'none'",
            "base-uri 'self'",
          ].join('; '),
        ];
        callback({ responseHeaders: headers });
      });
    } catch (err) {
      console.warn('[NOVA] CSP setup failed', err);
    }
  }

  try {
    const langs = win.webContents.session.availableSpellCheckerLanguages || [];
    const prefer = ['en-US', 'en-GB', 'en'].filter((l) => langs.includes(l));
    win.webContents.session.setSpellCheckerEnabled(true);
    if (prefer.length) win.webContents.session.setSpellCheckerLanguages(prefer);
  } catch {
    /* spellcheck optional on some builds */
  }

  const sendMaximized = () => {
    if (win.isDestroyed()) return;
    try {
      win.webContents.send('NOVA:window-maximized', { maximized: win.isMaximized() });
    } catch {
      /* ignore */
    }
  };
  win.on('maximize', sendMaximized);
  win.on('unmaximize', sendMaximized);
  win.on('restore', sendMaximized);

  const reveal = () => {
    if (win.isDestroyed()) return;
    if (packaged || !isDev) {
      try {
        win.maximize();
      } catch {
        /* ignore */
      }
    }
    if (!win.isVisible()) win.show();
    try {
      novaUpdater.markUiShown();
    } catch {
      /* ignore */
    }
  };

  win.once('ready-to-show', reveal);
  // Fallback if ready-to-show never fires (blank/hung renderer).
  setTimeout(reveal, 4000);

  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[NOVA] did-fail-load', code, desc, url);
    reveal();
  });

  if (isDev) {
    win.loadURL(DEV_URL);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // Quiet packaged boots — no console spam / clean-boot wipe noise for end users.
  win.webContents.once('did-finish-load', () => {
    if (!win.isDestroyed()) win.setTitle('NOVA');
  });

  // If the renderer boots to an empty #root (common when a build lacked Vite env),
  // retry load once, then show a locked professional recovery screen (logo, no scroll).
  let blankLoadRetried = false;
  win.webContents.on('did-finish-load', async () => {
    if (win.isDestroyed()) return;
    try {
      await new Promise((r) => setTimeout(r, 2200));
      if (win.isDestroyed()) return;
      const rootLen = await win.webContents.executeJavaScript(
        `(() => { const r = document.getElementById('root'); return r ? (r.innerHTML || '').length : 0; })()`,
      );
      if (!(typeof rootLen === 'number' && rootLen < 40)) return;

      // One automatic reload — covers race where dist/index.html loaded before assets settled.
      if (!blankLoadRetried && !isDev) {
        blankLoadRetried = true;
        try {
          win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
        } catch {
          /* fall through to recovery UI */
        }
        return;
      }

      let logoDataUrl = '';
      try {
        const { image } = resolveAppIcon();
        if (image && !image.isEmpty()) {
          logoDataUrl = image.resize({ width: 96, height: 96 }).toDataURL();
        }
      } catch {
        /* text wordmark only */
      }
      const logoHtml = logoDataUrl
        ? `<img src="${logoDataUrl}" width="72" height="72" alt="NOVA" style="display:block;margin:0 auto 20px;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.45)" />`
        : `<div style="width:72px;height:72px;margin:0 auto 20px;border-radius:16px;background:linear-gradient(145deg,#3d5afe,#7c4dff);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:22px;letter-spacing:.04em;box-shadow:0 12px 40px rgba(0,0,0,.45)">N</div>`;
      const recoveryHtml = [
        '<div id="nova-ui-recovery" style="position:fixed;inset:0;overflow:hidden;overscroll-behavior:none;display:flex;align-items:center;justify-content:center;',
        'background:radial-gradient(ellipse 80% 60% at 50% 40%,#14141a 0%,#0a0a0b 70%);color:#f5f5f5;',
        'font-family:Segoe UI,system-ui,sans-serif;padding:32px;text-align:center;box-sizing:border-box;user-select:none">',
        `<div style="max-width:360px;width:100%;transform:translateZ(0)">${logoHtml}`,
        '<p style="font-size:13px;font-weight:600;letter-spacing:.28em;text-transform:uppercase;margin:0 0 10px;opacity:.9">NOVA</p>',
        '<p style="font-size:17px;font-weight:600;margin:0 0 10px;line-height:1.35">UI didn\\\'t finish loading</p>',
        '<p style="opacity:.72;font-size:13px;margin:0;line-height:1.55">Quit NOVA from the tray, then reopen. If it stays blank, reinstall the latest release or run Open-NOVA-Build.bat after a successful npm run build.</p>',
        '</div></div>',
      ].join('');
      await win.webContents.executeJavaScript(`(() => {
        try {
          document.documentElement.style.overflow = 'hidden';
          document.body.style.overflow = 'hidden';
          document.body.style.margin = '0';
        } catch {}
        const root = document.getElementById('root') || document.body;
        root.innerHTML = ${JSON.stringify(recoveryHtml)};
      })()`);
      reveal();
    } catch {
      /* ignore probe failures */
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      void novaOpenExternal.openExternal(url).catch(err => {
        console.warn('[NOVA] blocked external link:', err instanceof Error ? err.message : String(err));
      });
    }
    return { action: 'deny' };
  });

  // Packaged app: block DevTools / element inspector so end users cannot view source.
  // Dev / unpackaged builds still allow F12 and Ctrl+Shift+I for debugging.
  // Zoom chords are blocked for all builds inside lockMainWindowChromeZoom().
  if (packaged && !isDev) {
    win.webContents.on('before-input-event', (event, input) => {
      const key = String(input.key || '').toLowerCase();
      const ctrl = Boolean(input.control || input.meta);
      const shift = Boolean(input.shift);
      const isDevtoolsChord =
        key === 'f12'
        || (ctrl && shift && (key === 'i' || key === 'j' || key === 'c'))
        || (ctrl && key === 'u');
      if (isDevtoolsChord) {
        event.preventDefault();
      }
    });
    try {
      win.webContents.closeDevTools();
    } catch { /* ignore */ }
  }

  // Renderer-side belt: kill Ctrl+wheel zoom even if Chromium skips before-input.
  win.webContents.on('did-finish-load', () => {
    win.webContents.executeJavaScript(`
      (function () {
        if (window.__novaChromeZoomLock) return true;
        window.__novaChromeZoomLock = true;
        const stopZoom = (e) => {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
          }
        };
        window.addEventListener('wheel', stopZoom, { passive: false, capture: true });
        window.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false, capture: true });
        window.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false, capture: true });
        document.documentElement.style.zoom = '1';
        return true;
      })();
    `, true).catch(() => {});
  });

  if (!app.isPackaged) {
    win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
    });
  }

  win.on('close', (e) => {
    if (quitting || isUpdaterMode) return;
    // Hide to tray so brain API can keep running; Quit from tray ends the app.
    e.preventDefault();
    win.hide();
    createTray();
  });

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });
}

function assertAllowedUrl(url) {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    throw new Error('Only http(s) URLs are allowed');
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid URL');
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    throw new Error(`Host not allowed: ${parsed.hostname}`);
  }
  const isLocal = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
  if (isLocal) {
    // Localhost proxy is only for NOVA Brain, Ollama, and common Vite preview ports —
    // not an open SSRF tunnel to arbitrary local services.
    const port = parsed.port
      ? Number(parsed.port)
      : (parsed.protocol === 'https:' ? 443 : 80);
    const allowed = new Set([
      8787,
      11434,
      Number(brainPort) || 8787,
      // NOVA UI Vite
      5173, 5174,
      // Project preview Vite range (see novaAgentExec DEV_PORT_CANDIDATES)
      ...Array.from({ length: 151 }, (_, i) => 5200 + i),
    ]);
    if (!allowed.has(port)) {
      throw new Error(`Local port not allowed: ${port}`);
    }
    return parsed;
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('Remote hosts must use https');
  }
  return parsed;
}

async function handleHttpRequest(_event, payload) {
  const url = payload?.url;
  const method = (payload?.method || 'GET').toUpperCase();
  const headers = payload?.headers && typeof payload.headers === 'object' ? { ...payload.headers } : {};
  const authProviderId = payload?.authProviderId ? String(payload.authProviderId).trim() : '';
  if (authProviderId) {
    delete headers.Authorization;
    delete headers.authorization;
    delete headers['x-api-key'];
    try {
      const map = novaSecrets.loadMap();
      const key = map[authProviderId];
      if (typeof key === 'string' && key.trim()) {
        if (authProviderId === 'anthropic') headers['x-api-key'] = key.trim();
        else headers.Authorization = `Bearer ${key.trim()}`;
      }
    } catch {
      /* ignore */
    }
  }
  const body = typeof payload?.body === 'string' ? payload.body : undefined;
  assertAllowedUrl(url);

  const res = await fetch(url, {
    method,
    headers: {
      'User-Agent': 'NOVA-Desktop',
      ...headers,
    },
    body: method === 'GET' || method === 'HEAD' ? undefined : body,
    signal: AbortSignal.timeout(25_000),
  });

  const buf = Buffer.from(await res.arrayBuffer());
  const ctype = (res.headers.get('content-type') || '').toLowerCase();
  if (
    ctype.includes('image/')
    || ctype.includes('video/')
    || ctype.includes('audio/')
    || ctype.includes('octet-stream')
    || ctype.includes('application/pdf')
  ) {
    return {
      ok: res.ok,
      status: res.status,
      data: {
        __binary: true,
        mime: ctype.split(';')[0] || 'application/octet-stream',
        base64: buf.toString('base64'),
      },
    };
  }

  const text = buf.toString('utf8');
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  return { ok: res.ok, status: res.status, data };
}

/** Stream OpenAI-style SSE (or raw text) and push text deltas to the renderer. */
async function handleHttpStream(event, payload) {
  const url = payload?.url;
  const method = (payload?.method || 'POST').toUpperCase();
  const headers = payload?.headers && typeof payload.headers === 'object' ? { ...payload.headers } : {};
  const authProviderId = payload?.authProviderId ? String(payload.authProviderId).trim() : '';
  if (authProviderId) {
    delete headers.Authorization;
    delete headers.authorization;
    delete headers['x-api-key'];
    try {
      const map = novaSecrets.loadMap();
      const key = map[authProviderId];
      if (typeof key === 'string' && key.trim()) {
        if (authProviderId === 'anthropic') headers['x-api-key'] = key.trim();
        else headers.Authorization = `Bearer ${key.trim()}`;
      }
    } catch {
      /* ignore */
    }
  }
  const body = typeof payload?.body === 'string' ? payload.body : undefined;
  const streamId = payload?.streamId || `s-${Date.now()}`;
  assertAllowedUrl(url);

  const send = (msg) => {
    try {
      event.sender.send('NOVA:http-stream-chunk', { streamId, ...msg });
    } catch {
      /* ignore */
    }
  };

  try {
    const res = await fetch(url, {
      method,
      headers: {
        'User-Agent': 'NOVA-Desktop',
        Accept: 'text/event-stream',
        ...headers,
      },
      body: method === 'GET' || method === 'HEAD' ? undefined : body,
      signal: AbortSignal.timeout(180_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      let errMsg = `HTTP ${res.status}`;
      try {
        const j = JSON.parse(errText);
        errMsg = j?.error?.message || j?.message || errMsg;
      } catch {
        if (errText) errMsg = errText.slice(0, 240);
      }
      send({ type: 'error', error: errMsg, status: res.status });
      return { ok: false, status: res.status, streamId, error: errMsg };
    }

    if (!res.body) {
      send({ type: 'error', error: 'No response body' });
      return { ok: false, status: res.status, streamId, error: 'No response body' };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let full = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split('\n');
      buf = parts.pop() || '';
      for (const line of parts) {
        const trimmed = line.trimEnd();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const json = JSON.parse(data);
          const geminiText = Array.isArray(json?.candidates?.[0]?.content?.parts)
            ? json.candidates[0].content.parts.map((p) => p?.text || '').join('')
            : '';
          const delta =
            json?.choices?.[0]?.delta?.content
            ?? json?.choices?.[0]?.message?.content
            ?? json?.delta?.text
            ?? geminiText
            ?? '';
          if (typeof delta === 'string' && delta) {
            full += delta;
            send({ type: 'delta', text: delta });
          }
        } catch {
          /* ignore non-JSON SSE lines */
        }
      }
    }

    send({ type: 'done', text: full });
    return { ok: true, status: res.status, streamId, text: full };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Stream failed';
    send({ type: 'error', error: msg });
    return { ok: false, streamId, error: msg };
  }
}

ipcMain.handle('NOVA:system-info', async () => novaSystem.probeSystemInfo());

ipcMain.handle('NOVA:speed-test', async () => novaSystem.probeSpeedTest());

ipcMain.handle('NOVA:update-check', async () => novaUpdater.checkForUpdate());
ipcMain.handle('NOVA:update-download', async (_event, payload) =>
  novaUpdater.downloadAndInstall(payload?.setupAssetUrl, payload?.latestTag),
);
ipcMain.handle('NOVA:update-state', async () => novaUpdater.getState());
ipcMain.handle('NOVA:update-splash-preview', async (_event, payload) => {
  // Dev/bat only — packaged installs no longer expose Preview splash in Settings.
  if (app.isPackaged) {
    return { ok: false, error: 'Splash preview is only available in bat/dev builds.' };
  }
  return novaUpdater.previewSplashDev(payload?.durationMs ?? 4500);
});
ipcMain.handle('NOVA:post-update-consume', async () => novaUpdater.consumePostUpdate());

ipcMain.handle('NOVA:auth-recovery-save', async (_e, payload) => {
  try {
    const novaAuthRecovery = require('./novaAuthRecovery.cjs');
    return novaAuthRecovery.saveLoginNote(payload || {});
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'recovery save failed' };
  }
});
ipcMain.handle('NOVA:auth-recovery-info', async () => {
  try {
    const novaAuthRecovery = require('./novaAuthRecovery.cjs');
    return novaAuthRecovery.getRecoveryInfo();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'recovery info failed' };
  }
});
ipcMain.handle('NOVA:auth-recovery-reveal', async () => {
  try {
    const novaAuthRecovery = require('./novaAuthRecovery.cjs');
    return await novaAuthRecovery.revealRecoveryFolder();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'recovery reveal failed' };
  }
});

ipcMain.handle('NOVA:auth-storage-get', async (_event, key) => novaAuthStore.getItem(key));
ipcMain.handle('NOVA:auth-storage-set', async (_event, key, value) => novaAuthStore.setItem(key, value));
ipcMain.handle('NOVA:auth-storage-remove', async (_event, key) => novaAuthStore.removeItem(key));

// Sync so renderer supabase.ts can resolve cloud keys at module load (guest-local builds).
ipcMain.on('NOVA:cloud-env-get', (event) => {
  try {
    event.returnValue = novaCloudEnv.getCloudAuthEnv();
  } catch {
    event.returnValue = { url: '', anonKey: '', source: null, configured: false };
  }
});
ipcMain.handle('NOVA:cloud-env-get', async () => {
  try {
    return novaCloudEnv.getCloudAuthEnv();
  } catch {
    return { url: '', anonKey: '', source: null, configured: false };
  }
});

ipcMain.handle('NOVA:login-item-get', async () => {
  const s = app.getLoginItemSettings();
  return {
    ok: true,
    openAtLogin: Boolean(s.openAtLogin),
    openAsHidden: Boolean(s.openAsHidden),
    isPackaged: app.isPackaged,
    canSetLoginItem: loginItemAllowed(),
  };
});

ipcMain.handle('NOVA:login-item-set', async (_event, payload) => {
  return applyLoginItem(Boolean(payload?.openAtLogin));
});

ipcMain.handle('NOVA:app-meta', async () => ({
  ok: true,
  isPackaged: app.isPackaged,
  isDevBuild: !app.isPackaged,
  isDev: Boolean(isDev),
  userDataProfile: app.isPackaged ? 'NOVA' : 'NOVA-Dev',
  version: app.getVersion(),
  name: app.getName(),
  updateFeed: novaUpdater.UPDATE_REPO,
}));

ipcMain.handle('NOVA:setup-get', async () => novaSetup.readSetup());

ipcMain.handle('NOVA:setup-set', async (_event, payload) => {
  const completed = Boolean(payload?.completed);
  return novaSetup.writeSetup(completed);
});

ipcMain.handle('NOVA:window-minimize', async () => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  win?.minimize();
  return true;
});

ipcMain.handle('NOVA:window-maximize-toggle', async () => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  if (!win) return false;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
  return win.isMaximized();
});

ipcMain.handle('NOVA:window-is-maximized', async () => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  return Boolean(win?.isMaximized());
});

ipcMain.handle('NOVA:window-close', async () => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  win?.close();
  return true;
});

ipcMain.handle('NOVA:open-path', async (_event, targetPath) => {
  if (typeof targetPath !== 'string' || !targetPath.trim()) {
    return { ok: false, error: 'Invalid path' };
  }
  const resolved = path.resolve(targetPath);
  const userData = path.resolve(app.getPath('userData'));
  let downloadsDir = '';
  try { downloadsDir = path.resolve(app.getPath('downloads')); } catch { /* ignore */ }
  const allowed = novaProjects.isPathUnderRoot(resolved, userData)
    || (downloadsDir && (
      resolved.toLowerCase() === downloadsDir.toLowerCase()
      || novaProjects.isPathUnderRoot(resolved, downloadsDir)
    ))
    || novaProjects.isAllowedExternalPath(resolved);
  if (!allowed) {
    return { ok: false, error: 'Path is not in an allowed folder. Re-open it with + → Open folder first.' };
  }
  if (!require('fs').existsSync(resolved)) {
    return { ok: false, error: 'Path does not exist' };
  }
  const err = await shell.openPath(resolved);
  if (err) return { ok: false, error: err };
  return { ok: true };
});

ipcMain.handle('NOVA:save-to-downloads', async (_event, payload) => {
  try {
    const fileName = String(payload?.fileName || `NOVA-${Date.now()}.bin`)
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
      .slice(0, 180);
    const bytes = payload?.bytes;
    if (!Array.isArray(bytes) || !bytes.length) {
      return { ok: false, error: 'No file bytes' };
    }
    const downloads = app.getPath('downloads');
    require('fs').mkdirSync(downloads, { recursive: true });
    let dest = path.join(downloads, fileName);
    if (require('fs').existsSync(dest)) {
      const ext = path.extname(fileName);
      const base = path.basename(fileName, ext);
      dest = path.join(downloads, `${base}-${Date.now()}${ext}`);
    }
    require('fs').writeFileSync(dest, Buffer.from(bytes));
    return {
      ok: true,
      path: dest,
      folderPath: downloads,
      fileName: path.basename(dest),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Save failed' };
  }
});

ipcMain.handle('NOVA:open-external', async (_event, url) => {
  try {
    return await novaOpenExternal.openExternal(url);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Open failed' };
  }
});

ipcMain.handle('NOVA:secrets-status', async () => ({
  ok: true,
  encrypted: novaSecrets.encryptionAvailable(),
}));

ipcMain.handle('NOVA:secrets-load', async () => {
  try {
    const map = novaSecrets.loadMap();
    const keyStatus = {};
    for (const [id, value] of Object.entries(map)) {
      keyStatus[id] = Boolean(typeof value === 'string' && value.trim());
    }
    return { ok: true, keyStatus, encrypted: novaSecrets.encryptionAvailable() };
  } catch (err) {
    return { ok: false, keyStatus: {}, error: err instanceof Error ? err.message : 'Load failed' };
  }
});

ipcMain.handle('NOVA:secrets-get-key', async (_event, providerId) => {
  try {
    const id = String(providerId || '').trim();
    if (!id) return { ok: false, key: '' };
    const map = novaSecrets.loadMap();
    const key = map[id];
    return { ok: true, key: typeof key === 'string' ? key : '' };
  } catch (err) {
    return { ok: false, key: '', error: err instanceof Error ? err.message : 'Load failed' };
  }
});

ipcMain.handle('NOVA:secrets-save', async (_event, payload) => {
  try {
    if (!novaSecrets.encryptionAvailable()) {
      return {
        ok: false,
        error: 'Secure storage unavailable on this PC — API keys cannot be saved safely',
        code: 'NO_ENCRYPTION',
      };
    }
    const keys = payload?.keys && typeof payload.keys === 'object' ? payload.keys : {};
    // Never accept non-string values
    const clean = {};
    for (const [id, value] of Object.entries(keys)) {
      if (typeof value === 'string' && value.trim()) clean[id] = value.trim();
    }
    novaSecrets.saveMap(clean);
    return { ok: true, encrypted: novaSecrets.encryptionAvailable() };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Save failed',
      code: err.code || 'SAVE_FAILED',
    };
  }
});

ipcMain.handle('NOVA:http-get', async (event, payload) =>
  handleHttpRequest(event, { ...payload, method: 'GET' }),
);
ipcMain.handle('NOVA:http-request', handleHttpRequest);
ipcMain.handle('NOVA:http-stream', handleHttpStream);

ipcMain.handle('NOVA:voice-neural-voices', async () => novaEdgeTts.listNeuralVoices());
ipcMain.handle('NOVA:voice-neural-speak', async (_e, payload) =>
  novaEdgeTts.synthesize(payload?.text, payload?.voice),
);

ipcMain.handle('NOVA:engine-status', async () => novaEngine.getStatus());
ipcMain.handle('NOVA:engine-start', async () => novaEngine.start());
ipcMain.handle('NOVA:engine-stop', async () => novaEngine.stop());
ipcMain.handle('NOVA:engine-set-model', async (event, id) => {
  try {
    if (!id || typeof id !== 'string') throw new Error('Missing model id');
    const st = novaEngine.setActiveModel(id);
    try { event.sender.send('NOVA:engine-changed', { activeModelId: id }); } catch { /* ignore */ }
    return st;
  } catch (err) {
    console.warn('[NOVA] engine-set-model', err instanceof Error ? err.message : err);
    try { return novaEngine.getStatus(); } catch { return { phase: 'offline', models: [] }; }
  }
});
ipcMain.handle('NOVA:engine-download', async (_e, id) => {
  try {
    if (!id || typeof id !== 'string') throw new Error('Missing model id');
    return novaEngine.beginDownload(id);
  } catch (err) {
    console.warn('[NOVA] engine-download', err instanceof Error ? err.message : err);
    try { return novaEngine.getStatus(); } catch { return { phase: 'offline', models: [] }; }
  }
});
ipcMain.handle('NOVA:engine-register-hunt', async (_e, meta) => {
  try {
    const model = novaEngine.registerHunt(meta);
    return { ok: true, model };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});
ipcMain.handle('NOVA:engine-download-progress', async (_e, id) => novaEngine.downloadProgress(id));
ipcMain.handle('NOVA:engine-download-error', async (_e, id) => novaEngine.downloadError?.(id) ?? null);
ipcMain.handle('NOVA:engine-download-cancel', async (_e, id) => novaEngine.cancelDownload?.(id) ?? { ok: false });
ipcMain.handle('NOVA:engine-import-gguf', async (_e, filePath) => novaEngine.importGgufFile?.(filePath));
ipcMain.handle('NOVA:engine-scan-external-ggufs', async () => {
  try {
    return novaEngine.scanExternalGgufs?.() ?? { ok: false, models: [], count: 0, error: 'Scan not available' };
  } catch (err) {
    return { ok: false, models: [], count: 0, error: err instanceof Error ? err.message : String(err) };
  }
});
ipcMain.handle('NOVA:engine-delete-model', async (_e, id) => {
  try {
    return novaEngine.deleteInstalledModel?.(id) ?? { ok: false, error: 'Delete not available' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});
ipcMain.handle('NOVA:engine-import-gguf-pick', async () => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  const result = await dialog.showOpenDialog(win || undefined, {
    title: 'Import GGUF into NOVA Engine',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'GGUF models', extensions: ['gguf'] }],
    defaultPath: novaPaths.modelsDir(),
  });
  if (result.canceled || !result.filePaths?.length) {
    return { ok: false, canceled: true };
  }
  const imported = [];
  for (const fp of result.filePaths) {
    imported.push(novaEngine.importGgufFile(fp));
  }
  return { ok: true, count: imported.length, status: imported[imported.length - 1] };
});
ipcMain.handle('NOVA:engine-disk-space', async () => novaEngine.diskSpaceForModels?.());
ipcMain.handle('NOVA:engine-ensure-runtime', async () => novaEngine.ensureRuntime());
ipcMain.handle('NOVA:engine-generate', async (_e, payload) => {
  const novaJobs = require('./novaJobs.cjs');
  return novaJobs.enqueue({
    kind: 'gguf',
    label: 'engine-generate',
    run: () => novaEngine.generate(payload?.message ?? '', {
      modelId: payload?.modelId,
      kind: payload?.kind,
      temperature: payload?.temperature,
      nPredict: payload?.nPredict,
      mediaDurationSec: payload?.mediaDurationSec,
      referenceImageDataUrl: payload?.referenceImageDataUrl,
      visionImages: payload?.visionImages,
      jobId: payload?.jobId,
      chatId: payload?.chatId,
    }),
  });
});

ipcMain.handle('NOVA:engine-generate-stream', async (event, payload) => {
  const webContentsId = event.sender.id;
  const novaJobs = require('./novaJobs.cjs');
  // Craft must not wait behind leftover npm/vite from a prior create.
  try {
    novaJobs.cancelQueued?.({ kind: 'npm' });
    novaJobs.cancelQueued?.({ kind: 'vite' });
  } catch { /* ignore */ }
  return novaJobs.enqueue({
    kind: 'gguf',
    label: 'engine-generate-stream',
    run: () => {
      let chunkBuf = '';
      let chunkTimer = null;
      const flushChunks = () => {
        if (chunkTimer) {
          clearTimeout(chunkTimer);
          chunkTimer = null;
        }
        if (!chunkBuf) return;
        const text = chunkBuf;
        chunkBuf = '';
        try {
          event.sender.send('NOVA:engine-chunk', { webContentsId, text });
        } catch {
          /* ignore */
        }
      };
      return novaEngine.generate(payload?.message ?? '', {
        modelId: payload?.modelId,
        kind: payload?.kind,
        temperature: payload?.temperature,
        nPredict: payload?.nPredict,
        visionImages: payload?.visionImages,
        jobId: payload?.jobId,
        chatId: payload?.chatId,
        onChunk: (text) => {
          chunkBuf += String(text || '');
          if (chunkTimer) return;
          // Coalesce lightly (~24ms) so Code can paint near line-by-line, not big chunks.
          chunkTimer = setTimeout(flushChunks, 24);
        },
      }).finally(() => {
        flushChunks();
      });
    },
  });
});

ipcMain.handle('NOVA:engine-generate-cancel', async (_e, payload) => {
  try {
    // Drop waiting craft jobs so retry does not sit behind a zombie generate.
    try {
      const novaJobs = require('./novaJobs.cjs');
      novaJobs.cancelQueued?.({ kind: 'gguf' });
    } catch { /* ignore */ }
    return novaGguf.cancelGguf?.({
      jobId: payload?.jobId,
      chatId: payload?.chatId,
    }) || { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Cancel failed' };
  }
});

ipcMain.handle('NOVA:web-search', async (_e, payload) => {
  try {
    return await novaWebSearch.searchWeb(payload?.query || payload?.q || '');
  } catch (err) {
    return { ok: false, text: '', sources: [], error: err instanceof Error ? err.message : 'Web search failed' };
  }
});

ipcMain.handle('NOVA:image-search', async (_e, payload) => {
  try {
    return await novaWebSearch.searchImages(payload?.query || payload?.q || '');
  } catch (err) {
    return { ok: false, images: [], error: err instanceof Error ? err.message : 'Image search failed' };
  }
});

ipcMain.handle('NOVA:models-dir-info', async () => novaPaths.modelsDirInfo());
ipcMain.handle('NOVA:models-dir-pick', async () => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  const result = await dialog.showOpenDialog(win || undefined, {
    title: 'Choose NOVA models folder',
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: novaPaths.modelsDir(),
  });
  if (result.canceled || !result.filePaths?.[0]) {
    return { ok: false, canceled: true, ...novaPaths.modelsDirInfo() };
  }
  return { ...novaPaths.setModelsDir(result.filePaths[0]), canceled: false };
});
ipcMain.handle('NOVA:models-dir-set', async (_e, folderPath) => {
  try {
    return novaPaths.setModelsDir(folderPath);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not set folder',
      ...novaPaths.modelsDirInfo(),
    };
  }
});
ipcMain.handle('NOVA:models-dir-reset', async () => novaPaths.resetModelsDir());

ipcMain.handle('NOVA:preview-start', async (_e, payload) =>
  novaPreview.startPreview(payload || {}),
);
ipcMain.handle('NOVA:preview-stop', async (_e, projectId) =>
  novaPreview.stopPreview(projectId),
);
ipcMain.handle('NOVA:preview-open-window', async (_e, payload) =>
  novaPreview.openPreviewWindow(payload || {}),
);
ipcMain.handle('NOVA:preview-close-live', async (_e, payload) =>
  novaPreview.closeLivePreviewWindow(payload || {}),
);
ipcMain.handle('NOVA:preview-set-active-chat', async (_e, payload) =>
  novaPreview.setActiveLiveChat(payload || {}),
);
ipcMain.handle('NOVA:preview-update', async (_e, payload) =>
  novaPreview.updatePreview(payload || {}),
);
ipcMain.handle('NOVA:preview-reload', async (_e, projectId) =>
  novaPreview.reloadPreviewWindow(projectId),
);
ipcMain.handle('NOVA:preview-capture-live', async () =>
  novaPreview.captureLivePreview(),
);
ipcMain.handle('NOVA:preview-probe-mounted', async (_e, payload) =>
  novaPreview.probePreviewMounted(payload || {}),
);
ipcMain.handle('NOVA:preview-status', async (_e, projectId) =>
  novaPreview.previewStatus(projectId),
);
ipcMain.handle('NOVA:media-library', async () => {
  try {
    return { ok: true, items: novaMedia.listLibrary() };
  } catch (err) {
    return { ok: false, items: [], error: err instanceof Error ? err.message : 'library error' };
  }
});

ipcMain.handle('NOVA:media-clear', async () => {
  try {
    return novaMedia.clearLibrary();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'clear failed' };
  }
});

ipcMain.handle('NOVA:media-get', async (_e, id) => {
  try {
    const item = novaMedia.getLibraryItem(id);
    if (!item) return { ok: false, error: 'not found' };
    return { ok: true, item };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'media get error' };
  }
});

ipcMain.handle('NOVA:media-remove', async (_e, id) => {
  try {
    return novaMedia.removeLibraryItem(id);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'media remove error' };
  }
});

ipcMain.handle('NOVA:project-write', async (_e, payload) => {
  try {
    return novaProjects.writeProjectFiles(
      payload?.projectId,
      payload?.projectName,
      payload?.files || {},
      Boolean(payload?.sandbox),
    );
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'write failed' };
  }
});

ipcMain.handle('NOVA:project-read', async (_e, projectId) => {
  try {
    return novaProjects.readProjectFiles(projectId);
  } catch (err) {
    return { ok: false, files: {}, error: err instanceof Error ? err.message : 'read failed' };
  }
});

ipcMain.handle('NOVA:project-path', async (_e, projectId) => {
  try {
    return novaProjects.getProjectPath(projectId);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'path failed' };
  }
});

ipcMain.handle('NOVA:project-import-folder', async (event, payload) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender)
      || BrowserWindow.getFocusedWindow()
      || mainWindow;
    let sourceDir = payload?.sourceDir;
    if (!sourceDir) {
      const result = await dialog.showOpenDialog(win || undefined, {
        title: 'Import folder into NOVA (copy)',
        message: 'NOVA will copy this folder into its project storage. For in-place editing, use Open folder instead.',
        properties: ['openDirectory'],
      });
      if (result.canceled || !result.filePaths?.[0]) {
        return { ok: false, canceled: true };
      }
      sourceDir = result.filePaths[0];
    }
    const sendProgress = (p) => {
      try {
        event.sender.send('NOVA:project-import-progress', p);
      } catch {
        /* ignore */
      }
    };
    return await novaProjects.importFolder(
      payload?.projectId,
      payload?.projectName,
      sourceDir,
      sendProgress,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'import failed';
    if (/ENOTDIR/i.test(msg)) {
      return { ok: false, error: 'Could not open that folder. Try the real folder (not a broken shortcut).' };
    }
    return { ok: false, error: msg };
  }
});

ipcMain.handle('NOVA:workspace-mkdir', async (_e, payload) => {
  try {
    return novaProjects.workspaceMkdir(payload || {});
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'mkdir failed' };
  }
});

ipcMain.handle('NOVA:workspace-sandbox-root', async () => {
  try {
    return novaProjects.workspaceSandboxRoot();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'sandbox failed' };
  }
});

/** Open folder in-place — edits go to the real path on disk (no copy). */
ipcMain.handle('NOVA:workspace-open-root', async (event, payload) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender)
      || BrowserWindow.getFocusedWindow()
      || mainWindow;
    let sourceDir = payload?.sourceDir;
    if (!sourceDir) {
      const result = await dialog.showOpenDialog(win || undefined, {
        title: 'Open folder on this PC',
        message: 'NOVA will read and edit files in this folder directly. Allow access to this path?',
        properties: ['openDirectory'],
      });
      if (result.canceled || !result.filePaths?.[0]) {
        return { ok: false, canceled: true };
      }
      sourceDir = result.filePaths[0];
    }
    const sendProgress = (p) => {
      try {
        event.sender.send('NOVA:project-import-progress', p);
      } catch {
        /* ignore */
      }
    };
    return await novaProjects.openWorkspaceRoot(
      payload?.projectId,
      payload?.projectName,
      sourceDir,
      sendProgress,
      { catalogOnly: Boolean(payload?.catalogOnly) },
    );
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'open failed' };
  }
});

/** Validate a typed path before opening in-place. */
ipcMain.handle('NOVA:workspace-stat-path', async (_e, targetPath) => {
  try {
    return novaProjects.pathStat(targetPath);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'stat failed' };
  }
});

ipcMain.handle('NOVA:workspace-set-grants', async (_e, grants) => {
  try {
    return { ok: true, grants: novaProjects.setWorkspaceGrants(grants || {}) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'grants failed' };
  }
});

ipcMain.handle('NOVA:workspace-get-grants', async () => {
  try {
    return { ok: true, grants: novaProjects.loadWorkspaceGrants() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'grants failed' };
  }
});

ipcMain.handle('NOVA:agent-run', async (_e, payload) => {
  try {
    const novaAgentExec = require('./novaAgentExec.cjs');
    const novaJobs = require('./novaJobs.cjs');
    const command = String(payload?.command || '').trim();
    // Serialize heavy npm installs through novaJobs so Defender/disk storms don't stack.
    if (/^(npm|pnpm|yarn)(\.cmd)?\s+(install|i|ci|add)(\s|$)/i.test(command)) {
      return await novaJobs.enqueue({
        kind: 'npm',
        label: command.slice(0, 80),
        run: () => novaAgentExec.agentRun(payload || {}),
      });
    }
    return await novaAgentExec.agentRun(payload || {});
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'agent run failed' };
  }
});

ipcMain.handle('NOVA:agent-start-dev-server', async (_e, payload) => {
  try {
    const novaAgentExec = require('./novaAgentExec.cjs');
    const novaJobs = require('./novaJobs.cjs');
    return await novaJobs.enqueue({
      kind: 'vite',
      label: 'agent-start-dev-server',
      run: () => novaAgentExec.agentStartDevServer(payload || {}),
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'dev server failed' };
  }
});

ipcMain.handle('NOVA:agent-start-folder-preview', async (_e, payload) => {
  try {
    const novaAgentExec = require('./novaAgentExec.cjs');
    return await novaAgentExec.agentStartFolderPreview(payload || {});
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'folder preview failed' };
  }
});

ipcMain.handle('NOVA:preview-session', async (_e, cwd) => {
  try {
    const novaAgentExec = require('./novaAgentExec.cjs');
    const session = novaAgentExec.getPreviewSession(cwd || '');
    return session?.url
      ? { ok: true, url: session.url, cwd: session.cwd }
      : { ok: false, running: false };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'preview session failed' };
  }
});

/** Preview SSOT — attach live cwd session or start one (never a second Vite for same cwd). */
ipcMain.handle('NOVA:preview-get-or-attach', async (_e, cwd) => {
  try {
    const novaAgentExec = require('./novaAgentExec.cjs');
    const novaJobs = require('./novaJobs.cjs');
    return await novaJobs.enqueue({
      kind: 'vite',
      label: 'preview-get-or-attach',
      run: () => novaAgentExec.getOrAttachPreview(cwd || ''),
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'preview get-or-attach failed' };
  }
});

ipcMain.handle('NOVA:jobs-enqueue', async (_e, payload) => {
  try {
    const novaJobs = require('./novaJobs.cjs');
    const kind = String(payload?.kind || '');
    if (kind !== 'gguf' && kind !== 'npm' && kind !== 'vite') {
      return { ok: false, error: 'kind must be gguf|npm|vite' };
    }
    // Renderer cannot pass run(); this IPC is a status/ack stub for future wiring.
    // Real enqueue with run() is main-process only — see NOVA:agent-run (npm) and
    // NOVA:agent-start-dev-server (vite) which call novaJobs.enqueue({ kind, run }).
    return { ok: true, queued: false, status: novaJobs.status(), note: 'Pass run() from main only' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'jobs enqueue failed' };
  }
});

ipcMain.handle('NOVA:jobs-status', async () => {
  try {
    const novaJobs = require('./novaJobs.cjs');
    return { ok: true, ...novaJobs.status() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'jobs status failed' };
  }
});

ipcMain.handle('NOVA:mcp-list-tools', async (_e, payload) => {
  try {
    const novaMcpHost = require('./novaMcpHost.cjs');
    return await novaMcpHost.listTools(payload || {});
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'MCP list failed', tools: [] };
  }
});

ipcMain.handle('NOVA:mcp-call-tool', async (_e, payload) => {
  try {
    const novaMcpHost = require('./novaMcpHost.cjs');
    const server = payload?.server || payload || {};
    return await novaMcpHost.callTool(server, payload?.name, payload?.arguments);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'MCP call failed',
      content: '',
    };
  }
});

ipcMain.handle('NOVA:mcp-stop', async (_e, payload) => {
  try {
    const novaMcpHost = require('./novaMcpHost.cjs');
    return novaMcpHost.stopServer(payload?.id);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'MCP stop failed' };
  }
});

ipcMain.handle('NOVA:workspace-delete-path', async (_e, payload) => {
  try {
    return novaProjects.deleteWorkspaceRelPath(payload?.projectId, payload?.relPath);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'delete failed' };
  }
});

ipcMain.handle('NOVA:workspace-delete-root', async (_e, payload) => {
  try {
    return novaProjects.deleteWorkspaceRoot(payload?.projectId);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'delete failed' };
  }
});

ipcMain.handle('NOVA:workspace-delete-folder', async (_e, payload) => {
  try {
    return await novaProjects.deleteGrantedFolder(payload?.targetPath);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'delete failed' };
  }
});

ipcMain.handle('NOVA:workspace-write-file', async (_e, payload) => {
  try {
    return novaProjects.writeGrantedFile(payload?.targetPath, payload?.content ?? '');
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'write failed' };
  }
});

ipcMain.handle('NOVA:workspace-save-asset', async (_e, payload) => {
  try {
    return await novaProjects.saveAssetToGrantedPath(payload || {});
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'asset save failed' };
  }
});

ipcMain.handle('NOVA:brand-search-images', async (_e, payload) => {
  try {
    return await novaProjects.searchOpenverseImages(payload?.query, payload || {});
  } catch (err) {
    return { ok: false, results: [], error: err instanceof Error ? err.message : 'search failed' };
  }
});

ipcMain.handle('NOVA:workspace-rename-path', async (_e, payload) => {
  try {
    return novaProjects.renameGrantedPath(payload?.fromPath, payload?.toPath);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'rename failed' };
  }
});

/** Clone a repo to a folder, then open it in-place as the workspace. */
ipcMain.handle('NOVA:git-clone-open', async (event, payload) => {
  try {
    const url = String(payload?.url || '').trim();
    if (!url) return { ok: false, error: 'Paste a git clone URL.' };
    const win = BrowserWindow.fromWebContents(event.sender)
      || BrowserWindow.getFocusedWindow()
      || mainWindow;
    let dest = payload?.destDir;
    if (!dest) {
      const os = require('os');
      const defaultPath = path.join(os.homedir(), 'Documents');
      const result = await dialog.showOpenDialog(win || undefined, {
        title: 'Clone into folder',
        message: 'Pick the parent folder. NOVA will create a subfolder for the repo.',
        defaultPath,
        properties: ['openDirectory', 'createDirectory'],
      });
      if (result.canceled || !result.filePaths?.[0]) {
        return { ok: false, canceled: true };
      }
      const repoName = url.replace(/\.git$/i, '').split('/').pop() || 'repo';
      dest = path.join(result.filePaths[0], repoName);
    } else {
      const resolvedDest = path.resolve(String(dest));
      const parent = path.dirname(resolvedDest);
      if (
        !novaProjects.isAllowedExternalPath(resolvedDest)
        && !novaProjects.isAllowedExternalPath(parent)
      ) {
        return {
          ok: false,
          error: 'Clone destination is outside NOVA access. Enable Desktop/Documents/Full PC or pick a folder.',
        };
      }
    }
    const cloned = await novaGit.cloneToPath(url, dest, payload?.token);
    if (!cloned.ok) return cloned;
    const sendProgress = (p) => {
      try {
        event.sender.send('NOVA:project-import-progress', p);
      } catch {
        /* ignore */
      }
    };
    const opened = await novaProjects.openWorkspaceRoot(
      payload?.projectId,
      payload?.projectName || path.basename(dest),
      dest,
      sendProgress,
    );
    return { ...opened, cloneMessage: cloned.message };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'clone failed' };
  }
});

/** Pick one or more files (shows files inside folders — unlike Open folder). */
ipcMain.handle('NOVA:pick-files', async (_e, payload) => {
  try {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    const imagesOnly = Boolean(payload?.imagesOnly);
    let defaultPath;
    try {
      defaultPath = imagesOnly ? app.getPath('pictures') : app.getPath('documents');
    } catch {
      defaultPath = undefined;
    }
    const result = await dialog.showOpenDialog(win || undefined, {
      title: imagesOnly ? 'Choose photo(s)' : 'Choose file(s)',
      defaultPath,
      properties: ['openFile', 'multiSelections'],
      filters: imagesOnly
        ? [
          { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] },
          { name: 'All files', extensions: ['*'] },
        ]
        : [
          { name: 'All files', extensions: ['*'] },
          { name: 'Code', extensions: ['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'java', 'kt', 'swift', 'cs', 'cpp', 'c', 'h', 'rb', 'php', 'vue', 'css', 'html', 'json', 'md', 'txt', 'sql', 'yml', 'yaml', 'toml'] },
          { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] },
        ],
    });
    if (result.canceled || !result.filePaths?.length) {
      return { ok: false, canceled: true, paths: [] };
    }
    const paths = result.filePaths.filter((p) => {
      if (!imagesOnly) return true;
      return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(p);
    });
    // Always grant image paths so Attach (photos + files) can readDataUrl.
    grantUserSelectedImages(paths.filter((p) => /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(p)));
    return { ok: true, paths };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'pick failed', paths: [] };
  }
});

ipcMain.handle('NOVA:path-stat', async (_e, targetPath) => {
  try {
    return novaProjects.pathStat(targetPath);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'stat failed' };
  }
});

ipcMain.handle('NOVA:list-dir', async (_e, dirPath) => {
  try {
    return novaProjects.listDir(dirPath);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'list failed', items: [] };
  }
});

ipcMain.handle('NOVA:browse-roots', async () => {
  try {
    return novaProjects.browseRoots();
  } catch (err) {
    return { ok: false, roots: [], error: err instanceof Error ? err.message : 'roots failed' };
  }
});

ipcMain.handle('NOVA:pc-installed-apps', async (_e, payload) => {
  try {
    const grants = novaProjects.loadWorkspaceGrants();
    return await novaPcInventory.listInstalledApps(grants, payload || {});
  } catch (err) {
    return {
      ok: false,
      apps: [],
      error: err instanceof Error ? err.message : 'installed apps failed',
    };
  }
});

/** Jump to a folder, then the UI lists files inside (including images). */
ipcMain.handle('NOVA:pick-browse-folder', async () => {
  try {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    const result = await dialog.showOpenDialog(win || undefined, {
      title: 'Jump to a folder',
      message: 'Pick the folder to look inside. NOVA will then show the files and photos in that folder.',
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths?.[0]) {
      return { ok: false, canceled: true };
    }
    return { ok: true, path: result.filePaths[0] };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'pick failed' };
  }
});

ipcMain.handle('NOVA:read-text-file', async (_e, payload) => {
  try {
    refreshArkSelfGuard();
    const target = typeof payload === 'string' ? payload : payload?.path;
    const maxBytes = typeof payload === 'object' && payload?.maxBytes ? payload.maxBytes : 2_000_000;
    return novaProjects.readTextFile(target, maxBytes);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'read failed' };
  }
});

ipcMain.handle('NOVA:is-protected-path', async (_e, targetPath) => {
  try {
    refreshArkSelfGuard();
    const p = String(targetPath || '');
    return { ok: true, protected: novaSelfGuard.isArkProtectedPath(p) };
  } catch (err) {
    return { ok: false, protected: false, error: err instanceof Error ? err.message : 'check failed' };
  }
});

ipcMain.handle('NOVA:read-data-url', async (_e, payload) => {
  try {
    const target = typeof payload === 'string' ? payload : payload?.path;
    const maxBytes = typeof payload === 'object' && payload?.maxBytes ? payload.maxBytes : 6_000_000;
    return novaProjects.readDataUrl(target, maxBytes, {
      allowUserSelectedImage: hasUserSelectedImageGrant(target),
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'read failed' };
  }
});

ipcMain.handle('NOVA:project-search', async (_e, payload) => {
  try {
    return novaProjects.searchProjectFiles(payload?.projectId, payload?.query, payload?.limit);
  } catch (err) {
    return { ok: false, hits: [], error: err instanceof Error ? err.message : 'search failed' };
  }
});

ipcMain.handle('NOVA:project-delete-files', async (_e, projectId) => {
  try {
    return await novaProjects.deleteProjectFiles(projectId);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'delete failed' };
  }
});

function projectCwd(projectId) {
  return novaProjects.getProjectPath(projectId).root;
}

ipcMain.handle('NOVA:git-status', async (_e, projectId) => {
  try {
    return await novaGit.status(projectCwd(projectId));
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'git status failed' };
  }
});

ipcMain.handle('NOVA:git-clone', async (_e, payload) => {
  try {
    return await novaGit.cloneRepo(projectCwd(payload?.projectId), payload?.url, payload?.token);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'clone failed' };
  }
});

ipcMain.handle('NOVA:git-commit', async (_e, payload) => {
  try {
    return await novaGit.commitAll(projectCwd(payload?.projectId), payload?.message);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'commit failed' };
  }
});

ipcMain.handle('NOVA:git-push', async (_e, payload) => {
  try {
    return await novaGit.push(projectCwd(payload?.projectId), payload?.token);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'push failed' };
  }
});

ipcMain.handle('NOVA:git-pull', async (_e, payload) => {
  try {
    return await novaGit.pull(projectCwd(payload?.projectId), payload?.token);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'pull failed' };
  }
});

ipcMain.handle('NOVA:git-diff', async (_e, projectId) => {
  try {
    return await novaGit.diffSummary(projectCwd(projectId));
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'diff failed' };
  }
});

ipcMain.handle('NOVA:git-set-origin', async (_e, payload) => {
  try {
    const cwd = projectCwd(payload?.projectId);
    await novaGit.initIfNeeded(cwd);
    const set = await novaGit.setOrigin(cwd, payload?.remoteUrl);
    if (!set.ok) return set;
    const st = await novaGit.status(cwd);
    return { ok: true, ...st };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'remote failed' };
  }
});

ipcMain.handle('NOVA:plugin-oauth-start', async (_e, pluginId, opts) => {
  try {
    return await novaOAuth.startPluginOAuth(pluginId, opts && typeof opts === 'object' ? opts : {});
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'OAuth failed' };
  }
});
ipcMain.handle('NOVA:plugin-oauth-cancel', async () => {
  try {
    return novaOAuth.cancelPluginOAuth();
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Cancel failed' };
  }
});
ipcMain.handle('NOVA:plugin-oauth-status', async () => ({ ok: true, ...novaOAuth.oauthConfigStatus() }));
ipcMain.handle('NOVA:plugin-oauth-set-client', async (_e, payload) => {
  const id = payload?.pluginId;
  const clientId = payload?.clientId;
  if (!id) return { ok: false, error: 'Missing pluginId' };
  const raw = clientId == null ? '' : String(clientId).trim();
  // Never persist PATs as OAuth client ids — they belong in the vault after sign-in.
  if (String(id) === 'github' && /^(ghp_|github_pat_|gho_|ghu_|ghs_|ghr_)/i.test(raw)) {
    return {
      ok: false,
      error: 'pat_not_client_id',
      message: 'That is a personal access token, not an OAuth Client ID. Use Continue with GitHub to sign in with it.',
    };
  }
  const stored = novaOAuth.setClientId(String(id), raw);
  return { ok: true, stored, ...novaOAuth.oauthConfigStatus() };
});

ipcMain.handle('NOVA:local-reports-list', async () => novaCrashLog.listReports());
ipcMain.handle('NOVA:local-reports-clear', async () => novaCrashLog.clearReports());
ipcMain.handle('NOVA:local-reports-append', async (_e, payload) => {
  const kind = payload?.kind || 'note';
  const rest = payload && typeof payload === 'object' ? { ...payload } : {};
  delete rest.kind;
  return novaCrashLog.appendReport(kind, rest);
});
ipcMain.handle('NOVA:local-reports-open', async () => {
  const dir = novaCrashLog.logDir();
  await shell.openPath(dir);
  return { ok: true, path: dir };
});
ipcMain.handle('NOVA:signing-status', async () => {
  if (process.platform !== 'win32' || !app.isPackaged) {
    return { ok: true, packaged: app.isPackaged, signed: null, status: 'n/a' };
  }
  try {
    const exe = process.execPath;
    const { execFile } = require('child_process');
    const ps = await new Promise((resolve) => {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-Command', `(Get-AuthenticodeSignature -FilePath '${exe.replace(/'/g, "''")}').Status`],
        { windowsHide: true, timeout: 8000 },
        (err, stdout) => {
          if (err) resolve('Unknown');
          else resolve(String(stdout || '').trim() || 'Unknown');
        },
      );
    });
    return {
      ok: true,
      packaged: true,
      signed: ps === 'Valid',
      status: ps,
      path: exe,
    };
  } catch (err) {
    return {
      ok: false,
      packaged: true,
      signed: null,
      status: err instanceof Error ? err.message : 'check failed',
    };
  }
});

ipcMain.handle('NOVA:brain-status', async () => ({
  ok: Boolean(brainApi?.isListening?.()),
  url: `http://127.0.0.1:${brainPort}`,
  contractVersion: novaBrainApi.CONTRACT_VERSION,
  engine: novaEngine.getStatus(),
  auth: app.isPackaged || Boolean(novaBrainToken.loadToken()) ? 'bearer' : 'none (localhost dev)',
  hasToken: Boolean(novaBrainToken.loadToken()),
}));

ipcMain.handle('NOVA:brain-token-get', async () => {
  const token = novaBrainToken.loadToken();
  return {
    ok: true,
    token,
    url: `http://127.0.0.1:${brainPort}`,
    hasToken: Boolean(token),
    packaged: app.isPackaged,
  };
});

ipcMain.handle('NOVA:brain-token-rotate', async () => {
  const token = novaBrainToken.rotateToken();
  return { ok: true, token, url: `http://127.0.0.1:${brainPort}` };
});

let brainApi = null;

function startBrainApi() {
  if (brainApi) return;
  const token = novaBrainToken.ensureToken(app.isPackaged) || process.env.NOVA_BRAIN_TOKEN || '';
  brainApi = novaBrainApi.createBrainServer({
    novaEngine,
    port: BRAIN_PORT,
    token,
    requireAuth: app.isPackaged || Boolean(token),
  });
  brainApi.listen('127.0.0.1').then((port) => {
    brainPort = port;
    refreshTrayMenu();
    if (!app.isPackaged) {
      console.log(`[NOVA-brain] http://127.0.0.1:${brainPort} (contract ${novaBrainApi.CONTRACT_VERSION})`);
      console.log('[nova-engine] ready (NOVA-owned local runtime)');
    }
  }).catch((err) => {
    if (!app.isPackaged) {
      console.log(`[NOVA-brain] failed: ${err.message}`);
    }
  });
}

// Updater must NOT take/contend for the single-instance lock. The main app still
// holds the lock when it breakaway-launches `NOVA.exe --nova-updater`, so requesting
// the lock here used to make the updater exit immediately (no Updating window,
// no install, same update still available after reopen).
if (isUpdaterMode) {
  app.whenReady().then(() =>
    novaUpdater.runStandaloneSplash(process.argv).catch((err) => {
      console.error('[NOVA-updater] fatal', err);
      app.quit();
    }),
  );
  app.on('window-all-closed', () => {
    /* splash owns lifetime */
  });
} else {
  // One process only — desktop shortcut / installer must not spawn duplicate trays.
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
  } else {
    app.on('second-instance', () => {
      showMainWindow();
    });

    app.whenReady().then(() => {
      cleanupStaleDevStartupEntry();
      if (!app.isPackaged) {
        applyLoginItem(false);
      }
      novaUpdater.setForceExitHook(() => {
        quitting = true;
        try { novaEngine.stop(); } catch { /* ignore */ }
        try { novaGguf.stopServer(); } catch { /* ignore */ }
        try { novaGguf.cancelGguf?.(); } catch { /* ignore */ }
        if (tray) {
          try {
            tray.destroy();
          } catch {
            /* ignore */
          }
          tray = null;
        }
        if (brainApi) {
          try {
            void brainApi.close();
          } catch {
            /* ignore */
          }
          brainApi = null;
        }
      });
      novaEngine.start();
      startBrainApi();
      createWindow();
      try { novaPreview.restoreShellChromeZoom?.(); } catch { /* ignore */ }
      createTray();
      powerMonitor.on('suspend', () => {
        for (const w of BrowserWindow.getAllWindows()) {
          w.webContents.send('NOVA:system-suspend');
        }
      });
      app.on('activate', () => {
        showMainWindow();
      });
    });

    app.on('before-quit', () => {
      quitting = true;
      try { require('./novaMcpHost.cjs').stopAll(); } catch { /* ignore */ }
      try { require('./novaAgentExec.cjs').stopAllPreviews(); } catch { /* ignore */ }
      try { novaPreview.stopAllPreviews?.(); } catch { /* ignore */ }
      try { novaEngine.stop(); } catch { /* ignore */ }
      try { novaGguf.stopAllGguf?.() || novaGguf.stopServer(); } catch { /* ignore */ }
      try { novaGguf.cancelGguf?.(); } catch { /* ignore */ }
      if (brainApi) {
        try { void brainApi.close(); } catch { /* ignore */ }
        brainApi = null;
      }
      if (tray) {
        try {
          tray.destroy();
        } catch {
          /* ignore */
        }
        tray = null;
      }
    });

    app.on('window-all-closed', () => {
      // With tray, closing the window hides NOVA — brain stays on :8787 until Quit.
      if (tray && !quitting) return;
      if (brainApi) {
        void brainApi.close();
        brainApi = null;
      }
      if (process.platform !== 'darwin') app.quit();
    });
  }
}
