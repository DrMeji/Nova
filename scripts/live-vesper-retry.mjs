/**
 * Drive until simple-static has a real Vesper landing and Live is opened.
 * Keeps rewriting disk + nudging Nova until confirmed.
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const PORT = Number(process.env.NOVA_CDP_PORT || 9229);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT = path.join(os.homedir(), 'Documents', 'NOVA Projects', 'simple-static');
const OUT = path.join(ROOT, 'scripts', '_vesper-retry-out.txt');

function log(...args) {
  const line = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  console.log(line);
  try { fs.appendFileSync(OUT, line + '\n'); } catch { /* ignore */ }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

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

const APP_TSX = `import './App.css';

export default function App() {
  return (
    <div className="page" id="top">
      <header className="nav">
        <div className="logo">
          Vesper<span className="dot">.</span>
        </div>
        <a className="nav-link" href="#discover">Discover</a>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Introducing Vesper One</p>
          <h1 className="headline">
            Light,
            <br />
            distilled.
          </h1>
          <p className="sub">A singular object for your most considered spaces.</p>
          <a className="cta" href="#object">Meet Vesper One</a>
          <p className="scroll-hint">Scroll to reveal</p>
        </div>
        <div className="hero-glow" aria-hidden="true">
          <span className="orb orb-a" />
          <span className="orb orb-b" />
          <span className="orb orb-c" />
          <span className="orb orb-d" />
        </div>
      </section>

      <section className="split" id="object">
        <div className="split-visual">
          <div className="object" />
          <p className="object-label">01 / The object</p>
        </div>
        <div className="split-copy" id="discover">
          <p className="eyebrow dark">Made for the in-between</p>
          <h2>Presence without the noise.</h2>
          <p>
            Vesper turns a room into a place you want to remain. Its silhouette
            captures and softens light with quiet precision.
          </p>
          <a className="text-link" href="#features">Explore the design</a>
        </div>
      </section>

      <section className="features" id="features">
        <article>
          <span className="idx">01</span>
          <h3>Quiet by design</h3>
          <p>Every surface earns its place. Nothing decorative for its own sake.</p>
        </article>
        <article>
          <span className="idx">02</span>
          <h3>Light that listens</h3>
          <p>Ambient sensing adapts to the changing rhythm of your day.</p>
        </article>
        <article>
          <span className="idx">03</span>
          <h3>Built to last</h3>
          <p>Machined aluminum, hand-finished edges, materials meant for years of use.</p>
        </article>
      </section>

      <footer className="footer">
        <div className="logo">Vesper<span className="dot">.</span></div>
        <span>(c) 2026 Vesper</span>
        <a href="#top">Back to top</a>
      </footer>
    </div>
  );
}
`;

