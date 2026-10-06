/**
 * Live: Attach menu + vision/link asks (no create/build).
 * 1) Stage photos into chat → ask what/who
 * 2) Link ask: coffee site "like this?" — summary only
 *
 * Requires Open-NOVA-Build.bat (CDP 9229) with Vite HMR so Attach menu is live.
 * Env: NOVA_CDP_PORT (default 9229)
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const PORT = Number(process.env.NOVA_CDP_PORT || 9229);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX = path.join(os.homedir(), 'Documents', 'NOVA Projects', '_attach-live-fixtures');
const OUT = path.join(ROOT, 'scripts', '_attach-live-out.txt');

function log(...args) {
  const line = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  console.log(line);
  try { fs.appendFileSync(OUT, line + '\n'); } catch { /* ignore */ }
}

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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function connectPage() {
  log('connectPage: listing CDP…');
  let list = null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      list = await Promise.race([
        fetchJson(`http://127.0.0.1:${PORT}/json/list`).catch(() => fetchJson(`http://127.0.0.1:${PORT}/json`)),
        sleep(5000).then(() => { throw new Error('CDP list timeout'); }),
      ]);
      break;
    } catch (err) {
      log(`CDP list attempt ${attempt} failed:`, String(err.message || err));
      await sleep(1000 * attempt);
    }
  }
  if (!list) throw new Error('CDP list failed after retries');
  const page = (list || []).find((t) => t.type === 'page' && /NOVA/i.test(t.title || '') && /5173|localhost|127\.0\.0\.1:517/.test(t.url || ''))
    || (list || []).find((t) => t.type === 'page' && /NOVA/i.test(t.title || ''))
    || (list || []).find((t) => t.type === 'page');
  if (!page?.webSocketDebuggerUrl) throw new Error('No NOVA CDP page on ' + PORT);
  log('cdp', page.title, page.url);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await Promise.race([
    new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    }),
    sleep(10000).then(() => { throw new Error('CDP websocket open timeout'); }),
  ]);
  log('cdp ws open');
  let id = 0;
  const pending = new Map();
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(String(raw)); } catch { return; }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const i = ++id;
    pending.set(i, { resolve, reject });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    });
    if (r?.exceptionDetails) {
      throw new Error(r.exceptionDetails.text || JSON.stringify(r.exceptionDetails));
    }
    return r?.result?.value;
  };
  return { ws, evaluate };
}

