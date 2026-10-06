/**
 * Live: attach nova pic image1 (+ optional image2) and ask for a simple static site build.
 * Watch the Nova window — CDP drives the chat.
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const PORT = Number(process.env.NOVA_CDP_PORT || 9229);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PIC = path.join(process.env.USERPROFILE || '', 'Pictures', 'nova pic');
const IMG1 = path.join(PIC, 'image1.png');
const IMG2 = path.join(PIC, 'image2.png');
const OUT = path.join(ROOT, 'scripts', '_nova-pic-build-out.txt');
const BOTH = process.env.NOVA_PIC_BOTH === '1';

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
  if (!page?.webSocketDebuggerUrl) throw new Error('No NOVA CDP page on ' + PORT);
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

try { fs.writeFileSync(OUT, `nova-pic-build ${new Date().toISOString()}\n`); } catch { /* ignore */ }
if (!fs.existsSync(IMG1)) throw new Error('missing ' + IMG1);
log('image1', IMG1, fs.statSync(IMG1).size);
if (BOTH && fs.existsSync(IMG2)) log('image2', IMG2, fs.statSync(IMG2).size);

const { ws, evaluate } = await connectPage();

// Prefer Chat nav then New chat
await evaluate(`(() => {
  const els = [...document.querySelectorAll('button,[role=button],a')];
  const chat = els.find(el => (el.getAttribute('aria-label') || '') === 'Chat' || /^Chat$/i.test((el.textContent || '').trim()));
  if (chat) chat.click();
  return true;
})()`);
await sleep(600);
await evaluate(`(() => {
  const btn = [...document.querySelectorAll('button,[role=button],a')].find(b => {
    const t = ((b.getAttribute('aria-label') || '') + ' ' + (b.textContent || '')).trim();
    return /new chat/i.test(t);
  });
  if (btn) btn.click();
  return !!btn;
})()`);
await sleep(1000);

const paths = BOTH && fs.existsSync(IMG2) ? [IMG1, IMG2] : [IMG1];
log('attaching', paths.map((p) => path.basename(p)).join(' + '), '— watch Nova now');
const attach = await evaluate(`(async () => {
  if (typeof window.__novaLiveAttach !== 'function') {
    return { ok: false, error: 'no __novaLiveAttach' };
  }
  return window.__novaLiveAttach(${JSON.stringify(paths)});
})()`);
log('attach', attach);
if (!attach?.ok) throw new Error('attach failed: ' + JSON.stringify(attach));
await sleep(800);

const prompt = [
  'Build a simple static website that matches this screenshot as closely as possible.',
  'Keep it SIMPLE — no working buttons, no backend, no npm install marathon.',
  'One page: dark Vesper-style landing from the image (hero typography, accent green, glow orbs OK as CSS).',
  'If you see a second scroll section in the ask, include a simple features strip + footer.',
  'Static HTML + CSS is perfect. Start building now.',
].join(' ');

const sendRes = await evaluate(`(() => {
  const ta = document.querySelector('textarea[aria-label*="Message"], textarea');
  if (!ta) return { ok: false };
  const text = ${JSON.stringify(prompt)};
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
log('send', sendRes);

const start = Date.now();
let lastLen = -1;
let stableSince = Date.now();
let lastStatus = '';
const baseline = await evaluate(`(document.body?.innerText || '').length`);
let snap = null;
const MAX_MS = 10 * 60 * 1000; // 10 min max as requested
while (Date.now() - start < MAX_MS) {
  try {
    snap = await evaluate(`(() => {
      try {
        const gen = document.body?.innerText || '';
        const stop = [...document.querySelectorAll('button')].some(b =>
          /stop/i.test(b.getAttribute('aria-label') || b.textContent || ''));
        const tail = gen.slice(-2000);
        const busy = /Thinking|Vision|Working|Reading|Building|Writing|Crafting|Create|Live/i.test(tail);
        return {
          len: gen.length,
          stop,
          busy,
          status: '',
          tail: gen.slice(-1800),
        };
      } catch (e) {
        return { len: 0, stop: false, busy: true, status: '', tail: String(e) };
      }
    })()`);
  } catch (e) {
    log('poll_err', String(e?.message || e).slice(0, 160));
    await sleep(2000);
    continue;
  }
  if (snap.status && snap.status !== lastStatus) {
    lastStatus = snap.status;
    log('status', lastStatus);
  }
  if (snap.len !== lastLen) {
    lastLen = snap.len;
    stableSince = Date.now();
  }
  const doneish = /Live|Ready|open.*folder|created|project/i.test(snap.tail || '')
    && !snap.stop
    && !/Building|Writing|Crafting|Vision ·/i.test(snap.tail.slice(-400));
  if (snap.len >= baseline + 120 && Date.now() - stableSince >= 8000 && !snap.stop && (!snap.busy || doneish)) {
    if (doneish || Date.now() - stableSince >= 14000) break;
  }
  await sleep(2000);
}

log('elapsed_s', Math.round((Date.now() - start) / 1000));
log('tail:\\n', snap?.tail);
ws.close();
log('done — watch Nova window for the site');
