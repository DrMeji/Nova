/**
 * Clean stepwise Nova gear build. Prefer main NOVA page. Wait for new footers only.
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.NOVA_CDP_PORT || 9245);
const OUT = path.join(__dirname, '..', '.tmp-ember-kit.json');
const NAME = 'ember-kit';

const STEPS = [
  `Hey. create a new Vite React project called ${NAME}. Just a solid black background for now, nothing else fancy.`,
  'Put the brand name EMBER Kit centered in the middle in clean white text.',
  'Add a gaming mouse product photo in the hero. use a real https image URL, not example.com or path/to.',
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
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || 'eval');
    return r.result?.value;
  }
  close() { try { this.ws.close(); } catch { /* */ } }
}

async function findNova() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
      const page = list.find((t) => t.type === 'page' && /localhost:5173/i.test(t.url || ''));
      if (page?.webSocketDebuggerUrl) return page;
    } catch { /* */ }
    await sleep(400);
  }
  throw new Error('NOVA page not found');
}

const SNAP = `(() => {
  const body = document.body?.innerText || '';
  const foots = [...body.matchAll(/Responded in [\\d.]+\\s*(?:ms|s)[^\\n]*/gi)].map((m) => m[0]);
  const footer = foots[foots.length - 1] || '';
  const generating = /(?:Coding…|Code\\s*·\\s*writing|Thinking|Creating folder|Writing project|Verifying|Updating project|Adding to project|messages queued)/i.test(body.slice(-1400));
  const bad = /I didn.?t keep that edit|Still missing:|@@@FILE\\s+src\\/|Already on the page — that change is already applied/i.test(body.slice(-1600))
    && /keyboard|sticky nav|tagline|mouse/i.test(body.slice(-800));
  // "Already applied" is only bad when we expected a new write for keyboard/nav
  return { footer, generating, bad: /I didn.?t keep that edit|Still missing:|@@@FILE\\s+src\\//i.test(body.slice(-1600)), tail: body.slice(-900), queued: /messages queued/i.test(body) };
})()`;

const NEW_CHAT = `(() => {
  // Prefer + / new chat controls near composer or sidebar
  const candidates = [...document.querySelectorAll('button, a, [role="button"]')];
  const plus = candidates.find((b) => {
    const t = (b.getAttribute('aria-label') || b.textContent || '').trim();
    return /new chat|start new/i.test(t);
  });
  if (plus) { plus.click(); return { ok: true, via: 'new' }; }
  // Click Chat nav then hope for fresh thread
  const chat = candidates.find((b) => /^Chat$/i.test((b.textContent || '').trim()));
  if (chat) { chat.click(); return { ok: true, via: 'chat-nav' }; }
  return { ok: false };
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

async function waitDone(cdp, prevFooter, maxMs) {
  const t0 = Date.now();
  let stable = 0;
  while (Date.now() - t0 < maxMs) {
    const s = await cdp.eval(SNAP);
    if (s.generating || s.queued) {
      stable = 0;
    } else if (s.footer && s.footer !== prevFooter) {
      stable += 1;
      if (stable >= 2) return s;
    }
    await sleep(1200);
  }
  return cdp.eval(SNAP);
}

const page = await findNova();
const cdp = new Cdp(page.webSocketDebuggerUrl);
await cdp.connect();
console.log('page', page.title, page.url);
console.log('new chat', await cdp.eval(NEW_CHAT));
await sleep(900);

const log = { name: NAME, steps: [] };
for (let i = 0; i < STEPS.length; i++) {
  const before = await cdp.eval(SNAP);
  console.log(`\\n=== STEP ${i + 1} === ${STEPS[i]}`);
  const sent2 = await cdp.eval(SEND(STEPS[i]));
  console.log('sent', sent2);
  const after = await waitDone(cdp, before.footer, i === 0 ? 240000 : 120000);
  console.log('footer', after.footer);
  console.log('bad', after.bad);
  console.log('tail', (after.tail || '').slice(-420));
  const entry = { step: i + 1, prompt: STEPS[i], footer: after.footer, bad: after.bad, tail: after.tail };
  // Fail if keyboard step claims already-applied
  if (i >= 3 && /Already on the page/i.test(after.tail || '')) {
    entry.bad = true;
    entry.fail = 'false_already_applied';
  }
  if (i === 4 && /background and colors are updated/i.test(after.tail || '')) {
    entry.bad = true;
    entry.fail = 'wrong_done_copy';
  }
  log.steps.push(entry);
  fs.writeFileSync(OUT, JSON.stringify(log, null, 2));
  if (entry.bad) {
    console.error('FAIL step', i + 1);
    cdp.close();
    process.exit(2);
  }
  await sleep(1200);
}

console.log('DONE', OUT);
cdp.close();
