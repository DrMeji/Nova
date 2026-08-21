const { app, BrowserWindow, shell, ipcMain, dialog, Tray, Menu, nativeImage, powerMonitor } = require('electron');
const path = require('path');
const arkEngine = require('./arkEngine.cjs');
const arkPreview = require('./arkPreview.cjs');
const arkMedia = require('./arkMedia.cjs');
const arkProjects = require('./arkProjects.cjs');
const arkGit = require('./arkGit.cjs');
const arkSecrets = require('./arkSecrets.cjs');
const arkOpenExternal = require('./arkOpenExternal.cjs');
const arkBrainToken = require('./arkBrainToken.cjs');
const arkSystem = require('./arkSystem.cjs');
const arkSetup = require('./arkSetup.cjs');
const arkUpdater = require('./arkUpdater.cjs');
const arkAuthStore = require('./arkAuthStore.cjs');
const arkPaths = require('./arkPaths.cjs');
const arkOAuth = require('./arkOAuth.cjs');
const arkCrashLog = require('./arkCrashLog.cjs');
const arkGguf = require('./arkGguf.cjs');
const arkBrainApi = require('./arkBrainApi.cjs');
const arkConfig = require('./arkConfig.cjs');

const DEV_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
const isDev = process.env.ARK_DEV === '1';
const isUpdaterMode = process.argv.includes('--ark-updater');
const BRAIN_PORT = arkConfig.BRAIN_PORT_BASE;
let brainPort = BRAIN_PORT;

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

