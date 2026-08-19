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
  const root = path.join(app.getPath('userData'), 'ark-previews', String(projectId || 'default'));
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
  const border = landscape ? '8px' : '12px';
  const w = Number(device?.width) || (landscape ? 1100 : 393);
  const h = Number(device?.height) || (landscape ? 720 : 852);
  const frameW = landscape ? Math.min(w, 1100) : Math.min(w, 430);
  const frameH = Math.round(frameW * (h / w));
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${label} · ARK Preview</title>
  <style>
    html,body{margin:0;height:100%;background:#050608;color:#e8eef8;font-family:ui-sans-serif,system-ui,sans-serif}
    body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px}
    .label{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8}
    .phone{position:relative;background:#111827;border:${border} solid #27272a;border-radius:${radius};overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.55)}
    .notch{position:absolute;top:8px;left:50%;transform:translateX(-50%);width:72px;height:8px;border-radius:999px;background:#3f3f46;z-index:2}
    iframe{border:0;width:100%;height:100%;background:#fff}
  </style>
</head>
<body>
  <div class="label">${label} · ${w}×${h}</div>
  <div class="phone" style="width:${frameW}px;height:${frameH}px">
    ${landscape ? '' : '<span class="notch"></span>'}
    <iframe src="${String(url).replace(/"/g, '')}"></iframe>
  </div>
</body>
</html>`;
}

async function openPreviewWindow(payload) {
  const id = String(payload?.projectId || 'default');
  const url = String(payload?.url || '');
  if (!url) return { ok: false, error: 'No preview URL' };

  const existing = previewWindows.get(id);
  if (existing && !existing.isDestroyed()) {
    existing.focus();
    try {
      await existing.loadURL(url);
    } catch {
      /* keep existing */
    }
    return { ok: true };
  }

  const kind = payload?.kind === 'device' ? 'device' : 'web';
  const device = payload?.device || null;
  const landscape = device && /mac|laptop|computer/i.test(String(device.family || ''));
  const width = kind === 'device' && device
    ? Math.min((Number(device.width) || 393) + (landscape ? 80 : 64), landscape ? 1280 : 520)
    : 1100;
  const height = kind === 'device' && device
    ? Math.min((Number(device.height) || 852) + 120, landscape ? 860 : 980)
    : 780;

  const win = new BrowserWindow({
    width: Math.round(width),
    height: Math.round(height),
    title: String(payload?.title || 'ARK Preview'),
    backgroundColor: '#050608',
    autoHideMenuBar: true,
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

  if (kind === 'device' && device) {
    const session = sessions.get(id);
    if (session?.root) {
      const shellPath = path.join(session.root, '__ark-device.html');
      fs.writeFileSync(shellPath, deviceShellHtml(url, device), 'utf8');
      await win.loadURL(`http://127.0.0.1:${session.port}/__ark-device.html`);
    } else {
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(deviceShellHtml(url, device))}`);
    }
  } else {
    await win.loadURL(url);
  }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  return { ok: true };
}

function previewStatus(projectId) {
  const session = sessions.get(String(projectId || 'default'));
  if (!session) return { ok: false, running: false };
  return {
    ok: true,
    running: true,
    url: `http://127.0.0.1:${session.port}/`,
    port: session.port,
    root: session.root,
  };
}

module.exports = { startPreview, stopPreview, previewStatus, openPreviewWindow };
