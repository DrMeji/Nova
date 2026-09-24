/**
 * Live: wipe-clean Nova → brand-new PC-case site (Ridgelock).
 * Cursor does NOT write the built project — Nova only.
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.NOVA_CDP_PORT || 9271);
const OUT = path.join(__dirname, '..', '.tmp-live-pc-cases.json');
const NAME = process.env.NOVA_COLOR_PROJECT || `ridgelock-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}`;

const STEPS = [
  [
    `Start fresh. Create a brand-new Vite React project called ${NAME}.`,
    'Build a completely different premium website for the brand Ridgelock that sells gaming PC cases.',
    'Do NOT reuse Voltframe / Aurelia / Vesper layout. New structure required:',
    'sticky top bar with RIDGELOCK mark + Chassis / Specs / Buy links,',
    'split hero with bold sans headline on the LEFT and a tall product photo on the RIGHT,',
    'orange accent buttons (not mint pills), cream story band with photo then copy,',
    'three bordered spec columns (Front mesh wall / Cable channels / Glass + steel), minimal footer.',
    'Headline: Mesh that means business. Real PC-case photos only — no animals, no Pollinations, no icon clutter.',
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
  close() { try { this.ws?.close(); } catch { /* */ } }
}

async function findNova() {
  const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
  const page = list.find((t) => t.type === 'page' && /localhost:5173/i.test(t.url || ''));
  if (!page?.webSocketDebuggerUrl) throw new Error('NOVA page not found');
  return page;
}

const NEW_CHAT = `(() => {
  const btn = [...document.querySelectorAll('button,a,[role=button]')].find((el) =>
    /new chat|new conversation|\\+/i.test((el.getAttribute('aria-label') || '') + (el.textContent || ''))
  );
  if (btn) { btn.click(); return { ok: true, via: 'chat-nav' }; }
  return { ok: false };
})()`;
const WAIT_COMPOSER = `(() => {
  const ta = document.querySelector('textarea');
  return { ok: Boolean(ta) };
})()`;
const SNAP = `(() => {
  const footer = [...document.querySelectorAll('*')].map((el) => el.textContent || '')
    .find((t) => /Responded in /i.test(t) && t.length < 120) || '';
  const generating = /Building|Generating|Writing|Applying|Installing/i.test(document.body.innerText || '');
  const queued = false;
  const tail = (document.body.innerText || '').slice(-1800);
  return { footer, generating, queued, tail };
})()`;
const SEND = (text) => `(() => {
  const t = ${JSON.stringify(text)};
  const ta = document.querySelector('textarea');
  if (!ta) return { ok: false };
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
    .filter((n) => /^ridgelock/i.test(n))
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
  const heroFiles = ['hero.jpg', 'hero.webp', 'hero.png'];
  const storyFiles = ['story.jpg', 'story.webp', 'story.png'];
  const heroPath = heroFiles.map((f) => path.join(disk, 'public', 'heroes', f)).find((p) => fs.existsSync(p));
  const storyPath = storyFiles.map((f) => path.join(disk, 'public', 'heroes', f)).find((p) => fs.existsSync(p));
  const sniff = (p) => {
    if (!p) return 'missing';
    const b = fs.readFileSync(p).subarray(0, 3);
    if (b[0] === 0xff && b[1] === 0xd8) return 'jpeg';
    if (b[0] === 0x52 && b[1] === 0x49) return 'webp';
    return 'other';
  };
  log.diskRoot = disk;
  log.disk = {
    brand: /\bRidgelock\b/i.test(tsx),
    newLayout: /hero-grid|className=["']top["']|className=["']mark["']/i.test(tsx),
    notVesperClone: !/Scroll to reveal|Light, distilled|Discover/i.test(tsx),
    orangeAccent: /#ff6a3d|ff6a3d/i.test(css),
    heroImg: /heroes\/hero\./i.test(tsx),
    storyImg: /heroes\/story\./i.test(tsx),
    heroFile: Boolean(heroPath),
    storyFile: Boolean(storyPath),
    heroKind: sniff(heroPath),
    storyKind: sniff(storyPath),
    noIconRail: !/icon-rail/i.test(tsx),
    features3: /Front mesh wall|Cable channels|Glass \+ steel/i.test(tsx),
    headline: /Mesh that means business/i.test(tsx),
    cssLen: css.length,
    appLen: tsx.length,
    heroBytes: heroPath ? fs.statSync(heroPath).size : 0,
    storyBytes: storyPath ? fs.statSync(storyPath).size : 0,
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