function resolveAppIcon() {
  const candidates = [
    path.join(__dirname, '..', 'build', 'icon.png'),
    path.join(__dirname, '..', 'dist', 'ark-icon.png'),
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
  const engine = arkEngine.getStatus();
  const token = arkBrainToken.loadToken();
  const brainUrl = `http://127.0.0.1:${brainPort}`;
  const authLabel = app.isPackaged
    ? (token ? 'Auth: on' : 'Auth: on (no token file)')
    : (token ? 'Auth: on (dev token set)' : 'Auth: off (dev)');
  const brainStatus = engine.phase === 'ready' ? 'Online' : engine.phase === 'starting' ? 'Starting…' : (engine.phase || 'Offline');
  const menu = Menu.buildFromTemplate([
    {
      label: 'Show ARK',
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
            mainWindow?.webContents.send('ark:open-settings', { section: 'account' });
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
      label: 'Quit ARK',
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip(`ARK · ${engine.phase || 'starting'} · ${brainPort}`);
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
    title: 'ARK',
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
      additionalArguments: [`--ark-packaged=${packaged ? '1' : '0'}`],
    },
  });

  mainWindow = win;

  const sendMaximized = () => {
    if (win.isDestroyed()) return;
    try {
      win.webContents.send('ark:window-maximized', { maximized: win.isMaximized() });
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
      arkUpdater.markUiShown();
    } catch {
      /* ignore */
    }
  };

  win.once('ready-to-show', reveal);
  // Fallback if ready-to-show never fires (blank/hung renderer).
  setTimeout(reveal, 4000);

  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[ark] did-fail-load', code, desc, url);
    reveal();
  });

  if (isDev) {
    win.loadURL(DEV_URL);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // Quiet packaged boots — no console spam / clean-boot wipe noise for end users.
  win.webContents.once('did-finish-load', () => {
    if (!win.isDestroyed()) win.setTitle('ARK');
  });

  // If the renderer boots to an empty #root (common when a build lacked Vite env),
  // surface a visible error instead of a permanent black window.
  win.webContents.on('did-finish-load', async () => {
    if (win.isDestroyed()) return;
    try {
      await new Promise((r) => setTimeout(r, 2500));
      if (win.isDestroyed()) return;
      const rootLen = await win.webContents.executeJavaScript(
        `(() => { const r = document.getElementById('root'); return r ? (r.innerHTML || '').length : 0; })()`,
      );
      if (typeof rootLen === 'number' && rootLen < 40) {
        await win.webContents.executeJavaScript(`(() => {
          const root = document.getElementById('root') || document.body;
          root.innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a0b;color:#f5f5f5;font-family:Segoe UI,system-ui,sans-serif;padding:32px;text-align:center"><div><p style="font-size:18px;font-weight:600;margin:0 0 8px">ARK UI failed to load</p><p style="opacity:.7;font-size:13px;margin:0">The window stayed blank. Quit ARK fully from the tray, reinstall the latest release, or run Open-ARK-Build.bat after a successful npm run build.</p></div></div>';
        })()`);
        reveal();
      }
    } catch {
      /* ignore probe failures */
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
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
  if (!isLocal && parsed.protocol !== 'https:') {
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
      const map = arkSecrets.loadMap();
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
      'User-Agent': 'ARK-Desktop',
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
      const map = arkSecrets.loadMap();
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
      event.sender.send('ark:http-stream-chunk', { streamId, ...msg });
    } catch {
      /* ignore */
    }
  };

  try {
    const res = await fetch(url, {
      method,
      headers: {
        'User-Agent': 'ARK-Desktop',
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

ipcMain.handle('ark:system-info', async () => arkSystem.probeSystemInfo());

ipcMain.handle('ark:speed-test', async () => arkSystem.probeSpeedTest());

ipcMain.handle('ark:update-check', async () => arkUpdater.checkForUpdate());
ipcMain.handle('ark:update-download', async (_event, payload) =>
  arkUpdater.downloadAndInstall(payload?.setupAssetUrl, payload?.latestTag),
);
ipcMain.handle('ark:update-state', async () => arkUpdater.getState());
ipcMain.handle('ark:post-update-consume', async () => arkUpdater.consumePostUpdate());

ipcMain.handle('ark:auth-storage-get', async (_event, key) => arkAuthStore.getItem(key));
ipcMain.handle('ark:auth-storage-set', async (_event, key, value) => arkAuthStore.setItem(key, value));
ipcMain.handle('ark:auth-storage-remove', async (_event, key) => arkAuthStore.removeItem(key));

ipcMain.handle('ark:login-item-get', async () => {
  const s = app.getLoginItemSettings();
  return {
    ok: true,
    openAtLogin: Boolean(s.openAtLogin),
    openAsHidden: Boolean(s.openAsHidden),
    isPackaged: app.isPackaged,
    canSetLoginItem: loginItemAllowed(),
  };
});

ipcMain.handle('ark:login-item-set', async (_event, payload) => {
  return applyLoginItem(Boolean(payload?.openAtLogin));
});

ipcMain.handle('ark:app-meta', async () => ({
  ok: true,
  isPackaged: app.isPackaged,
  isDev: Boolean(isDev),
  version: app.getVersion(),
  name: app.getName(),
  updateFeed: arkUpdater.UPDATE_REPO,
}));

ipcMain.handle('ark:setup-get', async () => arkSetup.readSetup());

ipcMain.handle('ark:setup-set', async (_event, payload) => {
  const completed = Boolean(payload?.completed);
  return arkSetup.writeSetup(completed);
});

ipcMain.handle('ark:window-minimize', async () => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  win?.minimize();
  return true;
});

ipcMain.handle('ark:window-maximize-toggle', async () => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  if (!win) return false;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
  return win.isMaximized();
});

ipcMain.handle('ark:window-is-maximized', async () => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  return Boolean(win?.isMaximized());
});

ipcMain.handle('ark:window-close', async () => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  win?.close();
  return true;
});

ipcMain.handle('ark:open-path', async (_event, targetPath) => {
  if (typeof targetPath !== 'string' || !targetPath.trim()) {
    throw new Error('Invalid path');
  }
  const resolved = path.resolve(targetPath);
  const root = path.resolve(app.getPath('userData'));
  if (!resolved.toLowerCase().startsWith(root.toLowerCase())) {
    throw new Error('Path is outside ARK data folder');
  }
  const err = await shell.openPath(resolved);
  if (err) throw new Error(err);
  return true;
});

ipcMain.handle('ark:open-external', async (event, url) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  return arkOpenExternal.openExternal(url, win);
});

ipcMain.handle('ark:secrets-status', async () => ({
  ok: true,
  encrypted: arkSecrets.encryptionAvailable(),
}));

ipcMain.handle('ark:secrets-load', async () => {
  try {
    const map = arkSecrets.loadMap();
    const keyStatus = {};
    for (const [id, value] of Object.entries(map)) {
      keyStatus[id] = Boolean(typeof value === 'string' && value.trim());
    }
    return { ok: true, keyStatus, encrypted: arkSecrets.encryptionAvailable() };
  } catch (err) {
    return { ok: false, keyStatus: {}, error: err instanceof Error ? err.message : 'Load failed' };
  }
});

ipcMain.handle('ark:secrets-get-key', async (_event, providerId) => {
  try {
    const id = String(providerId || '').trim();
    if (!id) return { ok: false, key: '' };
    const map = arkSecrets.loadMap();
    const key = map[id];
    return { ok: true, key: typeof key === 'string' ? key : '' };
  } catch (err) {
    return { ok: false, key: '', error: err instanceof Error ? err.message : 'Load failed' };
  }
});

ipcMain.handle('ark:secrets-save', async (_event, payload) => {
  try {
    if (!arkSecrets.encryptionAvailable()) {
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
    arkSecrets.saveMap(clean);
    return { ok: true, encrypted: arkSecrets.encryptionAvailable() };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Save failed',
      code: err.code || 'SAVE_FAILED',
    };
  }
});

ipcMain.handle('ark:http-get', async (event, payload) =>
  handleHttpRequest(event, { ...payload, method: 'GET' }),
);
ipcMain.handle('ark:http-request', handleHttpRequest);
ipcMain.handle('ark:http-stream', handleHttpStream);

ipcMain.handle('ark:engine-status', async () => arkEngine.getStatus());
ipcMain.handle('ark:engine-start', async () => arkEngine.start());
ipcMain.handle('ark:engine-stop', async () => arkEngine.stop());
ipcMain.handle('ark:engine-set-model', async (_e, id) => arkEngine.setActiveModel(id));
ipcMain.handle('ark:engine-download', async (_e, id) => arkEngine.beginDownload(id));
ipcMain.handle('ark:engine-register-hunt', async (_e, meta) => {
  try {
    const model = arkEngine.registerHunt(meta);
    return { ok: true, model };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});
ipcMain.handle('ark:engine-download-progress', async (_e, id) => arkEngine.downloadProgress(id));
ipcMain.handle('ark:engine-download-error', async (_e, id) => arkEngine.downloadError?.(id) ?? null);
ipcMain.handle('ark:engine-download-cancel', async (_e, id) => arkEngine.cancelDownload?.(id) ?? { ok: false });
ipcMain.handle('ark:engine-import-gguf', async (_e, filePath) => arkEngine.importGgufFile?.(filePath));
ipcMain.handle('ark:engine-delete-model', async (_e, id) => {
  try {
    return arkEngine.deleteInstalledModel?.(id) ?? { ok: false, error: 'Delete not available' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});
ipcMain.handle('ark:engine-import-gguf-pick', async () => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  const result = await dialog.showOpenDialog(win || undefined, {
    title: 'Import GGUF into ARK Engine',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'GGUF models', extensions: ['gguf'] }],
    defaultPath: arkPaths.modelsDir(),
  });
  if (result.canceled || !result.filePaths?.length) {
    return { ok: false, canceled: true };
  }
  const imported = [];
  for (const fp of result.filePaths) {
    imported.push(arkEngine.importGgufFile(fp));
  }
  return { ok: true, count: imported.length, status: imported[imported.length - 1] };
});
ipcMain.handle('ark:engine-disk-space', async () => arkEngine.diskSpaceForModels?.());
ipcMain.handle('ark:engine-ensure-runtime', async () => arkEngine.ensureRuntime());
ipcMain.handle('ark:engine-generate', async (_e, payload) =>
  arkEngine.generate(payload?.message ?? '', {
    modelId: payload?.modelId,
    kind: payload?.kind,
    temperature: payload?.temperature,
    nPredict: payload?.nPredict,
    mediaDurationSec: payload?.mediaDurationSec,
    referenceImageDataUrl: payload?.referenceImageDataUrl,
  }),
);

ipcMain.handle('ark:engine-generate-stream', async (event, payload) => {
  const webContentsId = event.sender.id;
  return arkEngine.generate(payload?.message ?? '', {
    modelId: payload?.modelId,
    kind: payload?.kind,
    temperature: payload?.temperature,
    nPredict: payload?.nPredict,
    onChunk: (text) => {
      try {
        event.sender.send('ark:engine-chunk', { webContentsId, text: String(text || '') });
      } catch {
        /* ignore */
      }
    },
  });
});

ipcMain.handle('ark:engine-generate-cancel', async () => {
  try {
    return arkGguf.cancelGguf?.() || { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Cancel failed' };
  }
});

ipcMain.handle('ark:models-dir-info', async () => arkPaths.modelsDirInfo());
ipcMain.handle('ark:models-dir-pick', async () => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  const result = await dialog.showOpenDialog(win || undefined, {
    title: 'Choose ARK models folder',
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: arkPaths.modelsDir(),
  });
  if (result.canceled || !result.filePaths?.[0]) {
    return { ok: false, canceled: true, ...arkPaths.modelsDirInfo() };
  }
  return { ...arkPaths.setModelsDir(result.filePaths[0]), canceled: false };
});
ipcMain.handle('ark:models-dir-set', async (_e, folderPath) => {
  try {
    return arkPaths.setModelsDir(folderPath);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not set folder',
      ...arkPaths.modelsDirInfo(),
    };
  }
});
ipcMain.handle('ark:models-dir-reset', async () => arkPaths.resetModelsDir());

ipcMain.handle('ark:preview-start', async (_e, payload) =>
  arkPreview.startPreview(payload || {}),
);
ipcMain.handle('ark:preview-stop', async (_e, projectId) =>
  arkPreview.stopPreview(projectId),
);
ipcMain.handle('ark:preview-open-window', async (_e, payload) =>
  arkPreview.openPreviewWindow(payload || {}),
);
ipcMain.handle('ark:preview-status', async (_e, projectId) =>
  arkPreview.previewStatus(projectId),
);
ipcMain.handle('ark:media-library', async () => {
  try {
    return { ok: true, items: arkMedia.listLibrary() };
  } catch (err) {
    return { ok: false, items: [], error: err instanceof Error ? err.message : 'library error' };
  }
});

ipcMain.handle('ark:media-clear', async () => {
  try {
    return arkMedia.clearLibrary();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'clear failed' };
  }
});

