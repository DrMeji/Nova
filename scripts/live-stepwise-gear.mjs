/**
 * Stepwise Nova Chat driver via CDP — watch-only, no edits to built projects.
 * Usage: NOVA_CDP_PORT=9245 node scripts/live-stepwise-gear.mjs
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.NOVA_CDP_PORT || 9245);
const OUT = path.join(__dirname, '..', '.tmp-stepwise-gear.json');
const PROJECT = 'noir-gear';

const STEPS = [
  `Hey. create a new Vite React project called ${PROJECT}. Just a solid black background for now, nothing else fancy.`,
  'Put the brand name NOIR Gear centered in the middle in clean white text.',
  'Add a gaming mouse product photo in the hero. use a real https image URL, not example.com or path/to.',
  'Under that, add a mechanical keyboard photo and a short tagline about precision and speed.',
  'Add a dark sticky nav with Products, Specs, and Buy. keep the black background.',
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

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
  async eval(expression, awaitPromise = true) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true,
      userGesture: true,
    });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.text || JSON.stringify(r.exceptionDetails));
    }
    return r.result?.value;
  }
  close() {
    try { this.ws?.close(); } catch { /* ignore */ }
  }
}

async function findPage() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
      const page = list.find((t) => t.type === 'page' && /localhost:5173|NOVA/i.test(`${t.url} ${t.title}`))
        || list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page?.webSocketDebuggerUrl) return page;
    } catch { /* retry */ }
    await sleep(500);
  }
  throw new Error(`No CDP page on port ${PORT}`);
}

const SEND_EXPR = (text) => `(() => {
  const t = ${JSON.stringify(text)};
  const ta = document.querySelector('textarea');
  if (!ta) return { ok: false, error: 'no textarea' };
  const proto = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
  proto.set.call(ta, t);
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.dispatchEvent(new Event('change', { bubbles: true }));
  const send = [...document.querySelectorAll('button')].find((b) =>
    /send/i.test(b.getAttribute('aria-label') || '') || b.querySelector('svg') && /arrow|send/i.test(b.innerHTML)
  ) || [...document.querySelectorAll('button')].find((b) => b.querySelector('svg.lucide-arrow-up, svg.lucide-send'));
  if (send) { send.click(); return { ok: true, via: 'button' }; }
  ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
  return { ok: true, via: 'enter' };
})()`;

const SNAP_EXPR = `(() => {
  const assistants = [...document.querySelectorAll('[data-role="assistant"], .assistant, [class*="message"]')]
    .map((el) => (el.innerText || '').trim())
    .filter(Boolean);
  const last = assistants[assistants.length - 1] || '';
  const all = document.body?.innerText || '';
  const generating = /Thinking|Writing|Updating|Creating|Verifying|__generating__/i.test(all.slice(-800));
  const footer = (all.match(/Responded in [\\d.]+\\s*(?:ms|s)[^.\\n]*/i) || [])[0] || '';
  const live = [...document.querySelectorAll('button, a, span')].some((el) => /^Live$/i.test((el.textContent || '').trim()));
  const bad = /I didn.?t keep that edit|@@@FILE|attached project|file tree|path\\/to|example\\.com/i.test(last);
  return {
    last: last.slice(0, 1200),
    generating,
    footer,
    live,
    bad,
    title: document.title,
  };
})()`;

const NEW_CHAT_EXPR = `(() => {
  const btn = [...document.querySelectorAll('button, a')].find((b) =>
    /^(new chat|chat)$/i.test((b.textContent || '').trim()) || /new chat/i.test(b.getAttribute('aria-label') || '')
  );
  if (btn) { btn.click(); return { ok: true }; }
  // Sidebar Chat nav
  const chat = [...document.querySelectorAll('button, a, [role="button"]')].find((b) =>
    /^Chat$/i.test((b.textContent || '').trim())
  );
  if (chat) { chat.click(); return { ok: true, via: 'nav' }; }
  return { ok: false };
})()`;

async function waitIdle(cdp, maxMs = 180000) {
  const start = Date.now();
  let last = '';
  while (Date.now() - start < maxMs) {
    const snap = await cdp.eval(SNAP_EXPR);
    if (!snap.generating && snap.last && snap.last.length > 20 && snap.last !== last) {
      // settle
      await sleep(1500);
      const again = await cdp.eval(SNAP_EXPR);
      if (!again.generating) return again;
    }
    last = snap.last;
    await sleep(1200);
  }
  return cdp.eval(SNAP_EXPR);
}

async function clickLive(cdp) {
  return cdp.eval(`(() => {
    const btn = [...document.querySelectorAll('button, a')].find((b) => /^Live$/i.test((b.textContent || '').trim()));
    if (!btn) return { ok: false };
    btn.click();
    return { ok: true };
  })()`);
}

async function main() {
  const page = await findPage();
  console.log('CDP page:', page.title, page.url);
  const cdp = new Cdp(page.webSocketDebuggerUrl);
  await cdp.connect();

  const log = { project: PROJECT, steps: [], startedAt: new Date().toISOString() };

  // New chat
  const nc = await cdp.eval(NEW_CHAT_EXPR);
  console.log('new chat', nc);
  await sleep(800);

  for (let i = 0; i < STEPS.length; i++) {
    const prompt = STEPS[i];
    console.log(`\\n=== STEP ${i + 1}/${STEPS.length} ===\\n${prompt}`);
    const sent = await cdp.eval(SEND_EXPR(prompt));
    console.log('sent', sent);
    const snap = await waitIdle(cdp, i === 0 ? 240000 : 120000);
    console.log('footer', snap.footer);
    console.log('bad?', snap.bad);
    console.log('reply head:', (snap.last || '').slice(0, 280));
    const entry = {
      step: i + 1,
      prompt,
      footer: snap.footer,
      bad: snap.bad,
      reply: snap.last,
      live: snap.live,
    };
    if (snap.bad) {
      entry.fail = 'bleed_or_reject';
      log.steps.push(entry);
      fs.writeFileSync(OUT, JSON.stringify(log, null, 2));
      console.error('FAIL step', i + 1);
      cdp.close();
      process.exit(2);
    }
    log.steps.push(entry);
    fs.writeFileSync(OUT, JSON.stringify(log, null, 2));
    if (i === 0 || i === STEPS.length - 1) {
      await clickLive(cdp);
      await sleep(2000);
    }
    await sleep(600);
  }

  // Probe preview localhost pages
  let preview = null;
  for (const p of [5174, 5175, 5176, 5177, 5180]) {
    try {
      const html = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${p}/`, (res) => {
          let b = '';
          res.on('data', (c) => (b += c));
          res.on('end', () => resolve(b));
        }).on('error', reject);
      });
      if (/noir|NOIR|root/i.test(html)) {
        preview = { port: p, htmlHead: html.slice(0, 400) };
        break;
      }
    } catch { /* next */ }
  }
  log.preview = preview;
  log.doneAt = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(log, null, 2));
  console.log('DONE', OUT);
  cdp.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