async function newChat(evaluate) {
  await evaluate(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b =>
      /new chat/i.test(b.getAttribute('aria-label') || '')
      || /new chat/i.test(b.textContent || '')
    );
    if (btn) btn.click();
    return true;
  })()`);
  await sleep(800);
}

async function probeMenu(evaluate) {
  return evaluate(`(() => {
    const plus = document.querySelector('[data-ark-composer] button[aria-label*="Modes"], [data-ark-composer] button[aria-label*="attach"]')
      || [...document.querySelectorAll('[data-ark-composer] button')].find(b => (b.getAttribute('aria-label') || '').toLowerCase().includes('mode'));
    if (plus) plus.click();
    const labels = [...document.querySelectorAll('button')].map(b => (b.textContent || '').trim()).filter(Boolean);
    const hasAttach = labels.some(t => /^Attach$/i.test(t));
    const hasModels = labels.some(t => /Models\\s*&\\s*Ollama/i.test(t));
    const hasAddPhoto = labels.some(t => /Add photo/i.test(t));
    // close menu
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return { hasAttach, hasModels, hasAddPhoto, sample: labels.slice(0, 40) };
  })()`);
}

async function attachPaths(evaluate, paths) {
  const payload = JSON.stringify(paths);
  return evaluate(`(async () => {
    if (typeof window.__novaLiveAttach !== 'function') {
      return { ok: false, error: 'no __novaLiveAttach — hard-reload NOVA after attach patch' };
    }
    return window.__novaLiveAttach(${payload});
  })()`);
}

async function sendPrompt(evaluate, text) {
  const payload = JSON.stringify(text);
  return evaluate(`(() => {
    const ta = document.querySelector('textarea[aria-label*="Message"], textarea');
    if (!ta) return { ok: false, reason: 'no textarea' };
    const desc = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
    ta.focus();
    desc.set.call(ta, ${payload});
    ta.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    const sendBtn = [...document.querySelectorAll('button')].find(b => {
      const t = (b.getAttribute('aria-label') || '').toLowerCase();
      return t.includes('send');
    });
    if (sendBtn) { sendBtn.click(); return { ok: true, via: 'button' }; }
    ta.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true,
    }));
    return { ok: true, via: 'enter' };
  })()`);
}

async function waitReply(evaluate, { timeoutMs = 180_000, quietMs = 4000 } = {}) {
  const start = Date.now();
  let lastLen = -1;
  let stableSince = Date.now();
  const baseline = await evaluate(`(document.body?.innerText || '').length`);
  while (Date.now() - start < timeoutMs) {
    const snap = await evaluate(`(() => {
      const gen = document.body?.innerText || '';
      const stop = [...document.querySelectorAll('button')].some(b =>
        /stop/i.test(b.getAttribute('aria-label') || b.textContent || ''));
      const busy = /Thinking…|Researching|Reading|Vision|Working…/i.test(gen.slice(-1200));
      const thumbs = document.querySelectorAll('[data-ark-composer] img, .rounded-md.object-cover').length;
      const chips = [...document.querySelectorAll('span')].some(s => /Image|File|Attach/i.test(s.textContent || ''));
      return { len: gen.length, stop, busy, tail: gen.slice(-900), thumbs, chips };
    })()`);
    if (snap.len !== lastLen) {
      lastLen = snap.len;
      stableSince = Date.now();
    }
    const grew = snap.len >= baseline + 80;
    const quiet = Date.now() - stableSince >= quietMs;
    if (grew && quiet && !snap.stop && !snap.busy) return snap;
    await sleep(1200);
  }
  const tail = await evaluate(`(document.body?.innerText || '').slice(-1000)`);
  throw new Error('timeout waiting for reply\\n' + tail);
}

function scoreVision(tail) {
  const t = String(tail || '');
  const gap = /cannot read it yet|nothing on this PC can read|vision providers|install.*Qwen2-VL|Local-only/i.test(t);
  const describes = /\b(person|people|man|woman|face|landmark|building|logo|coffee|cup|website|photo|image|wearing|standing|sitting)\b/i.test(t)
    && t.length > 80;
  const names = /\b(Obama|Einstein|Bezos|Musk|Swift|Beyonc|Oprah|Gates|Zuckerberg|Starbucks|Apple)\b/i.test(t);
  return { gap, describes, names, len: t.length };
}

try { fs.writeFileSync(OUT, `attach-live ${new Date().toISOString()}\n`); } catch { /* ignore */ }

log('Preparing fixtures →', FIX);
fs.mkdirSync(FIX, { recursive: true });

const coffeeSrc = path.join(ROOT, '.tmp-coffee-assets');
for (const name of ['cafe-interior.jpg', 'latte-art.jpg', 'coffee-cup.jpg']) {
  const from = path.join(coffeeSrc, name);
  const to = path.join(FIX, name === 'coffee-cup.jpg' ? 'coffee-cup-hires.jpg' : name);
  try {
    if (fs.existsSync(from)) fs.copyFileSync(from, to);
  } catch { /* ignore */ }
}

const downloads = [
  {
    name: 'einstein.jpg',
    url: 'https://en.wikipedia.org/wiki/Special:FilePath/Albert_Einstein_Head.jpg',
  },
  {
    name: 'obama.jpg',
    url: 'https://en.wikipedia.org/wiki/Special:FilePath/President_Barack_Obama.jpg',
  },
];

async function download(url, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Referer: 'https://en.wikipedia.org/',
    },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`download ${url} → ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 2000) throw new Error(`download too small (${buf.length})`);
  fs.writeFileSync(dest, buf);
  return dest;
}