ipcMain.handle('ark:media-get', async (_e, id) => {
  try {
    const item = arkMedia.getLibraryItem(id);
    if (!item) return { ok: false, error: 'not found' };
    return { ok: true, item };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'media get error' };
  }
});

ipcMain.handle('ark:media-remove', async (_e, id) => {
  try {
    return arkMedia.removeLibraryItem(id);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'media remove error' };
  }
});

ipcMain.handle('ark:project-write', async (_e, payload) => {
  try {
    return arkProjects.writeProjectFiles(
      payload?.projectId,
      payload?.projectName,
      payload?.files || {},
      Boolean(payload?.sandbox),
    );
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'write failed' };
  }
});

ipcMain.handle('ark:project-read', async (_e, projectId) => {
  try {
    return arkProjects.readProjectFiles(projectId);
  } catch (err) {
    return { ok: false, files: {}, error: err instanceof Error ? err.message : 'read failed' };
  }
});

ipcMain.handle('ark:project-path', async (_e, projectId) => {
  try {
    return arkProjects.getProjectPath(projectId);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'path failed' };
  }
});

ipcMain.handle('ark:project-import-folder', async (_e, payload) => {
  try {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    let sourceDir = payload?.sourceDir;
    if (!sourceDir) {
      const result = await dialog.showOpenDialog(win || undefined, {
        title: 'Choose a folder',
        message: 'Select the folder. Everything inside stays in that folder attach until you send.',
        properties: ['openDirectory'],
      });
      if (result.canceled || !result.filePaths?.[0]) {
        return { ok: false, canceled: true };
      }
      sourceDir = result.filePaths[0];
    }
    return arkProjects.importFolder(payload?.projectId, payload?.projectName, sourceDir);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'import failed';
    if (/ENOTDIR/i.test(msg)) {
      return { ok: false, error: 'Could not open that folder. Try the real folder (not a broken shortcut).' };
    }
    return { ok: false, error: msg };
  }
});

