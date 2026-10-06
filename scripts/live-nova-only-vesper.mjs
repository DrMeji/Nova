/**
 * NOVA-ONLY trial: attach image1, ask Nova to build. Do not write project files from this script.
 * Watch the Nova window — progress is logged only.
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const PORT = Number(process.env.NOVA_CDP_PORT || 9229);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMG1 = path.join(os.homedir(), 'Pictures', 'nova pic', 'image1.png');
const PROJECTS = path.join(os.homedir(), 'Documents', 'NOVA Projects');
const OUT = path.join(ROOT, 'scripts', '_nova-only-vesper-out.txt');

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

function findNewestProjectApp() {
  if (!fs.existsSync(PROJECTS)) return null;
  const dirs = fs.readdirSync(PROJECTS)
    .map((name) => {
      const full = path.join(PROJECTS, name);
      try {
        const st = fs.statSync(full);
        if (!st.isDirectory()) return null;
        const appTsx = path.join(full, 'src', 'App.tsx');
        const appJsx = path.join(full, 'src', 'App.jsx');
        const app = fs.existsSync(appTsx) ? appTsx : (fs.existsSync(appJsx) ? appJsx : null);
        if (!app) return null;
        return { name, app, mtime: fs.statSync(app).mtimeMs, bytes: fs.statSync(app).size };
      } catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => b.mtime - a.mtime);
  return dirs[0] || null;
}

function scoreApp(filePath) {
  try {
    const t = fs.readFileSync(filePath, 'utf8');
    return {
      bytes: t.length,
      hasVesper: /\bVesper\b/.test(t),
      hasLight: /distilled/i.test(t),
      hasMeet: /Meet Vesper One/i.test(t),
      hasQuiet: /Quiet by design/i.test(t),
      stubOnly: /Waiting for Nova|Simple Static/i.test(t) && !/Meet Vesper One/i.test(t),
    };
  } catch {
    return { bytes: 0, hasVesper: false, hasLight: false, hasMeet: false, hasQuiet: false, stubOnly: true };
  }
}

try { fs.writeFileSync(OUT, `nova-only ${new Date().toISOString()}\n`); } catch { /* ignore */ }
if (!fs.existsSync(IMG1)) throw new Error('missing ' + IMG1);

const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
const page = (list || []).find((t) => t.type === 'page');
if (!page?.webSocketDebuggerUrl) throw new Error('no cdp');
log('cdp', page.title, page.url);

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
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
  if (r?.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r?.result?.value;
};

// New chat only — never Stop, never write files.
await evaluate(`(() => {
  const els = [...document.querySelectorAll('button,[role=button],a')];
  const chat = els.find(el => (el.getAttribute('aria-label') || '') === 'Chat' || /^Chat$/i.test((el.textContent || '').trim()));
  if (chat) chat.click();
  return true;
})()`);
await sleep(700);
await evaluate(`(() => {
  const btn = [...document.querySelectorAll('button,[role=button],a')].find(b =>
    /new chat/i.test(((b.getAttribute('aria-label') || '') + ' ' + (b.textContent || '')).trim()));
  if (btn) btn.click();
  return !!btn;
})()`);
await sleep(1200);

log('WATCH NOVA WINDOW — attaching image1.png only (no backend file writes)');
const attach = await evaluate(`(async () => {
  if (typeof window.__novaLiveAttach !== 'function') return { ok: false, error: 'no __novaLiveAttach' };
  return window.__novaLiveAttach(${JSON.stringify([IMG1])});
})()`);
log('attach', attach);
if (!attach?.ok) throw new Error('attach failed');
await sleep(900);

const prompt = [
  'Build a website named Vesper One that matches this screenshot.',
  'Keep it simple: static one-page landing, dead links OK, no npm marathon.',
  'Must include: dark #0a0a0a, logo Vesper. with green period, Discover, INTRODUCING VESPER ONE, serif Light distilled, Meet Vesper One pill, green glow orbs, SCROLL TO REVEAL, then features Quiet by design / Light that listens / Built to last and a thin footer.',
  'Start building now in Nova — open Code so I can watch the files write.',
].join(' ');

const sendRes = await evaluate(`(() => {
  const ta = document.querySelector('textarea[aria-label*="Message"], textarea');
  if (!ta) return { ok: false };
  const text = ${JSON.stringify(prompt)};
  const desc = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
  ta.focus();
  desc.set.call(ta, text);
  ta.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  const sendBtn = [...document.querySelectorAll('button')].find(b => /send/i.test(b.getAttribute('aria-label') || ''));
  if (sendBtn) { sendBtn.click(); return { ok: true, via: 'button' }; }
  ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
  return { ok: true, via: 'enter' };
})()`);
log('send', sendRes);

const start = Date.now();
const MAX = 12 * 60 * 1000;
let last = '';
let clickedBuild = false;

while (Date.now() - start < MAX) {
  const ui = await evaluate(`(() => {
    const t = document.body?.innerText || '';
    const stop = [...document.querySelectorAll('button')].some(b =>
      /stop/i.test(b.getAttribute('aria-label') || ''));
    const buildBtn = [...document.querySelectorAll('button,[role=button],a')].find(el => {
      const n = ((el.textContent || '') + ' ' + (el.getAttribute('aria-label') || '')).toLowerCase().replace(/[’']/g, "'");
      return n.includes("let's build this") || n.includes('lets build this');
    });
    return {
      stop,
      hasBuildBtn: !!buildBtn,
      hasCode: /\\bCode\\b/.test(t),
      hasLive: /\\bLive\\b/.test(t),
      stoppedLeak: /\\(stopped\\)/i.test(t) && /TOOL/i.test(t),
      status: (t.match(/(?:Craft|Vision|Writing|Building|Research|Thinking|Done|Live|Plan)[^\\n]{0,60}/gi) || []).slice(-2),
    };
  })()`).catch((e) => ({ error: String(e.message || e) }));

  // If Nova offers Let's build this, click it ONCE (user wants build, not plan-only).
  if (ui?.hasBuildBtn && !clickedBuild && !ui.stop) {
    const clicked = await evaluate(`(() => {
      const els = [...document.querySelectorAll('button,[role=button],a')];
      const hit = els.find(el => {
        const n = ((el.textContent || '') + ' ' + (el.getAttribute('aria-label') || '')).toLowerCase().replace(/[’']/g, "'");
        return n.includes("let's build this");
      });
      if (!hit) return false;
      hit.click();
      return true;
    })()`);
    if (clicked) {
      clickedBuild = true;
      log('clicked Let’s build this (Nova continues — watch Code)');
    }
  }

  const proj = findNewestProjectApp();
  const score = proj ? scoreApp(proj.app) : null;
  const line = JSON.stringify({
    s: Math.round((Date.now() - start) / 1000),
    ui,
    project: proj ? { name: proj.name, ...score } : null,
  });
  if (line !== last) {
    last = line;
    log(line);
  }

  if (score?.hasMeet && score?.hasVesper && score?.hasLight && score.bytes > 800) {
    log('SUCCESS — Nova wrote Vesper landing to', proj.name);
    ws.close();
    process.exit(0);
  }

  await sleep(5000);
}

log('TIMEOUT — Nova did not finish Vesper write in time (no backend fill-in)');
ws.close();
process.exit(1);
