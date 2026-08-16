const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const http = require('http');
const arkEngine = require('./arkEngine.cjs');
const arkPreview = require('./arkPreview.cjs');
const arkMedia = require('./arkMedia.cjs');
const arkProjects = require('./arkProjects.cjs');
const arkSecrets = require('./arkSecrets.cjs');
const arkSystem = require('./arkSystem.cjs');
const arkSetup = require('./arkSetup.cjs');
const arkUpdater = require('./arkUpdater.cjs');
const arkAuthStore = require('./arkAuthStore.cjs');
const arkPaths = require('./arkPaths.cjs');
const arkOAuth = require('./arkOAuth.cjs');
const arkCrashLog = require('./arkCrashLog.cjs');
const arkGguf = require('./arkGguf.cjs');

const DEV_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
const isDev = process.env.ARK_DEV === '1';
const isUpdaterMode = process.argv.includes('--ark-updater');
const BRAIN_PORT = 8787;

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
  'huggingface.co',
  'api-inference.huggingface.co',
  'router.huggingface.co',
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

function createWindow() {
  const packaged = app.isPackaged;
  const iconPath = path.join(__dirname, '..', 'build', 'icon.png');

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 940,
    minHeight: 600,
    title: 'ARK',
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: [`--ark-packaged=${packaged ? '1' : '0'}`],
    },
  });

  mainWindow = win;

  win.once('ready-to-show', () => {
    if (packaged || !isDev) {
      win.maximize();
    }
    win.show();
  });

  if (isDev) {
    win.loadURL(DEV_URL);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // Quiet packaged boots — no console spam / clean-boot wipe noise for end users.
  win.webContents.once('did-finish-load', () => {
    win.setTitle('ARK');
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
  const headers = payload?.headers && typeof payload.headers === 'object' ? payload.headers : {};
  const body = typeof payload?.body === 'string' ? payload.body : undefined;
  assertAllowedUrl(url);

  const res = await fetch(url, {
    method,
    headers: {
      'User-Agent': 'ARK-Desktop',
      ...headers,
    },
    body: method === 'GET' || method === 'HEAD' ? undefined : body,
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
  const headers = payload?.headers && typeof payload.headers === 'object' ? payload.headers : {};
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
          const delta =
            json?.choices?.[0]?.delta?.content
            ?? json?.choices?.[0]?.message?.content
            ?? json?.delta?.text
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
  return { ok: true, openAtLogin: Boolean(s.openAtLogin), openAsHidden: Boolean(s.openAsHidden) };
});

ipcMain.handle('ark:login-item-set', async (_event, payload) => {
  const enabled = Boolean(payload?.openAtLogin);
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: false,
    path: process.execPath,
    args: [],
  });
  const s = app.getLoginItemSettings();
  return { ok: true, openAtLogin: Boolean(s.openAtLogin) };
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

ipcMain.handle('ark:open-external', async (_event, url) => {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    throw new Error('Only http(s) URLs can be opened externally');
  }
  await shell.openExternal(url);
  return true;
});

ipcMain.handle('ark:secrets-status', async () => ({
  ok: true,
  encrypted: arkSecrets.encryptionAvailable(),
}));

ipcMain.handle('ark:secrets-load', async () => {
  try {
    return { ok: true, keys: arkSecrets.loadMap(), encrypted: arkSecrets.encryptionAvailable() };
  } catch (err) {
    return { ok: false, keys: {}, error: err instanceof Error ? err.message : 'Load failed' };
  }
});

ipcMain.handle('ark:secrets-save', async (_event, payload) => {
  try {
    const keys = payload?.keys && typeof payload.keys === 'object' ? payload.keys : {};
    // Never accept non-string values
    const clean = {};
    for (const [id, value] of Object.entries(keys)) {
      if (typeof value === 'string' && value.trim()) clean[id] = value.trim();
    }
    arkSecrets.saveMap(clean);
    return { ok: true, encrypted: arkSecrets.encryptionAvailable() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Save failed' };
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
ipcMain.handle('ark:engine-download-progress', async (_e, id) => arkEngine.downloadProgress(id));
ipcMain.handle('ark:engine-download-error', async (_e, id) => arkEngine.downloadError?.(id) ?? null);
ipcMain.handle('ark:engine-ensure-runtime', async () => arkEngine.ensureRuntime());
ipcMain.handle('ark:engine-generate', async (_e, payload) =>
  arkEngine.generate(payload?.message ?? '', {
    modelId: payload?.modelId,
    kind: payload?.kind,
  }),
);

ipcMain.handle('ark:engine-generate-stream', async (event, payload) => {
  const webContentsId = event.sender.id;
  return arkEngine.generate(payload?.message ?? '', {
    modelId: payload?.modelId,
    kind: payload?.kind,
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

ipcMain.handle('ark:project-write', async (_e, payload) => {
  try {
    return arkProjects.writeProjectFiles(
      payload?.projectId,
      payload?.projectName,
      payload?.files || {},
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
  ok: Boolean(brainServerListening),
  url: `http://127.0.0.1:${BRAIN_PORT}`,
  engine: arkEngine.getStatus(),
}));

let brainServer = null;
let brainServerListening = false;

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function startBrainApi() {
  if (brainServer) return;
  const brainToken = (process.env.ARK_BRAIN_TOKEN || '').trim();

  brainServer = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Optional bearer for loopback brain API clients.
    if (brainToken) {
      const auth = String(req.headers.authorization || '');
      const ok = auth === `Bearer ${brainToken}` || auth === `bearer ${brainToken}`;
      if (!ok && req.url !== '/health' && req.url !== '/' && req.url !== '/v1/contract') {
        return json(res, 401, { ok: false, error: 'Unauthorized — set Authorization: Bearer <ARK_BRAIN_TOKEN>' });
      }
    }

    const url = (req.url || '/').split('?')[0];

    if ((url === '/' || url === '/health') && req.method === 'GET') {
      const engine = arkEngine.getStatus();
      return json(res, 200, {
        ok: true,
        service: 'ark-brain',
        version: '0.3.0',
        contractVersion: '0.3.0',
        engine: {
          phase: engine.phase,
          activeModelId: engine.activeModelId,
          activeModelName: engine.activeModelName,
        },
        note: 'ARK brain API — powered by ARK Engine on this device (not a third-party local app)',
      });
    }

    if (url === '/v1/contract' && req.method === 'GET') {
      return json(res, 200, {
        ok: true,
        contractVersion: '0.3.0',
        baseUrl: `http://127.0.0.1:${BRAIN_PORT}`,
        endpoints: [
          'GET /health',
          'GET /v1/contract',
          'GET /v1/models',
          'GET /v1/engine',
          'POST /v1/chat',
          'POST /v1/chat/stream',
        ],
        auth: brainToken ? 'bearer' : 'none (localhost)',
        kinds: ['chat', 'image', 'video'],
      });
    }

    if (url === '/v1/models' && req.method === 'GET') {
      const engine = arkEngine.getStatus();
      return json(res, 200, {
        ok: true,
        models: engine.models.filter((m) => m.status === 'ready'),
        activeModelId: engine.activeModelId,
      });
    }

    if (url === '/v1/engine' && req.method === 'GET') {
      return json(res, 200, { ok: true, ...arkEngine.getStatus() });
    }

    if (url === '/v1/chat' && req.method === 'POST') {
      try {
        const raw = await readBody(req);
        const parsed = raw ? JSON.parse(raw) : {};
        const message = typeof parsed.message === 'string' ? parsed.message : '';
        const modelId = typeof parsed.model === 'string' ? parsed.model : undefined;
        const kind = parsed.kind === 'image' || parsed.kind === 'video' ? parsed.kind : undefined;
        if (arkEngine.getStatus().phase !== 'online') {
          arkEngine.start();
        }
        const result = await arkEngine.generate(message, { modelId, kind });
        return json(res, 200, {
          ok: true,
          reply: result.reply,
          modelName: result.modelName,
          model: result.modelName,
          modelId: result.modelId,
          source: result.source || 'ark-engine',
          media: result.media,
        });
      } catch (err) {
        return json(res, 400, {
          ok: false,
          error: err instanceof Error ? err.message : 'Bad request',
        });
      }
    }

    // SSE-style stream: status / delta / done / error events.
    if (url === '/v1/chat/stream' && req.method === 'POST') {
      try {
        const raw = await readBody(req);
        const parsed = raw ? JSON.parse(raw) : {};
        const message = typeof parsed.message === 'string' ? parsed.message : '';
        const modelId = typeof parsed.model === 'string' ? parsed.model : undefined;
        const kind = parsed.kind === 'image' || parsed.kind === 'video' ? parsed.kind : undefined;
        if (arkEngine.getStatus().phase !== 'online') {
          arkEngine.start();
        }
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        });
        res.write(`event: status\ndata: ${JSON.stringify({ ok: true, phase: 'generating' })}\n\n`);
        const result = await arkEngine.generate(message, {
          modelId,
          kind,
          onChunk: (text) => {
            try {
              res.write(`event: delta\ndata: ${JSON.stringify({ text: String(text || '') })}\n\n`);
            } catch {
              /* ignore */
            }
          },
        });
        res.write(`event: done\ndata: ${JSON.stringify({
          ok: true,
          reply: result.reply,
          modelName: result.modelName,
          modelId: result.modelId,
          source: result.source || 'ark-engine',
          media: result.media,
          streamed: Boolean(result.streamed),
        })}\n\n`);
        res.end();
        return;
      } catch (err) {
        if (!res.headersSent) {
          return json(res, 400, {
            ok: false,
            error: err instanceof Error ? err.message : 'Bad request',
          });
        }
        res.write(`event: error\ndata: ${JSON.stringify({
          ok: false,
          error: err instanceof Error ? err.message : 'Bad request',
        })}\n\n`);
        res.end();
        return;
      }
    }

    return json(res, 404, { ok: false, error: 'Not found' });
  });

  brainServer.listen(BRAIN_PORT, '127.0.0.1', () => {
    brainServerListening = true;
    if (!app.isPackaged) {
      console.log(`[ark-brain] http://127.0.0.1:${BRAIN_PORT}`);
      console.log('[ark-engine] ready (ARK-owned local runtime)');
    }
  });
  brainServer.on('error', (err) => {
    brainServerListening = false;
    if (!app.isPackaged) {
      console.log(`[ark-brain] failed: ${err.message}`);
    }
  });
}

app.whenReady().then(() => {
  if (isUpdaterMode) {
    return arkUpdater.runStandaloneSplash(process.argv).catch((err) => {
      console.error('[ark-updater] fatal', err);
      app.quit();
    });
  }
  arkEngine.start();
  startBrainApi();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (isUpdaterMode) return;
  if (brainServer) {
    try { brainServer.close(); } catch { /* ignore */ }
    brainServer = null;
    brainServerListening = false;
  }
  if (process.platform !== 'darwin') app.quit();
});
