/**
 * Local preview server for Project Build & Run.
 * Writes project files to a temp folder and serves them over localhost.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { app, BrowserWindow } = require('electron');

/** @type {Map<string, { server: import('http').Server, port: number, root: string }>} */
const sessions = new Map();
/** @type {Map<string, import('electron').BrowserWindow>} */
const previewWindows = new Map();

function previewRoot(projectId) {
  // Windows paths cannot contain ":" — chat ids used to be "chat:uuid".
  const safe = String(projectId || 'default')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'default';
  const root = path.join(app.getPath('userData'), 'ark-previews', safe);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function writeTree(root, files) {
  // files: { "src/App.tsx": "...", "index.html": "..." }
  for (const [rel, content] of Object.entries(files || {})) {
    const safe = rel.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!safe || safe.includes('..')) continue;
    const full = path.join(root, ...safe.split('/'));
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, typeof content === 'string' ? content : String(content ?? ''), 'utf8');
  }
}

function ensureIndex(root, projectName) {
  const indexPath = path.join(root, 'index.html');
  const arkPrev = path.join(root, 'ark-preview.html');
  if (!fs.existsSync(indexPath) && fs.existsSync(arkPrev)) {
    fs.copyFileSync(arkPrev, indexPath);
    return;
  }
  if (fs.existsSync(indexPath)) return;
  const staticIndex = path.join(root, 'static', 'index.html');
  if (fs.existsSync(staticIndex)) {
    fs.writeFileSync(
      indexPath,
      '<!DOCTYPE html><html><head><meta charset="utf-8" />'
      + '<meta http-equiv="refresh" content="0;url=/static/index.html" />'
      + '<title>Preview</title></head><body>'
      + '<p><a href="/static/index.html">Open preview</a></p></body></html>',
      'utf8',
    );
    return;
  }
  const appTsx = path.join(root, 'src', 'App.tsx');
  const snippet = fs.existsSync(appTsx)
    ? fs.readFileSync(appTsx, 'utf8').slice(0, 2000)
    : '// No App.tsx yet';
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${String(projectName || 'ARK Preview').replace(/</g, '')}</title>
  <style>
    :root { color-scheme: dark; }
    body { margin:0; font-family: ui-sans-serif, system-ui, sans-serif; background:#0b1220; color:#e8eefc; }
    header { padding:16px 20px; border-bottom:1px solid #243047; }
    main { padding:20px; max-width:960px; margin:0 auto; }
    pre { background:#121a2b; border:1px solid #243047; border-radius:12px; padding:14px; overflow:auto; font:12px/1.5 ui-monospace,monospace; }
    .ok { color:#34d399; font-size:12px; }
  </style>
</head>
<body>
  <header>
    <div class="ok">ARK Build &amp; Run · live local preview</div>
    <h1 style="margin:6px 0 0;font-size:22px">${String(projectName || 'Project').replace(/</g, '')}</h1>
  </header>
  <main>
    <p style="color:#9fb0cc">Served from ARK’s local preview server on this PC.</p>
    <pre>${snippet.replace(/</g, '&lt;')}</pre>
  </main>
</body>
</html>`;
  fs.writeFileSync(indexPath, html, 'utf8');
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.js' || ext === '.mjs' || ext === '.ts' || ext === '.tsx') return 'text/javascript; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.json') return 'application/json';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'text/plain; charset=utf-8';
}

async function startPreview({ projectId, projectName, files }) {
  const id = String(projectId || 'default');
  await stopPreview(id);

  const root = previewRoot(id);
  writeTree(root, files);
  ensureIndex(root, projectName);

  const server = http.createServer((req, res) => {
    try {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      let rel = urlPath === '/' ? '/index.html' : urlPath;
      const full = path.normalize(path.join(root, rel));
      if (!full.startsWith(root)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) {
        const fallback = path.join(root, 'index.html');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fs.readFileSync(fallback));
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType(full) });
      res.end(fs.readFileSync(full));
    } catch (err) {
      res.writeHead(500);
      res.end(err instanceof Error ? err.message : 'Preview error');
    }
  });

  const port = await new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') resolve(addr.port);
      else reject(new Error('Could not bind preview port'));
    });
    server.on('error', reject);
  });

  sessions.set(id, { server, port, root });
  return {
    ok: true,
    url: `http://127.0.0.1:${port}/`,
    port,
    root,
  };
}

async function stopPreview(projectId) {
  const id = String(projectId || 'default');
  const session = sessions.get(id);
  if (!session) return { ok: true };
  await new Promise((resolve) => {
    session.server.close(() => resolve(undefined));
  });
  sessions.delete(id);
  return { ok: true };
}

function deviceShellHtml(url, device) {
  const label = String(device?.label || 'Preview').replace(/</g, '');
  const family = String(device?.family || 'iphone');
  const landscape = family === 'mac' || family === 'android-laptop' || family === 'computer';
  const radius = family === 'ipad' || family === 'android-tablet' || family === 'tablet' ? '28px' : landscape ? '12px' : '36px';
  const border = landscape ? '10px' : '12px';
  const w = Number(device?.width) || (landscape ? 1100 : 393);
  const h = Number(device?.height) || (landscape ? 720 : 852);
  const size = `${w}×${h}`;
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${label} · ${size}</title>
  <style>
    html,body{margin:0;background:#050608;overflow:hidden;width:${w + (landscape ? 20 : 24)}px;height:${h + (landscape ? 48 : 52)}px}
    body{display:flex;flex-direction:column;align-items:center}
    .chrome{flex:none;width:100%;height:28px;display:flex;align-items:center;justify-content:center;font:11px/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.04em;color:#94a3b8;background:#0b1220;border-bottom:1px solid #1e293b}
    .phone{position:relative;background:#111827;border:${border} solid #1c1917;border-radius:${radius};overflow:hidden;width:${w}px;height:${h}px;flex:none}
    .notch{position:absolute;top:7px;left:50%;transform:translateX(-50%);width:78px;height:7px;border-radius:999px;background:#3f3f46;z-index:2}
    iframe{border:0;width:${w}px;height:${h}px;background:#000;display:block}
  </style>
</head>
<body>
  <div class="chrome">${label} · ${size}</div>
  <div class="phone">
    ${landscape ? '' : '<span class="notch"></span>'}
    <iframe src="${String(url).replace(/"/g, '')}"></iframe>
  </div>
</body>
</html>`;
}

function lockDeviceWindow(win, device) {
  const size = deviceWindowSize(device);
  try {
    win.setResizable(false);
    win.setMaximizable(false);
    win.setMinimizable(true);
    win.setMinimumSize(size.width, size.height);
    win.setMaximumSize(size.width, size.height);
    win.setContentSize(size.width, size.height);
  } catch {
    win.setSize(size.width, size.height);
  }
  win.removeAllListeners('will-resize');
  win.on('will-resize', (event) => {
    event.preventDefault();
  });
}

function enableDeviceZoom(win) {
  try {
    win.webContents.setVisualZoomLevelLimits(1, 3);
  } catch {
    /* ignore */
  }
  win.webContents.on('before-input-event', (event, input) => {
    if (!(input.control || input.meta) || input.type !== 'keyDown') return;
    if (input.key === '=' || input.key === '+') {
      event.preventDefault();
      win.webContents.setZoomFactor(Math.min(3, win.webContents.getZoomFactor() + 0.1));
    } else if (input.key === '-') {
      event.preventDefault();
      win.webContents.setZoomFactor(Math.max(0.5, win.webContents.getZoomFactor() - 0.1));
    } else if (input.key === '0') {
      event.preventDefault();
      win.webContents.setZoomFactor(1);
    }
  });
}

function deviceWindowSize(device) {
  const family = String(device?.family || '');
  const landscape = /mac|laptop|computer/i.test(family);
  const bezel = landscape ? 20 : 24;
  const chrome = 28;
  return {
    width: Math.round((Number(device?.width) || 393) + bezel),
    height: Math.round((Number(device?.height) || 852) + bezel + chrome),
  };
}

/** Scale web dashboards down in small Preview windows so cards don't overflow/collide. */
function fitPreviewZoom(win) {
  if (!win || win.isDestroyed()) return;
  try {
    const [cw] = win.getContentSize();
    const designWidth = 1280;
    const factor = Math.max(0.55, Math.min(1, (Number(cw) || designWidth) / designWidth));
    win.webContents.setZoomFactor(factor);
  } catch {
    /* ignore */
  }
}

async function loadDeviceIntoWindow(win, id, url, device, title) {
  try {
    win.setTitle(String(title || `${device.label} · ARK Preview`));
  } catch {
    /* ignore */
  }
  lockDeviceWindow(win, device);
  const session = sessions.get(id);
  if (session?.root) {
    fs.writeFileSync(path.join(session.root, '__ark-device.html'), deviceShellHtml(url, device), 'utf8');
  }
  const shellUrl = session?.port
    ? `http://127.0.0.1:${session.port}/__ark-device.html?t=${Date.now()}`
    : `data:text/html;charset=utf-8,${encodeURIComponent(deviceShellHtml(url, device))}`;
  await win.loadURL(shellUrl);
}

async function openPreviewWindow(payload) {
  const url = String(payload?.url || '');
  if (!url) return { ok: false, error: 'No preview URL' };

  const kind = payload?.kind === 'device' ? 'device' : 'web';
  const device = payload?.device || null;
  const rawTitle = String(payload?.title || (device ? `${device.label} · ARK Preview` : 'ARK Preview'));
  const title = /ARK/i.test(rawTitle) ? rawTitle : `ARK Preview · ${rawTitle}`;
  const size = kind === 'device' && device ? deviceWindowSize(device) : { width: 1100, height: 780 };

  // One live web preview window for the whole app — always navigate to the URL for the
  // active chat's project (never leave another chat's localhost visible).
  const id = kind === 'device'
    ? String(payload?.projectId || 'device-preview')
    : 'ark-live-preview';

  if (kind === 'web') {
    for (const [key, win] of [...previewWindows.entries()]) {
      if (key === id) continue;
      if (key.startsWith('chat:') || key === 'chat-preview' || key === 'default') {
        try {
          if (win && !win.isDestroyed()) win.close();
        } catch {
          /* ignore */
        }
        previewWindows.delete(key);
      }
    }
  }

  // Bust Vite/HTML caches so switching chats cannot show a stale document.
  let navigateUrl = url;
  try {
    const u = new URL(url);
    u.searchParams.set('_ark', String(Date.now()));
    navigateUrl = u.toString();
  } catch {
    navigateUrl = url;
  }

  const existing = previewWindows.get(id);
  if (existing && !existing.isDestroyed()) {
    if (kind === 'device' && device) {
      await loadDeviceIntoWindow(existing, id, url, device, title);
    } else {
      try {
        existing.setResizable(true);
        existing.setMaximizable(true);
        existing.setMinimumSize(480, 360);
        existing.setMaximumSize(4000, 3000);
        existing.setTitle(title);
        // Always navigate for live web preview — never reload another project's host.
        await existing.loadURL(navigateUrl);
      } catch {
        try {
          await existing.loadURL(navigateUrl);
        } catch {
          /* keep */
        }
      }
    }
    if (existing.isMinimized()) existing.restore();
    existing.show();
    existing.focus();
    return { ok: true, reused: true };
  }

  const win = new BrowserWindow({
    width: size.width,
    height: size.height,
    title,
    backgroundColor: '#050608',
    autoHideMenuBar: true,
    resizable: kind !== 'device',
    maximizable: kind !== 'device',
    minimizable: true,
    useContentSize: true,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  previewWindows.set(id, win);
  win.on('closed', () => {
    if (previewWindows.get(id) === win) previewWindows.delete(id);
  });
  win.webContents.on('did-finish-load', () => {
    win.webContents.insertCSS(`
      html { scrollbar-width: thin; }
      ::-webkit-scrollbar { width: 8px; height: 8px; }
      ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.18); border-radius: 8px; }
      html, body { max-width: 100%; overflow-x: auto; }
      img, video, canvas, svg { max-width: 100%; height: auto; }
    `).catch(() => {});
    try {
      fitPreviewZoom(win);
    } catch {
      /* ignore */
    }
  });
  if (kind !== 'device') {
    win.on('resize', () => {
      try { fitPreviewZoom(win); } catch { /* ignore */ }
    });
  }
  if (kind === 'device' && device) {
    enableDeviceZoom(win);
    await loadDeviceIntoWindow(win, id, url, device, title);
  } else {
    await win.loadURL(navigateUrl);
  }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  return { ok: true };
}

function closeLivePreviewWindow() {
  const id = 'ark-live-preview';
  const win = previewWindows.get(id);
  if (win && !win.isDestroyed()) {
    try { win.close(); } catch { /* ignore */ }
  }
  previewWindows.delete(id);
  for (const [key, w] of [...previewWindows.entries()]) {
    if (key.startsWith('chat:') || key === 'chat-preview' || key === 'default') {
      try {
        if (w && !w.isDestroyed()) w.close();
      } catch { /* ignore */ }
      previewWindows.delete(key);
    }
  }
  return { ok: true };
}

/** Push updated files into a running preview and reload the ARK preview window. */
async function updatePreview(payload) {
  const id = String(payload?.projectId || 'default');
  const files = payload?.files || {};
  const projectName = payload?.projectName || 'Preview';
  let session = sessions.get(id);
  if (!session) {
    const started = await startPreview({ projectId: id, projectName, files });
    if (!started.ok) return started;
    session = sessions.get(id);
  } else if (Object.keys(files).length) {
    writeTree(session.root, files);
    ensureIndex(session.root, projectName);
  }
  const url = `http://127.0.0.1:${session.port}/`;
  const win = previewWindows.get(id);
  if (win && !win.isDestroyed()) {
    try {
      await win.webContents.reloadIgnoringCache();
      if (win.isMinimized()) win.restore();
      win.show();
    } catch {
      /* ignore */
    }
    return { ok: true, url, reloaded: true };
  }
  return { ok: true, url, reloaded: false };
}

function reloadPreviewWindow(projectId) {
  const id = String(projectId || 'default');
  const win = previewWindows.get(id);
  if (!win || win.isDestroyed()) return { ok: false, error: 'No preview window open' };
  try {
    win.webContents.reloadIgnoringCache();
    if (win.isMinimized()) win.restore();
    win.show();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'reload failed' };
  }
}

function previewStatus(projectId) {
  const id = String(projectId || 'default');
  const session = sessions.get(id);
  const win = previewWindows.get(id);
  if (!session) {
    return {
      ok: false,
      running: false,
      windowOpen: Boolean(win && !win.isDestroyed()),
    };
  }
  return {
    ok: true,
    running: true,
    url: `http://127.0.0.1:${session.port}/`,
    port: session.port,
    root: session.root,
    windowOpen: Boolean(win && !win.isDestroyed()),
  };
}

module.exports = {
  startPreview,
  stopPreview,
  previewStatus,
  openPreviewWindow,
  closeLivePreviewWindow,
  updatePreview,
  reloadPreviewWindow,
};
