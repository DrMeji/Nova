/**
 * One-shot live create: tip calculator via CDP (coding foundation test).
 * Monitors create-job status + chat thread. Requires Nova on CDP 9229.
 *
 *   node scripts/live-create-tip-once.mjs
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import WebSocket from 'ws';

const PORT = Number(process.env.NOVA_CDP_PORT || 9229);
const TAG = Date.now().toString(36).slice(-4);
const BRAND = process.env.NOVA_CREATE_BRAND || `TipLab ${TAG}`;
const SLUG = BRAND.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const PROJECTS = path.join(os.homedir(), 'Documents', 'NOVA Projects');
const TIMEOUT_MS = Number(process.env.NOVA_CREATE_TIMEOUT_MS || 25 * 60_000);
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

function pickNovaPage(list) {
  const pages = (list || []).filter((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!pages.length) return null;
  return pages.find((t) => {
    const u = String(t.url || '');
    const title = String(t.title || '');
    if (/127\.0\.0\.1:\d+|localhost:\d+/i.test(u)) return false;
    return /dist\/index\.html|#\/chat|file:\/\//i.test(u) || /^NOVA\b/i.test(title);
  }) || null;
}

async function waitForCdp(maxMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
      const page = pickNovaPage(list);
      if (page?.webSocketDebuggerUrl) {
        await sleep(2000);
        return page;
      }
    } catch { /* retry */ }
    await sleep(1000);
  }
  throw new Error(`NOVA missing on CDP ${PORT}`);
}

