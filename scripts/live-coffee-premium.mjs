/**
 * Live coffee-site create → attach Unsplash images → edit → Live verify.
 * Watch the NOVA window while this runs.
 *
 *   $env:NOVA_CDP_PORT='9299'; node scripts/live-coffee-premium.mjs
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.NOVA_CDP_PORT || 9299);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BRAND = process.env.NOVA_COFFEE_BRAND || 'Harbor Roast';
const SLUG = BRAND.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const PROJECTS = path.join(os.homedir(), 'Documents', 'NOVA Projects');
const ASSETS = path.join(__dirname, '..', '.tmp-coffee-assets');
const TEST_STARTED_AT = Date.now();
const keepAlive = setInterval(() => {}, 60_000);
process.on('exit', () => clearInterval(keepAlive));

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
  return list.find((t) => t.type === 'page' && /NOVA/i.test(t.title || '') && /5173/.test(t.url || ''))
    || list.find((t) => t.type === 'page' && /NOVA/i.test(t.title || ''))
    || list.find((t) => t.type === 'page');
}

async function waitCdp(ms = 90000) {
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

const list = await waitCdp();
const page = pickNovaPage(list);
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

// Force Appearance font to 14 for this session (and persist prefs).
await evalE(`(() => {
  try {
    const raw = localStorage.getItem('NOVA:local-prefs') || localStorage.getItem('nova:local-prefs');
    // Also poke common key patterns.
    for (const k of Object.keys(localStorage)) {
      if (!/prefs/i.test(k)) continue;
      try {
        const o = JSON.parse(localStorage.getItem(k) || '{}');
        if (o && typeof o === 'object' && ('fontSizePx' in o || 'prefsVersion' in o)) {
          o.fontSizePx = 14;
          o.prefsVersion = Math.max(5, Number(o.prefsVersion) || 5);
          localStorage.setItem(k, JSON.stringify(o));
        }
      } catch {}
    }
    document.documentElement.style.fontSize = '14px';
    window.dispatchEvent(new Event('nova:prefs-changed'));
  } catch {}
  return document.documentElement.style.fontSize;
})()`);

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

const createPrompt = `Create a new website project called ${BRAND} on disk now. Premium specialty coffee brand — Starbucks-quality polish, not a toy page.

Must include:
1) Sticky nav with logo, Menu, Order, Locations, Schedule Pickup
2) Full-bleed hero with dark espresso tones, cream type, one CTA "Order now" and one CTA "Schedule pickup" — both must be real clickable buttons (scroll/section jump or open a pickup form)
3) Drink menu grid with at least 4 drinks (Latte, Espresso, Cold Brew, Cappuccino) — each card clickable / selectable with a selected state
4) Coffee beans / bag product strip
5) Locations + hours section
6) Schedule pickup form (name, drink, time, submit) that shows a confirmation message when submitted
7) Footer with social icons that are visible SVG icons (not broken empty boxes)

Warm wood, cream, deep espresso, soft brass accents. Editorial typography. Skip Plan — build it now.`;

console.log('=== COFFEE CREATE ===');
console.log('Brand:', BRAND);
console.log('Watch NOVA…');

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

await sendChat(createPrompt);

async function waitReply(needle, opts = {}) {
  const maxMs = opts.maxMs || 720_000;
  const brandRe = new RegExp(String(opts.brand || BRAND).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
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
            if (ts && ts < ${TEST_STARTED_AT} - 5000) continue;
            return { generating: false, content: String(asst.content || ''), provider: asst.provider_used || asst.provider };
          }
        }
        return null;
      })()`);
    } catch (err) {
      console.log('CDP retry', String(err.message || err).slice(0, 100));
      await sleep(2000);
      continue;
    }
    if (snap?.generating) {
      process.stdout.write(`\rstatus: ${(snap.status || '').replace(/^__generating__:/, '').slice(0, 90)}   `);
      continue;
    }
    if (snap?.content && snap.content.length > 40) {
      const c = snap.content;
      if (opts.requireCreateDone) {
        const looksDone = /Created\s+\*\*|setup did not finish|Live preview verified|Open \*\*Live\*\*|Dependencies installed|Live server started/i.test(c);
        if (!looksDone || !brandRe.test(c)) {
          process.stdout.write(`\rwaiting create… ${Math.round((Date.now() - t0) / 1000)}s   `);
          continue;
        }
      }
      console.log('\nmeta:', snap.provider || '');
      console.log(c.slice(0, 500));
      return c;
    }
  }
  throw new Error('reply timeout');
}

const createReply = await waitReply(createPrompt.slice(0, 40), { requireCreateDone: true });
if (/npm install timed out|Dependencies are not installed yet|setup did not finish/i.test(createReply)) {
  console.error('FAIL: create setup incomplete');
  process.exit(2);
}

const diskCandidates = fs.existsSync(PROJECTS)
  ? fs.readdirSync(PROJECTS)
    .map((n) => ({ n, p: path.join(PROJECTS, n), t: fs.statSync(path.join(PROJECTS, n)).mtimeMs }))
    .filter((x) => x.n.toLowerCase().includes(SLUG.split('-')[0]) || /harbor|roast|coffee|cedar|moss/i.test(x.n))
    .sort((a, b) => b.t - a.t)
  : [];
const disk = diskCandidates[0]?.p || path.join(PROJECTS, SLUG);
if (!fs.existsSync(disk)) {
  console.error('FAIL: project missing', SLUG);
  process.exit(3);
}
console.log('disk:', disk);

// Open Live early so user can watch
await evalE(`(() => {
  const els = [...document.querySelectorAll('button,[role=button],a,span')];
  const live = els.find(el => /^Live$/i.test(((el.getAttribute('aria-label') || '') + ' ' + (el.textContent || '')).trim()) || (/\\bLive\\b/.test((el.textContent||'')) && (el.textContent||'').trim().length < 12));
  if (live) live.click();
  return Boolean(live);
})()`);
await sleep(2000);

async function attachImages(fileNames) {
  const absPaths = [];
  for (const name of fileNames) {
    const fp = path.join(ASSETS, name);
    if (!fs.existsSync(fp)) {
      console.warn('missing asset', name);
      continue;
    }
    absPaths.push(fp);
  }
  if (!absPaths.length) throw new Error('no image assets');

  // Prefer native CDP file chooser → input[type=file]
  await send('Page.setInterceptFileChooserDialog', { enabled: true }).catch(() => {});
  const clickRes = await evalE(`(() => {
    const inputs = [...document.querySelectorAll('input[type=file]')];
    const imgInput = inputs.find(i => /image/i.test(i.getAttribute('accept') || '')) || inputs[0];
    if (imgInput) {
      imgInput.click();
      return { ok: true, via: 'input', accept: imgInput.getAttribute('accept') || '' };
    }
    const btns = [...document.querySelectorAll('button,[role=button],label')];
    const attach = btns.find(b => /attach|photo|image|upload|paperclip|\\+/i.test((b.getAttribute('aria-label') || '') + ' ' + (b.textContent || '')));
    if (attach) { attach.click(); return { ok: true, via: 'button' }; }
    return { ok: false };
  })()`);
  console.log('file chooser click', clickRes);

  // Listen briefly for fileChooserOpened
  let chooser = null;
  const chooserWait = new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 2500);
    const onMsg = (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        if (msg.method === 'Page.fileChooserOpened') {
          clearTimeout(timer);
          ws.off('message', onMsg);
          resolve(msg.params);
        }
      } catch { /* ignore */ }
    };
    ws.on('message', onMsg);
  });
  chooser = await chooserWait;

  if (chooser?.backendNodeId || chooser?.objectId) {
    const params = { files: absPaths };
    if (chooser.backendNodeId) params.backendNodeId = chooser.backendNodeId;
    if (chooser.objectId) params.objectId = chooser.objectId;
    await send('DOM.setFileInputFiles', params);
    console.log('setFileInputFiles via chooser', absPaths.length);
  } else {
    // Fallback: find input node and set files directly
    const doc = await send('DOM.getDocument', { depth: 2 });
    const search = await send('DOM.querySelectorAll', {
      nodeId: doc.root.nodeId,
      selector: 'input[type=file]',
    });
    const nodeIds = search.nodeIds || [];
    if (nodeIds[0]) {
      await send('DOM.setFileInputFiles', { files: absPaths, nodeId: nodeIds[0] });
      console.log('setFileInputFiles via node', absPaths.length);
    } else {
      // Last resort: inject data URLs into pending strip via paste-like drop
      const payloads = absPaths.map((fp) => {
        const buf = fs.readFileSync(fp);
        return {
          name: path.basename(fp),
          mime: fp.endsWith('.png') ? 'image/png' : 'image/jpeg',
          b64: buf.toString('base64'),
        };
      });
      const result = await evalE(`(async () => {
        const items = ${JSON.stringify(payloads)};
        const files = [];
        for (const it of items) {
          const bin = atob(it.b64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          files.push(new File([bytes], it.name, { type: it.mime }));
        }
        const dt = new DataTransfer();
        for (const f of files) dt.items.add(f);
        const ta = document.querySelector('textarea');
        const zone = ta?.closest('form') || ta?.parentElement || document.body;
        zone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
        const input = document.querySelector('input[type=file]');
        if (input) {
          try {
            input.files = dt.files;
            input.dispatchEvent(new Event('change', { bubbles: true }));
          } catch {}
        }
        return { count: files.length, thumbs: document.querySelectorAll('img[src^=\"data:image\"]').length };
      })()`);
      console.log('drop fallback', result);
    }
  }
  await sleep(800);
  const thumbs = await evalE(`document.querySelectorAll('img[src^="data:image"]').length`);
  console.log('pending thumbs', thumbs);
  return { paths: absPaths.length, thumbs };
}