/** Pick one or more files (shows files inside folders — unlike Open folder). */
ipcMain.handle('ark:pick-files', async (_e, payload) => {
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
    return { ok: true, paths };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'pick failed', paths: [] };
  }
});

ipcMain.handle('ark:path-stat', async (_e, targetPath) => {
  try {
    return arkProjects.pathStat(targetPath);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'stat failed' };
  }
});

ipcMain.handle('ark:list-dir', async (_e, dirPath) => {
  try {
    return arkProjects.listDir(dirPath);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'list failed', items: [] };
  }
});

ipcMain.handle('ark:browse-roots', async () => {
  try {
    return arkProjects.browseRoots();
  } catch (err) {
    return { ok: false, roots: [], error: err instanceof Error ? err.message : 'roots failed' };
  }
});

/** Jump to a folder, then the UI lists files inside (including images). */
ipcMain.handle('ark:pick-browse-folder', async () => {
  try {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    const result = await dialog.showOpenDialog(win || undefined, {
      title: 'Jump to a folder',
      message: 'Pick the folder to look inside. ARK will then show the files and photos in that folder.',
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

ipcMain.handle('ark:read-text-file', async (_e, payload) => {
  try {
    const target = typeof payload === 'string' ? payload : payload?.path;
    const maxBytes = typeof payload === 'object' && payload?.maxBytes ? payload.maxBytes : 2_000_000;
    return arkProjects.readTextFile(target, maxBytes);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'read failed' };
  }
});

ipcMain.handle('ark:read-data-url', async (_e, payload) => {
  try {
    const target = typeof payload === 'string' ? payload : payload?.path;
    const maxBytes = typeof payload === 'object' && payload?.maxBytes ? payload.maxBytes : 6_000_000;
    return arkProjects.readDataUrl(target, maxBytes);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'read failed' };
  }
});

ipcMain.handle('ark:project-search', async (_e, payload) => {
  try {
    return arkProjects.searchProjectFiles(payload?.projectId, payload?.query, payload?.limit);
  } catch (err) {
    return { ok: false, hits: [], error: err instanceof Error ? err.message : 'search failed' };
  }
});

ipcMain.handle('ark:project-delete-files', async (_e, projectId) => {
  try {
    return arkProjects.deleteProjectFiles(projectId);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'delete failed' };
  }
});

function projectCwd(projectId) {
  return arkProjects.getProjectPath(projectId).root;
}

ipcMain.handle('ark:git-status', async (_e, projectId) => {
  try {
    return await arkGit.status(projectCwd(projectId));
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'git status failed' };
  }
});

ipcMain.handle('ark:git-clone', async (_e, payload) => {
  try {
    return await arkGit.cloneRepo(projectCwd(payload?.projectId), payload?.url, payload?.token);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'clone failed' };
  }
});