const want = ['einstein.jpg', 'obama.jpg', 'coffee-cup-hires.jpg'];
const paths = [];
for (const name of want) {
  const dest = path.join(FIX, name);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 2000) {
    log('cached', name, fs.statSync(dest).size);
    paths.push(dest);
    continue;
  }
  const d = downloads.find((x) => x.name === name);
  if (!d) {
    log('missing', name);
    continue;
  }
  try {
    log('get', name);
    await download(d.url, dest);
    paths.push(dest);
  } catch (e) {
    log('download fail', name, String(e.message || e));
  }
}
if (!paths.length) throw new Error('no fixtures available');

const { ws, evaluate } = await connectPage();

log('hard reload for Attach menu + __novaLiveAttach');
await evaluate(`location.reload()`);
await sleep(3500);

log('--- menu probe ---');
const menu = await probeMenu(evaluate);
log(menu);
if (menu?.hasModels) log('WARN: Models & Ollama still in + menu');
if (!menu?.hasAttach) log('WARN: Attach not found — hard-reload NOVA (Ctrl+R)');

log('--- new chat ---');
await newChat(evaluate);

log('--- attach images ---', paths.map((p) => path.basename(p)));
const att = await attachPaths(evaluate, paths);
log('attach', att);
if (!att?.ok) {
  log('FAIL attach — continuing with text-only link ask');
} else {
  await sleep(600);
  const staged = await evaluate(`(() => {
    const imgs = [...document.querySelectorAll('[data-ark-composer] img')].length;
    const text = document.body?.innerText || '';
    return { imgs, hasPendingHint: /photo goes with|Enter to read|Attach/i.test(text.slice(0, 2000)) };
  })()`);
  log('staged', staged);

  log('--- vision ask ---');
  const vSend = await sendPrompt(
    evaluate,
    'Look at the attached photos. For each one: what is it, and if a person is shown, who do you think it is? Be concrete. Do not build anything.',
  );
  log('send', vSend);
  const vReply = await waitReply(evaluate, { timeoutMs: 200_000 });
  const vScore = scoreVision(vReply.tail);
  log('vision score', vScore);
  log('vision tail:\n', vReply.tail);
}

log('--- link ask (no build) ---');
await newChat(evaluate);
await sleep(500);
const linkSend = await sendPrompt(
  evaluate,
  [
    'I want a premium coffee website inspired by https://www.starbucks.com/',
    'Do NOT build or create a project yet.',
    'Just tell me: (1) can you use that link as a visual/reference brief, (2) what style/layout cues you would take from it,',
    '(3) a short plan for a Harbor Roast coffee site that feels similar but original, (4) how well you can do this from a URL alone vs if I also attach screenshots.',
    'Keep it under 200 words.',
  ].join(' '),
);
log('send', linkSend);
const linkReply = await waitReply(evaluate, { timeoutMs: 180_000 });
log('link tail:\n', linkReply.tail);

const summary = {
  menuAttach: Boolean(menu?.hasAttach),
  menuModelsGone: !menu?.hasModels,
  attachOk: Boolean(att?.ok),
  visionGap: scoreVision(linkReply.tail).gap, // placeholder; real below
};
try {
  const last = await evaluate(`(document.body?.innerText || '').slice(-2500)`);
  const visionPart = String(last);
  summary.visionDescribes = scoreVision(visionPart).describes || scoreVision(visionPart).names;
  summary.visionGap = /cannot read it yet|install.*Qwen2-VL|nothing on this PC can read/i.test(visionPart);
  summary.linkMentionsStarbucks = /starbucks|coffee|reference|screenshot|url|link/i.test(linkReply.tail);
} catch { /* ignore */ }

log('--- SUMMARY ---');
log(summary);
ws.close();
process.exit(summary.menuAttach && summary.menuModelsGone ? 0 : 2);
