/**
 * Continue stepwise edits on the bound noir-gear chat (steps 2–5).
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.NOVA_CDP_PORT || 9245);
const OUT = path.join(__dirname, '..', '.tmp-stepwise-continue.json');

const STEPS = [
  'Under that, add a mechanical keyboard photo and a short tagline about precision and speed.',
  'Add a dark sticky nav with Products, Specs, and Buy. keep the black background.',
];

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Cdp {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 0;
    this.pending = new Map();
  }
  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.once('open', resolve);
      this.ws.once('error', reject);
    });
    this.ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    });
    await this.send('Runtime.enable');
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || 'eval failed');
    return r.result?.value;
  }
  close() { try { this.ws?.close(); } catch { /* */ } }
}

async function findPage() {
  for (let i = 0; i < 30; i++) {
    try {
      const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
      const page = list.find((t) => t.type === 'page' && /localhost:5173/i.test(t.url || ''))
        || list.find((t) => t.type === 'page' && /NOVA/i.test(t.title || ''))
        || list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page?.webSocketDebuggerUrl) return page;
    } catch { /* */ }
    await sleep(400);
  }
  throw new Error('no page');
}

const SEND = (text) => `(() => {
  const t = ${JSON.stringify(text)};
  const ta = document.querySelector('textarea');
  if (!ta) return { ok: false, error: 'no textarea' };
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  setter.call(ta, t);
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  const btn = [...document.querySelectorAll('button')].find((b) =>
    /send|arrow up/i.test(b.getAttribute('aria-label') || '')
  );
  if (btn && !btn.disabled) { btn.click(); return { ok: true, via: 'button' }; }
  ta.focus();
  ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', which: 13, keyCode: 13, bubbles: true }));
  return { ok: true, via: 'enter' };
})()`;

const SNAP = `(() => {
  const body = document.body?.innerText || '';
  const foots = [...body.matchAll(/Responded in [\\d.]+\\s*(?:ms|s)[^\\n]*/gi)].map((m) => m[0]);
  const footer = foots[foots.length - 1] || '';
  const generating = /(?:Thinking|Writing project|Creating folder|Verifying|Updating project|Adding to project)/i.test(body.slice(-900))
    && !/Responded in /i.test(body.slice(-400));
  const bad = /I didn.?t keep that edit|@@@FILE\\s+src\\/|Still missing:/i.test(body.slice(-1800));
  return { footer, generating, bad, tail: body.slice(-900) };
})()`;

async function waitDone(cdp, beforeFooter, maxMs = 120000) {
  const t0 = Date.now();
  let idle = 0;
  while (Date.now() - t0 < maxMs) {
    const s = await cdp.eval(SNAP);
    if (s.generating) { idle = 0; }
    else if (s.footer && s.footer !== beforeFooter) {
      idle += 1;
      if (idle >= 2) return s;
    } else if (!s.generating && /Done\\.|I added|I centered|Files written|sticky nav/i.test(s.tail)) {
      idle += 1;
      if (idle >= 3) return s;
    }
    await sleep(1000);
  }
  return cdp.eval(SNAP);
}

const page = await findPage();
const cdp = new Cdp(page.webSocketDebuggerUrl);
await cdp.connect();
const log = { steps: [], at: new Date().toISOString() };

// Ensure noir-gear chat is open
await cdp.eval(`(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /noir-gear/i.test(x.textContent || ''));
  if (b) b.click();
  return { ok: Boolean(b) };
})()`);
await sleep(700);

for (let i = 0; i < STEPS.length; i++) {
  const before = await cdp.eval(SNAP);
  console.log('\\n=== CONTINUE', i + 1, '===', STEPS[i]);
  console.log('send', await cdp.eval(SEND(STEPS[i])));
  const after = await waitDone(cdp, before.footer, i === 0 ? 90000 : 120000);
  console.log('footer', after.footer);
  console.log('bad', after.bad);
  console.log('tail', (after.tail || '').slice(-350));
  log.steps.push({ step: i + 1, prompt: STEPS[i], footer: after.footer, bad: after.bad, tail: after.tail });
  fs.writeFileSync(OUT, JSON.stringify(log, null, 2));
  if (after.bad) {
    console.error('FAIL');
    cdp.close();
    process.exit(2);
  }
  await sleep(800);
}

console.log('DONE', OUT);
cdp.close();