// Attach hero + drinks + beans
console.log('=== ATTACH IMAGES ===');
await attachImages(['hero-latte.jpg', 'latte-art.jpg', 'espresso-pour.jpg', 'beans-bag.jpg']);
await sleep(1500);

const imgPrompt1 = `I attached coffee photos. Save them into the ${BRAND} project as real image files under public/images/ (hero-latte.jpg, latte-art.jpg, espresso-pour.jpg, beans-bag.jpg). Then:
1) Use hero-latte.jpg as the hero background (full-bleed)
2) Use latte-art.jpg and espresso-pour.jpg on two drink menu cards
3) Use beans-bag.jpg in the beans/product strip
4) Keep Order now / Schedule pickup buttons working
Apply the edits on disk now.`;
await sendChat(imgPrompt1);
await waitReply(imgPrompt1.slice(0, 36), { maxMs: 420_000 });

console.log('=== REPLACE + ICONS ===');
await attachImages(['cafe-interior.jpg', 'coffee-cup.jpg']);
await sleep(1200);
const imgPrompt2 = `I attached two more images (cafe-interior.jpg, coffee-cup.jpg). Save them under public/images/ and:
1) Replace the current hero background with cafe-interior.jpg
2) Put coffee-cup.jpg on the Cold Brew drink card (replace whatever image is there)
3) Make sure footer social icons are real inline SVGs (Instagram, X/Twitter, Map pin) and clickable
4) Add a working Settings / Preferences mini panel (or gear button) that toggles light cream vs dark espresso theme
Apply on disk now.`;
await sendChat(imgPrompt2);
await waitReply(imgPrompt2.slice(0, 36), { maxMs: 420_000 });

