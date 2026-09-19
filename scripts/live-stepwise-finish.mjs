/**
 * Clear stuck Coding… / queue on Nova main page, then send remaining steps one-by-one.
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.NOVA_CDP_PORT || 9245);
const OUT = path.join(__dirname, '..', '.tmp-stepwise-finish.json');

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
    this.ws = null;
    this.id = 0;
    this.pending = new Map();
    this.wsUrl = wsUrl;
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
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || 'eval');
    return r.result?.value;
  }
  close() { try { this.ws.close(); } catch { /* */ } }
}

async function findNovaPage() {
  const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
  return list.find((t) => t.type === 'page' && /localhost:5173/i.test(t.url || ''))
    || list.find((t) => t.type === 'page' && /NOVA/i.test(t.title || ''));
}

const SNAP = `(() => {
  const body = document.body?.innerText || '';
  const foots = [...body.matchAll(/Responded in [\\d.]+\\s*(?:ms|s)[^\\n]*/gi)].map((m) => m[0]);
  const footer = foots[foots.length - 1] || '';
  const generating = /Coding…|Code\\s*·\\s*writing|Thinking|Writing project|Updating project|Adding to project|messages queued/i.test(body.slice(-1200));
  const bad = /I didn.?t keep that edit|Still missing:|@@@FILE\\s+src\\//i.test(body.slice(-2000));
  return { footer, generating, bad, queued: /messages queued/i.test(body), tail: body.slice(-700) };
})()`;

const CLEAR = `(() => {
  const clearBtn = [...document.querySelectorAll('button')].find((b) => /^Clear$/i.test((b.textContent || '').trim()));
  if (clearBtn) { clearBtn.click(); }
  const stop = [...document.querySelectorAll('button')].find((b) =>
    /stop|cancel/i.test(b.getAttribute('aria-label') || '') || /^Stop$/i.test((b.textContent || '').trim())
  );
  if (stop) stop.click();
  return { cleared: Boolean(clearBtn), stopped: Boolean(stop) };
})()`;

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
  ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
  return { ok: true, via: 'enter' };
})()`;

async function waitIdle(cdp, prevFooter, maxMs = 150000) {
  const t0 = Date.now();
  let stable = 0;
  while (Date.now() - t0 < maxMs) {
    const s = await cdp.eval(SNAP);
    if (s.generating || s.queued) {
      stable = 0;
    } else if (s.footer && s.footer !== prevFooter) {
      stable += 1;
      if (stable >= 2) return s;
    } else if (!s.generating && /Done\\.|Already on the page|I added|sticky nav/i.test(s.tail)) {
      stable += 1;
      if (stable >= 2) return s;
    }
    await sleep(1200);
  }
  return cdp.eval(SNAP);
}

const page = await findNovaPage();
if (!page) throw new Error('NOVA page missing');
const cdp = new Cdp(page.webSocketDebuggerUrl);
await cdp.connect();

console.log('clear', await cdp.eval(CLEAR));
await sleep(1500);
// Keep clearing until idle
for (let i = 0; i < 20; i++) {
  const s = await cdp.eval(SNAP);
  if (!s.generating && !s.queued) break;
  console.log('waiting idle…', s.generating, s.queued);
  await cdp.eval(CLEAR);
  await sleep(2000);
}

const log = { steps: [] };
for (const prompt of STEPS) {
  const before = await cdp.eval(SNAP);
  console.log('\\n===', prompt);
  console.log('send', await cdp.eval(SEND(prompt)));
  const after = await waitIdle(cdp, before.footer);
  console.log('footer', after.footer);
  console.log('bad', after.bad);
  console.log('tail', (after.tail || '').slice(-400));
  log.steps.push({ prompt, footer: after.footer, bad: after.bad, tail: after.tail });
  fs.writeFileSync(OUT, JSON.stringify(log, null, 2));
  if (after.bad) {
    cdp.close();
    process.exit(2);
  }
  await sleep(1000);
}
console.log('DONE', OUT);
cdp.close();
