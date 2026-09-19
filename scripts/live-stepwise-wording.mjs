/**
 * Live: color steps then name / position / font wording (no icons yet).
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.NOVA_CDP_PORT || 9255);
const OUT = path.join(__dirname, '..', '.tmp-stepwise-wording.json');
const NAME = process.env.NOVA_COLOR_PROJECT || `word-lab-${Date.now().toString(36).slice(-4)}`;

const STEPS = [
  `Hey. create a new Vite React project called ${NAME}. Just a solid black background for now, nothing else fancy.`,
  'Change the background color to cream.',
  'Put the brand name Cursor centered in the middle in clean white text.',
  'Change the name to Tesla.',
  'Move the name to the top left.',
  'Change the name to SpaceX.',
  'Make the SpaceX word look more cursive.',
  'Make it bold.',
  'Move the name to the bottom right.',
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
  const foots = [...body.matchAll(/Responded in [\\d.]+\\s*(?:ms|s)[^\\n]*/gi)].map((m) => m[0]);
  const footer = foots[foots.length - 1] || '';
  const undoButtons = [...document.querySelectorAll('button[aria-label="Undo last edit"]')];
  return {
    footer,
    generating: /(?:Coding…|Thinking|Updating project|Creating folder|messages queued)/i.test(body.slice(-1400)),
    queued: /messages queued/i.test(body),
    stuckCoding: /Coding…/i.test(body.slice(-800)) && !/Responded in/i.test(body.slice(-400)),
    already: /Already on the page — that change is already applied/i.test(body.slice(-1200)),
    badThat: />\\s*that\\s*</i.test(body) || /\\bcenter-word[^>]*>that</i.test(body),
    undoCount: undoButtons.length,
    localPatch: /local patch|scaffold/i.test(footer),
    qwenDump: /Qwen|attached files/i.test(footer),
    tail: body.slice(-900),
  };
})()`;

const NEW_CHAT = `(() => {
  const candidates = [...document.querySelectorAll('button, a, [role="button"], [data-route], span')];
  const labelOf = (b) => (b.getAttribute('aria-label') || b.textContent || '').replace(/\\s+/g, ' ').trim();
  const plus = candidates.find((b) => /^(new chat|start new|new conversation)$/i.test(labelOf(b)));
  if (plus) { plus.click(); return { ok: true, via: 'new' }; }
  // Sidebar Chat starts a fresh thread on each click in Nova.
  const chat = candidates.find((b) => labelOf(b) === 'Chat' || /^Chat$/i.test(labelOf(b)));
  if (chat) { chat.click(); return { ok: true, via: 'chat-nav' }; }
  return { ok: false, labels: candidates.map(labelOf).filter((t) => /chat/i.test(t)).slice(0, 12) };
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
// Fresh thread + drain any leftover queue so prior wording steps cannot race this run.
let opened = await cdp.eval(NEW_CHAT);
console.log('new chat', opened);
await sleep(700);
opened = await cdp.eval(NEW_CHAT);
console.log('new chat again', opened);
for (let i = 0; i < 45; i++) {
  const idle = await cdp.eval(SNAP);
  if (!idle.generating && !idle.queued) break;
  console.log('waiting idle…', { generating: idle.generating, queued: idle.queued });
  await sleep(1000);
}
await sleep(500);

const log = { name: NAME, steps: [] };
for (let i = 0; i < STEPS.length; i++) {
  const before = await cdp.eval(SNAP);
  console.log(`\\n=== STEP ${i + 1} === ${STEPS[i]}`);
  console.log('sent', await cdp.eval(SEND(STEPS[i])));
  const after = await waitDone(cdp, before.footer, i === 0 ? 240000 : 90000);
  console.log('footer', after.footer);
  console.log('undoCount', after.undoCount, 'stuck', after.stuckCoding, 'qwen', after.qwenDump);
  const entry = {
    step: i + 1,
    prompt: STEPS[i],
    footer: after.footer,
    undoCount: after.undoCount,
    stuckCoding: after.stuckCoding,
    already: after.already,
    qwenDump: after.qwenDump,
    localPatch: after.localPatch,
    tail: after.tail,
  };
  if (after.stuckCoding) { entry.bad = true; entry.fail = 'stuck_coding'; }
  if (after.qwenDump) { entry.bad = true; entry.fail = 'qwen_dump'; }
  if (i >= 1 && after.already && i !== 0) { entry.bad = true; entry.fail = 'false_already_applied'; }
  // Undo icon only on the last apply bubble (aria-label buttons ≤ 1)
  if (i >= 2 && after.undoCount > 1) { entry.bad = true; entry.fail = 'undo_on_every_message'; }
  if (i === 3 && /\\bthat\\b/i.test(after.tail || '') && /local|logo|Tesla|Cursor/i.test(STEPS[i])) {
    // soft
  }
  log.steps.push(entry);
  fs.writeFileSync(OUT, JSON.stringify(log, null, 2));
  if (entry.bad) {
    console.error('FAIL', entry.fail);
    cdp.close();
    process.exit(2);
  }
  await sleep(900);
}

console.log('DONE', OUT);
cdp.close();
