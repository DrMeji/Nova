/**
 * Live human-style chat → simple create. Watch NOVA while this runs.
 * CDP: Open-NOVA-Build.bat (--remote-debugging-port=9229)
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.NOVA_CDP_PORT || 9229);
const OUT = path.join(__dirname, '..', '.tmp-live-simple-human-build.json');
const PRODUCT = 'Riverfolio';
const RUN_TAG = `r${Date.now().toString(36).slice(-4)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s || '')
  .replace(/[—–−]/g, ' ')
  .replace(/\./g, ' ')
  .replace(/[“”]/g, '"')
  .replace(/[‘’]/g, "'")
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

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
const page = list.find((t) => t.type === 'page' && /NOVA|index\.html|localhost/i.test(`${t.title || ''}${t.url || ''}`))
  || list.find((t) => t.type === 'page');
if (!page?.webSocketDebuggerUrl) throw new Error('NOVA page missing');

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

async function ensureAppReady() {
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    const ok = await evalE(`(() => {
      try {
        const ta = document.querySelectorAll('textarea').length;
        const root = (document.getElementById('root')?.innerHTML || '').length;
        return ta > 0 || root > 40;
      } catch { return false; }
    })()`).catch(() => false);
    if (ok) return true;
    await sleep(500);
  }
  throw new Error('NOVA UI not ready');
}

await ensureAppReady();

async function clickNewChat() {
  return evalE(`(() => {
    const btns = [...document.querySelectorAll('button, a, [role="button"]')];
    const hit = btns.find((b) => /new\\s*chat/i.test(((b.textContent || '') + ' ' + (b.getAttribute('aria-label') || '')).toLowerCase()));
    if (hit) { hit.click(); return 'clicked'; }
    location.hash = '#/chat?new=' + Date.now();
    return 'hash';
  })()`);
}

async function sendAsk(text, { timeoutMs = 300000 } = {}) {
  const needle = norm(text).slice(0, 40);
  const before = await evalE(`(() => {
    const needle = ${JSON.stringify(needle)};
    const norm = (s) => String(s || '')
      .replace(/[\\u2014\\u2013\\u2212-]/g, ' ')
      .replace(/\\./g, ' ')
      .replace(/[\\u201C\\u201D]/g, '"')
      .replace(/[\\u2018\\u2019]/g, "'")
      .replace(/\\s+/g, ' ')
      .trim()
      .toLowerCase();
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && /NOVA:chat-thread:chat:/.test(k)) keys.push(k);
    }
    let best = null;
    let bestCount = 0;
    for (const k of keys) {
      try {
        const arr = JSON.parse(localStorage.getItem(k) || '[]');
        if (!Array.isArray(arr)) continue;
        if (arr.some(m => m?.role === 'user' && norm(m.content).includes(needle))) {
          return { count: arr.length, key: k };
        }
        if (arr.length >= bestCount) { bestCount = arr.length; best = k; }
      } catch { /* ignore */ }
    }
    return { count: bestCount, key: best };
  })()`);

  const ok = await evalE(`(() => {
    const ta = document.querySelector('textarea');
    if (!ta) return false;
    const d = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
    d.set.call(ta, ${JSON.stringify(text)});
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus();
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', which: 13, keyCode: 13, bubbles: true }));
    return true;
  })()`);
  if (!ok) throw new Error('no textarea');

  const t0 = Date.now();
  let lastStatus = '';
  while (Date.now() - t0 < timeoutMs) {
    await sleep(2000);
    const snap = await evalE(`(() => {
      const needle = ${JSON.stringify(needle)};
      const norm = (s) => String(s || '')
        .replace(/[\\u2014\\u2013\\u2212-]/g, ' ')
        .replace(/\\./g, ' ')
        .replace(/[\\u201C\\u201D]/g, '"')
        .replace(/[\\u2018\\u2019]/g, "'")
        .replace(/\\s+/g, ' ')
        .trim()
        .toLowerCase();
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && /NOVA:chat-thread:chat:/.test(k)) keys.push(k);
      }
      let arr = [];
      let hitKey = null;
      for (const k of keys) {
        try {
          const a = JSON.parse(localStorage.getItem(k) || '[]');
          if (Array.isArray(a) && a.some(m => m?.role === 'user' && norm(m.content).includes(needle))) {
            arr = a; hitKey = k; break;
          }
        } catch { /* ignore */ }
      }
      if (!hitKey) return { userHit: false, generating: false, len: 0, content: '', stop: false, statusLine: null, provider: null };
      const last = arr[arr.length - 1];
      const lastContent = String(last?.content || '');
      const generating = /^__generating__:/i.test(lastContent);
      const assistants = arr.filter(m => m?.role === 'assistant' && !/^__generating__:/i.test(String(m.content || '')));
      const lastAsst = assistants[assistants.length - 1];
      let replyAfter = '';
      for (let i = 0; i < arr.length; i++) {
        const m = arr[i];
        if (m?.role === 'user' && norm(m.content).includes(needle)) {
          for (let j = i + 1; j < arr.length; j++) {
            const a = arr[j];
            if (a?.role === 'assistant' && !/^__generating__:/i.test(String(a.content || ''))) {
              replyAfter = String(a.content || '');
            }
          }
          break;
        }
      }
      const body = document.body?.innerText || '';
      const statusMatch = body.match(/(?:Build:|Fix:|Plan:|Ask:|Tuning |Building |Creating |Using |Coding |Still |Wrote |Preview Ready|Tool loop|Searching |Craft ·|Reading )[^\\n]{0,90}/i);
      const stop = [...document.querySelectorAll('button')].some(b => /stop/i.test((b.getAttribute('aria-label') || b.textContent || '')));
      const content = String(replyAfter || '').trim();
      // Done when THIS ask has a non-generating assistant reply — ignore later turns.
      const replyDone = content.length > 20;
      return {
        len: arr.length,
        generating: replyDone ? false : generating,
        userHit: true,
        stop: replyDone ? false : stop,
        provider: lastAsst?.provider_used || null,
        content,
        statusLine: statusMatch ? statusMatch[0] : null,
      };
    })()`);
    if (snap?.statusLine && snap.statusLine !== lastStatus) {
      lastStatus = snap.statusLine;
      console.log('  …', lastStatus.slice(0, 110));
    }
    // Accept a finished reply even if len didn't grow vs a stale before-count.
    if (
      snap
      && snap.userHit
      && !snap.generating
      && !snap.stop
      && String(snap.content || '').trim().length > 20
    ) {
      await sleep(600);
      return {
        meta: snap.provider || 'ok',
        text: String(snap.content || '').trim(),
        lastStatus,
      };
    }
  }
  return { meta: 'timeout', text: '', lastStatus };
}

function diskReport() {
  const projectsRoot = path.join(process.env.USERPROFILE || '', 'Documents', 'NOVA Projects');
  const candidates = fs.existsSync(projectsRoot)
    ? fs.readdirSync(projectsRoot)
      .filter((n) => new RegExp(`^${PRODUCT}`, 'i').test(n))
      .map((n) => path.join(projectsRoot, n))
      .filter((d) => fs.existsSync(path.join(d, 'src', 'App.tsx')) || fs.existsSync(path.join(d, 'src', 'App.jsx')))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
    : [];
  const diskRoot = candidates[0] || null;
  if (!diskRoot) return { ok: false, root: null, reason: 'no project folder' };
  const appPath = fs.existsSync(path.join(diskRoot, 'src', 'App.tsx'))
    ? path.join(diskRoot, 'src', 'App.tsx')
    : path.join(diskRoot, 'src', 'App.jsx');
  const app = fs.readFileSync(appPath, 'utf8');
  const cssPath = path.join(diskRoot, 'src', 'App.css');
  const css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : '';
  return {
    ok: app.length > 800 && new RegExp(PRODUCT, 'i').test(app),
    root: diskRoot,
    appLen: app.length,
    cssLen: css.length,
    brand: new RegExp(PRODUCT, 'i').test(app),
    snippet: app.slice(0, 220),
  };
}

console.log(`Connected to NOVA — starting a fresh chat (${RUN_TAG}).`);
// If a prior turn is still going, stop it so New Chat is clean.
await evalE(`(() => {
  const stop = [...document.querySelectorAll('button')].find(b =>
    /stop/i.test((b.getAttribute('aria-label') || '') + ' ' + (b.textContent || '')));
  if (stop) stop.click();
  return !!stop;
})()`).catch(() => false);
await sleep(1200);
await clickNewChat();
await sleep(1800);

const turns = [
  {
    role: 'talk',
    text: `hey - i need a tiny personal site for myself. nothing fancy, just something clean i can put online. (${RUN_TAG})`,
  },
  {
    role: 'talk',
    text: `yeah basically my name at the top, a short bio under it, and three links for work, email, and projects. dark charcoal background, soft white text. calm, not neon. (${RUN_TAG})`,
  },
  {
    role: 'build',
    text: `ok build ${PRODUCT} for me - that simple personal homepage. create the project on disk so i can open it in Live when its ready. (${RUN_TAG})`,
  },
];

const results = [];
for (const turn of turns) {
  console.log(`\n→ [${turn.role}] ${turn.text}`);
  const out = await sendAsk(turn.text, {
    timeoutMs: turn.role === 'build' ? 900_000 : 240_000,
  });
  const row = {
    role: turn.role,
    ask: turn.text,
    meta: out.meta,
    lastStatus: out.lastStatus || null,
    preview: String(out.text || '').slice(0, 500),
    len: String(out.text || '').length,
  };
  results.push(row);
  console.log(`  ← ${out.meta} (${row.len} chars)`);
  console.log(`  ${row.preview.slice(0, 180).replace(/\n/g, ' ')}`);
  await sleep(1200);
}

await sleep(2000);
const disk = diskReport();
const report = {
  product: PRODUCT,
  at: new Date().toISOString(),
  results,
  disk,
};
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log('\n—— done ——');
console.log(JSON.stringify({ disk, turns: results.map((r) => ({ role: r.role, meta: r.meta, len: r.len })) }, null, 2));
console.log(`Wrote ${OUT}`);
ws.close();
process.exit(disk.ok ? 0 : 2);
