/**
 * Local preview server for Project Build & Run.
 * Writes project files to a temp folder and serves them over localhost.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { app } = require('electron');

/** @type {Map<string, { server: import('http').Server, port: number, root: string }>} */
const sessions = new Map();

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

module.exports = { startPreview, stopPreview, previewStatus };