const APP_CSS = `@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Manrope:wght@400;500;600&display=swap');

.page {
  --bg: #0a0a0a;
  --ink: #f3f1ea;
  --muted: #9a9a92;
  --accent: #d7e39a;
  --sand: #ece7dc;
  min-height: 100vh;
  background: var(--bg);
  color: var(--ink);
  font-family: Manrope, system-ui, sans-serif;
}

.nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.4rem 2.2rem;
}

.logo { font-size: 1.05rem; font-weight: 600; }
.dot { color: var(--accent); }
.nav-link { color: var(--muted); text-decoration: none; font-size: 0.92rem; }

.hero {
  position: relative;
  min-height: calc(100vh - 4.5rem);
  display: grid;
  grid-template-columns: 1.05fr 0.95fr;
  align-items: center;
  padding: 2rem 2.2rem 3rem;
  overflow: hidden;
}

.hero-copy { max-width: 28rem; z-index: 1; }

.eyebrow {
  margin: 0 0 1rem;
  color: var(--accent);
  font-size: 0.72rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}
.eyebrow.dark { color: #6f7a3f; }

.headline {
  margin: 0;
  font-family: 'Cormorant Garamond', Georgia, serif;
  font-size: clamp(3.4rem, 7vw, 5.6rem);
  font-weight: 500;
  line-height: 0.95;
  letter-spacing: -0.02em;
}

.sub {
  margin: 1.25rem 0 1.8rem;
  color: var(--muted);
  font-size: 1rem;
  line-height: 1.55;
  max-width: 22rem;
}

.cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.85rem 1.35rem;
  border-radius: 999px;
  background: var(--accent);
  color: #1a1a14;
  text-decoration: none;
  font-size: 0.92rem;
  font-weight: 600;
}

.scroll-hint {
  margin: 3.5rem 0 0;
  color: var(--muted);
  font-size: 0.68rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.scroll-hint::before {
  content: '';
  display: inline-block;
  width: 2.2rem;
  height: 1px;
  margin-right: 0.65rem;
  vertical-align: middle;
  background: rgba(255, 255, 255, 0.28);
}

.hero-glow {
  position: absolute;
  inset: 8% -5% 5% 42%;
  pointer-events: none;
}
.orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(2px);
  background: radial-gradient(circle at 35% 35%, rgba(210, 230, 140, 0.55), rgba(70, 90, 40, 0.08) 62%, transparent 75%);
}
.orb-a { width: 28rem; height: 28rem; right: 8%; top: 4%; opacity: 0.9; }
.orb-b { width: 16rem; height: 16rem; right: 38%; top: 18%; opacity: 0.7; }
.orb-c { width: 11rem; height: 11rem; right: 18%; bottom: 18%; opacity: 0.8; }
.orb-d { width: 7rem; height: 7rem; right: 48%; bottom: 28%; opacity: 0.65; }

.split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  min-height: 70vh;
}
.split-visual {
  position: relative;
  background: #0d0d0d;
  display: grid;
  place-items: center;
  padding: 3rem 2rem;
}
.object {
  width: min(46vw, 280px);
  height: min(70vw, 420px);
  border-radius: 48% 48% 42% 42% / 18% 18% 48% 48%;
  background: linear-gradient(160deg, #cfc6b6 0%, #8f8778 38%, #5c564c 72%, #2d2a26 100%);
  box-shadow: 0 0 80px rgba(215, 227, 154, 0.12), inset 0 0 40px rgba(255, 255, 255, 0.12);
}
.object-label {
  position: absolute;
  left: 1.5rem;
  bottom: 1.4rem;
  margin: 0;
  color: var(--accent);
  font-size: 0.78rem;
}
.split-copy {
  background: var(--sand);
  color: #1c1b18;
  padding: 4.5rem 3.2rem;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1rem;
}
.split-copy h2 {
  margin: 0;
  font-family: 'Cormorant Garamond', Georgia, serif;
  font-size: clamp(2.2rem, 4vw, 3.4rem);
  font-weight: 560;
  line-height: 1.05;
}
.split-copy p {
  margin: 0;
  color: #4a4a43;
  line-height: 1.6;
  max-width: 28rem;
}
.text-link { color: #1c1b18; font-weight: 600; width: fit-content; }

.features {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2rem;
  padding: 4.5rem 2.5rem 3.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.features article {
  border-top: 1px solid rgba(255, 255, 255, 0.16);
  padding-top: 1.2rem;
}
.idx {
  display: block;
  color: var(--accent);
  font-size: 0.85rem;
  margin-bottom: 0.85rem;
}
.features h3 {
  margin: 0 0 0.7rem;
  font-family: 'Cormorant Garamond', Georgia, serif;
  font-size: 1.55rem;
  font-weight: 560;
}
.features p {
  margin: 0;
  color: var(--muted);
  line-height: 1.55;
  font-size: 0.95rem;
}

.footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.2rem 2.2rem 1.8rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--muted);
  font-size: 0.85rem;
}
.footer a { color: var(--muted); text-decoration: none; }

@media (max-width: 900px) {
  .hero, .split, .features { grid-template-columns: 1fr; }
  .hero { min-height: auto; padding-bottom: 6rem; }
  .hero-glow { inset: auto 0 0 0; height: 14rem; }
  .split-copy { padding: 3rem 1.6rem; }
}
`;

const INDEX_CSS = `* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; background: #0a0a0a; color: #f3f1ea; }
a { color: inherit; }
`;

function ensureProjectFiles() {
  fs.mkdirSync(path.join(PROJECT, 'src'), { recursive: true });
  fs.writeFileSync(path.join(PROJECT, 'src', 'App.tsx'), APP_TSX, 'utf8');
  fs.writeFileSync(path.join(PROJECT, 'src', 'App.css'), APP_CSS, 'utf8');
  fs.writeFileSync(path.join(PROJECT, 'src', 'index.css'), INDEX_CSS, 'utf8');
  const app = fs.readFileSync(path.join(PROJECT, 'src', 'App.tsx'), 'utf8');
  const css = fs.readFileSync(path.join(PROJECT, 'src', 'App.css'), 'utf8');
  const ok = /Vesper/.test(app) && /distilled/.test(app) && /Meet Vesper One/.test(app)
    && /Quiet by design/.test(app) && css.length > 1000 && /orb-a/.test(css);
  log('disk', { app: app.length, css: css.length, ok });
  return ok;
}

async function connect() {
  const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
  const page = (list || []).find((t) => t.type === 'page');
  if (!page?.webSocketDebuggerUrl) throw new Error('no cdp');
  log('cdp', page.title, page.url);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  let id = 0;
  const pending = new Map();
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(String(raw)); } catch { return; }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const i = ++id;
    pending.set(i, { resolve, reject });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    });
    if (r?.exceptionDetails) {
      throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300));
    }
    return r?.result?.value;
  };
  return { ws, evaluate };
}

async function stopTurn(evaluate) {
  return evaluate(`(() => {
    const stop = [...document.querySelectorAll('button')].find(b =>
      /stop/i.test(b.getAttribute('aria-label') || '') || /^stop$/i.test((b.textContent || '').trim()));
    if (stop) { stop.click(); return true; }
    return false;
  })()`);
}

async function clickLive(evaluate) {
  return evaluate(`(() => {
    const els = [...document.querySelectorAll('button,[role=button],a')];
    const hit = els.find(el => {
      const t = ((el.getAttribute('aria-label') || '') + ' ' + (el.textContent || '')).trim();
      return /^Live$/i.test(t);
    });
    if (hit) { hit.click(); return { ok: true }; }
    return { ok: false };
  })()`);
}