console.log('=== LIVE VERIFY ===');
const probe = await evalE(`(async () => {
  const api = window.novaDesktop;
  if (!api?.getOrAttachPreview) return { ok: false, error: 'no api' };
  try { await api.previewCloseLive?.(); } catch {}
  const attach = await api.getOrAttachPreview(${JSON.stringify(disk)});
  let mounted = null;
  if (attach?.ok && attach?.url && api.previewProbeMounted) {
    mounted = await api.previewProbeMounted({ url: attach.url, title: ${JSON.stringify(BRAND)}, waitMs: 10000 });
  }
  let pageCheck = null;
  if (attach?.url) {
    try {
      const html = await fetch(attach.url).then(r => r.text());
      pageCheck = {
        hasImg: /<img|background-image|url\\(/i.test(html),
        hasButton: /<button|Order|Pickup|Schedule/i.test(html),
        len: html.length,
      };
      // Probe App source on disk via fetch of module
      const appUrls = ['/src/App.tsx', '/src/App.jsx'];
      for (const u of appUrls) {
        const body = await fetch(new URL(u, attach.url)).then(r => r.ok ? r.text() : '').catch(() => '');
        if (body && body.length > 50) {
          pageCheck.appHasImg = /images\\/|unsplash|backgroundImage|<img/i.test(body);
          pageCheck.appHasPickup = /pickup|schedule|order/i.test(body);
          pageCheck.appLen = body.length;
          break;
        }
      }
    } catch (e) {
      pageCheck = { error: String(e?.message || e) };
    }
  }
  return { attach, mounted, pageCheck };
})()`);

console.log(JSON.stringify(probe, null, 2));

const publicDir = path.join(disk, 'public', 'images');
const saved = fs.existsSync(publicDir) ? fs.readdirSync(publicDir) : [];
console.log('public/images:', saved);

const ok = Boolean(
  probe?.attach?.ok
  && probe?.mounted?.mounted
  && (saved.length >= 1 || probe?.pageCheck?.appHasImg || probe?.pageCheck?.hasImg),
);

if (!ok) {
  console.error('FAIL: Live/images incomplete');
  process.exit(4);
}

console.log('PASS coffee Live', probe.attach.url, 'sample=', (probe.mounted.sample || '').slice(0, 160));
process.exit(0);
