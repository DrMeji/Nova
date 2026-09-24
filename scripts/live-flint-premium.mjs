/**
 * Fresh NEW CHAT only — never reuse prior projects/chats.
 * Premium product landing (new brand each run). Nova builds; Cursor does not write App.
 * Env: NOVA_CDP_PORT (default 9229 — Open-NOVA-Build.bat)
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const PORT = Number(process.env.NOVA_CDP_PORT || 9229);
const OUT = path.join(root, '.tmp-flint-premium');
fs.mkdirSync(OUT, { recursive: true });
const SLUG = `FlintSpark-${Date.now().toString(36).slice(-5)}`;

const ASK = [
  `Create a brand new Vite React project called ${SLUG}.`,
  'Build a PREMIUM luxury product landing page for brand Flint Spark (hand-tuned Flint Sparks).',
  'IMPORTANT: plain JavaScript JSX only — no TypeScript, no React.FC, no createRoot inside App.',
  '',
  'Must ship:',
  '1. Top nav: wordmark “Flint Spark”, Collection + Studio links (no default blue underlines).',
  '2. Warm cream / parchment atmosphere with soft sage and gold light — animated @keyframes sweeps. NEVER flat white or charcoal stub.',
  '3. Hero: large product visual on one side (use /heroes/*.jpg if generated, else rich SVG figure). Strong serif display headline “Strike warm.” Short lede. Primary CTA button with hover.',
  '4. Below: three feature bands with original copy (not Quiet by design / Veopx stock). Icons as inline SVG.',
  '5. Footer with quiet links + © 2026 Flint Spark.',
  '6. Full scrollable page. Premium enough to explore — not a thin stub.',
  '',
  'Take as long as needed. Preview Ready only when Live compiles and looks luxurious.',
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
        || list.find((t) => t.type === 'page' && /index\.html/i.test(t.url || ''))
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
  const statusNodes = [...document.querySelectorAll('[aria-live], button[aria-label]')];
  const statusText = statusNodes.map((n) => n.getAttribute('aria-label') || n.textContent || '').join(' | ');
  const liveStatus = (statusText.match(/(?:Ensemble|Plan hop|Verify hop|Style hop|Final pass|Coding|Building|Writing|Using|Creating|Installing|Done|Wiring|Luxury floor|Premium floor)[^|]{0,80}/gi) || []).slice(-4);
  const generating = /(?:Coding…|Thinking…|Creating folder|Building UI|messages queued|Installing|Plan hop|Verify hop|Style hop|Final pass:|Writing src|Coding src|Wiring|Luxury floor|Premium floor)/i.test(statusText)
    && !/^Done$/i.test(liveStatus[liveStatus.length - 1] || '');
  const assistantTail = body.slice(-2000);
  return {
    footer,
    generating: Boolean(generating),
    queued: /messages queued/i.test(body),
    previewReady: /Preview Ready(?!\\s*failed)/i.test(assistantTail) && !/Preview Ready failed/i.test(assistantTail) && /Responded in/i.test(footer || assistantTail),
    failed: /Preview Ready failed/i.test(assistantTail),
    ensemble: /Ensemble team|Plan hop|Verify hop|Style hop/i.test(body),
    statusTail: liveStatus,
    tail: assistantTail,
  };
})()`;

async function waitDone(cdp, prevFooter, maxMs) {
  const t0 = Date.now();
  let stable = 0;
  let last = null;
  let lastLog = 0;
  while (Date.now() - t0 < maxMs) {
    const s = await cdp.eval(SNAP);
    last = s;
    const elapsed = Math.round((Date.now() - t0) / 1000);
    if (elapsed - lastLog >= 30) {
      console.log(`[${elapsed}s] gen=${s.generating} ready=${s.previewReady} fail=${s.failed}`, s.statusTail?.slice(-2));
      lastLog = elapsed;
    }
    if (s.generating || s.queued) stable = 0;
    else if (s.footer && s.footer !== prevFooter) {
      stable += 1;
      if (stable >= 3) return s;
    }
    await sleep(3000);
  }
  return last || cdp.eval(SNAP);
}

async function openLiveAndShot(cdp) {
  await cdp.eval(`(() => {
    const nodes = [...document.querySelectorAll('button, a, [role="button"], span')];
    const live = nodes.find((n) => /^\\s*live\\s*$/i.test((n.textContent || '').trim()));
    if (live) { live.click(); return 'clicked'; }
    return 'no-live';
  })()`);
  await sleep(7000);
  const list2 = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
  const preview = list2.find((t) => t.type === 'page' && /flint|spark/i.test(t.title || ''))
    || list2.find((t) => t.type === 'page' && t.url && !/5173/.test(t.url) && /127\.0\.0\.1|localhost/.test(t.url));
  if (!preview?.webSocketDebuggerUrl) return { ok: false, reason: 'no-preview' };

  const prev = new Cdp(preview.webSocketDebuggerUrl);
  await prev.connect();
  await sleep(2000);
  const heroShot = await prev.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  fs.writeFileSync(path.join(OUT, '01-hero.png'), Buffer.from(heroShot.data, 'base64'));
  await prev.eval('window.scrollTo(0, document.body.scrollHeight * 0.55)');
  await sleep(800);
  const midShot = await prev.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  fs.writeFileSync(path.join(OUT, '02-mid.png'), Buffer.from(midShot.data, 'base64'));

  const probe = await prev.eval(`(() => {
    const text = document.body?.innerText || '';
    const cssText = [...document.querySelectorAll('style')].map((s) => s.textContent || '').join('\\n')
      + [...document.styleSheets].flatMap((s) => { try { return [...(s.cssRules||[])].map(r=>r.cssText); } catch { return []; } }).join('\\n');
    const bg = getComputedStyle(document.body).backgroundColor;
    return {
      brand: /flint|spark/i.test(text),
      headline: /light|composed|flint|spark|lamp/i.test(text),
      features: (text.match(/\\b(?:seed|packet|flint|spark|wild|flower|garden)\\b/gi) || []).length,
      buttons: document.querySelectorAll('button, a.button').length,
      images: document.querySelectorAll('img, svg').length,
      brokenImg: [...document.images].filter((i) => !i.naturalWidth).map((i) => i.src).slice(0, 6),
      keyframes: /@keyframes|animation\\s*:/i.test(cssText),
      notWhite: !/^rgb\\(255,\\s*255,\\s*255\\)$/i.test(bg) && bg !== 'rgba(0, 0, 0, 0)',
      bg,
      viteError: /plugin:vite|Unexpected token|failed to load/i.test(text),
      appLen: (document.querySelector('#root')?.innerHTML || '').length,
      title: document.title,
    };
  })()`);
  prev.close();
  return { ok: true, probe };
}

async function main() {
  console.log('CDP', PORT, 'OUT', OUT, 'SLUG', SLUG);
  const page = await findNova();
  const cdp = new Cdp(page.webSocketDebuggerUrl);
  await cdp.connect();

  await cdp.eval(`(() => {
    const candidates = [...document.querySelectorAll('button, a, [role="button"]')];
    const plus = candidates.find((b) => /new\\s*chat/i.test((b.getAttribute('aria-label') || '') + (b.textContent || '')));
    if (plus) { plus.click(); return 'new'; }
    location.hash = '#/chat?new=' + Date.now();
    return 'hash';
  })()`);
  await sleep(2800);

  const before = await cdp.eval(SNAP);
  await cdp.eval(`(() => {
    const t = ${JSON.stringify(ASK)};
    const ta = document.querySelector('textarea');
    if (!ta) return { ok: false };
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, t);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    const btn = [...document.querySelectorAll('button')].find((b) => /send|arrow up/i.test(b.getAttribute('aria-label') || ''));
    if (btn && !btn.disabled) { btn.click(); return { ok: true }; }
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
    return { ok: true };
  })()`);

  const t0 = Date.now();
  const done = await waitDone(cdp, before.footer, 1_200_000);
  const elapsedSec = Math.round((Date.now() - t0) / 1000);
  fs.writeFileSync(path.join(OUT, 'reply-tail.txt'), String(done.tail || ''));
  console.log('DONE', { footer: done.footer, previewReady: done.previewReady, failed: done.failed, elapsedSec });

  let live = { ok: false };
  live = await openLiveAndShot(cdp);
  console.log('LIVE', JSON.stringify(live, null, 2));

  const footer = String(done.footer || '');
  const mins = /Responded in (\\d+)\\s*m/i.exec(footer);
  const secsOnly = /Responded in ([\\d.]+)\\s*s/i.exec(footer);
  const wallSec = mins ? Number(mins[1]) * 60 : (secsOnly ? Number(secsOnly[1]) : elapsedSec);

  const report = {
    slug: SLUG,
    footer: done.footer,
    previewReady: done.previewReady,
    failed: done.failed,
    elapsedSec,
    wallSec,
    live,
    speedrunSuspect: wallSec > 0 && wallSec < 90,
  };
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log('REPORT', report);
  cdp.close();

  const p = live.probe || {};
  const pass = Boolean(
    live.ok
    && p.brand
    && p.keyframes
    && !p.viteError
    && (p.brokenImg || []).length === 0
    && p.appLen > 800
    && !report.speedrunSuspect,
  );
  process.exit(pass ? 0 : 2);
}

main().catch((e) => { console.error(e); process.exit(1); });
