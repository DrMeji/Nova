/**
 * Local preview server for Project Build & Run.
 * Writes project files to a temp folder and serves them over localhost.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { app, BrowserWindow, session } = require('electron');

/** @type {Map<string, { server: import('http').Server, port: number, root: string }>} */
const sessions = new Map();
/** @type {Map<string, import('electron').BrowserWindow>} */
const previewWindows = new Map();

/** Isolated from the NOVA shell session — Chromium zoom is per-host+partition. */
const PREVIEW_PARTITION = 'nova-live-preview';

function previewSession() {
  return session.fromPartition(PREVIEW_PARTITION);
}

/**
 * Live/preview used to call setZoomFactor on 127.0.0.1 pages. That zoom is stored
 * per host in the shared session and leaked into the main NOVA window (also 127.0.0.1),
 * so opening Live made the chat shell shrink and closing Live restored it.
 */
function restoreShellChromeZoom() {
  try {
    const previewSet = new Set([...previewWindows.values()]);
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w || w.isDestroyed() || previewSet.has(w)) continue;
      try {
        w.webContents.setZoomFactor(1);
        w.webContents.setZoomLevel(0);
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

/** True when this window uses the isolated Live preview partition. */
function isPreviewPartitionWindow(win) {
  try {
    return Boolean(win && !win.isDestroyed() && win.webContents.session === previewSession());
  } catch {
    return false;
  }
}
function previewRoot(projectId) {
  // Windows paths cannot contain ":" — chat ids used to be "chat:uuid".
  const safe = String(projectId || 'default')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'default';
  const root = path.join(app.getPath('userData'), 'nova-previews', safe);
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
  const novaPrev = path.join(root, 'nova-preview.html');
  if (!fs.existsSync(indexPath) && fs.existsSync(novaPrev)) {
    fs.copyFileSync(novaPrev, indexPath);
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
  <title>${String(projectName || 'NOVA Preview').replace(/</g, '')}</title>
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
    <div class="ok">NOVA Build &amp; Run · live local preview</div>
    <h1 style="margin:6px 0 0;font-size:22px">${String(projectName || 'Project').replace(/</g, '')}</h1>
  </header>
  <main>
    <p style="color:#9fb0cc">Served from NOVA’s local preview server on this PC.</p>
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
      const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
      if (full !== root && !full.startsWith(rootWithSep)) {
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
      void bumpPreviewCssZoom(win, 0.1);
    } else if (input.key === '-') {
      event.preventDefault();
      void bumpPreviewCssZoom(win, -0.1);
    } else if (input.key === '0') {
      event.preventDefault();
      void setPreviewCssZoom(win, 1);
    }
  });
}

async function setPreviewCssZoom(win, factor) {
  if (!win || win.isDestroyed()) return;
  const z = Math.max(0.5, Math.min(3, Number(factor) || 1));
  try {
    // Never use Chromium setZoomFactor here — it pollutes 127.0.0.1 host zoom for the shell.
    win.webContents.setZoomFactor(1);
    win.webContents.setZoomLevel(0);
  } catch { /* ignore */ }
  try {
    await win.webContents.executeJavaScript(
      `document.documentElement.style.zoom = ${JSON.stringify(String(z))}; true;`,
      true,
    );
  } catch { /* ignore */ }
}

async function bumpPreviewCssZoom(win, delta) {
  if (!win || win.isDestroyed()) return;
  try {
    const cur = await win.webContents.executeJavaScript(
      `(() => { const z = parseFloat(document.documentElement.style.zoom || '1'); return Number.isFinite(z) ? z : 1; })()`,
      true,
    );
    await setPreviewCssZoom(win, (Number(cur) || 1) + delta);
  } catch {
    await setPreviewCssZoom(win, 1 + delta);
  }
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

/** Scale web dashboards in the preview window only (CSS zoom — never Chromium host zoom). */
function fitPreviewZoom(win) {
  if (!win || win.isDestroyed()) return;
  try {
    const [cw] = win.getContentSize();
    const designWidth = 1280;
    const factor = Math.max(0.55, Math.min(1, (Number(cw) || designWidth) / designWidth));
    void setPreviewCssZoom(win, factor);
  } catch {
    /* ignore */
  }
}

/**
 * User-facing Live fail copy — basename + short reason only.
 * Never echo absolute paths, stack frames, or source snippets (privacy).
 */
function sanitizePreviewFailMessage(raw) {
  const s = String(raw || '');
  const fileHit = s.match(/(?:^|[/\\])((?:src[/\\])?[\w.-]+\.(?:tsx?|jsx?|css|html|mjs|cjs|json))\b/i)
    || s.match(/\b([\w.-]+\.(?:tsx?|jsx?|css|html))\b/i);
  const file = fileHit
    ? String(fileHit[1] || fileHit[0]).replace(/\\/g, '/').split('/').pop()
    : '';
  let reason = '';
  if (/Expected corresponding JSX closing tag/i.test(s)) {
    reason = 'JSX tag mismatch — a tag was left open or closed wrong';
  } else if (/Unexpected token|SyntaxError/i.test(s)) {
    reason = 'syntax error in this file';
  } else if (/Failed to resolve|Cannot find module|does not provide an export/i.test(s)) {
    reason = 'a required import or file is missing';
  } else if (/Transform failed|plugin:vite/i.test(s)) {
    reason = 'code could not be compiled';
  } else if (/Failed to fetch dynamically imported module/i.test(s)) {
    reason = 'a module failed to load';
  } else if (/blank Live|never mounted/i.test(s)) {
    reason = 'React never mounted into the page';
  } else if (/Load failed|ERR_/i.test(s)) {
    reason = 'the preview page failed to load';
  } else if (/render-process-gone|crashed/i.test(s)) {
    reason = 'the preview crashed';
  } else {
    reason = 'something in this file is broken';
  }
  if (file) {
    return `${file} is failing (${reason}). That's why you can't see Live.`;
  }
  return `Live can't show the app (${reason}).`;
}

/** Hide Vite's red overlay (full paths + source) and replace with a private NOVA card. */
async function installViteOverlayShield(win) {
  if (!win || win.isDestroyed()) return;
  try {
    await win.webContents.insertCSS(`
      vite-error-overlay {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
        opacity: 0 !important;
      }
    `);
  } catch { /* ignore */ }
  // Keep injected JS simple — parse file basename only; never paint paths/stacks/source.
  const script = [
    '(() => {',
    '  if (window.__novaViteShield) return true;',
    '  window.__novaViteShield = true;',
    '  function sanitize(raw) {',
    '    var s = String(raw || "");',
    '    var fileHit = s.match(/(?:^|[\\/\\\\])((?:src[\\/\\\\])?[\\w.-]+\\.(?:tsx?|jsx?|css|html))\\b/i)',
    '      || s.match(/\\b([\\w.-]+\\.(?:tsx?|jsx?|css|html))\\b/i);',
    '    var file = fileHit ? String(fileHit[1] || fileHit[0]).replace(/\\\\/g, "/").split("/").pop() : "";',
    '    var reason = "something in this file is broken";',
    '    if (/Expected corresponding JSX closing tag/i.test(s)) reason = "JSX tag mismatch — a tag was left open or closed wrong";',
    '    else if (/Unexpected token|SyntaxError/i.test(s)) reason = "syntax error in this file";',
    '    else if (/Failed to resolve|Cannot find module|does not provide an export/i.test(s)) reason = "a required import or file is missing";',
    '    else if (/Transform failed|plugin:vite/i.test(s)) reason = "code could not be compiled";',
    '    else if (/Failed to fetch dynamically imported module/i.test(s)) reason = "a module failed to load";',
    '    if (file) return file + " is failing (" + reason + "). That\\u2019s why you can\\u2019t see Live.";',
    '    return "Live can\\u2019t show the app (" + reason + ").";',
    '  }',
    '  function showNova(raw) {',
    '    try { document.querySelectorAll("vite-error-overlay").forEach(function(el){ el.remove(); }); } catch (e) {}',
    '    try { var n = document.getElementById("nova-preview-fail"); if (n) n.remove(); } catch (e) {}',
    '    try { window.__novaPreviewCompileFail = sanitize(raw); } catch (e) {}',
    '  }',
    '  function scan() {',
    '    var el = document.querySelector("vite-error-overlay");',
    '    if (!el) return;',
    '    var text = "";',
    '    try { text = el.shadowRoot ? (el.shadowRoot.textContent || "") : (el.textContent || ""); } catch (e) { text = ""; }',
    '    showNova(text || "Vite compile error");',
    '  }',
    '  var obs = new MutationObserver(function(){ scan(); });',
    '  obs.observe(document.documentElement, { childList: true, subtree: true });',
    '  scan();',
    '  var n = 0;',
    '  var tick = window.setInterval(function(){',
    '    scan();',
    '    n += 1;',
    '    if (n > 40 || window.__novaPreviewCompileFail) window.clearInterval(tick);',
    '  }, 250);',
    '  return true;',
    '})()',
  ].join('\n');
  try {
    await win.webContents.executeJavaScript(script, true);
  } catch { /* ignore */ }
}

/** Blank Live is usually a SyntaxError from raw TSX — surface it instead of a silent black window. */
function attachPreviewLoadGuards(win) {
  if (!win || win.isDestroyed() || win.__novaPreviewGuards) return;
  win.__novaPreviewGuards = true;
  let shown = false;
  const showFail = async (reason) => {
    if (shown || !win || win.isDestroyed()) return;
    shown = true;
    // Never paint the black "Live Preview could not render" card — close Live instead.
    // Chat/create already owns the fix path; this overlay was the user-visible failure.
    try {
      win.__novaPreviewFailReason = sanitizePreviewFailMessage(reason).slice(0, 220);
    } catch { /* ignore */ }
    try {
      await win.webContents.executeJavaScript(`(() => {
        try { document.querySelectorAll('vite-error-overlay').forEach((el) => el.remove()); } catch {}
        try { const n = document.getElementById('nova-preview-fail'); if (n) n.remove(); } catch {}
        return true;
      })()`, true);
    } catch { /* ignore */ }
    try {
      if (!win.isDestroyed()) win.close();
    } catch { /* ignore */ }
  };
  win.__novaPreviewShowFail = showFail;
  if (!Array.isArray(win.__novaConsoleErrors)) win.__novaConsoleErrors = [];
  win.webContents.on('console-message', (_e, level, message) => {
    const msg = String(message || '');
    // Buffer error-level / Vite crash lines for create evidence (verify-before-success).
    // Keep raw for host diagnostics — never show raw paths to the user overlay.
    if (
      level >= 2
      || /SyntaxError|Failed to fetch dynamically imported module|Unexpected token|does not provide an export named|TypeError|ReferenceError|Uncaught/i.test(msg)
    ) {
      try {
        const buf = win.__novaConsoleErrors;
        if (Array.isArray(buf)) {
          buf.push(sanitizePreviewFailMessage(msg).slice(0, 220));
          if (buf.length > 24) buf.splice(0, buf.length - 24);
        }
      } catch { /* ignore */ }
    }
    if (/SyntaxError|Failed to fetch dynamically imported module|Unexpected token|does not provide an export named|plugin:vite|Transform failed|Expected corresponding JSX/i.test(msg)) {
      showFail(msg).catch(() => {});
    }
  });
  win.webContents.on('did-fail-load', (_e, code, desc, _validatedURL, isMainFrame) => {
    if (!isMainFrame || code === -3) return; // -3 = aborted
    showFail(`Load failed (${code}): ${desc || 'unknown'}`).catch(() => {});
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    showFail(`Preview crashed (${details?.reason || 'render-process-gone'}).`).catch(() => {});
  });
  win.webContents.on('did-finish-load', () => {
    void installViteOverlayShield(win);
  });
  win.webContents.on('dom-ready', () => {
    void installViteOverlayShield(win);
  });
}

/**
 * After load, if #root stays empty the user only sees Electron's black chrome.
 * Wait for Vite/React settle, then surface a clear fail instead of a void.
 */
function scheduleBlankRootCheck(win) {
  if (!win || win.isDestroyed()) return;
  const token = (win.__novaBlankRootToken = (win.__novaBlankRootToken || 0) + 1);
  setTimeout(() => {
    void (async () => {
      if (!win || win.isDestroyed() || win.__novaBlankRootToken !== token) return;
      let probe = null;
      try {
        probe = await win.webContents.executeJavaScript(`(() => {
          if (document.getElementById('nova-preview-fail')) return { skip: true };
          const root = document.getElementById('root');
          if (!root) return { skip: true, reason: 'no-root' };
          const html = (root.innerHTML || '').trim();
          const text = (root.innerText || '').trim();
          const kids = root.childElementCount || 0;
          const viteErr = /\\[plugin:vite|Failed to resolve|Internal Server Error|does not provide an export/i.test(document.body?.innerText || '');
          return {
            skip: false,
            htmlLen: html.length,
            textLen: text.length,
            kids,
            viteErr,
            title: document.title || '',
          };
        })()`, true);
      } catch {
        return;
      }
      if (!probe || probe.skip) return;
      if (probe.viteErr) {
        const showFail = win.__novaPreviewShowFail;
        if (typeof showFail === 'function') {
          let bodyHint = '';
          try {
            bodyHint = await win.webContents.executeJavaScript(
              `(() => (document.body && (document.body.innerText || '')) || '')`,
              true,
            );
          } catch { /* ignore */ }
          await showFail(String(bodyHint || 'Vite compile error'));
        }
        return;
      }
      // Empty #root after settle = blank Live (classic create crash / missing mount).
      if (probe.kids === 0 && probe.htmlLen < 8 && probe.textLen < 4) {
        const showFail = win.__novaPreviewShowFail;
        if (typeof showFail === 'function') {
          await showFail(
            'The page loaded but React never mounted into #root (blank Live). Re-run the build or say repair Live preview.',
          );
        }
      }
    })();
  }, 3200);
}

/** Race a promise so a wedged BrowserWindow cannot hang create/Live forever. */
function withTimeout(promise, ms, label) {
  const limit = Math.max(500, Number(ms) || 8000);
  let timer = null;
  return Promise.race([
    Promise.resolve(promise).finally(() => {
      if (timer != null) clearTimeout(timer);
    }),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(label || `timeout ${limit}ms`)), limit);
    }),
  ]);
}

