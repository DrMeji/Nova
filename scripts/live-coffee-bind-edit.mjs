/**
 * Bind harbor-roast folder + short edit ask (Unsplash images already in public/images).
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.NOVA_CDP_PORT || 9299);
const disk = path.join(os.homedir(), 'Documents', 'NOVA Projects', 'harbor-roast');
const ASSETS = path.join(__dirname, '..', '.tmp-coffee-assets');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const keepAlive = setInterval(() => {}, 60_000);
process.on('exit', () => clearInterval(keepAlive));
const T0 = Date.now();

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

const imgDir = path.join(disk, 'public', 'images');
fs.mkdirSync(imgDir, { recursive: true });
for (const name of fs.readdirSync(ASSETS).filter((n) => /\.jpe?g$/i.test(n))) {
  fs.copyFileSync(path.join(ASSETS, name), path.join(imgDir, name));
}

const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
const page = list.find((t) => t.type === 'page' && /NOVA/i.test(t.title || '') && /5173/.test(t.url || ''))
  || list.find((t) => t.type === 'page' && /NOVA/i.test(t.title || ''))
  || list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
let id = 0;
const pending = new Map();
ws.on('message', (raw) => {
  const msg = JSON.parse(String(raw));
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  }
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const i = ++id;
  pending.set(i, { resolve, reject });
  ws.send(JSON.stringify({ id: i, method, params }));
});
const evalE = async (expression) => {
  const r = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
};
await send('Runtime.enable');

// Stop hung turn
await evalE(`(() => {
  const btns = [...document.querySelectorAll('button,[role=button]')];
  const stop = btns.find(b => /\\bstop\\b|cancel/i.test((b.getAttribute('aria-label')||'')+' '+(b.textContent||'')));
  if (stop) stop.click();
  return Boolean(stop);
})()`);
await sleep(1000);

// Font 14
await evalE(`(() => {
  for (const k of Object.keys(localStorage)) {
    if (!/prefs/i.test(k)) continue;
    try {
      const o = JSON.parse(localStorage.getItem(k)||'{}');
      if (o && typeof o === 'object' && ('fontSizePx' in o || 'prefsVersion' in o)) {
        o.fontSizePx = 14; o.prefsVersion = Math.max(5, Number(o.prefsVersion)||5);
        localStorage.setItem(k, JSON.stringify(o));
      }
    } catch {}
  }
  document.documentElement.style.fontSize = '14px';
  window.dispatchEvent(new Event('nova:prefs-changed'));
  return document.documentElement.style.fontSize;
})()`);

// Bind folder via workspace APIs if available
const bind = await evalE(`(async () => {
  const api = window.novaDesktop;
  const root = ${JSON.stringify(disk)};
  const out = { root };
  try {
    if (api?.workspaceOpenRoot) {
      out.open = await api.workspaceOpenRoot({
        projectId: `proj-coffee-${Date.now().toString(36)}`,
        projectName: 'Harbor Roast',
        sourceDir: root,
        catalogOnly: true,
      });
    }
  } catch (e) { out.openErr = String(e?.message||e); }
  try {
    if (api?.workspaceSetGrants) {
      out.grants = await api.workspaceSetGrants({
        paths: [root],
        allowDocumentsFolderAccess: true,
      });
    }
  } catch (e) { out.grantErr = String(e?.message||e); }
  // Persist last disk target style keys if present
  try {
    localStorage.setItem('NOVA:last-disk-target', JSON.stringify({ path: root, name: 'Harbor Roast', kind: 'folder' }));
  } catch {}
  // Click folder chip / bind UI if visible
  const btns = [...document.querySelectorAll('button,[role=button],a')];
  const folder = btns.find(b => /harbor|roast|folder|bind|open project/i.test((b.getAttribute('aria-label')||'')+' '+(b.textContent||'')));
  if (folder) { folder.click(); out.clicked = (folder.textContent||'').trim().slice(0,40); }
  return out;
})()`);
console.log('bind', bind);
await sleep(800);

async function sendChat(text) {
  const payload = JSON.stringify(text);
  await evalE(`(() => {
    const ta = document.querySelector('textarea');
    if (!ta) throw new Error('no textarea');
    const d = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
    d.set.call(ta, ${payload});
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus();
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', which: 13, keyCode: 13, bubbles: true }));
    return true;
  })()`);
}

async function waitReply(needle, maxMs = 360000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    await sleep(2500);
    const snap = await evalE(`(() => {
      const needle = ${JSON.stringify(needle)};
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && /NOVA:chat-thread:chat:/.test(k)) keys.push(k);
      }
      for (const k of keys) {
        let arr = [];
        try { arr = JSON.parse(localStorage.getItem(k)||'[]'); } catch { continue; }
        let userIdx = -1;
        for (let i = arr.length - 1; i >= 0; i--) {
          if (arr[i]?.role === 'user' && String(arr[i].content||'').includes(needle)) { userIdx = i; break; }
        }
        if (userIdx < 0) continue;
        const last = arr[arr.length - 1];
        if (last?.role === 'assistant' && /^__generating__:/i.test(String(last.content||''))) {
          return { generating: true, status: String(last.content||'').slice(0,120) };
        }
        let asst = null;
        for (let i = userIdx + 1; i < arr.length; i++) {
          if (arr[i]?.role === 'assistant' && !/^__generating__:/i.test(String(arr[i].content||''))) asst = arr[i];
        }
        if (asst) {
          const ts = Number(asst.createdAt || asst.ts || asst.at || 0);
          if (ts && ts < ${T0} - 2000) continue;
          return { generating: false, content: String(asst.content||''), provider: asst.provider_used || asst.provider };
        }
      }
      return null;
    })()`);
    if (snap?.generating) {
      process.stdout.write(`\r${(snap.status||'').replace(/^__generating__:/,'').slice(0,90)}   `);
      continue;
    }
    if (snap?.content?.length > 20) {
      console.log('\n', snap.provider||'', snap.content.slice(0,500));
      return snap.content;
    }
  }
  throw new Error('timeout');
}

const prompt = `Edit the bound Harbor Roast project on disk. Rebuild src/App.tsx into a premium coffee shop site using images already at public/images/hero-latte.jpg, latte-art.jpg, espresso-pour.jpg, coffee-cup.jpg, beans-bag.jpg, cafe-interior.jpg.

Need: sticky nav, hero with hero-latte background + Order now / Schedule pickup buttons that scroll, 4 selectable drink cards with those images, pickup form with confirmation, footer SVG icons, gear theme toggle. Write App.tsx and App.css now.`;

console.log('=== EDIT ===');
await sendChat(prompt);
await waitReply(prompt.slice(0, 48));

// Attach replace images
await send('Page.setInterceptFileChooserDialog', { enabled: true }).catch(() => {});
await evalE(`(() => {
  const input = document.querySelector('input[type=file][accept="image/*"]');
  if (input) input.click();
  return !!input;
})()`);
await sleep(500);
const doc = await send('DOM.getDocument', { depth: 3 });
const q = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: 'input[type=file][accept="image/*"]' });
const files = ['cafe-interior.jpg', 'coffee-cup.jpg'].map((n) => path.join(ASSETS, n));
if (q?.nodeId) {
  await send('DOM.setFileInputFiles', { nodeId: q.nodeId, files });
  console.log('attached', files.map((f) => path.basename(f)));
}
await sleep(800);

const p2 = `I attached cafe-interior.jpg and coffee-cup.jpg. Save them into public/images/ (overwrite ok). Replace the hero background with cafe-interior.jpg and put coffee-cup.jpg on the Cold Brew card. Keep buttons working.`;
console.log('=== REPLACE IMAGES ===');
await sendChat(p2);
await waitReply(p2.slice(0, 40), 300000);

const probe = await evalE(`(async () => {
  const api = window.novaDesktop;
  const attach = await api.getOrAttachPreview(${JSON.stringify(disk)});
  const mounted = attach?.ok && attach?.url
    ? await api.previewProbeMounted({ url: attach.url, title: 'Harbor Roast', waitMs: 9000 })
    : null;
  let appLen = 0, hasImg = false;
  try {
    const t = await fetch(new URL('/src/App.tsx', attach.url)).then(r => r.ok ? r.text() : '');
    appLen = t.length; hasImg = /images\\/|hero-latte|backgroundImage|<img/i.test(t);
  } catch {}
  return { attach, mounted, appLen, hasImg, font: document.documentElement.style.fontSize };
})()`);
console.log(JSON.stringify(probe, null, 2));
const appFile = path.join(disk, 'src', 'App.tsx');
console.log('disk App len', fs.existsSync(appFile) ? fs.statSync(appFile).size : 0);

const ok = Boolean(probe?.mounted?.mounted && (probe.appLen > 800 || fs.statSync(appFile).size > 800));
process.exit(ok ? 0 : 4);
