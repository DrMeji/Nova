/**
 * Fresh NEW CHAT: recreate Vesper quiet-luxury landing from verbal brief only.
 * No image uploads. Tests HF hero path + premium craft. Live preview + shots.
 * Env: NOVA_CDP_PORT (default 9340)
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const PORT = Number(process.env.NOVA_CDP_PORT || 9340);
const OUT = path.join(root, '.tmp-vesper-recreate');
fs.mkdirSync(OUT, { recursive: true });
const SLUG = `VesperLab-${Date.now().toString(36).slice(-5)}`;

const ASK = [
  `Create a brand new Vite React project called ${SLUG}.`,
  'Build a premium quiet-luxury product landing page for brand Vesper (product Vesper One).',
  'IMPORTANT: write plain JavaScript JSX only — never TypeScript. No React.FC, no type annotations, no .tsx unless the whole project is TS.',
  'Do not ask me to upload photos. Prefer CSS radial-gradient sage/olive glowing orbs for the hero atmosphere. Optional: generate a metallic cylinder product image — never forest, desert, nature, or random stock.',
  '',
  'Full scrollable page:',
  'HERO: deep black full viewport, large soft translucent sage orbs, thin diagonal light line,',
  'top-left wordmark “Vesper.”, top-right “Discover”,',
  'left copy: INTRODUCING VESPER ONE / serif “Light, distilled.” / subline / pale sage pill “Meet Vesper One” / SCROLL TO REVEAL.',
  'BELOW: split story — dark olive spotlight + metallic cylinder object labeled “01 / The object”; cream panel “MADE FOR THE IN-BETWEEN” / serif “Presence without the noise.” / Explore the design.',
  'Then black three-column features with sage numbers 01–03: Quiet by design / Light that listens / Built to last.',
  'Minimal footer: Vesper. · © 2026 Vesper · Back to top.',
  'Take the time to finish a real premium page — not a thin stub. Make Preview Ready only when Live actually compiles.',
].join(' ');

function fetchJson(url, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error('timeout ' + url));
    });
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
    await this.send('Page.enable');
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
      const page = list.find((t) => t.type === 'page' && /localhost:5173/i.test(t.url || ''))
        || list.find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page;
    } catch { /* */ }
    await sleep(400);
  }
  throw new Error('NOVA page not found on CDP ' + PORT);
}

const SNAP = `(() => {
  const body = document.body?.innerText || '';
  const foots = [...body.matchAll(/Responded in [\\d.]+\\s*(?:ms|s|m)[^\\n]*/gi)].map((m) => m[0]);
  const footer = foots[foots.length - 1] || '';
  return {
    footer,
    generating: /(?:Coding…|Thinking|Updating project|Creating folder|Building UI|messages queued|Installing dependencies|Planning|Writing)/i.test(body.slice(-2800)),
    queued: /messages queued/i.test(body),
    previewReady: /(?:Preview\\s*Ready|Live\\s*Ready)(?!\\s*failed)/i.test(body)
      && !/Preview Ready failed|code scan incomplete/i.test(body),
    tail: body.slice(-1400),
  };
})()`;

