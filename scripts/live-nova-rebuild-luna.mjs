/**
 * Drive Nova CDP: rebuild Luna on the existing folder (Nova owns craft).
 *   $env:NOVA_CDP_PORT='9232'; npx tsx --tsconfig tsconfig.app.json scripts/live-nova-rebuild-luna.mjs
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.NOVA_CDP_PORT || 9232);
const OUT = path.join(__dirname, '_nova-rebuild-luna-out.txt');
const ASK = process.env.NOVA_REBUILD_ASK || [
  'Rebuild the UI for Luna on this folder.',
  'Marketing homepage only — CSS atmosphere, no Three.js.',
  'Sticky nav, full-bleed hero, story bands, footer. Start now.',
].join(' ');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lines = [];
function log(s) {
  const t = `[${new Date().toISOString().slice(11, 19)}] ${s}`;
  console.log(t);
  lines.push(t);
  try { fs.writeFileSync(OUT, `${lines.join('\n')}\n`); } catch { /* */ }
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

const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
const page = (list || []).find((t) => t.type === 'page' && /nova/i.test(`${t.title} ${t.url}`))
  || (list || []).find((t) => t.type === 'page');
if (!page?.webSocketDebuggerUrl) throw new Error('No CDP page');
log(`CDP: ${page.title || page.url}`);

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

await send('Page.enable');
await send('Runtime.enable');
// Soft reload so Vite picks up Nova source fixes; keep Luna chat/folder bind.
log('Soft reload for source fixes…');
await send('Page.reload', { ignoreCache: true });
await sleep(6000);

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
while (Date.now() - t0 < 480_000) {
  const snap = await evalE(`(() => {
    const body = document.body?.innerText || '';
    const statusEl = document.querySelector('[aria-live="polite"]');
    const status = (statusEl?.textContent || '').trim().slice(0, 180);
    const stop = [...document.querySelectorAll('button')].some((b) => /stop/i.test(b.getAttribute('aria-label') || b.textContent || ''));
    const live = /Live unlocked|localhost:\\d+|Preview ready|Live evidence/i.test(body);
    const locked = /Live locked/i.test(body);
    const fail = /craft preflight failed|Cannot start building|blocked Ready/i.test(body.slice(-1600));
    const done = /\\bDone\\b/i.test(body.slice(-800));
    const iframe = document.querySelector('iframe');
    const threeFail = /three\\.js|Three\\.js/i.test(body.slice(-1600));
    return { status, stop, live, locked, fail, done, threeFail, iframe: iframe?.src || '', tail: body.slice(-600) };
  })()`);
  if (snap.status && snap.status !== lastStatus) {
    log(`status: ${snap.status}`);
    lastStatus = snap.status;
  }
  if (snap.iframe) log(`iframe: ${snap.iframe}`);
  if (!snap.stop && Date.now() - t0 > 20_000 && (snap.done || snap.live || snap.fail)) {
    log(snap.fail ? 'ended fail-ish' : snap.live ? 'Live unlocked' : 'turn idle');
    break;
  }
  await sleep(2500);
}

try {
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  if (shot?.data) {
    const png = path.join(__dirname, '_nova-rebuild-luna.png');
    fs.writeFileSync(png, Buffer.from(shot.data, 'base64'));
    log(`screenshot: ${png}`);
  }
} catch (e) {
  log(`screenshot skip: ${e.message || e}`);
}

const final = await evalE(`(() => {
  const body = document.body?.innerText || '';
  return {
    live: /Live unlocked|localhost:\\d+/i.test(body),
    locked: /Live locked/i.test(body),
    threeFail: /three\\.js|Three\\.js/i.test(body.slice(-2000)),
    iframe: document.querySelector('iframe')?.src || '',
    tail: body.slice(-900),
  };
})()`);
log(`FINAL live=${final.live} locked=${final.locked} threeFail=${final.threeFail} iframe=${final.iframe || '(none)'}`);
log(`TAIL: ${final.tail}`);
ws.close();
log(`Wrote ${OUT}`);
