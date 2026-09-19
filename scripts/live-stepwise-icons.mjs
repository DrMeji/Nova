/**
 * Live: cream blank → premium logo → premium icons (no color/name churn).
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.NOVA_CDP_PORT || 9255);
const OUT = path.join(__dirname, '..', '.tmp-stepwise-icons.json');
const NAME = process.env.NOVA_COLOR_PROJECT || `icon-lab-${Date.now().toString(36).slice(-4)}`;

const STEPS = [
  `Hey. create a new Vite React project called ${NAME}. Just a solid cream background for now, nothing else fancy. Blank page only — no text, no icons yet.`,
  'Add a premium logo in the top left corner. Keep the cream background. Sharp SVG mark, not a basic scribble.',
  'Add a premium menu icon near the logo in the top left. Keep the cream background and the logo.',
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
    generating: /(?:Coding…|Thinking|Updating project|Creating folder|messages queued|Fetching premium)/i.test(body.slice(-1400)),
    queued: /messages queued/i.test(body),
    brownWipe: /#8[Bb]4513/i.test(body.slice(-500)),
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
  return { ok: false, labels: candidates.map(labelOf).filter((t) => /chat/i.test(t)).slice(0, 12) };
})()`;

const WAIT_COMPOSER = `(() => {
  const ta = document.querySelector('textarea');
  if (!ta) return { ok: false };
  if (!(ta.offsetParent || ta.getClientRects().length)) return { ok: false, hidden: true };
  return { ok: true, ph: ta.placeholder || '' };
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
await sleep(1200);
let opened = await cdp.eval(NEW_CHAT);
console.log('new chat', opened);
await sleep(800);
for (let tries = 0; tries < 12; tries++) {
  const comp = await cdp.eval(WAIT_COMPOSER);
  console.log('composer', comp);
  if (comp?.ok) break;
  opened = await cdp.eval(NEW_CHAT);
  console.log('retry chat', opened);
  await sleep(700);
}
{
  const comp = await cdp.eval(WAIT_COMPOSER);
  if (!comp?.ok) {
    console.error('NO COMPOSER');
    cdp.close();
    process.exit(3);
  }
}
for (let i = 0; i < 20; i++) {
  const idle = await cdp.eval(SNAP);
  if (!idle.generating && !idle.queued) break;
  await sleep(800);
}

const log = { name: NAME, steps: [] };
for (let i = 0; i < STEPS.length; i++) {
  const before = await cdp.eval(SNAP);
  console.log(`\\n=== STEP ${i + 1} === ${STEPS[i]}`);
  console.log('sent', await cdp.eval(SEND(STEPS[i])));
  const after = await waitDone(cdp, before.footer, i === 0 ? 240000 : 120000);
  console.log('footer', after.footer);
  const entry = { step: i + 1, prompt: STEPS[i], footer: after.footer, tail: after.tail };
  if (i >= 1 && !/local patch|scaffold/i.test(after.footer || '')) {
    entry.bad = true;
    entry.fail = 'not_local_patch';
  }
  log.steps.push(entry);
  fs.writeFileSync(OUT, JSON.stringify(log, null, 2));
  if (entry.bad) {
    console.error('FAIL', entry.fail);
    cdp.close();
    process.exit(2);
  }
  await sleep(900);
}

const disk = path.join(process.env.USERPROFILE || '', 'Documents', 'ARK', 'Projects', NAME);
try {
  const css = fs.readFileSync(path.join(disk, 'src', 'App.css'), 'utf8');
  const tsx = fs.readFileSync(path.join(disk, 'src', 'App.tsx'), 'utf8');
  const logo = fs.existsSync(path.join(disk, 'public', 'logo.svg'))
    ? fs.readFileSync(path.join(disk, 'public', 'logo.svg'), 'utf8')
    : '';
  const menu = fs.existsSync(path.join(disk, 'public', 'icons', 'menu.svg'))
    ? fs.readFileSync(path.join(disk, 'public', 'icons', 'menu.svg'), 'utf8')
    : '';
  log.disk = { css, tsx, logoLen: logo.length, menuLen: menu.length };
  if (!/#fef3c7/i.test(css)) { console.error('FAIL cream wiped'); process.exit(2); }
  if (/#8[Bb]4513/i.test(css)) { console.error('FAIL brown wipe'); process.exit(2); }
  if (!/logo\.svg|corner-logo|className=["']logo["']/i.test(tsx)) { console.error('FAIL no logo'); process.exit(2); }
  if (!logo) { console.error('FAIL missing public/logo.svg'); process.exit(2); }
  if (!/menu\.svg|nav-icon/i.test(tsx)) { console.error('FAIL no icon'); process.exit(2); }
  if (!menu && !fs.existsSync(path.join(disk, 'public', 'icons', 'menu.svg'))) {
    console.warn('WARN menu.svg missing on disk (may be Iconify path)');
  }
  console.log('disk OK', { logoLen: logo.length, menuLen: menu.length });
} catch (e) {
  console.error('disk check failed', e.message);
  process.exit(2);
}

console.log('DONE', OUT);
cdp.close();
