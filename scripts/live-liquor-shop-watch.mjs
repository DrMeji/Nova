/**
 * Live watch: Nova builds a fresh liquor bottle shop with cart + purchase.
 * Cursor does NOT edit the project — only drives chat via CDP and observes.
 *
 *   $env:NOVA_CDP_PORT='9231'; node scripts/live-liquor-shop-watch.mjs
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import WebSocket from 'ws';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.NOVA_CDP_PORT || 9231);
const BUDGET_MS = Number(process.env.NOVA_BUILD_BUDGET_MS || 8 * 60 * 1000);
const POLL_MS = 4000;
const PROJECTS = path.join(os.homedir(), 'Documents', 'NOVA Projects');
const OUT = path.join(__dirname, '_live-liquor-shop-out.json');
const LOG = path.join(__dirname, '_live-liquor-shop-out.txt');
const RUN = Date.now().toString(36).slice(-4);
const BRAND = `Nightport Spirits ${RUN}`;
const SLUG = BRAND.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const keepAlive = setInterval(() => {}, 60_000);
process.on('exit', () => clearInterval(keepAlive));

function log(...args) {
  const line = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  console.log(line);
  fs.appendFileSync(LOG, `${line}\n`);
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

async function connect() {
  const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
  const page = list.find((t) => t.type === 'page' && /localhost:5173/i.test(t.url || ''))
    || list.find((t) => t.type === 'page');
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
      expression, returnByValue: true, awaitPromise: true, userGesture: true,
    });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result?.value;
  };
  return { ws, send, evalE };
}

function scanDisk() {
  if (!fs.existsSync(PROJECTS)) return { folder: null };
  const names = fs.readdirSync(PROJECTS);
  const hit = names.find((n) => {
    const low = n.toLowerCase();
    return low === SLUG || low.includes(RUN) || (low.includes('nightport') && low.includes('spirit'));
  });
  const pick = hit || names
    .filter((n) => /spirit|liquor|nightport|whiskey|bottle/i.test(n))
    .map((n) => {
      try { return { n, m: fs.statSync(path.join(PROJECTS, n)).mtimeMs }; } catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => b.m - a.m)
    .find((c) => Date.now() - c.m < 25 * 60 * 1000)?.n;
  if (!pick) return { folder: null };
  return scanFolder(path.join(PROJECTS, pick), pick);
}

function scanFolder(root, name) {
  let app = '';
  let css = '';
  try { app = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8'); } catch { /* */ }
  try { if (!app) app = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8'); } catch { /* */ }
  try { css = fs.readFileSync(path.join(root, 'src', 'App.css'), 'utf8'); } catch { /* */ }
  const phoneColumn = /\.app\b[\s\S]{0,280}justify-content\s*:\s*center/i.test(css)
    && /\.app\b[\s\S]{0,280}align-items\s*:\s*center/i.test(css);
  return {
    folder: name,
    root,
    appLen: app.replace(/\s+/g, '').length,
    cssLen: css.replace(/\s+/g, '').length,
    hasCart: /\bcart\b|addToCart|add-to-cart|setCart/i.test(app),
    hasPurchase: /\bpurchase\b|checkout|Order placed/i.test(app),
    bookingStub: /ready when you are|Browse what is open|Core["']/i.test(app),
    phoneColumn,
    hasFoot: /<footer\b|className=["'][^"']*\bfoot/i.test(app),
    hasHero: /hero-photo|\/heroes\//i.test(app + css),
  };
}

fs.writeFileSync(LOG, '');
log('\n=== LIVE LIQUOR SHOP BUILD WATCH — Nova only ===\n');
log(`CDP ${PORT} · budget ${BUDGET_MS / 1000}s · brand ${BRAND}`);

let { ws, send, evalE } = await connect();
await send('Page.enable');
await send('Runtime.enable');
try { await send('Page.bringToFront'); } catch { /* ok */ }

log('Reload Nova (pick up commerce floor)…');
await send('Page.reload', { ignoreCache: true });
await sleep(3500);
({ ws, send, evalE } = await connect());
await send('Page.enable');
await send('Runtime.enable');

log('New chat…');
await evalE(`(() => {
  try {
    for (const k of Object.keys(localStorage)) {
      if (/composer-mode|plan-nudge|active-plan/i.test(k)) localStorage.removeItem(k);
    }
  } catch {}
  window.dispatchEvent(new CustomEvent('NOVA:new-chat'));
  return true;
})()`);
await sleep(2200);

const PROMPT = [
  `Build a brand-new one-page Vite + React liquor bottle-shop website for ${BRAND}.`,
  `Skip Plan. Create the project on disk and Get it Live.`,
  `This is an online liquor store: sticky nav with Shop + Cart, full-bleed hero, a product grid of at least 5 spirits (bourbon, rye, mezcal, gin, rum or vodka) with prices,`,
  `Add to cart buttons, a cart drawer that updates quantities, and a Purchase / checkout form (demo only — no real payments).`,
  `Warm amber / dark bar palette. Professional bottle-shop look — not a tip calculator, not a booking Core/Day/Reserve stub, not a phone-column mid stack.`,
  `Include a short story band and a real footer. 21+ note in the footer.`,
].join(' ');

log('ASK:', PROMPT);

async function typeAndSend(ask) {
  const askLit = JSON.stringify(ask);
  await evalE(`(() => {
    const ta = document.querySelector('textarea');
    if (!ta) throw new Error('no textarea');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    setter?.call(ta, ${askLit});
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus();
    return true;
  })()`);
  await sleep(400);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await sleep(500);
  if (await evalE(`(document.querySelector('textarea')?.value || '').length > 8`)) {
    await evalE(`document.querySelector('textarea')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))`);
  }
}

await typeAndSend(PROMPT);
const t0 = Date.now();
let lastSig = '';
let sentLiveNudge = false;
const timeline = [];

while (Date.now() - t0 < BUDGET_MS) {
  const elapsed = Math.round((Date.now() - t0) / 1000);
  let ui = null;
  try {
    ui = await evalE(`(() => {
      const stop = [...document.querySelectorAll('button')].some(b =>
        /stop generating/i.test(b.getAttribute('aria-label') || b.title || '')
      );
      const body = document.body?.innerText || '';
      const status = (body.match(/(?:Crafting|Coding|Rebuilding|Style|Verify|Preview Ready|Originality|Live|Installing|Scaffold|Writing|Thinking|Healing|Materializing|Product|floor|polish|Failed|Cart)[^\\n]{0,90}/gi) || []).slice(-5);
      const liveBtn = [...document.querySelectorAll('button,[role=button]')].find(b =>
        /^Live$/i.test((b.textContent || '').trim()) || /get it live/i.test(b.textContent || '')
      );
      const liveOn = liveBtn ? (liveBtn.getAttribute('aria-pressed') === 'true'
        || /sky|emerald|active/i.test(liveBtn.className || '')) : false;
      const polishFail = /Failed at:\\s*UI polish/i.test(body);
      const floor = /marketing floor|commerce|Product marketing|structure heal|continuing to Live/i.test(body);
      const replyTail = body.replace(/\\s+/g, ' ').slice(-420);
      return { stop, status, liveOn, polishFail, floor, replyTail };
    })()`);
  } catch (e) {
    log(`[${elapsed}s] CDP blip: ${String(e.message || e).slice(0, 120)}`);
    await sleep(1500);
    try {
      ws.close();
      ({ ws, send, evalE } = await connect());
      await send('Page.enable');
      await send('Runtime.enable');
    } catch { /* retry */ }
    continue;
  }

  const disk = scanDisk();
  const sig = JSON.stringify({
    stop: ui.stop, liveOn: ui.liveOn, polishFail: ui.polishFail, floor: ui.floor,
    folder: disk.folder, appLen: disk.appLen, hasCart: disk.hasCart, status: ui.status,
  });
  if (sig !== lastSig) {
    lastSig = sig;
    log(`[${elapsed}s] stop=${ui.stop} live=${ui.liveOn} polishFail=${ui.polishFail} floor=${ui.floor} folder=${disk.folder || '—'} app=${disk.appLen || 0} cart=${disk.hasCart} bookingStub=${disk.bookingStub} · ${(ui.status || []).join(' · ')}`);
    timeline.push({ t: elapsed, ui, disk });
  }

  if (disk.folder && disk.appLen >= 1200 && disk.hasCart && !disk.bookingStub && !ui.stop && elapsed > 40) {
    if (!ui.liveOn && !sentLiveNudge && elapsed > 70) {
      sentLiveNudge = true;
      log('One nudge: Get it Live');
      await typeAndSend('Get it Live now for this liquor shop. Do not rebuild from scratch — keep the cart and checkout.');
    } else if (ui.liveOn || (elapsed > 120 && disk.hasPurchase)) {
      log(`[${elapsed}s] Looking good — cart shop on disk.`);
      break;
    }
  }

  if (ui.polishFail && disk.folder && disk.appLen >= 900 && !ui.stop && elapsed > 70) {
    log(`[${elapsed}s] Polish fail noted — stopping to inspect.`);
    break;
  }

  if (!ui.stop && elapsed > 25 && disk.folder && disk.appLen >= 1500) {
    // settled
    if (ui.liveOn || disk.hasCart) break;
  }

  await sleep(POLL_MS);
}

const finalDisk = scanDisk();
const summary = {
  at: new Date().toISOString(),
  brand: BRAND,
  slug: SLUG,
  budgetSec: BUDGET_MS / 1000,
  elapsedSec: Math.round((Date.now() - t0) / 1000),
  disk: finalDisk,
  timeline,
  ok: Boolean(
    finalDisk.folder
    && finalDisk.appLen >= 1200
    && finalDisk.hasCart
    && finalDisk.hasPurchase
    && !finalDisk.bookingStub
    && !finalDisk.phoneColumn
  ),
};
fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));
log(`\n=== DONE ok=${summary.ok} folder=${finalDisk.folder || 'none'} cart=${finalDisk.hasCart} purchase=${finalDisk.hasPurchase} bookingStub=${finalDisk.bookingStub} phone=${finalDisk.phoneColumn} → ${OUT} ===\n`);
try { ws.close(); } catch { /* */ }
process.exit(summary.ok ? 0 : 1);
