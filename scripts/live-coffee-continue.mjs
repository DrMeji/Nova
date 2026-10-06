/**
 * Continue Harbor Roast: copy Unsplash assets, nudge Nova to finish UI + wire images.
 *   $env:NOVA_CDP_PORT=9299; node scripts/live-coffee-continue.mjs
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.NOVA_CDP_PORT || 9299);
const BRAND = 'Harbor Roast';
const SLUG = 'harbor-roast';
const disk = path.join(os.homedir(), 'Documents', 'NOVA Projects', SLUG);
const ASSETS = path.join(__dirname, '..', '.tmp-coffee-assets');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const keepAlive = setInterval(() => {}, 60_000);
process.on('exit', () => clearInterval(keepAlive));
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

if (!fs.existsSync(disk)) throw new Error('missing project ' + disk);

// Copy coffee photos into the project so Nova can reference real files.
const imgDir = path.join(disk, 'public', 'images');
fs.mkdirSync(imgDir, { recursive: true });
for (const name of fs.readdirSync(ASSETS).filter((n) => /\.jpe?g$/i.test(n))) {
  fs.copyFileSync(path.join(ASSETS, name), path.join(imgDir, name));
}
console.log('copied images →', imgDir, fs.readdirSync(imgDir));

const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
const page = list.find((t) => t.type === 'page' && /NOVA/i.test(t.title || '') && /5173/.test(t.url || ''))
  || list.find((t) => t.type === 'page' && /NOVA/i.test(t.title || ''))
  || list.find((t) => t.type === 'page');
if (!page?.webSocketDebuggerUrl) throw new Error('NOVA CDP page missing');

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

// Force font 14
await evalE(`(() => {
  for (const k of Object.keys(localStorage)) {
    if (!/prefs/i.test(k)) continue;
    try {
      const o = JSON.parse(localStorage.getItem(k) || '{}');
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

// Stop a stuck generating turn if any
await evalE(`(() => {
  const btns = [...document.querySelectorAll('button,[role=button]')];
  const stop = btns.find(b => /stop|cancel/i.test((b.getAttribute('aria-label')||'')+' '+(b.textContent||'')));
  if (stop) stop.click();
  return Boolean(stop);
})()`);
await sleep(1500);

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

async function waitReply(needle, maxMs = 480_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    await sleep(3000);
    let snap;
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
            return { generating: true, status: String(last.content || '').slice(0, 120) };
          }
          let asst = null;
          for (let i = userIdx + 1; i < arr.length; i++) {
            if (arr[i]?.role === 'assistant' && !/^__generating__:/i.test(String(arr[i].content || ''))) asst = arr[i];
          }
          if (asst) {
            const ts = Number(asst.createdAt || asst.ts || asst.at || 0);
            if (ts && ts < ${TEST_STARTED_AT} - 2000) continue;
            return { generating: false, content: String(asst.content || ''), provider: asst.provider_used || asst.provider };
          }
        }
        return null;
      })()`);
    } catch {
      await sleep(1500);
      continue;
    }
    if (snap?.generating) {
      process.stdout.write(`\r${(snap.status || '').replace(/^__generating__:/, '').slice(0, 90)}   `);
      continue;
    }
    if (snap?.content && snap.content.length > 30) {
      console.log('\n', (snap.provider || ''), snap.content.slice(0, 400));
      return snap.content;
    }
  }
  throw new Error('reply timeout');
}

async function attachImageFiles(names) {
  const abs = names.map((n) => path.join(ASSETS, n)).filter((p) => fs.existsSync(p));
  await send('Page.setInterceptFileChooserDialog', { enabled: true }).catch(() => {});
  await evalE(`(() => {
    const input = document.querySelector('input[type=file][accept="image/*"]')
      || [...document.querySelectorAll('input[type=file]')].find(i => /image/i.test(i.getAttribute('accept')||''));
    if (input) { input.click(); return true; }
    return false;
  })()`);
  await sleep(400);
  const doc = await send('DOM.getDocument', { depth: 3 });
  const q = await send('DOM.querySelector', {
    nodeId: doc.root.nodeId,
    selector: 'input[type=file][accept="image/*"]',
  });
  if (q?.nodeId) {
    await send('DOM.setFileInputFiles', { nodeId: q.nodeId, files: abs });
    console.log('attached via CDP', abs.map((p) => path.basename(p)));
  } else {
    console.log('no image input node — images already on disk at public/images');
  }
  await sleep(600);
}

// Turn 1: finish the stub into a real coffee site using disk images
const p1 = `Continue editing the bound ${BRAND} project on disk. App.tsx is still a thin stub — replace it with a premium Starbucks-quality coffee website NOW.

Use these real files already in public/images/:
- /images/hero-latte.jpg — hero background
- /images/latte-art.jpg, /images/espresso-pour.jpg, /images/coffee-cup.jpg — drink cards
- /images/beans-bag.jpg — beans product strip
- /images/cafe-interior.jpg — locations / atmosphere section

Requirements:
1) Sticky nav: logo, Menu, Order, Locations, Schedule Pickup (smooth scroll)
2) Full-bleed hero with hero-latte.jpg, CTAs Order now + Schedule pickup (working scroll/anchors)
3) 4 selectable drink cards with selected state; images from public/images
4) Schedule pickup form (name, drink select, time) → shows confirmation on submit
5) Footer SVG icons (Instagram, Map) that render
6) Gear button toggles cream vs espresso theme

Write App.tsx + App.css on disk. Keep Vite working.`;

console.log('=== FINISH UI ===');
await sendChat(p1);
await waitReply(p1.slice(0, 40), 520_000);

// Turn 2: attach + replace hero
console.log('=== REPLACE HERO WITH ATTACHED IMAGE ===');
await attachImageFiles(['cafe-interior.jpg', 'coffee-cup.jpg']);
const p2 = `I attached cafe-interior.jpg and coffee-cup.jpg again. Save/overwrite them into public/images/ if needed, then:
1) Replace the hero background with cafe-interior.jpg
2) Replace the Cold Brew card image with coffee-cup.jpg
3) Verify Order now and Schedule pickup still work
4) Make drink card selection highlight with a brass border
Apply on disk now.`;
await sendChat(p2);
await waitReply(p2.slice(0, 40), 420_000);

// Live verify
console.log('=== LIVE ===');
await evalE(`(() => {
  const els = [...document.querySelectorAll('button,[role=button],a,span')];
  const live = els.find(el => /^Live$/i.test(((el.getAttribute('aria-label')||'')+' '+(el.textContent||'')).trim()));
  if (live) live.click();
  return Boolean(live);
})()`);
await sleep(1500);

const probe = await evalE(`(async () => {
  const api = window.novaDesktop;
  if (!api?.getOrAttachPreview) return { ok:false, error:'no api' };
  try { await api.previewCloseLive?.(); } catch {}
  const attach = await api.getOrAttachPreview(${JSON.stringify(disk)});
  let mounted = null;
  if (attach?.ok && attach?.url && api.previewProbeMounted) {
    mounted = await api.previewProbeMounted({ url: attach.url, title: ${JSON.stringify(BRAND)}, waitMs: 10000 });
  }
  let checks = {};
  if (attach?.url) {
    try {
      const app = await fetch(new URL('/src/App.tsx', attach.url)).then(r => r.ok ? r.text() : '').catch(()=>'');
      const app2 = app || await fetch(new URL('/src/App.jsx', attach.url)).then(r => r.ok ? r.text() : '').catch(()=>'');
      checks = {
        appLen: (app2||'').length,
        hasImages: /\\/images\\/|hero-latte|cafe-interior|backgroundImage|<img/i.test(app2||''),
        hasPickup: /pickup|schedule|Order now/i.test(app2||''),
        hasSelect: /selected|setSelected|useState/i.test(app2||''),
      };
      const imgOk = await fetch(new URL('/images/hero-latte.jpg', attach.url)).then(r => r.status);
      checks.heroStatus = imgOk;
    } catch (e) { checks.error = String(e?.message||e); }
  }
  return { attach, mounted, checks, font: document.documentElement.style.fontSize };
})()`);

console.log(JSON.stringify(probe, null, 2));
const appPath = ['src/App.tsx', 'src/App.jsx'].map((r) => path.join(disk, r)).find((p) => fs.existsSync(p));
const appLen = appPath ? fs.readFileSync(appPath, 'utf8').length : 0;
console.log('disk app', appPath, 'len', appLen);

const ok = Boolean(probe?.mounted?.mounted && appLen > 800 && (probe?.checks?.hasImages || probe?.checks?.heroStatus === 200));
if (!ok) {
  console.error('FAIL continue coffee');
  process.exit(4);
}
console.log('PASS Harbor Roast Live', probe.attach.url, 'sample=', (probe.mounted.sample||'').slice(0,160));
process.exit(0);