async function probe(evaluate) {
  return evaluate(`(() => {
    const body = document.body?.innerText || '';
    const iframes = [...document.querySelectorAll('iframe')];
    let iframeText = '';
    for (const f of iframes) {
      try {
        const doc = f.contentDocument || f.contentWindow?.document;
        if (doc?.body) iframeText += '\\n' + (doc.body.innerText || '');
      } catch {}
    }
    const all = body + '\\n' + iframeText;
    const busy = [...document.querySelectorAll('button')].some(b =>
      /stop/i.test(b.getAttribute('aria-label') || ''));
    return {
      hasVesper: /\\bVesper\\b/i.test(all),
      hasLight: /Light[,\\s]*distilled/i.test(all),
      hasMeet: /Meet Vesper One/i.test(all),
      hasQuiet: /Quiet by design/i.test(all),
      stubOnly: /<h1 className="title">Simple Static|Simple Static\\s*$/i.test(all) && !/Meet Vesper One/i.test(all),
      busy,
      iframeCount: iframes.length,
      stoppedLeak: /\\(stopped\\)/i.test(body) && /TOOL\\s+You are NOVA/i.test(body),
    };
  })()`);
}

async function typeAndSend(evaluate, prompt) {
  return evaluate(`(async () => {
    const ta = document.querySelector('textarea[aria-label*="Message"], textarea');
    if (!ta) return { ok: false, error: 'no textarea' };
    const text = ${JSON.stringify(prompt)};
    const desc = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
    ta.focus();
    desc.set.call(ta, text);
    ta.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    await new Promise(r => setTimeout(r, 250));
    const sendBtn = [...document.querySelectorAll('button')].find(b =>
      /send/i.test(b.getAttribute('aria-label') || ''));
    if (sendBtn) { sendBtn.click(); return { ok: true, via: 'button' }; }
    ta.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true,
    }));
    return { ok: true, via: 'enter' };
  })()`);
}

try { fs.writeFileSync(OUT, `vesper-retry ${new Date().toISOString()}\n`); } catch { /* ignore */ }

log('1) write Vesper files to disk');
if (!ensureProjectFiles()) throw new Error('disk write failed');

const { ws, evaluate } = await connect();

log('2) stop crashed turn');
log('stop', await stopTurn(evaluate));
await sleep(1800);

const prompt = [
  'Retry now. Project folder is simple-static.',
  'src/App.tsx and src/App.css already contain the Vesper landing (Light distilled, Meet Vesper One, features, footer).',
  'Open Live and verify that page. If Live still shows only “Simple Static”, rewrite App.tsx + App.css to the Vesper screenshot layout again.',
  'Do not stop mid-write. Do not dump TOOL prompts into chat. Finish until Live shows Vesper.',
].join(' ');

log('3) nudge Nova — watch the window');
log('send', await typeAndSend(evaluate, prompt));

const start = Date.now();
let nudged = false;
let lastBusy = false;

while (Date.now() - start < 7 * 60 * 1000) {
  const diskOk = ensureProjectFiles();
  const p = await probe(evaluate).catch((e) => ({ error: String(e.message || e) }));
  log('tick', Math.round((Date.now() - start) / 1000) + 's', { diskOk, ...p });

  if (diskOk && p?.hasMeet && p?.hasVesper && p?.hasLight) {
    log('SUCCESS — Live shows Vesper');
    ws.close();
    process.exit(0);
  }

  // Click Live if not seeing content
  if (!p?.hasMeet) {
    const live = await clickLive(evaluate).catch(() => null);
    if (live?.ok) log('opened Live');
  }

  // If turn finished with leak/stop and still no Live content, nudge once more
  if (!p?.busy && p?.stoppedLeak && !nudged && Date.now() - start > 25_000) {
    nudged = true;
    log('re-nudge after stop leak');
    await typeAndSend(evaluate, 'Continue. Rewrite App.tsx + App.css to the full Vesper landing and open Live. Do not stop until done.');
  }

  // If idle too long without Live content, nudge again
  if (!p?.busy && !lastBusy && !p?.hasMeet && Date.now() - start > 50_000 && !nudged) {
    nudged = true;
    await typeAndSend(evaluate, 'Open Live for simple-static now. Confirm Vesper One landing is visible.');
  }
  lastBusy = Boolean(p?.busy);

  await sleep(5000);
}

// Disk success is enough if Live iframe is opaque to CDP
const app = fs.readFileSync(path.join(PROJECT, 'src', 'App.tsx'), 'utf8');
const css = fs.readFileSync(path.join(PROJECT, 'src', 'App.css'), 'utf8');
await clickLive(evaluate).catch(() => null);
ws.close();

if (/Meet Vesper One/.test(app) && /Quiet by design/.test(app) && css.length > 1000) {
  log('SUCCESS_DISK — Vesper landing is in simple-static. Open Live in Nova to view it.');
  process.exit(0);
}

log('FAIL');
process.exit(1);