/** Probe whether the Live window actually painted UI (for create “verified” honesty). */
async function probePreviewMounted(payload) {
  const url = String(payload?.url || '').trim();
  const id = 'NOVA-live-preview';
  // Hard wall for the whole probe — wedged preview JS used to freeze TipWise ~11m on Fixing.
  const hardMs = Math.max(8_000, Math.min(20_000, Number(payload?.hardTimeoutMs) || 14_000));
  const run = async () => {
    let win = previewWindows.get(id);
    if ((!win || win.isDestroyed()) && url) {
      const opened = await withTimeout(
        openPreviewWindow({
          url,
          title: String(payload?.title || 'Preview'),
          projectId: id,
          forceNavigate: true,
        }),
        Math.min(10_000, hardMs),
        'openPreviewWindow timeout',
      );
      if (!opened?.ok) return { ok: false, mounted: false, error: opened?.error || 'open failed' };
      win = previewWindows.get(id);
    }
    if (!win || win.isDestroyed()) {
      return { ok: false, mounted: false, error: 'No preview window' };
    }
    // Give Vite + React a moment after navigate (first paint often needs >3s on cold Vite).
    const waitMs = Math.min(8_000, Number(payload?.waitMs) || 5000);
    await new Promise((r) => setTimeout(r, waitMs));
    if (win.isDestroyed()) return { ok: false, mounted: false, error: 'window closed' };
    const readProbe = () => withTimeout(
      win.webContents.executeJavaScript(`(() => {
      const root = document.getElementById('root') || document.getElementById('app');
      const fail = Boolean(document.getElementById('nova-preview-fail'));
      const html = (root?.innerHTML || '').trim();
      const bodyHtml = (document.body?.innerHTML || '').trim();
      const bodyText = (document.body?.innerText || '').trim();
      let text = (root?.innerText || bodyText || '').trim();
      // Some paints leave innerText empty while HTML already has labels — strip tags as fallback.
      if (text.length < 8 && html.length >= 24) {
        text = html.replace(/<script[\\s\\S]*?<\\/script>/gi, ' ')
          .replace(/<style[\\s\\S]*?<\\/style>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\\s+/g, ' ')
          .trim();
      }
      const kids = root?.childElementCount || 0;
      // React: kids in #root/#app. Static HTML: meaningful body text/markup without a root mount.
      const hasUi = (kids > 0 && (html.length >= 24 || text.length >= 8))
        || (!document.getElementById('root') && text.length >= 12 && bodyHtml.length >= 40);
      const viteErr = /\\[plugin:vite|Failed to resolve|Internal Server Error|Unexpected token|Transform failed|Expected ">"/i.test(bodyText + bodyHtml);
      return {
        mounted: hasUi && !fail && !viteErr,
        fail,
        viteErr,
        kids,
        htmlLen: html.length || bodyHtml.length,
        textLen: text.length,
        title: document.title || '',
        sample: (viteErr
          ? ((bodyText.match(/\\b([\\w.-]+\\.(?:tsx?|jsx?))\\b/i) || [])[1] || 'App')
            + ' compile error'
          : text).slice(0, 240),
      };
    })()`, true),
      6_000,
      'preview executeJavaScript timeout',
    );

    try {
      let probe = await readProbe();
      // Blank shell: short re-probe (HMR / first React commit race) — was a fixed 4s stall.
      if (!probe?.mounted && !probe?.viteErr && Number(probe?.kids || 0) === 0) {
        await new Promise((r) => setTimeout(r, 1200));
        if (!win.isDestroyed()) probe = await readProbe();
      }
      let consoleErrors = [];
      try {
        if (Array.isArray(win.__novaConsoleErrors)) {
          consoleErrors = win.__novaConsoleErrors.slice(-12).map((m) => String(m || '').trim()).filter(Boolean);
        }
      } catch { /* ignore */ }
      // Reset buffer after read so the next probe is fresh.
      try { win.__novaConsoleErrors = []; } catch { /* ignore */ }
      return { ok: true, ...probe, consoleErrors };
    } catch (err) {
      return {
        ok: false,
        mounted: false,
        error: err instanceof Error ? err.message : 'probe failed',
        consoleErrors: [],
      };
    }
  };
  try {
    return await withTimeout(run(), hardMs, 'previewProbeMounted hard timeout');
  } catch (err) {
    return {
      ok: false,
      mounted: false,
      error: err instanceof Error ? err.message : 'probe hard timeout',
      consoleErrors: [],
    };
  }
}

