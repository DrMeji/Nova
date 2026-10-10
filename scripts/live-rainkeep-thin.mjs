/**
 * Fresh live create after thin gate fix (0.1.320) — Rainkeep (never built before).
 * CDP :9229  (set NOVA_CDP_PORT=9229)
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.NOVA_CDP_PORT || 9229);
const OUT = path.join(__dirname, '..', '.tmp-live-rainkeep.json');
const PRODUCT = 'Rainkeep';
const ASK = `Build me a brand new app called Rainkeep — a tiny rain / watering log for houseplants.

Working tool UI (not a marketing page): add plants, log a watering with today's date in one click, show last watered, and mark overdue plants. local state only. Calm teal look unique to Rainkeep.

Skip the plan — create on disk and open Live when ready. Write plain JavaScript JSX in src/App.jsx (no TypeScript).`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => { try { process.stderr.write(a.map(String).join(' ') + '\n'); } catch {} };

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

async function waitForCdp(ms = 60000) {
  log(`waiting CDP :${PORT}`);
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
      if (Array.isArray(list) && list.length) return list;
    } catch {}
    await sleep(800);
  }
  throw new Error(`CDP not up on ${PORT}`);
}

const list = await waitForCdp();
const page = list.find((t) => t.type === 'page') || list[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('ws timeout')), 20000);
  ws.once('open', () => { clearTimeout(t); resolve(); });
  ws.once('error', reject);
});
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
    expression, returnByValue: true, awaitPromise: true, userGesture: true,
  });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
};
await send('Runtime.enable');

// Hard reload so Vite picks up 0.1.320 gate wiring
await send('Page.reload', { ignoreCache: true });
await sleep(2500);

const wiped = await evalE(`(() => {
  let n = 0;
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
  for (const k of keys) {
    if (!k) continue;
    if (/NOVA:recent-chats|NOVA:recent-projects|NOVA:chat-thread|NOVA:chat-studio|NOVA:create-job|Rainkeep|Dewledger|Mossmeter/i.test(k)) {
      localStorage.removeItem(k); n++;
    }
  }
  try { window.dispatchEvent(new CustomEvent('NOVA:new-chat')); } catch {}
  return n;
})()`);
log('wiped keys', wiped);
await sleep(900);
await evalE(`(() => {
  const btns = [...document.querySelectorAll('button,[role=button]')];
  const neu = btns.find(b => /new chat/i.test((b.getAttribute('aria-label')||'')+' '+(b.textContent||'')));
  if (neu) neu.click();
  return true;
})()`);
await sleep(1000);

log('=== ASK ===');
log(ASK);
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
log('--- sent — watch Nova ---');

const WAIT = Number(process.env.NOVA_PROBE_WAIT_MS || 900_000);
const t0 = Date.now();
let lastStatus = '';
let lastSnap = null;
while (Date.now() - t0 < WAIT) {
  await sleep(3000);
  const snap = await evalE(`(() => {
    const body = document.body?.innerText || '';
    const statusMatch = body.match(/(?:Finish App|Thin create|Craft ·|Single Brain|Loading model|Building ·|Syntax|Quality Ready|Live unlocked|Created Rainkeep|Failed at|App still incomplete|craft kept|App ready)[^\\n]{0,110}/i);
    const stop = [...document.querySelectorAll('button')].some(b => /stop/i.test((b.getAttribute('aria-label')||b.textContent||'')));
    let reply = '', generating = false;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !/NOVA:chat-thread:chat:/.test(k)) continue;
      try {
        const arr = JSON.parse(localStorage.getItem(k) || '[]');
        const hit = arr.findIndex(m => m?.role === 'user' && /Rainkeep/i.test(String(m.content||'')));
        if (hit < 0) continue;
        for (let j = hit + 1; j < arr.length; j++) {
          const c = String(arr[j]?.content || '');
          if (arr[j]?.role === 'assistant') {
            if (/^__generating__:/i.test(c)) generating = true;
            else reply = c;
          }
        }
      } catch {}
    }
    return { status: statusMatch?.[0] || null, stop, generating, replyLen: reply.length, replyHead: reply.slice(0, 420) };
  })()`);
  lastSnap = snap;
  if (snap?.status && snap.status !== lastStatus) {
    lastStatus = snap.status;
    log(' …', lastStatus.slice(0, 120));
  }
  if (snap && !snap.generating && !snap.stop && snap.replyLen > 40) {
    await sleep(5000);
    break;
  }
}

function diskReport() {
  const root = path.join(process.env.USERPROFILE || '', 'Documents', 'NOVA Projects');
  if (!fs.existsSync(root)) return { ok: false, reason: 'no projects dir' };
  const folders = fs.readdirSync(root);
  const hit = folders.filter((n) => /rainkeep/i.test(n))
    .map((n) => path.join(root, n))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  if (!hit) return { ok: false, reason: 'no Rainkeep folder', folders };
  const appPath = fs.existsSync(path.join(hit, 'src', 'App.jsx'))
    ? path.join(hit, 'src', 'App.jsx')
    : path.join(hit, 'src', 'App.tsx');
  if (!fs.existsSync(appPath)) return { ok: false, reason: 'no App', root: hit };
  const app = fs.readFileSync(appPath, 'utf8');
  return {
    ok: app.length > 400 && /export\s+default/i.test(app) && /Rainkeep/i.test(app),
    root: hit,
    appPath,
    appLen: app.length,
    hasTsGenerics: /useState\s*</.test(app),
    truncated: /plants\.map\(\s*p\s*=>\s*p\.id\s*$/m.test(app) || !/\}\s*;?\s*$/.test(app.trim()),
    cover: /COVER_HREFS/.test(app),
    snippet: app.slice(0, 350),
  };
}

const disk = diskReport();
const successHint = /Live unlocked|Quality Ready|Created Rainkeep[^]*Live|craft kept|App ready|Thin create · App/i.test(
  `${lastStatus}\n${lastSnap?.replyHead || ''}`,
);
const failHint = /craft preflight failed|Failed at|App still incomplete/i.test(
  `${lastStatus}\n${lastSnap?.replyHead || ''}`,
);
const report = {
  product: PRODUCT,
  at: new Date().toISOString(),
  lastStatus,
  lastSnap,
  disk,
  successHint,
  failHint,
};
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
log('\n—— result ——');
log(JSON.stringify({ lastStatus, disk, successHint, failHint, replyHead: lastSnap?.replyHead }, null, 2));
log('Wrote', OUT);
ws.close();
const pass = disk.ok && !disk.hasTsGenerics && !failHint;
process.exit(pass ? 0 : 2);