const NEW_CHAT = `(() => {
  const candidates = [...document.querySelectorAll('button, a, [role="button"], [data-route], span')];
  const labelOf = (b) => (b.getAttribute('aria-label') || b.textContent || '').replace(/\\s+/g, ' ').trim();
  const plus = candidates.find((b) => /^(new chat|start new|new conversation)$/i.test(labelOf(b))
    || /new\\s*chat/i.test(labelOf(b)));
  if (plus) { plus.click(); return { ok: true, via: 'new' }; }
  location.hash = '#/chat?new=' + Date.now();
  return { ok: true, via: 'hash' };
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
  let last = null;
  while (Date.now() - t0 < maxMs) {
    const s = await cdp.eval(SNAP);
    last = s;
    if (s.generating || s.queued) stable = 0;
    else if (s.footer && s.footer !== prevFooter) {
      stable += 1;
      if (stable >= 3) return s;
    }
    await sleep(2500);
  }
  return last || cdp.eval(SNAP);
}

async function openLiveAndShot(cdp) {
  const clicked = await cdp.eval(`(() => {
    const nodes = [...document.querySelectorAll('button, a, [role="button"], span, div')];
    const live = nodes.find((n) => /^\\s*live\\s*$/i.test((n.textContent || '').trim()));
    if (live) { live.click(); return 'clicked'; }
    const ready = nodes.find((n) => /preview\\s*ready|live\\s*ready/i.test((n.textContent || '').trim())
      && (n.textContent || '').trim().length < 40);
    if (ready) { ready.click(); return 'clicked-ready'; }
    return 'no-live';
  })()`);
  console.log('liveClick', clicked);
  await sleep(5000);

  const list2 = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
  console.log('targets', list2.map((t) => ({ title: t.title, url: (t.url || '').slice(0, 90) })).slice(0, 16));

  const preview = list2.find((t) => t.type === 'page' && t.url
    && !/localhost:5173/i.test(t.url)
    && /127\.0\.0\.1|localhost/i.test(t.url))
    || list2.find((t) => t.type === 'page' && /Vesper|vesper|preview/i.test(t.title || ''));

  if (!preview?.webSocketDebuggerUrl) {
    return { ok: false, reason: 'no-preview-target', clicked };
  }

  const prev = new Cdp(preview.webSocketDebuggerUrl);
  await prev.connect();
  await sleep(1500);

  const heroShot = await prev.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  fs.writeFileSync(path.join(OUT, '01-hero.png'), Buffer.from(heroShot.data, 'base64'));

  await prev.eval('window.scrollTo(0, Math.max(document.body.scrollHeight * 0.45, window.innerHeight * 0.9))');
  await sleep(800);
  const midShot = await prev.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  fs.writeFileSync(path.join(OUT, '02-story.png'), Buffer.from(midShot.data, 'base64'));

  await prev.eval('window.scrollTo(0, document.body.scrollHeight)');
  await sleep(600);
  const footShot = await prev.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  fs.writeFileSync(path.join(OUT, '03-features-footer.png'), Buffer.from(footShot.data, 'base64'));

  const probe = await prev.eval(`(() => {
    const text = document.body?.innerText || '';
    const css = [...document.styleSheets].flatMap((s) => {
      try { return [...s.cssRules].map((r) => r.cssText); } catch { return []; }
    }).join('\\n');
    const html = document.documentElement?.outerHTML || '';
    const blob = text + '\\n' + css + '\\n' + html;
    return {
      hasVesper: /\\bVesper\\.?\\b/i.test(text),
      hasLightDistilled: /Light,?\\s*distilled/i.test(text),
      hasPresence: /Presence without the noise/i.test(text),
      hasFeatures: /Quiet by design/i.test(text) && /Light that listens/i.test(text) && /Built to last/i.test(text),
      hasDiscover: /Discover/i.test(text),
      hasMeetCta: /Meet Vesper One/i.test(text),
      hasScrollHint: /SCROLL TO REVEAL/i.test(text),
      hasSerif: /serif|Playfair|Iowan|Palatino|Georgia|Cormorant|Fraunces/i.test(blob),
      hasSageOrOrb: /orb|radial-gradient|sage|#c6e6|#b8c9|#8fbf|olive|pistachio/i.test(blob),
      hasHeroImg: !!document.querySelector('img, [style*="background-image"], .orb, .glow'),
      pollinations: /pollinations\\.ai/i.test(blob),
      textLen: text.length,
      title: document.title,
    };
  })()`);

  prev.close();
  return { ok: true, clicked, probe, shots: ['01-hero.png', '02-story.png', '03-features-footer.png'] };
}

function diskCheck(slug) {
  const projectsRoot = path.join(process.env.USERPROFILE || '', 'Documents', 'NOVA Projects');
  if (!fs.existsSync(projectsRoot)) return { ok: false, reason: 'no-projects-root' };
  const dirs = fs.readdirSync(projectsRoot)
    .filter((n) => /vesper/i.test(n) || n === slug)
    .map((n) => ({ n, t: fs.statSync(path.join(projectsRoot, n)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  const hit = dirs.find((d) => d.n === slug) || dirs[0];
  if (!hit) return { ok: false, reason: 'no-disk-project' };
  const rootDir = path.join(projectsRoot, hit.n);
  const appPath = ['App.tsx', 'App.jsx'].map((f) => path.join(rootDir, 'src', f)).find((p) => fs.existsSync(p));
  const cssPath = ['App.css', 'index.css'].map((f) => path.join(rootDir, 'src', f)).find((p) => fs.existsSync(p));
  const app = appPath ? fs.readFileSync(appPath, 'utf8') : '';
  const css = cssPath ? fs.readFileSync(cssPath, 'utf8') : '';
  const blob = app + '\n' + css;
  const heroesDir = path.join(rootDir, 'public', 'heroes');
  const heroFiles = fs.existsSync(heroesDir) ? fs.readdirSync(heroesDir) : [];
  return {
    ok: true,
    root: rootDir,
    appPath,
    cssPath,
    checks: {
      brand: /\bVesper\b/.test(app),
      lightDistilled: /Light,?\s*distilled/i.test(app),
      presence: /Presence without the noise/i.test(app),
      features3: /Quiet by design/i.test(app) && /Light that listens/i.test(app) && /Built to last/i.test(app),
      serif: /serif|Playfair|Iowan|Palatino|Georgia|Cormorant|Fraunces/i.test(blob),
      orbsOrGlow: /orb|radial-gradient|glow/i.test(blob),
      noPollinations: !/pollinations\.ai/i.test(blob),
      heroFiles: heroFiles.length,
      heroFilesSample: heroFiles.slice(0, 6),
      appLen: app.length,
      cssLen: css.length,
    },
  };
}

const page = await findNova();
const cdp = new Cdp(page.webSocketDebuggerUrl);
await cdp.connect();
console.log('page', page.title, page.url);
console.log('project', SLUG);
console.log('out', OUT);

await sleep(800);
let opened = await cdp.eval(NEW_CHAT);
console.log('new chat', opened);
await sleep(1200);
for (let tries = 0; tries < 14; tries++) {
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

const log = { slug: SLUG, ask: ASK, steps: [] };
const before = await cdp.eval(SNAP);
console.log('\n=== SEND VESPER RECREATE (NEW CHAT) ===');
console.log(ASK.slice(0, 280) + '…');
console.log('sent', await cdp.eval(SEND(ASK)));
const after = await waitDone(cdp, before.footer, 900000);
console.log('footer', after.footer);
console.log('previewReady', after.previewReady);
log.steps.push({ footer: after.footer, previewReady: after.previewReady, tail: after.tail });
fs.writeFileSync(path.join(OUT, 'run.json'), JSON.stringify(log, null, 2));

console.log('\n=== LIVE VERIFY ===');
let live = null;
try {
  live = await openLiveAndShot(cdp);
  console.log('live', JSON.stringify(live.probe || live, null, 2));
} catch (e) {
  console.error('live verify failed', e.message);
  live = { ok: false, error: e.message };
}
log.live = live;

console.log('\n=== DISK CHECK ===');
const disk = diskCheck(SLUG);
console.log('disk', JSON.stringify(disk, null, 2));
log.disk = disk;

fs.writeFileSync(path.join(OUT, 'run.json'), JSON.stringify(log, null, 2));
cdp.close();

const probe = live?.probe || {};
const d = disk?.checks || {};
const passBits = [
  probe.hasVesper || d.brand,
  probe.hasLightDistilled || d.lightDistilled,
  probe.hasPresence || d.presence,
  probe.hasFeatures || d.features3,
  d.noPollinations !== false,
];
const score = passBits.filter(Boolean).length;
console.log(`\nSCORE ${score}/${passBits.length} · ${SLUG}`);
console.log('shots in', OUT);
console.log('DONE');
process.exit(score >= 3 ? 0 : 2);
