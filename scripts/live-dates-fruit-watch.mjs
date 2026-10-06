/**
 * Live watch: Nova builds a fresh dates (fruit) brand site.
 * Cursor does NOT edit the project — only drives chat via CDP and observes.
 *
 *   $env:NOVA_CDP_PORT='9231'; node scripts/live-dates-fruit-watch.mjs
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import WebSocket from 'ws';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.NOVA_CDP_PORT || 9231);
const BUDGET_MS = Number(process.env.NOVA_BUILD_BUDGET_MS || 5 * 60 * 1000); // 5 min
const POLL_MS = 4000;
const PROJECTS = path.join(os.homedir(), 'Documents', 'NOVA Projects');
const OUT = path.join(__dirname, '_live-dates-fruit-out.json');
const LOG = path.join(__dirname, '_live-dates-fruit-out.txt');
const RUN = Date.now().toString(36).slice(-4);
const BRAND = `Sahara Honey Dates ${RUN}`;
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
  if (!fs.existsSync(PROJECTS)) return { folder: null, files: [] };
  const hit = fs.readdirSync(PROJECTS).find((n) => {
    const low = n.toLowerCase();
    return low === SLUG || low.includes('sahara') && low.includes('date') || low.includes(RUN);
  });
  if (!hit) {
    // newest folder mentioning date/dates
    const cands = fs.readdirSync(PROJECTS)
      .filter((n) => /date/i.test(n))
      .map((n) => {
        const p = path.join(PROJECTS, n);
        try { return { n, m: fs.statSync(p).mtimeMs }; } catch { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => b.m - a.m);
    if (!cands[0] || Date.now() - cands[0].m > 20 * 60 * 1000) return { folder: null, files: [] };
    return scanFolder(path.join(PROJECTS, cands[0].n), cands[0].n);
  }
  return scanFolder(path.join(PROJECTS, hit), hit);
}

function scanFolder(root, name) {
  const files = [];
  const walk = (dir, rel = '') => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) {
        if (/node_modules|\.git|\.nova-live/i.test(ent.name)) continue;
        walk(path.join(dir, ent.name), r);
      } else files.push(r);
    }
  };
  try { walk(root); } catch { /* ignore */ }
  let app = '';
  let css = '';
  try { app = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8'); } catch { /* */ }
  try { if (!app) app = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8'); } catch { /* */ }
  try { css = fs.readFileSync(path.join(root, 'src', 'App.css'), 'utf8'); } catch { /* */ }
  return {
    folder: name,
    root,
    files,
    appLen: app.replace(/\s+/g, '').length,
    cssLen: css.replace(/\s+/g, '').length,
    hasHero: /hero|COVER_HREFS|\/heroes\//i.test(app + css),
    phoneColumn: /\.app\b[\s\S]{0,280}justify-content\s*:\s*center/i.test(css)
      && /\.app\b[\s\S]{0,280}align-items\s*:\s*center/i.test(css),
    brandHit: new RegExp(BRAND.split(/\s+/).slice(0, 2).join('|'), 'i').test(app),
  };
}

fs.writeFileSync(LOG, '');
log('\n=== LIVE DATES (FRUIT) BUILD WATCH — Nova only ===\n');
log(`CDP ${PORT} · budget ${BUDGET_MS / 1000}s · brand ${BRAND}`);

let { ws, send, evalE } = await connect();
await send('Page.enable');
await send('Runtime.enable');
try { await send('Page.bringToFront'); } catch { /* ok */ }

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
  `Build a brand-new one-page Vite + React website for ${BRAND} — a premium dried-dates fruit brand (the fruit, not calendar dating).`,
  `Skip Plan. Create the project on disk and Get it Live.`,
  `Full-bleed sticky nav with the brand, Shop, Varieties, Story, Cart.`,
  `Hero must show real date-fruit imagery (use /heroes/ or a real product photo), big brand name, one short line about sun-ripened Medjool and Deglet Noor dates, and a Shop CTA.`,
  `Sections: variety cards (at least 3 cultivars with short tasting notes), a harvest/story band, nutrition or pairing strip, and a footer.`,
  `Warm desert palette — sand, amber, deep date-brown — not purple neon gaming, not a phone-column mid stack.`,
  `No John Doe reviews. No tip calculator. Make it feel like a real specialty-food brand site.`,
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
let sentContinue = false;
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
      const status = (body.match(/(?:Crafting|Coding|Rebuilding|Style|Verify|Preview Ready|Originality|Live|Installing|Scaffold|Writing|Thinking|Reading)[^\\n]{0,80}/gi) || []).slice(-4);
      const pills = [...document.querySelectorAll('button,span,[role=button]')]
        .map(el => (el.textContent || '').trim())
        .filter(t => /^(Code|Live|Plan|Craft|Files)/i.test(t) || /Files\\s*Changed/i.test(t))
        .slice(0, 8);
      const liveBtn = [...document.querySelectorAll('button,[role=button]')].find(b =>
        /^Live$/i.test((b.textContent || '').trim()) || /get it live/i.test(b.textContent || '')
      );
      const liveOn = liveBtn ? (liveBtn.getAttribute('aria-pressed') === 'true'
        || /sky|emerald|active/i.test(liveBtn.className || '')) : false;
      const folder = (body.match(/NOVA Projects\\\\[^\\n]+|Documents\\\\NOVA Projects\\\\[^\\n]+/i) || [])[0] || null;
      const fail = /Failed at:|UI polish|couldn't|did not clear|Preview Ready/i.test(body.slice(-2500));
      const done = /\\nDone\\n/i.test(body.slice(-1200)) && !stop;
      const replyTail = body.replace(/\\s+/g, ' ').slice(-420);
      return { stop, status, pills, liveOn, folder, fail, done, replyTail };
    })()`);
  } catch (e) {
    log(`[${elapsed}s] CDP blip: ${String(e.message || e).slice(0, 120)}`);
    await sleep(1500);
    try {
      ws.close();
      ({ ws, send, evalE } = await connect());
      await send('Page.enable');
      await send('Runtime.enable');
    } catch { /* retry loop */ }
    continue;
  }

  const disk = scanDisk();
  const sig = JSON.stringify({
    stop: ui.stop,
    status: ui.status,
    pills: ui.pills,
    folder: disk.folder,
    appLen: disk.appLen,
    liveOn: ui.liveOn,
  });
  if (sig !== lastSig) {
    lastSig = sig;
    const note = `[${elapsed}s] stop=${ui.stop} live=${ui.liveOn} folder=${disk.folder || '—'} app=${disk.appLen || 0} css=${disk.cssLen || 0} status=${(ui.status || []).join(' · ') || '—'}`;
    log(note);
    timeline.push({
      t: elapsed,
      stop: ui.stop,
      liveOn: ui.liveOn,
      status: ui.status,
      pills: ui.pills,
      disk,
      replyTail: ui.replyTail,
    });
  }

  // Success-ish: folder with real App and turn finished
  if (disk.folder && disk.appLen >= 900 && !ui.stop && elapsed > 25) {
    if (ui.liveOn || disk.hasHero) {
      log(`[${elapsed}s] Looking good — App on disk (${disk.appLen} chars), hero=${disk.hasHero}, phoneColumn=${disk.phoneColumn}`);
      // Give Live a short chance if not on yet
      if (!ui.liveOn && !sentLiveNudge && elapsed > 40) {
        sentLiveNudge = true;
        log('One nudge: Get it Live');
        await typeAndSend('Get it Live now — open the preview for this dates site. Do not rebuild from scratch.');
      } else if (ui.liveOn || elapsed > 90) {
        break;
      }
    }
  }

  // Soft continue once if stalled with no files after ~90s
  if (!disk.folder && !ui.stop && elapsed > 90 && !sentContinue) {
    sentContinue = true;
    log('Stalled with no folder — one continue nudge');
    await typeAndSend(`Please continue — create ${BRAND} on disk and keep building the dates fruit website. Skip Plan.`);
  }

  if (ui.fail && disk.folder && disk.appLen >= 900 && !ui.stop && elapsed > 60) {
    log(`[${elapsed}s] UI reported a fail note but files exist — stopping watch to inspect.`);
    break;
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
  ok: Boolean(finalDisk.folder && finalDisk.appLen >= 800 && !finalDisk.phoneColumn),
};
fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));
log(`\n=== DONE ok=${summary.ok} folder=${finalDisk.folder || 'none'} appLen=${finalDisk.appLen || 0} phoneColumn=${finalDisk.phoneColumn} → ${OUT} ===\n`);
try { ws.close(); } catch { /* */ }
process.exit(summary.ok ? 0 : 1);