async function loadDeviceIntoWindow(win, id, url, device, title) {
  try {
    win.setTitle(String(title || `${device.label} · NOVA Preview`));
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
  const rawTitle = String(payload?.title || (device ? `${device.label} · NOVA Preview` : 'NOVA Preview'));
  const title = `NOVA Preview · ${rawTitle}`;
  const size = kind === 'device' && device ? deviceWindowSize(device) : { width: 1100, height: 780 };

  // One live web preview window for the whole app — always navigate to the URL for the
  // active chat's project (never leave another chat's localhost visible).
  const id = kind === 'device'
    ? String(payload?.projectId || 'device-preview')
    : 'NOVA-live-preview';

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
    // Pre-fix windows shared the shell session — drop them so zoom cannot leak again.
    if (!isPreviewPartitionWindow(existing)) {
      previewWindows.delete(id);
      try { existing.close(); } catch { /* ignore */ }
    } else {
      attachPreviewLoadGuards(existing);
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
        scheduleBlankRootCheck(existing);
        try { fitPreviewZoom(existing); } catch { /* ignore */ }
      }
      if (existing.isMinimized()) existing.restore();
      existing.show();
      existing.focus();
      restoreShellChromeZoom();
      return { ok: true, reused: true };
    }
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
      // Separate session so preview zoom/cookies never touch the NOVA shell (same 127.0.0.1 host).
      partition: PREVIEW_PARTITION,
    },
  });
  previewWindows.set(id, win);
  attachPreviewLoadGuards(win);
  win.on('closed', () => {
    if (previewWindows.get(id) === win) previewWindows.delete(id);
    restoreShellChromeZoom();
  });
  win.webContents.on('did-finish-load', () => {
    win.webContents.insertCSS(`
      html { scrollbar-width: thin; }
      ::-webkit-scrollbar { width: 8px; height: 8px; }
      ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.18); border-radius: 8px; }
      html, body { max-width: 100%; overflow-x: auto; }
      img, video, canvas, svg { max-width: 100%; height: auto; }
      vite-error-overlay {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }
    `).catch(() => {});
    void installViteOverlayShield(win);
    try {
      fitPreviewZoom(win);
    } catch {
      /* ignore */
    }
    // Vite React apps that never mount leave a silent black window — surface it.
    scheduleBlankRootCheck(win);
    restoreShellChromeZoom();
  });
  if (kind !== 'device') {
    win.on('resize', () => {
      try { fitPreviewZoom(win); } catch { /* ignore */ }
      restoreShellChromeZoom();
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
  restoreShellChromeZoom();
  return { ok: true };
}

function closeLivePreviewWindow() {
  const id = 'NOVA-live-preview';
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
  restoreShellChromeZoom();
  return { ok: true };
}

/** Push updated files into a running preview and reload the NOVA preview window. */
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
      const currentUrl = String(win.webContents.getURL() || '');
      // Item 16: Vite Live on 52xx — prefer HMR (no cache-bust reload). Soft reload only if needed.
      const viteLive = /127\.0\.0\.1:52\d{2}|localhost:52\d{2}/i.test(currentUrl);
      if (viteLive) {
        // Disk writes already landed; Vite HMR updates the page. Avoid reloadIgnoringCache thrash.
        if (win.isMinimized()) win.restore();
        win.show();
        return { ok: true, url: currentUrl || url, reloaded: false, hmr: true };
      }
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

function captureLivePreview() {
  const id = 'NOVA-live-preview';
  let win = previewWindows.get(id);
  if (!win || win.isDestroyed()) {
    for (const [, w] of previewWindows.entries()) {
      if (w && !w.isDestroyed()) {
        win = w;
        break;
      }
    }
  }
  if (!win || win.isDestroyed()) {
    return Promise.resolve({ ok: false, error: 'No preview window open' });
  }
  return win.webContents.capturePage().then((img) => {
    const dataUrl = img.toDataURL();
    return { ok: Boolean(dataUrl), dataUrl: dataUrl || undefined };
  }).catch((err) => ({
    ok: false,
    error: err instanceof Error ? err.message : 'capture failed',
  }));
}

module.exports = {
  startPreview,
  stopPreview,
  previewStatus,
  openPreviewWindow,
  closeLivePreviewWindow,
  updatePreview,
  reloadPreviewWindow,
  captureLivePreview,
  probePreviewMounted,
  restoreShellChromeZoom,
};
