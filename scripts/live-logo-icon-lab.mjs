/**
 * Live: cream blank → 15 company logos → 25 UI icons via Nova chat only.
 * Does NOT write project files — only CDP into Nova UI.
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.NOVA_CDP_PORT || 9255);
const OUT = path.join(__dirname, '..', '.tmp-live-logo-icon-lab.json');
const NAME = process.env.NOVA_COLOR_PROJECT || `mark-lab-${Date.now().toString(36).slice(-4)}`;

const STEPS = [
  `Hey. create a new Vite React project called ${NAME}. Just a solid cream background for now, nothing else fancy. Blank page only — no text, no icons, no logos yet.`,
  'Add these company logos in a row in the top left. Keep the cream background. Real brand marks: Apple, Google, GitHub, Discord, Twitch.',
  'Right next to those logos, add more company logos: Netflix, Spotify, YouTube, Instagram, Twitter. Keep the cream background and every logo already there — do not remove any.',
  'Add more logos right next to the others: LinkedIn, Slack, Amazon, Microsoft, Meta. Keep cream and all existing logos.',
  'Now add a row of premium UI icons in the top right. Keep cream and all logos. Icons: menu, search, profile, settings, bell.',
  'Right next to those icons add more: heart, cart, home, mail, calendar. Keep cream, logos, and existing icons — do not remove any.',
  'Add more icons next to them: camera, mic, share, download, upload, trash. Keep everything already on the page.',
  'Add more premium icons next to them: edit, lock, star, bookmark, help, info, filter, grid, more. Keep cream, all logos, and all icons.',
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
      const page = list.find((t) => t.type === 'page' && /localhost:5173/i.test(t.url || '') && /NOVA/i.test(t.title || 'NOVA'));
      const fallback = list.find((t) => t.type === 'page' && /localhost:5173/i.test(t.url || ''));
      if (page?.webSocketDebuggerUrl) return page;
      if (fallback?.webSocketDebuggerUrl) return fallback;
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
    generating: /(?:Coding…|Thinking|Updating project|Creating folder|messages queued|Fetching premium)/i.test(body.slice(-1600)),
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
  console.log(`\n=== STEP ${i + 1}/${STEPS.length} ===`);
  console.log(STEPS[i]);
  console.log('sent', await cdp.eval(SEND(STEPS[i])));
  const after = await waitDone(cdp, before.footer, i === 0 ? 300000 : 180000);
  console.log('footer', after.footer);
  log.steps.push({ step: i + 1, prompt: STEPS[i], footer: after.footer, tail: after.tail });
  fs.writeFileSync(OUT, JSON.stringify(log, null, 2));
  await sleep(1200);
}

// Read-only disk check (Nova wrote these — Cursor did not edit the project).
const disk = path.join(process.env.USERPROFILE || '', 'Documents', 'ARK', 'Projects', NAME);
try {
  const css = fs.readFileSync(path.join(disk, 'src', 'App.css'), 'utf8');
  const tsx = fs.readFileSync(path.join(disk, 'src', 'App.tsx'), 'utf8')
    || fs.readFileSync(path.join(disk, 'src', 'App.jsx'), 'utf8');
  const logosDir = path.join(disk, 'public', 'logos');
  const iconsDir = path.join(disk, 'public', 'icons');
  const logoFiles = fs.existsSync(logosDir) ? fs.readdirSync(logosDir).filter((f) => f.endsWith('.svg')) : [];
  const iconFiles = fs.existsSync(iconsDir) ? fs.readdirSync(iconsDir).filter((f) => f.endsWith('.svg')) : [];
  log.disk = {
    cream: /#fef3c7/i.test(css),
    brandRail: /brand-rail|\/logos\//i.test(tsx),
    iconRail: /icon-rail|nav-icon|\/icons\//i.test(tsx),
    logoCount: logoFiles.length,
    iconCount: iconFiles.length,
    logos: logoFiles,
    icons: iconFiles,
  };
  console.log('disk', log.disk);
  fs.writeFileSync(OUT, JSON.stringify(log, null, 2));
  if (!log.disk.cream) console.warn('WARN cream missing');
  if (logoFiles.length < 10) console.warn('WARN few logos', logoFiles.length);
  if (iconFiles.length < 15) console.warn('WARN few icons', iconFiles.length);
} catch (e) {
  console.error('disk check failed', e.message);
  log.diskError = e.message;
  fs.writeFileSync(OUT, JSON.stringify(log, null, 2));
}

console.log('DONE', OUT);
cdp.close();
