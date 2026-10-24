/**
 * Human-like product create → watch Live (Quality lock in source).
 *   $env:NOVA_CDP_PORT='9333'; node scripts/_human-product-create-once.mjs
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import WebSocket from 'ws';

const PORT = Number(process.env.NOVA_CDP_PORT || 9333);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const keepAlive = setInterval(() => {}, 60_000);
process.on('exit', () => clearInterval(keepAlive));

const RUN = Date.now().toString(36).slice(-4);
const KIND = String(process.env.NOVA_CREATE_KIND || 'desk').toLowerCase();
const BRAND = process.env.NOVA_CREATE_BRAND || (KIND === 'food'
  ? `PlateRush ${RUN}`
  : `OakForge ${RUN}`);
const PROJECTS = path.join(os.homedir(), 'Documents', 'NOVA Projects');
const TEST_STARTED_AT = Date.now();
const OUT = path.join(process.cwd(), 'scripts', '_human-product-create-out.txt');

// Simple / human — no demand laundry list.
const prompt = KIND === 'food'
  ? [
      `hey — can you make me a new website for a food delivery company called ${BRAND}?`,
      'landing page for the brand — order food fast, show how it works, a few highlights, dark modern vibe.',
      'new project on disk please, not editing whatever i have open.',
    ].join(' ')
  : [
      `hey — can you make me a new website for a gaming desk brand called ${BRAND}?`,
      'just a landing page, dark vibe, with a shop button and a few features.',
      'new project on disk please, not editing whatever i have open.',
    ].join(' ');

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

function log(...args) {
  const line = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  console.log(line);
  try { fs.appendFileSync(OUT, `${line}\n`); } catch { /* ignore */ }
}

try { fs.writeFileSync(OUT, `=== human product create ${new Date().toISOString()} ===\n`); } catch { /* ignore */ }

let list;
for (let i = 0; i < 40; i++) {
  try {
    list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
    if (list?.length) break;
  } catch { /* wait */ }
  await sleep(500);
}
const page = list?.find((t) => t.type === 'page' && /nova/i.test(String(t.title || '')))
  || list?.find((t) => t.type === 'page' && /\/(?:dist\/)?index\.html|localhost:5173|127\.0\.0\.1:5173/i.test(String(t.url || '')))
  || list?.find((t) => t.type === 'page' && !/127\.0\.0\.1:\d{4}/.test(String(t.url || '')))
  || list?.find((t) => t.type === 'page');
if (!page?.webSocketDebuggerUrl) throw new Error(`NOVA missing on CDP ${PORT}`);
console.log('CDP page:', page.title, page.url);

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
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
await sleep(2000);

await evalE(`(() => {
  const els = [...document.querySelectorAll('button,[role=button],a')];
  const hits = els.filter((el) => (el.getAttribute('aria-label') || '') === 'Chat');
  hits.sort((a, b) => (a.textContent || '').length - (b.textContent || '').length);
  if (hits[0]) hits[0].click();
  return true;
})()`);
await sleep(800);
await evalE(`(() => {
  const btns = [...document.querySelectorAll('button,[role=button]')];
  const neu = btns.find((b) => /new chat|new conversation/i.test((b.getAttribute('aria-label') || '') + ' ' + (b.textContent || '')));
  if (neu) { neu.click(); return 'new'; }
  return 'skip';
})()`);
await sleep(1200);
await evalE(`(() => {
  const els = [...document.querySelectorAll('button,[role=button],a')];
  const clear = els.find((el) => /clear folder|unbind|close project|leave folder/i.test(
    ((el.getAttribute('aria-label') || '') + ' ' + (el.textContent || '')).trim(),
  ));
  if (clear) { clear.click(); return 'cleared'; }
  return 'none';
})()`);
await sleep(400);

log('=== HUMAN PRODUCT CREATE ===');
log('Brand:', BRAND);
log('Prompt:', prompt);

const sent = await evalE(`(() => {
  const ta = document.querySelector('textarea');
  if (!ta) return { ok: false, reason: 'no textarea' };
  const d = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
  d.set.call(ta, ${JSON.stringify(prompt)});
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.focus();
  const btns = [...document.querySelectorAll('button,[role=button]')];
  const sendBtn = btns.find((b) => {
    const a = ((b.getAttribute('aria-label') || '') + ' ' + (b.textContent || '')).trim();
    return /^send$/i.test(a) || /send message/i.test(a);
  });
  if (sendBtn) {
    sendBtn.click();
    return { ok: true, via: 'button' };
  }
  ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', which: 13, keyCode: 13, bubbles: true }));
  return { ok: true, via: 'enter' };
})()`);
log('send:', sent);
if (!sent?.ok) throw new Error(sent?.reason || 'send failed');

const brandCore = BRAND.replace(/\s+[a-z0-9]{3,5}$/i, '').trim() || BRAND;
const needle = BRAND;
const t0 = Date.now();
let reply = '';
let lastStatus = '';

