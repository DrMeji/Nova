/**
 * Live: paint the on-page name white→black without renaming or wiping the background.
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.NOVA_CDP_PORT || 9255);
const OUT = path.join(__dirname, '..', '.tmp-name-text-color.json');
const NAME = process.env.NOVA_COLOR_PROJECT || `name-paint-${Date.now().toString(36).slice(-4)}`;

const STEPS = [
  `Hey. create a new Vite React project called ${NAME}. Just a solid cream background for now, nothing else fancy.`,
  'Put the brand name SpaceX centered in the middle in clean white text.',
  'Can you change the color of the name from white to black',
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
  return {
    footer,
    generating: /(?:Coding…|Thinking|Updating project|Creating folder|messages queued)/i.test(body.slice(-1400)),
    queued: /messages queued/i.test(body),
    renamedBlack: /centered\\s+\\*?black\\*?\\s+in white/i.test(body.slice(-900)),
    nameColorDone: /updated the name color/i.test(body.slice(-900)),
    already: /Already on the page/i.test(body.slice(-900)),
    tail: body.slice(-700),
  };
})()`;

const NEW_CHAT = `(() => {
  const candidates = [...document.querySelectorAll('button, a, [role="button"], [data-route], span')];
  const labelOf = (b) => (b.getAttribute('aria-label') || b.textContent || '').replace(/\\s+/g, ' ').trim();
  const plus = candidates.find((b) => /^(new chat|start new|new conversation)$/i.test(labelOf(b)));
  if (plus) { plus.click(); return { ok: true, via: 'new' }; }
  const chat = candidates.find((b) => labelOf(b) === 'Chat' || /^Chat$/i.test(labelOf(b)));
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
    if (s.generating || s.queued) stable = 0;
    else if (s.footer && s.footer !== prevFooter) {
      stable += 1;
      if (stable >= 2) return s;
    }
    await sleep(1000);
  }
  return cdp.eval(SNAP);
}

const page = await findNova();
const cdp = new Cdp(page.webSocketDebuggerUrl);
await cdp.connect();
console.log('page', page.title, page.url);
console.log('project', NAME);
await cdp.eval(NEW_CHAT);
await sleep(600);
await cdp.eval(NEW_CHAT);
for (let i = 0; i < 30; i++) {
  const idle = await cdp.eval(SNAP);
  if (!idle.generating && !idle.queued) break;
  await sleep(800);
}

const log = { name: NAME, steps: [] };
for (let i = 0; i < STEPS.length; i++) {
  const before = await cdp.eval(SNAP);
  console.log(`\\n=== STEP ${i + 1} === ${STEPS[i]}`);
  console.log('sent', await cdp.eval(SEND(STEPS[i])));
  const after = await waitDone(cdp, before.footer, i === 0 ? 240000 : 90000);
  console.log('footer', after.footer);
  const entry = {
    step: i + 1,
    prompt: STEPS[i],
    footer: after.footer,
    renamedBlack: after.renamedBlack,
    nameColorDone: after.nameColorDone,
    tail: after.tail,
  };
  if (i === 2) {
    if (after.renamedBlack) { entry.bad = true; entry.fail = 'renamed_to_black'; }
    if (!/local patch|name color/i.test(after.footer || '') && !after.nameColorDone) {
      entry.bad = true;
      entry.fail = entry.fail || 'no_name_color_patch';
    }
  }
  log.steps.push(entry);
  fs.writeFileSync(OUT, JSON.stringify(log, null, 2));
  if (entry.bad) {
    console.error('FAIL', entry.fail);
    cdp.close();
    process.exit(2);
  }
  await sleep(700);
}

const disk = path.join(process.env.USERPROFILE || '', 'Documents', 'ARK', 'Projects', NAME);
try {
  const css = fs.readFileSync(path.join(disk, 'src', 'App.css'), 'utf8');
  const tsx = fs.readFileSync(path.join(disk, 'src', 'App.tsx'), 'utf8');
  log.disk = { css, tsx };
  if (!/>SpaceX</i.test(tsx)) { console.error('FAIL disk renamed'); process.exit(2); }
  if (!/\.center-word\s*\{[^}]*color:\s*#000000/i.test(css)) { console.error('FAIL disk color'); process.exit(2); }
  if (!/#fef3c7/i.test(css)) { console.error('FAIL cream bg wiped'); process.exit(2); }
  console.log('disk OK');
} catch (e) {
  console.warn('disk check skipped', e.message);
}

console.log('DONE', OUT);
cdp.close();