const page = await waitForCdp();
console.log('CDP:', page.title || '', String(page.url || '').slice(0, 80));

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
let id = 0;
const pending = new Map();
ws.on('message', (raw) => {
  let msg;
  try { msg = JSON.parse(String(raw)); } catch { return; }
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

await evalE(`(() => {
  const raw = localStorage.getItem('NOVA:local-prefs');
  const prefs = raw ? JSON.parse(raw) : {};
  prefs.agentLoopOnEdit = true;
  prefs.agentLoopOnCreate = true;
  prefs.agentLoopEnabled = true;
  prefs.planApproveGate = false;
  prefs.prefsVersion = Math.max(15, Number(prefs.prefsVersion) || 0);
  localStorage.setItem('NOVA:local-prefs', JSON.stringify(prefs));
  return prefs.prefsVersion;
})()`);

// Stop any hung turn
await evalE(`(() => {
  const els = [...document.querySelectorAll('button,[role=button]')];
  const stop = els.find(el => /stop|cancel|abort/i.test((el.getAttribute('aria-label') || '') + ' ' + (el.textContent || '')));
  if (stop) stop.click();
  return Boolean(stop);
})()`);
await sleep(800);

await evalE(`(() => {
  const els = [...document.querySelectorAll('button,[role=button],a')];
  const hits = els.filter(el => (el.getAttribute('aria-label') || '') === 'Chat');
  hits.sort((a, b) => (a.textContent || '').length - (b.textContent || '').length);
  if (hits[0]) hits[0].click();
  return Boolean(hits[0]);
})()`);
await sleep(1000);

await evalE(`(() => {
  const els = [...document.querySelectorAll('button,[role=button],a')];
  const hit = els.find(el => /new chat|new conversation/i.test((el.getAttribute('aria-label') || '') + ' ' + (el.textContent || '')));
  if (hit) hit.click();
  return Boolean(hit);
})()`);
await sleep(1200);

const prompt = `Build ${BRAND} on disk now. Tip calculator called ${BRAND}: bill amount number input, tip percent input, show tip dollars and total. No nav rails, no icon bars. Skip Plan. Start building now — create the project files.`;

console.log('=== LIVE TIP CREATE ===');
console.log('Brand:', BRAND);
console.log('Prompt:', prompt);

await evalE(`(() => {
  const ta = document.querySelector('textarea');
  if (!ta) throw new Error('no textarea');
  const d = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
  d.set.call(ta, ${JSON.stringify(prompt)});
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.focus();
  ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', which: 13, keyCode: 13, bubbles: true }));
  return true;
})()`);

const needle = prompt.slice(0, 36);
const t0 = Date.now();
let reply = '';
let lastStatus = '';
let lastJobSig = '';

while (Date.now() - t0 < TIMEOUT_MS) {
  await sleep(4000);
  const snap = await evalE(`(() => {
    const needle = ${JSON.stringify(needle)};
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && /NOVA:chat-thread:chat:/.test(k)) keys.push(k);
    }
    let chat = null;
    for (const k of keys) {
      let arr = [];
      try { arr = JSON.parse(localStorage.getItem(k) || '[]'); } catch { continue; }
      let userIdx = -1;
      for (let i = arr.length - 1; i >= 0; i--) {
        if (arr[i]?.role === 'user' && String(arr[i].content || '').includes(needle)) { userIdx = i; break; }
      }
      if (userIdx < 0) continue;
      const last = arr[arr.length - 1];
      if (last?.role === 'assistant' && /^__generating__:/i.test(String(last.content || ''))) {
        chat = { generating: true, status: String(last.content || '').slice(0, 180), chatId: k.replace(/^.*chat:/, '') };
      } else {
        let asst = null;
        for (let i = userIdx + 1; i < arr.length; i++) {
          if (arr[i]?.role === 'assistant' && !/^__generating__:/i.test(String(arr[i].content || ''))) asst = arr[i];
        }
        if (asst) chat = { generating: false, content: String(asst.content || ''), provider: asst.provider_used || asst.provider, chatId: k.replace(/^.*chat:/, '') };
      }
      if (chat) break;
    }
    let job = null;
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (!k || !/^nova-create-job:/.test(k)) continue;
      try {
        const j = JSON.parse(sessionStorage.getItem(k) || 'null');
        const blob = `${j.name || ''} ${j.path || ''}`;
        if (j && (blob.includes(${JSON.stringify(BRAND)}) || new RegExp(${JSON.stringify(TAG)}, 'i').test(blob) || /tiplab/i.test(blob))) {
          job = {
            name: j.name, status: j.status, stage: j.stage, craftBlocked: j.craftBlocked,
            previewUrl: j.previewUrl, error: j.error, obs: j.lastObservation,
            files: Object.keys(j.files || {}).length, path: j.path,
          };
        }
      } catch {}
    }
    return { chat, job };
  })()`);

  if (snap?.job) {
    const sig = `${snap.job.status}|${snap.job.stage}|${snap.job.files}|${snap.job.obs || ''}|${snap.job.error || ''}`;
    if (sig !== lastJobSig) {
      lastJobSig = sig;
      console.log('job:', JSON.stringify(snap.job));
    }
  }
  if (snap?.chat?.generating) {
    const st = String(snap.chat.status || '').replace(/^__generating__:/, '');
    if (st && st !== lastStatus) {
      lastStatus = st;
      console.log('status:', st.slice(0, 140));
    }
  }
  if (snap?.chat?.content && snap.chat.content.length > 40) {
    reply = snap.chat.content;
    console.log('meta:', snap.chat.provider);
    console.log(reply.slice(0, 900));
    break;
  }
  // Early disk win: App grew past bare scaffold while still generating
  if (snap?.job?.path && snap.job.files >= 9) {
    const appPath = ['src/App.jsx', 'src/App.tsx']
      .map((r) => path.join(snap.job.path, r))
      .find((p) => fs.existsSync(p));
    if (appPath) {
      const app = fs.readFileSync(appPath, 'utf8');
      if (app.length > 400 && /tip|bill|percent|total/i.test(app)) {
        console.log('disk early win:', appPath, 'len=', app.length);
        reply = reply || `(early) tip UI landed while status=${lastStatus}`;
        break;
      }
    }
  }
}

if (!reply) {
  console.error('FAIL: create timed out');
  process.exit(1);
}

const candidates = [];
try {
  for (const name of fs.readdirSync(PROJECTS)) {
    if (new RegExp(TAG, 'i').test(name) || /tiplab|tipwise/i.test(name)) {
      candidates.push(path.join(PROJECTS, name));
    }
  }
} catch { /* ignore */ }
candidates.push(path.join(PROJECTS, SLUG));

const disk = candidates
  .filter((p) => fs.existsSync(p))
  .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];

if (!disk) {
  console.error('FAIL: project folder missing under', PROJECTS);
  process.exit(1);
}

const appPath = ['src/App.jsx', 'src/App.tsx']
  .map((r) => path.join(disk, r))
  .find((p) => fs.existsSync(p));
console.log('disk:', disk);
if (!appPath) {
  console.error('FAIL: no App.jsx/tsx');
  process.exit(1);
}
const app = fs.readFileSync(appPath, 'utf8');
console.log('app:', appPath, 'len=', app.length);
console.log('toolLoopHint:', /tool loop|TOOL:/i.test(reply + lastStatus));

const hasTipUi = /tip|bill|percent|total/i.test(app) && app.length > 400;
const failedClosed = /craft blocked|Cannot start building/i.test(reply) && !hasTipUi;
if (failedClosed) {
  console.error('FAIL: create failed closed');
  process.exit(1);
}
if (!hasTipUi && /Bare Vite mount|root-app/i.test(app)) {
  console.error('FAIL: still bare scaffold — craft/tool loop never wrote tip UI');
  process.exit(1);
}
if (!/export\s+default/i.test(app)) {
  console.error('FAIL: App missing default export');
  process.exit(1);
}
console.log(hasTipUi ? 'PASS live tip create — tip UI on disk' : 'PASS live tip create — project on disk with App');
process.exit(0);
