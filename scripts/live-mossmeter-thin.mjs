/**
 * Fresh thin-create live test: wipe chats in UI, build Mossmeter (never built before).
 * Watch Nova while this runs. CDP :9229
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.NOVA_CDP_PORT || 9229);
const OUT = path.join(__dirname, '..', '.tmp-live-mossmeter.json');
const PRODUCT = 'Mossmeter';
const ASK = `Build me a brand new app called Mossmeter — a houseplant watering tracker.

I want a clean working tool (not a marketing landing page): list of plants, each with last-watered date, a big "Watered today" button, and a simple overdue highlight when a plant is past its watering interval. Store plants in local state (add / rename / remove). Invent a calm green/earthy look unique to Mossmeter.

Skip the plan — create the project on disk and open Live when it's ready.`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...args) => {
  try { process.stderr.write(args.map(String).join(' ') + '\n'); } catch { /* ignore */ }
};

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

async function waitForCdp(ms = 90000) {
  log(`waiting for CDP :${PORT}…`);
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
      if (Array.isArray(list) && list.length) return list;
    } catch { /* retry */ }
    await sleep(1000);
  }
  throw new Error(`CDP not up on ${PORT}`);
}

const list = await waitForCdp();
const page = list.find((t) => t.type === 'page' && /NOVA|index\.html|localhost|file:/i.test(`${t.title || ''}${t.url || ''}`))
  || list.find((t) => t.type === 'page');
if (!page?.webSocketDebuggerUrl) throw new Error('NOVA page missing');
log('CDP page', page.title, page.url);

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('websocket open timeout')), 20000);
  ws.once('open', () => { clearTimeout(t); resolve(); });
  ws.once('error', (e) => { clearTimeout(t); reject(e); });
});
log('websocket open');
let id = 0;
const pending = new Map();
ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
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

await send('Page.enable');
await send('Runtime.enable');

// Wait for UI
{
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    const ok = await evalE(`!!document.querySelector('textarea') || (document.getElementById('root')?.innerHTML||'').length>40`).catch(() => false);
    if (ok) break;
    await sleep(500);
  }
}

log('=== Wipe chat history + recent projects in localStorage ===');
const wiped = await evalE(`(() => {
  const removed = [];
  const keep = /^(NOVA:brain|NOVA:prefs|NOVA:engine|NOVA:models|NOVA:auth|NOVA:guest)/i;
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
  for (const k of keys) {
    if (!k) continue;
    if (/NOVA:recent-chats|NOVA:recent-projects|NOVA:recent-creations|NOVA:chat-thread|NOVA:deleted-chat|NOVA:deleted-project|NOVA:chat-studio|NOVA:create-job|NOVA:plan/i.test(k)
      || (/NOVA:/i.test(k) && !keep.test(k) && /chat|thread|project|creation|studio|job|plan|nudge/i.test(k))) {
      localStorage.removeItem(k);
      removed.push(k);
    }
  }
  try { window.dispatchEvent(new CustomEvent('NOVA:new-chat')); } catch {}
  return { removed: removed.length, sample: removed.slice(0, 12) };
})()`);
log(JSON.stringify(wiped));

await sleep(800);
await evalE(`(() => {
  const els = [...document.querySelectorAll('button,[role=button],a')];
  const chat = els.find(el => (el.getAttribute('aria-label') || '') === 'Chat' || /^chat$/i.test((el.textContent||'').trim()));
  if (chat) chat.click();
  return true;
})()`);
await sleep(600);
await evalE(`(() => {
  const btns = [...document.querySelectorAll('button,[role=button]')];
  const neu = btns.find(b => /new chat|new conversation/i.test((b.getAttribute('aria-label') || '') + ' ' + (b.textContent || '')));
  if (neu) { neu.click(); return 'new'; }
  try { window.dispatchEvent(new CustomEvent('NOVA:new-chat')); } catch {}
  return 'event';
})()`);
await sleep(1200);

log('=== ASK (watch Nova) ===');
log(ASK);
log('--- sending ---');

await evalE(`(() => {
  const ta = document.querySelector('textarea');
  if (!ta) throw new Error('no textarea');
  const d = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
  d.set.call(ta, ${JSON.stringify(ASK)});
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.focus();
  ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', which: 13, keyCode: 13, bubbles: true }));
  return true;
})()`);

