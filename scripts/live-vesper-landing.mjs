/**
 * Live: wipe-clean Nova → create quiet-luxury product landing (Vesper-class craft).
 * Cursor does not write the built project — Nova only.
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.NOVA_CDP_PORT || 9255);
const OUT = path.join(__dirname, '..', '.tmp-live-vesper-landing.json');
const NAME = process.env.NOVA_COLOR_PROJECT || `aurelia-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}`;

const STEPS = [
  [
    `Hey. Create a new Vite React project called ${NAME}.`,
    'Build a premium quiet-luxury product marketing website for the brand Aurelia (product Aurelia One).',
    'It must be a full scrollable landing page with: dark hero + soft mint orbs, wordmark, Discover link,',
    'serif headline Light distilled, mint CTA, scroll hint, split cream story with metallic object,',
    'three feature columns Quiet by design / Light that listens / Built to last, and a minimal footer.',
    'Premium editorial craft — generous whitespace, serif headlines, no emoji, no cluttered cards.',
  ].join(' '),
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
    generating: /(?:Coding…|Thinking|Updating project|Creating folder|Building UI|messages queued|Installing dependencies)/i.test(body.slice(-2500)),
    queued: /messages queued/i.test(body),
    tail: body.slice(-1100),
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
    await sleep(2000);
  }
  return cdp.eval(SNAP);
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
  console.log(STEPS[i].slice(0, 220) + '…');
  console.log('sent', await cdp.eval(SEND(STEPS[i])));
  const after = await waitDone(cdp, before.footer, 720000);
  console.log('footer', after.footer);
  log.steps.push({ step: i + 1, prompt: STEPS[i], footer: after.footer, tail: after.tail });
  fs.writeFileSync(OUT, JSON.stringify(log, null, 2));
  await sleep(1500);
}

const tail = String(log.steps?.[0]?.tail || '');
const pathFromChat = (tail.match(/Path:\s*([^\n]+)/i)?.[1] || '').trim();
const projectsRoot = path.join(process.env.USERPROFILE || '', 'Documents', 'NOVA Projects');
const diskCandidates = [
  pathFromChat,
  path.join(projectsRoot, NAME),
  ...fs.readdirSync(projectsRoot)
    .filter((n) => /^aurelia/i.test(n))
    .map((n) => ({ n, t: fs.statSync(path.join(projectsRoot, n)).mtimeMs }))
    .sort((a, b) => b.t - a.t)
    .slice(0, 3)
    .map((x) => path.join(projectsRoot, x.n)),
].filter(Boolean);
const disk = diskCandidates.find((p) => fs.existsSync(path.join(p, 'src'))) || diskCandidates[0];
try {
  const css = fs.readFileSync(path.join(disk, 'src', 'App.css'), 'utf8');
  const tsxPath = fs.existsSync(path.join(disk, 'src', 'App.tsx'))
    ? path.join(disk, 'src', 'App.tsx')
    : path.join(disk, 'src', 'App.jsx');
  const tsx = fs.readFileSync(tsxPath, 'utf8');
  log.diskRoot = disk;
  log.disk = {
    brand: /\bAurelia\b/.test(tsx) && !/aurelia-\d+/i.test(tsx.match(/wordmark[^>]*>[^<]+/i)?.[0] || ''),
    hero: /className=["']hero["']|hero-copy|\.hero\b/i.test(tsx + css),
    orbs: /\.orb\b|orb-a|glow/i.test(css + tsx),
    storySplit: /story-visual|story-copy|className=["']story["']/i.test(tsx),
    features3: /Quiet by design|Light that listens|Built to last/i.test(tsx),
    footer: /footer|Back to top/i.test(tsx),
    scrollHint: /scroll/i.test(tsx),
    serif: /Iowan|Palatino|Georgia|serif/i.test(css),
    mintCta: /#c6e6c0|#8fbf8a|mint|button/i.test(css + tsx),
    notCenterStub: !/center-word/i.test(tsx),
    cssLen: css.length,
    appLen: tsx.length,
  };
  console.log('diskRoot', disk);
  console.log('disk', log.disk);
  fs.writeFileSync(OUT, JSON.stringify(log, null, 2));
  for (const [k, v] of Object.entries(log.disk)) {
    if (typeof v === 'boolean' && !v) console.warn('WARN missing', k);
  }
} catch (e) {
  console.error('disk check failed', e.message);
  log.diskError = e.message;
  fs.writeFileSync(OUT, JSON.stringify(log, null, 2));
}

console.log('DONE', OUT);
cdp.close();
