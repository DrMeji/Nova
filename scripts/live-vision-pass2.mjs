/**
 * Live pass 2: attach one random pic, ask what's in it (no “don't build” wording).
 * CDP 9229 — Open-NOVA-Build.bat
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const PORT = Number(process.env.NOVA_CDP_PORT || 9229);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX = path.join(process.env.USERPROFILE || '', 'Documents', 'NOVA Projects', '_random-pics');
const OUT = path.join(ROOT, 'scripts', '_vision-pass2-out.txt');
const IMAGE = path.join(FIX, 'mountain-lake.jpg');

function log(...args) {
  const line = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  console.log(line);
  try { fs.appendFileSync(OUT, line + '\n'); } catch { /* ignore */ }
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function connectPage() {
  const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`).catch(() => fetchJson(`http://127.0.0.1:${PORT}/json`));
  const page = (list || []).find((t) => t.type === 'page' && /NOVA/i.test(t.title || ''))
    || (list || []).find((t) => t.type === 'page');
  if (!page?.webSocketDebuggerUrl) throw new Error('No NOVA CDP page');
  log('cdp', page.title, page.url);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  let id = 0;
  const pending = new Map();
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(String(raw)); } catch { return; }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const i = ++id;
    pending.set(i, { resolve, reject });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    });
    if (r?.exceptionDetails) {
      throw new Error(r.exceptionDetails.text || JSON.stringify(r.exceptionDetails));
    }
    return r?.result?.value;
  };
  return { ws, evaluate };
}

try { fs.writeFileSync(OUT, `vision-pass2 ${new Date().toISOString()}\n`); } catch { /* ignore */ }

if (!fs.existsSync(IMAGE) || fs.statSync(IMAGE).size < 2000) {
  throw new Error('missing fixture ' + IMAGE);
}

const { ws, evaluate } = await connectPage();
log('reload for latest vision/layout patches');
await evaluate('location.reload()');
await sleep(4000);

await evaluate(`(() => {
  const btn = [...document.querySelectorAll('button')].find(b =>
    /new chat/i.test(b.getAttribute('aria-label') || '') || /new chat/i.test(b.textContent || '')
  );
  if (btn) btn.click();
  return true;
})()`);
await sleep(900);

const attach = await evaluate(`(async () => {
  if (typeof window.__novaLiveAttach !== 'function') {
    return { ok: false, error: 'no __novaLiveAttach' };
  }
  return window.__novaLiveAttach(${JSON.stringify([IMAGE])});
})()`);
log('attach', attach);
if (!attach?.ok) throw new Error('attach failed: ' + JSON.stringify(attach));
await sleep(700);

const send = await evaluate(`(() => {
  const ta = document.querySelector('textarea[aria-label*="Message"], textarea');
  if (!ta) return { ok: false };
  const text = 'Hey — what is this image? Describe what you see in concrete detail.';
  const desc = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
  ta.focus();
  desc.set.call(ta, text);
  ta.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  const sendBtn = [...document.querySelectorAll('button')].find(b =>
    /send/i.test(b.getAttribute('aria-label') || '')
  );
  if (sendBtn) { sendBtn.click(); return { ok: true, via: 'button' }; }
  ta.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true,
  }));
  return { ok: true, via: 'enter' };
})()`);
log('send', send);

const start = Date.now();
let lastLen = -1;
let stableSince = Date.now();
const baseline = await evaluate(`(document.body?.innerText || '').length`);
let snap = null;
while (Date.now() - start < 200_000) {
  snap = await evaluate(`(() => {
    const gen = document.body?.innerText || '';
    const stop = [...document.querySelectorAll('button')].some(b =>
      /stop/i.test(b.getAttribute('aria-label') || b.textContent || ''));
    const busy = /Thinking…|Vision|Working…|Reading/i.test(gen.slice(-1400));
    const chip = /mountain-lake|cat-portrait|\\.jpg/i.test(gen.slice(0, 2500));
    return { len: gen.length, stop, busy, chip, tail: gen.slice(-1200) };
  })()`);
  if (snap.len !== lastLen) {
    lastLen = snap.len;
    stableSince = Date.now();
  }
  if (snap.len >= baseline + 80 && Date.now() - stableSince >= 4000 && !snap.stop && !snap.busy) break;
  await sleep(1200);
}

log('chipVisible', snap?.chip);
log('tail:\\n', snap?.tail);
const inventCat = /\\b(cat|kitten|whiskers|green eyes|fluffy)\\b/i.test(snap?.tail || '');
const seesLandscape = /\\b(mountain|lake|water|road|snow|landscape|forest|tree|sky)\\b/i.test(snap?.tail || '');
const pitchesBuild = /\\b(we could build|interested in coding|OpenCV|Fabric\\.js|explore a project)\\b/i.test(snap?.tail || '');
log('score', { inventCat, seesLandscape, pitchesBuild });

ws.close();
