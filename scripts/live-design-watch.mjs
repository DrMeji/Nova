/**
 * Watchable Design Spine live test — design-only homepage (no complex product features).
 * Requires Nova Electron with --remote-debugging-port (NOVA_CDP_PORT).
 *
 *   $env:NOVA_CDP_PORT='9232'; npx tsx --tsconfig tsconfig.app.json scripts/live-design-watch.mjs
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.NOVA_CDP_PORT || 9232);
const OUT = path.join(__dirname, '_design-watch-out.txt');
const ASK = process.env.NOVA_DESIGN_ASK || [
  'Design a premium visual homepage for a skincare brand called Luna.',
  'This is a DESIGN prove-out — prioritize look, atmosphere, type, and composition over product features.',
  'Sticky nav with the brand, full-bleed hero with soft atmosphere, huge brand headline,',
  'one short support line, one primary CTA, then three full-bleed story bands and a quiet footer.',
  'No booking flows, no dashboards, no three.js — CSS atmosphere only.',
  'Skip Plan. Ok start building on disk now.',
].join(' ');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lines = [];
function log(s) {
  const t = `[${new Date().toISOString().slice(11, 19)}] ${s}`;
  console.log(t);
  lines.push(t);
  try { fs.writeFileSync(OUT, lines.join('\n') + '\n'); } catch { /* */ }
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

async function waitCdp(timeoutMs = 180_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
      const page = (list || []).find((t) => t.type === 'page' && /nova/i.test(`${t.title} ${t.url}`))
        || (list || []).find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page;
    } catch { /* retry */ }
    await sleep(1500);
  }
  throw new Error(`CDP not up on ${PORT}`);
}

const page = await waitCdp();
log(`CDP page: ${page.title || page.url}`);
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
log('Hard reload + New Chat…');
await send('Page.reload', { ignoreCache: true });
await sleep(5000);
await evalE(`(() => {
  try {
    for (const k of Object.keys(localStorage)) {
      if (/composer-mode|plan-nudge|active-plan/i.test(k)) localStorage.removeItem(k);
    }
  } catch {}
  window.dispatchEvent(new CustomEvent('NOVA:new-chat'));
  return true;
})()`);
await sleep(2500);

log(`ASK: ${ASK}`);
await evalE(`(() => {
  const ta = document.querySelector('textarea');
  if (!ta) throw new Error('no textarea');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(ta, ${JSON.stringify(ASK)});
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.focus();
  return true;
})()`);
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
await sleep(800);
if (await evalE(`(document.querySelector('textarea')?.value || '').length > 10`)) {
  await evalE(`document.querySelector('textarea')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))`);
}

const t0 = Date.now();
let lastStatus = '';
while (Date.now() - t0 < 420_000) {
  const snap = await evalE(`(() => {
    const body = document.body?.innerText || '';
    const statusEl = document.querySelector('[class*="status"], [aria-live="polite"]');
    const status = (statusEl?.textContent || '').trim().slice(0, 160);
    const stop = [...document.querySelectorAll('button')].some(b => /stop/i.test(b.getAttribute('aria-label') || b.textContent || ''));
    const live = /Live|localhost:\\d+|Preview ready|Design Spine|Design shell/i.test(body);
    const spine = /Design Spine|Design shell ·|marketing-bands/i.test(body);
    const fail = /failed|blocked Ready|could not/i.test(body.slice(-1200));
    const iframe = document.querySelector('iframe');
    return {
      status,
      stop,
      live,
      spine,
      fail,
      hasIframe: !!iframe,
      iframeSrc: iframe?.src || '',
      tail: body.slice(-500),
    };
  })()`);
  if (snap.status && snap.status !== lastStatus) {
    log(`status: ${snap.status}`);
    lastStatus = snap.status;
  }
  if (snap.spine) log('saw Design Spine signal');
  if (snap.hasIframe && snap.iframeSrc) log(`preview iframe: ${snap.iframeSrc}`);
  if (!snap.stop && Date.now() - t0 > 25_000 && (snap.live || snap.hasIframe || snap.fail)) {
    log(snap.fail ? 'ended with fail-ish text' : 'turn looks idle — checking disk/preview');
    break;
  }
  await sleep(2500);
}

// Screenshot for the record
try {
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  if (shot?.data) {
    const png = path.join(__dirname, '_design-watch.png');
    fs.writeFileSync(png, Buffer.from(shot.data, 'base64'));
    log(`screenshot: ${png}`);
  }
} catch (e) {
  log(`screenshot skip: ${e.message || e}`);
}

const final = await evalE(`(() => {
  const body = document.body?.innerText || '';
  return {
    spine: /Design Spine|Design shell/i.test(body),
    live: /Live|localhost:\\d+/i.test(body),
    iframe: document.querySelector('iframe')?.src || '',
    tail: body.slice(-800),
  };
})()`);
log(`FINAL spine=${final.spine} live=${final.live} iframe=${final.iframe || '(none)'}`);
log(`TAIL: ${final.tail}`);
ws.close();
log(`Wrote ${OUT}`);
log('Watch the Nova window — Design Spine should own the Luna homepage look.');