const t0 = Date.now();
const WAIT = Number(process.env.NOVA_PROBE_WAIT_MS || 900_000);
let lastStatus = '';
let lastSnap = null;
while (Date.now() - t0 < WAIT) {
  await sleep(3000);
  const snap = await evalE(`(() => {
    const body = document.body?.innerText || '';
    const statusMatch = body.match(/(?:Thin create|Craft ·|Style ·|Syntax|Building|Creating|Preview Ready|Live |Quality Ready|Install|npm|Verify|Repair|floor|Failed|Scaffold|Single Brain|Loading model)[^\\n]{0,100}/i);
    const stop = [...document.querySelectorAll('button')].some(b => /stop/i.test((b.getAttribute('aria-label') || b.textContent || '')));
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && /NOVA:chat-thread:chat:/.test(k)) keys.push(k);
    }
    let reply = '';
    let generating = false;
    for (const k of keys) {
      try {
        const arr = JSON.parse(localStorage.getItem(k) || '[]');
        if (!Array.isArray(arr)) continue;
        const hit = arr.findIndex(m => m?.role === 'user' && /Mossmeter/i.test(String(m.content||'')));
        if (hit < 0) continue;
        for (let j = hit + 1; j < arr.length; j++) {
          const a = arr[j];
          const c = String(a?.content || '');
          if (a?.role === 'assistant') {
            if (/^__generating__:/i.test(c)) generating = true;
            else reply = c;
          }
        }
      } catch {}
    }
    const livePill = /Live|Ready|preview/i.test(body.slice(-800));
    return {
      status: statusMatch ? statusMatch[0] : null,
      stop,
      generating,
      replyLen: reply.length,
      replyHead: reply.slice(0, 280),
      livePill,
      bodyTail: body.slice(-400),
    };
  })()`);
  lastSnap = snap;
  if (snap?.status && snap.status !== lastStatus) {
    lastStatus = snap.status;
    log('  …', lastStatus.slice(0, 120));
  }
  // Done: assistant finished and not generating
  if (snap && !snap.generating && !snap.stop && snap.replyLen > 40) {
    // Give Live a moment to settle
    await sleep(4000);
    break;
  }
}

function diskReport() {
  const projectsRoot = path.join(process.env.USERPROFILE || '', 'Documents', 'NOVA Projects');
  if (!fs.existsSync(projectsRoot)) return { ok: false, reason: 'no NOVA Projects dir', folders: [] };
  const folders = fs.readdirSync(projectsRoot);
  const candidates = folders
    .filter((n) => /mossmeter/i.test(n))
    .map((n) => path.join(projectsRoot, n))
    .filter((d) => fs.existsSync(path.join(d, 'src', 'App.tsx')) || fs.existsSync(path.join(d, 'src', 'App.jsx')))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  const diskRoot = candidates[0] || null;
  if (!diskRoot) {
    return { ok: false, reason: 'no Mossmeter folder', folders };
  }
  const appPath = fs.existsSync(path.join(diskRoot, 'src', 'App.tsx'))
    ? path.join(diskRoot, 'src', 'App.tsx')
    : path.join(diskRoot, 'src', 'App.jsx');
  const app = fs.readFileSync(appPath, 'utf8');
  const css = fs.existsSync(path.join(diskRoot, 'src', 'App.css'))
    ? fs.readFileSync(path.join(diskRoot, 'src', 'App.css'), 'utf8')
    : '';
  const floorish = /utility floor|recovery floor|buildUtilityFloor|stickyNotePageApp|NOVA_STOREFRONT/i.test(app);
  return {
    ok: app.length > 400 && /Mossmeter/i.test(app),
    root: diskRoot,
    appLen: app.length,
    cssLen: css.length,
    brand: /Mossmeter/i.test(app),
    floorish,
    hasWater: /water/i.test(app),
    snippet: app.slice(0, 400),
    folders,
  };
}

await sleep(2000);
const disk = diskReport();
const report = {
  product: PRODUCT,
  at: new Date().toISOString(),
  lastStatus,
  lastSnap,
  disk,
};
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
log('\n—— result ——');
log(JSON.stringify({ lastStatus, disk, replyLen: lastSnap?.replyLen, replyHead: lastSnap?.replyHead }, null, 2));
log('Wrote', OUT);
ws.close();
process.exit(disk.ok ? 0 : 2);
