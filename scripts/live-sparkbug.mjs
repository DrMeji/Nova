/**
 * Live: tiny playable canvas game — Sparkbug (not a website).
 * Env: NOVA_CDP_PORT (default 9229)
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.NOVA_CDP_PORT || 9229);
const OUT = path.join(__dirname, '..', '.tmp-live-sparkbug.json');
const PRODUCT = 'Sparkbug';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
const page = list.find((t) => t.type === 'page' && /localhost:5173|index\.html/i.test(t.url || ''))
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
    expression, returnByValue: true, awaitPromise: true, userGesture: true,
  });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
};

await send('Page.enable');
await send('Runtime.enable');

const ready = await evalE(`(() => document.querySelectorAll('textarea').length > 0)()`);
if (!ready) throw new Error('UI not ready');

await evalE(`(() => {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && /chat-thread|recent-chats|chat-studio|recent-projects|Sparkbug|Saltglass/i.test(k)) localStorage.removeItem(k);
  }
  const raw = localStorage.getItem('NOVA:local-prefs') || '{}';
  const prefs = JSON.parse(raw);
  prefs.agentLoopOnCreate = true;
  prefs.agentLoopEnabled = true;
  prefs.planApproveGate = false;
  prefs.activeChatId = 'qwen25-7b';
  prefs.activeCoderId = 'qwen25-coder-14b';
  prefs.defaultCodeModelId = 'qwen25-coder-14b';
  prefs.activeImageId = 'sd15-local';
  localStorage.setItem('NOVA:local-prefs', JSON.stringify(prefs));
  return true;
})()`);

await send('Page.reload', { ignoreCache: true });
await sleep(4000);

await evalE(`(() => {
  const btns = [...document.querySelectorAll('button, a')];
  const hit = btns.find((b) => /new\\s*chat/i.test((b.textContent || '').toLowerCase()));
  if (hit) hit.click(); else location.hash = '#/chat?new=' + Date.now();
  return true;
})()`);
await sleep(1500);

async function sendAsk(text, timeoutMs) {
  const before = await evalE(`(() => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && /NOVA:chat-thread:chat:/.test(k)) keys.push(k);
    }
    keys.sort();
    const k = keys[keys.length - 1];
    if (!k) return 0;
    try { return JSON.parse(localStorage.getItem(k) || '[]').length; } catch { return 0; }
  })()`);
  await evalE(`(${function setAsk(askText) {
    const ta = document.querySelector('textarea');
    if (!ta) return false;
    const d = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
    d.set.call(ta, askText);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus();
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', which: 13, keyCode: 13, bubbles: true }));
    return true;
  }.toString()})(${JSON.stringify(text)})`);
  const needle = text.slice(0, 32);
  const t0 = Date.now();
  let lastStatus = '';
  while (Date.now() - t0 < timeoutMs) {
    await sleep(3000);
    const snap = await evalE(`(${function snap(needleIn, beforeCount) {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && /NOVA:chat-thread:chat:/.test(k)) keys.push(k);
      }
      keys.sort();
      const k = keys[keys.length - 1];
      let arr = [];
      try { arr = JSON.parse(localStorage.getItem(k) || '[]'); } catch { return null; }
      const last = arr[arr.length - 1];
      const generating = /^__generating__:/i.test(String(last?.content || ''));
      const userHit = arr.some((m) => m?.role === 'user' && String(m.content || '').includes(needleIn));
      const asst = [...arr].reverse().find((m) => m?.role === 'assistant' && !/^__generating__:/i.test(String(m.content || '')));
      const body = document.body?.innerText || '';
      const statusMatch = body.match(/(?:Build:|Craft|Design|Preview Ready|Creating|Writing|Tool|Game|Canvas|Play)[^\\n]{0,100}/i);
      const pill = [...document.querySelectorAll('button')].map((n) => (n.textContent || '').replace(/\\s+/g, ' ').trim())
        .find((t) => /Qwen|Coder|Instruct|UIGEN/i.test(t) && t.length < 64) || null;
      return {
        generating, userHit, grew: arr.length > beforeCount,
        content: asst ? String(asst.content || '') : '',
        provider: asst?.provider_used || asst?.provider || null,
        status: statusMatch ? statusMatch[0] : null,
        pill,
      };
    }.toString()})(${JSON.stringify(needle)}, ${before || 0})`);
    if (snap?.status && snap.status !== lastStatus) {
      lastStatus = snap.status;
      console.log('  …', lastStatus.slice(0, 100), snap.pill ? `· ${snap.pill}` : '');
    }
    if (snap?.userHit && !snap.generating && snap.grew && String(snap.content || '').length > 20) {
      return { meta: snap.provider || 'ok', text: snap.content, lastStatus };
    }
    // Early disk success for playable game
    const disk = diskReport();
    if (disk.ok && Date.now() - t0 > 120000) {
      return { meta: 'disk-ready', text: `Disk Ready ${disk.root}`, lastStatus };
    }
  }
  const d = diskReport();
  if (d.ok) return { meta: 'disk-ready-timeout', text: `Disk Ready ${d.root}`, lastStatus };
  return { meta: 'timeout', text: '', lastStatus };
}

function diskReport() {
  const projectsRoot = path.join(process.env.USERPROFILE || '', 'Documents', 'NOVA Projects');
  const candidates = fs.existsSync(projectsRoot)
    ? fs.readdirSync(projectsRoot).filter((n) => /^Sparkbug/i.test(n))
      .map((n) => path.join(projectsRoot, n))
      .filter((d) => fs.existsSync(path.join(d, 'src', 'App.tsx')) || fs.existsSync(path.join(d, 'src', 'App.jsx')))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
    : [];
  const root = candidates[0] || null;
  if (!root) return { ok: false, root: null };
  const appPath = fs.existsSync(path.join(root, 'src', 'App.tsx'))
    ? path.join(root, 'src', 'App.tsx') : path.join(root, 'src', 'App.jsx');
  const app = fs.readFileSync(appPath, 'utf8');
  const playable = /<canvas\b/i.test(app) && /requestAnimationFrame/i.test(app);
  const hasKeys = /keydown|keyup|addEventListener/i.test(app);
  return {
    ok: playable && hasKeys && app.length > 1200,
    root,
    appLen: app.length,
    playable,
    hasKeys,
    snippet: app.slice(0, 280),
  };
}

console.log('\n→ [build] Sparkbug…');
const out = await sendAsk(
  'ok start building Sparkbug now — a tiny playable browser arcade game on disk. One canvas, keyboard left/right to move a paddle, bounce a ball, break bricks, score HUD, restart button. Not a website landing page. create the project on disk. finished and playable.',
  1_200_000,
);
const disk = diskReport();
const report = {
  product: PRODUCT,
  at: new Date().toISOString(),
  ok: out.meta !== 'timeout' && disk.ok,
  meta: out.meta,
  lastStatus: out.lastStatus,
  preview: String(out.text || '').slice(0, 400),
  disk,
};
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log('\n==== SUMMARY ====');
console.log(JSON.stringify({ ok: report.ok, meta: out.meta, diskOk: disk.ok, playable: disk.playable, appLen: disk.appLen, root: disk.root }, null, 2));
ws.close();
process.exit(report.ok ? 0 : 2);
