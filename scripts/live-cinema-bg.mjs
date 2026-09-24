/**
 * Live: wipe-clean Nova → dark blank → premium scrollable website backgrounds only.
 * No logos/icons/wording. Cursor does not write the built project.
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.NOVA_CDP_PORT || 9255);
const OUT = path.join(__dirname, '..', '.tmp-live-cinema-bg.json');
const NAME = process.env.NOVA_COLOR_PROJECT || `site-bg-${Date.now().toString(36).slice(-4)}`;

const STEPS = [
  `Hey. create a new Vite React project called ${NAME}. Just a solid near-black background for now — blank page only. No text, no icons, no logos.`,
  'Build a premium website-fit scrollable background only — three full-viewport stages you can scroll through, editorial photography, soft overlapping light, film depth. No text, no titles, no icons, no logos. Imagery only.',
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
  const foots = [...body.matchAll(/Responded in [\\d.]+\\s*(?:ms|s|m)[^\\n]*/gi)].map((m) => m[0]);
  const footer = foots[foots.length - 1] || '';
  return {
    footer,
    generating: /(?:Coding…|Thinking|Updating project|Creating folder|messages queued|Searching cinematic|Fetching premium|Searching premium)/i.test(body.slice(-2000)),
    queued: /messages queued/i.test(body),
    tail: body.slice(-900),
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

const WAIT_COMPOSER = `(() => {
  const ta = document.querySelector('textarea');
  if (!ta) return { ok: false };
  if (!(ta.offsetParent || ta.getClientRects().length)) return { ok: false, hidden: true };
  return { ok: true };
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
    await sleep(1500);
  }
  return cdp.eval(SNAP);
}

function heroBytes(disk, id) {
  const p = path.join(disk, 'public', 'heroes', `${id}.jpg`);
  return fs.existsSync(p) ? fs.statSync(p).size : 0;
}

const page = await findNova();
const cdp = new Cdp(page.webSocketDebuggerUrl);
await cdp.connect();
console.log('page', page.title, page.url);
console.log('project', NAME);
await sleep(1500);
let opened = await cdp.eval(NEW_CHAT);
console.log('new chat', opened);
await sleep(1000);
for (let tries = 0; tries < 12; tries++) {
  const comp = await cdp.eval(WAIT_COMPOSER);
  if (comp?.ok) break;
  opened = await cdp.eval(NEW_CHAT);
  await sleep(700);
}
if (!(await cdp.eval(WAIT_COMPOSER))?.ok) {
  console.error('NO COMPOSER');
  cdp.close();
  process.exit(3);
}

const log = { name: NAME, steps: [] };
for (let i = 0; i < STEPS.length; i++) {
  const before = await cdp.eval(SNAP);
  console.log(`\n=== STEP ${i + 1}/${STEPS.length} ===`);
  console.log(STEPS[i]);
  console.log('sent', await cdp.eval(SEND(STEPS[i])));
  const maxMs = i === 0 ? 240000 : 420000;
  const after = await waitDone(cdp, before.footer, maxMs);
  console.log('footer', after.footer);
  log.steps.push({ step: i + 1, prompt: STEPS[i], footer: after.footer, tail: after.tail });
  fs.writeFileSync(OUT, JSON.stringify(log, null, 2));
  await sleep(1500);
}

const disk = path.join(process.env.USERPROFILE || '', 'Documents', 'NOVA Projects', NAME);
try {
  const css = fs.readFileSync(path.join(disk, 'src', 'App.css'), 'utf8');
  const tsxPath = fs.existsSync(path.join(disk, 'src', 'App.tsx'))
    ? path.join(disk, 'src', 'App.tsx')
    : path.join(disk, 'src', 'App.jsx');
  const tsx = fs.readFileSync(tsxPath, 'utf8');
  const a = heroBytes(disk, 'cinema');
  const b = heroBytes(disk, 'cinema-b');
  const c = heroBytes(disk, 'cinema-c');
  log.disk = {
    dark: /#05080b|#070a0b|#04060a|#0|#1a|black/i.test(css),
    stages: /stage--a|stage--b|stage--c/i.test(css + tsx) && /stage__image/i.test(css + tsx),
    scrollSite: /stage--b|stage--c/i.test(css + tsx),
    bgImage: /background-image:\s*url\(/i.test(css),
    craft: /stage__wash|stage__light|stage__grain|@keyframes drift/i.test(css),
    noChrome: !/brand-rail|icon-rail|center-word|nav-icon/i.test(tsx),
    heroes: { a, b, c },
    heroOk: a > 40000 && b > 40000 && c > 40000,
  };
  console.log('disk', log.disk);
  fs.writeFileSync(OUT, JSON.stringify(log, null, 2));
  if (!log.disk.stages) console.warn('WARN missing scroll stages');
  if (!log.disk.bgImage) console.warn('WARN no background-image');
  if (!log.disk.craft) console.warn('WARN missing premium craft layers');
  if (!log.disk.heroOk) console.warn('WARN hero images missing/small', log.disk.heroes);
  if (!log.disk.noChrome) console.warn('WARN chrome leaked (text/icons)');
} catch (e) {
  console.error('disk check failed', e.message);
  log.diskError = e.message;
  fs.writeFileSync(OUT, JSON.stringify(log, null, 2));
}

console.log('DONE', OUT);
cdp.close();
