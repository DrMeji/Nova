/**
 * Fresh NEW CHAT: Embark-class premium sign-in / auth marketing site.
 * Nova builds only — Cursor does not write project App files.
 * Verifies Live preview with screenshots + DOM probes.
 * Env: NOVA_CDP_PORT (default 9355)
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const PORT = Number(process.env.NOVA_CDP_PORT || 9355);
const OUT = path.join(root, '.tmp-embark-premium');
fs.mkdirSync(OUT, { recursive: true });
const SLUG = `EmbarkLab-${Date.now().toString(36).slice(-5)}`;

const ASK = [
  `Create a brand new Vite React project called ${SLUG}.`,
  'Build a PREMIUM cinematic sign-in / identity page inspired by a game-studio auth screen (Embark ID style — do NOT copy trademarks; invent brand “Ridgeline ID”).',
  'IMPORTANT: plain JavaScript JSX only — no TypeScript, no React.FC.',
  '',
  'Must ship ALL of this:',
  '1. Top nav: wordmark “ridgeline” left, SUPPORT + LEADERBOARDS links right of it.',
  '2. Cream / soft off-white page atmosphere — NOT flat gray charcoal. Soft animated light sweeps via CSS @keyframes (opacity or gradient shift).',
  '3. Left column: large brand mark (SVG or styled wordmark), bold green uppercase headline about unlocking a seasonal outfit, subline “Log in with your platform”.',
  '4. Row of 5 platform login buttons with icons (Steam, Epic, PlayStation, Xbox, Nexon-style labels — invent simple SVG icons). Hover states required.',
  '5. Right side: large hero character / figure panel (use /heroes/hero.jpg if generated, else a rich CSS/SVG silhouette with diagonal cyan/yellow/red accent stripes). Do NOT use a blank canvas as the hero.',
  '6. Footer with quiet uppercase links + fine-print legal line.',
  '7. Scrollable full page. Premium, explore-worthy — not a thin stub.',
  '',
  'Take as long as needed. Preview Ready only when Live compiles and the page looks cinematic.',
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
  // Prefer the live status store line — avoid matching user ask / code dumps.
  const statusNodes = [...document.querySelectorAll('[aria-live], .nova-build-signal, .nova-status-dots, button[aria-label]')];
  const statusText = statusNodes.map((n) => n.getAttribute('aria-label') || n.textContent || '').join(' | ');
  const liveStatus = (statusText.match(/(?:Ensemble|Plan hop|Verify hop|Final pass|Coding|Building|Writing|Using|Creating|Installing|Done)[^|]{0,80}/gi) || []).slice(-4);
  const generating = /(?:Coding…|Thinking…|Creating folder|Building UI|messages queued|Installing dependencies|Plan hop|Verify hop|Final pass:|Writing src|Coding src)/i.test(statusText)
    || (/^(?:Coding|Writing|Building|Plan hop|Verify hop|Ensemble|Creating|Installing)/i.test(liveStatus[liveStatus.length - 1] || '')
      && !/^Done$/i.test(liveStatus[liveStatus.length - 1] || ''));
  const assistantTail = body.slice(-1800);
  return {
    footer,
    generating: Boolean(generating) && !/^Done$/i.test(String(liveStatus[liveStatus.length - 1] || '')),
    queued: /messages queued/i.test(body),
    previewReady: /Preview Ready(?!\\s*failed)/i.test(assistantTail)
      && !/Preview Ready failed/i.test(assistantTail)
      && /Responded in/i.test(footer || assistantTail),
    failed: /Preview Ready failed/i.test(assistantTail),
    ensemble: /Ensemble team|Plan hop|Verify hop|ensemble/i.test(body),
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
      console.log(`[${elapsed}s] gen=${s.generating} ready=${s.previewReady} fail=${s.failed} ens=${s.ensemble}`, s.statusTail?.slice(-2));
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
  const clicked = await cdp.eval(`(() => {
    const nodes = [...document.querySelectorAll('button, a, [role="button"], span, div')];
    const live = nodes.find((n) => /^\\s*live\\s*$/i.test((n.textContent || '').trim()));
    if (live) { live.click(); return 'clicked'; }
    return 'no-live';
  })()`);
  console.log('liveClick', clicked);
  await sleep(6000);

  const list2 = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
  const preview = list2.find((t) => t.type === 'page' && t.url
    && !/localhost:5173/i.test(t.url)
    && /127\.0\.0\.1|localhost/i.test(t.url))
    || list2.find((t) => t.type === 'page' && /Embark|Ridgeline|preview/i.test(t.title || ''));

  if (!preview?.webSocketDebuggerUrl) {
    return { ok: false, reason: 'no-preview-target', clicked, targets: list2.map((t) => t.title).slice(0, 12) };
  }

  const prev = new Cdp(preview.webSocketDebuggerUrl);
  await prev.connect();
  await sleep(2000);

  const heroShot = await prev.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  fs.writeFileSync(path.join(OUT, '01-hero.png'), Buffer.from(heroShot.data, 'base64'));

  await prev.eval('window.scrollTo(0, document.body.scrollHeight)');
  await sleep(800);
  const footShot = await prev.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  fs.writeFileSync(path.join(OUT, '02-footer.png'), Buffer.from(footShot.data, 'base64'));

  const probe = await prev.eval(`(() => {
    const text = document.body?.innerText || '';
    const html = document.documentElement?.outerHTML || '';
    const cssText = [...document.querySelectorAll('style')].map((s) => s.textContent || '').join('\\n')
      + [...document.styleSheets].flatMap((s) => {
        try { return [...(s.cssRules || [])].map((r) => r.cssText); } catch { return []; }
      }).join('\\n');
    return {
      brand: /ridgeline/i.test(text),
      login: /log\\s*in|platform/i.test(text),
      platforms: ['Steam', 'Epic', 'PlayStation', 'Xbox', 'Nexon'].filter((p) => new RegExp(p, 'i').test(text)).length,
      buttons: document.querySelectorAll('button, a.button, [role="button"]').length,
      images: document.querySelectorAll('img, svg').length,
      keyframes: /@keyframes/i.test(cssText) || /animation\\s*:/i.test(cssText),
      cream: /#f|cream|off-?white|rgb\\(24[0-9]/i.test(cssText + html),
      appLen: (document.querySelector('#root')?.innerHTML || '').length,
      title: document.title,
    };
  })()`);

  prev.close();
  return { ok: true, clicked, probe };
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
  await sleep(2500);

  const before = await cdp.eval(SNAP);
  console.log('ASK length', ASK.length);
  await cdp.eval(`(() => {
    const t = ${JSON.stringify(ASK)};
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
  })()`);

  const t0 = Date.now();
  const done = await waitDone(cdp, before.footer, 900_000);
  const elapsedSec = Math.round((Date.now() - t0) / 1000);
  console.log('DONE', {
    footer: done.footer,
    previewReady: done.previewReady,
    failed: done.failed,
    ensemble: done.ensemble,
    generating: done.generating,
    elapsedSec,
  });
  fs.writeFileSync(path.join(OUT, 'reply-tail.txt'), String(done.tail || ''));

  let live = { ok: false };
  if (done.previewReady || !done.failed) {
    live = await openLiveAndShot(cdp);
    console.log('LIVE', JSON.stringify(live, null, 2));
  }

  const footer = String(done.footer || '');
  const mins = /Responded in (\d+)\s*m/i.exec(footer);
  const secsOnly = /Responded in ([\d.]+)\s*s/i.exec(footer);
  const wallSec = mins ? Number(mins[1]) * 60 : (secsOnly ? Number(secsOnly[1]) : elapsedSec);
  const speedrunSuspect = wallSec > 0 && wallSec < 90;

  const report = {
    slug: SLUG,
    footer: done.footer,
    previewReady: done.previewReady,
    failed: done.failed,
    ensemble: done.ensemble,
    elapsedSec,
    wallSec,
    live,
    speedrunSuspect,
  };
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log('REPORT', report);
  cdp.close();

  const pass = Boolean(
    done.previewReady
    && live.ok
    && live.probe?.brand
    && live.probe?.platforms >= 3
    && live.probe?.keyframes
    && !report.speedrunSuspect,
  );
  process.exit(pass ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