while (Date.now() - t0 < 900_000) {
  await sleep(4000);
  let liveLabel = '';
  try {
    liveLabel = await evalE(`(async () => {
      try {
        const m = await import('/src/lib/chatTurnStatusStore.ts');
        return String(m.getChatTurnStatus()?.label || '').slice(0, 140);
      } catch {
        try {
          const el = document.querySelector('[aria-label^="Working "], [data-nova-status]');
          return (el?.getAttribute('aria-label') || el?.textContent || '').slice(0, 140);
        } catch { return ''; }
      }
    })()`);
  } catch { /* ignore */ }

  if (liveLabel && liveLabel !== lastStatus) {
    lastStatus = liveLabel;
    log(`status @${Math.round((Date.now() - t0) / 1000)}s:`, liveLabel);
  } else {
    process.stdout.write(`\r… ${Math.round((Date.now() - t0) / 1000)}s ${(liveLabel || lastStatus || '').slice(0, 70)}   `);
  }

  let snap = null;
  try {
    snap = await evalE(`(() => {
      const brand = ${JSON.stringify(needle)};
      let best = null;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !/NOVA:chat-thread:chat:/.test(k)) continue;
        let arr = [];
        try { arr = JSON.parse(localStorage.getItem(k) || '[]'); } catch { continue; }
        let userIdx = -1;
        for (let j = arr.length - 1; j >= 0; j--) {
          const c = String(arr[j]?.content || '');
          if (arr[j]?.role === 'user' && c.includes(brand)) { userIdx = j; break; }
        }
        if (userIdx < 0) continue;
        const last = arr[arr.length - 1];
        if (last?.role === 'assistant' && /^__generating__:/i.test(String(last.content || ''))) {
          return { generating: true, status: String(last.content || '').slice(0, 180) };
        }
        for (let j = arr.length - 1; j > userIdx; j--) {
          if (arr[j]?.role === 'assistant' && !/^__generating__:/i.test(String(arr[j].content || ''))) {
            const ts = Number(arr[j].createdAt || arr[j].ts || arr[j].at || 0);
            if (ts && ts < ${TEST_STARTED_AT} - 5000) continue;
            const row = { generating: false, content: String(arr[j].content || '') };
            if (!best || row.content.length > best.content.length) best = row;
          }
        }
      }
      return best;
    })()`);
  } catch {
    continue;
  }

  if (snap?.generating) continue;

  if (snap?.content && snap.content.length > 40) {
    const spoken = (() => {
      const m = snap.content.match(/<!--nova-trace:([\s\S]*?)-->/);
      if (m?.[1]) {
        try {
          const ans = String(JSON.parse(m[1])?.answer || '').trim();
          if (ans) return ans;
        } catch { /* fall through */ }
      }
      return snap.content;
    })();
    const looksDone = /Created\s+\*\*|create miss|Craft stalled|craft preflight failed|was not marked Ready|time limit was reached|Live preview verified|Open \*\*Live\*\*|Dependencies installed|Live server started|Here you go|scaffolded|project is ready|Live is open|Unavailable|Quality/i.test(spoken);
    if (!looksDone && Date.now() - t0 < 720_000) continue;
    reply = snap.content;
    log('\n=== reply ===');
    log(spoken.slice(0, 1500));
    break;
  }
}

// Find newest matching project folder
let disk = null;
try {
  const entries = fs.readdirSync(PROJECTS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const p = path.join(PROJECTS, d.name);
      let m = 0;
      try { m = fs.statSync(p).mtimeMs; } catch { /* ignore */ }
      return { name: d.name, path: p, m };
    })
    .filter((d) => new RegExp(brandCore.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(d.name))
    .sort((a, b) => b.m - a.m);
  disk = entries[0] || null;
} catch { /* ignore */ }

log('\n=== disk ===');
log(disk || 'no matching folder');

if (disk?.path) {
  const appJsx = path.join(disk.path, 'src/App.jsx');
  const appTsx = path.join(disk.path, 'src/App.tsx');
  const cssPath = path.join(disk.path, 'src/App.css');
  const logoPath = path.join(disk.path, 'public/logo.svg');
  const deskHero = path.join(disk.path, 'public/heroes/desk.svg');
  const deliveryHero = path.join(disk.path, 'public/heroes/delivery.svg');
  const appBody = fs.existsSync(appJsx)
    ? fs.readFileSync(appJsx, 'utf8')
    : (fs.existsSync(appTsx) ? fs.readFileSync(appTsx, 'utf8') : '');
  const files = {
    'src/App.jsx': appBody,
    ...(fs.existsSync(appTsx) ? { 'src/App.tsx': fs.readFileSync(appTsx, 'utf8') } : {}),
    'src/App.css': fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : '',
    'public/logo.svg': fs.existsSync(logoPath) ? fs.readFileSync(logoPath, 'utf8') : '',
    ...(fs.existsSync(deskHero)
      ? { 'public/heroes/desk.svg': fs.readFileSync(deskHero, 'utf8') }
      : {}),
    ...(fs.existsSync(deliveryHero)
      ? { 'public/heroes/delivery.svg': fs.readFileSync(deliveryHero, 'utf8') }
      : {}),
  };
  log('app bytes:', files['src/App.jsx'].length, 'css:', files['src/App.css'].length);
  // Grade via dynamic import of built logic — use tsx path when run under node won't work.
  // Caller should use: npx tsx --tsconfig tsconfig.app.json scripts/_human-product-create-once.mjs
  try {
    const {
      gradeProductQuality,
      formatProductQualityReport,
      briefWantsProductLadder,
    } = await import('../src/lib/createProductLadder.ts');
    const brief = prompt;
    log('wantsProductLadder:', briefWantsProductLadder(brief));
    const g = gradeProductQuality(files, brief, BRAND);
    log('grade:', formatProductQualityReport(files, brief, BRAND));
    log('tier:', g.tier, 'score:', g.score, 'okQuality:', g.okQuality);
    log('checks:', g.checks);
    if (g.reasons.length) log('gaps:', g.reasons);
  } catch (e) {
    log('grade import failed:', String(e.message || e).slice(0, 200));
  }
}

log('\nDONE in', Math.round((Date.now() - t0) / 1000), 's');
ws.close();
clearInterval(keepAlive);
process.exit(0);