ipcMain.handle('ark:git-commit', async (_e, payload) => {
  try {
    return await arkGit.commitAll(projectCwd(payload?.projectId), payload?.message);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'commit failed' };
  }
});

ipcMain.handle('ark:git-push', async (_e, payload) => {
  try {
    return await arkGit.push(projectCwd(payload?.projectId), payload?.token);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'push failed' };
  }
});

ipcMain.handle('ark:git-diff', async (_e, projectId) => {
  try {
    return await arkGit.diffSummary(projectCwd(projectId));
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'diff failed' };
  }
});

ipcMain.handle('ark:git-set-origin', async (_e, payload) => {
  try {
    const cwd = projectCwd(payload?.projectId);
    await arkGit.initIfNeeded(cwd);
    const set = await arkGit.setOrigin(cwd, payload?.remoteUrl);
    if (!set.ok) return set;
    const st = await arkGit.status(cwd);
    return { ok: true, ...st };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'remote failed' };
  }
});

ipcMain.handle('ark:plugin-oauth-start', async (_e, pluginId) => arkOAuth.startPluginOAuth(pluginId));
ipcMain.handle('ark:plugin-oauth-status', async () => ({ ok: true, ...arkOAuth.oauthConfigStatus() }));
ipcMain.handle('ark:plugin-oauth-set-client', async (_e, payload) => {
  const id = payload?.pluginId;
  const clientId = payload?.clientId;
  if (!id) return { ok: false, error: 'Missing pluginId' };
  const stored = arkOAuth.setClientId(String(id), clientId == null ? '' : String(clientId));
  return { ok: true, stored, ...arkOAuth.oauthConfigStatus() };
});

