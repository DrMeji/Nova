/**
 * Direct create → Live DOM verify (no plan). Fresh brand each run.
 *
 *   $env:NOVA_CDP_PORT='9299'; node scripts/live-create-to-live.mjs
 *   $env:NOVA_CREATE_BRAND='Harbor Quill'; node scripts/live-create-to-live.mjs
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import WebSocket from 'ws';

const PORT = Number(process.env.NOVA_CDP_PORT || 9240);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Keep the event loop alive if CDP briefly drops (prevents Node exit 13 / unsettled await).
const keepAlive = setInterval(() => {}, 60_000);
process.on('unhandledRejection', (err) => {
  console.log('unhandledRejection', String(err?.message || err).slice(0, 200));
});
process.on('exit', () => clearInterval(keepAlive));
const MODE = String(process.env.NOVA_CREATE_MODE || 'vite').toLowerCase();
const brandBase = process.env.NOVA_CREATE_BRAND || (MODE === 'static' ? 'QuickNote' : 'Inkspire Desk');
const RUN = Date.now().toString(36).slice(-4);
const BRAND = /\d|[a-z]{3}\d/i.test(brandBase) && process.env.NOVA_CREATE_BRAND
  ? brandBase
  : `${brandBase} ${RUN}`;
const SLUG = BRAND.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const PROJECTS = path.join(os.homedir(), 'Documents', 'NOVA Projects');
const TEST_STARTED_AT = Date.now();

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

function rmrf(p) {
  if (!fs.existsSync(p)) return;
  fs.rmSync(p, { recursive: true, force: true });
}

// Clean prior failed NoteDot* + this brand slug before retry.
for (const name of fs.existsSync(PROJECTS) ? fs.readdirSync(PROJECTS) : []) {
  if (/^notedot/i.test(name) || name.toLowerCase() === SLUG || /^site$/i.test(name) || /^immediately$/i.test(name)) {
    console.log('cleanup:', name);
    try { rmrf(path.join(PROJECTS, name)); } catch (e) {
      console.log('cleanup skip', name, String(e.message || e).slice(0, 80));
    }
  }
}

const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
const page = list.find((t) => t.type === 'page');
if (!page?.webSocketDebuggerUrl) throw new Error(`NOVA missing on CDP ${PORT}`);

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

// New chat
await evalE(`(() => {
  const els = [...document.querySelectorAll('button,[role=button],a')];
  const hits = els.filter(el => (el.getAttribute('aria-label') || '') === 'Chat');
  hits.sort((a, b) => (a.textContent || '').length - (b.textContent || '').length);
  if (hits[0]) hits[0].click();
  return true;
})()`);
await sleep(1500);
await evalE(`(() => {
  const btns = [...document.querySelectorAll('button,[role=button]')];
  const neu = btns.find(b => /new chat|new conversation/i.test((b.getAttribute('aria-label') || '') + ' ' + (b.textContent || '')));
  if (neu) { neu.click(); return 'new'; }
  return 'skip';
})()`);
await sleep(1200);

const prompt = MODE === 'static'
  ? `Create a new website project called ${BRAND} on disk now. Tiny sticky-note page: one title "${BRAND}" and one textarea for the note. Static HTML ok. Skip Plan — build it.`
  : `Create a new website project called ${BRAND} on disk now. Soft paper background, deep ink navy type, warm brass accent. Full-bleed quiet hero with the brand name, one short line about a reading shelf, and a grid of 4 book cards (title + author). Polished single page. Skip Plan — build it.`;

console.log('=== CREATE → LIVE ===');
console.log('Mode:', MODE);
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
let meta = '';
while (Date.now() - t0 < 720_000) {
  await sleep(3000);
  let snap = null;
  try {
    snap = await evalE(`(() => {
    const needle = ${JSON.stringify(needle)};
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && /NOVA:chat-thread:chat:/.test(k)) keys.push(k);
    }
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
        return { generating: true, status: String(last.content || '').slice(0, 140) };
      }
      let asst = null;
      for (let i = userIdx + 1; i < arr.length; i++) {
        if (arr[i]?.role === 'assistant' && !/^__generating__:/i.test(String(arr[i].content || ''))) asst = arr[i];
      }
      if (asst) {
        const ts = Number(asst.createdAt || asst.ts || asst.at || 0);
        // Ignore stale assistant replies from prior runs with the same prompt text.
        if (ts && ts < TEST_STARTED_AT - 5000) continue;
        return { generating: false, content: String(asst.content || ''), provider: asst.provider_used || asst.provider, ts };
      }
    }
    return null;
  })()`);
  } catch (err) {
    console.log('\nCDP eval error (will retry):', String(err.message || err).slice(0, 120));
    await sleep(2000);
    continue;
  }
  if (snap?.generating) {
    process.stdout.write(`\rstatus: ${(snap.status || '').replace(/^__generating__:/, '').slice(0, 90)}   `);
    continue;
  }
  if (snap?.content && snap.content.length > 40) {
    // Ignore mid-flight plan-only replies; wait for Created / setup copy.
    const c = snap.content;
    const looksDone = /Created\s+\*\*|setup did not finish|Live preview verified|Open \*\*Live\*\*|install npm dependencies|Dependencies installed|Live server started/i.test(c);
    // Require our brand name in the reply (or folder evidence) so stale threads don't pass.
    const mentionsBrand = new RegExp(BRAND.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(c)
      || new RegExp(SLUG.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(c);
    if ((!looksDone || !mentionsBrand) && Date.now() - t0 < 600_000) {
      process.stdout.write(`\rwaiting final create reply… ${Math.round((Date.now() - t0) / 1000)}s   `);
      continue;
    }
    if (!mentionsBrand) {
      process.stdout.write(`\rstale reply skipped… ${Math.round((Date.now() - t0) / 1000)}s   `);
      continue;
    }
    reply = c;
    meta = snap.provider || '';
    console.log('\nmeta:', meta);
    console.log(reply.slice(0, 700));
    break;
  }
}
if (!reply) throw new Error('create timed out with no reply');

if (/npm install timed out|Dependencies are not installed yet|setup did not finish/i.test(reply)) {
  console.error('FAIL: create reported install/setup failure');
  process.exit(2);
}

const diskCandidates = fs.existsSync(PROJECTS)
  ? fs.readdirSync(PROJECTS)
    .map((n) => ({ n, p: path.join(PROJECTS, n), t: fs.statSync(path.join(PROJECTS, n)).mtimeMs }))
    .filter((x) => x.n.toLowerCase().includes(SLUG.split('-')[0]) || /inkspire|harbor|quill|library|desk|quicknote|notedot/i.test(x.n))
    .sort((a, b) => b.t - a.t)
  : [];
const disk = diskCandidates[0]?.p
  || [path.join(PROJECTS, SLUG), path.join(PROJECTS, BRAND)].find((p) => fs.existsSync(p));
if (!disk || !fs.existsSync(disk)) {
  console.error('FAIL: project folder missing for', BRAND, SLUG);
  process.exit(3);
}
console.log('disk:', disk);
const hasVite = fs.existsSync(path.join(disk, 'node_modules', 'vite'));
const hasIndex = fs.existsSync(path.join(disk, 'index.html'));
const hasPkg = fs.existsSync(path.join(disk, 'package.json'));
console.log('hasPkg=', hasPkg, 'hasVite=', hasVite, 'hasIndex=', hasIndex);

// Click Live
const liveClick = await evalE(`(() => {
  const els = [...document.querySelectorAll('button,[role=button],a,span')];
  const live = els.find(el => {
    const t = ((el.getAttribute('aria-label') || '') + ' ' + (el.textContent || '')).trim();
    return /^Live$/i.test(t) || /\\bLive\\b/.test(t) && t.length < 20;
  });
  if (!live) return { ok: false, reason: 'no Live control' };
  live.click();
  return { ok: true, label: (live.textContent || '').trim().slice(0, 40) };
})()`);
console.log('Live click:', liveClick);
await sleep(5000);

// Probe preview URL / DOM from Nova + any open preview
const probe = await evalE(`(async () => {
  const api = window.novaDesktop;
  const jobs = [];
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && /createJob|preview/i.test(k)) {
        try { jobs.push({ k, v: sessionStorage.getItem(k)?.slice(0, 200) }); } catch {}
      }
    }
  } catch {}
  let attach = null;
  try {
    if (api?.getOrAttachPreview) {
      attach = await api.getOrAttachPreview(${JSON.stringify(disk)});
    }
  } catch (e) {
    attach = { ok: false, error: String(e?.message || e) };
  }
  let mounted = null;
  if (attach?.ok && attach?.url && api?.previewProbeMounted) {
    mounted = await api.previewProbeMounted({ url: attach.url, title: ${JSON.stringify(BRAND)}, waitMs: 3500 });
  }
  return { attach, mounted, jobs: jobs.slice(0, 8) };
})()`);

console.log('preview probe:', JSON.stringify(probe, null, 2));

const ok = Boolean(
  probe?.attach?.ok
  && probe?.attach?.url
  && (probe?.mounted?.mounted || (probe?.mounted?.ok && String(probe?.mounted?.sample || '').length > 12)),
);

if (!ok) {
  console.error('FAIL: Live did not paint UI');
  process.exit(4);
}

console.log('PASS: Live URL', probe.attach.url);
console.log('sample:', (probe.mounted?.sample || '').slice(0, 160));
process.exit(0);