ipcMain.handle('ark:local-reports-list', async () => arkCrashLog.listReports());
ipcMain.handle('ark:local-reports-clear', async () => arkCrashLog.clearReports());
ipcMain.handle('ark:local-reports-open', async () => {
  const dir = arkCrashLog.logDir();
  await shell.openPath(dir);
  return { ok: true, path: dir };
});
ipcMain.handle('ark:signing-status', async () => {
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

ipcMain.handle('ark:brain-status', async () => ({
  ok: Boolean(brainApi?.isListening?.()),
  url: `http://127.0.0.1:${brainPort}`,
  contractVersion: arkBrainApi.CONTRACT_VERSION,
  engine: arkEngine.getStatus(),
  auth: app.isPackaged || Boolean(arkBrainToken.loadToken()) ? 'bearer' : 'none (localhost dev)',
  hasToken: Boolean(arkBrainToken.loadToken()),
}));

ipcMain.handle('ark:brain-token-get', async () => {
  const token = arkBrainToken.loadToken();
  return {
    ok: true,
    token,
    url: `http://127.0.0.1:${brainPort}`,
    hasToken: Boolean(token),
    packaged: app.isPackaged,
  };
});

ipcMain.handle('ark:brain-token-rotate', async () => {
  const token = arkBrainToken.rotateToken();
  return { ok: true, token, url: `http://127.0.0.1:${brainPort}` };
});

let brainApi = null;

function startBrainApi() {
  if (brainApi) return;
  const token = arkBrainToken.ensureToken(app.isPackaged) || process.env.ARK_BRAIN_TOKEN || '';
  brainApi = arkBrainApi.createBrainServer({
    arkEngine,
    port: BRAIN_PORT,
    token,
    requireAuth: app.isPackaged || Boolean(token),
  });
  brainApi.listen('127.0.0.1').then((port) => {
    brainPort = port;
    refreshTrayMenu();
    if (!app.isPackaged) {
      console.log(`[ark-brain] http://127.0.0.1:${brainPort} (contract ${arkBrainApi.CONTRACT_VERSION})`);
      console.log('[ark-engine] ready (ARK-owned local runtime)');
    }
  }).catch((err) => {
    if (!app.isPackaged) {
      console.log(`[ark-brain] failed: ${err.message}`);
    }
  });
}

// Updater must NOT take/contend for the single-instance lock. The main app still
// holds the lock when it breakaway-launches `ARK.exe --ark-updater`, so requesting
// the lock here used to make the updater exit immediately (no Updating window,
// no install, same update still available after reopen).
if (isUpdaterMode) {
  app.whenReady().then(() =>
    arkUpdater.runStandaloneSplash(process.argv).catch((err) => {
      console.error('[ark-updater] fatal', err);
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
      arkUpdater.setForceExitHook(() => {
        quitting = true;
        try { arkEngine.stop(); } catch { /* ignore */ }
        try { arkGguf.stopServer(); } catch { /* ignore */ }
        try { arkGguf.cancelGguf?.(); } catch { /* ignore */ }
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
      arkEngine.start();
      startBrainApi();
      createWindow();
      createTray();
      powerMonitor.on('suspend', () => {
        for (const w of BrowserWindow.getAllWindows()) {
          w.webContents.send('ark:system-suspend');
        }
      });
      app.on('activate', () => {
        showMainWindow();
      });
    });

    app.on('before-quit', () => {
      quitting = true;
      try { arkEngine.stop(); } catch { /* ignore */ }
      try { arkGguf.stopServer(); } catch { /* ignore */ }
      try { arkGguf.cancelGguf?.(); } catch { /* ignore */ }
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
      // With tray, closing the window hides ARK — brain stays on :8787 until Quit.
      if (tray && !quitting) return;
      if (brainApi) {
        void brainApi.close();
        brainApi = null;
      }
      if (process.platform !== 'darwin') app.quit();
    });
  }
}
